import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { FormulaExtension } from './FormulaExtension';
import { useEffect, useMemo, useRef, useState } from 'react';
import { hasMathML, convertMathMLToLatex } from '@/lib/mathmlUtils';
import api from '@/lib/api';
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
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);

  // Rasm upload va editorga qo'shish
  const uploadAndInsertImage = async (file: File) => {
    const ed = editorRef.current;
    if (!ed) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/uploads', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = data.url || data.path || data.fileUrl;
      if (url) {
        ed.chain().focus().setImage({ src: url }).run();
      }
    } catch (err) {
      console.error('Image upload failed:', err);
    }
  };

  const extensions = useMemo(() => [
    StarterKit,
    Placeholder.configure({ placeholder: 'Matnni kiriting...' }),
    FormulaExtension,
    Image.configure({ inline: true, allowBase64: false }),
  ], []);

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
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return false;
        event.preventDefault();
        imageFiles.forEach(file => uploadAndInsertImage(file));
        return true;
      },
      handlePaste: (_view, event) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        // Rasm paste (Ctrl+V screenshot yoki rasm fayl)
        const imageFiles = Array.from(clipboardData.files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length > 0) {
          event.preventDefault();
          imageFiles.forEach(file => uploadAndInsertImage(file));
          return true;
        }

        const text = clipboardData.getData('text/plain');
        const html = clipboardData.getData('text/html');

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

  // editorRef ni yangilash
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

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


  if (!editor) {
    return null;
  }

  return (
    <div className={`relative ${className}`}>
      {/* Toolbar: f(x) button opens FormulaPopover via TipTap */}
      <div className="flex items-center px-2 py-1 border-b bg-gray-50/50 rounded-t-lg">
        <button
          type="button"
          title="Formula kiritish (yoki 2x bosing)"
          onMouseDown={(e) => {
            e.preventDefault();
            insertFormula();
          }}
          className="px-2.5 py-1 text-sm font-semibold rounded-md transition-all flex items-center gap-1 bg-white border border-gray-300 text-gray-700 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 shadow-sm"
        >
          <span className="italic">f</span><span className="text-xs">(x)</span>
        </button>
        <div className="flex-1" />
        <span className="text-[11px] text-gray-400 hidden sm:block">2x bosish = tahrirlash</span>
      </div>

      {/* Editor */}
      <div className="border border-t-0 rounded-b-lg bg-white">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
