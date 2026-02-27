import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FileText, Eye, Shuffle, Printer } from 'lucide-react';
import { useState } from 'react';
import AnswerKeyModal from './AnswerKeyModal';

interface BlockTestActionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  blockTest: any;
  studentCount: number;
  onViewAnswerKeys: () => void;
  onViewAllTests: () => void;
  onViewAnswerSheets: () => void;
  onPrintQuestions: () => void;
  onPrintAnswers: () => void;
  onShuffle: () => void;
  isShuffling?: boolean;
}

export default function BlockTestActionsModal({
  isOpen,
  onClose,
  blockTest,
  studentCount,
  onViewAnswerKeys,
  onViewAllTests,
  onViewAnswerSheets,
  onPrintQuestions,
  onPrintAnswers,
  onShuffle,
  isShuffling = false,
}: BlockTestActionsModalProps) {
  const [showAnswerKeyModal, setShowAnswerKeyModal] = useState(false);

  return (
    <>
    <Dialog open={isOpen} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>
          {blockTest?.classNumber}-sinf | Yuklangan test
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
        <div className="space-y-4">
          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-blue-600" />
              <div>
                <p className="font-semibold text-blue-900">
                  {studentCount} ta o'quvchi
                </p>
                <p className="text-sm text-blue-700">
                  Testni ko'rish yoki chop etish uchun variantni tanlang
                </p>
              </div>
            </div>
          </div>

          {/* View Options */}
          <div className="space-y-2">
            {/* Answer Sheets - renamed to Javoblar kaliti */}
            <div 
              onClick={() => setShowAnswerKeyModal(true)}
              className="bg-green-50 border border-green-200 rounded-lg p-4 hover:bg-green-100 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">Javoblar kaliti</h3>
                    <p className="text-sm text-gray-600">O'quvchilar to'ldirishi uchun bo'sh varaqalar</p>
                  </div>
                </div>
                <Eye className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </div>

          {/* Print Options */}
          <div className="border-t pt-4">
            <h3 className="font-bold text-gray-900 mb-3">CHOP ETISH</h3>
            <div className="space-y-2">
              {/* Print Questions */}
              <button
                onClick={onPrintQuestions}
                className="w-full flex items-center justify-between p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                    <Printer className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-gray-900">Savollar va javoblar</p>
                    <p className="text-xs text-gray-600">Har bir o'quvchi uchun test varaqasi</p>
                  </div>
                </div>
                <Printer className="w-5 h-5 text-blue-600" />
              </button>

              {/* Print Answer Sheets */}
              <button
                onClick={onPrintAnswers}
                className="w-full flex items-center justify-between p-3 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-gray-900">Javoblar varaqasi</p>
                    <p className="text-xs text-gray-600">O'quvchilar to'ldirishi uchun</p>
                  </div>
                </div>
                <Printer className="w-5 h-5 text-green-600" />
              </button>
              

            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Yopish
            </Button>
            <Button
              onClick={onShuffle}
              disabled={isShuffling}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Shuffle className="w-5 h-5 mr-2" />
              Aralashtirib berish
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Answer Key Modal */}
    <AnswerKeyModal
      isOpen={showAnswerKeyModal}
      onClose={() => setShowAnswerKeyModal(false)}
      test={blockTest}
    />
  </>
  );
}
