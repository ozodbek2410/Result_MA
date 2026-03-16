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

  const [showMathPanel, setShowMathPanel] = useState(false);
  const [mathTab, setMathTab] = useState<'basic' | 'func' | 'greek' | 'sets' | 'arrows'>('basic');

  const mathCategories = {
    basic: {
      label: 'Asosiy',
      items: [
        { latex: '\\frac{}{}', label: '\u00B9/\u2093', title: 'Kasr' },
        { latex: '\\sqrt{}', label: '\u221A', title: 'Ildiz' },
        { latex: '\\sqrt[n]{}', label: '\u207F\u221A', title: 'n-ildiz' },
        { latex: '^{2}', label: 'x\u00B2', title: 'Kvadrat' },
        { latex: '^{3}', label: 'x\u00B3', title: 'Kub' },
        { latex: '^{}', label: 'x\u207F', title: 'Daraja' },
        { latex: '_{}', label: 'x\u2099', title: 'Indeks' },
        { latex: '_{}{}\u200B^{}', label: 'x\u2099\u207F', title: 'Indeks+daraja' },
        { latex: '\\pm', label: '\u00B1', title: 'Plyus-minus' },
        { latex: '\\mp', label: '\u2213', title: 'Minus-plyus' },
        { latex: '\\times', label: '\u00D7', title: "Ko'paytirish" },
        { latex: '\\div', label: '\u00F7', title: "Bo'lish" },
        { latex: '\\cdot', label: '\u00B7', title: 'Nuqta' },
        { latex: '=', label: '=', title: 'Teng' },
        { latex: '\\neq', label: '\u2260', title: 'Teng emas' },
        { latex: '<', label: '<', title: 'Kichik' },
        { latex: '>', label: '>', title: 'Katta' },
        { latex: '\\leq', label: '\u2264', title: 'Kichik/teng' },
        { latex: '\\geq', label: '\u2265', title: 'Katta/teng' },
        { latex: '\\approx', label: '\u2248', title: 'Taxminan' },
        { latex: '\\equiv', label: '\u2261', title: 'Aynan teng' },
        { latex: '\\infty', label: '\u221E', title: 'Cheksizlik' },
        { latex: '()', label: '( )', title: 'Qavslar' },
        { latex: '[]', label: '[ ]', title: 'Kvadrat qavs' },
        { latex: '\\{\\}', label: '{ }', title: "Jingalak qavs" },
        { latex: '||', label: '| |', title: 'Modul' },
        { latex: '^{\\circ}', label: '\u00B0', title: 'Gradus' },
        { latex: '\\%', label: '%', title: 'Foiz' },
      ],
    },
    func: {
      label: 'Funksiya',
      items: [
        { latex: '\\log_{}', label: 'log', title: 'Logarifm' },
        { latex: '\\ln', label: 'ln', title: 'Natural log' },
        { latex: '\\lg', label: 'lg', title: 'Log 10' },
        { latex: '\\sin', label: 'sin', title: 'Sinus' },
        { latex: '\\cos', label: 'cos', title: 'Kosinus' },
        { latex: '\\tan', label: 'tan', title: 'Tangens' },
        { latex: '\\cot', label: 'cot', title: 'Kotangens' },
        { latex: '\\arcsin', label: 'arcsin', title: 'Arksinus' },
        { latex: '\\arccos', label: 'arccos', title: 'Arkkosinus' },
        { latex: '\\arctan', label: 'arctan', title: 'Arktangens' },
        { latex: '\\lim', label: 'lim', title: 'Limit' },
        { latex: '\\sum', label: '\u03A3', title: "Yig'indi" },
        { latex: '\\prod', label: '\u220F', title: "Ko'paytma" },
        { latex: '\\int', label: '\u222B', title: 'Integral' },
        { latex: '\\oint', label: '\u222E', title: 'Kontur integral' },
        { latex: '\\max', label: 'max', title: 'Maksimum' },
        { latex: '\\min', label: 'min', title: 'Minimum' },
        { latex: '\\gcd', label: 'EKUB', title: 'EKUB' },
        { latex: '\\partial', label: '\u2202', title: 'Qisman hosila' },
        { latex: '\\nabla', label: '\u2207', title: 'Nabla' },
        { latex: '\\vec{}', label: '\u20D7', title: 'Vektor' },
        { latex: '\\overline{}', label: '\u0305', title: 'Ustidan chiziq' },
        { latex: '\\hat{}', label: '\u0302', title: 'Shapka' },
      ],
    },
    greek: {
      label: 'Yunon',
      items: [
        { latex: '\\alpha', label: '\u03B1', title: 'alfa' },
        { latex: '\\beta', label: '\u03B2', title: 'beta' },
        { latex: '\\gamma', label: '\u03B3', title: 'gamma' },
        { latex: '\\delta', label: '\u03B4', title: 'delta' },
        { latex: '\\epsilon', label: '\u03B5', title: 'epsilon' },
        { latex: '\\zeta', label: '\u03B6', title: 'zeta' },
        { latex: '\\eta', label: '\u03B7', title: 'eta' },
        { latex: '\\theta', label: '\u03B8', title: 'teta' },
        { latex: '\\lambda', label: '\u03BB', title: 'lambda' },
        { latex: '\\mu', label: '\u03BC', title: 'myu' },
        { latex: '\\nu', label: '\u03BD', title: 'nyu' },
        { latex: '\\xi', label: '\u03BE', title: 'ksi' },
        { latex: '\\pi', label: '\u03C0', title: 'pi' },
        { latex: '\\rho', label: '\u03C1', title: 'ro' },
        { latex: '\\sigma', label: '\u03C3', title: 'sigma' },
        { latex: '\\tau', label: '\u03C4', title: 'tau' },
        { latex: '\\phi', label: '\u03C6', title: 'fi' },
        { latex: '\\varphi', label: '\u03D5', title: 'fi (variant)' },
        { latex: '\\chi', label: '\u03C7', title: 'xi' },
        { latex: '\\psi', label: '\u03C8', title: 'psi' },
        { latex: '\\omega', label: '\u03C9', title: 'omega' },
        { latex: '\\Gamma', label: '\u0393', title: 'Gamma' },
        { latex: '\\Delta', label: '\u0394', title: 'Delta' },
        { latex: '\\Theta', label: '\u0398', title: 'Teta' },
        { latex: '\\Lambda', label: '\u039B', title: 'Lambda' },
        { latex: '\\Sigma', label: '\u03A3', title: 'Sigma' },
        { latex: '\\Phi', label: '\u03A6', title: 'Fi' },
        { latex: '\\Psi', label: '\u03A8', title: 'Psi' },
        { latex: '\\Omega', label: '\u03A9', title: 'Omega' },
      ],
    },
    sets: {
      label: "To'plam",
      items: [
        { latex: '\\in', label: '\u2208', title: 'Tegishli' },
        { latex: '\\notin', label: '\u2209', title: 'Tegishli emas' },
        { latex: '\\subset', label: '\u2282', title: "Qism to'plam" },
        { latex: '\\subseteq', label: '\u2286', title: "Qism/teng" },
        { latex: '\\supset', label: '\u2283', title: "Ustun to'plam" },
        { latex: '\\cup', label: '\u222A', title: 'Birlashma' },
        { latex: '\\cap', label: '\u2229', title: 'Kesishma' },
        { latex: '\\emptyset', label: '\u2205', title: "Bo'sh to'plam" },
        { latex: '\\forall', label: '\u2200', title: 'Barcha uchun' },
        { latex: '\\exists', label: '\u2203', title: 'Mavjud' },
        { latex: '\\neg', label: '\u00AC', title: 'Inkor' },
        { latex: '\\land', label: '\u2227', title: 'Va (AND)' },
        { latex: '\\lor', label: '\u2228', title: 'Yoki (OR)' },
        { latex: '\\angle', label: '\u2220', title: 'Burchak' },
        { latex: '\\perp', label: '\u22A5', title: 'Perpendikulyar' },
        { latex: '\\parallel', label: '\u2225', title: 'Parallel' },
        { latex: '\\triangle', label: '\u25B3', title: 'Uchburchak' },
        { latex: '\\sim', label: '\u223C', title: "O'xshash" },
        { latex: '\\cong', label: '\u2245', title: 'Kongruent' },
        { latex: '\\propto', label: '\u221D', title: 'Proporsional' },
      ],
    },
    arrows: {
      label: 'Strelka',
      items: [
        { latex: '\\to', label: '\u2192', title: "O'ng" },
        { latex: '\\leftarrow', label: '\u2190', title: 'Chap' },
        { latex: '\\leftrightarrow', label: '\u2194', title: 'Ikki tomon' },
        { latex: '\\Rightarrow', label: '\u21D2', title: 'Implikatsiya' },
        { latex: '\\Leftarrow', label: '\u21D0', title: 'Teskari' },
        { latex: '\\Leftrightarrow', label: '\u21D4', title: 'Ekvivalent' },
        { latex: '\\uparrow', label: '\u2191', title: 'Yuqoriga' },
        { latex: '\\downarrow', label: '\u2193', title: 'Pastga' },
        { latex: '\\mapsto', label: '\u21A6', title: 'Akslantirish' },
        { latex: '\\oplus', label: '\u2295', title: 'Aylana plyus' },
        { latex: '\\otimes', label: '\u2297', title: "Aylana ko'payt" },
        { latex: '\\star', label: '\u22C6', title: 'Yulduz' },
        { latex: '\\bullet', label: '\u2022', title: 'Nuqta' },
        { latex: '\\circ', label: '\u2218', title: 'Kompozitsiya' },
        { latex: '\\ll', label: '\u226A', title: 'Ancha kichik' },
        { latex: '\\gg', label: '\u226B', title: 'Ancha katta' },
      ],
    },
  };

  if (!editor) {
    return null;
  }

  const activeItems = mathCategories[mathTab].items;

  return (
    <div className={`relative ${className}`}>
      {/* Minimal toolbar: just the fx button */}
      <div className="flex items-center px-2 py-1 border-b bg-gray-50/50 rounded-t-lg">
        <button
          type="button"
          title="Matematik formulalar paneli"
          onClick={() => setShowMathPanel(!showMathPanel)}
          className={`
            px-2.5 py-1 text-sm font-semibold rounded-md transition-all flex items-center gap-1.5
            ${showMathPanel
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white border border-gray-300 text-gray-700 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 shadow-sm'
            }
          `}
        >
          <span className="italic">f</span><span className="text-xs">(x)</span>
        </button>
        <div className="flex-1" />
        <span className="text-[11px] text-gray-400 hidden sm:block">2x bosish = tahrirlash</span>
      </div>

      {/* Math panel — opens below toolbar */}
      {showMathPanel && (
        <div className="border-x border-b bg-white shadow-lg z-10">
          {/* Category tabs */}
          <div className="flex border-b bg-gray-50 overflow-x-auto">
            {(Object.keys(mathCategories) as Array<keyof typeof mathCategories>).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setMathTab(key)}
                className={`
                  px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors
                  ${mathTab === key
                    ? 'text-blue-700 border-b-2 border-blue-600 bg-white'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }
                `}
              >
                {mathCategories[key].label}
              </button>
            ))}
          </div>

          {/* Symbol grid */}
          <div className="flex flex-wrap gap-0.5 p-2 max-h-[160px] overflow-y-auto">
            {activeItems.map((f, i) => (
              <button
                key={i}
                type="button"
                title={f.title}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertSymbol(f.latex);
                }}
                className="w-9 h-9 flex items-center justify-center text-base rounded-md border border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 active:bg-blue-100 transition-colors text-gray-700"
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Editor */}
      <div className={`border ${showMathPanel ? '' : 'border-t-0'} rounded-b-lg bg-white`}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
