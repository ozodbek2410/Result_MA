import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import MathText from '@/components/MathText';
import { Printer, ArrowLeft, Settings } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import AnswerSheet from '@/components/AnswerSheet';

export default function TestPrintPage() {
  const { id, type } = useParams<{ id: string; type: string }>();
  const navigate = useNavigate();
  const [test, setTest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStudents, setSelectedStudents] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [columnsCount, setColumnsCount] = useState(2);
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
      const { data } = await api.get(`/student-variants/test/${id}`);
      setVariants(data);
    } catch (error) {
      console.error('Error fetching variants:', error);
    }
  };

  const fetchTest = async () => {
    try {
      const { data } = await api.get(`/tests/${id}`);
      setTest(data);
    } catch (error) {
      console.error('Error fetching test:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
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

  const renderQuestions = () => {
    if (selectedStudents.length === 0) {
      return <div className="text-center text-gray-500 py-12">O'quvchilar tanlanmagan</div>;
    }

    return (
      <div>
        {selectedStudents.map((student, studentIndex) => {
          const variant = variants.find(v => v.studentId?._id === student._id);
          const variantCode = variant?.variantCode || '';
          
          return (
            <div key={student._id} className="page-break mb-8">
              {/* Header */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold">{student.fullName}</h2>
                  <p className="text-sm">Variant: {variantCode}</p>
                  <p className="text-sm">{test.subjectId?.nameUzb || test.subjectId || 'Test'} {test.classNumber || 10}{test.groupId?.nameUzb?.charAt(0) || 'A'}</p>
                </div>
                <div className="flex-shrink-0">
                  <QRCodeSVG 
                    value={variantCode}
                    size={100}
                    level="H"
                    includeMargin={false}
                    style={{ margin: 0 }}
                  />
                </div>
              </div>

              <hr className="border-t-2 border-gray-800 mb-4" />

              {/* Questions */}
              <div className="space-y-4">
                {test.questions?.map((question: any, index: number) => (
                  <div key={index} className="page-break-inside-avoid">
                    <div className="mb-1">
                      <span className="font-bold">{index + 1}. </span>
                      <MathText text={question.text} />
                    </div>
                    {question.imageUrl && (
                      <div className="my-2 ml-6">
                        <img 
                          src={question.imageUrl} 
                          alt="Question" 
                          className="max-w-full h-auto"
                          style={{ maxHeight: '200px', objectFit: 'contain' }}
                        />
                      </div>
                    )}
                    <div className="ml-6">
                      {question.variants?.map((qVariant: any) => (
                        <div key={qVariant.letter} className="mb-1">
                          <span className="font-semibold">{qVariant.letter}) </span>
                          <MathText text={qVariant.text} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderAnswers = () => {
    if (selectedStudents.length === 0) {
      return <div className="text-center text-gray-500 py-12">O'quvchilar tanlanmagan</div>;
    }

    return (
      <div>
        {selectedStudents.map((student, studentIndex) => {
          const variant = variants.find(v => v.studentId?._id === student._id);
          const variantCode = variant?.variantCode || '';
          
          return (
            <div key={student._id} className="page-break mb-8">
              <div className="flex justify-between items-start mb-6">
                <div className="text-center flex-1">
                  <h1 className="text-2xl font-bold mb-2">Javoblar kaliti</h1>
                  <p className="text-lg">{student.fullName}</p>
                  <p className="text-sm">Variant: {variantCode}</p>
                </div>
                <div className="flex-shrink-0">
                  <QRCodeSVG 
                    value={variantCode}
                    size={100}
                    level="H"
                    includeMargin={false}
                    style={{ margin: 0 }}
                  />
                </div>
              </div>

              <hr className="border-t-2 border-gray-800 mb-4" />

              <div>
                {test.questions?.map((question: any, index: number) => (
                  <div key={index} className="mb-1">
                    <span className="font-bold">{index + 1}. </span>
                    <span className="font-bold text-blue-600">{question.correctAnswer}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderSheets = () => {
    if (selectedStudents.length === 0) {
      return <div className="text-center text-gray-500 py-12">O'quvchilar tanlanmagan</div>;
    }

    return (
      <div>
        {selectedStudents.map((student) => {
          const variant = variants.find(v => v.studentId?._id === student._id);
          const variantCode = variant?.variantCode || variant?.qrPayload || '';
          
          console.log('Rendering sheet for student:', {
            studentName: student.fullName,
            variantCode,
            hasVariant: !!variant,
            variant
          });
          
          return (
            <div key={student._id} className="page-break">
              <AnswerSheet
                student={{
                  fullName: student.fullName,
                  variantCode: variantCode
                }}
                test={{
                  name: test.name,
                  subjectName: test.subjectId?.nameUzb || test.subjectId || 'Test',
                  classNumber: test.classNumber || 10,
                  groupLetter: test.groupId?.nameUzb?.charAt(0) || 'A'
                }}
                questions={test.questions.length}
                qrData={variantCode}
                columns={columnsCount}
              />
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
            background: white !important;
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
          
          .page-break-inside-avoid { 
            page-break-inside: avoid; 
            break-inside: avoid; 
          }
          
          * { 
            background: white !important;
          }
          
          @page {
            size: A4 portrait;
            margin: 1cm;
            padding: 0;
          }
          
          /* Убираем все границы layout */}
          aside, nav, header, .sidebar { display: none !important; }
          main { margin: 0 !important; padding: 0 !important; }
        }
        @page {
          margin: 1cm;
          size: A4;
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
      
      <div className="min-h-screen bg-white print-view-mode">
        <div className="no-print mb-6 p-4 flex gap-3 bg-white">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Orqaga
          </Button>
          {type === 'sheets' && (
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
        {showSettings && type === 'sheets' && (
          <div className="no-print fixed top-20 right-4 z-50 bg-white border-2 border-gray-300 rounded-lg shadow-xl p-4 w-72">
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

        <div className="max-w-4xl mx-auto bg-white">
          {type === 'questions' && renderQuestions()}
          {type === 'answers' && renderAnswers()}
          {type === 'sheets' && renderSheets()}
          {type === 'all' && (
            <>
              {renderQuestions()}
              {renderAnswers()}
              {renderSheets()}
            </>
          )}
        </div>
      </div>
    </>
  );
}
