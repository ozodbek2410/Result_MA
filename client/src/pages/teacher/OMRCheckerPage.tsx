import { useState, useRef, useEffect } from 'react';
import { Upload, CheckCircle, XCircle, Scan, Save, ArrowLeft, Edit2, Camera } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useToast } from '../../hooks/useToast';
import { CameraModal } from '../../components/CameraModal';
import api from '../../lib/api';

interface CheckResult {
  success: boolean;
  detected_answers?: { [key: number]: string };
  total_questions?: number;
  annotated_image?: string;
  uploaded_image?: string;
  error?: string;
  qr_found?: boolean;
  qr_code?: {
    variantCode: string;
    testId: string;
    studentId: string;
    studentName: string;
    testName: string;
  };
  comparison?: {
    correct: number;
    incorrect: number;
    unanswered: number;
    total: number;
    score: number;
    warning?: string;
    details: Array<{
      question: number;
      student_answer: string | null;
      correct_answer: string;
      is_correct: boolean;
    }>;
  };
}

type Step = 'upload' | 'review';

export default function OMRCheckerPage() {
  const [step, setStep] = useState<Step>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [editedAnswers, setEditedAnswers] = useState<{ [key: number]: string }>({});
  const [isDragging, setIsDragging] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Faqat rasm fayllari', 'error');
      return;
    }
    
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleCameraCapture = (file: File) => {
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setIsCameraOpen(false);
    toast('Rasm muvaffaqiyatli olindi', 'success');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleScan = async () => {
    if (!selectedFile) return toast('Rasm tanlang', 'error');
    setChecking(true);
    setScanProgress(0);
    setEditedAnswers({}); // Очищаем отредактированные ответы при новом сканировании
    
    // Simulate progress animation
    const progressInterval = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return prev;
        }
        return prev + Math.random() * 15;
      });
    }, 200);
    
    try {
      const formData = new FormData();
      formData.append('image', selectedFile);
      const response = await api.post('/omr/check-answers', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      clearInterval(progressInterval);
      setScanProgress(100);
      
      setTimeout(() => {
        setResult(response.data);
        if (response.data.success) {
          setStep('review');
          toast('Muvaffaqiyatli', 'success');
        } else {
          toast(response.data.error || 'Xatolik', 'error');
        }
      }, 500);
    } catch (error) {
      clearInterval(progressInterval);
      toast('Xatolik', 'error');
    } finally {
      setTimeout(() => {
        setChecking(false);
        setScanProgress(0);
      }, 600);
    }
  };

  const handleEditAnswer = (questionNum: number, answer: string) => {
    setEditedAnswers(prev => {
      // Получаем текущий ответ (либо отредактированный, либо из результата)
      const currentAnswer = prev[questionNum] || result?.comparison?.details.find(d => d.question === questionNum)?.student_answer;
      
      // Если нажали на уже выбранный ответ - сбрасываем (делаем пустым)
      if (currentAnswer === answer) {
        return { ...prev, [questionNum]: '-' };
      }
      
      // Иначе устанавливаем новый ответ
      return { ...prev, [questionNum]: answer };
    });
  };

  // Динамический пересчет статистики с учетом отредактированных ответов
  const getUpdatedComparison = () => {
    if (!result?.comparison) return null;
    
    const details = result.comparison.details;
    let correct = 0;
    let incorrect = 0;
    let unanswered = 0;
    
    details.forEach((detail: any) => {
      const currentAnswer = editedAnswers[detail.question] || detail.student_answer;
      
      if (!currentAnswer || currentAnswer === '-') {
        unanswered++;
      } else if (currentAnswer === detail.correct_answer) {
        correct++;
      } else {
        incorrect++;
      }
    });
    
    const total = details.length;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    
    return {
      correct,
      incorrect,
      unanswered,
      total,
      score
    };
  };

  const updatedComparison = getUpdatedComparison();

  const handleSave = async () => {
    if (!result?.qr_code?.testId || !result?.comparison) {
      return toast('Test topilmadi', 'error');
    }
    setSaving(true);
    try {
      const finalAnswers = { ...result.detected_answers, ...editedAnswers };
      
      // Используем обновленную статистику
      const finalComparison = updatedComparison || result.comparison;
      
      await api.post('/omr/save-result', {
        variantCode: result.qr_code.variantCode,
        studentId: result.qr_code.studentId,
        testId: result.qr_code.testId,
        detectedAnswers: finalAnswers,
        comparison: {
          ...result.comparison,
          correct: finalComparison.correct,
          incorrect: finalComparison.incorrect,
          unanswered: finalComparison.unanswered,
          score: finalComparison.score
        },
        annotatedImage: result.annotated_image,
        originalImagePath: result.uploaded_image
      });
      
      toast('Saqlandi', 'success');
      setTimeout(() => resetAll(), 1500);
    } catch (error) {
      toast('Xatolik', 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetAll = () => {
    setStep('upload');
    setSelectedFile(null);
    setPreviewUrl(null);
    setResult(null);
    setEditedAnswers({});
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const getAnnotatedImageUrl = () => {
    if (!result?.annotated_image) return null;
    // Use relative URL so it works in production
    return `/uploads/omr/${result.annotated_image}`;
  };

  return (
    <>
      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCameraCapture}
      />
      
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-md">
                <Scan className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-gray-900">OMR Skaner</h1>
                <p className="text-xs text-gray-500 hidden sm:block">Javob varaqalarini tekshirish</p>
              </div>
            </div>
            
            {/* Step Indicator */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg transition-colors ${
                step === 'upload' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'
              }`}>
                <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  step === 'upload' ? 'bg-white/20' : 'bg-white'
                }`}>1</div>
                <span className="text-xs font-semibold hidden sm:inline">Yuklash</span>
              </div>
              <div className="w-3 sm:w-4 h-0.5 bg-gray-200" />
              <div className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg transition-colors ${
                step === 'review' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'
              }`}>
                <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  step === 'review' ? 'bg-white/20' : 'bg-white'
                }`}>2</div>
                <span className="text-xs font-semibold hidden sm:inline">Natija</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="max-w-3xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
          <Card className="border-0 shadow-xl overflow-hidden">
            <div className="p-4 sm:p-8">
              {!previewUrl ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 sm:p-12 text-center cursor-pointer transition-all ${
                    isDragging 
                      ? 'border-blue-500 bg-blue-50 scale-[1.02]' 
                      : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-5 rounded-2xl flex items-center justify-center transition-all ${
                    isDragging 
                      ? 'bg-blue-600 scale-110' 
                      : 'bg-gradient-to-br from-gray-100 to-gray-200'
                  }`}>
                    <Upload className={`w-8 h-8 sm:w-10 sm:h-10 ${isDragging ? 'text-white' : 'text-gray-500'}`} />
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">
                    Javob varag'ini yuklang
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-600 mb-4 sm:mb-6">
                    Rasmni bu yerga sudrab tashlang yoki bosing
                  </p>
                  <div className="flex items-center justify-center gap-2 mb-4 sm:mb-6 flex-wrap">
                    <span className="px-3 sm:px-4 py-1.5 sm:py-2 bg-white border-2 border-gray-200 rounded-xl text-xs font-semibold text-gray-700">JPG</span>
                    <span className="px-3 sm:px-4 py-1.5 sm:py-2 bg-white border-2 border-gray-200 rounded-xl text-xs font-semibold text-gray-700">PNG</span>
                    <span className="px-3 sm:px-4 py-1.5 sm:py-2 bg-white border-2 border-gray-200 rounded-xl text-xs font-semibold text-gray-700">JPEG</span>
                  </div>
                  
                  {/* Camera Button */}
                  <div className="flex items-center justify-center gap-3 sm:gap-4 my-4 sm:my-6">
                    <div className="h-px flex-1 bg-gray-300"></div>
                    <span className="text-xs sm:text-sm text-gray-500 font-semibold">yoki</span>
                    <div className="h-px flex-1 bg-gray-300"></div>
                  </div>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsCameraOpen(true);
                    }}
                    className="mt-2 px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:shadow-xl hover:scale-105 transition-all duration-200 font-semibold flex items-center gap-2 sm:gap-3 mx-auto text-sm sm:text-base"
                  >
                    <Camera className="w-4 h-4 sm:w-5 sm:h-5" />
                    Kamera orqali suratga olish
                  </button>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="space-y-4 sm:space-y-5">
                  <div className="rounded-xl overflow-hidden border-2 border-gray-200 relative bg-gray-50">
                    <img 
                      src={previewUrl} 
                      alt="Preview" 
                      className="w-full h-auto max-h-[300px] sm:max-h-[400px] object-contain" 
                    />
                  </div>
                  
                  {/* Progress bar during scanning */}
                  {checking && (
                    <div className="space-y-3 bg-blue-50 p-3 sm:p-4 rounded-xl">
                      <div className="flex items-center justify-between">
                        <span className="text-xs sm:text-sm text-gray-700 font-semibold">Tahlil qilinmoqda...</span>
                        <span className="text-base sm:text-lg text-blue-600 font-bold">{Math.round(scanProgress)}%</span>
                      </div>
                      <div className="h-2.5 sm:h-3 bg-white rounded-full overflow-hidden shadow-inner">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-600 to-blue-500 transition-all duration-300 rounded-full"
                          style={{ width: `${scanProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                  
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button 
                      onClick={handleScan} 
                      disabled={checking} 
                      className="flex-1 h-12 sm:h-14 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-sm sm:text-base font-semibold shadow-lg"
                    >
                      {checking ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-2 border-white border-t-transparent mr-2" />
                          Tahlil qilinmoqda...
                        </>
                      ) : (
                        <>
                          <Scan className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                          Skanerlash
                        </>
                      )}
                    </Button>
                    <Button 
                      onClick={resetAll} 
                      variant="outline" 
                      className="h-12 sm:h-14 px-6 sm:px-8 hover:bg-gray-100 border-2 font-semibold text-sm sm:text-base"
                    >
                      Bekor qilish
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Step 2: Review & Edit */}
      {step === 'review' && result && (
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
          <div className="space-y-4 sm:space-y-5">
            {/* Student Info Card - Compact */}
            {result.qr_found && result.qr_code && (
              <Card className="border-0 shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 sm:mb-3">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                          <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-blue-100 font-medium">QR-kod o'qildi</p>
                          <p className="text-xs text-blue-200 truncate">Variant: {result.qr_code.variantCode}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2 sm:space-y-3">
                        {/* Student Name */}
                        <div className="bg-white/10 rounded-lg p-2.5 sm:p-3 backdrop-blur-sm">
                          <p className="text-xs text-blue-100 mb-0.5 sm:mb-1">O'quvchi</p>
                          <p className="text-base sm:text-lg font-bold text-white truncate">{result.qr_code.studentName}</p>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 sm:gap-3">
                          {/* Test Name */}
                          <div className="bg-white/10 rounded-lg p-2.5 sm:p-3 backdrop-blur-sm">
                            <p className="text-xs text-blue-100 mb-0.5 sm:mb-1">
                              {result.qr_code.testName.includes('/') ? 'Sana' : 'Test'}
                            </p>
                            <p className="text-xs sm:text-sm font-semibold text-white truncate">
                              {result.qr_code.testName}
                            </p>
                          </div>
                          
                          {/* Variant Code */}
                          <div className="bg-white/10 rounded-lg p-2.5 sm:p-3 backdrop-blur-sm">
                            <p className="text-xs text-blue-100 mb-0.5 sm:mb-1">Variant</p>
                            <p className="text-base sm:text-xl font-bold text-white tracking-wider truncate">
                              {result.qr_code.variantCode}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )}
            
            {/* Warning if QR not found */}
            {!result.qr_found && (
              <Card className="border-0 shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-yellow-500 to-orange-500 p-4 sm:p-6">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <XCircle className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base sm:text-lg font-bold text-white mb-1">QR-kod topilmadi</h3>
                      <p className="text-xs sm:text-sm text-white/90">
                        Javob varag'ida QR-kod aniqlanmadi. Natijalarni qo'lda kiritishingiz kerak.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Stats Grid */}
            {result.comparison && updatedComparison && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <Card className="border shadow-sm">
                  <div className="bg-blue-50 p-3 sm:p-5 text-center">
                    <div className="text-3xl sm:text-4xl font-bold text-blue-600 mb-1">
                      {updatedComparison.score.toFixed(0)}%
                    </div>
                    <p className="text-xs font-medium text-gray-600">Ball</p>
                  </div>
                </Card>
                
                <Card className="border shadow-sm">
                  <div className="bg-green-50 p-3 sm:p-5 text-center">
                    <div className="text-2xl sm:text-3xl font-bold text-green-600 mb-1">{updatedComparison.correct}</div>
                    <p className="text-xs font-medium text-gray-600">To'g'ri</p>
                  </div>
                </Card>
                
                <Card className="border shadow-sm">
                  <div className="bg-red-50 p-3 sm:p-5 text-center">
                    <div className="text-2xl sm:text-3xl font-bold text-red-600 mb-1">{updatedComparison.incorrect}</div>
                    <p className="text-xs font-medium text-gray-600">Noto'g'ri</p>
                  </div>
                </Card>
                
                <Card className="border shadow-sm">
                  <div className="bg-gray-50 p-3 sm:p-5 text-center">
                    <div className="text-2xl sm:text-3xl font-bold text-gray-600 mb-1">{updatedComparison.unanswered}</div>
                    <p className="text-xs font-medium text-gray-600">Javobsiz</p>
                  </div>
                </Card>
              </div>
            )}

            {/* Edit Answers Section */}
            {result.comparison && (
              <Card className="border-0 shadow-lg overflow-hidden">
                <div className="bg-gray-50 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="w-8 h-8 sm:w-9 sm:h-9 bg-blue-600 rounded-lg flex items-center justify-center">
                        <Edit2 className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h2 className="text-sm sm:text-base font-semibold text-gray-900">Javoblarni tahrirlash</h2>
                        <p className="text-xs text-gray-500 hidden sm:block">Noto'g'ri javoblarni tuzating</p>
                      </div>
                    </div>
                    {Object.keys(editedAnswers).length > 0 && (
                      <div className="flex items-center gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-blue-100 rounded-lg">
                        <span className="text-xs font-semibold text-blue-700">
                          {Object.keys(editedAnswers).length} tahrirlandi
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Убрали Info Panel с предупреждением */}
                
                <div className="p-3 sm:p-6 bg-white">
                  <div className="space-y-2 max-h-[400px] sm:max-h-[500px] overflow-y-auto">
                    {(() => {
                      const totalQuestions = result.comparison.total;
                      
                      return Array.from({ length: totalQuestions }, (_, index) => {
                        const questionNum = index + 1;
                        const detail = result.comparison.details.find(d => d.question === questionNum) || {
                          question: questionNum,
                          student_answer: null,
                          correct_answer: '?',
                          is_correct: false
                        };
                        
                        const currentAnswer = editedAnswers[questionNum] || detail.student_answer || '-';
                        const isEdited = editedAnswers.hasOwnProperty(questionNum);
                        const isCorrect = currentAnswer === detail.correct_answer && currentAnswer !== '-';
                        
                        return (
                          <div
                            key={questionNum}
                            className={`flex items-center gap-2 sm:gap-4 p-2 sm:p-3 rounded-lg border ${
                              isEdited 
                                ? 'bg-blue-50 border-blue-300' :
                              isCorrect 
                                ? 'bg-green-50 border-green-200' :
                              currentAnswer === '-'
                                ? 'bg-gray-50 border-gray-200' :
                                'bg-red-50 border-red-200'
                            }`}
                          >
                            {/* Question Number */}
                            <div className="flex-shrink-0 w-8 sm:w-12">
                              <span className="text-xs sm:text-sm font-bold text-gray-800">{questionNum})</span>
                            </div>
                            
                            {/* Answer Display */}
                            <div className="flex-1 flex items-center gap-1.5 sm:gap-2 min-w-0">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-sm sm:text-base font-bold ${
                                    currentAnswer === '-' ? 'text-gray-400' :
                                    isCorrect ? 'text-green-700' : 'text-red-700'
                                  }`}>
                                    {currentAnswer}
                                  </span>
                                  <span className="text-gray-400">/</span>
                                  <span className="text-xs sm:text-sm font-semibold text-gray-600">
                                    {detail.correct_answer}
                                  </span>
                                </div>
                                {/* Убрали текст (Rasmdan: ...) */}
                              </div>
                            </div>
                            
                            {/* Edit Buttons */}
                            <div className="flex gap-1 sm:gap-1.5 flex-shrink-0">
                              {['A', 'B', 'C', 'D'].map((option) => (
                                <button
                                  key={option}
                                  onClick={() => handleEditAnswer(questionNum, option)}
                                  className={`w-8 h-8 sm:w-10 sm:h-10 text-xs sm:text-sm font-bold rounded-md transition-colors ${
                                    currentAnswer === option
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                                  }`}
                                >
                                  {option}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </Card>
            )}

            {/* Annotated Image */}
            {getAnnotatedImageUrl() && (
              <Card className="border shadow-sm">
                <div className="p-3 sm:p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Tahlil qilingan rasm</h3>
                  <div className="rounded-lg overflow-hidden border border-gray-200">
                    <img src={getAnnotatedImageUrl()!} alt="Result" className="w-full h-auto max-h-[300px] sm:max-h-[400px] object-contain bg-gray-50" />
                  </div>
                </div>
              </Card>
            )}

            {/* Debug Info - показываем RAW данные */}
            {/* Navigation */}
            <div className="flex gap-3">
              <Button 
                onClick={resetAll} 
                variant="outline" 
                className="h-11 sm:h-12 px-4 sm:px-6 text-sm sm:text-base"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Orqaga
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={saving} 
                className="flex-1 h-11 sm:h-12 bg-green-600 hover:bg-green-700 text-sm sm:text-base"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                    Saqlanmoqda...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Natijani saqlash
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
