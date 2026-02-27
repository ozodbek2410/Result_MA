import { cn } from '@/lib/utils';

interface ProgressProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'success' | 'warning' | 'error' | 'gradient';
  showLabel?: boolean;
  className?: string;
  animated?: boolean;
}

const sizeConfig = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
};

const variantConfig = {
  default: 'bg-blue-600',
  success: 'bg-green-600',
  warning: 'bg-orange-500',
  error: 'bg-red-600',
  gradient: 'bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600 bg-[length:200%_100%] animate-gradient-shift',
};

export function Progress({
  value,
  max = 100,
  size = 'md',
  variant = 'default',
  showLabel = false,
  className,
  animated = false,
}: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  // Auto-select variant based on percentage if default
  let finalVariant = variant;
  if (variant === 'default') {
    if (percentage >= 80) {
      finalVariant = 'success';
    } else if (percentage >= 60) {
      finalVariant = 'warning';
    } else {
      finalVariant = 'error';
    }
  }

  return (
    <div className={cn('w-full', className)}>
      <div className={cn('w-full bg-gray-100 rounded-full overflow-hidden', sizeConfig[size])}>
        <div
          className={cn(
            'h-full transition-all duration-500 ease-out rounded-full',
            variantConfig[finalVariant],
            animated && 'animate-pulse'
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <div className="mt-2 text-sm font-medium text-gray-600 text-right">
          {Math.round(percentage)}%
        </div>
      )}
    </div>
  );
}

interface CircularProgressProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  variant?: 'default' | 'success' | 'warning' | 'error';
  showLabel?: boolean;
  className?: string;
}

export function CircularProgress({
  value,
  max = 100,
  size = 120,
  strokeWidth = 8,
  variant = 'default',
  showLabel = true,
  className,
}: CircularProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  const colorConfig = {
    default: 'stroke-blue-600',
    success: 'stroke-green-600',
    warning: 'stroke-orange-500',
    error: 'stroke-red-600',
  };

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-gray-100"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn('transition-all duration-500 ease-out', colorConfig[variant])}
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold text-gray-900">
            {Math.round(percentage)}%
          </span>
        </div>
      )}
    </div>
  );
}
