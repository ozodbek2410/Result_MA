import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Printer, Settings } from 'lucide-react';
import AnswerSheet from '@/components/AnswerSheet';

interface StudentVariant {
  student: any;
  config: any;
  variantCode: string;
  qrPayload: string;
  questions: any[];
}

export default function BlockTestPrintAnswersPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const studentIds = searchParams.get('students')?.split(',') || [];
  
  const [loading, setLoading] = useState(true);
  const [blockTest, setBlockTest] = useState<any>(null);
  const [studentVariants, setStudentVariants] = useState<StudentVariant[]>([]);
  const [columnsCount, setColumnsCount] = useState(2);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Загружаем блок-тест
      const { data: testData } = await api.get(`/block-tests/${id}`);
      
      // Загружаем все блок-тесты с таким же классом и датой
      const { data: allTests } = await api.get('/block-tests');
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
      
      console.log('👥 Total students in class:', allStudents.length);
      console.log('🎯 Selected student IDs from URL:', studentIds);
      console.log('🎯 Unique student IDs:', [...new Set(studentIds)]);
      
      const selectedStudents = allStudents.filter((s: any) => 
        studentIds.includes(s._id)
      );
      
      console.log('✅ Filtered students:', selectedStudents.length);
      
      // Убираем дубликаты
      const uniqueStudents = Array.from(
        new Map(selectedStudents.map((s: any) => [s._id, s])).values()
      );
      
      console.log('🔍 Unique students after deduplication:', uniqueStudents.length);
      
      const variants: StudentVariant[] = [];
      
      // Get all variants for this block test
      let allVariants = [];
      try {
        const { data: variantsData } = await api.get(`/student-variants/block-test/${id}`);
        allVariants = variantsData;
        console.log('📦 Total variants loaded:', allVariants.length);
      } catch (err) {
        console.error('Error loading variants:', err);
      }
      
      for (const student of uniqueStudents) {
        try {
          const { data: config } = await api.get(`/student-test-configs/${(student as any)._id}`);
          
          // Find variant for this student
          const studentVariant = allVariants.find((v: any) => 
            v.studentId._id === (student as any)._id || v.studentId === (student as any)._id
          );
          
          let totalQuestions = 0;
          for (const subjectConfig of config.subjects) {
            totalQuestions += subjectConfig.questionCount;
          }
          
          variants.push({
            student,
            config,
            variantCode: studentVariant?.variantCode || 'N/A',
            qrPayload: studentVariant?.qrPayload || `${(student as any)._id}-${id}`,
            questions: Array.from({ length: totalQuestions }, (_, i) => ({ number: i + 1 }))
          });
        } catch (err) {
          console.error(`Error loading config for student ${(student as any)._id}:`, err);
        }
      }
      
      setStudentVariants(variants);
      console.log('📄 Total answer sheets generated:', variants.length);
      console.log('📋 Sheet details:', variants.map(v => ({
        name: v.student.fullName,
        questions: v.questions.length,
        variant: v.variantCode
      })));
      
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white print-view-mode">
      <div className="print:hidden fixed top-4 right-4 z-50 flex gap-2">
        <Button variant="outline" onClick={() => setShowSettings(!showSettings)}>
          <Settings className="w-5 h-5 mr-2" />
          Sozlamalar
        </Button>
        <Button onClick={handlePrint} size="lg">
          <Printer className="w-5 h-5 mr-2" />
          Chop etish
        </Button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="print:hidden fixed top-20 right-4 z-50 bg-white border-2 border-gray-300 rounded-lg shadow-xl p-4 w-72">
          <h3 className="font-bold text-lg mb-4">Chop etish sozlamalari</h3>
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Ustunlar soni
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setColumnsCount(2)}
                className={`flex-1 py-2 px-4 rounded border-2 font-medium transition-colors ${
                  columnsCount === 2
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300'
                }`}
              >
                2 ustun
              </button>
              <button
                onClick={() => setColumnsCount(3)}
                className={`flex-1 py-2 px-4 rounded border-2 font-medium transition-colors ${
                  columnsCount === 3
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300'
                }`}
              >
                3 ustun
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {columnsCount === 2 ? '60 tagacha savol uchun qulay' : '60 dan ortiq savol uchun qulay'}
            </p>
          </div>

          <button
            onClick={() => setShowSettings(false)}
            className="w-full bg-gray-200 hover:bg-gray-300 py-2 rounded font-medium"
          >
            Yopish
          </button>
        </div>
      )}

      <div className="space-y-8">
        {studentVariants.map((variant) => {
          return (
            <div key={variant.student._id} className="page-break">
              <AnswerSheet
                student={{
                  fullName: variant.student.fullName || `${variant.student.firstName} ${variant.student.lastName}`,
                  variantCode: variant.variantCode
                }}
                test={{
                  name: blockTest.name || 'Blok Test',
                  subjectName: blockTest.subjectTests?.map((st: any) => st.subjectId?.nameUzb || st.subjectId).join(', ') || 'Fanlar',
                  classNumber: blockTest.classNumber,
                  groupLetter: variant.student.directionId?.nameUzb?.charAt(0) || 'A'
                }}
                questions={variant.questions.length}
                qrData={variant.qrPayload}
                columns={columnsCount}
              />
            </div>
          );
        })}
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
          }
          
          .page-break:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          
          @page {
            size: A4 portrait;
            margin: 0;
            padding: 0;
          }
          
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          
          /* Убираем сайдбар и навигацию */
          aside, nav, header, .sidebar { display: none !important; }
          main { margin: 0 !important; padding: 0 !important; }
        }
        
        /* Скрываем сайдбар в режиме просмотра */
        body:has(.print-view-mode) aside,
        body:has(.print-view-mode) nav,
        body:has(.print-view-mode) header,
        body:has(.print-view-mode) .sidebar {
          display: none !important;
        }
        body:has(.print-view-mode) main {
          margin: 0 !important;
          padding: 0 !important;
          max-width: 100% !important;
        }
      `}</style>
    </div>
  );
}
