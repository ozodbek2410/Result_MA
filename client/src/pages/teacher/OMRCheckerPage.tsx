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
    
    // Rasmni asl holatida saqlash (oq-qora formatga o'tkazmaslik)
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleCameraCapture = (file: File) => {
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setIsCameraOpen(false);
    toast('Rasm muvaffaqiyatli olindi', 'success');
  };

  const convertToBlackAndWhite = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Canvas yaratish
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = img.width;
        canvas.height = img.height;

        // Rasmni chizish
        ctx.drawImage(img, 0, 0);

        // Piksellarni olish
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Oq-qora formatga o'tkazish (grayscale)
        for (let i = 0; i < data.length; i += 4) {
          const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
          data[i] = avg;     // Red
          data[i + 1] = avg; // Green
          data[i + 2] = avg; // Blue
        }

        // Yangilangan piksellarni qaytarish
        ctx.putImageData(imageData, 0, 0);

        // Canvas dan Blob yaratish
        canvas.toBlob((blob) => {
          if (!blob) return;
          
          // Yangi File yaratish
          const bwFile = new File([blob], file.name, { type: 'image/jpeg' });
          setSelectedFile(bwFile);
          setPreviewUrl(URL.createObjectURL(bwFile));
        }, 'image/jpeg', 0.95);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
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
      // Rasmni asl holatida saqlash
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleScan = async () => {
    if (!selectedFile) return toast('Rasm tanlang', 'error');
    setChecking(true);
    setScanProgress(0);
    
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
    setEditedAnswers(prev => ({ ...prev, [questionNum]: answer }));
  };

  const handleSave = async () => {
    if (!result?.qr_code?.testId || !result?.comparison) {
      return toast('Test topilmadi', 'error');
    }
    setSaving(true);
    try {
      const finalAnswers = { ...result.detected_answers, ...editedAnswers };
      await api.post('/omr/save-result', {
        variantCode: result.qr_code.variantCode,
        studentId: result.qr_code.studentId,
        testId: result.qr_code.testId,
        detectedAnswers: finalAnswers,
        comparison: result.comparison,
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
      
      <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Camera className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">OMR Skaner</h1>
                <p className="text-xs text-gray-500">Javob varaqalarini tekshirish</p>
              </div>
            </div>
            
            {/* Step Indicator */}
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                step === 'upload' ? 'bg-blue-50 text-blue-600' : 'text-gray-400'
              }`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                  step === 'upload' ? 'bg-blue-600 text-white' : 'bg-gray-200'
                }`}>1</div>
                <span className="text-xs font-medium hidden sm:inline">Yuklash</span>
              </div>
              <div className="w-6 h-px bg-gray-200" />
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                step === 'review' ? 'bg-blue-50 text-blue-600' : 'text-gray-400'
              }`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                  step === 'review' ? 'bg-blue-600 text-white' : 'bg-gray-200'
                }`}>2</div>
                <span className="text-xs font-medium hidden sm:inline">Natija</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="max-w-4xl mx-auto px-6 py-8">
          <Card className="border shadow-sm">
            <div className="p-4 sm:p-6 lg:p-8">
              {!previewUrl ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-16 text-center cursor-pointer transition-colors ${
                    isDragging 
                      ? 'border-blue-400 bg-blue-50' 
                      : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-20 h-20 mx-auto mb-4 rounded-lg flex items-center justify-center ${
                    isDragging 
                      ? 'bg-blue-600' 
                      : 'bg-gray-200'
                  }`}>
                    <Upload className={`w-10 h-10 ${isDragging ? 'text-white' : 'text-gray-400'}`} />
                  </div>
                  <p className="text-base font-semibold text-gray-900 mb-2">
                    Javob varag'ini yuklang
                  </p>
                  <p className="text-sm text-gray-500 mb-4">
                    Rasmni bu yerga sudrab tashlang yoki bosing
                  </p>
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <span className="px-3 py-1 bg-white border border-gray-200 rounded-lg text-xs text-gray-600">JPG</span>
                    <span className="px-3 py-1 bg-white border border-gray-200 rounded-lg text-xs text-gray-600">PNG</span>
                  </div>
                  
                  {/* Camera Button */}
                  <div className="flex items-center justify-center gap-3 mt-6">
                    <div className="h-px flex-1 bg-gray-200"></div>
                    <span className="text-xs text-gray-500 font-medium">yoki</span>
                    <div className="h-px flex-1 bg-gray-200"></div>
                  </div>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsCameraOpen(true);
                    }}
                    className="mt-4 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all duration-200 font-medium flex items-center gap-2 mx-auto"
                  >
                    <Camera className="w-5 h-5" />
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
                <div className="space-y-5">
                  <div className="rounded-lg overflow-hidden border border-gray-200 relative">
                    <img 
                      src={previewUrl} 
                      alt="Preview" 
                      className="w-full h-auto max-h-[350px] object-contain bg-gray-50" 
                    />
                    <div className="absolute top-3 right-3 bg-gray-800 text-white px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Oq-qora formatga o'tkazildi
                    </div>
                  </div>
                  
                  {/* Progress bar during scanning */}
                  {checking && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 font-medium">Tahlil qilinmoqda...</span>
                        <span className="text-blue-600 font-bold">{Math.round(scanProgress)}%</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-600 transition-all duration-300"
                          style={{ width: `${scanProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                  
                  <div className="flex gap-3">
                    <Button 
                      onClick={handleScan} 
                      disabled={checking} 
                      className="flex-1 h-12 bg-blue-600 hover:bg-blue-700"
                    >
                      {checking ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                          Tahlil qilinmoqda...
                        </>
                      ) : (
                        <>
                          <Scan className="w-4 h-4 mr-2" />
                          Skanerlash
                        </>
                      )}
                    </Button>
                    <Button 
                      onClick={resetAll} 
                      variant="outline" 
                      className="h-12 px-6 hover:bg-gray-50"
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
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="space-y-5">
            {/* Student Info Card - Enhanced */}
            {result.qr_found && result.qr_code && (
              <Card className="border-0 shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                          <CheckCircle className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <p className="text-xs text-blue-100 font-medium">QR-kod muvaffaqiyatli o'qildi</p>
                          <p className="text-xs text-blue-200">Variant: {result.qr_code.variantCode}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        {/* Student Name */}
                        <div className="bg-white/10 rounded-lg p-3 backdrop-blur-sm">
                          <p className="text-xs text-blue-100 mb-1">O'quvchi</p>
                          <p className="text-lg font-bold text-white">{result.qr_code.studentName}</p>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                          {/* Test Name or Date */}
                          <div className="bg-white/10 rounded-lg p-3 backdrop-blur-sm">
                            <p className="text-xs text-blue-100 mb-1">
                              {result.qr_code.testName.includes('/') ? 'Test sanasi' : 'Test nomi'}
                            </p>
                            <p className="text-sm font-semibold text-white truncate">
                              {result.qr_code.testName}
                            </p>
                          </div>
                          
                          {/* Variant Code */}
                          <div className="bg-white/10 rounded-lg p-3 backdrop-blur-sm">
                            <p className="text-xs text-blue-100 mb-1">Variant kodi</p>
                            <p className="text-xl font-bold text-white tracking-wider">
                              {result.qr_code.variantCode}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* QR Icon */}
                    <div className="ml-4">
                      <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center shadow-lg">
                        <svg className="w-10 h-10 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zm-2 8h8v8H3v-8zm2 2v4h4v-4H5zm8-12v8h8V3h-8zm6 6h-4V5h4v4zm-6 4h2v2h-2v-2zm2 2h2v2h-2v-2zm-2 2h2v2h-2v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2zm2-2h2v2h-2v-2z"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )}
            
            {/* Warning if QR not found */}
            {!result.qr_found && (
              <Card className="border-0 shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-yellow-500 to-orange-500 p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                      <XCircle className="w-7 h-7 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-white mb-1">QR-kod topilmadi</h3>
                      <p className="text-sm text-white/90">
                        Javob varag'ida QR-kod aniqlanmadi. Natijalarni qo'lda kiritishingiz kerak bo'ladi.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Stats Grid */}
            {result.comparison && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card className="border shadow-sm">
                  <div className="bg-blue-50 p-5 text-center">
                    <div className="text-4xl font-bold text-blue-600 mb-1">
                      {result.comparison.score.toFixed(0)}%
                    </div>
                    <p className="text-xs font-medium text-gray-600">Umumiy ball</p>
                  </div>
                </Card>
                
                <Card className="border shadow-sm">
                  <div className="bg-green-50 p-5 text-center">
                    <div className="text-3xl font-bold text-green-600 mb-1">{result.comparison.correct}</div>
                    <p className="text-xs font-medium text-gray-600">To'g'ri</p>
                  </div>
                </Card>
                
                <Card className="border shadow-sm">
                  <div className="bg-red-50 p-5 text-center">
                    <div className="text-3xl font-bold text-red-600 mb-1">{result.comparison.incorrect}</div>
                    <p className="text-xs font-medium text-gray-600">Noto'g'ri</p>
                  </div>
                </Card>
                
                <Card className="border shadow-sm">
                  <div className="bg-gray-50 p-5 text-center">
                    <div className="text-3xl font-bold text-gray-600 mb-1">{result.comparison.unanswered}</div>
                    <p className="text-xs font-medium text-gray-600">Javobsiz</p>
                  </div>
                </Card>
              </div>
            )}

            {/* Edit Answers Section */}
            {result.comparison && (
              <Card className="border-0 shadow-lg overflow-hidden">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
                        <Edit2 className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h2 className="text-base font-semibold text-gray-900">Javoblarni tahrirlash</h2>
                        <p className="text-xs text-gray-500">Noto'g'ri javoblarni tuzating</p>
                      </div>
                    </div>
                    {Object.keys(editedAnswers).length > 0 && (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 rounded-lg">
                        <span className="text-xs font-semibold text-blue-700">
                          {Object.keys(editedAnswers).length} tahrirlandi
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="p-6 bg-white">
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {/* Barcha savollarni ko'rsatish */}
                    {(() => {
                      // Backend allaqachon to'g'ri qiymatni hisoblagan
                      const totalQuestions = result.comparison.total;
                      
                      console.log('📊 Frontend: Total questions:', totalQuestions);
                      console.log('📊 Frontend: QR found:', result.qr_found);
                      console.log('📊 Frontend: Details count:', result.comparison.details.length);
                      
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
                            className={`flex items-center gap-4 p-3 rounded-lg border ${
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
                            <div className="flex-shrink-0 w-12">
                              <span className="text-sm font-bold text-gray-800">{questionNum})</span>
                            </div>
                            
                            {/* Answer Display */}
                            <div className="flex-1 flex items-center gap-2">
                              <span className={`text-base font-bold ${
                                currentAnswer === '-' ? 'text-gray-400' :
                                isCorrect ? 'text-green-700' : 'text-red-700'
                              }`}>
                                {currentAnswer}
                              </span>
                              <span className="text-gray-400">/</span>
                              <span className="text-sm font-semibold text-gray-600">
                                {detail.correct_answer}
                              </span>
                            </div>
                            
                            {/* Edit Buttons */}
                            <div className="flex gap-1.5">
                              {['A', 'B', 'C', 'D'].map((option) => (
                                <button
                                  key={option}
                                  onClick={() => handleEditAnswer(questionNum, option)}
                                  className={`w-10 h-10 text-sm font-bold rounded-md transition-colors ${
                                    currentAnswer === option
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                                  }`}
                                >
                                  {option}
                                </button>
                              ))}
                              {/* Clear button */}
                              <button
                                onClick={() => {
                                  const newEdited = { ...editedAnswers };
                                  delete newEdited[questionNum];
                                  setEditedAnswers(newEdited);
                                }}
                                className="w-10 h-10 text-sm font-bold rounded-md bg-white text-gray-500 border border-gray-300 hover:bg-gray-100"
                                title="Tozalash"
                              >
                                <XCircle className="w-4 h-4 mx-auto" />
                              </button>
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
                <div className="p-5">
                  <div className="rounded-lg overflow-hidden border border-gray-200">
                    <img src={getAnnotatedImageUrl()!} alt="Result" className="w-full h-auto max-h-[400px] object-contain bg-gray-50" />
                  </div>
                </div>
              </Card>
            )}

            {/* Navigation */}
            <div className="flex gap-3">
              <Button 
                onClick={resetAll} 
                variant="outline" 
                className="h-12 px-6"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Orqaga
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={saving} 
                className="flex-1 h-12 bg-green-600 hover:bg-green-700"
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
