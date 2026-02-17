import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Loader2, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { useToast } from '@/hooks/useToast';

interface BlockTestImportFormProps {
  parsedQuestions: any[];
  onConfirm: (data: BlockTestFormData) => Promise<void>;
  onCancel: () => void;
  isProcessing: boolean;
}

export interface BlockTestFormData {
  classNumber: number;
  subjectId: string;
  periodMonth: number;
  periodYear: number;
}

export function BlockTestImportForm({
  parsedQuestions,
  onConfirm,
  onCancel,
  isProcessing,
}: BlockTestImportFormProps) {
  const { error: showErrorToast } = useToast();
  const [classNumber, setClassNumber] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [error, setError] = useState('');

  const [periodMonth, setPeriodMonth] = useState(new Date().getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());

  useEffect(() => {
    loadSubjects();
  }, []);

  const loadSubjects = async () => {
    setLoadingSubjects(true);
    try {
      const { data } = await api.get('/subjects');
      setSubjects(data);
    } catch (err) {
      console.error('Error loading subjects:', err);
      setError('Fanlarni yuklashda xatolik');
    } finally {
      setLoadingSubjects(false);
    }
  };

  const handleSubmit = async () => {
    // Validation
    if (!classNumber) {
      setError('Iltimos, sinfni tanlang');
      showErrorToast('Iltimos, sinfni tanlang');
      return;
    }

    if (!selectedSubjectId) {
      setError('Iltimos, fanni tanlang');
      showErrorToast('Iltimos, fanni tanlang');
      return;
    }

    if (!periodMonth || !periodYear) {
      setError('Iltimos, davrni tanlang');
      showErrorToast('Iltimos, davrni tanlang');
      return;
    }

    setError('');

    await onConfirm({
      classNumber: parseInt(classNumber),
      subjectId: selectedSubjectId,
      periodMonth,
      periodYear,
    });
  };

  const months = [
    { value: 1, label: 'Yanvar' },
    { value: 2, label: 'Fevral' },
    { value: 3, label: 'Mart' },
    { value: 4, label: 'Aprel' },
    { value: 5, label: 'May' },
    { value: 6, label: 'Iyun' },
    { value: 7, label: 'Iyul' },
    { value: 8, label: 'Avgust' },
    { value: 9, label: 'Sentabr' },
    { value: 10, label: 'Oktabr' },
    { value: 11, label: 'Noyabr' },
    { value: 12, label: 'Dekabr' },
  ];

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <div className="space-y-6">
      {/* Form Header */}
      <div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">
          Blok test ma'lumotlari
        </h3>
        <p className="text-sm text-gray-600">
          Sinf, fan va davrni tanlang
        </p>
      </div>

      {/* Form Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Class Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Sinf <span className="text-red-500">*</span>
          </label>
          <select
            value={classNumber}
            onChange={(e) => setClassNumber(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            disabled={isProcessing}
          >
            <option value="">Sinfni tanlang</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((num) => (
              <option key={num} value={num}>
                {num}-sinf
              </option>
            ))}
          </select>
        </div>

        {/* Subject Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Fan <span className="text-red-500">*</span>
          </label>
          {loadingSubjects ? (
            <div className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm text-gray-600">Yuklanmoqda...</span>
            </div>
          ) : subjects.length === 0 ? (
            <div className="px-4 py-3 border border-amber-300 rounded-lg bg-amber-50">
              <p className="text-sm text-amber-800">
                Fanlar topilmadi
              </p>
            </div>
          ) : (
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              disabled={isProcessing}
            >
              <option value="">Fanni tanlang</option>
              {subjects.map((subject) => (
                <option key={subject._id} value={subject._id}>
                  {subject.nameUzb}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Period Month */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Oy <span className="text-red-500">*</span>
          </label>
          <select
            value={periodMonth}
            onChange={(e) => setPeriodMonth(parseInt(e.target.value))}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            disabled={isProcessing}
          >
            {months.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </div>

        {/* Period Year */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Yil <span className="text-red-500">*</span>
          </label>
          <select
            value={periodYear}
            onChange={(e) => setPeriodYear(parseInt(e.target.value))}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            disabled={isProcessing}
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Submit Buttons */}
      <div className="flex gap-3 pt-4">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isProcessing}
          size="lg"
        >
          Bekor qilish
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isProcessing || parsedQuestions.length === 0}
          loading={isProcessing}
          className="flex-1"
          size="lg"
        >
          Tasdiqlash va saqlash ({parsedQuestions.length} ta savol)
        </Button>
      </div>
    </div>
  );
}
