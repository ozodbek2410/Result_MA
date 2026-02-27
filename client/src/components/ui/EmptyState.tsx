import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-12 sm:py-16 px-4 animate-fade-in">
      <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-primary/10 to-secondary/10 mb-4 sm:mb-6 shadow-soft hover:scale-110 transition-transform duration-300">
        <Icon className="w-8 h-8 sm:w-10 sm:h-10 text-primary" />
      </div>
      <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 sm:mb-3">{title}</h3>
      <p className="text-sm sm:text-base text-gray-600 mb-6 sm:mb-8 max-w-md mx-auto leading-relaxed">{description}</p>
      {action && (
        <Button onClick={action.onClick} size="lg" className="shadow-medium hover:shadow-glow-primary w-full sm:w-auto">
          {action.label}
        </Button>
      )}
    </div>
  );
}
