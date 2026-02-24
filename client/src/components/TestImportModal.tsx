
import { useState } from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogContent } from './ui/Dialog';
import { Button } from './ui/Button';
import { Upload, FileText, Image, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import SubjectText from './SubjectText';

interface TestImportModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type ImportFormat = 'word' | 'image' | null;

interface ParsedQuestion {
  text: string;
  variants: { letter: string; text: string }[];
  correctAnswer: string;
  points: number;
}

export default function TestImportModal({ open, onClose, onSuccess }: TestImportModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<ImportFormat>(null);
  const [selectedSubject, setSelectedSubject] = useState<string>('math'); // NEW: Subject selection
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([]);
  const [error, setError] = useState<string>('');
  const [step, setStep] = useState<'select' | 'upload' | 'preview' | 'complete'>('select');

  const formats = [
    {
      type: 'word' as const,
      icon: FileText,
      title: 'Word/PDF',
      description: 'Matn formatida testlar',
      accept: '.doc,.docx,.pdf',
      color: 'from-blue-500 to-blue-600',
    },
    {
      type: 'image' as const,
      icon: Image,
      title: 'Rasm',
      description: 'Skanerlangan testlar (OCR)',
      accept: '.jpg,.jpeg,.png',
      color: 'from-purple-500 to-purple-600',
    },
  ];

  const handleFormatSelect = (format: ImportFormat) => {
    setSelectedFormat(format);
    setStep('upload');
    setError('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!file || !selectedFormat) return;

    setIsProcessing(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('format', selectedFormat);
      formData.append('subjectId', selectedSubject); // NEW: Send subject ID

      // DEBUG: Log what we're sending
      console.log('📤 Sending to server:', {
        file: file.name,
        format: selectedFormat,
        subjectId: selectedSubject
      });

      console.log('%c🤖 AI Parsing Started', 'color: #3b82f6; font-weight: bold; font-size: 14px');
      console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #3b82f6');

      const { data } = await api.post('/tests/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Показываем логи в консоли браузера
      if (data.logs && data.logs.length > 0) {
        console.log('%c📊 AI Parsing Logs:', 'color: #8b5cf6; font-weight: bold; font-size: 12px');
        data.logs.forEach((log: any) => {
          const timestamp = new Date(log.timestamp).toLocaleTimeString();
          const keyInfo = log.keyIndex ? ` [Key #${log.keyIndex}]` : '';
          
          let color = '#6b7280'; // gray
          let icon = '•';
          
          if (log.level === 'success') {
            color = '#10b981'; // green
            icon = '✅';
          } else if (log.level === 'error') {
            color = '#ef4444'; // red
            icon = '❌';
          } else if (log.level === 'warning') {
            color = '#f59e0b'; // orange
            icon = '⚠️';
          } else if (log.level === 'info') {
            color = '#3b82f6'; // blue
            icon = '🔵';
          }
          
          console.log(
            `%c${icon} [${timestamp}]${keyInfo} ${log.message}`,
            `color: ${color}; font-size: 11px`
          );
        });
        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #3b82f6');
      }

      setParsedQuestions(data.questions || []);
      setStep('preview');
      
      // Check for problematic questions (empty text or missing variants)
      const problematicQuestions = (data.questions || []).filter((q: ParsedQuestion, idx: number) => 
        !q.text || q.text.includes('(parse qilinmadi)') || q.variants.some(v => !v.text)
      );
      
      if (problematicQuestions.length > 0) {
        // Show warning toast
        console.warn(`⚠️ ${problematicQuestions.length} ta savol muammoli`);
      }
    } catch (err: any) {
      console.error('Import error:', err);
      
      // Показываем логи даже при ошибке
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

  const handleConfirm = async () => {
    // Validation: Check if all questions with variants have correct answer selected
    const questionsWithoutAnswer = parsedQuestions.filter(
      (q, idx) => q.variants.length > 0 && !q.correctAnswer
    );
    
    if (questionsWithoutAnswer.length > 0) {
      setError(`Iltimos, barcha savollar uchun to'g'ri javobni tanlang! (${questionsWithoutAnswer.length} ta savol uchun javob tanlanmagan)`);
      return;
    }
    
    setIsProcessing(true);
    setError('');
    
    try {
      // Savollarni tasdiqlash va saqlash
      await api.post('/tests/import/confirm', {
        questions: parsedQuestions,
      });
      
      setStep('complete');
      setTimeout(() => {
        onSuccess();
        handleClose();
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

  const handleClose = () => {
    setSelectedFormat(null);
    setFile(null);
    setParsedQuestions([]);
    setError('');
    setStep('select');
    setIsProcessing(false);
    onClose();
  };

  const handleBack = () => {
    if (step === 'upload') {
      setStep('select');
      setFile(null);
    } else if (step === 'preview') {
      setStep('upload');
      setParsedQuestions([]);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Upload className="w-6 h-6 text-primary" />
          Test yuklash
        </DialogTitle>
      </DialogHeader>
      <DialogContent className="max-w-4xl">
        {/* Step 1: Format Selection */}
        {step === 'select' && (
          <div className="space-y-4">
            <p className="text-gray-600">Qaysi formatda test yuklashni xohlaysiz?</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {formats.map((format) => {
                const Icon = format.icon;
                return (
                  <button
                    key={format.type}
                    onClick={() => handleFormatSelect(format.type)}
                    className="group relative p-6 bg-white border-2 border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-lg transition-all text-left"
                  >
                    <div className={`w-12 h-12 bg-gradient-to-br ${format.color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="font-bold text-gray-900 mb-1">{format.title}</h3>
                    <p className="text-sm text-gray-600">{format.description}</p>
                  </button>
                );
              })}
            </div>

            {/* Format Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
              <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Format talablari:
              </h4>
              <div className="space-y-2 text-sm text-blue-800">
                <div>
                  <strong>Word/PDF:</strong> Har bir savol yangi qatordan, variantlar A), B), C), D) formatida
                </div>
                <div>
                  <strong>Rasm:</strong> Aniq va o'qilishi oson bo'lgan skanerlangan test
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: File Upload */}
        {step === 'upload' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                {formats.find(f => f.type === selectedFormat)?.title} yuklash
              </h3>
              <Button variant="ghost" size="sm" onClick={handleBack}>
                Orqaga
              </Button>
            </div>

            {/* NEW: Subject Selection */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <label className="block text-sm font-medium text-blue-900 mb-2">
                📚 Fan tanlang (parsing uchun):
              </label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full p-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="math">📐 Matematika (LaTeX formulalar)</option>
                <option value="biology">🧬 Biologiya (rasmlar, lotin nomlari)</option>
                <option value="physics">⚡ Fizika (formulalar, birliklar)</option>
                <option value="chemistry">🧪 Kimyo (molekulalar, reaksiyalar)</option>
                <option value="literature">📚 Ona tili va Adabiyot (matn tahlili)</option>
                <option value="history">📜 Tarix</option>
              </select>
              <p className="text-xs text-blue-700 mt-2">
                💡 Har bir fan uchun maxsus parsing algoritmi ishlatiladi
              </p>
            </div>

            {/* File Drop Zone */}
            <label className="block">
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer">
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-900 font-medium mb-1">
                  {file ? file.name : 'Faylni tanlang yoki bu yerga tashlang'}
                </p>
                <p className="text-sm text-gray-500">
                  Qo'llab-quvvatlanadigan formatlar: {formats.find(f => f.type === selectedFormat)?.accept}
                </p>
              </div>
              <input
                type="file"
                className="hidden"
                accept={formats.find(f => f.type === selectedFormat)?.accept}
                onChange={handleFileChange}
              />
            </label>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900">Xatolik</p>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            )}

            {file && (
              <div className="flex gap-2">
                <Button
                  onClick={handleUpload}
                  disabled={isProcessing}
                  className="flex-1"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Qayta ishlanmoqda...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Yuklash va tahlil qilish
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setFile(null)}
                  disabled={isProcessing}
                >
                  Bekor qilish
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Preview Questions */}
        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                Topilgan savollar: {parsedQuestions.length} ta
              </h3>
              <Button variant="ghost" size="sm" onClick={handleBack}>
                Orqaga
              </Button>
            </div>

            {/* Warning Alert for Problematic Questions */}
            {(() => {
              const problematicQuestions = parsedQuestions.filter((q, idx) => 
                !q.text || q.text.includes('(parse qilinmadi)') || q.variants.some(v => !v.text)
              );
              
              if (problematicQuestions.length > 0) {
                return (
                  <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex items-start gap-3 shadow-sm">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-amber-900 text-sm">
                        ⚠️ {problematicQuestions.length} ta savol to'liq parse qilinmadi
                      </p>
                      <p className="text-xs text-amber-700 mt-1">
                        Iltimos, quyidagi savollarni qo'lda to'ldiring yoki tuzating
                      </p>
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            <div className="max-h-[500px] overflow-y-auto space-y-4 border rounded-lg p-4">
              {parsedQuestions.map((q, idx) => {
                const hasVariants = q.variants.length > 0;
                const needsAnswer = hasVariants && !q.correctAnswer;
                const isProblematic = !q.text || q.text.includes('(parse qilinmadi)') || q.variants.some(v => !v.text);
                
                return (
                  <div 
                    key={idx} 
                    className={`bg-white border-2 p-4 rounded-lg space-y-3 ${
                      isProblematic ? 'border-amber-400 bg-amber-50' : 
                      needsAnswer ? 'border-red-300 bg-red-50' : 'border-gray-200'
                    }`}
                  >
                    {/* Question Header */}
                    <div className="flex items-start gap-2">
                      <span className="font-bold text-gray-700 mt-2">{idx + 1}.</span>
                      <div className="flex-1">
                        {/* Preview with SubjectText - MAIN DISPLAY */}
                        <div className="p-3 bg-white rounded border border-gray-300">
                          <SubjectText text={q.text} subject={selectedSubject} className="text-gray-900 text-base" />
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveQuestion(idx)}
                        className="text-red-500 hover:text-red-700 p-1"
                        title="Savolni o'chirish"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Variants */}
                    {q.variants.length > 0 ? (
                      <div className="space-y-2 ml-6">
                        {q.variants.map((v, vIdx) => (
                          <div key={vIdx} className="flex items-center gap-3">
                            <span className="font-bold text-gray-700 text-lg min-w-[40px]">{v.letter})</span>
                            {/* Preview with SubjectText */}
                            <div className="flex-1 p-2 bg-white rounded border border-gray-300">
                              <SubjectText text={v.text} subject={selectedSubject} className="text-gray-900" />
                            </div>
                            <button
                              onClick={() => handleRemoveVariant(idx, vIdx)}
                              className="text-red-500 hover:text-red-700 p-1"
                              title="Variantni o'chirish"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => handleAddVariant(idx)}
                          className="ml-12 text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          + Variant qo'shish
                        </button>
                      </div>
                    ) : (
                      <div className="ml-6">
                        <p className="text-sm text-gray-500 italic mb-2">Variantsiz savol (to'ldirish uchun)</p>
                        <button
                          onClick={() => handleAddVariant(idx)}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          + Variant qo'shish
                        </button>
                      </div>
                    )}

                    {/* Settings */}
                    <div className="flex items-center gap-4 ml-6 pt-2 border-t">
                      {q.variants.length > 0 && (
                        <div className="flex items-center gap-2">
                          <label className={`text-sm ${needsAnswer ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                            To'g'ri javob: {needsAnswer && '⚠️'}
                          </label>
                          <div className="flex gap-2">
                            {q.variants.map((v) => (
                              <button
                                key={v.letter}
                                type="button"
                                onClick={() => handleQuestionChange(idx, 'correctAnswer', v.letter)}
                                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-sm transition-all ${
                                  q.correctAnswer === v.letter
                                    ? 'bg-green-500 border-green-600 text-white'
                                    : needsAnswer
                                    ? 'bg-white border-red-400 text-gray-700 hover:border-red-500 animate-pulse'
                                    : 'bg-white border-gray-300 text-gray-700 hover:border-green-400'
                                }`}
                                title={`Вариант ${v.letter} - to'g'ri javob sifatida belgilash`}
                              >
                                {v.letter}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600">Ball:</label>
                        <input
                          type="number"
                          value={q.points}
                          onChange={(e) => handleQuestionChange(idx, 'points', e.target.value)}
                          className="w-16 p-1 border rounded focus:ring-2 focus:ring-blue-500"
                          min="1"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
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

            <div className="flex gap-2">
              <Button
                onClick={handleConfirm}
                disabled={isProcessing || parsedQuestions.length === 0}
                className="flex-1"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saqlanmoqda...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Tasdiqlash va saqlash ({parsedQuestions.length} ta savol)
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={handleBack} disabled={isProcessing}>
                Bekor qilish
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Complete */}
        {step === 'complete' && (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Muvaffaqiyatli yuklandi!</h3>
            <p className="text-gray-600">
              {parsedQuestions.length} ta savol muvaffaqiyatli yuklandi va saqlandi.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
