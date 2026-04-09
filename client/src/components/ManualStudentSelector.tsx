import { useEffect, useState, useRef } from 'react';
import { X, Search, User, CheckCircle, AlertTriangle } from 'lucide-react';
import api from '../lib/api';

interface VariantInfo {
  variantCode: string;
  superseded: boolean;
  testId: string;
  testType: string;
  testLabel: string;
}

interface StudentItem {
  studentId: string;
  fullName: string;
  classNumber: number;
  studentCode?: number;
  groupNames?: string[];
  variantCode: string | null;
  variantSuperseded: boolean;
  hasVariant: boolean;
  variants?: VariantInfo[];
}

interface ManualStudentSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  /** studentId — variantCode ixtiyoriy (bir nechta variant bo'lsa) */
  onSelect: (studentId: string, variantCode?: string) => void;
  /** Dastlabki sinf filter (optional — QR dan kelgan class) */
  initialClass?: number;
}

export function ManualStudentSelector({
  isOpen,
  onClose,
  onSelect,
  initialClass,
}: ManualStudentSelectorProps) {
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<number | null>(initialClass ?? null);
  const [groupSearch, setGroupSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void loadStudents();
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, search, classFilter, groupSearch]);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (classFilter) params.classNumber = String(classFilter);
      if (search.trim()) params.search = search.trim();
      if (groupSearch.trim()) params.groupName = groupSearch.trim();
      const response = await api.get('/omr/students-for-scan', { params });
      setStudents(response.data.students || []);
    } catch {
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">O'quvchini tanlang</h2>
              <p className="text-blue-100 text-xs">QR topilmagan varaq uchun qo'lda tanlov</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            aria-label="Yopish"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-gray-200 space-y-3">
          {/* Search by name */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="O'quvchi ismi..."
              className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              autoFocus
            />
          </div>

          {/* Search by group name (CRM dublikatlar uchun — student class noto'g'ri bo'lsa, guruh nomi orqali topiladi) */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">👥</span>
            <input
              type="text"
              value={groupSearch}
              onChange={e => setGroupSearch(e.target.value)}
              placeholder="Guruh nomi (masalan: 6-03)"
              className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>

          {/* Class filter */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setClassFilter(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                classFilter === null
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Barchasi
            </button>
            {[5, 6, 7, 8, 9, 10, 11].map(n => (
              <button
                key={n}
                onClick={() => setClassFilter(n)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  classFilter === n
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {n}-sinf
              </button>
            ))}
          </div>
        </div>

        {/* Student list */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-8 text-center text-gray-500 text-sm">Yuklanmoqda...</div>
          )}
          {!loading && students.length === 0 && (
            <div className="p-8 text-center text-gray-500 text-sm">
              O'quvchi topilmadi
            </div>
          )}
          {!loading && students.length > 0 && (
            <div className="divide-y divide-gray-100">
              {students.map(s => {
                const hasMultiple = (s.variants?.length || 0) > 1;
                return (
                  <div key={s.studentId} className={`p-3 sm:p-4 ${!s.hasVariant ? 'opacity-60' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                          s.hasVariant
                            ? s.variantSuperseded
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {s.hasVariant ? (
                          s.variantSuperseded ? (
                            <AlertTriangle className="w-5 h-5" />
                          ) : (
                            <CheckCircle className="w-5 h-5" />
                          )
                        ) : (
                          <X className="w-5 h-5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 text-sm">
                          {s.fullName}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5 flex-wrap">
                          <span>{s.classNumber}-sinf</span>
                          {s.studentCode && <span>• ID: {s.studentCode}</span>}
                          {!s.hasVariant && <span className="text-red-500">• variant yo'q</span>}
                        </div>
                        {/* Guruh nomlari — CRM dublikatlarni aniqlash uchun */}
                        {s.groupNames && s.groupNames.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {s.groupNames.map((gn, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-semibold rounded border border-blue-200"
                              >
                                👥 {gn}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Variantlar ro'yxati — bittadan ko'p bo'lsa har birini alohida tugma */}
                    {s.hasVariant && s.variants && s.variants.length > 0 && (
                      <div className="mt-2 pl-13 space-y-1.5">
                        {hasMultiple && (
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                            {s.variants.length} ta blok testdan variant — birini tanlang:
                          </p>
                        )}
                        {s.variants.map((v, i) => (
                          <button
                            key={i}
                            onClick={() => onSelect(s.studentId, v.variantCode)}
                            className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                              v.superseded
                                ? 'bg-yellow-50 border-yellow-300 hover:bg-yellow-100'
                                : 'bg-green-50 border-green-300 hover:bg-green-100'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold text-gray-800 truncate">
                                  {v.testLabel}
                                </div>
                                <div className="text-[10px] text-gray-500 font-mono">
                                  {v.variantCode}
                                </div>
                              </div>
                              {v.superseded && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-yellow-200 text-yellow-800 rounded font-bold whitespace-nowrap">
                                  ESKIRGAN
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-600 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span>Variant bor</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <span>Eskirgan (ishlaydi)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-gray-300"></div>
            <span>Variant yo'q</span>
          </div>
        </div>
      </div>
    </div>
  );
}
