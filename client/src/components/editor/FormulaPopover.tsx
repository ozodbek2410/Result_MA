import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

declare global {
  interface Window {
    MathQuill: any;
    jQuery: any;
    $: any;
  }
}

interface FormulaPopoverProps {
  anchorEl: HTMLElement;
  initialLatex: string;
  onSave: (latex: string) => void;
  onClose: () => void;
}

export default function FormulaPopover({ anchorEl, initialLatex, onSave, onClose }: FormulaPopoverProps) {
  const [latex, setLatex] = useState(initialLatex);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState<'basic' | 'greek' | 'operators' | 'advanced'>('basic');
  const popoverRef = useRef<HTMLDivElement>(null);
  const mathFieldRef = useRef<HTMLDivElement>(null);
  const mathFieldInstance = useRef<any>(null);
  const isInserting = useRef(false);
  const onSaveRef = useRef(onSave);
  const onCloseRef = useRef(onClose);

  console.log('🔍 [FormulaPopover] Initialized with:', { initialLatex });

  // Обновляем refs при изменении пропсов
  useEffect(() => {
    onSaveRef.current = onSave;
    onCloseRef.current = onClose;
  }, [onSave, onClose]);

  const handleSave = useCallback(() => {
    // Сохраняем текущее значение
    if (mathFieldInstance.current) {
      const currentLatex = mathFieldInstance.current.latex();
      onSaveRef.current(currentLatex);
    }
  }, []);

  const handleClose = useCallback(() => {
    // Сохраняем финальное значение перед закрытием
    if (mathFieldInstance.current) {
      const finalLatex = mathFieldInstance.current.latex();
      onSaveRef.current(finalLatex);
    }
    onCloseRef.current();
  }, []);

  // Вычисляем позицию popover
  useEffect(() => {
    const updatePosition = () => {
      const rect = anchorEl.getBoundingClientRect();
      const isMobile = window.innerWidth < 640;
      const popoverHeight = isMobile ? 450 : 500;
      const popoverWidth = isMobile ? window.innerWidth - 16 : 500;
      
      // Добавляем отступы от краев экрана
      const padding = isMobile ? 8 : 16;
      
      let top = rect.bottom + 8;
      let left = isMobile ? padding : rect.left;

      // На мобильных центрируем по горизонтали
      if (isMobile) {
        left = 8;
      } else {
        // Проверяем, не выходит ли за пределы экрана справа
        if (left + popoverWidth > window.innerWidth - padding) {
          left = window.innerWidth - popoverWidth - padding;
        }
        
        // Проверяем, не выходит ли за пределы экрана слева
        if (left < padding) {
          left = padding;
        }
      }

      // Проверяем, не выходит ли за пределы экрана снизу
      if (top + popoverHeight > window.innerHeight - padding) {
        // Пробуем разместить сверху
        const topPosition = rect.top - popoverHeight - 8;
        if (topPosition >= padding) {
          top = topPosition;
        } else {
          // Если не помещается ни снизу, ни сверху, центрируем по вертикали
          top = Math.max(padding, (window.innerHeight - popoverHeight) / 2);
        }
      }
      
      // Проверяем, не выходит ли за пределы экрана сверху
      if (top < padding) {
        top = padding;
      }

      setPosition({ top, left });
    };

    updatePosition();
    
    // Обновляем позицию только при изменении размера окна
    // НЕ обновляем при прокрутке, чтобы избежать дерганья
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('resize', updatePosition);
    };
  }, [anchorEl]);

  // Загрузка MathQuill
  useEffect(() => {
    const loadMathQuill = async () => {
      try {
        console.log('🔄 [FormulaPopover] Starting MathQuill load...');
        
        if (window.MathQuill) {
          console.log('✅ [FormulaPopover] MathQuill already loaded');
          setIsLoading(false);
          return;
        }

        if (!window.jQuery) {
          console.log('🔄 [FormulaPopover] Loading jQuery...');
          const jqueryScript = document.createElement('script');
          jqueryScript.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
          document.head.appendChild(jqueryScript);
          await new Promise((resolve, reject) => {
            jqueryScript.onload = resolve;
            jqueryScript.onerror = reject;
          });
          window.$ = window.jQuery;
          console.log('✅ [FormulaPopover] jQuery loaded');
        }

        if (!document.querySelector('link[href*="mathquill"]')) {
          console.log('🔄 [FormulaPopover] Loading MathQuill CSS...');
          const mathquillCSS = document.createElement('link');
          mathquillCSS.rel = 'stylesheet';
          mathquillCSS.href = 'https://cdn.jsdelivr.net/npm/mathquill@0.10.1/build/mathquill.css';
          document.head.appendChild(mathquillCSS);
        }

        console.log('🔄 [FormulaPopover] Loading MathQuill JS...');
        const mathquillScript = document.createElement('script');
        mathquillScript.src = 'https://cdn.jsdelivr.net/npm/mathquill@0.10.1/build/mathquill.min.js';
        document.head.appendChild(mathquillScript);
        await new Promise((resolve, reject) => {
          mathquillScript.onload = resolve;
          mathquillScript.onerror = reject;
        });

        console.log('✅ [FormulaPopover] MathQuill loaded successfully');
        setIsLoading(false);
      } catch (err) {
        console.error('❌ [FormulaPopover] Error loading MathQuill:', err);
        setIsLoading(false);
      }
    };

    loadMathQuill();
  }, []);

  // Инициализация MathQuill
  useEffect(() => {
    if (isLoading || !mathFieldRef.current || !window.MathQuill) return;

    try {
      console.log('[FormulaPopover] Initializing MathQuill');
      const MQ = window.MathQuill.getInterface(2);
      if (!mathFieldInstance.current) {
        mathFieldInstance.current = MQ.MathField(mathFieldRef.current, {
          spaceBehavesLikeTab: true,
          leftRightIntoCmdGoes: 'up',
          sumStartsWithNEquals: true,
          supSubsRequireOperand: false,
          charsThatBreakOutOfSupSub: '+-=<>',
          autoCommands: 'pi theta sqrt sum prod alpha beta gamma delta epsilon',
          autoOperatorNames: 'sin cos tan log ln arcsin arccos arctan',
          handlers: {
            edit: function() {
              const newLatex = mathFieldInstance.current.latex();
              console.log('[FormulaPopover] Formula edited:', newLatex);
              
              // Filter out Cyrillic characters
              const filteredLatex = newLatex.replace(/[а-яА-ЯёЁ]/g, '');
              if (filteredLatex !== newLatex) {
                console.warn('[FormulaPopover] Removed Cyrillic characters from formula');
                mathFieldInstance.current.latex(filteredLatex);
                setLatex(filteredLatex);
                return;
              }
              
              // Только обновляем локальное состояние, НЕ вызываем onSave
              setLatex(newLatex);
            }
          }
        });

        if (initialLatex) {
          console.log('[FormulaPopover] Setting initial latex:', initialLatex);
          mathFieldInstance.current.latex(initialLatex);
        }

        // Применяем стили для исправления обрезания ПОСЛЕ инициализации
        setTimeout(() => {
          if (mathFieldRef.current) {
            const mqField = mathFieldRef.current.querySelector('.mq-editable-field') as HTMLElement;
            const mqRoot = mathFieldRef.current.querySelector('.mq-root-block') as HTMLElement;
            
            if (mqField) {
              // Убираем фиксированную высоту и делаем auto-expand
              mqField.style.overflow = 'auto';
              mqField.style.overflowX = 'auto';
              mqField.style.overflowY = 'auto';
              mqField.style.minHeight = '280px';
              mqField.style.maxHeight = '400px';
              mqField.style.height = 'auto';
              mqField.style.paddingTop = '20px';
              mqField.style.paddingBottom = '20px';
              mqField.style.paddingLeft = '12px';
              mqField.style.paddingRight = '12px';
              mqField.style.wordWrap = 'break-word';
              mqField.style.overflowWrap = 'break-word';
              mqField.style.whiteSpace = 'normal';
              console.log('✅ [FormulaPopover] Applied styles to MathQuill field');
            }
            
            if (mqRoot) {
              mqRoot.style.overflow = 'visible';
              mqRoot.style.minHeight = 'auto';
              mqRoot.style.height = 'auto';
              mqRoot.style.whiteSpace = 'normal';
              mqRoot.style.wordWrap = 'break-word';
              console.log('✅ [FormulaPopover] Applied styles to MathQuill root');
            }
          }
        }, 150);

        // Фокусируем и показываем курсор
        setTimeout(() => {
          if (mathFieldInstance.current) {
            mathFieldInstance.current.focus();
            mathFieldInstance.current.moveToRightEnd();
            console.log('[FormulaPopover] MathField focused');
          }
        }, 100);
        
        console.log('[FormulaPopover] MathQuill initialized successfully');
      }
    } catch (err) {
      console.error('[FormulaPopover] Error initializing MathQuill:', err);
    }

    return () => {
      if (mathFieldInstance.current) {
        console.log('[FormulaPopover] Cleaning up MathQuill');
        mathFieldInstance.current = null;
      }
    };
  }, [isLoading]); // Убрали onSave из зависимостей

  // Горячие клавиши (убрали Esc - закрытие только через кнопки)
  // useEffect(() => {
  //   const handleKeyDown = (e: KeyboardEvent) => {
  //     if (e.key === 'Escape') {
  //       e.preventDefault();
  //       handleClose();
  //     }
  //   };

  //   document.addEventListener('keydown', handleKeyDown);
  //   return () => document.removeEventListener('keydown', handleKeyDown);
  // }, [handleClose]);

  const insertCommand = (cmd: string) => {
    if (!mathFieldInstance.current) {
      console.warn('[FormulaPopover] MathQuill instance not ready');
      return;
    }
    try {
      const beforeLatex = mathFieldInstance.current.latex();
      console.log('[FormulaPopover] Inserting command:', cmd, 'Current latex:', beforeLatex);
      
      // Устанавливаем флаг для предотвращения автосохранения
      isInserting.current = true;
      
      // Фокусируемся, но НЕ перемещаем курсор
      mathFieldInstance.current.focus();
      
      // Use cmd() method which is the proper way to insert LaTeX commands
      console.log('[FormulaPopover] Using cmd() for:', cmd);
      mathFieldInstance.current.cmd(cmd);
      
      // Снимаем флаг
      isInserting.current = false;
      
      // Получаем финальный LaTeX
      const newLatex = mathFieldInstance.current.latex();
      console.log('[FormulaPopover] After cmd():', newLatex, 'Changed:', newLatex !== beforeLatex);
      
      if (newLatex !== beforeLatex) {
        setLatex(newLatex);
      } else {
        console.warn('[FormulaPopover] Command did not change latex:', cmd);
      }
    } catch (err) {
      isInserting.current = false;
      console.error('[FormulaPopover] Error inserting command:', cmd, err);
    }
  };

  const insertText = (text: string) => {
    if (!mathFieldInstance.current) {
      console.warn('[FormulaPopover] MathQuill instance not ready');
      return;
    }
    
    try {
      const beforeLatex = mathFieldInstance.current.latex();
      console.log('[FormulaPopover] Inserting text:', text, 'Current latex:', beforeLatex);
      
      // Устанавливаем флаг для предотвращения автосохранения
      isInserting.current = true;
      
      // Фокусируемся, но НЕ перемещаем курсор
      mathFieldInstance.current.focus();
      
      // Check if field is empty
      const isEmpty = !beforeLatex || beforeLatex.trim() === '';
      
      // Handle special cases
      if (text === '\\{\\}') {
        console.log('[FormulaPopover] Inserting curly braces');
        mathFieldInstance.current.typedText('\\{\\}');
      } else if (text === '\\overline{}' || text === '\\underline{}' || text === '\\vec{}') {
        // For these commands, write them and move cursor inside
        console.log('[FormulaPopover] Inserting command with braces:', text);
        mathFieldInstance.current.write(text);
        mathFieldInstance.current.keystroke('Left'); // Move cursor inside braces
      } else if (text === '^') {
        // For superscript, use cmd
        console.log('[FormulaPopover] Inserting superscript');
        if (isEmpty) {
          mathFieldInstance.current.write('x');
        }
        mathFieldInstance.current.cmd('^');
      } else if (text === '_') {
        // For subscript, use cmd
        console.log('[FormulaPopover] Inserting subscript');
        if (isEmpty) {
          mathFieldInstance.current.write('x');
        }
        mathFieldInstance.current.cmd('_');
      } else {
        mathFieldInstance.current.write(text);
      }
      
      // Снимаем флаг
      isInserting.current = false;
      
      const newLatex = mathFieldInstance.current.latex();
      console.log('[FormulaPopover] After insertion:', newLatex, 'Changed:', newLatex !== beforeLatex);
      
      if (newLatex !== beforeLatex) {
        setLatex(newLatex);
      } else {
        console.warn('[FormulaPopover] Text did not change latex:', text);
      }
    } catch (err) {
      isInserting.current = false;
      console.error('[FormulaPopover] Error inserting text:', text, err);
    }
  };

  // Категории символов
  const symbolCategories = {
    basic: [
      { cmd: '\\sqrt', label: '\u221A', title: 'Ildiz' },
      { cmd: '\\nthroot', label: '\u207F\u221A', title: 'n-ildiz' },
      { cmd: '\\frac', label: '\u00B9/\u2093', title: 'Kasr' },
      { text: '^', label: 'x\u207F', title: 'Daraja' },
      { text: '_', label: 'x\u2099', title: 'Indeks' },
      { text: '()', label: '( )', title: 'Qavslar' },
      { text: '[]', label: '[ ]', title: 'Kvadrat qavslar' },
      { text: '\\left(\\right)', label: '\u239B \u239E', title: 'Katta qavslar' },
      { text: '\\left[\\right]', label: '\u23A1 \u23A4', title: 'Katta kvadrat qavs' },
      { text: '\\left\\{\\right.', label: '{\u23B0', title: "Sistema qavsi (chap)" },
      { text: '\\left\\{\\right\\}', label: '{ }', title: "Jingalak qavslar (juft)" },
      { text: '\\left|\\right|', label: '\u2502 \u2502', title: 'Modul (katta)' },
      { text: '||', label: '| |', title: 'Modul' },
      { text: '\\begin{cases}  \\\\  \\end{cases}', label: '\u23A7\u23A9', title: 'Tenglamalar sistemasi' },
      { text: '\\begin{pmatrix}  \\\\  \\end{pmatrix}', label: '(\u2009)', title: 'Matritsa (qavs)' },
      { text: '\\begin{bmatrix}  \\\\  \\end{bmatrix}', label: '[\u2009]', title: 'Matritsa (kvadrat)' },
      { text: '\\begin{vmatrix}  \\\\  \\end{vmatrix}', label: '|\u2009|', title: 'Determinant' },
      { text: '\\overline{}', label: 'x\u0304', title: 'Ustidan chiziq' },
      { text: '\\underline{}', label: 'x\u0332', title: 'Ostidan chiziq' },
      { text: '\\vec{}', label: 'v\u20D7', title: 'Vektor' },
      { text: '\\hat{}', label: 'x\u0302', title: 'Shapka' },
      { text: '\\tilde{}', label: 'x\u0303', title: 'Tilda' },
      { text: '\\dot{}', label: 'x\u0307', title: 'Nuqta ustida' },
      { text: '\\ddot{}', label: 'x\u0308', title: 'Ikki nuqta ustida' },
      { text: '\\%', label: '%', title: 'Foiz' },
      { text: '^{\\circ}', label: '\u00B0', title: 'Gradus' },
    ],
    greek: [
      { cmd: '\\alpha', label: 'α', title: 'Alfa' },
      { cmd: '\\beta', label: 'β', title: 'Beta' },
      { cmd: '\\gamma', label: 'γ', title: 'Gamma' },
      { cmd: '\\delta', label: 'δ', title: 'Delta' },
      { cmd: '\\epsilon', label: 'ε', title: 'Epsilon' },
      { cmd: '\\varepsilon', label: 'ϵ', title: 'Epsilon variant' },
      { cmd: '\\zeta', label: 'ζ', title: 'Zeta' },
      { cmd: '\\eta', label: 'η', title: 'Eta' },
      { cmd: '\\theta', label: 'θ', title: 'Teta' },
      { cmd: '\\vartheta', label: 'ϑ', title: 'Teta variant' },
      { cmd: '\\iota', label: 'ι', title: 'Iota' },
      { cmd: '\\kappa', label: 'κ', title: 'Kappa' },
      { cmd: '\\lambda', label: 'λ', title: 'Lambda' },
      { cmd: '\\mu', label: 'μ', title: 'Myu' },
      { cmd: '\\nu', label: 'ν', title: 'Nyu' },
      { cmd: '\\xi', label: 'ξ', title: 'Ksi' },
      { cmd: '\\pi', label: 'π', title: 'Pi' },
      { cmd: '\\varpi', label: 'ϖ', title: 'Pi variant' },
      { cmd: '\\rho', label: 'ρ', title: 'Ro' },
      { cmd: '\\sigma', label: 'σ', title: 'Sigma' },
      { cmd: '\\varsigma', label: 'ς', title: 'Sigma variant' },
      { cmd: '\\tau', label: 'τ', title: 'Tau' },
      { cmd: '\\upsilon', label: 'υ', title: 'Upsilon' },
      { cmd: '\\phi', label: 'φ', title: 'Fi' },
      { cmd: '\\varphi', label: 'ϕ', title: 'Fi variant' },
      { cmd: '\\chi', label: 'χ', title: 'Xi' },
      { cmd: '\\psi', label: 'ψ', title: 'Psi' },
      { cmd: '\\omega', label: 'ω', title: 'Omega' },
      { cmd: '\\Gamma', label: 'Γ', title: 'Katta Gamma' },
      { cmd: '\\Delta', label: 'Δ', title: 'Katta Delta' },
      { cmd: '\\Theta', label: 'Θ', title: 'Katta Teta' },
      { cmd: '\\Lambda', label: 'Λ', title: 'Katta Lambda' },
      { cmd: '\\Xi', label: 'Ξ', title: 'Katta Ksi' },
      { cmd: '\\Pi', label: 'Π', title: 'Katta Pi' },
      { cmd: '\\Sigma', label: 'Σ', title: 'Katta Sigma' },
      { cmd: '\\Upsilon', label: 'Υ', title: 'Katta Upsilon' },
      { cmd: '\\Phi', label: 'Φ', title: 'Katta Fi' },
      { cmd: '\\Psi', label: 'Ψ', title: 'Katta Psi' },
      { cmd: '\\Omega', label: 'Ω', title: 'Katta Omega' },
    ],
    operators: [
      { cmd: '\\times', label: '×', title: "Ko'paytirish" },
      { cmd: '\\div', label: '÷', title: "Bo'lish" },
      { cmd: '\\pm', label: '±', title: 'Plyus-minus' },
      { cmd: '\\mp', label: '∓', title: 'Minus-plyus' },
      { text: '=', label: '=', title: 'Teng' },
      { cmd: '\\neq', label: '≠', title: 'Teng emas' },
      { cmd: '\\approx', label: '≈', title: 'Taxminan teng' },
      { cmd: '\\equiv', label: '≡', title: 'Aynan teng' },
      { cmd: '\\cong', label: '≅', title: 'Kongruent' },
      { cmd: '\\sim', label: '∼', title: "O'xshash" },
      { text: '<', label: '<', title: 'Kichik' },
      { text: '>', label: '>', title: 'Katta' },
      { cmd: '\\leq', label: '≤', title: 'Kichik yoki teng' },
      { cmd: '\\geq', label: '≥', title: 'Katta yoki teng' },
      { cmd: '\\ll', label: '≪', title: 'Ancha kichik' },
      { cmd: '\\gg', label: '≫', title: 'Ancha katta' },
      { cmd: '\\infty', label: '∞', title: 'Cheksizlik' },
      { cmd: '\\propto', label: '∝', title: 'Proporsional' },
      { cmd: '\\partial', label: '∂', title: 'Qisman hosila' },
      { cmd: '\\nabla', label: '∇', title: 'Nabla' },
      { cmd: '\\forall', label: '∀', title: 'Barcha uchun' },
      { cmd: '\\exists', label: '∃', title: 'Mavjud' },
      { cmd: '\\nexists', label: '∄', title: 'Mavjud emas' },
      { cmd: '\\in', label: '∈', title: "To'plamga tegishli" },
      { cmd: '\\notin', label: '∉', title: "Tegishli emas" },
      { cmd: '\\subset', label: '⊂', title: "Qism to'plam" },
      { cmd: '\\supset', label: '⊃', title: "Ustun to'plam" },
      { cmd: '\\subseteq', label: '⊆', title: "Qism to'plam yoki teng" },
      { cmd: '\\supseteq', label: '⊇', title: "Ustun to'plam yoki teng" },
      { cmd: '\\cup', label: '∪', title: 'Birlashma' },
      { cmd: '\\cap', label: '∩', title: 'Kesishma' },
      { cmd: '\\emptyset', label: '∅', title: "Bo'sh to'plam" },
      { cmd: '\\cdot', label: '·', title: 'Nuqta' },
      { cmd: '\\circ', label: '∘', title: 'Kompozitsiya' },
      { cmd: '\\bullet', label: '•', title: 'Bullet' },
      { cmd: '\\star', label: '⋆', title: 'Yulduzcha' },
      { cmd: '\\ast', label: '∗', title: 'Asterisk' },
      { cmd: '\\oplus', label: '⊕', title: 'Aylana plyus' },
      { cmd: '\\otimes', label: '⊗', title: "Aylana ko'paytirish" },
      { cmd: '\\perp', label: '⊥', title: 'Perpendikulyar' },
      { cmd: '\\parallel', label: '∥', title: 'Parallel' },
      { cmd: '\\angle', label: '∠', title: 'Burchak' },
      { cmd: '\\triangle', label: '△', title: 'Uchburchak' },
    ],
    advanced: [
      { cmd: '\\sum', label: 'Σ', title: "Yig'indi" },
      { cmd: '\\prod', label: '∏', title: "Ko'paytma" },
      { cmd: '\\coprod', label: '∐', title: "Koprodukt" },
      { cmd: '\\int', label: '∫', title: 'Integral' },
      { cmd: '\\oint', label: '∮', title: 'Kontur integrali' },
      { cmd: '\\lim', label: 'lim', title: 'Limit' },
      { cmd: '\\limsup', label: 'lim sup', title: 'Limit superior' },
      { cmd: '\\liminf', label: 'lim inf', title: 'Limit inferior' },
      { cmd: '\\sup', label: 'sup', title: 'Supremum' },
      { cmd: '\\inf', label: 'inf', title: 'Infimum' },
      { cmd: '\\max', label: 'max', title: 'Maksimum' },
      { cmd: '\\min', label: 'min', title: 'Minimum' },
      { cmd: '\\log', label: 'log', title: 'Logarifm' },
      { cmd: '\\ln', label: 'ln', title: 'Natural logarifm' },
      { cmd: '\\lg', label: 'lg', title: 'Logarifm 10' },
      { cmd: '\\exp', label: 'exp', title: 'Eksponenta' },
      { cmd: '\\sin', label: 'sin', title: 'Sinus' },
      { cmd: '\\cos', label: 'cos', title: 'Kosinus' },
      { cmd: '\\tan', label: 'tan', title: 'Tangens' },
      { cmd: '\\cot', label: 'cot', title: 'Kotangens' },
      { cmd: '\\sec', label: 'sec', title: 'Sekans' },
      { cmd: '\\csc', label: 'csc', title: 'Kosekans' },
      { cmd: '\\sinh', label: 'sinh', title: 'Giperbolik sinus' },
      { cmd: '\\cosh', label: 'cosh', title: 'Giperbolik kosinus' },
      { cmd: '\\tanh', label: 'tanh', title: 'Giperbolik tangens' },
      { cmd: '\\coth', label: 'coth', title: 'Giperbolik kotangens' },
      { cmd: '\\arcsin', label: 'arcsin', title: 'Arksinus' },
      { cmd: '\\arccos', label: 'arccos', title: 'Arkkosinus' },
      { cmd: '\\arctan', label: 'arctan', title: 'Arktangens' },
      { cmd: '\\arccot', label: 'arccot', title: 'Arkkotangens' },
      { cmd: '\\det', label: 'det', title: 'Determinant' },
      { cmd: '\\dim', label: 'dim', title: "O'lcham" },
      { cmd: '\\deg', label: 'deg', title: 'Daraja' },
      { cmd: '\\gcd', label: 'gcd', title: 'EKUB' },
      { cmd: '\\lcm', label: 'lcm', title: 'EKUK' },
      { cmd: '\\to', label: '→', title: "O'tish" },
      { cmd: '\\rightarrow', label: '→', title: "O'ng strelka" },
      { cmd: '\\leftarrow', label: '←', title: 'Chap strelka' },
      { cmd: '\\leftrightarrow', label: '↔', title: 'Ikki tomonlama strelka' },
      { cmd: '\\Rightarrow', label: '⇒', title: 'Implikatsiya' },
      { cmd: '\\Leftarrow', label: '⇐', title: 'Teskari implikatsiya' },
      { cmd: '\\Leftrightarrow', label: '⇔', title: 'Ekvivalentlik' },
      { cmd: '\\uparrow', label: '↑', title: 'Yuqoriga strelka' },
      { cmd: '\\downarrow', label: '↓', title: 'Pastga strelka' },
      { cmd: '\\mapsto', label: '↦', title: 'Akslantirish' },
    ],
  };

  // Dragging handlers - Mouse
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!popoverRef.current) return;
    
    setIsDragging(true);
    const rect = popoverRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  // Dragging handlers - Touch (для мобильных)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!popoverRef.current) return;
    
    const touch = e.touches[0];
    setIsDragging(true);
    const rect = popoverRef.current.getBoundingClientRect();
    setDragOffset({
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    });
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const newLeft = e.clientX - dragOffset.x;
      const newTop = e.clientY - dragOffset.y;
      
      // Ограничиваем перемещение границами экрана
      const maxLeft = window.innerWidth - (popoverRef.current?.offsetWidth || 500);
      const maxTop = window.innerHeight - (popoverRef.current?.offsetHeight || 400);
      
      setPosition({
        left: Math.max(0, Math.min(newLeft, maxLeft)),
        top: Math.max(0, Math.min(newTop, maxTop))
      });
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      
      const touch = e.touches[0];
      const newLeft = touch.clientX - dragOffset.x;
      const newTop = touch.clientY - dragOffset.y;
      
      // Ограничиваем перемещение границами экрана
      const maxLeft = window.innerWidth - (popoverRef.current?.offsetWidth || 500);
      const maxTop = window.innerHeight - (popoverRef.current?.offsetHeight || 400);
      
      setPosition({
        left: Math.max(0, Math.min(newLeft, maxLeft)),
        top: Math.max(0, Math.min(newTop, maxTop))
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, dragOffset]);

  const content = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
      />

      {/* Popover */}
      <div
        ref={popoverRef}
        className="fixed z-50 bg-white rounded-xl shadow-2xl border-2 border-blue-200 w-[calc(100vw-16px)] sm:w-[500px] flex flex-col"
        style={{ 
          top: `${position.top}px`, 
          left: `${position.left}px`,
          maxHeight: 'calc(100vh - 16px)',
          cursor: isDragging ? 'grabbing' : 'default'
        }}
      >
        {/* Header - Draggable */}
        <div 
          className="flex items-center justify-between p-2 sm:p-3 border-b bg-gradient-to-r from-blue-50 to-purple-50 cursor-grab active:cursor-grabbing select-none touch-none"
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          <h3 className="text-xs sm:text-sm font-bold text-gray-900 flex items-center gap-1 sm:gap-2">
            <span className="text-sm sm:text-base">📐</span>
            <span className="hidden xs:inline">Formula tahrirlash</span>
            <span className="xs:hidden">Formula</span>
            <span className="text-xs text-gray-500 font-normal hidden md:inline">(ko'chirish mumkin)</span>
          </h3>
          <button
            type="button"
            onClick={handleClose}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="p-1.5 hover:bg-white/50 rounded-lg transition-all flex-shrink-0"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex border-b bg-gray-50 overflow-x-auto">
              {[
                { key: 'basic' as const, label: '🔢', fullLabel: 'Asosiy', title: 'Asosiy operatsiyalar' },
                { key: 'greek' as const, label: '🇬🇷', fullLabel: 'Yunon', title: 'Yunon harflari' },
                { key: 'operators' as const, label: '➗', fullLabel: 'Operatorlar', title: 'Matematik operatorlar' },
                { key: 'advanced' as const, label: '📐', fullLabel: 'Murakkab', title: 'Murakkab funksiyalar' },
              ].map(({ key, label, fullLabel, title }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`flex-1 px-1.5 sm:px-2 py-1.5 sm:py-2 text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                    activeTab === key
                      ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                  title={title}
                >
                  <span className="sm:hidden">{label}</span>
                  <span className="hidden sm:inline">{label} {fullLabel}</span>
                </button>
              ))}
            </div>

            {/* Toolbar */}
            <div className="p-1.5 sm:p-2 border-b bg-gray-50 overflow-y-auto" style={{ maxHeight: '140px' }}>
              <div className="grid grid-cols-6 sm:grid-cols-8 gap-0.5 sm:gap-1">
                {symbolCategories[activeTab].map((item: any, index: number) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => {
                      console.log('[FormulaPopover] Button clicked:', item.title, item);
                      if ('cmd' in item) {
                        insertCommand(item.cmd);
                      } else if ('text' in item) {
                        insertText(item.text);
                      }
                    }}
                    className="px-1 sm:px-2 py-1.5 sm:py-2 text-sm sm:text-base bg-white border rounded hover:bg-blue-50 hover:border-blue-300 hover:shadow-sm transition-all active:scale-95"
                    title={item.title}
                    aria-label={item.title}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Editor - Formula input field with 350px height - v2.0 */}
            <div 
              className="p-2 sm:p-4 flex-1 overflow-y-auto bg-gradient-to-b from-gray-50 to-white" 
              style={{ 
                minHeight: '280px',
                maxHeight: '450px'
              }}
            >
              <label className="text-xs sm:text-sm text-gray-700 mb-1.5 sm:mb-2 block font-semibold flex items-center gap-1 sm:gap-2">
                <span className="text-base sm:text-lg">✏️</span>
                Formula:
              </label>
              <div
                ref={mathFieldRef}
                className="mathquill-formula-field w-full border-2 border-gray-300 rounded-lg bg-white shadow-sm hover:border-blue-400 hover:shadow-md focus-within:border-blue-500 focus-within:ring-2 sm:focus-within:ring-4 focus-within:ring-blue-100 transition-all"
              />
              <p className="text-xs text-gray-500 mt-2 sm:mt-3 flex items-center gap-1.5">
                <span>💡</span>
                <span className="hidden sm:inline">Yuqoridagi tugmalarni bosing yoki klaviaturadan yozing</span>
                <span className="sm:hidden">Tugmalarni bosing</span>
              </p>
            </div>

            {/* Footer */}
            <div className="p-2 sm:p-3 border-t bg-gray-50 flex gap-2 justify-end items-center">
              <button
                type="button"
                onClick={handleSave}
                className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all font-medium"
              >
                Saqlash
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg transition-all font-medium"
              >
                Yopish
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );

  return createPortal(content, document.body);
}
