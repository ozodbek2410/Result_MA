import { useState, useRef, useEffect } from 'react';
import { Upload, CheckCircle, XCircle, Scan, Save, ArrowLeft, Edit2, Camera } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useToast } from '../../hooks/useToast';
import { CameraModal } from '../../components/CameraModal';
import { LiveScannerModal } from '../../components/LiveScannerModal';
import { ManualStudentSelector } from '../../components/ManualStudentSelector';
import api from '../../lib/api';

interface CheckResult {
  success: boolean;
  detected_answers?: { [key: number]: string };
  total_questions?: number;
  annotated_image?: string;
  uploaded_image?: string;
  error?: string;
  detection_rate?: number;
  avg_confidence?: number;
  grid_method?: string;
  quality_warning?: string;
  qr_found?: boolean;
  qr_code?: {
    variantCode: string;
    testId: string;
    studentId: string;
    studentName: string;
    testName: string;
    certSubjects?: { subjectId: string; percentage: number; subjectName?: string }[];
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
    subjectBreakdown?: Array<{
      subjectId?: string;
      name: string;
      correct: number;
      incorrect: number;
      unanswered: number;
      total: number;
      score: number;
      isCertificate?: boolean;
      certPercent?: number;
    }>;
    /** Javobsiz savol raqamlari ro'yxati — UI da ko'rsatish uchun */
    unansweredQuestions?: number[];
    /** Sertifikat fan savollari — getUpdatedComparison ularni skip qiladi (avto ball) */
    certQuestions?: number[];
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
  const [isLiveScannerOpen, setIsLiveScannerOpen] = useState(false);
  const [isStudentSelectorOpen, setIsStudentSelectorOpen] = useState(false);
  const [duplicateModal, setDuplicateModal] = useState<{
    show: boolean;
    existingResult: { studentName: string; totalPoints: number; maxPoints: number; percentage: number; scannedAt: string } | null;
    pendingSaveData: Record<string, unknown> | null;
  }>({ show: false, existingResult: null, pendingSaveData: null });

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

  const handleLiveScanResult = (scanResult: CheckResult, file: File) => {
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setResult(scanResult);
    if (scanResult.success) {
      setStep('review');
    }
  };

  // Manual student tanlangan holat — /omr/manual-assign ga detectedAnswers yuborish
  const handleManualStudentSelect = async (studentId: string) => {
    if (!result?.detected_answers) {
      toast('Avval skanerdan o\'tkazing', 'error');
      return;
    }
    try {
      // detected_answers — obyekt {1: "A", 2: "B", ...}
      const response = await api.post('/omr/manual-assign', {
        studentId,
        detectedAnswers: result.detected_answers,
      });
      if (response.data?.found) {
        // Mavjud result'ni manual natija bilan yangilash (rasm saqlanadi)
        setResult(prev => ({
          ...prev,
          ...response.data,
          // Eski rasmni saqlash
          annotated_image: prev?.annotated_image,
          uploaded_image: prev?.uploaded_image,
          detection_rate: prev?.detection_rate,
        }));
        setIsStudentSelectorOpen(false);
        toast('O\'quvchi tanlandi', 'success');
      } else {
        toast(response.data?.error || 'Bu student uchun variant topilmadi', 'error');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(msg || 'Manual tanlashda xato', 'error');
    }
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

  // Sertifikat savol raqamlari — Set sifatida (tezroq lookup)
  const certQuestionSet = new Set(result?.comparison?.certQuestions || []);

  // Динамический пересчет — sertifikat savollar OMR dan emas, avto ball
  const getUpdatedComparison = () => {
    if (!result?.comparison) return null;

    const details = result.comparison.details;
    const subjectBreakdown = result.comparison.subjectBreakdown || [];

    // 1. Sertifikat fanlardan kelgan avto ball (server tomonidan hisoblangan)
    let certCorrect = 0;
    let certIncorrect = 0;
    let certTotal = 0;
    for (const s of subjectBreakdown) {
      if (s.isCertificate) {
        certCorrect += s.correct;
        certIncorrect += s.incorrect;
        certTotal += s.total;
      }
    }

    // 2. OMR fanlardan kelgan ball — faqat sertifikat BO'LMAGAN savollar
    let omrCorrect = 0;
    let omrIncorrect = 0;
    let omrUnanswered = 0;
    let omrTotal = 0;

    details.forEach((detail) => {
      // Sertifikat savol bo'lsa skip — uning ballini certCorrect dan oldik
      if (certQuestionSet.has(detail.question)) return;

      omrTotal++;
      const currentAnswer = editedAnswers[detail.question] || detail.student_answer;

      if (!currentAnswer || currentAnswer === '-') {
        omrUnanswered++;
      } else if (currentAnswer === detail.correct_answer) {
        omrCorrect++;
      } else {
        omrIncorrect++;
      }
    });

    const correct = omrCorrect + certCorrect;
    const incorrect = omrIncorrect + certIncorrect;
    const unanswered = omrUnanswered;
    const total = omrTotal + certTotal;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;

    return {
      correct,
      incorrect,
      unanswered,
      total,
      score,
      certCorrect,
      certTotal,
    };
  };

  const updatedComparison = getUpdatedComparison();

  const buildSaveData = (forceOverwrite = false) => {
    if (!result?.qr_code?.testId || !result?.comparison) return null;
    const originalDetected = result.detected_answers || {};
    const finalComparison = updatedComparison || result.comparison;
    const finalDetails = result.comparison.details.map((detail) => {
      const currentAnswer = editedAnswers[detail.question] || detail.student_answer;
      const effectiveAnswer = (!currentAnswer || currentAnswer === '-') ? null : currentAnswer;
      return {
        ...detail,
        student_answer: effectiveAnswer,
        is_correct: effectiveAnswer ? effectiveAnswer === detail.correct_answer : false,
      };
    });
    return {
      variantCode: result.qr_code.variantCode,
      studentId: result.qr_code.studentId,
      testId: result.qr_code.testId,
      detectedAnswers: originalDetected,
      comparison: {
        ...result.comparison,
        correct: finalComparison.correct,
        incorrect: finalComparison.incorrect,
        unanswered: finalComparison.unanswered,
        score: finalComparison.score,
        details: finalDetails,
      },
      annotatedImage: result.annotated_image,
      originalImagePath: result.uploaded_image,
      forceOverwrite,
    };
  };

  const handleSave = async () => {
    const data = buildSaveData(false);
    if (!data) return toast('Test topilmadi', 'error');
    setSaving(true);
    try {
      await api.post('/omr/save-result', data);
      toast('Saqlandi', 'success');
      setTimeout(() => resetAll(), 1500);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status: number; data: { error: string; existingResult: typeof duplicateModal.existingResult } } };
      if (axiosErr?.response?.status === 409 && axiosErr?.response?.data?.error === 'duplicate') {
        setDuplicateModal({
          show: true,
          existingResult: axiosErr.response.data.existingResult,
          pendingSaveData: data,
        });
      } else {
        toast('Xatolik', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleForceOverwrite = async () => {
    const data = duplicateModal.pendingSaveData;
    if (!data) return;
    setDuplicateModal({ show: false, existingResult: null, pendingSaveData: null });
    setSaving(true);
    try {
      await api.post('/omr/save-result', { ...data, forceOverwrite: true });
      toast('Natija yangilandi', 'success');
      setTimeout(() => resetAll(), 1500);
    } catch {
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
      <LiveScannerModal
        isOpen={isLiveScannerOpen}
        onClose={() => setIsLiveScannerOpen(false)}
        onResult={handleLiveScanResult}
      />
      <ManualStudentSelector
        isOpen={isStudentSelectorOpen}
        onClose={() => setIsStudentSelectorOpen(false)}
        onSelect={handleManualStudentSelect}
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
                      setIsLiveScannerOpen(true);
                    }}
                    className="mt-2 px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:shadow-xl hover:scale-105 transition-all duration-200 font-semibold flex items-center gap-2 sm:gap-3 mx-auto text-sm sm:text-base"
                  >
                    <Scan className="w-4 h-4 sm:w-5 sm:h-5" />
                    Skanerlash
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
                        {/* Student Name — bosilsa qo'lda o'zgartirish mumkin */}
                        <button
                          onClick={() => setIsStudentSelectorOpen(true)}
                          className="w-full bg-white/10 hover:bg-white/20 active:bg-white/25 rounded-lg p-2.5 sm:p-3 backdrop-blur-sm text-left transition-colors group"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-blue-100 mb-0.5 sm:mb-1">O'quvchi (o'zgartirish uchun bosing)</p>
                              <p className="text-base sm:text-lg font-bold text-white truncate">{result.qr_code.studentName}</p>
                            </div>
                            <Edit2 className="w-4 h-4 text-blue-200 group-hover:text-white flex-shrink-0 transition-colors" />
                          </div>
                        </button>
                        
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
            
            {/* Warning if QR not found — endi "O'quvchini qo'lda tanlash" tugmasi bilan */}
            {!result.qr_found && (
              <Card className="border-0 shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-yellow-500 to-orange-500 p-4 sm:p-6">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <XCircle className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base sm:text-lg font-bold text-white mb-1">QR-kod topilmadi yoki DB da yo'q</h3>
                      <p className="text-xs sm:text-sm text-white/90 mb-3">
                        Bu varaq eski variant yoki boshqa tizimdan chiqarilgan. O'quvchini qo'lda tanlashingiz mumkin.
                      </p>
                      <button
                        onClick={() => setIsStudentSelectorOpen(true)}
                        className="px-4 py-2 bg-white hover:bg-gray-50 text-orange-600 font-semibold rounded-lg text-sm transition-colors shadow-sm"
                      >
                        O'quvchini qo'lda tanlash
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Detection Rate */}
            {result.detection_rate != null && (
              <Card className="border shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 flex items-center gap-3">
                  <span className="text-xs font-medium text-gray-500 whitespace-nowrap">Aniqlik</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        result.detection_rate >= 80 ? 'bg-green-500' :
                        result.detection_rate >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, result.detection_rate)}%` }}
                    />
                  </div>
                  <span className={`text-sm font-bold ${
                    result.detection_rate >= 80 ? 'text-green-600' :
                    result.detection_rate >= 60 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {Math.round(result.detection_rate)}%
                  </span>
                </div>
              </Card>
            )}

            {/* Quality Warning */}
            {result.quality_warning && (
              <Card className="border border-orange-300 shadow-sm bg-orange-50">
                <div className="px-4 py-3 flex items-center gap-2">
                  <span className="text-orange-500 text-lg">⚠️</span>
                  <span className="text-sm text-orange-700 font-medium">{result.quality_warning}</span>
                </div>
              </Card>
            )}

            {/* Confidence Warning — qayta skanerlash tavsiyasi */}
            {result.avg_confidence != null && result.avg_confidence < 0.7 && (
              <Card className="border border-red-300 shadow-sm bg-red-50">
                <div className="px-4 py-3 flex items-center gap-2">
                  <span className="text-red-500 text-lg">⚠️</span>
                  <span className="text-sm text-red-700 font-medium">
                    Ishonchlilik past ({(result.avg_confidence * 100).toFixed(0)}%). Yaxshiroq yoritishda qayta skanerlang.
                  </span>
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

            {/* Sertifikat avto ball blok — Stats card dan keyin */}
            {updatedComparison && updatedComparison.certTotal > 0 && (
              <Card className="border-2 border-amber-300 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-amber-50 to-yellow-50 p-3 sm:p-4">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl">📜</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                        Sertifikat avto ball
                      </p>
                      <p className="text-sm sm:text-base text-amber-900 font-bold">
                        {updatedComparison.certCorrect} / {updatedComparison.certTotal} ta savol avtomatik to'g'ri (OMR ta'sirsiz)
                      </p>
                    </div>
                    <div className="text-2xl sm:text-3xl font-bold text-amber-700">
                      {updatedComparison.certTotal > 0
                        ? Math.round((updatedComparison.certCorrect / updatedComparison.certTotal) * 100)
                        : 0}%
                    </div>
                  </div>
                  {result.comparison?.subjectBreakdown && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {result.comparison.subjectBreakdown
                        .filter(s => s.isCertificate)
                        .map((s, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 bg-white border border-amber-300 rounded-md text-xs font-semibold text-amber-800"
                          >
                            {s.name}: {s.certPercent}% ({s.correct}/{s.total})
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Javobsiz savol raqamlari — clickable badge list (sertifikat savollar SKIP) */}
            {updatedComparison && (() => {
              // Dinamik javobsiz raqamlar — sertifikat savollarni qo'shmaymiz (avto)
              const unansweredNums = result.comparison?.details
                ?.filter(d => {
                  if (certQuestionSet.has(d.question)) return false;
                  const current = editedAnswers[d.question] ?? d.student_answer;
                  return !current || current === '-';
                })
                .map(d => d.question) || [];
              if (unansweredNums.length === 0) return null;
              return (
                <Card className="border border-gray-200 shadow-sm">
                  <div className="px-4 py-3 sm:px-5 sm:py-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 text-xs font-bold">
                        ?
                      </div>
                      <p className="text-sm font-semibold text-gray-700">
                        Javobsiz savollar ({unansweredNums.length} ta):
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {unansweredNums.map(n => (
                        <button
                          key={n}
                          onClick={() => {
                            const el = document.getElementById(`q-${n}`);
                            if (el) {
                              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              el.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
                              setTimeout(() => el.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2'), 2000);
                            }
                          }}
                          className="px-2.5 py-1 bg-gray-100 hover:bg-blue-100 active:bg-blue-200 text-gray-700 hover:text-blue-700 rounded-md text-xs font-semibold transition-colors"
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </Card>
              );
            })()}

            {/* Subject Breakdown Cards — har fan uchun: ball, to'g'ri, xato, javobsiz, sertifikat */}
            {result.comparison?.subjectBreakdown && result.comparison.subjectBreakdown.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-gray-700 mb-2 sm:mb-3 px-1">Fanlar bo'yicha natijalar</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {result.comparison.subjectBreakdown.map((subject, idx) => {
                    const pct = subject.total > 0 ? Math.round((subject.correct / subject.total) * 100) : 0;
                    const isCert = subject.isCertificate;
                    // Sertifikat bo'lsa — amber ranglar (o'quvchi javob bermagan bo'lsa ham avtomatik ball)
                    const color = isCert ? 'amber' : pct >= 70 ? 'green' : pct >= 40 ? 'yellow' : 'red';
                    const colors: Record<string, { bg: string; bar: string; badge: string; border: string }> = {
                      amber: { bg: 'bg-amber-50', bar: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800', border: 'border-amber-300' },
                      green: { bg: 'bg-green-50', bar: 'bg-green-500', badge: 'bg-green-100 text-green-700', border: 'border-gray-200' },
                      yellow: { bg: 'bg-yellow-50', bar: 'bg-yellow-500', badge: 'bg-yellow-100 text-yellow-700', border: 'border-gray-200' },
                      red: { bg: 'bg-red-50', bar: 'bg-red-500', badge: 'bg-red-100 text-red-700', border: 'border-gray-200' },
                    };
                    const c = colors[color];
                    return (
                      <Card key={idx} className={`border ${c.border} shadow-sm overflow-hidden`}>
                        <div className={`${c.bg} p-3 sm:p-4`}>
                          <div className="flex items-center justify-between mb-2 gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {isCert && <span className="text-base flex-shrink-0">📜</span>}
                              <h3 className="text-sm font-bold text-gray-900 truncate">{subject.name}</h3>
                            </div>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${c.badge}`}>
                              {isCert ? `${subject.certPercent || pct}% sertifikat` : `${pct}%`}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-700 mb-2 flex-wrap">
                            <span className="text-green-600 font-semibold">{subject.correct} to'g'ri</span>
                            <span className="text-red-600 font-semibold">{subject.incorrect} xato</span>
                            {subject.unanswered > 0 && (
                              <span className="text-gray-500 font-semibold">{subject.unanswered} javobsiz</span>
                            )}
                            <span className="text-gray-500 ml-auto">{subject.total} ta</span>
                          </div>
                          <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${c.bar} rounded-full transition-all`}
                              style={{ width: `${isCert ? (subject.certPercent || pct) : pct}%` }}
                            />
                          </div>
                          {isCert && (
                            <p className="text-[10px] text-amber-700 mt-1.5">Sertifikat — avtomatik ball, OMR ta'sirsiz</p>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
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
                        const isCertQ = certQuestionSet.has(questionNum);

                        return (
                          <div
                            key={questionNum}
                            id={`q-${questionNum}`}
                            className={`flex items-center gap-2 sm:gap-4 p-2 sm:p-3 rounded-lg border transition-shadow ${
                              isCertQ
                                ? 'bg-amber-50 border-amber-300' :
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
                              {isCertQ ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-base">📜</span>
                                  <span className="text-xs sm:text-sm font-semibold text-amber-800">
                                    Sertifikat (avto ball)
                                  </span>
                                </div>
                              ) : (
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
                                </div>
                              )}
                            </div>

                            {/* Edit Buttons — sertifikat savol uchun yashirish */}
                            {!isCertQ && (
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
                            )}
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

    {/* Duplikat natija modal */}
    {duplicateModal.show && duplicateModal.existingResult && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full overflow-hidden animate-fade-in">
          <div className="bg-amber-50 border-b border-amber-200 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-amber-900">Natija allaqachon mavjud!</h3>
              </div>
            </div>
          </div>
          <div className="px-5 py-4 space-y-3">
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{duplicateModal.existingResult.studentName}</span> uchun oldingi natija:
            </p>
            <div className="bg-gray-50 rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Ball:</span>
                <span className="font-semibold">{duplicateModal.existingResult.totalPoints}/{duplicateModal.existingResult.maxPoints}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Foiz:</span>
                <span className="font-semibold">{Math.round(duplicateModal.existingResult.percentage)}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Sana:</span>
                <span className="font-semibold">{new Date(duplicateModal.existingResult.scannedAt).toLocaleDateString('uz')}</span>
              </div>
            </div>
            <p className="text-sm text-amber-700 font-medium">Ustiga yozilsinmi?</p>
          </div>
          <div className="flex gap-2 px-5 pb-5">
            <button
              onClick={() => setDuplicateModal({ show: false, existingResult: null, pendingSaveData: null })}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Bekor qilish
            </button>
            <button
              onClick={handleForceOverwrite}
              className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Ustiga yozish
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
