import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import MathText from '@/components/MathText';
import { Printer, ArrowLeft, Settings } from 'lucide-react';

export default function BlockTestPrintPage() {
  const { id, type } = useParams<{ id: string; type: string }>();
  const navigate = useNavigate();
  const [test, setTest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStudents, setSelectedStudents] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [columnsCount, setColumnsCount] = useState(1);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    fetchTest();
    fetchVariants();
    loadSelectedStudents();
  }, [id]);

  const loadSelectedStudents = () => {
    const stored = localStorage.getItem('selectedStudents');
    if (stored) {
      setSelectedStudents(JSON.parse(stored));
      localStorage.removeItem('selectedStudents');
    }
  };

  const fetchVariants = async () => {
    try {
      const { data } = await api.get(`/student-variants/block-test/${id}`);
      setVariants(data);
    } catch (error) {
      console.error('Error fetching variants:', error);
    }
  };

  const fetchTest = async () => {
    try {
      const { data } = await api.get(`/block-tests/${id}`);
      setTest(data);
    } catch (error) {
      console.error('Error fetching block test:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!test) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Test topilmadi</p>
      </div>
    );
  }

  const renderStudentHeader = (student: any, variantCode: string) => (
    <div className="border-2 border-gray-800 p-4 mb-6 flex justify-between items-center">
      <div>
        <p className="font-bold text-lg">{student.fullName}</p>
        <p className="text-sm text-gray-600">Variant: {variantCode}</p>
      </div>
      <div className="text-right">
        <p className="text-sm"><span className="font-semibold">Sinf:</span> {test.classNumber}-sinf</p>
        <p className="text-sm"><span className="font-semibold">Davr:</span> {formatPeriod(test.periodMonth, test.periodYear)}</p>
      </div>
    </div>
  );

  const renderQuestionsContent = () => {
    // Группируем вопросы по предметам
    const subjectGroups = test.subjectTests || [];
    
    return (
      <div className="space-y-8">
        {subjectGroups.map((subjectTest: any, subjectIndex: number) => (
          <div key={subjectIndex}>
            {/* Заголовок предмета */}
            <div className="bg-blue-50 border-l-4 border-blue-500 px-4 py-3 mb-4">
              <h3 className="text-xl font-bold text-blue-900">
                {subjectTest.subjectId?.nameUzb || 'Fan'}
              </h3>
            </div>
            
            {/* Вопросы предмета */}
            <div className={`space-y-6 ${columnsCount === 2 ? 'columns-2 gap-4' : ''}`}>
              {subjectTest.questions?.map((question: any, qIndex: number) => (
                <div key={qIndex} className="border-b pb-4">
                  <div className="flex items-start gap-3 mb-3">
                    <span className="font-bold text-lg">{qIndex + 1}.</span>
                    <div className="flex-1">
                      <MathText text={question.text} />
                    </div>
                  </div>
                  <div className="ml-6 space-y-2">
                    {question.variants?.map((variant: any, varIndex: number) => (
                      <div key={varIndex} className="flex items-start gap-2">
                        <span className="font-semibold">{variant.letter})</span>
                        <MathText text={variant.text} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Разделитель между предметами */}
            {subjectIndex < subjectGroups.length - 1 && (
              <div className="my-6 border-t-2 border-dashed border-gray-300"></div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderAnswersContent = () => {
    const subjectGroups = test.subjectTests || [];
    
    return (
      <div className="space-y-6">
        {subjectGroups.map((subjectTest: any, subjectIndex: number) => (
          <div key={subjectIndex}>
            {/* Заголовок предмета */}
            <div className="bg-green-50 border-l-4 border-green-500 px-4 py-2 mb-3">
              <h3 className="text-lg font-bold text-green-900">
                {subjectTest.subjectId?.nameUzb || 'Fan'}
              </h3>
            </div>
            
            {/* Ответы */}
            <div className="space-y-2">
              {subjectTest.questions?.map((question: any, qIndex: number) => {
                const correctAnswer = question.correctAnswer;
                return (
                  <div key={qIndex} className="flex items-center gap-4 border-b pb-2">
                    <span className="font-bold w-12">{qIndex + 1}.</span>
                    <span className="font-semibold text-green-600">
                      {correctAnswer || '-'}
                    </span>
                  </div>
                );
              })}
            </div>
            
            {/* Разделитель между предметами */}
            {subjectIndex < subjectGroups.length - 1 && (
              <div className="my-4 border-t-2 border-dashed border-gray-300"></div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderSheetsContent = () => (
    <div className="space-y-8">
      {test.subjectTests?.map((subjectTest: any, subjectIndex: number) => (
        <div key={subjectIndex} className="border-2 border-gray-300 p-6 rounded-lg">
          <h3 className="text-lg font-bold mb-4">
            {subjectTest.subjectId?.nameUzb || 'Fan'} - Javob varag'i
          </h3>
          <div className="grid grid-cols-5 gap-4">
            {subjectTest.questions?.map((_: any, qIndex: number) => (
              <div key={qIndex} className="border p-2 text-center">
                <div className="font-bold mb-2">{qIndex + 1}</div>
                <div className="flex justify-center gap-2">
                  {['A', 'B', 'C', 'D'].map(letter => (
                    <div key={letter} className="w-6 h-6 border border-gray-400 rounded"></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderQuestions = () => {
    if (selectedStudents.length === 0) return renderQuestionsContent();
    
    return (
      <div className="space-y-12">
        {selectedStudents.map((student, studentIndex) => {
          const variant = variants.find(v => v.studentId?._id === student._id);
          const variantCode = variant?.variantCode || `V${studentIndex + 1}`;
          
          return (
            <div key={student._id} className="page-break">
              {renderStudentHeader(student, variantCode)}
              {renderQuestionsContent()}
            </div>
          );
        })}
      </div>
    );
  };

  const renderAnswers = () => {
    if (selectedStudents.length === 0) return renderAnswersContent();
    
    return (
      <div className="space-y-8">
        {selectedStudents.map((student, studentIndex) => {
          const variant = variants.find(v => v.studentId?._id === student._id);
          const variantCode = variant?.variantCode || `V${studentIndex + 1}`;
          
          return (
            <div key={student._id} className="page-break">
              {renderStudentHeader(student, variantCode)}
              {renderAnswersContent()}
            </div>
          );
        })}
      </div>
    );
  };

  const renderSheets = () => {
    if (selectedStudents.length === 0) return renderSheetsContent();
    
    return (
      <div className="space-y-8">
        {selectedStudents.map((student, studentIndex) => {
          const variant = variants.find(v => v.studentId?._id === student._id);
          const variantCode = variant?.variantCode || `V${studentIndex + 1}`;
          
          return (
            <div key={student._id} className="page-break">
              {renderStudentHeader(student, variantCode)}
              {renderSheetsContent()}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
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
          
          .no-print { display: none !important; }
          
          body { 
            print-color-adjust: exact; 
            -webkit-print-color-adjust: exact; 
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
            margin: 1cm;
            padding: 0;
          }
          
          .columns-2 {
            column-count: 2;
            column-gap: 1rem;
          }
          
          /* Сохраняем цвета при печати */
          .bg-blue-50 {
            background-color: #eff6ff !important;
          }
          
          .bg-green-50 {
            background-color: #f0fdf4 !important;
          }
          
          .border-blue-500 {
            border-color: #3b82f6 !important;
          }
          
          .border-green-500 {
            border-color: #22c55e !important;
          }
          
          .text-blue-900 {
            color: #1e3a8a !important;
          }
          
          .text-green-900 {
            color: #14532d !important;
          }
        }
      `}</style>
      
      <div className="min-h-screen bg-white p-8">
        <div className="no-print mb-6 flex gap-3">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Orqaga
          </Button>
          {type === 'questions' && (
            <Button variant="outline" onClick={() => setShowSettings(!showSettings)}>
              <Settings className="w-4 h-4 mr-2" />
              Sozlamalar
            </Button>
          )}
          <Button onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />
            Chop etish
          </Button>
        </div>

        {/* Settings Panel */}
        {showSettings && type === 'questions' && (
          <div className="no-print fixed top-20 right-4 z-50 bg-white border-2 border-gray-300 rounded-lg shadow-xl p-4 w-72">
            <h3 className="font-bold text-lg mb-4">Chop etish sozlamalari</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Ustunlar soni
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setColumnsCount(1)}
                  className={`flex-1 py-2 px-4 rounded border-2 font-medium transition-colors ${
                    columnsCount === 1
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300'
                  }`}
                >
                  1 ustun
                </button>
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
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {columnsCount === 1 ? 'Katta shrift uchun qulay' : 'Ko\'proq savol sig\'adi'}
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

        <div className="max-w-4xl mx-auto">
          {selectedStudents.length === 0 && (
            <div className="text-center mb-8 border-b-2 pb-4">
              <h1 className="text-2xl font-bold mb-2">
                {test.classNumber}-sinf | {formatPeriod(test.periodMonth, test.periodYear)}
              </h1>
              <p className="text-gray-600">
                Blok test | {new Date(test.date).toLocaleDateString('uz-UZ')}
              </p>
            </div>
          )}

          {type === 'questions' && renderQuestions()}
          {type === 'answers' && renderAnswers()}
          {type === 'sheets' && renderSheets()}
          {type === 'all' && (
            <>
              {selectedStudents.length === 0 ? (
                <>
                  <div className="mb-12">
                    <h2 className="text-xl font-bold mb-4">Savollar</h2>
                    {renderQuestionsContent()}
                  </div>
                  <div className="page-break mb-12">
                    <h2 className="text-xl font-bold mb-4">Javoblar kaliti</h2>
                    {renderAnswersContent()}
                  </div>
                  <div className="page-break">
                    <h2 className="text-xl font-bold mb-4">Javob varag'i</h2>
                    {renderSheetsContent()}
                  </div>
                </>
              ) : (
                selectedStudents.map((student, studentIndex) => {
                  const variant = variants.find(v => v.studentId?._id === student._id);
                  const variantCode = variant?.variantCode || `V${studentIndex + 1}`;
                  
                  return (
                    <div key={student._id} className="page-break mb-12">
                      {renderStudentHeader(student, variantCode)}
                      <div className="mb-8">
                        <h2 className="text-xl font-bold mb-4">Savollar</h2>
                        {renderQuestionsContent()}
                      </div>
                      <div className="page-break mb-8">
                        <h2 className="text-xl font-bold mb-4">Javoblar kaliti</h2>
                        {renderAnswersContent()}
                      </div>
                      <div className="page-break">
                        <h2 className="text-xl font-bold mb-4">Javob varag'i</h2>
                        {renderSheetsContent()}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
