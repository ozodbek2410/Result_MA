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
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200" onClick={closeOnOverlayClick ? onClose : undefined} />
      <div className={cn('relative bg-white rounded-2xl shadow-sm border border-gray-100 w-full mx-4 max-h-[90vh] overflow-y-auto', 
        'max-w-[95vw] sm:max-w-2xl',
        className
      )}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 p-2 hover:bg-gray-50 rounded-xl transition-colors z-10"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-5 sm:p-6 border-b border-gray-100', className)}>{children}</div>;
}

export function DialogTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('text-xl sm:text-2xl font-bold text-gray-900 pr-10 tracking-tight', className)}>{children}</h2>;
}

export function DialogContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-5 sm:p-6', className)}>{children}</div>;
}
