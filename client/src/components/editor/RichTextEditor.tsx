import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { FormulaExtension } from './FormulaExtension';
import { useEffect, useState, useMemo } from 'react';
import { hasMathML, convertMathMLToLatex } from '@/lib/mathmlUtils';
import './editor.css';

interface RichTextEditorProps {
  value: string | Record<string, unknown>;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function RichTextEditor({ value, onChange, placeholder = 'Matnni kiriting...', className = '' }: RichTextEditorProps) {
  const [showSymbols, setShowSymbols] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'greek' | 'operators' | 'advanced'>('basic');
  const [editorKey] = useState(() => Math.random()); // Уникальный ключ для редактора

  // Мемоизируем расширения чтобы они не пересоздавались
  const extensions = useMemo(() => [
    StarterKit,
    Placeholder.configure({ placeholder: 'Matnni kiriting...' }),
    FormulaExtension,
  ], []); // Пустой массив зависимостей - создаем только один раз

  const editor = useEditor({
    extensions,
    content: value,
    onUpdate: ({ editor }) => {
      try {
        const html = editor.getHTML();
        onChange(html);
      } catch (err) {
        console.error('Error getting HTML from editor:', err);
        onChange(editor.getText());
      }
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[80px] p-3',
      },
      // Обработка вставки из буфера обмена
      handlePaste: (view, event) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        // Получаем текст из буфера обмена
        const text = clipboardData.getData('text/plain');
        const html = clipboardData.getData('text/html');

        console.log('📋 Paste detected');

        // Проверяем наличие MathML в HTML или тексте
        if (hasMathML(html) || hasMathML(text)) {
          console.log('🔄 MathML detected in clipboard!');
          
          // Конвертируем MathML в LaTeX
          const sourceText = hasMathML(html) ? html : text;
          const convertedText = convertMathMLToLatex(sourceText);
          
          // Вставляем конвертированный текст
          if (convertedText) {
            event.preventDefault();
            
            // Парсим LaTeX формулы и вставляем их
            const parts = convertedText.split(/(\\\([^)]*\\\))/g);
            
            parts.forEach((part) => {
              if (part.startsWith('\\(') && part.endsWith('\\)')) {
                // Это формула - извлекаем LaTeX
                const latex = part.slice(2, -2);
                editor?.chain().focus().setFormula(latex).run();
              } else if (part.trim()) {
                // Это обычный текст
                editor?.chain().focus().insertContent(part).run();
              }
            });
            
            return true;
          }
        }

        // Если не MathML, используем стандартную обработку
        return false;
      },
    },
    immediatelyRender: false,
    editable: true,
  }, [editorKey]); // Используем ключ для предотвращения пересоздания

  // Уничтожаем редактор при размонтировании
  useEffect(() => {
    return () => {
      if (editor) {
        editor.destroy();
      }
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    // Handle TipTap JSON object directly (from convertLatexToTiptapJson)
    if (value && typeof value === 'object' && (value as any).type === 'doc') {
      editor.commands.setContent(value as any, { emitUpdate: false });
      return;
    }

    if (value !== editor.getHTML()) {
      try {
        if (value && typeof value === 'string') {
          try {
            const json = JSON.parse(value);
            if (json.type === 'doc') {
              editor.commands.setContent(json, { emitUpdate: false });
              return;
            }
          } catch {
            // Not JSON, continue as HTML
          }

          // Parse \(...\) or $...$ formulas and convert to formula nodes
          if (value.includes('\\(') || value.includes('\\[') || /\$[^$]+\$/.test(value)) {
            const parts: Array<{ type: 'text' | 'formula', content: string }> = [];
            let remaining = value;

            // Parse \(...\) and \[...\] delimiters
            const delimRegex = /\\[()\[\]]/g;
            let lastIndex = 0;
            let delimMatch;
            let inFormula = false;
            let formulaStart = -1;
            let formulaType: '(' | '[' | null = null;

            while ((delimMatch = delimRegex.exec(value)) !== null) {
              const sym = delimMatch[0];
              if (!inFormula) {
                if (sym === '\\(' || sym === '\\[') {
                  if (delimMatch.index > lastIndex) {
                    parts.push({ type: 'text', content: value.substring(lastIndex, delimMatch.index) });
                  }
                  inFormula = true;
                  formulaStart = delimMatch.index + 2;
                  formulaType = sym === '\\(' ? '(' : '[';
                }
              } else {
                const expectedEnd = formulaType === '(' ? '\\)' : '\\]';
                if (sym === expectedEnd) {
                  parts.push({ type: 'formula', content: value.substring(formulaStart, delimMatch.index) });
                  inFormula = false;
                  formulaType = null;
                  lastIndex = delimMatch.index + 2;
                }
              }
            }
            if (lastIndex < value.length) {
              remaining = value.substring(lastIndex);
            } else {
              remaining = '';
            }

            // If \(...\) found, use those parts
            if (parts.length > 0) {
              if (remaining.trim()) parts.push({ type: 'text', content: remaining });
              editor.commands.clearContent();
              parts.forEach(part => {
                if (part.type === 'formula') {
                  editor.commands.setFormula(part.content);
                } else if (part.content.trim()) {
                  editor.commands.insertContent(part.content, { updateSelection: false });
                }
              });
              return;
            }

            // Fallback: parse $...$ formulas
            const dollarRegex = /\$([^$]+)\$/g;
            let dMatch;
            lastIndex = 0;
            while ((dMatch = dollarRegex.exec(value)) !== null) {
              if (dMatch.index > lastIndex) {
                parts.push({ type: 'text', content: value.substring(lastIndex, dMatch.index) });
              }
              parts.push({ type: 'formula', content: dMatch[1] });
              lastIndex = dollarRegex.lastIndex;
            }
            if (parts.length > 0) {
              if (lastIndex < value.length) {
                parts.push({ type: 'text', content: value.substring(lastIndex) });
              }
              editor.commands.clearContent();
              parts.forEach(part => {
                if (part.type === 'formula') {
                  editor.commands.setFormula(part.content);
                } else if (part.content.trim()) {
                  editor.commands.insertContent(part.content, { updateSelection: false });
                }
              });
              return;
            }
          }

          editor.commands.setContent(value, { emitUpdate: false });
        }
      } catch (err) {
        console.error('Error setting editor content:', err);
        editor.commands.setContent(`<p>${value}</p>`, { emitUpdate: false });
      }
    }
  }, [value, editor]);

  useEffect(() => {
    const handleOpenFormulaEditor = () => {
      if (editor && editor.isFocused) {
        console.log('✅ [RichTextEditor] Editor is focused, inserting formula');
        editor.chain().focus().setFormula('').run();
      } else {
        console.log('⏭️ [RichTextEditor] Editor not focused, skipping formula insertion');
      }
    };

    window.addEventListener('open-formula-editor', handleOpenFormulaEditor);
    return () => window.removeEventListener('open-formula-editor', handleOpenFormulaEditor);
  }, [editor]);

  const insertFormula = () => {
    if (editor) {
      // НЕ фокусируем автоматически - только вставляем формулу
      editor.chain().setFormula('').run();
      setShowSymbols(true);
    }
  };

  const insertSymbol = (latex: string) => {
    if (editor) {
      // Находим активную формулу и вставляем в неё символ
      const { state } = editor;
      const { selection } = state;
      const node = state.doc.nodeAt(selection.from);
      
      if (node?.type.name === 'formula') {
        // Если курсор в формуле, добавляем к существующему LaTeX
        const currentLatex = node.attrs.latex || '';
        editor.chain().updateAttributes('formula', {
          latex: currentLatex + latex
        }).run();
      } else {
        // Иначе создаём новую формулу с этим символом
        editor.chain().setFormula(latex).run();
      }
    }
  };

  // Категории символов
  const symbolCategories = {
    basic: [
      { latex: '\\sqrt{}', label: '√' },
      { latex: '\\frac{}{}', label: 'a/b' },
      { latex: '^{}', label: 'xⁿ' },
      { latex: '_{}', label: 'xₙ' },
      { latex: '()', label: '( )' },
      { latex: '\\pm', label: '±' },
      { latex: '\\times', label: '×' },
      { latex: '\\div', label: '÷' },
      { latex: '=', label: '=' },
      { latex: '\\neq', label: '≠' },
      { latex: '<', label: '<' },
      { latex: '>', label: '>' },
      { latex: '\\leq', label: '≤' },
      { latex: '\\geq', label: '≥' },
      { latex: '\\infty', label: '∞' },
    ],
    greek: [
      { latex: '\\alpha', label: 'α' },
      { latex: '\\beta', label: 'β' },
      { latex: '\\gamma', label: 'γ' },
      { latex: '\\delta', label: 'δ' },
      { latex: '\\epsilon', label: 'ε' },
      { latex: '\\theta', label: 'θ' },
      { latex: '\\lambda', label: 'λ' },
      { latex: '\\mu', label: 'μ' },
      { latex: '\\pi', label: 'π' },
      { latex: '\\sigma', label: 'σ' },
      { latex: '\\phi', label: 'φ' },
      { latex: '\\omega', label: 'ω' },
      { latex: '\\Gamma', label: 'Γ' },
      { latex: '\\Delta', label: 'Δ' },
      { latex: '\\Theta', label: 'Θ' },
      { latex: '\\Lambda', label: 'Λ' },
      { latex: '\\Sigma', label: 'Σ' },
      { latex: '\\Omega', label: 'Ω' },
    ],
    operators: [
      { latex: '\\sum', label: 'Σ' },
      { latex: '\\prod', label: '∏' },
      { latex: '\\int', label: '∫' },
      { latex: '\\lim', label: 'lim' },
      { latex: '\\sin', label: 'sin' },
      { latex: '\\cos', label: 'cos' },
      { latex: '\\tan', label: 'tan' },
      { latex: '\\log', label: 'log' },
      { latex: '\\ln', label: 'ln' },
      { latex: '\\in', label: '∈' },
      { latex: '\\notin', label: '∉' },
      { latex: '\\subset', label: '⊂' },
      { latex: '\\cup', label: '∪' },
      { latex: '\\cap', label: '∩' },
      { latex: '\\forall', label: '∀' },
      { latex: '\\exists', label: '∃' },
    ],
    advanced: [
      { latex: '\\partial', label: '∂' },
      { latex: '\\nabla', label: '∇' },
      { latex: '\\approx', label: '≈' },
      { latex: '\\equiv', label: '≡' },
      { latex: '\\propto', label: '∝' },
      { latex: '\\perp', label: '⊥' },
      { latex: '\\parallel', label: '∥' },
      { latex: '\\angle', label: '∠' },
      { latex: '\\to', label: '→' },
      { latex: '\\Rightarrow', label: '⇒' },
      { latex: '\\Leftrightarrow', label: '⇔' },
      { latex: '\\cdot', label: '·' },
      { latex: '\\circ', label: '∘' },
      { latex: '\\emptyset', label: '∅' },
    ],
  };

  if (!editor) {
    return null;
  }

  return (
    <div className={`relative ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 border-b bg-gray-50/50 rounded-t-lg flex-wrap">
        <div className="flex-1 min-w-0"></div>

        <div className="text-xs text-gray-400 hidden md:block">
          Tahrirlash: Enter yoki 2x bosish
        </div>
      </div>

      {/* Editor */}
      <div className="border border-t-0 rounded-b-lg bg-white">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
