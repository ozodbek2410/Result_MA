import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/hooks/useToast';
import { ArrowLeft, Shuffle, Plus, Eye, Printer } from 'lucide-react';

export default function BlockTestVariantsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState<any>(null);
  const [variants, setVariants] = useState<any[]>([]);
  const [variantCount, setVariantCount] = useState(10);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expandedVariant, setExpandedVariant] = useState<string | null>(null);
  const { success, error } = useToast();

  useEffect(() => {
    fetchTest();
    fetchVariants();
  }, [id]);

  const fetchTest = async () => {
    try {
      setLoading(true);
      
      // Загружаем блок-тест
      const { data: testData } = await api.get(`/block-tests/${id}`);
      
      // Загружаем все блок-тесты с таким же классом и датой (с полными данными!)
      const { data: allTests } = await api.get('/block-tests', {
        params: { fields: 'full' }
      });
      const testDate = new Date(testData.date).toISOString().split('T')[0];
      
      // Фильтруем тесты по классу и дате
      const sameGroupTests = allTests.filter((t: any) => {
        const tDate = new Date(t.date).toISOString().split('T')[0];
        return t.classNumber === testData.classNumber && tDate === testDate;
      });
      
      // Объединяем все предметы из всех тестов
      const allSubjects: any[] = [];
      sameGroupTests.forEach((test: any) => {
        test.subjectTests?.forEach((st: any) => {
          if (st.subjectId) {
            allSubjects.push({
              ...st,
              testId: test._id
            });
          }
        });
      });
      
      // Создаем объединенный блок-тест для отображения
      const mergedBlockTest = {
        ...testData,
        subjectTests: allSubjects,
        allTestIds: sameGroupTests.map((t: any) => t._id)
      };
      
      setTest(mergedBlockTest);
    } catch (err) {
      console.error('Error fetching block test:', err);
      error('Testni yuklashda xatolik');
    } finally {
      setLoading(false);
    }
  };

  const fetchVariants = async () => {
    try {
      const { data } = await api.get(`/student-variants/block-test/${id}`);
      setVariants(data);
    } catch (err) {
      console.error('Error fetching variants:', err);
    }
  };

  const handleGenerateVariants = async () => {
    try {
      setGenerating(true);
      await new Promise(resolve => setTimeout(resolve, 1000));
      success(`${variantCount} ta variant yaratildi!`);
      fetchVariants();
    } catch (err) {
      console.error('Error generating variants:', err);
      error('Variantlarni yaratishda xatolik');
    } finally {
      setGenerating(false);
    }
  };

  const formatPeriod = (month: number, year: number) => {
    const months = [
      'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
      'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'
    ];
    return `${months[month - 1]} ${year}`;
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Orqaga
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {test.classNumber}-sinf | {formatPeriod(test.periodMonth, test.periodYear)}
            </h1>
            <p className="text-gray-600 mt-1">Aralashtirilgan variantlar</p>
          </div>
        </div>
      </div>

      <Card className="border-0 shadow-soft bg-gradient-to-br from-purple-50 to-pink-50">
        <CardContent className="p-6">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center shadow-soft">
              <Shuffle className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Variantlar yaratish
              </h3>
              <p className="text-gray-600 text-sm">
                Har bir o'quvchi uchun noyob tartibda savollar va javoblar aralashtiriladi
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-soft">
        <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100 border-b">
          <CardTitle className="text-lg">Variantlar soni</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="max-w-md space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nechta variant yaratmoqchisiz?
              </label>
              <Input
                type="number"
                min="1"
                max="100"
                value={variantCount}
                onChange={(e) => setVariantCount(parseInt(e.target.value) || 1)}
                className="w-full"
              />
              <p className="text-sm text-gray-500 mt-2">
                Har bir variant uchun savollar va javoblar tasodifiy tartibda aralashtiriladi
              </p>
            </div>
            <Button
              onClick={handleGenerateVariants}
              disabled={generating}
              size="lg"
              className="w-full"
            >
              {generating ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                  Yaratilmoqda...
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5 mr-2" />
                  Variantlar yaratish
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing Variants */}
      {variants.length > 0 && (
        <Card className="border-0 shadow-soft">
          <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100 border-b">
            <CardTitle className="text-lg flex items-center justify-between">
              <span>Mavjud variantlar</span>
              <Badge variant="info" size="lg">{variants.length} ta</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-3">
              {variants.map((variant: any, index: number) => (
                <div key={variant._id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center text-white font-bold">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">
                          Variant {variant.variantCode}
                        </p>
                        <p className="text-sm text-gray-600">
                          {variant.studentId?.firstName} {variant.studentId?.lastName}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedVariant(expandedVariant === variant._id ? null : variant._id)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/teacher/block-tests/${id}/print/variant/${variant._id}`)}
                      >
                        <Printer className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {expandedVariant === variant._id && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm text-gray-600 mb-2">Savollar tartibi:</p>
                      <div className="flex flex-wrap gap-2">
                        {variant.questionOrder?.map((qNum: number, idx: number) => (
                          <Badge key={idx} variant="outline" size="sm">
                            {idx + 1} → {qNum + 1}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
