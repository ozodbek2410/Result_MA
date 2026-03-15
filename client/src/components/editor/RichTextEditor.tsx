import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { FormulaExtension } from './FormulaExtension';
import { useEffect, useState, useMemo, useRef } from 'react';
import { hasMathML, convertMathMLToLatex } from '@/lib/mathmlUtils';
import './editor.css';

interface RichTextEditorProps {
  value: string | Record<string, unknown>;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function RichTextEditor({ value, onChange, placeholder = 'Matnni kiriting...', className = '' }: RichTextEditorProps) {
  const [editorKey] = useState(() => Math.random());
  const formulaConvertedRef = useRef(false);

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

    // Helper: parse \(...\), \[...\], $...$ delimiters into text/formula parts
    const parseFormulaParts = (text: string): Array<{ type: 'text' | 'formula', content: string }> => {
      const parts: Array<{ type: 'text' | 'formula', content: string }> = [];

      // Parse \(...\) and \[...\] delimiters
      const delimRegex = /\\[()\[\]]/g;
      let lastIndex = 0;
      let delimMatch;
      let inFormula = false;
      let formulaStart = -1;
      let formulaType: '(' | '[' | null = null;

      while ((delimMatch = delimRegex.exec(text)) !== null) {
        const sym = delimMatch[0];
        if (!inFormula) {
          if (sym === '\\(' || sym === '\\[') {
            if (delimMatch.index > lastIndex) {
              parts.push({ type: 'text', content: text.substring(lastIndex, delimMatch.index) });
            }
            inFormula = true;
            formulaStart = delimMatch.index + 2;
            formulaType = sym === '\\(' ? '(' : '[';
          }
        } else {
          const expectedEnd = formulaType === '(' ? '\\)' : '\\]';
          if (sym === expectedEnd) {
            parts.push({ type: 'formula', content: text.substring(formulaStart, delimMatch.index) });
            inFormula = false;
            formulaType = null;
            lastIndex = delimMatch.index + 2;
          }
        }
      }

      if (parts.length > 0) {
        if (lastIndex < text.length) {
          parts.push({ type: 'text', content: text.substring(lastIndex) });
        }
        return parts;
      }

      // Fallback: parse $...$ formulas
      const dollarRegex = /\$([^$]+)\$/g;
      let dMatch;
      lastIndex = 0;
      while ((dMatch = dollarRegex.exec(text)) !== null) {
        if (dMatch.index > lastIndex) {
          parts.push({ type: 'text', content: text.substring(lastIndex, dMatch.index) });
        }
        parts.push({ type: 'formula', content: dMatch[1] });
        lastIndex = dollarRegex.lastIndex;
      }
      if (parts.length > 0 && lastIndex < text.length) {
        parts.push({ type: 'text', content: text.substring(lastIndex) });
      }

      return parts;
    };

    const applyFormulaParts = (parts: Array<{ type: 'text' | 'formula', content: string }>) => {
      editor.commands.clearContent();
      parts.forEach(part => {
        if (part.type === 'formula') {
          editor.commands.setFormula(part.content);
        } else if (part.content.trim()) {
          editor.commands.insertContent(part.content, { updateSelection: false });
        }
      });
    };

    const editorHtml = editor.getHTML();

    if (value !== editorHtml) {
      formulaConvertedRef.current = false;
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
            const parts = parseFormulaParts(value);
            if (parts.length > 0) {
              formulaConvertedRef.current = true;
              applyFormulaParts(parts);
              return;
            }
          }

          editor.commands.setContent(value, { emitUpdate: false });
        }
      } catch (err) {
        console.error('Error setting editor content:', err);
        editor.commands.setContent(`<p>${value}</p>`, { emitUpdate: false });
      }
    } else if (!formulaConvertedRef.current) {
      // Value matches HTML but editor text might have unconverted \( formulas
      // This happens when value was saved as HTML containing raw \( text
      const plainText = editor.getText();
      if ((plainText.includes('\\(') || plainText.includes('\\[') || /\$[^$]+\$/.test(plainText)) &&
          !editorHtml.includes('data-latex')) {
        formulaConvertedRef.current = true;
        const parts = parseFormulaParts(plainText);
        if (parts.length > 0) {
          applyFormulaParts(parts);
        }
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
      editor.chain().setFormula('').run();
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

  // Quick formula buttons — eng ko'p ishlatiladigan amallar
  const quickFormulas = [
    { latex: '\\frac{}{}', label: 'a/b', title: 'Kasr' },
    { latex: '\\sqrt{}', label: '√', title: 'Ildiz' },
    { latex: '^{2}', label: 'x\u00B2', title: 'Kvadrat' },
    { latex: '^{}', label: 'x\u207F', title: 'Daraja' },
    { latex: '_{}', label: 'x\u2099', title: 'Indeks' },
    { latex: '\\log_{}', label: 'log', title: 'Logarifm' },
    { latex: '\\pm', label: '\u00B1', title: 'Plyus-minus' },
    { latex: '\\times', label: '\u00D7', title: "Ko'paytirish" },
    { latex: '\\leq', label: '\u2264', title: 'Kichik yoki teng' },
    { latex: '\\geq', label: '\u2265', title: 'Katta yoki teng' },
    { latex: '\\neq', label: '\u2260', title: 'Teng emas' },
    { latex: '\\infty', label: '\u221E', title: 'Cheksizlik' },
    { latex: '\\pi', label: '\u03C0', title: 'Pi' },
    { latex: '\\alpha', label: '\u03B1', title: 'Alfa' },
    { latex: '\\beta', label: '\u03B2', title: 'Beta' },
    { latex: '\\sum', label: '\u03A3', title: "Yig'indi" },
    { latex: '\\int', label: '\u222B', title: 'Integral' },
    { latex: '\\cdot', label: '\u00B7', title: 'Nuqta' },
  ];

  // Extended categories for "more" panel
  const [showMore, setShowMore] = useState(false);
  const moreFormulas = [
    { latex: '\\nthroot{}{}', label: '\u207F\u221A', title: 'n-ildiz' },
    { latex: '\\sin', label: 'sin', title: 'Sinus' },
    { latex: '\\cos', label: 'cos', title: 'Kosinus' },
    { latex: '\\tan', label: 'tan', title: 'Tangens' },
    { latex: '\\ln', label: 'ln', title: 'Natural log' },
    { latex: '\\lg', label: 'lg', title: 'Log 10' },
    { latex: '\\lim', label: 'lim', title: 'Limit' },
    { latex: '\\to', label: '\u2192', title: "O'tish" },
    { latex: '\\Rightarrow', label: '\u21D2', title: 'Implikatsiya' },
    { latex: '\\Leftrightarrow', label: '\u21D4', title: 'Ekvivalentlik' },
    { latex: '\\approx', label: '\u2248', title: 'Taxminan' },
    { latex: '\\equiv', label: '\u2261', title: 'Aynan teng' },
    { latex: '\\angle', label: '\u2220', title: 'Burchak' },
    { latex: '\\perp', label: '\u22A5', title: 'Perpendikulyar' },
    { latex: '\\parallel', label: '\u2225', title: 'Parallel' },
    { latex: '\\triangle', label: '\u25B3', title: 'Uchburchak' },
    { latex: '\\in', label: '\u2208', title: "To'plamga tegishli" },
    { latex: '\\subset', label: '\u2282', title: "Qism to'plam" },
    { latex: '\\cup', label: '\u222A', title: 'Birlashma' },
    { latex: '\\cap', label: '\u2229', title: 'Kesishma' },
    { latex: '\\emptyset', label: '\u2205', title: "Bo'sh to'plam" },
    { latex: '\\forall', label: '\u2200', title: 'Barcha uchun' },
    { latex: '\\exists', label: '\u2203', title: 'Mavjud' },
    { latex: '\\partial', label: '\u2202', title: 'Qisman hosila' },
    { latex: '\\gamma', label: '\u03B3', title: 'Gamma' },
    { latex: '\\delta', label: '\u03B4', title: 'Delta' },
    { latex: '\\theta', label: '\u03B8', title: 'Teta' },
    { latex: '\\lambda', label: '\u03BB', title: 'Lambda' },
    { latex: '\\sigma', label: '\u03C3', title: 'Sigma' },
    { latex: '\\omega', label: '\u03C9', title: 'Omega' },
    { latex: '\\phi', label: '\u03C6', title: 'Fi' },
    { latex: '\\Delta', label: '\u0394', title: 'Katta Delta' },
    { latex: '\\vec{}', label: 'v\u20D7', title: 'Vektor' },
    { latex: '\\overline{}', label: 'x\u0304', title: 'Ustidan chiziq' },
    { latex: '^{\\circ}', label: '\u00B0', title: 'Daraja belgisi' },
    { latex: '\\div', label: '\u00F7', title: "Bo'lish" },
  ];

  if (!editor) {
    return null;
  }

  return (
    <div className={`relative ${className}`}>
      {/* Formula Quick Toolbar */}
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b bg-gray-50/80 rounded-t-lg flex-wrap">
        {quickFormulas.map((f, i) => (
          <button
            key={i}
            type="button"
            title={f.title}
            onMouseDown={(e) => {
              e.preventDefault();
              insertSymbol(f.latex);
            }}
            className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-sm sm:text-base rounded hover:bg-blue-100 hover:text-blue-700 active:bg-blue-200 transition-colors text-gray-600 font-medium"
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          title="Ko'proq formulalar"
          onClick={() => setShowMore(!showMore)}
          className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-xs rounded transition-colors font-bold ${showMore ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200 text-gray-500'}`}
        >
          {showMore ? '\u2715' : '\u00B7\u00B7\u00B7'}
        </button>
      </div>

      {/* Extended formulas panel */}
      {showMore && (
        <div className="flex items-center gap-0.5 px-1.5 py-1 border-b bg-blue-50/50 flex-wrap">
          {moreFormulas.map((f, i) => (
            <button
              key={i}
              type="button"
              title={f.title}
              onMouseDown={(e) => {
                e.preventDefault();
                insertSymbol(f.latex);
              }}
              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-sm sm:text-base rounded hover:bg-blue-100 hover:text-blue-700 active:bg-blue-200 transition-colors text-gray-600"
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Editor */}
      <div className={`border ${showMore ? '' : 'border-t-0'} rounded-b-lg bg-white`}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
