import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Upload, X, CheckCircle, AlertCircle, Loader2, ArrowLeft, ImagePlus } from 'lucide-react';
import api from '@/lib/api';
import { useImportBlockTest, useGenerateVariants } from '@/hooks/useBlockTests';
import RichTextEditor from '@/components/editor/RichTextEditor';
import { convertLatexToTiptapJson } from '@/lib/latexUtils';
import { useToast } from '@/hooks/useToast';

interface ParsedQuestion {
  text: string;
  variants: { letter: string; text: string }[];
  correctAnswer: string;
  points: number;
  image?: string;
}

export default function ImportBlockTestPage() {
  const navigate = useNavigate();
  const { error: showErrorToast } = useToast();
  
  // React Query mutations
  const importBlockTestMutation = useImportBlockTest();
  const generateVariantsMutation = useGenerateVariants();
  
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([]);
  const [error, setError] = useState<string>('');
  const [step, setStep] = useState<'upload' | 'preview' | 'complete'>('upload');
  
  const [classNumber, setClassNumber] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [groupLetter, setGroupLetter] = useState(''); // A, B, C, D или пусто для общих
  
  const [periodMonth, setPeriodMonth] = useState(new Date().getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());

  const loadSubjects = async () => {
    setLoadingSubjects(true);
    try {
      const { data } = await api.get('/subjects');
      setSubjects(data);
    } catch (err: any) {
      setError('Fanlarni yuklashda xatolik');
    } finally {
      setLoadingSubjects(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const ext = file.name.split('.').pop()?.toLowerCase();
      const format = ['jpg', 'jpeg', 'png'].includes(ext || '') ? 'image' : 'word';
      formData.append('format', format);

      const { data } = await api.post('/tests/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const questionsWithFormulas = (data.questions || []).map((q: ParsedQuestion) => {
        const hasFormulas = q.text.includes('\\(') || q.text.includes('\\[');
        const questionJson = hasFormulas ? convertLatexToTiptapJson(q.text) : null;
        
        // Обрабатываем варианты
        const processedVariants = (q.variants || []).map((v: any) => {
          const variantHasFormulas = v.text.includes('\\(') || v.text.includes('\\[');
          const variantJson = variantHasFormulas ? convertLatexToTiptapJson(v.text) : null;
          return {
            ...v,
            text: variantJson || v.text // Оставляем объект, не конвертируем в строку
          };
        });
        
        return {
          ...q,
          text: questionJson || q.text, // Оставляем объект, не конвертируем в строку
          variants: processedVariants,
          correctAnswer: '' // Bo'sh qoldirish - foydalanuvchi o'zi tanlaydi
        };
      });

      setParsedQuestions(questionsWithFormulas);
      setStep('preview');
      await loadSubjects();
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Faylni yuklashda xatolik yuz berdi';
      setError(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirm = async () => {
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
    
    // Validatsiya: to'g'ri javob tanlanganligini tekshirish
    const questionsWithoutAnswer = parsedQuestions.filter(q => !q.correctAnswer || q.correctAnswer.trim() === '');
    if (questionsWithoutAnswer.length > 0) {
      setError(`${questionsWithoutAnswer.length} ta savolda to'g'ri javob tanlanmagan`);
      showErrorToast(`${questionsWithoutAnswer.length} ta savolda to'g'ri javob tanlanmagan`);
      return;
    }
    
    setIsProcessing(true);
    setError('');
    
    try {
      // Преобразуем вопросы: image -> imageUrl для совместимости с моделью
      // И конвертируем JSON-объекты в строки для сохранения
      const questionsFormatted = parsedQuestions.map(q => {
        let textToSave = q.text;
        
        // Если text - это объект (TipTap JSON), конвертируем в строку
        if (typeof q.text === 'object' && q.text !== null) {
          textToSave = JSON.stringify(q.text);
        }
        
        // Обрабатываем варианты
        const variantsFormatted = (q.variants || []).map((v: any) => {
          let variantText = v.text;
          if (typeof v.text === 'object' && v.text !== null) {
            variantText = JSON.stringify(v.text);
          }
          return { ...v, text: variantText };
        });
        
        return {
          ...q,
          text: textToSave,
          variants: variantsFormatted,
          imageUrl: q.image,
          image: undefined
        };
      });
      
      // Используем React Query mutation
      console.log('📤 Sending import request:', {
        classNumber: parseInt(classNumber),
        subjectId: selectedSubjectId,
        groupLetter: groupLetter || null,
        periodMonth,
        periodYear,
        questionsCount: questionsFormatted.length
      });
      
      const savedBlockTest = await importBlockTestMutation.mutateAsync({
        questions: questionsFormatted,
        classNumber: parseInt(classNumber),
        subjectId: selectedSubjectId,
        groupLetter: groupLetter || null, // Пустая строка → null
        periodMonth,
        periodYear,
      });
      
      // Загружаем студентов и генерируем варианты
      const { data: students } = await api.get('/students', {
        params: { classNumber: parseInt(classNumber) }
      });
      
      if (students.length > 0) {
        const studentIds = students.map((s: any) => s._id);
        
        await generateVariantsMutation.mutateAsync({
          testId: savedBlockTest.blockTest._id,
          studentIds
        });
      }
      
      setStep('complete');
      
      // Перенаправляем с флагом refresh (React Query автоматически обновит кэш)
      setTimeout(() => {
        navigate('/teacher/block-tests', { state: { refresh: true } });
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Saqlashda xatolik');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuestionChange = (index: number, field: string, value: any) => {
    const updated = [...parsedQuestions];
    if (field === 'text') {
      updated[index].text = value;
    } else if (field === 'correctAnswer') {
      updated[index].correctAnswer = value;
    } else if (field === 'points') {
      updated[index].points = parseInt(value) || 1;
    }
    setParsedQuestions(updated);
  };

  const handleVariantChange = (questionIndex: number, variantIndex: number, value: string) => {
    const updated = [...parsedQuestions];
    updated[questionIndex].variants[variantIndex].text = value;
    setParsedQuestions(updated);
  };

  const handleAddVariant = (questionIndex: number) => {
    const updated = [...parsedQuestions];
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const usedLetters = updated[questionIndex].variants.map(v => v.letter);
    const nextLetter = letters.find(l => !usedLetters.includes(l));
    
    if (nextLetter) {
      updated[questionIndex].variants.push({
        letter: nextLetter,
        text: '',
      });
      setParsedQuestions(updated);
    }
  };

  const handleRemoveVariant = (questionIndex: number, variantIndex: number) => {
    const updated = [...parsedQuestions];
    if (updated[questionIndex].variants.length > 0) {
      updated[questionIndex].variants.splice(variantIndex, 1);
      setParsedQuestions(updated);
    }
  };

  const handleRemoveQuestion = (index: number) => {
    const updated = parsedQuestions.filter((_, i) => i !== index);
    setParsedQuestions(updated);
  };

  const handleAddQuestion = () => {
    const newQuestion: ParsedQuestion = {
      text: '',
      variants: [],
      correctAnswer: '',
      points: 1,
    };
    setParsedQuestions([...parsedQuestions, newQuestion]);
  };

  const handleImageUpload = async (questionIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      console.log('🔄 Uploading image to server...');
      
      const formData = new FormData();
      formData.append('file', file);
      
      const { data } = await api.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      console.log('✅ Image uploaded:', data.path);
      
      const updated = [...parsedQuestions];
      updated[questionIndex].image = data.path; // Сохраняем путь к файлу
      setParsedQuestions(updated);
    } catch (error) {
      console.error('❌ Error uploading image:', error);
      alert('Rasmni yuklashda xatolik');
    }
  };

  const handleRemoveImage = (questionIndex: number) => {
    const updated = [...parsedQuestions];
    delete updated[questionIndex].image;
    setParsedQuestions(updated);
  };

  const handleBack = () => {
    if (step === 'preview') {
      setStep('upload');
      setParsedQuestions([]);
    } else {
      navigate('/teacher/block-tests');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 -m-4 sm:-m-6 lg:-m-8">
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={handleBack}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <h1 className="text-lg sm:text-xl font-semibold">Blok test yuklash</h1>
            </div>
            {step === 'preview' && (
              <span className="text-sm text-gray-600">{parsedQuestions.length} ta</span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {step === 'upload' && (
          <div className="max-w-xl mx-auto space-y-4">
            <label className="block">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-colors cursor-pointer">
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-900 font-medium mb-1">
                  {file ? file.name : 'Faylni tanlang'}
                </p>
                <p className="text-sm text-gray-500">Word yoki rasm</p>
              </div>
              <input
                type="file"
                className="hidden"
                accept=".doc,.docx,.jpg,.jpeg,.png"
                onChange={handleFileChange}
              />
            </label>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {file && (
              <div className="flex gap-2">
                <Button onClick={handleUpload} disabled={isProcessing} className="flex-1">
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Tahlil qilinmoqda...
                    </>
                  ) : (
                    'Yuklash'
                  )}
                </Button>
                <Button variant="outline" onClick={() => setFile(null)} disabled={isProcessing}>
                  Bekor qilish
                </Button>
              </div>
            )}
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-3 pb-48 lg:pb-32">
            <div className="bg-white border p-3 rounded-lg">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Sinf *</label>
                  <select
                    value={classNumber}
                    onChange={(e) => setClassNumber(e.target.value)}
                    className="w-full px-2 py-1.5 border rounded text-sm focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Tanlang</option>
                    {[5, 6, 7, 8, 9, 10, 11].map((num) => (
                      <option key={num} value={num}>{num}-sinf</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Fan *</label>
                  {loadingSubjects ? (
                    <div className="flex items-center gap-1 px-2 py-1.5 border rounded bg-gray-50">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span className="text-xs">Yuklanmoqda...</span>
                    </div>
                  ) : (
                    <select
                      value={selectedSubjectId}
                      onChange={(e) => setSelectedSubjectId(e.target.value)}
                      className="w-full px-2 py-1.5 border rounded text-sm focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">Tanlang</option>
                      {subjects.map((subject) => (
                        <option key={subject._id} value={subject._id}>{subject.nameUzb}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Guruh harfi</label>
                  <select
                    value={groupLetter}
                    onChange={(e) => setGroupLetter(e.target.value)}
                    className="w-full px-2 py-1.5 border rounded text-sm focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Umumiy</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="D">D</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Davr *</label>
                  <input
                    type="month"
                    value={`${periodYear}-${String(periodMonth).padStart(2, '0')}`}
                    onChange={(e) => {
                      const [year, month] = e.target.value.split('-');
                      setPeriodYear(parseInt(year));
                      setPeriodMonth(parseInt(month));
                    }}
                    className="w-full px-2 py-1.5 border rounded text-sm focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {error && (
                <div className="mt-2 bg-red-50 border border-red-200 rounded p-2 flex items-start gap-1">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button onClick={handleAddQuestion} variant="outline" size="sm">+ Savol</Button>
            </div>

            <div className="space-y-2">
              {parsedQuestions.map((q, idx) => (
                <div key={idx} className="bg-white border p-3 rounded-lg">
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-gray-700 text-sm mt-1">{idx + 1}.</span>
                    <div className="flex-1 space-y-2">
                      <div className="border rounded">
                        <RichTextEditor
                          value={q.text}
                          onChange={(value) => handleQuestionChange(idx, 'text', value)}
                          placeholder="Savol..."
                        />
                      </div>
                      
                      {q.image ? (
                        <div className="relative inline-block">
                          <img src={q.image} alt="Question" className="max-w-xs max-h-32 rounded border" />
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(idx)}
                            className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded hover:bg-red-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <label className="cursor-pointer">
                          <div className="flex items-center gap-1 px-2 py-1 border border-dashed rounded hover:border-blue-400 hover:bg-blue-50/50 transition-colors inline-flex">
                            <ImagePlus className="w-3 h-3 text-gray-500" />
                            <span className="text-xs text-gray-600">Rasm</span>
                          </div>
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(idx, e)} />
                        </label>
                      )}
                    </div>
                    <button onClick={() => handleRemoveQuestion(idx)} className="text-red-500 hover:text-red-700 p-0.5">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-1.5 ml-5 mt-2">
                    {q.variants.map((v, vIdx) => (
                      <div key={vIdx} className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleQuestionChange(idx, 'correctAnswer', v.letter)}
                          className={`flex items-center justify-center w-7 h-7 rounded-full border transition-all ${
                            q.correctAnswer === v.letter
                              ? 'bg-green-500 border-green-600 text-white'
                              : 'bg-gray-50 border-gray-300 text-gray-700 hover:border-green-400'
                          }`}
                        >
                          <span className="font-semibold text-xs">{v.letter}</span>
                        </button>
                        <div className="flex-1 border rounded">
                          <RichTextEditor
                            value={v.text}
                            onChange={(value) => handleVariantChange(idx, vIdx, value)}
                            placeholder="Variant..."
                          />
                        </div>
                        <button onClick={() => handleRemoveVariant(idx, vIdx)} className="text-red-500 hover:text-red-700 p-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => handleAddVariant(idx)} className={`text-xs text-blue-600 hover:text-blue-700 ${q.variants.length > 0 ? 'ml-8' : ''}`}>
                      + Variant qo'shish
                    </button>
                  </div>

                  <div className="flex items-center gap-2 ml-5 pt-2 border-t mt-2">
                    <label className="text-xs text-gray-600">Ball:</label>
                    <input
                      type="number"
                      value={q.points}
                      onChange={(e) => handleQuestionChange(idx, 'points', e.target.value)}
                      className="w-14 px-1.5 py-0.5 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                      min="1"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg xl:left-72 z-40 pb-20 xl:pb-0">
              <div className="max-w-7xl mx-auto px-4 py-2 flex gap-2">
                <Button
                  onClick={handleConfirm}
                  disabled={isProcessing || parsedQuestions.length === 0}
                  className="flex-1"
                  size="sm"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      Saqlanmoqda...
                    </>
                  ) : (
                    `Saqlash (${parsedQuestions.length})`
                  )}
                </Button>
                <Button variant="outline" onClick={handleBack} disabled={isProcessing} size="sm">
                  Bekor qilish
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 'complete' && (
          <div className="max-w-md mx-auto text-center py-16">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Muvaffaqiyatli!</h3>
            <p className="text-gray-600">{parsedQuestions.length} ta savol yuklandi</p>
          </div>
        )}
      </div>
    </div>
  );
}
