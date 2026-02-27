import { useEffect, useState } from 'react';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, type = 'info', duration = 3000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const icons = {
    success: CheckCircle2,
    error: AlertCircle,
    info: Info,
    warning: AlertTriangle,
  };

  const Icon = icons[type];

  return (
    <div
      className={cn(
        'fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg transition-all duration-300',
        'min-w-[300px] max-w-md',
        {
          'bg-green-50 border border-green-200': type === 'success',
          'bg-red-50 border border-red-200': type === 'error',
          'bg-blue-50 border border-blue-200': type === 'info',
          'bg-yellow-50 border border-yellow-200': type === 'warning',
        },
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      )}
    >
      <Icon
        className={cn('w-5 h-5 flex-shrink-0', {
          'text-green-600': type === 'success',
          'text-red-600': type === 'error',
          'text-blue-600': type === 'info',
          'text-yellow-600': type === 'warning',
        })}
      />
      <p
        className={cn('flex-1 text-sm font-medium', {
          'text-green-900': type === 'success',
          'text-red-900': type === 'error',
          'text-blue-900': type === 'info',
          'text-yellow-900': type === 'warning',
        })}
      >
        {message}
      </p>
      <button
        onClick={() => {
          setIsVisible(false);
          setTimeout(onClose, 300);
        }}
        className="p-1 hover:bg-black/5 rounded transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
