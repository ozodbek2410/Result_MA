import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import MathText from '@/components/MathText';
import { Printer, ArrowLeft, Settings, Download } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import AnswerSheet from '@/components/AnswerSheet';
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, PageBreak } from 'docx';
import { saveAs } from 'file-saver';

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

  // Функция для очистки текста от HTML и LaTeX
  const cleanText = (text: string): string => {
    if (!text) return '';
    
    // Удаляем HTML теги
    let cleaned = text.replace(/<[^>]*>/g, '');
    
    // Удаляем LaTeX формулы (оставляем содержимое)
    cleaned = cleaned.replace(/\$\$([^$]+)\$\$/g, '$1');
    cleaned = cleaned.replace(/\$([^$]+)\$/g, '$1');
    
    // Декодируем HTML entities
    cleaned = cleaned.replace(/&nbsp;/g, ' ');
    cleaned = cleaned.replace(/&lt;/g, '<');
    cleaned = cleaned.replace(/&gt;/g, '>');
    cleaned = cleaned.replace(/&amp;/g, '&');
    cleaned = cleaned.replace(/&quot;/g, '"');
    
    return cleaned.trim();
  };

  const handleDownloadWord = async () => {
    if (selectedStudents.length === 0) {
      alert('O\'quvchilar tanlanmagan');
      return;
    }

    try {
      const sections: any[] = [];

      for (const student of selectedStudents) {
        const variant = variants.find(v => v.studentId?._id === student._id);
        const variantCode = variant?.variantCode || '';
        
        // Используем shuffledQuestions если они есть, иначе оригинальные вопросы
        const questionsToRender = variant?.shuffledQuestions && variant.shuffledQuestions.length > 0
          ? variant.shuffledQuestions
          : test.questions;

        // Заголовок для каждого студента
        sections.push(
          new Paragraph({
            text: test.subjectId?.nameUzb || test.subjectId || 'Test',
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: student.fullName,
                bold: true,
                size: 28
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 }
          }),
          new Paragraph({
            text: `Variant: ${variantCode}`,
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 }
          }),
          new Paragraph({
            text: `${test.classNumber || 10}-sinf | ${test.groupId?.nameUzb || ''}`,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
          })
        );

        // Добавляем вопросы
        for (const [index, question] of questionsToRender.entries()) {
          // Текст вопроса
          const questionText = cleanText(question.text);
          sections.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `${index + 1}. `,
                  bold: true
                }),
                new TextRun({
                  text: questionText
                })
              ],
              spacing: { before: 200, after: 100 }
            })
          );

          // Варианты ответов
          if (question.variants && question.variants.length > 0) {
            question.variants.forEach((qVariant: any) => {
              const optionText = cleanText(qVariant.text);
              sections.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${qVariant.letter}) `,
                      bold: true
                    }),
                    new TextRun({
                      text: optionText
                    })
                  ],
                  spacing: { after: 50 },
                  indent: { left: 400 }
                })
              );
            });
          }
        }

        // Разрыв страницы между студентами
        if (student !== selectedStudents[selectedStudents.length - 1]) {
          sections.push(new Paragraph({ children: [new PageBreak()] }));
        }
      }

      const doc = new Document({
        sections: [{
          properties: {},
          children: sections
        }]
      });

      const blob = await Packer.toBlob(doc);
      const fileName = `${test.subjectId?.nameUzb || 'test'}-${test.classNumber || 10}-sinf.docx`;
      saveAs(blob, fileName);
    } catch (error) {
      console.error('Error generating Word document:', error);
      alert('Word faylini yaratishda xatolik yuz berdi');
    }
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

    // Группируем студентов по страницам
    const pages = [];
    for (let i = 0; i < selectedStudents.length; i += testsPerPage) {
      pages.push(selectedStudents.slice(i, i + testsPerPage));
    }

    return (
      <div>
        {pages.map((studentsOnPage, pageIndex) => (
          <div key={pageIndex} className="page-break mb-8">
            <div className={`grid gap-6 ${testsPerPage === 2 ? 'grid-cols-2' : testsPerPage === 4 ? 'grid-cols-2' : ''}`}>
              {studentsOnPage.map((student, studentIndex) => {
                const variant = variants.find(v => v.studentId?._id === student._id);
                const variantCode = variant?.variantCode || '';
                
                // Используем shuffledQuestions если они есть, иначе оригинальные вопросы
                const questionsToRender = variant?.shuffledQuestions && variant.shuffledQuestions.length > 0
                  ? variant.shuffledQuestions
                  : test.questions;
                
                return (
                  <div key={student._id} className={testsPerPage > 1 ? 'border-2 border-gray-300 p-3' : ''}>
                    {/* Header */}
                    <div className="flex justify-between items-start mb-3">
                      <div className={testsPerPage > 1 ? 'text-sm' : ''}>
                        <h2 className={`font-bold ${testsPerPage > 1 ? 'text-base' : 'text-xl'}`}>{student.fullName}</h2>
                        <p className="text-xs">Variant: {variantCode}</p>
                        <p className="text-xs">{test.subjectId?.nameUzb || test.subjectId || 'Test'} {test.classNumber || 10}{test.groupId?.nameUzb?.charAt(0) || 'A'}</p>
                      </div>
                      <div className="flex-shrink-0">
                        <QRCodeSVG 
                          value={variantCode}
                          size={testsPerPage > 1 ? 60 : 100}
                          level="H"
                          includeMargin={false}
                          style={{ margin: 0 }}
                        />
                      </div>
                    </div>

                    <hr className="border-t-2 border-gray-800 mb-3" />

                    {/* Questions */}
                    <div className={testsPerPage > 1 ? 'space-y-2' : 'space-y-4'}>
                      {questionsToRender?.map((question: any, index: number) => (
                        <div key={index} className="page-break-inside-avoid">
                          <div className="mb-1">
                            <span className={`font-bold ${testsPerPage > 1 ? 'text-xs' : ''}`}>{index + 1}. </span>
                            <span className={testsPerPage > 1 ? 'text-xs' : ''}>
                              <MathText text={question.text} />
                            </span>
                          </div>
                          {question.imageUrl && testsPerPage === 1 && (
                            <div className="my-2 ml-6">
                              <img 
                                src={question.imageUrl} 
                                alt="Question" 
                                className="max-w-full h-auto"
                                style={{ maxHeight: '200px', objectFit: 'contain' }}
                              />
                            </div>
                          )}
                          <div className={testsPerPage > 1 ? 'ml-3' : 'ml-6'}>
                            {question.variants?.map((qVariant: any) => (
                              <div key={qVariant.letter} className="mb-0.5">
                                <span className={`font-semibold ${testsPerPage > 1 ? 'text-xs' : ''}`}>{qVariant.letter}) </span>
                                <span className={testsPerPage > 1 ? 'text-xs' : ''}>
                                  <MathText text={qVariant.text} />
                                </span>
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
        {selectedStudents.map((student, studentIndex) => {
          const variant = variants.find(v => v.studentId?._id === student._id);
          const variantCode = variant?.variantCode || '';
          
          // Используем shuffledQuestions если они есть, иначе оригинальные вопросы
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

    // Группируем варианты по страницам
    const pages = [];
    for (let i = 0; i < selectedStudents.length; i += sheetsPerPage) {
      pages.push(selectedStudents.slice(i, i + sheetsPerPage));
    }

    return (
      <div>
        {pages.map((studentsOnPage, pageIndex) => (
          <div key={pageIndex} className="page-break" style={{ 
            width: '210mm', 
            height: '297mm',
            margin: '0 auto',
            position: 'relative',
            padding: sheetsPerPage === 1 ? '5mm' : sheetsPerPage === 2 ? '2mm 3mm' : '2mm',
            backgroundColor: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start'
          }}>
            <div className={`${
              sheetsPerPage === 2 ? 'flex flex-col' : 
              sheetsPerPage === 4 ? 'grid grid-cols-2 gap-1' : 
              ''
            }`} style={{ 
              width: '100%',
              height: '100%',
              gap: sheetsPerPage === 2 ? '0' : sheetsPerPage === 4 ? '2mm' : '0'
            }}>
              {studentsOnPage.map((student, idx) => {
                const variant = variants.find(v => v.studentId?._id === student._id);
                const variantCode = variant?.variantCode || variant?.qrPayload || '';
                
                return (
                  <div 
                    key={student._id}
                    style={{
                      width: '100%',
                      height: sheetsPerPage === 2 ? '50%' : sheetsPerPage === 4 ? 'calc(50% - 1mm)' : '100%',
                      overflow: 'visible',
                      position: 'relative',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'center'
                    }}
                  >
                    <AnswerSheet
                      student={{
                        fullName: student.fullName,
                        variantCode: variantCode
                      }}
                      test={{
                        name: test.name,
                        subjectName: test.subjectId?.nameUzb || test.subjectId || 'Test',
                        classNumber: test.classNumber || 10,
                        groupLetter: test.groupId?.nameUzb?.charAt(0) || 'A',
                        groupName: test.groupId?.name || test.groupId?.nameUzb || ''
                      }}
                      questions={test.questions.length}
                      qrData={variantCode}
                      columns={columnsCount}
                      compact={sheetsPerPage > 1}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
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
          {(type === 'sheets' || type === 'questions') && (
            <Button variant="outline" onClick={() => setShowSettings(!showSettings)}>
              <Settings className="w-4 h-4 mr-2" />
              Sozlamalar
            </Button>
          )}
          {type === 'questions' && selectedStudents.length > 0 && (
            <Button variant="outline" onClick={handleDownloadWord}>
              <Download className="w-4 h-4 mr-2" />
              Word yuklash
            </Button>
          )}
          <Button onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />
            Chop etish
          </Button>
        </div>

        {/* Settings Panel */}
        {showSettings && (type === 'sheets' || type === 'questions') && (
          <div className="no-print fixed top-20 right-4 z-50 bg-white border-2 border-gray-300 rounded-lg shadow-xl p-4 w-72">
            <h3 className="font-bold text-lg mb-4">Chop etish sozlamalari</h3>
            
            {type === 'questions' && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  Bir sahifada testlar soni
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setTestsPerPage(1)}
                    className={`py-2 px-3 rounded border-2 font-medium transition-colors text-sm ${
                      testsPerPage === 1
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300'
                    }`}
                  >
                    1 test
                  </button>
                  <button
                    onClick={() => setTestsPerPage(2)}
                    className={`py-2 px-3 rounded border-2 font-medium transition-colors text-sm ${
                      testsPerPage === 2
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300'
                    }`}
                  >
                    2 test
                  </button>
                  <button
                    onClick={() => setTestsPerPage(4)}
                    className={`py-2 px-3 rounded border-2 font-medium transition-colors text-sm ${
                      testsPerPage === 4
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300'
                    }`}
                  >
                    4 test
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {testsPerPage === 1 && 'Katta shrift, rasmlar bilan'}
                  {testsPerPage === 2 && 'O\'rtacha shrift, 2 ustunda'}
                  {testsPerPage === 4 && 'Kichik shrift, 2x2 grid'}
                </p>
              </div>
            )}
            
            {type === 'sheets' && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-3">
                    Sahifada varaqlar soni
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="sheetsPerPage"
                        value="1"
                        checked={sheetsPerPage === 1}
                        onChange={() => setSheetsPerPage(1)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="ml-3 flex-1">
                        <span className="font-medium">1 varaq</span>
                        <span className="block text-xs text-gray-500">Katta o'lcham, to'liq sahifa</span>
                      </span>
                    </label>
                    
                    <label className="flex items-center p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="sheetsPerPage"
                        value="2"
                        checked={sheetsPerPage === 2}
                        onChange={() => setSheetsPerPage(2)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="ml-3 flex-1">
                        <span className="font-medium">2 varaq</span>
                        <span className="block text-xs text-gray-500">O'rtacha o'lcham, vertikal</span>
                      </span>
                    </label>
                    
                    <label className="flex items-center p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="sheetsPerPage"
                        value="4"
                        checked={sheetsPerPage === 4}
                        onChange={() => setSheetsPerPage(4)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="ml-3 flex-1">
                        <span className="font-medium">4 varaq</span>
                        <span className="block text-xs text-gray-500">Kichik o'lcham, 2x2 grid</span>
                      </span>
                    </label>
                  </div>
                </div>
                
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
              </>
            )}

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
