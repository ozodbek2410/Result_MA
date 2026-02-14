import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/hooks/useToast';
import TestEditor from '@/components/TestEditor';
import { ArrowLeft, Save, BookOpen } from 'lucide-react';
import api from '@/lib/api';

export default function CreateBlockTestPage() {
  const navigate = useNavigate();
  const { success, error } = useToast();
  const [loading, setLoading] = useState(false);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [step, setStep] = useState(1);
  
  const [formData, setFormData] = useState({
    classNumber: 7,
    periodMonth: new Date().getMonth() + 1,
    periodYear: new Date().getFullYear(),
    subjectId: '',
    groupLetter: '', // A, B, C, D или пусто для общих
    questions: [] as any[]
  });

  // Memoize onChange handler to prevent infinite re-renders
  const handleQuestionsChange = useCallback((questions: any[]) => {
    setFormData(prev => ({ ...prev, questions }));
  }, []);

  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        const { data } = await api.get('/subjects');
        setSubjects(data);
      } catch (err) {
        console.error('Error fetching subjects:', err);
      }
    };
    fetchSubjects();
  }, []);

  const handleNextStep = () => {
    if (step === 1) {
      if (!formData.subjectId) {
        error('Fanni tanlang');
        return;
      }
      setStep(2);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.questions.length === 0) {
      error('Kamida bitta savol qo\'shing');
      return;
    }

    setLoading(true);
    try {
      const blockTestData = {
        classNumber: formData.classNumber,
        periodMonth: formData.periodMonth,
        periodYear: formData.periodYear,
        subjectTests: [{
          subjectId: formData.subjectId,
          groupLetter: formData.groupLetter || null, // Пустая строка → null
          questions: formData.questions.map((q: any, index: number) => ({
            questionNumber: index + 1,
            text: q.text || '',
            formula: q.formula,
            imageUrl: q.imageUrl,
            variants: q.variants || [],
            correctAnswer: q.correctAnswer,
            points: q.points || 1
          }))
        }]
      };

      await api.post('/block-tests', blockTestData);
      success('Blok test muvaffaqiyatli yaratildi!');
      navigate('/teacher/block-tests');
    } catch (err: any) {
      console.error('Error creating block test:', err);
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  const months = [
    'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-5xl mx-auto p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/teacher/block-tests')}
            className="shadow-sm flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 sm:mr-2" />
            <span className="hidden sm:inline">Orqaga</span>
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
                <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
              </div>
              <span className="truncate">Yangi blok test yaratish</span>
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              Qadam {step}/2
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {step === 1 && (
            <Card className="border-0 shadow-soft">
              <CardContent className="p-4 sm:p-6 lg:p-8">
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-4">
                      Blok test ma'lumotlari
                    </h2>
                    <p className="text-gray-600 mb-6">
                      Sinf, davr va fanni tanlang
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Select
                      label="Sinf"
                      value={formData.classNumber}
                      onChange={(e) => setFormData({ ...formData, classNumber: parseInt(e.target.value) })}
                      required
                      className="text-lg"
                    >
                      {[7, 8, 9, 10, 11].map(num => (
                        <option key={num} value={num}>{num}-sinf</option>
                      ))}
                    </Select>

                    <Select
                      label="Oy"
                      value={formData.periodMonth}
                      onChange={(e) => setFormData({ ...formData, periodMonth: parseInt(e.target.value) })}
                      required
                      className="text-lg"
                    >
                      {months.map((month, index) => (
                        <option key={index + 1} value={index + 1}>{month}</option>
                      ))}
                    </Select>

                    <Input
                      label="Yil"
                      type="number"
                      value={formData.periodYear}
                      onChange={(e) => setFormData({ ...formData, periodYear: parseInt(e.target.value) })}
                      required
                      min={2020}
                      max={2030}
                      className="text-lg"
                    />
                  </div>

                  <Select
                    label="Fan"
                    value={formData.subjectId}
                    onChange={(e) => setFormData({ ...formData, subjectId: e.target.value })}
                    required
                    className="text-lg"
                  >
                    <option value="">Tanlang</option>
                    {subjects.map(subject => (
                      <option key={subject._id} value={subject._id}>
                        {subject.nameUzb}
                      </option>
                    ))}
                  </Select>

                  <Select
                    label="Guruh harfi (ixtiyoriy)"
                    value={formData.groupLetter}
                    onChange={(e) => setFormData({ ...formData, groupLetter: e.target.value })}
                    className="text-lg"
                  >
                    <option value="">Umumiy (barcha guruhlar uchun)</option>
                    <option value="A">A guruh</option>
                    <option value="B">B guruh</option>
                    <option value="C">C guruh</option>
                    <option value="D">D guruh</option>
                  </Select>

                  <div className="flex gap-3 pt-6 border-t">
                    <Button 
                      type="button" 
                      onClick={handleNextStep}
                      size="lg"
                      className="shadow-medium"
                    >
                      Keyingi: Savollar qo'shish
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="lg"
                      onClick={() => navigate('/teacher/block-tests')}
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
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-4">
                      Savollar
                    </h2>
                    <p className="text-gray-600 mb-6">
                      Blok test uchun savollar qo'shing
                    </p>
                  </div>

                  <TestEditor
                    questions={formData.questions}
                    onChange={handleQuestionsChange}
                  />

                  <div className="flex gap-3 pt-6 border-t">
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="lg"
                      onClick={() => setStep(1)}
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
                      Yaratish
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
