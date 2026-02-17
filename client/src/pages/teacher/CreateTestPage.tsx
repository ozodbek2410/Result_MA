import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/hooks/useToast';
import TestEditor from '@/components/TestEditor';
import { ArrowLeft, FileText, Save } from 'lucide-react';

export default function CreateTestPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    groupId: '',
    name: '',
    subjectId: '',
    classNumber: 7,
    questions: [] as any[]
  });
  const { success, error } = useToast();

  // Memoize onChange handler to prevent infinite re-renders
  const handleQuestionsChange = useCallback((questions: any[]) => {
    setFormData(prev => ({ ...prev, questions }));
  }, []);

  useEffect(() => {
    fetchGroups();
    if (id) {
      fetchTest(id);
    }
  }, [id]);

  const fetchGroups = async () => {
    try {
      const { data } = await api.get('/groups');
      setGroups(data);
    } catch (err) {
      console.error('Error fetching groups');
    }
  };

  const fetchTest = async (testId: string) => {
    try {
      const { data } = await api.get(`/tests/${testId}`);
      setFormData({
        groupId: data.groupId?._id || '',
        name: data.name,
        subjectId: data.subjectId?._id || '',
        classNumber: data.classNumber,
        questions: data.questions || []
      });
    } catch (err: any) {
      console.error('Error fetching test:', err);
      error('Testni yuklashda xatolik');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!formData.groupId || !formData.name) {
      error('Guruh va test nomini kiriting');
      return;
    }

    if (formData.questions.length === 0) {
      error('Kamida bitta savol qo\'shing');
      return;
    }
    
    // Validatsiya: to'g'ri javob tanlanganligini tekshirish
    const questionsWithoutAnswer = formData.questions.filter(q => !q.correctAnswer || q.correctAnswer.trim() === '');
    if (questionsWithoutAnswer.length > 0) {
      error(`${questionsWithoutAnswer.length} ta savolda to'g'ri javob tanlanmagan`);
      return;
    }
    
    setLoading(true);
    try {
      const group = groups.find(g => g._id === formData.groupId);
      if (!group) {
        error('Guruh topilmadi');
        return;
      }

      const testData = {
        groupId: formData.groupId,
        name: formData.name,
        subjectId: group.subjectId._id,
        classNumber: group.classNumber,
        questions: formData.questions
      };

      if (id) {
        await api.put(`/tests/${id}`, testData);
        success('Test muvaffaqiyatli yangilandi!');
        navigate('/teacher/tests');
      } else {
        const { data: createdTest } = await api.post('/tests', testData);
        success('Test muvaffaqiyatli yaratildi!');
        
        // Автоматически генерируем варианты для всех студентов группы
        try {
          // Получаем студентов группы
          const { data: students } = await api.get(`/students?groupId=${formData.groupId}`);
          const studentIds = students.map((s: any) => s._id);
          
          if (studentIds.length > 0) {
            // Генерируем варианты
            await api.post(`/tests/${createdTest._id}/generate-variants`, {
              studentIds
            });
          }
        } catch (variantErr) {
          console.error('Error auto-generating variants:', variantErr);
          // Не показываем ошибку пользователю, так как тест уже создан
        }
        
        navigate('/teacher/tests');
      }
    } catch (err: any) {
      console.error('Error saving test:', err);
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (!formData.groupId || !formData.name) {
        error('Guruh va test nomini kiriting');
        return;
      }
      setStep(2);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-5xl mx-auto p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/teacher/tests')}
            className="shadow-sm flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 sm:mr-2" />
            <span className="hidden sm:inline">Orqaga</span>
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-sm">
                <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              {id ? 'Testni tahrirlash' : 'Yangi test yaratish'}
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Qadam {step}/2
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          {step === 1 && (
            <Card className="border-0 shadow-soft">
              <CardContent className="p-4 sm:p-6 lg:p-8">
                <div className="space-y-4 sm:space-y-6">
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4">
                      Test ma'lumotlari
                    </h2>
                    <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
                      Test nomi va guruhni tanlang
                    </p>
                  </div>

                  <Input
                    label="Test nomi"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="1-nazorat ishi"
                    className="text-base sm:text-lg"
                  />
                  
                  <Select
                    label="Guruh"
                    value={formData.groupId}
                    onChange={(e) => setFormData({ ...formData, groupId: e.target.value })}
                    required
                    className="text-base sm:text-lg"
                  >
                    <option value="">Guruhni tanlang</option>
                    {groups.map((g) => (
                      <option key={g._id} value={g._id}>
                        {g.classNumber}-{g.name} - {g.subjectId?.nameUzb || "Fan ko'rsatilmagan"}
                      </option>
                    ))}
                  </Select>

                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-4 sm:pt-6 border-t">
                    <Button 
                      type="button" 
                      onClick={handleNextStep}
                      size="lg"
                      className="shadow-medium w-full sm:w-auto"
                    >
                      Keyingi: Savollar qo'shish
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="lg"
                      onClick={() => navigate('/teacher/tests')}
                      className="w-full sm:w-auto"
                    >
                      Bekor qilish
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 2 && (
            <Card className="border-0 shadow-soft">
              <CardContent className="p-4 sm:p-6 lg:p-8">
                <div className="space-y-4 sm:space-y-6">
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4">
                      Savollar
                    </h2>
                    <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
                      Test uchun savollar qo'shing
                    </p>
                  </div>

                  <TestEditor
                    questions={formData.questions}
                    onChange={handleQuestionsChange}
                  />

                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-4 sm:pt-6 border-t">
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="lg"
                      onClick={() => setStep(1)}
                      className="w-full sm:w-auto"
                    >
                      Orqaga
                    </Button>
                    <Button 
                      type="submit" 
                      loading={loading}
                      size="lg"
                      className="shadow-medium"
                    >
                      <Save className="w-5 h-5 mr-2" />
                      {id ? 'Yangilash' : 'Yaratish'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </form>
      </div>
    </div>
  );
}
