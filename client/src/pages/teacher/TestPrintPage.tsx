import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import MathText from '@/components/MathText';
import { Printer, ArrowLeft } from 'lucide-react';
import AnswerSheet from '@/components/AnswerSheet';
import { convertTiptapJsonToText } from '@/lib/latexUtils';

export default function TestPrintPage() {
  const { id, type } = useParams<{ id: string; type: string }>();
  const navigate = useNavigate();
  const [test, setTest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStudents, setSelectedStudents] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [columnsCount, setColumnsCount] = useState(2);
  const [testsPerPage, setTestsPerPage] = useState(1);
  const [sheetsPerPage, setSheetsPerPage] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [fontSize, setFontSize] = useState(11);
  const [fontFamily, setFontFamily] = useState('Calibri');
  const [spacing, setSpacing] = useState('normal');
  const [lineHeight, setLineHeight] = useState(1.5);
  const [backgroundImage, setBackgroundImage] = useState<string>('/logo.png');
  const [backgroundOpacity, setBackgroundOpacity] = useState(0.05);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

  // Определяем тип теста по URL
  const isBlockTest = window.location.pathname.includes('/block-tests/');

  useEffect(() => {
    fetchTest();
    fetchVariants();
    loadSelectedStudents();
  }, [id]);

  const loadSelectedStudents = () => {
    const stored = localStorage.getItem('selectedStudents');
    if (stored) {
      setSelectedStudents(JSON.parse(stored));
    }
  };

  const fetchVariants = async () => {
    try {
      const endpoint = isBlockTest 
        ? `/student-variants/block-test/${id}`
        : `/student-variants/test/${id}`;
      
      const { data } = await api.get(endpoint, {
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
      });
      setVariants(data);
      console.log('📦 CLIENT: Loaded', data.length, 'variants');
      if (data.length > 0) {
        console.log('📦 CLIENT: Sample variant:', {
          variantCode: data[0].variantCode,
          hasShuffledQuestions: !!data[0].shuffledQuestions,
          shuffledQuestionsCount: data[0].shuffledQuestions?.length,
          firstQuestionVariants: data[0].shuffledQuestions?.[0]?.variants?.map((v: any) => 
            `${v.letter}: ${v.text?.substring(0, 20)}`
          ),
          firstQuestionCorrect: data[0].shuffledQuestions?.[0]?.correctAnswer
        });
      }
    } catch (error) {
      console.error('Error fetching variants:', error);
    }
  };

  const fetchTest = async () => {
    try {
      const endpoint = isBlockTest ? `/block-tests/${id}` : `/tests/${id}`;
      const { data } = await api.get(endpoint);
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setBackgroundImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const resetBackground = () => {
    setBackgroundImage('/logo.png');
  };

  const removeBackgroundImage = () => {
    setBackgroundImage('');
  };

  const formatPeriod = (month: number, year: number) => {
    const months = [
      'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
      'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'
    ];
    return `${months[month - 1]} ${year}`;
  };

  const spacingClasses = {
    compact: { container: 'space-y-1', question: 'mb-1 pb-1', header: 'mb-2 pb-2', questions: 'space-y-1' },
    normal: { container: 'space-y-2', question: 'mb-2 pb-2', header: 'mb-3 pb-3', questions: 'space-y-2' },
    relaxed: { container: 'space-y-4', question: 'mb-3 pb-3', header: 'mb-4 pb-4', questions: 'space-y-3' }
  }[spacing];

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

    const pages = [];
    for (let i = 0; i < selectedStudents.length; i += testsPerPage) {
      pages.push(selectedStudents.slice(i, i + testsPerPage));
    }

    return (
      <div className="print:px-0 print:max-w-full print:mx-0" style={{ fontSize: `${fontSize}px` }}>
        {pages.map((studentsOnPage, pageIndex) => (
          <div key={pageIndex} className="page-break print-page mb-8 print:mb-0">
            <div className={`grid gap-6 print:gap-0 ${testsPerPage === 2 ? 'grid-cols-2' : testsPerPage === 4 ? 'grid-cols-2' : ''}`}>
              {studentsOnPage.map((student) => {
                const variant = variants.find(v => v.studentId?._id === student._id);
                const variantCode = variant?.variantCode || '';
                const questionsToRender = variant?.shuffledQuestions && variant.shuffledQuestions.length > 0
                  ? variant.shuffledQuestions
                  : test.questions;

                console.log(`🎨 RENDER: Student ${student.fullName}:`, {
                  hasVariant: !!variant,
                  variantCode,
                  hasShuffledQuestions: !!variant?.shuffledQuestions,
                  questionsCount: questionsToRender?.length,
                  firstQuestionVariants: questionsToRender?.[0]?.variants?.map((v: any) => 
                    `${v.letter}: ${v.text?.substring(0, 20)}`
                  )
                });

                return (
                  <div 
                    key={student._id} 
                    className={testsPerPage > 1 ? 'border-2 border-gray-300 p-3' : ''} 
                    style={{ 
                      fontFamily,
                      lineHeight,
                      backgroundImage: backgroundImage ? `url(${backgroundImage})` : 'none',
                      backgroundSize: 'contain',
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat',
                      position: 'relative'
                    }}
                  >
                    {backgroundImage && (
                      <div 
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: 'white',
                          opacity: 1 - backgroundOpacity,
                          pointerEvents: 'none'
                        }}
                      />
                    )}
                    
                    <div style={{ position: 'relative', zIndex: 1 }}>
                    <div className={`${spacingClasses.header}`}>
                      <div className={`flex items-center gap-3 ${testsPerPage > 1 ? 'text-sm' : ''}`}>
                        <h2 className={`font-bold ${testsPerPage > 1 ? 'text-base' : ''}`} style={{ fontSize: testsPerPage > 1 ? `${fontSize}px` : `${fontSize + 4}px` }}>
                          {student.fullName}
                        </h2>
                        <span style={{ fontSize: `${fontSize - 2}px` }}>| Variant: {variantCode}</span>
                        {isBlockTest ? (
                          <>
                            <span style={{ fontSize: `${fontSize - 2}px` }}>| {test.classNumber}-sinf</span>
                            <span style={{ fontSize: `${fontSize - 2}px` }}>| {formatPeriod(test.periodMonth, test.periodYear)}</span>
                          </>
                        ) : (
                          <span style={{ fontSize: `${fontSize - 2}px` }}>
                            | {test.subjectId?.nameUzb || test.subjectId || 'Test'} {test.classNumber || 10}{test.groupId?.nameUzb?.charAt(0) || 'A'}
                          </span>
                        )}
                      </div>
                    </div>

                    <hr className="border-t-2 border-gray-800 mb-3" />

                    <div className={columnsCount === 2 ? 'columns-2 gap-4' : ''}>
                      <div className={spacingClasses.questions}>
                        {questionsToRender?.map((question: any, index: number) => {
                          const questionText = convertTiptapJsonToText(question.text);

                          return (
                            <div key={index} className={`page-break-inside-avoid ${spacingClasses.question}`}>
                              <div className="mb-1">
                                <span className="font-bold">{index + 1}. </span>
                                <span><MathText text={questionText} /></span>
                              </div>
                              {question.imageUrl && (
                                <div className="my-2 ml-6">
                                  <img src={question.imageUrl} alt="Question" className="max-w-full h-auto" style={{ maxHeight: testsPerPage === 1 ? '200px' : '150px', objectFit: 'contain' }} />
                                </div>
                              )}
                              <div className={testsPerPage > 1 ? 'ml-3' : 'ml-6'}>
                                {question.variants?.map((qVariant: any) => {
                                  const variantText = convertTiptapJsonToText(qVariant.text);
                                  return (
                                    <span key={qVariant.letter} className="mr-3">
                                      <span className="font-semibold">{qVariant.letter}) </span>
                                      <MathText text={variantText} />
                                    </span>
                                  );
                                })}
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
          </div>
        ))}
      </div>
    );
  };

  const renderAnswers = () => {
    if (selectedStudents.length === 0) {
      return <div className="text-center text-gray-500 py-12">O'quvchilar tanlanmagan</div>;
    }

    return (
      <div>
        {selectedStudents.map((student) => {
          const variant = variants.find(v => v.studentId?._id === student._id);
          const variantCode = variant?.variantCode || '';
          const questionsToRender = variant?.shuffledQuestions && variant.shuffledQuestions.length > 0
            ? variant.shuffledQuestions
            : test.questions;

          return (
            <div key={student._id} className="page-break mb-8">
              <div className="flex justify-between items-start mb-6">
                <div className="text-center flex-1">
                  <h1 className="text-2xl font-bold mb-2">Javoblar kaliti</h1>
                  <p className="text-lg">{student.fullName}</p>
                  <p className="text-sm">Variant: {variantCode}</p>
                </div>
              </div>
              <hr className="border-t-2 border-gray-800 mb-4" />
              <div>
                {questionsToRender?.map((question: any, index: number) => (
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

    const pages = [];
    for (let i = 0; i < selectedStudents.length; i += sheetsPerPage) {
      pages.push(selectedStudents.slice(i, i + sheetsPerPage));
    }

    return (
      <div>
        {pages.map((studentsOnPage, pageIndex) => (
          <div key={pageIndex} className="page-break" style={{
            width: sheetsPerPage === 1 ? '50%' : '100%',
            margin: '0 auto',
            display: sheetsPerPage === 1 ? 'block' : 'grid',
            gridTemplateColumns: sheetsPerPage === 2 ? '1fr 1fr' : sheetsPerPage === 4 ? '1fr 1fr' : '1fr',
            gridTemplateRows: sheetsPerPage === 4 ? '1fr 1fr' : '1fr',
            gap: sheetsPerPage > 1 ? '10mm' : '0'
          }}>
            {studentsOnPage.map((student) => {
              const variant = variants.find(v => v.studentId?._id === student._id);
              const variantCode = variant?.variantCode || '';
              const questionsToRender = variant?.shuffledQuestions && variant.shuffledQuestions.length > 0
                ? variant.shuffledQuestions
                : test.questions;

              return (
                <div key={student._id}>
                  <AnswerSheet
                    student={{
                      fullName: student.fullName,
                      variantCode: variantCode
                    }}
                    test={{
                      name: test.name || 'Test',
                      subjectName: test.subjectId?.nameUzb || 'Test',
                      classNumber: test.classNumber || 10,
                      groupLetter: test.groupId?.nameUzb?.charAt(0) || 'A',
                      groupName: test.groupId?.nameUzb
                    }}
                    questions={questionsToRender?.length || 0}
                    qrData={variantCode}
                    sheetsPerPage={sheetsPerPage}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white print-view-mode print:min-h-0 print:m-0 print:p-0">
      {/* Top Bar - Only Print Button */}
      <div className="no-print mb-4 p-3 bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Orqaga
            </Button>
            <Button size="sm" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-1" />
              Chop etish
            </Button>
            {(type === 'questions' || type === 'sheets') && (
              <Button size="sm" variant="outline" onClick={() => setShowSettingsPanel(!showSettingsPanel)}>
                Sozlamalar
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Fixed Side Panel */}
      {showSettingsPanel && type === 'questions' && (
        <div className="no-print fixed right-4 top-20 w-80 bg-white border shadow-lg rounded-lg p-4 max-h-[calc(100vh-100px)] overflow-y-auto z-50">
          <h3 className="font-semibold text-gray-900 mb-4">Sozlamalar</h3>

          <div className="space-y-4">
              {/* Text Settings */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Shrift turi</label>
                <select 
                  value={fontFamily} 
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="w-full p-2 border rounded text-sm"
                  style={{ fontFamily }}
                >
                  <option value="Arial">Arial</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Calibri">Calibri</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Verdana">Verdana</option>
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">O'lchami: {fontSize}px</label>
                <input 
                  type="range" 
                  min="8" 
                  max="18" 
                  value={fontSize} 
                  onChange={(e) => setFontSize(Number(e.target.value))} 
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Qatorlar oralig'i</label>
                <select 
                  value={lineHeight} 
                  onChange={(e) => setLineHeight(Number(e.target.value))}
                  className="w-full p-2 border rounded text-sm"
                >
                  <option value={1}>1.0</option>
                  <option value={1.15}>1.15</option>
                  <option value={1.5}>1.5</option>
                  <option value={2}>2.0</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Ustunlar</label>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setColumnsCount(1)} 
                    className={`flex-1 py-2 rounded text-sm ${columnsCount === 1 ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                  >
                    1
                  </button>
                  <button 
                    onClick={() => setColumnsCount(2)} 
                    className={`flex-1 py-2 rounded text-sm ${columnsCount === 2 ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                  >
                    2
                  </button>
                </div>
              </div>

              {/* Background Settings */}
              <div className="border-t pt-4">
                <label className="block text-xs font-medium text-gray-700 mb-2">Fon rasmi</label>
                
                <div className="flex gap-2 mb-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="background-upload"
                  />
                  <label
                    htmlFor="background-upload"
                    className="flex-1 px-3 py-1.5 bg-blue-500 text-white rounded cursor-pointer hover:bg-blue-600 text-xs text-center"
                  >
                    Yuklash
                  </label>
                  
                  <button
                    onClick={resetBackground}
                    className="flex-1 px-3 py-1.5 bg-green-500 text-white rounded hover:bg-green-600 text-xs"
                  >
                    Logo
                  </button>
                  
                  {backgroundImage && (
                    <button
                      onClick={removeBackgroundImage}
                      className="flex-1 px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 text-xs"
                    >
                      O'chirish
                    </button>
                  )}
                </div>
                
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Shaffoflik: {Math.round(backgroundOpacity * 100)}%</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={backgroundOpacity}
                    onChange={(e) => setBackgroundOpacity(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                
                {backgroundImage && (
                  <div className="mt-2 p-2 bg-gray-50 rounded border">
                    <img src={backgroundImage} alt="Preview" className="h-16 mx-auto object-contain" />
                  </div>
                )}
              </div>
            </div>
        </div>
      )}

      {showSettingsPanel && type === 'sheets' && (
        <div className="no-print fixed right-4 top-20 w-80 bg-white border shadow-lg rounded-lg p-4 z-50">
          <div className="mb-4">
            <h3 className="font-semibold text-gray-900 mb-3">Sozlamalar</h3>
            <label className="block text-sm font-medium mb-2 text-gray-700">Bir sahifada varaqlar</label>
            <div className="flex gap-2">
              {[1, 2, 4].map((count) => (
                <button 
                  key={count}
                  onClick={() => setSheetsPerPage(count)} 
                  className={`flex-1 py-2 rounded border ${sheetsPerPage === count ? 'bg-blue-500 text-white border-blue-500' : 'bg-white border-gray-300 hover:bg-gray-50'}`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {type === 'questions' && renderQuestions()}
      {type === 'answers' && renderAnswers()}
      {type === 'sheets' && renderSheets()}

      <style>{`
        @media print {
          html, body { 
            margin: 0 !important; 
            padding: 0 !important; 
          }
          
          /* Настройки страницы без отступов */
          @page { 
            size: A4 portrait; 
            margin: 0;
          }
          
          /* Каждая печатная страница без рамки */
          .print-page {
            position: relative;
            width: 100%;
            padding: 0.5cm;
            box-sizing: border-box;
            page-break-after: always;
            page-break-inside: avoid;
            break-after: page;
            break-inside: avoid;
          }
          
          .print-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          
          .no-print { display: none !important; }
          .page-break-inside-avoid { 
            page-break-inside: avoid;
            break-inside: avoid;
          }
          
          aside, nav, header, .sidebar { display: none !important; }
          
          /* Принудительная печать фоновых изображений */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
        }
        
        /* Стили для экрана - показываем рамку в превью */
        @media screen {
          .print-page {
            border: 1px dashed #ccc;
            margin-bottom: 2rem;
            padding: 1rem;
          }
        }
        
        body:has(.print-view-mode) aside,
        body:has(.print-view-mode) nav,
        body:has(.print-view-mode) header,
        body:has(.print-view-mode) .sidebar { display: none !important; }
        body:has(.print-view-mode) main { margin: 0 !important; padding: 0 !important; max-width: 100% !important; }
      `}</style>
    </div>
  );
}
