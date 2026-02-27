import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import FormulaNode from './FormulaNode';

export interface FormulaOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    formula: {
      setFormula: (latex: string) => ReturnType;
    };
  }
}

// Создаем расширение как функцию, чтобы избежать проблем с дублированием
export const FormulaExtension = Node.create<FormulaOptions>({
  name: 'formula',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: element => element.getAttribute('data-latex'),
        renderHTML: attributes => {
          return { 'data-latex': attributes.latex };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="formula"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'formula' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FormulaNode);
  },

  addCommands() {
    return {
      setFormula: (latex: string) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: { latex },
        });
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Alt-=': () => {
        const event = new CustomEvent('open-formula-editor');
        window.dispatchEvent(event);
        return true;
      },
    };
  },
});

// Экспортируем также как default для совместимости
export default FormulaExtension;
