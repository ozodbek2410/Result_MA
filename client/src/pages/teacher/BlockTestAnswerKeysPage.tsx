import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Search, Printer } from 'lucide-react';

export default function BlockTestAnswerKeysPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const studentIds = searchParams.get('students')?.split(',') || [];
  
  const [loading, setLoading] = useState(true);
  const [blockTest, setBlockTest] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [studentAnswers, setStudentAnswers] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
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
      
      console.log('📊 Found tests in same group:', sameGroupTests.length);
      
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
      
      console.log('📝 Total subjects:', allSubjects.length);
      
      // Создаем объединенный блок-тест для отображения
      const mergedBlockTest = {
        ...testData,
        subjectTests: allSubjects,
        allTestIds: sameGroupTests.map((t: any) => t._id)
      };
      
      setBlockTest(mergedBlockTest);
      
      const { data: allStudents } = await api.get('/students', {
        params: { classNumber: mergedBlockTest.classNumber }
      });
      
      const selectedStudents = studentIds.length > 0
        ? allStudents.filter((s: any) => studentIds.includes(s._id))
        : allStudents;

      // Загружаем все варианты для этого блок-теста
      let allVariants: any[] = [];
      try {
        const { data: variantsData } = await api.get(`/student-variants/block-test/${id}`);
        allVariants = variantsData;
        console.log('📦 Loaded variants:', allVariants.length);
        console.log('📦 First variant sample:', allVariants[0]);
        if (allVariants[0]?.shuffledQuestions) {
          console.log('📦 Shuffled questions sample:', allVariants[0].shuffledQuestions.slice(0, 2));
        }
      } catch (err) {
        console.warn('No variants found, using original questions');
      }

      const answers: any[] = [];

      for (const student of selectedStudents) {
        try {
          const { data: config } = await api.get(`/student-test-configs/${student._id}`);
          
          // Находим вариант для этого студента
          const studentVariant = allVariants.find((v: any) => 
            v.studentId._id === student._id || v.studentId === student._id
          );
          
          console.log(`🔍 Student ${student.fullName}:`, {
            hasVariant: !!studentVariant,
            variantCode: studentVariant?.variantCode,
            hasShuffledQuestions: !!studentVariant?.shuffledQuestions,
            shuffledQuestionsCount: studentVariant?.shuffledQuestions?.length
          });
          
          if (studentVariant?.shuffledQuestions && studentVariant.shuffledQuestions.length > 0) {
            console.log(`📦 First 3 shuffled questions for ${student.fullName}:`, 
              studentVariant.shuffledQuestions.slice(0, 3).map((q: any, i: number) => ({
                index: i,
                correctAnswer: q.correctAnswer,
                hasVariants: !!q.variants,
                text: q.text?.substring(0, 30) || q.question?.substring(0, 30)
              }))
            );
          }
          
          const studentQuestions: any[] = [];
          let questionNumber = 1;
          let shuffledIndex = 0; // Индекс для прохода по shuffledQuestions

          for (const subjectConfig of config.subjects) {
            const subjectId = subjectConfig.subjectId._id || subjectConfig.subjectId;
            const subjectTest = mergedBlockTest.subjectTests.find(
              (st: any) => (st.subjectId._id || st.subjectId) === subjectId
            );

            if (subjectTest && subjectTest.questions) {
              const questionsToUse = subjectTest.questions.slice(0, subjectConfig.questionCount);
              
              const questions = questionsToUse.map((q: any, qIdx: number) => {
                // Используем перемешанный вариант если есть
                let questionData = q;
                
                if (studentVariant?.shuffledQuestions && studentVariant.shuffledQuestions.length > shuffledIndex) {
                  // Берем вопрос по порядку из shuffledQuestions
                  questionData = studentVariant.shuffledQuestions[shuffledIndex];
                  shuffledIndex++;
                  
                  if (qIdx === 0) {
                    console.log(`📝 Question ${questionNumber} for ${student.fullName}:`, {
                      usingShuffled: true,
                      originalAnswer: q.correctAnswer,
                      shuffledAnswer: questionData.correctAnswer,
                      hasVariants: !!questionData.variants
                    });
                  }
                } else {
                  // Fallback к оригинальному вопросу
                  if (qIdx === 0) {
                    console.log(`⚠️ No shuffled question found, using original for ${student.fullName}`);
                  }
                }
                
                return {
                  number: questionNumber++,
                  question: questionData.text || questionData.question || '',
                  correctAnswer: questionData.correctAnswer || '?', // Используем обновленный правильный ответ!
                  subjectName: subjectConfig.subjectId.nameUzb
                };
              });
              
              studentQuestions.push(...questions);
            }
          }

          answers.push({
            student,
            questions: studentQuestions,
            variantCode: studentVariant?.variantCode
          });
          
          console.log(`✅ Generated answers for ${student.fullName}:`, {
            totalQuestions: studentQuestions.length,
            first5Answers: studentQuestions.slice(0, 5).map(q => ({
              num: q.number,
              answer: q.correctAnswer
            })),
            variantCode: studentVariant?.variantCode
          });
        } catch (err) {
          console.error(`Error loading answers for ${student._id}:`, err);
        }
      }

      setStudentAnswers(answers);
    } catch (err: any) {
      console.error('Error loading data:', err);
      alert('Ma\'lumotlarni yuklashda xatolik');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredAnswers = studentAnswers.filter(item =>
    item.student.fullName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="print:hidden sticky top-0 bg-white border-b shadow-sm z-10">
        <div className="max-w-7xl mx-auto p-4 flex items-center gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="text"
                placeholder="O'quvchi ismini qidirish..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Button onClick={handlePrint} size="lg">
            <Printer className="w-5 h-5 mr-2" />
            Chop etish
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-8">
        <h1 className="text-3xl font-bold text-center mb-8">To'g'ri javoblar</h1>
        
        <div className="space-y-6">
          {filteredAnswers.map((item) => (
            <div key={item.student._id} className="border border-gray-200 rounded-lg p-6 page-break">
              <div className="mb-4 pb-3 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{item.student.fullName}</h3>
                    <p className="text-sm text-gray-600">
                      {item.student.directionId?.nameUzb} | {item.questions.length} ta savol
                    </p>
                  </div>
                  {item.variantCode && (
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Variant kodi</div>
                      <div className="text-lg font-bold text-blue-600">{item.variantCode}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {item.questions.map((q: any) => (
                  <div key={q.number} className="flex items-center gap-2 p-3 bg-gray-50 rounded border">
                    <span className="font-bold text-gray-700 min-w-[35px]">{q.number}.</span>
                    <span className="font-bold text-green-600 text-xl">{q.correctAnswer}</span>
                    <span className="text-xs text-gray-500 ml-auto">{q.subjectName}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @media print {
          * {
            box-sizing: border-box;
          }
          
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            overflow: visible !important;
          }
          
          .page-break {
            page-break-after: always;
            page-break-inside: avoid;
            break-after: page;
            break-inside: avoid;
            position: relative;
          }
          
          .page-break::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 400px;
            height: 400px;
            background-image: url('/logo.png');
            background-size: contain;
            background-repeat: no-repeat;
            background-position: center;
            opacity: 0.1;
            z-index: -1;
            pointer-events: none;
          }
          
          .page-break:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          
          @page {
            size: A4 portrait;
            margin: 1.5cm;
            padding: 0;
          }
          
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
}
