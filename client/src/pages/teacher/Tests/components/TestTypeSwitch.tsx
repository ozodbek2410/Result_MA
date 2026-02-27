import { TestType } from '@/types/test.types';
import { cn } from '@/lib/utils';
import { FileText, Layers } from 'lucide-react';

interface TestTypeSwitchProps {
  /**
   * Current selected test type
   */
  value: TestType;
  
  /**
   * Callback when test type changes
   */
  onChange: (type: TestType) => void;
  
  /**
   * Disable the switch (e.g., during form submission)
   */
  disabled?: boolean;
  
  /**
   * Size variant
   */
  size?: 'sm' | 'md' | 'lg';
  
  /**
   * Show icons next to labels
   */
  showIcons?: boolean;
  
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * TestTypeSwitch - Toggle between Regular and Block test types
 * 
 * @example
 * ```tsx
 * const { testType, setTestType } = useTestType();
 * 
 * <TestTypeSwitch 
 *   value={testType} 
 *   onChange={setTestType}
 *   showIcons
 * />
 * ```
 */
export function TestTypeSwitch({
  value,
  onChange,
  disabled = false,
  size = 'md',
  showIcons = false,
  className,
}: TestTypeSwitchProps) {
  const isRegular = value === 'regular';
  const isBlock = value === 'block';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 p-1 bg-gray-100 rounded-xl',
        {
          'opacity-50 cursor-not-allowed': disabled,
        },
        className
      )}
      role="group"
      aria-label="Test turi tanlash"
    >
      {/* Regular Test Button */}
      <button
        type="button"
        onClick={() => !disabled && onChange('regular')}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20',
          'disabled:cursor-not-allowed',
          {
            // Active state
            'bg-white shadow-sm text-blue-600 font-semibold': isRegular,
            // Inactive state
            'text-gray-600 hover:text-gray-900 hover:bg-gray-50': !isRegular && !disabled,
          },
          {
            // Size variants
            'px-3 py-1.5 text-xs': size === 'sm',
            'px-4 py-2 text-sm': size === 'md',
            'px-6 py-3 text-base': size === 'lg',
          }
        )}
        aria-pressed={isRegular}
      >
        {showIcons && <FileText className={cn(
          'transition-all',
          {
            'w-3 h-3': size === 'sm',
            'w-4 h-4': size === 'md',
            'w-5 h-5': size === 'lg',
          }
        )} />}
        <span>Oddiy test</span>
      </button>

      {/* Block Test Button */}
      <button
        type="button"
        onClick={() => !disabled && onChange('block')}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/20',
          'disabled:cursor-not-allowed',
          {
            // Active state
            'bg-white shadow-sm text-purple-600 font-semibold': isBlock,
            // Inactive state
            'text-gray-600 hover:text-gray-900 hover:bg-gray-50': !isBlock && !disabled,
          },
          {
            // Size variants
            'px-3 py-1.5 text-xs': size === 'sm',
            'px-4 py-2 text-sm': size === 'md',
            'px-6 py-3 text-base': size === 'lg',
          }
        )}
        aria-pressed={isBlock}
      >
        {showIcons && <Layers className={cn(
          'transition-all',
          {
            'w-3 h-3': size === 'sm',
            'w-4 h-4': size === 'md',
            'w-5 h-5': size === 'lg',
          }
        )} />}
        <span>Blok test</span>
      </button>
    </div>
  );
}
