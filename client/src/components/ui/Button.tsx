import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'success' | 'warning';
  size?: 'default' | 'sm' | 'lg' | 'icon' | 'xs';
  loading?: boolean;
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', loading, fullWidth, children, disabled, ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center rounded font-medium transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed',
          {
            'bg-primary text-white hover:bg-primary-hover': 
              variant === 'default',
            'bg-red-600 text-white hover:bg-red-700': 
              variant === 'destructive',
            'bg-green-600 text-white hover:bg-green-700': 
              variant === 'success',
            'bg-orange-500 text-white hover:bg-orange-600': 
              variant === 'warning',
            'border border-gray-300 bg-white hover:bg-gray-50 text-gray-700': 
              variant === 'outline',
            'bg-gray-200 text-gray-700 hover:bg-gray-300': 
              variant === 'secondary',
            'hover:bg-gray-100 text-gray-700': 
              variant === 'ghost',
          },
          {
            'h-10 px-4 py-2 text-sm': size === 'default',
            'h-8 px-3 text-xs': size === 'xs',
            'h-9 px-3 text-sm': size === 'sm',
            'h-11 px-6 text-base': size === 'lg',
            'h-10 w-10': size === 'icon',
          },
          fullWidth && 'w-full',
          className
        )}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
