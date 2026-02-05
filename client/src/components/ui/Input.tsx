import { InputHTMLAttributes, forwardRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, helperText, value, onChange, onBlur, min, max, ...props }, ref) => {
    const [internalValue, setInternalValue] = useState(value);
    const [lastValidValue, setLastValidValue] = useState(value);

    // Sync internal value with external value
    useEffect(() => {
      setInternalValue(value);
      if (value !== '' && value !== undefined && value !== null) {
        setLastValidValue(value);
      }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let newValue = e.target.value;
      
      // For number inputs, validate min/max constraints
      if (type === 'number' && newValue !== '') {
        const numValue = parseFloat(newValue);
        
        // Check if it's a valid number
        if (!isNaN(numValue)) {
          // Apply min constraint
          if (min !== undefined && numValue < Number(min)) {
            newValue = String(min);
          }
          // Apply max constraint
          if (max !== undefined && numValue > Number(max)) {
            newValue = String(max);
          }
        }
      }
      
      setInternalValue(newValue);
      
      // For number inputs, allow empty string temporarily
      if (type === 'number') {
        if (newValue === '') {
          // Allow empty but don't update lastValidValue
          onChange?.(e);
        } else {
          // Update both internal and last valid value
          setLastValidValue(newValue);
          // Create event with validated value
          const syntheticEvent = {
            ...e,
            target: { ...e.target, value: newValue }
          } as React.ChangeEvent<HTMLInputElement>;
          onChange?.(syntheticEvent);
        }
      } else {
        onChange?.(e);
      }
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      // For number inputs, restore last valid value if empty
      if (type === 'number' && (e.target.value === '' || e.target.value === null)) {
        setInternalValue(lastValidValue);
        // Create a synthetic event with the last valid value
        const syntheticEvent = {
          ...e,
          target: { ...e.target, value: lastValidValue as string }
        } as React.ChangeEvent<HTMLInputElement>;
        onChange?.(syntheticEvent);
      }
      onBlur?.(e);
    };

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <input
          type={type}
          value={internalValue}
          onChange={handleChange}
          onBlur={handleBlur}
          min={min}
          max={max}
          className={cn(
            'flex h-10 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm',
            'placeholder:text-gray-400',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500',
            'hover:border-gray-400',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-50',
            'file:border-0 file:bg-transparent file:text-sm file:font-medium',
            error && 'border-red-300 focus:ring-red-500 focus:border-red-500',
            className
          )}
          ref={ref}
          {...props}
        />
        {helperText && !error && (
          <p className="mt-1.5 text-xs text-gray-500">{helperText}</p>
        )}
        {error && (
          <p className="mt-1.5 text-xs text-red-600 font-medium">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };
