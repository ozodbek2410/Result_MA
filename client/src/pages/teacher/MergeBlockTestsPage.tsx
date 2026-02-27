import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import api from '@/lib/api';

export default function MergeBlockTestsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const handleMerge = async () => {
    if (!confirm('Bir xil sinf va davr uchun yaratilgan blok testlarni birlashtirasizmi?')) {
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const { data } = await api.post('/block-tests/merge-duplicates');
      setResult(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/teacher/block-tests')}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Orqaga
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Blok testlarni birlashtirish</h1>
          <p className="text-gray-600 mt-1">Dublikat blok testlarni birlashtirib, bir xil sinf va davr uchun bitta blok test yaratish</p>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6 space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">Bu funksiya nima qiladi?</h3>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>Bir xil sinf va davr uchun yaratilgan blok testlarni topadi</li>
            <li>Ularni bitta blok testga birlashtirib, barcha fanlarni saqlaydi</li>
            <li>Dublikat blok testlarni o'chiradi</li>
          </ul>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-900">Xatolik</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {result && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-green-900">Muvaffaqiyatli!</p>
              <p className="text-sm text-green-700 mt-1">
                {result.mergedGroups} ta guruh birlashtirildi, {result.deletedBlockTests} ta dublikat o'chirildi
              </p>
            </div>
          </div>
        )}

        <Button
          onClick={handleMerge}
          disabled={loading}
          className="w-full"
          size="lg"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Birlashtirish jarayoni...
            </>
          ) : (
            'Blok testlarni birlashtirish'
          )}
        </Button>
      </div>
    </div>
  );
}
