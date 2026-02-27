interface SkeletonCardProps {
  variant?: 'default' | 'stats' | 'list' | 'grid' | 'test' | 'blocktest' | 'student';
  count?: number;
}

export function SkeletonCard({ variant = 'default', count = 1 }: SkeletonCardProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  if (variant === 'test') {
    return (
      <>
        {items.map((i) => (
          <div key={i} className="bg-white rounded-3xl shadow-lg border-2 border-slate-200/50 p-6">
            <div className="animate-pulse">
              {/* Icon & Actions */}
              <div className="flex items-start justify-between mb-4">
                <div className="w-14 h-14 bg-gradient-to-br from-gray-200 to-gray-300 rounded-2xl"></div>
                <div className="flex gap-1">
                  <div className="w-9 h-9 bg-gray-200 rounded-xl"></div>
                  <div className="w-9 h-9 bg-gray-200 rounded-xl"></div>
                </div>
              </div>
              
              {/* Title */}
              <div className="h-6 bg-gray-200 rounded-lg w-3/4 mb-4"></div>
              
              {/* Date */}
              <div className="flex items-center gap-2 mb-4">
                <div className="w-4 h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-32"></div>
              </div>
              
              {/* Footer */}
              <div className="pt-4 border-t border-slate-200 flex justify-end">
                <div className="w-5 h-5 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>
        ))}
      </>
    );
  }

  if (variant === 'blocktest') {
    return (
      <>
        {items.map((i) => (
          <div key={i} className="bg-white rounded-3xl shadow-lg border border-slate-200 p-6">
            <div className="animate-pulse">
              {/* Icon & Actions */}
              <div className="flex items-start justify-between mb-4">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-200 to-pink-200 rounded-2xl"></div>
                <div className="flex gap-2">
                  <div className="w-9 h-9 bg-gray-200 rounded-full"></div>
                  <div className="w-9 h-9 bg-gray-200 rounded-full"></div>
                </div>
              </div>
              
              {/* Title */}
              <div className="h-7 bg-gray-200 rounded-lg w-24 mb-4"></div>
              
              {/* Badges */}
              <div className="flex gap-2 mb-4">
                <div className="h-8 bg-gray-200 rounded-full w-20"></div>
                <div className="h-8 bg-gray-200 rounded-full w-16"></div>
              </div>
              
              {/* Footer */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gray-200 rounded"></div>
                  <div className="h-4 bg-gray-200 rounded w-24"></div>
                </div>
                <div className="w-5 h-5 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>
        ))}
      </>
    );
  }

  if (variant === 'student') {
    return (
      <>
        {items.map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="animate-pulse flex items-center gap-3">
              {/* Avatar */}
              <div className="w-12 h-12 bg-gray-200 rounded-full flex-shrink-0"></div>
              
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="h-5 bg-gray-200 rounded w-32 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-24"></div>
              </div>
              
              {/* Button */}
              <div className="w-8 h-8 bg-gray-200 rounded-lg flex-shrink-0"></div>
            </div>
          </div>
        ))}
      </>
    );
  }

  if (variant === 'stats') {
    return (
      <>
        {items.map((i) => (
          <div key={i} className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <div className="animate-pulse">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="h-3 bg-gray-200 rounded w-24 mb-3"></div>
                  <div className="h-10 bg-gray-200 rounded w-20"></div>
                </div>
                <div className="w-14 h-14 bg-gray-200 rounded-2xl"></div>
              </div>
            </div>
          </div>
        ))}
      </>
    );
  }

  if (variant === 'list') {
    return (
      <>
        {items.map((i) => (
          <div key={i} className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <div className="animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-200 rounded-xl"></div>
                <div className="flex-1">
                  <div className="h-5 bg-gray-200 rounded w-32 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-48"></div>
                </div>
                <div className="flex gap-2">
                  <div className="w-8 h-8 bg-gray-200 rounded-lg"></div>
                  <div className="w-8 h-8 bg-gray-200 rounded-lg"></div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </>
    );
  }

  if (variant === 'grid') {
    return (
      <>
        {items.map((i) => (
          <div key={i} className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <div className="animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 bg-gray-200 rounded-2xl"></div>
                <div className="flex-1">
                  <div className="h-5 bg-gray-200 rounded w-32 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-16"></div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="h-20 bg-gray-200 rounded-xl"></div>
                <div className="h-20 bg-gray-200 rounded-xl"></div>
                <div className="h-20 bg-gray-200 rounded-xl"></div>
              </div>
              <div className="pt-4 border-t border-gray-100">
                <div className="h-2 bg-gray-200 rounded-full"></div>
              </div>
            </div>
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      {items.map((i) => (
        <div key={i} className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
          <div className="animate-pulse">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-gray-200 rounded-xl"></div>
              <div className="flex gap-2">
                <div className="w-8 h-8 bg-gray-200 rounded-lg"></div>
                <div className="w-8 h-8 bg-gray-200 rounded-lg"></div>
              </div>
            </div>
            <div className="h-5 bg-gray-200 rounded w-40 mb-3"></div>
            <div className="space-y-2">
              <div className="h-3 bg-gray-200 rounded w-full"></div>
              <div className="h-3 bg-gray-200 rounded w-3/4"></div>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-8 p-6 bg-gradient-to-br from-gray-50 via-blue-50/20 to-purple-50/20 min-h-screen">
      {/* Header skeleton */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded-lg w-48 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-64"></div>
        </div>
      </div>
      
      {/* Stats skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        <SkeletonCard variant="stats" count={5} />
      </div>
      
      {/* Content skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <SkeletonCard variant="grid" count={3} />
      </div>
    </div>
  );
}
