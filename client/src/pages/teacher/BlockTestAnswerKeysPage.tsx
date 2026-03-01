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
      
      // Barcha tegishli blok testlarni periodMonth/periodYear bo'yicha yuklash
      const groupIdParam = typeof testData.groupId === 'object' ? testData.groupId?._id : testData.groupId;
      const { data: sameGroupTests } = await api.get('/block-tests', {
        params: {
          classNumber: testData.classNumber,
          periodMonth: testData.periodMonth,
          periodYear: testData.periodYear,
          ...(groupIdParam ? { groupId: groupIdParam } : {}),
          fields: 'full'
        }
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
      
      const studentFetchParams = mergedBlockTest.groupId
        ? { groupId: typeof mergedBlockTest.groupId === 'object' ? mergedBlockTest.groupId._id : mergedBlockTest.groupId }
        : { classNumber: mergedBlockTest.classNumber };
      const { data: allStudents } = await api.get('/students', { params: studentFetchParams });
      
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
          const studentVariant = allVariants.find((v: any) =>
            v.studentId._id === student._id || v.studentId === student._id
          );

          const studentQuestions: any[] = [];
          let questionNumber = 1;

          if (studentVariant?.shuffledQuestions?.length > 0) {
            // Shuffled savollarni subjectId bo'yicha guruhlash
            const subjectMap = new Map<string, { name: string; groupLetter: string | null; questions: any[] }>();
            for (const q of studentVariant.shuffledQuestions) {
              const sid = (q.subjectId?._id || q.subjectId || '').toString();
              const name = q.subjectId?.nameUzb || 'Fan';
              if (!subjectMap.has(sid)) subjectMap.set(sid, { name, groupLetter: q.studentGroupLetter || null, questions: [] });
              subjectMap.get(sid)!.questions.push(q);
            }

            for (const [, group] of subjectMap) {
              for (const q of group.questions) {
                studentQuestions.push({
                  number: questionNumber++,
                  correctAnswer: q.correctAnswer || '?',
                  subjectName: group.name,
                  groupLetter: group.groupLetter
                });
              }
            }
          } else {
            // Fallback: config yoki mergedBlockTest dan
            try {
              const { data: config } = await api.get(`/student-test-configs/${student._id}`);
              for (const subjectConfig of config.subjects) {
                const subjectId = subjectConfig.subjectId._id || subjectConfig.subjectId;
                const subjectTest = mergedBlockTest.subjectTests.find(
                  (st: any) => (st.subjectId._id || st.subjectId) === subjectId
                );
                if (subjectTest?.questions) {
                  const questionsToUse = subjectTest.questions.slice(0, subjectConfig.questionCount);
                  for (const q of questionsToUse) {
                    studentQuestions.push({
                      number: questionNumber++,
                      correctAnswer: q.correctAnswer || '?',
                      subjectName: subjectConfig.subjectId.nameUzb
                    });
                  }
                }
              }
            } catch {
              // Config yo'q — barcha savollar
              for (const st of mergedBlockTest.subjectTests) {
                for (const q of (st.questions || [])) {
                  studentQuestions.push({
                    number: questionNumber++,
                    correctAnswer: q.correctAnswer || '?',
                    subjectName: st.subjectId?.nameUzb || 'Fan'
                  });
                }
              }
            }
          }

          answers.push({
            student,
            questions: studentQuestions,
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
                  {(item.student.studentCode || item.variantCode) && (
                    <div className="text-right">
                      <div className="text-xs text-gray-500">ID</div>
                      <div className="text-lg font-bold text-blue-600">{item.student.studentCode || item.variantCode}</div>
                    </div>
                  )}
                </div>
              </div>

              {(() => {
                // Fan bo'yicha guruhlash
                const subjectGroups: { name: string; groupLetter?: string | null; questions: typeof item.questions }[] = [];
                let currentSubject = '';
                let currentGroup: typeof item.questions = [];
                let currentLetter: string | null = null;
                for (const q of item.questions) {
                  const key = `${q.subjectName}_${q.groupLetter || ''}`;
                  if (key !== currentSubject) {
                    if (currentGroup.length > 0) subjectGroups.push({ name: currentGroup[0].subjectName, groupLetter: currentLetter, questions: currentGroup });
                    currentSubject = key;
                    currentGroup = [];
                    currentLetter = q.groupLetter || null;
                  }
                  currentGroup.push(q);
                }
                if (currentGroup.length > 0) subjectGroups.push({ name: currentGroup[0].subjectName, groupLetter: currentLetter, questions: currentGroup });

                return subjectGroups.map((sg, si) => (
                  <div key={si} className="mb-4">
                    <div className="font-bold text-sm text-gray-700 border-b pb-1 mb-2">
                      {sg.name}{sg.groupLetter ? ` (${sg.groupLetter} guruh)` : ''} — {sg.questions.length} ta savol
                    </div>
                    <div className="grid grid-cols-5 sm:grid-cols-8 lg:grid-cols-10 gap-2">
                      {sg.questions.map((q: any) => (
                        <div key={q.number} className="flex items-center gap-1 p-2 bg-gray-50 rounded border text-center">
                          <span className="font-bold text-gray-700 text-sm">{q.number}.</span>
                          <span className="font-bold text-green-600 text-lg">{q.correctAnswer}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
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
