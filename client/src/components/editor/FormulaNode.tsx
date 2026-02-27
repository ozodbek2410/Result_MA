import { NodeViewWrapper } from '@tiptap/react';
import { useState, useRef, useEffect } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import FormulaPopover from './FormulaPopover';

export default function FormulaNode({ node, updateAttributes, selected, editor }: any) {
  const [isEditing, setIsEditing] = useState(false);
  const [showPopover, setShowPopover] = useState(false);
  const nodeRef = useRef<HTMLSpanElement>(null);
  const formulaRef = useRef<HTMLSpanElement>(null);
  const currentLatexRef = useRef<string>('');
  const hasOpenedRef = useRef(false); // Флаг для предотвращения повторного открытия
  
  const latex = node.attrs.latex || '';
  
  useEffect(() => {
    currentLatexRef.current = latex;
  }, [latex]);

  // Рендерим формулу через KaTeX
  useEffect(() => {
    if (formulaRef.current && latex) {
      try {
        const useDisplay = /\\begin\{(aligned|cases|array|matrix|pmatrix|bmatrix|vmatrix|gather|split)/.test(latex);
        katex.render(latex, formulaRef.current, {
          displayMode: useDisplay,
          throwOnError: false,
          errorColor: '#cc0000',
          strict: false
        });
      } catch (error) {
        if (formulaRef.current) {
          formulaRef.current.textContent = latex;
          formulaRef.current.style.color = '#cc0000';
        }
      }
    }
  }, [latex]);

  // НЕ открываем popover автоматически
  // Пользователь должен кликнуть на формулу чтобы открыть редактор
  
  // Автоматически открываем popover для новых пустых формул (созданных через Alt+=)
  useEffect(() => {
    if (!latex && !showPopover && !hasOpenedRef.current) {
      console.log('🔍 [FormulaNode] New empty formula detected, opening popover automatically');
      hasOpenedRef.current = true;
      setShowPopover(true);
    }
  }, []); // Запускаем только при монтировании

  useEffect(() => {
    if (selected && !isEditing) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
          e.preventDefault();
          setShowPopover(true);
          setIsEditing(true);
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [selected, isEditing]);

  const handleDoubleClick = () => {
    setShowPopover(true);
    setIsEditing(true);
  };

  const handleSave = (newLatex: string) => {
    currentLatexRef.current = newLatex;
    if (newLatex.trim()) {
      updateAttributes({ latex: newLatex });
    }
  };

  const handleClose = () => {
    const finalLatex = currentLatexRef.current;
    
    if (!finalLatex.trim()) {
      editor.commands.deleteSelection();
    } else {
      updateAttributes({ latex: finalLatex });
    }
    
    setShowPopover(false);
    setIsEditing(false);
  };

  return (
    <NodeViewWrapper as="span" className="inline-block relative">
      <span
        ref={nodeRef}
        onDoubleClick={handleDoubleClick}
        onClick={handleDoubleClick}
        className={`inline-flex items-center px-1 py-0.5 mx-0.5 rounded cursor-pointer transition-all ${
          selected
            ? 'bg-blue-50 ring-2 ring-blue-300'
            : 'hover:bg-blue-50'
        }`}
        contentEditable={false}
        title="Formulani tahrirlash uchun bosing"
      >
        {latex ? (
          <span ref={formulaRef} className="formula-content" />
        ) : (
          <span className="text-blue-500 text-sm font-medium">📐</span>
        )}
      </span>

      {showPopover && nodeRef.current && (
        <FormulaPopover
          anchorEl={nodeRef.current}
          initialLatex={latex}
          onSave={handleSave}
          onClose={handleClose}
        />
      )}
    </NodeViewWrapper>
  );
}
