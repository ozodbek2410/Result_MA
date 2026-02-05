import { SelectHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, children, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-foreground mb-1.5">
            {label}
            {props.required && <span className="text-destructive ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          <select
            className={cn(
              'w-full h-10 rounded border border-gray-300 bg-background px-3 py-2 text-sm appearance-none cursor-pointer',
              'transition-colors duration-150',
              'focus:outline-none focus:ring-1 focus:ring-ring focus:border-primary',
              'hover:border-gray-400',
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/50',
              error && 'border-destructive focus:ring-destructive focus:border-destructive',
              className
            )}
            ref={ref}
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
        {error && <p className="mt-1.5 text-xs text-destructive font-medium">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';

export { Select };
