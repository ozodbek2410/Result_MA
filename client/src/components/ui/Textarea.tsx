import { TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helperText, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-semibold text-foreground mb-2">
            {label}
            {props.required && <span className="text-destructive ml-1">*</span>}
          </label>
        )}
        <textarea
          className={cn(
            'flex min-h-[100px] sm:min-h-[120px] w-full rounded-2xl border-2 border-input bg-background px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base',
            'placeholder:text-muted-foreground/60',
            'transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-ring/20 focus:ring-offset-0 focus:border-primary',
            'hover:border-primary/50',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/50',
            'resize-y',
            error && 'border-destructive focus:ring-destructive/20 focus:border-destructive',
            className
          )}
          ref={ref}
          {...props}
        />
        {helperText && !error && (
          <p className="mt-1.5 text-xs text-muted-foreground">{helperText}</p>
        )}
        {error && (
          <p className="mt-1.5 text-xs text-destructive font-semibold animate-slide-in-left">{error}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export { Textarea };
