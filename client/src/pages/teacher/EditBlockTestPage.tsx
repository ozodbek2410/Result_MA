import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ArrowLeft, Save, Trash2, Edit2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export default function EditBlockTestPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [blockTest, setBlockTest] = useState<any>(null);
  const [classNumber, setClassNumber] = useState('');
  const [periodMonth, setPeriodMonth] = useState('');
  const [periodYear, setPeriodYear] = useState('');

  useEffect(() => {
    loadBlockTest();
  }, [id]);

  const loadBlockTest = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/block-tests/${id}`);
      
      // Используем данные, которые уже пришли с сервера
      const allSubjects: any[] = [];
      
      if (data.subjectTests && Array.isArray(data.subjectTests)) {
        data.subjectTests.forEach((st: any) => {
          if (st.subjectId) {
            allSubjects.push({
              ...st,
              testId: data._id
            });
          }
        });
      }
      
      // Создаем блок-тест для отображения
      const mergedBlockTest = {
        ...data,
        subjectTests: allSubjects,
        allTestIds: [data._id]
      };
      
      setBlockTest(mergedBlockTest);
      setClassNumber(data.classNumber?.toString() || '');
      
      // Если периода нет, используем дату создания или текущую дату
      if (data.periodMonth && data.periodYear) {
        setPeriodMonth(data.periodMonth.toString());
        setPeriodYear(data.periodYear.toString());
      } else {
        // Извлекаем период из даты теста
        const testDate = data.date ? new Date(data.date) : new Date();
        setPeriodMonth((testDate.getMonth() + 1).toString());
        setPeriodYear(testDate.getFullYear().toString());
      }
    } catch (error) {
      console.error('❌ Error loading block test:', error);
      alert('Testni yuklashda xatolik yuz berdi');
      navigate('/teacher/block-tests');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.put(`/block-tests/${id}`, {
        classNumber: parseInt(classNumber),
        periodMonth: parseInt(periodMonth),
        periodYear: parseInt(periodYear)
      });
      alert('Test muvaffaqiyatli saqlandi');
      navigate('/teacher/block-tests');
    } catch (error) {
      console.error('Error saving block test:', error);
      alert('Testni saqlashda xatolik yuz berdi');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSubject = async (subjectIndex: number) => {
    const subject = blockTest.subjectTests[subjectIndex];
    const subjectName = subject.subjectId?.nameUzb || 'Fan';
    const testId = subject.testId; // ID теста, которому принадлежит этот предмет
    const questionCount = subject.questions?.length || 0;
    
    if (!confirm(`${subjectName} fanini o'chirmoqchimisiz?\n(${questionCount} ta savol)\n\nBu amalni qaytarib bo'lmaydi!`)) {
      return;
    }

    try {
      setSaving(true);
      
      // Загружаем оригинальный тест
      const { data: testData } = await api.get(`/block-tests/${testId}`);
      
      // Находим индекс КОНКРЕТНОГО предмета в оригинальном тесте
      // Используем более точное сравнение - по subjectId И количеству вопросов
      const originalSubjectIndex = testData.subjectTests.findIndex((st: any, idx: number) => {
        const sameSubject = (st.subjectId._id || st.subjectId) === (subject.subjectId._id || subject.subjectId);
        const sameQuestionCount = st.questions?.length === subject.questions?.length;
        
        // Если это тот же предмет и то же количество вопросов
        if (sameSubject && sameQuestionCount) {
          // Дополнительная проверка: сравниваем первый вопрос (если есть)
          if (st.questions?.length > 0 && subject.questions?.length > 0) {
            const sameFirstQuestion = st.questions[0].text === subject.questions[0].text;
            return sameFirstQuestion;
          }
          return true;
        }
        return false;
      });
      
      if (originalSubjectIndex === -1) {
        alert('Предмет не найден в оригинальном тесте');
        return;
      }
      
      // Если в тесте только один предмет, удаляем весь тест
      if (testData.subjectTests.length === 1) {
        await api.delete(`/block-tests/${testId}`);
        alert(`${subjectName} fani va uning testi muvaffaqiyatli o'chirildi`);
      } else {
        // Удаляем только КОНКРЕТНЫЙ предмет по индексу
        const updatedSubjectTests = testData.subjectTests.filter((_: any, idx: number) => 
          idx !== originalSubjectIndex
        );
        
        await api.put(`/block-tests/${testId}`, {
          subjectTests: updatedSubjectTests
        });
        
        alert(`${subjectName} fani muvaffaqiyatli o'chirildi (${questionCount} ta savol)`);
      }
      
      // Reload block test (без регенерации вариантов - это слишком медленно)
      await loadBlockTest();
    } catch (error) {
      console.error('❌ Error deleting subject:', error);
      alert('Fanni o\'chirishda xatolik yuz berdi');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
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
            <h1 className="text-3xl font-bold text-gray-900">Blok testni tahrirlash</h1>
            <p className="text-gray-600 mt-1">Test ma'lumotlarini o'zgartirish</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saqlanmoqda...' : 'Saqlash'}
        </Button>
      </div>

      {/* Edit Form */}
      <Card className="border-0 shadow-soft">
        <CardHeader>
          <CardTitle>Asosiy ma'lumotlar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sinf <span className="text-red-500">*</span>
            </label>
            <Input
              type="number"
              value={classNumber}
              onChange={(e) => setClassNumber(e.target.value)}
              placeholder="Masalan: 9"
              min="1"
              max="11"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Davr (период) <span className="text-red-500">*</span>
            </label>
            <Input
              type="month"
              value={`${periodYear}-${String(periodMonth).padStart(2, '0')}`}
              onChange={(e) => {
                const [year, month] = e.target.value.split('-');
                setPeriodYear(year);
                setPeriodMonth(month);
              }}
            />
            <p className="text-xs text-gray-500 mt-1">
              Testlar shu davr bo'yicha guruhlashadi
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Subjects Info */}
      <Card className="border-0 shadow-soft">
        <CardHeader>
          <CardTitle>Fanlar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {blockTest?.subjectTests?.map((st: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex-1">
                  <span className="font-medium">{st.subjectId?.nameUzb || 'Fan'}</span>
                  {st.groupLetter && (
                    <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                      {st.groupLetter} guruh
                    </span>
                  )}
                  {!st.groupLetter && (
                    <span className="ml-2 px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded-full">
                      Umumiy
                    </span>
                  )}
                  <span className="text-sm text-gray-600 ml-3">{st.questions?.length || 0} ta savol</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/teacher/block-tests/${st.testId}/edit-subject/${blockTest.subjectTests.findIndex((s: any) => s.testId === st.testId && s.subjectId?._id === st.subjectId?._id)}`)}
                  >
                    <Edit2 className="w-4 h-4 mr-1" />
                    Tahrirlash
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteSubject(idx)}
                    disabled={saving}
                    className="text-red-600 hover:text-red-700 hover:border-red-300"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
            
            {(!blockTest?.subjectTests || blockTest.subjectTests.length === 0) && (
              <p className="text-gray-500 text-center py-4">Fanlar topilmadi</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
