import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Loader2, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { useToast } from '@/hooks/useToast';

interface RegularTestImportFormProps {
  parsedQuestions: any[];
  onConfirm: (data: RegularTestFormData) => Promise<void>;
  onCancel: () => void;
  isProcessing: boolean;
}

export interface RegularTestFormData {
  testName: string;
  groupId: string;
  subjectId: string;
  classNumber: number;
}

export function RegularTestImportForm({
  parsedQuestions,
  onConfirm,
  onCancel,
  isProcessing,
}: RegularTestImportFormProps) {
  const { error: showErrorToast } = useToast();
  const [testName, setTestName] = useState('Yuklangan test');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groups, setGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    setLoadingGroups(true);
    try {
      const { data } = await api.get('/groups');
      setGroups(data);
    } catch (err) {
      console.error('Error loading groups:', err);
      setError('Guruhlarni yuklashda xatolik');
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleSubmit = async () => {
    // Validation
    if (!selectedGroupId) {
      setError('Iltimos, guruhni tanlang');
      showErrorToast('Iltimos, guruhni tanlang');
      return;
    }

    if (!testName.trim()) {
      setError('Iltimos, test nomini kiriting');
      showErrorToast('Iltimos, test nomini kiriting');
      return;
    }

    setError('');

    const selectedGroup = groups.find((g) => g._id === selectedGroupId);

    await onConfirm({
      testName,
      groupId: selectedGroupId,
      subjectId: selectedGroup?.subjectId?._id || selectedGroup?.subjectId,
      classNumber: selectedGroup?.classNumber || 7,
    });
  };

  return (
    <div className="space-y-6">
      {/* Form Header */}
      <div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">
          Oddiy test ma'lumotlari
        </h3>
        <p className="text-sm text-gray-600">
          Test nomini va guruhni tanlang
        </p>
      </div>

      {/* Form Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Test Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Test nomi <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={testName}
            onChange={(e) => setTestName(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Masalan: Matematika test №1"
            disabled={isProcessing}
          />
        </div>

        {/* Group Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Guruh <span className="text-red-500">*</span>
          </label>
          {loadingGroups ? (
            <div className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm text-gray-600">Yuklanmoqda...</span>
            </div>
          ) : groups.length === 0 ? (
            <div className="px-4 py-3 border border-amber-300 rounded-lg bg-amber-50">
              <p className="text-sm text-amber-800">
                Sizda guruhlar yo'q. Avval guruh yarating.
              </p>
            </div>
          ) : (
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={isProcessing}
            >
              <option value="">Guruhni tanlang</option>
              {groups.map((group) => (
                <option key={group._id} value={group._id}>
                  {group.name} - {group.subjectId?.nameUzb || "Fan ko'rsatilmagan"}
                </option>
              ))}
            </select>
          )}
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
