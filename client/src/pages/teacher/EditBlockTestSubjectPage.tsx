import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, Save, Trash2, Plus, ImagePlus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import RichTextEditor from '@/components/editor/RichTextEditor';

export default function EditBlockTestSubjectPage() {
  const { id, subjectIndex } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [blockTest, setBlockTest] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [subjectName, setSubjectName] = useState('');

  useEffect(() => {
    loadBlockTest();
  }, [id, subjectIndex]);

  const loadBlockTest = async () => {
    try {
      setLoading(true);
      
      // Загружаем блок-тест
      const { data: testData } = await api.get(`/block-tests/${id}`);
      
      // Загружаем все блок-тесты с таким же классом и датой
      const { data: allTests } = await api.get('/block-tests');
      const testDate = new Date(testData.date).toISOString().split('T')[0];
      
      // Фильтруем тесты по классу и дате
      const sameGroupTests = allTests.filter((t: any) => {
        const tDate = new Date(t.date).toISOString().split('T')[0];
        return t.classNumber === testData.classNumber && tDate === testDate;
      });
      
      console.log('📊 Found tests in same group:', sameGroupTests.length);
      
      // Объединяем все предметы из всех тестов
      const allSubjects: any[] = [];
      sameGroupTests.forEach((test: any) => {
        test.subjectTests?.forEach((st: any) => {
          if (st.subjectId) {
            allSubjects.push({
              ...st,
              testId: test._id
            });
          }
        });
      });
      
      console.log('📝 Total subjects:', allSubjects.length);
      
      // Создаем объединенный блок-тест для отображения
      const mergedBlockTest = {
        ...testData,
        subjectTests: allSubjects,
        allTestIds: sameGroupTests.map((t: any) => t._id)
      };
      
      setBlockTest(mergedBlockTest);
      
      const idx = parseInt(subjectIndex || '0');
      const subject = mergedBlockTest.subjectTests[idx];
      
      if (subject) {
        setSubjectName(subject.subjectId?.nameUzb || 'Fan');
        setQuestions(subject.questions || []);
      }
    } catch (error) {
      console.error('Error loading block test:', error);
      alert('Testni yuklashda xatolik yuz berdi');
      navigate(`/teacher/block-tests/${id}/edit`);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      const idx = parseInt(subjectIndex || '0');
      const subject = blockTest.subjectTests[idx];
      const testId = subject.testId; // ID теста, которому принадлежит этот предмет
      
      // Загружаем оригинальный тест для этого предмета
      const { data: originalTest } = await api.get(`/block-tests/${testId}`);
      
      // Находим индекс предмета в оригинальном тесте
      const originalSubjectIndex = originalTest.subjectTests.findIndex(
        (st: any) => (st.subjectId._id || st.subjectId) === (subject.subjectId._id || subject.subjectId)
      );
      
      if (originalSubjectIndex === -1) {
        alert('Предмет не найден в оригинальном тесте');
        return;
      }
      
      // Обновляем вопросы в оригинальном тесте
      const updatedSubjectTests = [...originalTest.subjectTests];
      updatedSubjectTests[originalSubjectIndex].questions = questions;
      
      await api.put(`/block-tests/${testId}`, {
        subjectTests: updatedSubjectTests
      });
      
      alert('Savollar muvaffaqiyatli saqlandi');
      navigate(`/teacher/block-tests/${id}/edit`);
    } catch (error) {
      console.error('Error saving questions:', error);
      alert('Saqlashda xatolik yuz berdi');
    } finally {
      setSaving(false);
    }
  };

  const handleQuestionChange = (index: number, field: string, value: any) => {
    const updated = [...questions];
    if (field === 'text') {
      updated[index].text = value;
    } else if (field === 'correctAnswer') {
      updated[index].correctAnswer = value;
    } else if (field === 'points') {
      updated[index].points = parseInt(value) || 1;
    }
    setQuestions(updated);
  };

  const handleVariantChange = (questionIndex: number, variantIndex: number, value: string) => {
    const updated = [...questions];
    updated[questionIndex].variants[variantIndex].text = value;
    setQuestions(updated);
  };

  const handleAddVariant = (questionIndex: number) => {
    const updated = [...questions];
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const usedLetters = updated[questionIndex].variants.map((v: any) => v.letter);
    const nextLetter = letters.find(l => !usedLetters.includes(l));
    
    if (nextLetter) {
      updated[questionIndex].variants.push({
        letter: nextLetter,
        text: '',
      });
      setQuestions(updated);
    }
  };

  const handleRemoveVariant = (questionIndex: number, variantIndex: number) => {
    const updated = [...questions];
    if (updated[questionIndex].variants.length > 0) {
      updated[questionIndex].variants.splice(variantIndex, 1);
      setQuestions(updated);
    }
  };

  const handleRemoveQuestion = (index: number) => {
    const updated = questions.filter((_, i) => i !== index);
    setQuestions(updated);
  };

  const handleAddQuestion = () => {
    const newQuestion = {
      text: '',
      variants: [],
      correctAnswer: '',
      points: 1,
    };
    setQuestions([...questions, newQuestion]);
  };

  const handleImageUpload = (questionIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const updated = [...questions];
        updated[questionIndex].image = reader.result as string;
        setQuestions(updated);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = (questionIndex: number) => {
    const updated = [...questions];
    delete updated[questionIndex].image;
    setQuestions(updated);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-48 lg:pb-32">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/teacher/block-tests/${id}/edit`)}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Orqaga
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{subjectName} - Savollarni tahrirlash</h1>
            <p className="text-gray-600 mt-1">{questions.length} ta savol</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saqlanmoqda...' : 'Saqlash'}
        </Button>
      </div>

      {/* Add Question Button */}
      <div className="flex justify-end">
        <Button onClick={handleAddQuestion} variant="outline">
          <Plus className="w-4 h-4 mr-2" />
          Savol qo'shish
        </Button>
      </div>

      {/* Questions List */}
      <div className="space-y-4">
        {questions.map((q, idx) => (
          <Card key={idx} className="border-2 border-gray-200">
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                <span className="font-bold text-gray-700 text-lg mt-2">{idx + 1}.</span>
                <div className="flex-1 space-y-3">
                  <div className="border rounded-lg">
                    <RichTextEditor
                      value={q.text}
                      onChange={(value) => handleQuestionChange(idx, 'text', value)}
                      placeholder="Savol matni..."
                    />
                  </div>
                  
                  {q.image ? (
                    <div className="relative inline-block">
                      <img 
                        src={q.image} 
                        alt="Question" 
                        className="max-w-xs max-h-48 rounded-lg border-2 border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(idx)}
                        className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 shadow-lg transition-colors"
                        title="Rasmni o'chirish"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <div className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all">
                        <ImagePlus className="w-5 h-5 text-gray-500" />
                        <span className="text-sm text-gray-600">Rasm qo'shish</span>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleImageUpload(idx, e)}
                      />
                    </label>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveQuestion(idx)}
                  className="text-red-500 hover:text-red-700 p-2"
                  title="Savolni o'chirish"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              {q.variants && q.variants.length > 0 ? (
                <div className="space-y-3 ml-8 mt-4">
                  {q.variants.map((v: any, vIdx: number) => (
                    <div key={vIdx} className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleQuestionChange(idx, 'correctAnswer', v.letter)}
                        className={`flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all ${
                          q.correctAnswer === v.letter
                            ? 'bg-green-500 border-green-600 text-white shadow-lg'
                            : 'bg-gray-50 border-gray-300 text-gray-700 hover:border-green-400 hover:bg-green-50'
                        }`}
                        title={`Variant ${v.letter} - to'g'ri javob sifatida belgilash`}
                      >
                        <span className="font-bold text-xl">{v.letter}</span>
                      </button>
                      <div className="flex-1 border rounded-lg">
                        <RichTextEditor
                          value={v.text}
                          onChange={(value) => handleVariantChange(idx, vIdx, value)}
                          placeholder="Variant matni..."
                        />
                      </div>
                      
                      <button
                        onClick={() => handleRemoveVariant(idx, vIdx)}
                        className="text-red-500 hover:text-red-700 p-2"
                        title="Variantni o'chirish"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => handleAddVariant(idx)}
                    className="ml-16 text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    + Variant qo'shish
                  </button>
                </div>
              ) : (
                <div className="ml-8 mt-4">
                  <p className="text-sm text-gray-500 italic">Variantsiz savol (to'ldirish uchun)</p>
                  <button
                    onClick={() => handleAddVariant(idx)}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    + Variant qo'shish
                  </button>
                </div>
              )}

              <div className="flex items-center gap-6 ml-8 pt-4 border-t mt-4">
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600 font-medium">Ball:</label>
                  <input
                    type="number"
                    value={q.points}
                    onChange={(e) => handleQuestionChange(idx, 'points', e.target.value)}
                    className="w-20 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-base"
                    min="1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Fixed Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg xl:left-72 z-40 pb-20 xl:pb-0">
        <div className="max-w-7xl mx-auto px-4 py-4 flex gap-3">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex-1"
            size="lg"
          >
            {saving ? (
              <>
                <Save className="w-5 h-5 mr-2" />
                Saqlanmoqda...
              </>
            ) : (
              <>
                <Save className="w-5 h-5 mr-2" />
                Saqlash ({questions.length} ta savol)
              </>
            )}
          </Button>
          <Button 
            variant="outline" 
            onClick={() => navigate(`/teacher/block-tests/${id}/edit`)} 
            disabled={saving} 
            size="lg"
          >
            Bekor qilish
          </Button>
        </div>
      </div>
    </div>
  );
}
