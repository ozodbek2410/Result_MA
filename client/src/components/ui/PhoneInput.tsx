import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface PhoneInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  error?: string;
  value?: string;
  onChange?: (value: string) => void;
}

const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, label, error, value = '', onChange, ...props }, ref) => {
    const formatPhoneNumber = (input: string): string => {
      // Удаляем все нецифровые символы
      const digits = input.replace(/\D/g, '');
      
      // Если начинается с 998, оставляем как есть
      // Если начинается с 8, заменяем на 998
      // Иначе добавляем 998
      let cleaned = digits;
      if (cleaned.startsWith('998')) {
        cleaned = cleaned.slice(3);
      } else if (cleaned.startsWith('8')) {
        cleaned = cleaned.slice(1);
      }
      
      // Ограничиваем до 9 цифр (после +998)
      cleaned = cleaned.slice(0, 9);
      
      // Форматируем: +998 (XX) XXX-XX-XX
      let formatted = '+998';
      
      if (cleaned.length > 0) {
        formatted += ' (' + cleaned.slice(0, 2);
        if (cleaned.length > 2) {
          formatted += ') ' + cleaned.slice(2, 5);
          if (cleaned.length > 5) {
            formatted += '-' + cleaned.slice(5, 7);
            if (cleaned.length > 7) {
              formatted += '-' + cleaned.slice(7, 9);
            }
          }
        } else if (cleaned.length === 2) {
          formatted += ')';
        }
      }
      
      return formatted;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target.value;
      const formatted = formatPhoneNumber(input);
      onChange?.(formatted);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Разрешаем: backspace, delete, tab, escape, enter
      if ([8, 9, 27, 13, 46].includes(e.keyCode) ||
        // Разрешаем: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
        (e.keyCode === 65 && e.ctrlKey === true) ||
        (e.keyCode === 67 && e.ctrlKey === true) ||
        (e.keyCode === 86 && e.ctrlKey === true) ||
        (e.keyCode === 88 && e.ctrlKey === true) ||
        // Разрешаем: home, end, left, right
        (e.keyCode >= 35 && e.keyCode <= 39)) {
        return;
      }
      
      // Запрещаем все кроме цифр
      if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
        e.preventDefault();
      }
    };

    return (
      <div className="space-y-1">
        {label && (
          <label className="block text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <input
          type="tel"
          ref={ref}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="+998 (XX) XXX-XX-XX"
          className={cn(
            'w-full px-3 py-2 border border-gray-300 rounded-lg',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
            'disabled:bg-gray-100 disabled:cursor-not-allowed',
            'placeholder:text-gray-400',
            error && 'border-red-500 focus:ring-red-500',
            className
          )}
          {...props}
        />
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
      </div>
    );
  }
);

PhoneInput.displayName = 'PhoneInput';

export { PhoneInput };
