import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border shadow-soft">
      <div className="overflow-x-auto">
        <table className={cn('w-full', className)}>{children}</table>
      </div>
    </div>
  );
}

export function TableHeader({ children }: { children: ReactNode }) {
  return <thead className="bg-muted/50 border-b border-border">{children}</thead>;
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border bg-card">{children}</tbody>;
}

export function TableRow({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn('hover:bg-muted/30 transition-colors duration-150', className)}>{children}</tr>;
}

export function TableHead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th className={cn('px-4 sm:px-6 py-3 sm:py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider', className)}>
      {children}
    </th>
  );
}

export function TableCell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td className={cn('px-4 sm:px-6 py-3 sm:py-4 text-sm text-foreground', className)}>
      {children}
    </td>
  );
}

// Mobile-friendly card view for tables
interface MobileCardProps {
  children: ReactNode;
  className?: string;
}

export function MobileCard({ children, className }: MobileCardProps) {
  return (
    <div className={cn(
      'lg:hidden bg-card border border-border rounded-xl p-4 shadow-soft hover:shadow-medium transition-all duration-200',
      className
    )}>
      {children}
    </div>
  );
}

export function MobileCardRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex justify-between items-center py-2 border-b border-border/50 last:border-0', className)}>
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-sm text-foreground font-medium">{children}</span>
    </div>
  );
}
