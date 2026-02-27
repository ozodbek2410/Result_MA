import { Settings, User, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from './Button';
import { useState, memo, useCallback } from 'react';

interface StudentCardProps {
  student: {
    _id: string;
    fullName: string;
    isGraduated?: boolean;
    directionId?: {
      nameUzb?: string;
    };
    [key: string]: any;
  };
  config?: {
    subjects?: any[];
    totalQuestions?: number;
    [key: string]: any;
  };
  onConfigure?: (student: any) => void;
  showConfigButton?: boolean;
  compact?: boolean;
  index?: number;
  expandable?: boolean;
}

export function StudentCard({
  student,
  config,
  onConfigure,
  showConfigButton = true,
  compact = false,
  index = 0,
  expandable = true,
}: StudentCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasConfig = !!config;
  const initials = student.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleCardClick = useCallback(() => {
    if (expandable && config?.subjects && config.subjects.length > 0) {
      setIsExpanded(!isExpanded);
    }
  }, [expandable, config?.subjects, isExpanded]);

  const handleStudentClick = useCallback((e: React.MouseEvent) => {
    // Если есть onConfigure, открываем модальное окно
    if (onConfigure) {
      e.stopPropagation();
      onConfigure(student);
    }
  }, [onConfigure, student]);

  const handleConfigureClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onConfigure) {
      onConfigure(student);
    }
  }, [onConfigure, student]);

  if (compact) {
    return (
      <div
        className={`flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg transition-all duration-200 ${
          student.isGraduated 
            ? 'bg-gray-100 opacity-60' 
            : 'hover:bg-gray-50/50'
        }`}
        style={{ animationDelay: `${index * 20}ms` }}
      >
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shadow-sm ${
            student.isGraduated
              ? 'bg-gradient-to-br from-gray-400 to-gray-500'
              : 'bg-gradient-to-br from-indigo-500 to-purple-500'
          }`}>
            <span className="text-white font-semibold text-[10px] sm:text-xs">{initials}</span>
          </div>
          {hasConfig && !student.isGraduated && (
            <div className="absolute -top-0.5 sm:-top-1 -right-0.5 sm:-right-1 w-3 h-3 sm:w-4 sm:h-4 bg-green-500 rounded-full flex items-center justify-center border-2 border-white">
              <Check className="w-1.5 h-1.5 sm:w-2.5 sm:h-2.5 text-white" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className={`text-xs sm:text-sm font-medium truncate ${
            student.isGraduated ? 'text-gray-500' : 'text-gray-900'
          }`}>
            {student.fullName}
            {student.isGraduated && (
              <span className="ml-1.5 sm:ml-2 text-[10px] sm:text-xs bg-gray-200 text-gray-600 px-1.5 sm:px-2 py-0.5 rounded">
                Bitiruvchi
              </span>
            )}
          </p>
          {config && (
            <p className="text-[10px] sm:text-xs text-gray-500">
              {config.subjects?.length || 0} fan • {config.totalQuestions || 0} savol
            </p>
          )}
        </div>

        {/* Action */}
        {showConfigButton && onConfigure && !student.isGraduated && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleConfigureClick}
            className="flex-shrink-0"
          >
            <Settings className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`border-b border-gray-100 last:border-0 transition-all duration-200 ${
        student.isGraduated ? 'bg-gray-50 opacity-70' : ''
      }`}
      style={{ animationDelay: `${index * 30}ms` }}
    >
      {/* Main Card */}
      <div
        className={`p-3 sm:p-4 transition-all duration-200 ${
          student.isGraduated ? '' : 'hover:bg-gray-50/50'
        }`}
      >
        <div className="flex items-center justify-between gap-3 sm:gap-4">
          {/* Student Info - кликабельная область */}
          <div 
            className={`flex items-center gap-2 sm:gap-3 flex-1 min-w-0 ${
              student.isGraduated ? 'cursor-default' : 'cursor-pointer'
            }`}
            onClick={student.isGraduated ? undefined : handleStudentClick}
          >
            {/* Expand indicator */}
            <div 
              className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
              onClick={(e) => {
                if (!student.isGraduated) {
                  e.stopPropagation();
                  handleCardClick();
                }
              }}
            >
              {expandable && config?.subjects && config.subjects.length > 0 && !student.isGraduated ? (
                isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )
              ) : (
                <div className="w-4 h-4" /> // Пустое место для выравнивания
              )}
            </div>

            {/* Avatar with status */}
            <div className="relative flex-shrink-0">
              <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shadow-sm ${
                student.isGraduated
                  ? 'bg-gradient-to-br from-gray-400 to-gray-500'
                  : 'bg-gradient-to-br from-indigo-500 to-purple-500'
              }`}>
                <span className="text-white font-semibold text-xs sm:text-sm">{initials}</span>
              </div>
              {hasConfig && !student.isGraduated && (
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-500 rounded-full border-2 border-white" />
              )}
            </div>

            {/* Name and details */}
            <div className="flex-1 min-w-0">
              <h3 className={`text-sm sm:text-base font-semibold truncate transition-colors ${
                student.isGraduated 
                  ? 'text-gray-500' 
                  : 'text-gray-900 hover:text-indigo-600'
              }`}>
                {student.fullName}
                {student.isGraduated && (
                  <span className="ml-1.5 sm:ml-2 text-[10px] sm:text-xs bg-gray-200 text-gray-600 px-1.5 sm:px-2 py-0.5 rounded">
                    Bitiruvchi
                  </span>
                )}
              </h3>
              {config && (
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                  {config.subjects?.length || 0} fan • {config.totalQuestions || 0} savol
                </p>
              )}
            </div>
          </div>

          {/* Configure Button - всегда видна */}
          {showConfigButton && onConfigure && !student.isGraduated && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleConfigureClick}
              className="flex-shrink-0 hidden sm:flex"
            >
              <Settings className="w-4 h-4 mr-1.5" />
              Sozlash
            </Button>
          )}
          {showConfigButton && onConfigure && !student.isGraduated && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleConfigureClick}
              className="flex-shrink-0 sm:hidden"
            >
              <Settings className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && config?.subjects && config.subjects.length > 0 && (
        <div className="px-3 sm:px-4 pb-3 sm:pb-4 bg-gray-50/30 border-t border-gray-100">
          <div className="pt-2.5 sm:pt-3 space-y-2">
            {/* Direction */}
            {student.directionId?.nameUzb && (
              <div className="flex items-center gap-2 text-xs sm:text-sm">
                <span className="text-gray-500">Yo'nalish:</span>
                <span className="font-medium text-gray-900">
                  {student.directionId.nameUzb}
                </span>
              </div>
            )}

            {/* Subjects */}
            <div>
              <p className="text-xs sm:text-sm text-gray-500 mb-2">Fanlar:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {config.subjects.map((subject: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 sm:p-2.5 bg-white border border-gray-200 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-xs sm:text-sm truncate">
                        {subject.subjectId?.nameUzb || 'Fan'}
                      </p>
                      {subject.isAdditional && (
                        <p className="text-[10px] sm:text-xs text-purple-600 mt-0.5">Qo'shimcha</p>
                      )}
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-gray-700 ml-2">
                      {subject.questionCount} ta
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Memoize StudentCard to prevent unnecessary re-renders
const MemoizedStudentCard = memo(StudentCard, (prevProps, nextProps) => {
  return (
    prevProps.student._id === nextProps.student._id &&
    prevProps.config === nextProps.config &&
    prevProps.showConfigButton === nextProps.showConfigButton &&
    prevProps.compact === nextProps.compact &&
    prevProps.index === nextProps.index &&
    prevProps.expandable === nextProps.expandable
  );
});

/**
 * Список студентов с упрощенным дизайном
 */
export function StudentList({
  students,
  configs,
  onConfigure,
  compact = false,
  emptyMessage = "O'quvchilar topilmadi",
}: {
  students: any[];
  configs?: Map<string, any> | Record<string, any>;
  onConfigure?: (student: any) => void;
  compact?: boolean;
  emptyMessage?: string;
}) {
  const getConfig = (studentId: string) => {
    if (!configs) return undefined;
    if (configs instanceof Map) {
      return configs.get(studentId);
    }
    return configs[studentId];
  };

  if (students.length === 0) {
    return (
      <div className="text-center py-8 sm:py-12">
        <User className="w-10 h-10 sm:w-12 sm:h-12 text-gray-300 mx-auto mb-2 sm:mb-3" />
        <p className="text-sm sm:text-base text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-1' : 'divide-y divide-gray-100'}>
      {students.map((student, index) => (
        <MemoizedStudentCard
          key={student._id}
          student={student}
          config={getConfig(student._id)}
          onConfigure={onConfigure}
          compact={compact}
          index={index}
        />
      ))}
    </div>
  );
}
