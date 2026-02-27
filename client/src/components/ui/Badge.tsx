import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Badge({ children, variant = 'default', size = 'md', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        {
          'bg-blue-50 text-blue-700 border border-blue-200': variant === 'default',
          'bg-green-50 text-green-700 border border-green-200': variant === 'success',
          'bg-orange-50 text-orange-700 border border-orange-200': variant === 'warning',
          'bg-red-50 text-red-700 border border-red-200': variant === 'danger',
          'bg-blue-50 text-blue-600 border border-blue-200': variant === 'info',
          'bg-purple-50 text-purple-700 border border-purple-200': variant === 'purple',
          'bg-gray-100 text-gray-700 border border-gray-200': variant === 'secondary',
          'bg-white text-gray-700 border border-gray-300': variant === 'outline',
        },
        {
          'px-2 py-0.5 text-xs': size === 'sm',
          'px-2.5 py-1 text-sm': size === 'md',
          'px-3 py-1.5 text-base': size === 'lg',
        },
        className
      )}
    >
      {children}
    </span>
  );
}
