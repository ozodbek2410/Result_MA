import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { ArrowLeft, CheckCircle, XCircle, MinusCircle, Image as ImageIcon } from 'lucide-react';
import MathText from '../components/MathText';

export default function PublicTestResult() {
  const { resultId, token } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showImage, setShowImage] = useState(false);

  useEffect(() => {
    const fetchResult = async () => {
      try {
        const { data } = await axios.get(`/api/public/test-result/${resultId}/${token}`);
        console.log('📊 Test natijasi:', {
          hasScannedImage: !!data.scannedImagePath,
          scannedImagePath: data.scannedImagePath,
          resultId: data._id
        });
        setResult(data);
      } catch (error) {
        console.error('❌ Natijani yuklashda xatolik:', error);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchResult();
  }, [resultId, token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Yuklanmoqda...</p>
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-12 pb-12 text-center">
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Natija topilmadi</h2>
            <p className="text-gray-600">Ushbu natija mavjud emas</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getAnswerIcon = (answer: any) => {
    if (!answer.selectedAnswer) {
      return <MinusCircle className="w-5 h-5 text-gray-400" />;
    }
    if (answer.isCorrect) {
      return <CheckCircle className="w-5 h-5 text-green-600" />;
    }
    return <XCircle className="w-5 h-5 text-red-600" />;
  };

  const getAnswerBgColor = (answer: any) => {
    if (!answer.selectedAnswer) return 'bg-gray-50';
    if (answer.isCorrect) return 'bg-green-50';
    return 'bg-red-50';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(`/profile/${token}`)}
            className="p-2 hover:bg-white rounded-lg transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-gray-700" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{result.testId?.name || 'Test'}</h1>
            <p className="text-gray-600">
              {new Date(result.createdAt).toLocaleDateString('uz-UZ', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </p>
          </div>
        </div>

        {/* Score Card */}
        <Card className="border-2 border-primary/20 shadow-xl">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 mb-1">Natija</p>
                <p className="text-4xl font-bold text-primary">{result.percentage}%</p>
                <p className="text-gray-600 mt-2">
                  {result.totalPoints} / {result.maxPoints} ball
                </p>
              </div>
              <div className="text-right">
                <div className="flex gap-4">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-2">
                      <CheckCircle className="w-8 h-8 text-green-600" />
                    </div>
                    <p className="text-2xl font-bold text-green-600">
                      {result.answers.filter((a: any) => a.isCorrect).length}
                    </p>
                    <p className="text-xs text-gray-600">To'g'ri</p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-2">
                      <XCircle className="w-8 h-8 text-red-600" />
                    </div>
                    <p className="text-2xl font-bold text-red-600">
                      {result.answers.filter((a: any) => !a.isCorrect && a.selectedAnswer).length}
                    </p>
                    <p className="text-xs text-gray-600">Xato</p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-2">
                      <MinusCircle className="w-8 h-8 text-gray-600" />
                    </div>
                    <p className="text-2xl font-bold text-gray-600">
                      {result.answers.filter((a: any) => !a.selectedAnswer).length}
                    </p>
                    <p className="text-xs text-gray-600">Javobsiz</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Scanned Image */}
        {result.scannedImagePath ? (
          <Card className="shadow-xl">
            <CardHeader className="border-b bg-gray-50">
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-primary" />
                Tahlil qilingan javob varag'i
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-800">
                  <strong>ℹ️ Ma'lumot:</strong> Bu rasmda sizning javoblaringiz ko'k rangda belgilangan. 
                  Avtomatik skanerlash natijasi ko'rsatilgan.
                </p>
              </div>
              <div className="relative">
                <img
                  src={`/uploads/omr/${result.scannedImagePath.split('/').pop()}`}
                  alt="Tahlil qilingan javob varag'i"
                  className="w-full rounded-lg border-2 border-gray-200 cursor-pointer hover:border-primary transition-colors"
                  onClick={() => setShowImage(true)}
                  onError={(e) => {
                    console.error('❌ Rasmni yuklashda xatolik:', result.scannedImagePath);
                    e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="%23f0f0f0"/><text x="50%" y="50%" text-anchor="middle" fill="%23999">Rasm topilmadi</text></svg>';
                  }}
                />
                <p className="text-sm text-gray-600 mt-2 text-center">
                  Kattalashtirish uchun rasmga bosing
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-xl">
            <CardHeader className="border-b bg-gray-50">
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-gray-400" />
                Javob varag'i rasmi
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4 text-center">
                <p className="text-yellow-800">
                  ⚠️ Bu test uchun javob varag'i rasmi saqlanmagan
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Questions and Answers */}
        <Card className="shadow-xl">
          <CardHeader className="border-b bg-gray-50">
            <CardTitle>Savollar va javoblar</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {result.testId?.questions?.map((question: any, index: number) => {
                const answer = result.answers.find((a: any) => a.questionIndex === index);
                const correctAnswer = question.correctAnswer;
                const wasEdited = answer?.wasEdited;
                const originalAnswer = answer?.originalAnswer;
                
                return (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border-2 ${
                      answer?.isCorrect
                        ? 'border-green-200 bg-green-50'
                        : answer?.selectedAnswer
                        ? 'border-red-200 bg-red-50'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      {getAnswerIcon(answer)}
                      <div className="flex-1">
                        <div className="flex items-start gap-2 mb-2">
                          <span className="font-bold text-gray-900">{index + 1}.</span>
                          <div className="flex-1">
                            <MathText text={question.text} />
                          </div>
                        </div>
                        
                        {/* Answer Options */}
                        <div className="ml-6 space-y-2">
                          {question.variants?.map((variant: any) => {
                            const isCorrect = variant.letter === correctAnswer;
                            const isSelected = variant.letter === answer?.selectedAnswer;
                            
                            return (
                              <div
                                key={variant.letter}
                                className={`p-2 rounded ${
                                  isCorrect
                                    ? 'bg-green-100 border-2 border-green-500'
                                    : isSelected
                                    ? 'bg-red-100 border-2 border-red-500'
                                    : 'bg-white border border-gray-200'
                                }`}
                              >
                                <div className="flex items-start gap-2">
                                  <span className={`font-semibold ${
                                    isCorrect ? 'text-green-700' : isSelected ? 'text-red-700' : 'text-gray-700'
                                  }`}>
                                    {variant.letter})
                                  </span>
                                  <div className="flex-1">
                                    <MathText text={variant.text} />
                                  </div>
                                  {isCorrect && (
                                    <Badge variant="success" className="ml-2">
                                      To'g'ri javob
                                    </Badge>
                                  )}
                                  {isSelected && !isCorrect && (
                                    <Badge variant="danger" className="ml-2">
                                      Sizning javobingiz
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Image Modal */}
      {showImage && result.scannedImagePath && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setShowImage(false)}
        >
          <div className="max-w-6xl max-h-[90vh] overflow-auto relative" onClick={(e) => e.stopPropagation()}>
            <div className="absolute top-4 right-4 bg-white rounded-lg px-4 py-2 shadow-lg">
              <p className="text-sm font-semibold text-gray-700">
                Ko'k rang = Sizning javoblaringiz
              </p>
            </div>
            <img
              src={`/uploads/omr/${result.scannedImagePath.split('/').pop()}`}
              alt="Tahlil qilingan javob varag'i"
              className="w-full h-auto"
            />
          </div>
        </div>
      )}
    </div>
  );
}
