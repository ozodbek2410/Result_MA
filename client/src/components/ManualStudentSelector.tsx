import { useEffect, useState, useRef } from 'react';
import { X, Search, User, CheckCircle, AlertTriangle } from 'lucide-react';
import api from '../lib/api';

interface StudentItem {
  studentId: string;
  fullName: string;
  classNumber: number;
  studentCode?: number;
  groupNames?: string[];
  variantCode: string | null;
  variantSuperseded: boolean;
  hasVariant: boolean;
}

interface ManualStudentSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (studentId: string) => void;
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
              {students.map(s => (
                <button
                  key={s.studentId}
                  onClick={() => s.hasVariant && onSelect(s.studentId)}
                  disabled={!s.hasVariant}
                  className={`w-full p-3 sm:p-4 flex items-center gap-3 text-left transition-colors ${
                    s.hasVariant
                      ? 'hover:bg-blue-50 active:bg-blue-100 cursor-pointer'
                      : 'opacity-60 cursor-not-allowed'
                  }`}
                >
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
                    <div className="font-semibold text-gray-900 text-sm truncate">
                      {s.fullName}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5 flex-wrap">
                      <span>{s.classNumber}-sinf</span>
                      {s.studentCode && <span>• ID: {s.studentCode}</span>}
                      {s.variantCode ? (
                        <span className="font-mono">• {s.variantCode}</span>
                      ) : (
                        <span className="text-red-500">• variant yo'q</span>
                      )}
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
                    {s.variantSuperseded && (
                      <div className="text-[10px] text-yellow-700 mt-0.5">
                        ⚠ Eskirgan variant — skan ishlaydi
                      </div>
                    )}
                  </div>
                </button>
              ))}
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
