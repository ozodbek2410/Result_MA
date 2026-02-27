import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FileText, Eye, Shuffle, Printer } from 'lucide-react';
import StudentSelectionModal from './StudentSelectionModal';
import AnswerKeyModal from './AnswerKeyModal';
import { useToast } from '@/hooks/useToast';

interface TestOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  test: any;
  onRefresh?: () => void;
}

type PrintType = 'questions' | 'answers' | 'sheets' | null;

export default function TestOptionsModal({
  isOpen,
  onClose,
  test,
  onRefresh,
}: TestOptionsModalProps) {
  const navigate = useNavigate();
  const [variantCount, setVariantCount] = useState(0);
  const [showStudentSelection, setShowStudentSelection] = useState(false);
  const [showAnswerKeyModal, setShowAnswerKeyModal] = useState(false);
  const [pendingPrintType, setPendingPrintType] = useState<PrintType>(null);
  
  useEffect(() => {
    if (test?._id && isOpen) {
      fetchVariantCount();
    }
  }, [test?._id, isOpen]);

  const [hasShuffledVariants, setHasShuffledVariants] = useState(false);

  const fetchVariantCount = async () => {
    try {
      const endpoint = test?.subjectTests 
        ? `/student-variants/block-test/${test._id}`
        : `/student-variants/test/${test._id}`;
      const { data } = await api.get(endpoint);
      setVariantCount(data.length);
      
      // Проверяем есть ли у вариантов shuffledQuestions
      const hasShuffled = data.length > 0 && data.some((v: any) => v.shuffledQuestions && v.shuffledQuestions.length > 0);
      setHasShuffledVariants(hasShuffled);
      
      console.log('🔍 Variants check:', {
        count: data.length,
        hasShuffledQuestions: hasShuffled,
        firstVariant: data[0] ? {
          hasShuffledQuestions: !!data[0].shuffledQuestions,
          shuffledQuestionsLength: data[0].shuffledQuestions?.length || 0
        } : null
      });
    } catch (error) {
      console.error('Error fetching variant count:', error);
      setVariantCount(0);
      setHasShuffledVariants(false);
    }
  };
  
  const questionCount = test?.questions?.length || test?.subjectTests?.reduce((sum: number, st: any) => {
    return sum + (st.questions?.length || 0);
  }, 0) || 0;

  const handleViewOriginal = () => {
    onClose();
    // Перенаправляем на страницу просмотра оригинальных вопросов
    if (test?.subjectTests) {
      // Блок-тест
      navigate(`/teacher/block-tests/${test._id}/view`);
    } else {
      // Обычный тест
      navigate(`/teacher/tests/${test._id}`);
    }
  };

  const handleViewVariants = () => {
    // Открываем страницу печати вопросов
    setPendingPrintType('questions');
    setShowStudentSelection(true);
  };

  const [isShuffling, setIsShuffling] = useState(false);
  const { success: showSuccess, error: showError } = useToast();

  const handleRegenerateVariants = async () => {
    try {
      setIsShuffling(true);
      
      // Перемешиваем варианты
      if (test?.subjectTests) {
        await api.post(`/block-tests/${test._id}/generate-variants`);
      } else {
        await api.post(`/tests/${test._id}/generate-variants`);
      }
      
      // Обновляем счетчик вариантов
      await fetchVariantCount();
      
      // Обновляем данные теста
      if (onRefresh) {
        await onRefresh();
      }
      
      // Показываем уведомление
      showSuccess('Variantlar muvaffaqiyatli aralashtirildi!');
      
    } catch (error) {
      console.error('Error regenerating variants:', error);
      showError('Xatolik yuz berdi');
    } finally {
      setIsShuffling(false);
    }
  };

  const handlePrintQuestions = () => {
    setPendingPrintType('questions');
    setShowStudentSelection(true);
  };

  const handlePrintAnswers = () => {
    setPendingPrintType('answers');
    setShowStudentSelection(true);
  };

  const handlePrintSheets = () => {
    setPendingPrintType('sheets');
    setShowStudentSelection(true);
  };

  const handleStudentSelectionConfirm = (selectedStudents: any[]) => {
    if (!pendingPrintType) return;
    
    // Сохраняем выбранных учеников в localStorage для использования на странице печати
    localStorage.setItem('selectedStudents', JSON.stringify(selectedStudents));
    
    // Открываем страницу печати в том же окне
    if (test?.subjectTests) {
      navigate(`/teacher/block-tests/${test._id}/print/${pendingPrintType}`);
    } else {
      navigate(`/teacher/tests/${test._id}/print/${pendingPrintType}`);
    }
    
    setPendingPrintType(null);
    onClose();
  };

  return (
    <>
      <Dialog open={isOpen} onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" />
            <span className="text-base sm:text-lg break-words">
              {test?.classNumber}-sinf | {test?.name || (test?.periodMonth && test?.periodYear 
                ? `${['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'][test.periodMonth - 1]} ${test.periodYear}`
                : 'Test')}
            </span>
          </DialogTitle>
        </DialogHeader>

      <DialogContent>
        {isShuffling && (
          <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-50 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <div className="animate-spin w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-lg font-semibold text-gray-900">Aralashtirilmoqda...</p>
              <p className="text-sm text-gray-600 mt-2">Iltimos kuting</p>
            </div>
          </div>
        )}
        <div className="space-y-3">
          {/* Info Banner */}
          {variantCount === 0 ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-red-600" />
                <div>
                  <p className="font-semibold text-red-900">
                    Variantlar yaratilmagan
                  </p>
                  <p className="text-sm text-red-700">
                    Variantlar yaratish uchun "Aralashtirib berish" tugmasini bosing
                  </p>
                </div>
              </div>
            </div>
          ) : !hasShuffledVariants ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Shuffle className="w-5 h-5 text-yellow-600" />
                <div>
                  <p className="font-semibold text-yellow-900">
                    ⚠️ Javob variantlari aralashtirilmagan!
                  </p>
                  <p className="text-sm text-yellow-700">
                    Barcha o'quvchilar uchun javoblar bir xil tartibda. "Aralashtirib berish" tugmasini bosing.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-semibold text-green-900">
                    ✅ {variantCount} ta variant tayyor
                  </p>
                  <p className="text-sm text-green-700">
                    Savollar va javob variantlari har bir o'quvchi uchun aralashtirilgan
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Answer Sheets - renamed to Javoblar kaliti */}
          <button
            onClick={() => setShowAnswerKeyModal(true)}
            className="w-full flex items-center justify-between p-4 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <h3 className="font-bold text-gray-900">Javoblar kaliti</h3>
                <p className="text-sm text-gray-600">O'quvchilar to'ldirishi uchun bo'sh varaqalar</p>
              </div>
            </div>
            <Eye className="w-5 h-5 text-green-600" />
          </button>

          {/* Print Options */}
          <div className="border-t pt-3 mt-3">
            <h3 className="font-bold text-gray-900 mb-3 text-xs sm:text-sm uppercase text-gray-500">CHOP ETISH</h3>
            <div className="space-y-2">
              {/* Print Questions */}
              <button
                onClick={handlePrintQuestions}
                className="w-full flex items-center justify-between p-2 sm:p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Printer className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="font-semibold text-gray-900 text-xs sm:text-sm truncate">Savollar va javoblar</p>
                    <p className="text-xs text-gray-600 hidden sm:block">Har bir o'quvchi uchun test varaqasi</p>
                  </div>
                </div>
                <Printer className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0" />
              </button>
              {/* Print Variants */}
              <button
                onClick={handlePrintSheets}
                className="w-full flex items-center justify-between p-2 sm:p-3 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="font-semibold text-gray-900 text-xs sm:text-sm truncate">Javoblar varaqasi</p>
                    <p className="text-xs text-gray-600 hidden sm:block">O'quvchilar to'ldirishi uchun</p>
                  </div>
                </div>
                <Printer className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 flex-shrink-0" />
              </button>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t">
            <Button
              variant="outline"
              onClick={onClose}
              className="w-full sm:flex-1"
            >
              Yopish
            </Button>
            <Button
              onClick={handleRegenerateVariants}
              disabled={isShuffling}
              className="w-full sm:flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Shuffle className="w-4 h-4 mr-2" />
              Aralashtirib berish
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Student Selection Modal */}
    <StudentSelectionModal
      isOpen={showStudentSelection}
      onClose={() => {
        setShowStudentSelection(false);
        setPendingPrintType(null);
      }}
      groupId={test?.groupId?._id || test?.groupId}
      onConfirm={handleStudentSelectionConfirm}
      title="Savollar chop etish"
    />

    {/* Answer Key Modal */}
    <AnswerKeyModal
      isOpen={showAnswerKeyModal}
      onClose={() => setShowAnswerKeyModal(false)}
      test={test}
    />
  </>
  );
}
