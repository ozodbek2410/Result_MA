import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  className?: string;
  gradient?: boolean;
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  breadcrumb,
  className,
  gradient = false,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'mb-4 sm:mb-6 animate-fade-in',
        className
      )}
    >
      {breadcrumb && <div className="mb-3 sm:mb-4">{breadcrumb}</div>}
      
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-3 flex-1 w-full sm:w-auto">
          {Icon && (
            <div className="flex-shrink-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center">
                <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
              </div>
            </div>
          )}
          
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold text-foreground mb-1 sm:mb-2">
              {title}
            </h1>
            {description && (
              <p className="text-sm sm:text-base text-muted-foreground max-w-3xl">
                {description}
              </p>
            )}
          </div>
        </div>
        
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

interface PageHeaderStatsProps {
  stats: Array<{
    label: string;
    value: string | number;
    icon?: LucideIcon;
    trend?: 'up' | 'down' | 'neutral';
    trendValue?: string;
  }>;
}

export function PageHeaderStats({ stats }: PageHeaderStatsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6 animate-fade-in">
      {stats.map((stat, index) => (
        <div
          key={index}
          className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4 transition-colors duration-150 hover:border-gray-300"
        >
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-xs font-medium text-muted-foreground uppercase">
              {stat.label}
            </span>
            {stat.icon && (
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center">
                <stat.icon className="w-4 h-4 text-blue-600" />
              </div>
            )}
          </div>
          <div className="flex items-end justify-between">
            <span className="text-xl sm:text-2xl font-semibold text-foreground">
              {stat.value}
            </span>
            {stat.trend && stat.trendValue && (
              <span
                className={cn(
                  'text-xs font-medium px-2 py-0.5 rounded-full border',
                  stat.trend === 'up' && 'bg-green-50 text-green-700 border-green-200',
                  stat.trend === 'down' && 'bg-red-50 text-red-700 border-red-200',
                  stat.trend === 'neutral' && 'bg-gray-100 text-gray-700 border-gray-200'
                )}
              >
                {stat.trendValue}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
