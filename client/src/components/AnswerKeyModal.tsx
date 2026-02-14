import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { X, FileText } from 'lucide-react';
import MathText from './MathText';

interface AnswerKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  test: any;
}

export default function AnswerKeyModal({
  isOpen,
  onClose,
  test,
}: AnswerKeyModalProps) {
  if (!test) return null;

  // Для блок-тестов
  if (test.subjectTests) {
    return (
      <Dialog open={isOpen} onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-green-600" />
            <span>Javoblar kaliti</span>
          </DialogTitle>
        </DialogHeader>

        <DialogContent>
          <div className="space-y-6 max-h-[70vh] overflow-y-auto">
            {test.subjectTests.map((subjectTest: any, subjectIdx: number) => (
              <div key={subjectIdx} className="border-b pb-4 last:border-b-0">
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="info">
                    {subjectTest.subjectId?.nameUzb || 'Fan'}
                  </Badge>
                  <span className="text-sm text-gray-600">
                    {subjectTest.questions?.length || 0} ta savol
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {subjectTest.questions?.map((question: any, qIdx: number) => (
                    <div
                      key={qIdx}
                      className="flex items-center gap-2 p-2 bg-gray-50 rounded border"
                    >
                      <span className="text-sm font-semibold text-gray-700 min-w-[2rem]">
                        {qIdx + 1}.
                      </span>
                      <Badge
                        variant={question.correctAnswer ? 'success' : 'default'}
                        size="sm"
                      >
                        {question.correctAnswer || '?'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Yopish
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Для обычных тестов
  const questions = test.questions || [];

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-green-600" />
          <span>Javoblar kaliti</span>
        </DialogTitle>
      </DialogHeader>

      <DialogContent>
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-blue-600" />
              <div>
                <p className="font-semibold text-blue-900">
                  {test.name || 'Test'}
                </p>
                <p className="text-sm text-blue-700">
                  {questions.length} ta savol
                </p>
              </div>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {questions.map((question: any, qIdx: number) => (
                <div
                  key={qIdx}
                  className="flex items-center gap-2 p-2 bg-gray-50 rounded border"
                >
                  <span className="text-sm font-semibold text-gray-700 min-w-[2rem]">
                    {qIdx + 1}.
                  </span>
                  <Badge
                    variant={question.correctAnswer ? 'success' : 'default'}
                    size="sm"
                  >
                    {question.correctAnswer || '?'}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Yopish
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
