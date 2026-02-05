import { LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'indigo' | 'pink';
  subtitle?: string;
  action?: ReactNode;
  gradient?: boolean;
}

const colorConfig = {
  blue: {
    bg: 'bg-blue-50',
    icon: 'text-blue-600',
    border: 'border-blue-200'
  },
  green: {
    bg: 'bg-green-50',
    icon: 'text-green-600',
    border: 'border-green-200'
  },
  purple: {
    bg: 'bg-purple-50',
    icon: 'text-purple-600',
    border: 'border-purple-200'
  },
  orange: {
    bg: 'bg-orange-50',
    icon: 'text-orange-600',
    border: 'border-orange-200'
  },
  red: {
    bg: 'bg-red-50',
    icon: 'text-red-600',
    border: 'border-red-200'
  },
  indigo: {
    bg: 'bg-indigo-50',
    icon: 'text-indigo-600',
    border: 'border-indigo-200'
  },
  pink: {
    bg: 'bg-pink-50',
    icon: 'text-pink-600',
    border: 'border-pink-200'
  }
};

export function StatsCard({
  title,
  value,
  icon: Icon,
  trend,
  color = 'blue',
  subtitle,
  action,
  gradient = false
}: StatsCardProps) {
  const colors = colorConfig[color];

  return (
    <div className="bg-white rounded-lg border border-gray-200 transition-colors duration-150 hover:border-gray-300">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 truncate">
              {title}
            </p>
            <div className="flex items-baseline gap-2 flex-wrap">
              <h3 className="text-3xl font-semibold text-gray-900">
                {value}
              </h3>
            </div>
            {subtitle && (
              <p className="text-sm text-gray-600 mt-2 line-clamp-1">{subtitle}</p>
            )}
            {trend && (
              <p className={`text-xs font-medium mt-2 ${
                trend.isPositive 
                  ? 'text-green-600' 
                  : 'text-red-600'
              }`}>
                <span className="opacity-60">{trend.isPositive ? '↑' : '↓'} {trend.value}</span>
              </p>
            )}
          </div>
          
          <div className={`flex-shrink-0 ${colors.bg} rounded-lg p-3 border ${colors.border}`}>
            <Icon className={`w-6 h-6 ${colors.icon}`} />
          </div>
        </div>
        
        {action && (
          <div className="pt-3 border-t border-gray-200">
            {action}
          </div>
        )}
      </div>
    </div>
  );
}
