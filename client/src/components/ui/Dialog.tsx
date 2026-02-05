import { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  closeOnOverlayClick?: boolean;
}

export function Dialog({ open, onClose, children, className, closeOnOverlayClick = false }: DialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={closeOnOverlayClick ? onClose : undefined} />
      <div className={cn('relative bg-white rounded-xl shadow-2xl w-full mx-4 max-h-[90vh] overflow-y-auto', 
        'max-w-[95vw] sm:max-w-2xl',
        className
      )}>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 hover:bg-gray-100 rounded-lg transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-4 sm:p-6 border-b', className)}>{children}</div>;
}

export function DialogTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('text-xl sm:text-2xl font-bold text-gray-900 pr-8', className)}>{children}</h2>;
}

export function DialogContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-4 sm:p-6', className)}>{children}</div>;
}
