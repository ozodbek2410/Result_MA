import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { FormulaExtension } from './FormulaExtension';
import { useEffect, useState, useMemo } from 'react';
import './editor.css';

interface RichTextEditorProps {
  value: string;
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
    if (editor && value !== editor.getHTML()) {
      try {
        if (value && typeof value === 'string') {
          try {
            const json = JSON.parse(value);
            if (json.type === 'doc') {
              editor.commands.setContent(json, { emitUpdate: false });
              return;
            }
          } catch {
            // Не JSON, продолжаем как HTML
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
      if (editor) {
        editor.chain().focus().setFormula('').run();
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
        <button
          type="button"
          onClick={insertFormula}
          className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 text-xs font-medium bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 hover:border-gray-400 transition-all flex-shrink-0"
          title="Formula qo'shish (Alt+=)"
        >
          <span className="text-sm sm:text-base">𝑓(x)</span>
          <span className="text-gray-500 hidden sm:inline">Alt+=</span>
        </button>

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
