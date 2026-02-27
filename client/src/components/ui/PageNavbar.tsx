import { ReactNode } from 'react';
import { Input } from './Input';
import { Button } from './Button';
import { Search, Plus, Sparkles } from 'lucide-react';

interface PageNavbarProps {
  title: string;
  description?: string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  showSearch?: boolean;
  showAddButton?: boolean;
  addButtonText?: string;
  onAddClick?: () => void;
  addButtonIcon?: ReactNode;
  extraActions?: ReactNode;
  children?: ReactNode;
  badge?: string;
  gradient?: boolean;
}

export function PageNavbar({
  title,
  description,
  searchPlaceholder = "Qidirish...",
  searchValue = "",
  onSearchChange,
  showSearch = false,
  showAddButton = false,
  addButtonText = "Qo'shish",
  onAddClick,
  addButtonIcon,
  extraActions,
  children,
  badge,
  gradient = false
}: PageNavbarProps) {
  return (
    <div className={`relative overflow-hidden rounded-2xl ${
      gradient 
        ? 'bg-gradient-to-br from-white via-blue-50/30 to-purple-50/30' 
        : 'bg-white'
    } shadow-lg border border-gray-100`}>
      {/* Decorative elements */}
      {gradient && (
        <>
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-400/10 to-purple-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-purple-400/10 to-pink-400/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
        </>
      )}
      
      <div className="relative px-4 sm:px-6 py-4 sm:py-5">
        <div className="flex flex-col gap-4">
          {/* Top Row: Title, Description & Add Button */}
          <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent break-words">
                  {title}
                </h1>
                {badge && (
                  <span className="px-2 sm:px-3 py-1 text-xs font-semibold bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full shadow-soft flex items-center gap-1 flex-shrink-0">
                    <Sparkles className="w-3 h-3" />
                    {badge}
                  </span>
                )}
              </div>
              {description && (
                <p className="text-xs sm:text-sm text-gray-600 mt-1 sm:mt-1.5 font-medium line-clamp-2">{description}</p>
              )}
            </div>
            
            {/* Add Button - now in top row */}
            {showAddButton && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-shrink-0 w-full sm:w-auto">
                {extraActions && (
                  <div className="flex flex-wrap items-center gap-2">
                    {extraActions}
                  </div>
                )}
                <Button 
                  onClick={onAddClick} 
                  className="w-full sm:w-auto shadow-lg hover:shadow-xl transition-all"
                  size="default"
                >
                  {addButtonIcon || <Plus className="w-4 h-4 mr-2" />}
                  <span className="truncate">{addButtonText}</span>
                </Button>
              </div>
            )}
          </div>
          
          {/* Bottom Row: Search and Other Actions */}
          {(showSearch || children || (extraActions && !showAddButton)) && (
            <div className="flex flex-col sm:flex-row items-stretch gap-3">
              {/* Search */}
              {showSearch && (
                <div className="relative flex-1">
                  <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder={searchPlaceholder}
                    value={searchValue}
                    onChange={(e) => onSearchChange?.(e.target.value)}
                    className="w-full pl-10 sm:pl-12 pr-3 sm:pr-4 py-2 sm:py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm placeholder:text-gray-400 shadow-sm"
                  />
                </div>
              )}
              
              {children}
              
              {/* Extra Actions (only if no add button) */}
              {!showAddButton && extraActions && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  {extraActions}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
