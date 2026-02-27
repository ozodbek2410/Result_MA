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
          'inline-flex items-center justify-center font-medium transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20',
          'disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed',
          'active:scale-[0.98]',
          {
            'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md rounded-xl': 
              variant === 'default',
            'bg-red-600 text-white hover:bg-red-700 shadow-sm hover:shadow-md rounded-xl': 
              variant === 'destructive',
            'bg-green-600 text-white hover:bg-green-700 shadow-sm hover:shadow-md rounded-xl': 
              variant === 'success',
            'bg-orange-500 text-white hover:bg-orange-600 shadow-sm hover:shadow-md rounded-xl': 
              variant === 'warning',
            'border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 text-gray-700 rounded-xl': 
              variant === 'outline',
            'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 rounded-xl': 
              variant === 'secondary',
            'hover:bg-gray-50 text-gray-700 rounded-lg': 
              variant === 'ghost',
          },
          {
            'h-10 px-4 py-2 text-sm': size === 'default',
            'h-8 px-3 text-xs': size === 'xs',
            'h-9 px-3 text-sm': size === 'sm',
            'h-12 px-8 text-base font-semibold': size === 'lg',
            'h-10 w-10 rounded-xl': size === 'icon',
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
