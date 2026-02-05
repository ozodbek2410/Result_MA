import { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AlertProps {
  variant?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
  icon?: boolean;
}

const variantConfig = {
  info: {
    container: 'bg-blue-50 border-blue-200 text-blue-900',
    icon: Info,
    iconBg: 'bg-gradient-to-br from-blue-500 to-blue-600',
    iconColor: 'text-white',
  },
  success: {
    container: 'bg-green-50 border-green-200 text-green-900',
    icon: CheckCircle2,
    iconBg: 'bg-gradient-to-br from-green-500 to-green-600',
    iconColor: 'text-white',
  },
  warning: {
    container: 'bg-orange-50 border-orange-200 text-orange-900',
    icon: AlertTriangle,
    iconBg: 'bg-gradient-to-br from-orange-500 to-orange-600',
    iconColor: 'text-white',
  },
  error: {
    container: 'bg-red-50 border-red-200 text-red-900',
    icon: AlertCircle,
    iconBg: 'bg-gradient-to-br from-red-500 to-red-600',
    iconColor: 'text-white',
  },
};

export function Alert({
  variant = 'info',
  title,
  children,
  onClose,
  className,
  icon = true,
}: AlertProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'relative rounded-2xl border-2 p-5 animate-slide-down shadow-md',
        config.container,
        className
      )}
    >
      <div className="flex items-start gap-4">
        {icon && (
          <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg', config.iconBg)}>
            <Icon className={cn('w-6 h-6', config.iconColor)} />
          </div>
        )}
        
        <div className="flex-1 min-w-0 pt-1">
          {title && (
            <h4 className="font-bold mb-2 text-base">
              {title}
            </h4>
          )}
          <div className="text-sm leading-relaxed">
            {children}
          </div>
        </div>
        
        {onClose && (
          <button
            onClick={onClose}
            className={cn(
              'flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200',
              'hover:bg-black/10 hover:rotate-90'
            )}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
