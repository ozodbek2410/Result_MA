import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import MathText from '@/components/MathText';
import { ArrowLeft, FileText, Users } from 'lucide-react';

export default function TestViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTest();
  }, [id]);

  const fetchTest = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/tests/${id}`);
      console.log('Test data:', data);
      console.log('Questions:', data.questions);
      if (data.questions && data.questions.length > 0) {
        console.log('First question:', data.questions[0]);
        console.log('First question options:', data.questions[0].options);
      }
      setTest(data);
    } catch (error) {
      console.error('Error fetching test:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Orqaga
          </Button>
        </div>
        <Card className="border-0 shadow-soft">
          <CardContent className="py-12 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
            <p className="text-gray-500 mt-4">Yuklanmoqda...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!test) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Orqaga
          </Button>
        </div>
        <Card className="border-0 shadow-soft">
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">Test topilmadi</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Orqaga
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{test.name}</h1>
            <p className="text-gray-600 mt-1">Original savollar</p>
          </div>
        </div>
      </div>

      {/* Test Info */}
      <Card className="border-0 shadow-soft bg-gradient-to-br from-blue-50 to-purple-50">
        <CardContent className="p-6">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-soft">
              <FileText className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div>
                <p className="text-sm text-gray-600">Sinf</p>
                <p className="text-lg font-bold text-gray-900">{test.classNumber}-sinf</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Fan</p>
                <p className="text-lg font-bold text-gray-900">{test.subjectId?.nameUzb || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Guruh</p>
                <p className="text-lg font-bold text-gray-900">{test.groupId?.name || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Savollar</p>
                <p className="text-lg font-bold text-gray-900">{test.questions?.length || 0} ta</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Questions */}
      <Card className="border-0 shadow-soft">
        <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100 border-b">
          <CardTitle className="text-lg">Savollar ro'yxati</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-6">
            {test.questions?.map((question: any, index: number) => (
              <div key={index} className="border-b pb-6 last:border-b-0">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="text-gray-900 font-medium mb-4">
                      <MathText text={question.text} />
                    </div>
                    
                    {/* Answer Variants */}
                    {question.variants && question.variants.length > 0 && (
                      <div className="flex flex-wrap gap-2 ml-2">
                        {question.variants.map((variant: any, varIndex: number) => (
                          <div
                            key={varIndex}
                            className={`p-2 rounded-lg border-2 inline-flex items-center gap-2 ${
                              variant.letter === question.correctAnswer
                                ? 'bg-green-50 border-green-400'
                                : 'bg-white border-gray-200'
                            }`}
                          >
                            <span className="font-bold text-gray-700">
                              {variant.letter})
                            </span>
                            <span className={`${variant.letter === question.correctAnswer ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>
                              <MathText text={variant.text} />
                            </span>
                            {variant.letter === question.correctAnswer && (
                              <span className="text-green-600 font-bold">✓</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
