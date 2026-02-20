import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import {
  Upload,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Trash2,
  ImagePlus,
  FileText,
  ClipboardList,
} from 'lucide-react';
import api from '@/lib/api';
import { useImportTest } from '@/hooks/useTests';
import { useImportBlockTest } from '@/hooks/useBlockTests';
import RichTextEditor from '@/components/editor/RichTextEditor';
import MathText from '@/components/MathText';
import { convertLatexToTiptapJson, convertChemistryToTiptapJson, convertPhysicsToTiptapJson } from '@/lib/latexUtils';
import { useTestType } from '@/hooks/useTestType';
import { TestTypeSwitch } from './components/TestTypeSwitch';
import {
  RegularTestImportForm,
  type RegularTestFormData,
} from './components/RegularTestImportForm';
import {
  BlockTestImportForm,
  type BlockTestFormData,
} from './components/BlockTestImportForm';
import { useToast } from '@/hooks/useToast';

interface ParsedQuestion {
  text: string;
  variants: { letter: string; text: string }[];
  correctAnswer: string;
  points: number;
  image?: string; // Локальный путь (загруженный вручную)
  imageUrl?: string; // URL из Word документа
}

/**
 * Unified Test Import Page
 * Handles both Regular and Block test imports with conditional rendering
 */
export default function TestImportPage() {
  const navigate = useNavigate();
  const { testType, setTestType, isRegular, isBlock } = useTestType('regular');
  const { error: showErrorToast } = useToast();

  // React Query mutations
  const importTestMutation = useImportTest();
  const importBlockTestMutation = useImportBlockTest();

  // Common state
  const [file, setFile] = useState<File | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string>('math'); // NEW: Subject selection
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([]);
  const [error, setError] = useState<string>('');
  const [step, setStep] = useState<'upload' | 'preview' | 'complete'>('upload');
  const [viewMode, setViewMode] = useState<'full' | 'compact'>('full'); // NEW: View mode toggle

  // File handling
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

      // Determine format by file extension
      const ext = file.name.split('.').pop()?.toLowerCase();
      const format = ['jpg', 'jpeg', 'png'].includes(ext || '') ? 'image' : 'word';
      formData.append('format', format);
      formData.append('subjectId', selectedSubject); // NEW: Send subject ID

      // DEBUG: Log what we're sending
      console.log('📤 Sending to server:', {
        file: file.name,
        format,
        subjectId: selectedSubject
      });

      console.log('%c🤖 AI Parsing Started', 'color: #3b82f6; font-weight: bold; font-size: 14px');
      console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #3b82f6');

      const { data } = await api.post('/tests/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Log AI parsing logs
      if (data.logs && data.logs.length > 0) {
        console.log('%c📊 AI Parsing Logs:', 'color: #8b5cf6; font-weight: bold; font-size: 12px');
        data.logs.forEach((log: any) => {
          const timestamp = new Date(log.timestamp).toLocaleTimeString();
          const keyInfo = log.keyIndex ? ` [Key #${log.keyIndex}]` : '';

          let color = '#6b7280';
          let icon = '•';

          if (log.level === 'success') {
            color = '#10b981';
            icon = '✅';
          } else if (log.level === 'error') {
            color = '#ef4444';
            icon = '❌';
          } else if (log.level === 'warning') {
            color = '#f59e0b';
            icon = '⚠️';
          } else if (log.level === 'info') {
            color = '#3b82f6';
            icon = '🔵';
          }

          console.log(
            `%c${icon} [${timestamp}]${keyInfo} ${log.message}`,
            `color: ${color}; font-size: 11px`
          );
        });
        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #3b82f6');
      }

      // Convert LaTeX formulas to TipTap JSON
      const questionsWithFormulas = (data.questions || []).map((q: ParsedQuestion) => {
        // Fan uchun maxsus konvertatsiya
        const isChemistry = selectedSubject === 'chemistry';
        const isPhysics = selectedSubject === 'physics';
        
        const hasFormulas = q.text.includes('\\(') || q.text.includes('\\[') || 
                           (isChemistry && (q.text.includes('_') || q.text.includes('^') || q.text.includes('\\cdot'))) ||
                           (isPhysics && (q.text.includes('_') || q.text.includes('^') || q.text.includes('\\times') || q.text.includes('\\div')));
        
        let questionJson = null;
        if (hasFormulas) {
          if (isChemistry) {
            questionJson = convertChemistryToTiptapJson(q.text);
          } else if (isPhysics) {
            questionJson = convertPhysicsToTiptapJson(q.text);
          } else {
            questionJson = convertLatexToTiptapJson(q.text);
          }
        }

        // Convert variants with formulas
        const convertedVariants = q.variants.map((v) => {
          const variantHasFormulas = v.text.includes('\\(') || v.text.includes('\\[') ||
                                     (isChemistry && (v.text.includes('_') || v.text.includes('^') || v.text.includes('\\cdot'))) ||
                                     (isPhysics && (v.text.includes('_') || v.text.includes('^') || v.text.includes('\\times') || v.text.includes('\\div')));
          if (variantHasFormulas) {
            let variantJson;
            if (isChemistry) {
              variantJson = convertChemistryToTiptapJson(v.text);
            } else if (isPhysics) {
              variantJson = convertPhysicsToTiptapJson(v.text);
            } else {
              variantJson = convertLatexToTiptapJson(v.text);
            }
            return {
              ...v,
              text: variantJson || v.text,
            };
          }
          return v;
        });

        return {
          ...q,
          text: questionJson || q.text,
          variants: convertedVariants,
          correctAnswer: '', // Bo'sh qoldirish - foydalanuvchi o'zi tanlaydi
          imageUrl: q.imageUrl, // Сохраняем imageUrl из Word документа
        };
      });

      setParsedQuestions(questionsWithFormulas);
      setStep('preview');
    } catch (err: any) {
      console.error('Import error:', err);

      // Log error logs if available
      if (err.response?.data?.logs) {
        console.log('%c📊 AI Parsing Logs (Error):', 'color: #ef4444; font-weight: bold; font-size: 12px');
        err.response.data.logs.forEach((log: any) => {
          const timestamp = new Date(log.timestamp).toLocaleTimeString();
          const keyInfo = log.keyIndex ? ` [Key #${log.keyIndex}]` : '';

          let color = '#6b7280';
          let icon = '•';

          if (log.level === 'success') {
            color = '#10b981';
            icon = '✅';
          } else if (log.level === 'error') {
            color = '#ef4444';
            icon = '❌';
          } else if (log.level === 'warning') {
            color = '#f59e0b';
            icon = '⚠️';
          } else if (log.level === 'info') {
            color = '#3b82f6';
            icon = '🔵';
          }

          console.log(
            `%c${icon} [${timestamp}]${keyInfo} ${log.message}`,
            `color: ${color}; font-size: 11px`
          );
        });
        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #ef4444');
      }

      const errorMessage = err.response?.data?.message || 'Faylni yuklashda xatolik yuz berdi';
      const errorHint = err.response?.data?.hint || '';
      setError(errorMessage + (errorHint ? '\n\n💡 ' + errorHint : ''));
    } finally {
      setIsProcessing(false);
    }
  };

  // Regular test confirmation
  const handleRegularTestConfirm = async (formData: RegularTestFormData) => {
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
      console.log('🔄 Importing regular test...');

      // Format questions for saving
      const questionsFormatted = parsedQuestions.map((q) => {
        let textToSave = q.text;

        // If text is object (TipTap JSON), convert to string
        if (typeof q.text === 'object' && q.text !== null) {
          textToSave = JSON.stringify(q.text);
        }

        // Process variants
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
          imageUrl: q.imageUrl || q.image, // Используем imageUrl из Word или загруженный image
          image: undefined,
        };
      });

      await importTestMutation.mutateAsync({
        questions: questionsFormatted,
        testName: formData.testName,
        groupId: formData.groupId,
        subjectId: formData.subjectId,
        classNumber: formData.classNumber,
      });

      console.log('✅ Regular test imported successfully');

      setStep('complete');

      setTimeout(() => {
        navigate('/teacher/tests', { state: { refresh: true } });
      }, 2000);
    } catch (err: any) {
      console.error('❌ Error importing regular test:', err);
      setError(err.response?.data?.message || 'Saqlashda xatolik');
    } finally {
      setIsProcessing(false);
    }
  };

  // Block test confirmation
  const handleBlockTestConfirm = async (formData: BlockTestFormData) => {
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
      console.log('🔄 Importing block test...');

      // Format questions for saving
      const questionsFormatted = parsedQuestions.map((q) => {
        let textToSave = q.text;

        if (typeof q.text === 'object' && q.text !== null) {
          textToSave = JSON.stringify(q.text);
        }

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
          imageUrl: q.imageUrl || q.image,
          image: undefined,
        };
      });

      await importBlockTestMutation.mutateAsync({
        questions: questionsFormatted,
        classNumber: formData.classNumber,
        subjectId: formData.subjectId,
        periodMonth: formData.periodMonth,
        periodYear: formData.periodYear,
      });

      console.log('✅ Block test imported successfully');

      setStep('complete');

      setTimeout(() => {
        navigate('/teacher/block-tests', { state: { refresh: true } });
      }, 2000);
    } catch (err: any) {
      console.error('❌ Error importing block test:', err);
      setError(err.response?.data?.message || 'Saqlashda xatolik');
    } finally {
      setIsProcessing(false);
    }
  };

  // Question editing handlers
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
    const usedLetters = updated[questionIndex].variants.map((v) => v.letter);
    const nextLetter = letters.find((l) => !usedLetters.includes(l));

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
      variants: [
        { letter: 'A', text: '' },
        { letter: 'B', text: '' },
        { letter: 'C', text: '' },
        { letter: 'D', text: '' },
      ],
      correctAnswer: '', // Bo'sh qoldirish
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
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      console.log('✅ Image uploaded:', data.path);

      const updated = [...parsedQuestions];
      updated[questionIndex].image = data.path;
      setParsedQuestions(updated);
    } catch (error) {
      console.error('❌ Error uploading image:', error);
      alert('Rasmni yuklashda xatolik');
    }
  };

  const handleRemoveImage = (questionIndex: number) => {
    const updated = [...parsedQuestions];
    delete updated[questionIndex].image;
    delete updated[questionIndex].imageUrl;
    setParsedQuestions(updated);
  };

  const handleBack = () => {
    if (step === 'preview') {
      setStep('upload');
      setParsedQuestions([]);
    } else {
      navigate(isRegular ? '/teacher/tests' : '/teacher/block-tests');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 -m-4 sm:-m-6 lg:-m-8">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={handleBack}>
                <ArrowLeft className="w-5 h-5 mr-2" />
                Orqaga
              </Button>
              <div className="flex items-center gap-2">
                <Upload className="w-6 h-6 text-primary" />
                <h1 className="text-2xl font-bold">Test import qilish</h1>
              </div>
            </div>
            
            {/* View Mode Switch - Only show in preview step */}
            {step === 'preview' && (
              <div className="flex items-center gap-4">
                <div className="text-sm text-gray-600">
                  Topilgan: <span className="font-bold text-gray-900">{parsedQuestions.length} ta</span>
                </div>
                
                {/* Toggle Switch */}
                <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode('full')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
                      viewMode === 'full'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    <span className="hidden sm:inline">To'liq</span>
                  </button>
                  <button
                    onClick={() => setViewMode('compact')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
                      viewMode === 'compact'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <ClipboardList className="w-4 h-4" />
                    <span className="hidden sm:inline">Titul</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Step 1: File Upload */}
        {step === 'upload' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Test import qilish</h3>
              <p className="text-gray-600">Word, PDF yoki rasm formatida test yuklang</p>
            </div>

            {/* NEW: Subject Selection */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <label className="block text-sm font-medium text-blue-900 mb-2">
                📚 Fan tanlang (parsing uchun):
              </label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full p-3 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-base"
              >
                <option value="math">📐 Matematika (LaTeX formulalar)</option>
                <option value="biology">🧬 Biologiya (rasmlar, lotin nomlari)</option>
                <option value="physics">⚡ Fizika (formulalar, birliklar)</option>
                <option value="chemistry">🧪 Kimyo (molekulalar, reaksiyalar)</option>
                <option value="literature">📚 Ona tili va Adabiyot (matn tahlili)</option>
              </select>
              <p className="text-xs text-blue-700 mt-2">
                💡 Har bir fan uchun maxsus parsing algoritmi ishlatiladi
              </p>
            </div>

            <label className="block">
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-16 text-center hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer">
                <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-900 font-medium text-lg mb-2">
                  {file ? file.name : 'Faylni tanlang yoki bu yerga tashlang'}
                </p>
                <p className="text-sm text-gray-500">
                  Word (.doc, .docx), PDF (.pdf) yoki Rasm (.jpg, .png)
                </p>
              </div>
              <input
                type="file"
                className="hidden"
                accept=".doc,.docx,.pdf,.jpg,.jpeg,.png"
                onChange={handleFileChange}
              />
            </label>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900">Xatolik</p>
                  <p className="text-sm text-red-700 whitespace-pre-line">{error}</p>
                </div>
              </div>
            )}

            {file && (
              <div className="flex gap-3">
                <Button onClick={handleUpload} disabled={isProcessing} className="flex-1" size="lg">
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Qayta ishlanmoqda...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5 mr-2" />
                      Yuklash va tahlil qilish
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={() => setFile(null)} disabled={isProcessing} size="lg">
                  Bekor qilish
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Preview Questions */}
        {step === 'preview' && (
          <div className="space-y-6 pb-48 lg:pb-32">
            {/* Test Settings Form - Conditional Rendering */}
            <div className="bg-white border-2 border-blue-200 p-6 rounded-xl">
              {isRegular ? (
                <RegularTestImportForm
                  parsedQuestions={parsedQuestions}
                  onConfirm={handleRegularTestConfirm}
                  onCancel={handleBack}
                  isProcessing={isProcessing}
                />
              ) : (
                <BlockTestImportForm
                  parsedQuestions={parsedQuestions}
                  onConfirm={handleBlockTestConfirm}
                  onCancel={handleBack}
                  isProcessing={isProcessing}
                />
              )}
            </div>

            {/* Warning Alert for Problematic Questions - MOVED AFTER FORM */}
            {(() => {
              const problematicQuestions = parsedQuestions
                .map((q, idx) => {
                  const textStr = typeof q.text === 'string' ? q.text : JSON.stringify(q.text);
                  const hasProblematicText = !q.text || textStr.includes('(parse qilinmadi)');
                  const hasEmptyVariants = q.variants.some(v => !v.text);
                  return { idx: idx + 1, isProblematic: hasProblematicText || hasEmptyVariants };
                })
                .filter(item => item.isProblematic);
              
              if (problematicQuestions.length > 0) {
                const questionNumbers = problematicQuestions.map(item => item.idx).join(', ');
                return (
                  <div className="bg-amber-50 border-l-4 border-amber-400 rounded-r-lg p-4 flex items-start gap-3 shadow-sm">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-amber-900 text-sm">
                        Diqqat: Ba'zi savollar to'liq yuklanmadi
                      </p>
                      <p className="text-xs text-amber-700 mt-1">
                        {problematicQuestions.length} ta savol ({questionNumbers}) to'liq parse qilinmadi. 
                        Iltimos, ularni qo'lda to'ldiring.
                      </p>
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {/* Add Question Button */}
            <div className="flex justify-end">
              <Button onClick={handleAddQuestion} variant="outline">
                + Savol qo'shish
              </Button>
            </div>

            {/* Questions List */}
            <div className="space-y-4">
              {viewMode === 'full' ? (
                // FULL VIEW - Hozirgi ko'rinish
                parsedQuestions.map((q, idx) => {
                  // Check if question is problematic
                  const textStr = typeof q.text === 'string' ? q.text : JSON.stringify(q.text);
                  const hasProblematicText = !q.text || textStr.includes('(parse qilinmadi)');
                  const hasEmptyVariants = q.variants.some(v => !v.text);
                  const isProblematic = hasProblematicText || hasEmptyVariants;
                  
                  return (
                    <div 
                      key={idx} 
                      className={`bg-white border-2 p-6 rounded-xl space-y-4 ${
                        isProblematic ? 'border-amber-400 bg-amber-50' : 'border-gray-200'
                      }`}
                    >
                    {/* Question Header */}
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

                        {/* Image Upload */}
                        {(q.image || q.imageUrl) ? (
                          <div className="relative inline-block">
                            <img
                              src={q.imageUrl || q.image}
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
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Variants */}
                    {q.variants.length > 0 ? (
                      <div className="space-y-3 ml-8">
                        {q.variants.map((v, vIdx) => (
                          <div key={vIdx} className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handleQuestionChange(idx, 'correctAnswer', v.letter)}
                              className={`flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all ${
                                q.correctAnswer === v.letter
                                  ? 'bg-green-500 border-green-600 text-white shadow-lg'
                                  : 'bg-gray-50 border-gray-300 text-gray-700 hover:border-green-400 hover:bg-green-50'
                              }`}
                              title={`Вариант ${v.letter} - to'g'ri javob sifatida belgilash`}
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
                      <div className="ml-8">
                        <p className="text-sm text-gray-500 italic">Variantsiz savol (to'ldirish uchun)</p>
                      </div>
                    )}

                    {/* Settings */}
                    <div className="flex items-center gap-6 ml-8 pt-4 border-t">
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
                  </div>
                );
                })
              ) : (
                // COMPACT VIEW - Titul varoq (1 qatorda)
                <div className="bg-white border-2 border-gray-200 rounded-xl shadow-sm">
                  {/* Header */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b-2 border-gray-200 px-8 py-6 rounded-t-xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                          <ClipboardList className="w-6 h-6 text-blue-600" />
                          Titul varoq
                        </h3>
                        <p className="text-gray-600 mt-1">Faqat to'g'ri javoblarni belgilang</p>
                      </div>
                      
                      {/* Statistics */}
                      <div className="flex gap-6">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-gray-900">
                            {parsedQuestions.length}
                          </div>
                          <div className="text-xs text-gray-600 uppercase tracking-wide">Jami</div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-green-600">
                            {parsedQuestions.filter(q => q.correctAnswer).length}
                          </div>
                          <div className="text-xs text-gray-600 uppercase tracking-wide">Belgilangan</div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-amber-600">
                            {parsedQuestions.filter(q => !q.correctAnswer).length}
                          </div>
                          <div className="text-xs text-gray-600 uppercase tracking-wide">Qolgan</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Questions Grid - 1 qatorda: 1. A B C D */}
                  <div className="p-8">
                    <div className="space-y-2">
                      {parsedQuestions.map((q, idx) => (
                        <div 
                          key={idx} 
                          className={`flex items-center gap-4 px-6 py-4 rounded-lg border-2 transition-all ${
                            q.correctAnswer 
                              ? 'border-green-500 bg-green-50 shadow-sm' 
                              : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'
                          }`}
                        >
                          {/* Question Number */}
                          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-lg shadow-md">
                            {idx + 1}
                          </div>
                          
                          {/* Variants - Horizontal */}
                          <div className="flex-1 flex items-center gap-3">
                            {q.variants.map((v) => (
                              <button
                                key={v.letter}
                                type="button"
                                onClick={() => handleQuestionChange(idx, 'correctAnswer', v.letter)}
                                className={`flex items-center justify-center w-14 h-14 rounded-lg border-2 font-bold text-lg transition-all ${
                                  q.correctAnswer === v.letter
                                    ? 'bg-green-500 border-green-600 text-white shadow-lg scale-110 ring-4 ring-green-200'
                                    : 'bg-white border-gray-300 text-gray-700 hover:border-green-400 hover:bg-green-50 hover:scale-105'
                                }`}
                                title={`Savol ${idx + 1} - Variant ${v.letter}`}
                              >
                                {v.letter}
                              </button>
                            ))}
                          </div>

                          {/* Selected Answer Indicator */}
                          {q.correctAnswer && (
                            <div className="flex items-center gap-2 px-4 py-2 bg-green-100 border border-green-300 rounded-lg">
                              <CheckCircle className="w-5 h-5 text-green-600" />
                              <span className="font-bold text-green-700">{q.correctAnswer}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
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
          </div>
        )}

        {/* Step 3: Complete */}
        {step === 'complete' && (
          <div className="max-w-md mx-auto text-center py-16">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">Muvaffaqiyatli yuklandi!</h3>
            <p className="text-gray-600 text-lg">
              {parsedQuestions.length} ta savol muvaffaqiyatli yuklandi va saqlandi.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
