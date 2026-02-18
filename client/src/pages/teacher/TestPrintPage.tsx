import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import MathText from '@/components/MathText';
import { Printer, ArrowLeft, FileText } from 'lucide-react';
import AnswerSheet from '@/components/AnswerSheet';
import { convertTiptapJsonToText } from '@/lib/latexUtils';
import { useToast } from '@/hooks/useToast';

export default function TestPrintPage() {
  const { id, type } = useParams<{ id: string; type: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const [test, setTest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStudents, setSelectedStudents] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [columnsCount, setColumnsCount] = useState(2);
  const [testsPerPage] = useState(1);
  const [sheetsPerPage, setSheetsPerPage] = useState(1);
  const [fontSize, setFontSize] = useState(11);
  const [fontFamily, setFontFamily] = useState('Cambria');
  const [spacing] = useState('normal');
  const [lineHeight, setLineHeight] = useState(1);
  const [backgroundImage, setBackgroundImage] = useState<string>('/logo.png');
  const [backgroundOpacity, setBackgroundOpacity] = useState(0.05);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  
  // Word export state
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportJobId, setExportJobId] = useState<string | null>(null);

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

  const handleDownloadPDF = async () => {
    try {
      setExporting(true);
      setExportProgress(0);
      success('PDF yaratilmoqda...');
      
      const endpoint = isBlockTest 
        ? `/block-tests/${id}/export-pdf-async`
        : `/tests/${id}/export-pdf-async`;
      
      // Step 1: Start export job
      const { data } = await api.post(endpoint, {
        students: selectedStudents.map(s => s._id)
      });
      
      const { jobId, estimatedTime } = data;
      setExportJobId(jobId);
      
      console.log(`✅ PDF export job started: ${jobId}, estimated: ${estimatedTime}s`);
      
      // Step 2: Poll status
      const pollStatus = async () => {
        try {
          const statusEndpoint = isBlockTest
            ? `/block-tests/pdf-export-status/${jobId}`
            : `/tests/pdf-export-status/${jobId}`;
          
          const { data: status } = await api.get(statusEndpoint);
          
          // Update progress
          setExportProgress(status.progress || 0);
          
          // Completed
          if (status.status === 'completed') {
            success('PDF tayyor!');
            
            // Download file
            const link = document.createElement('a');
            link.href = status.result.fileUrl;
            link.download = status.result.fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            setExporting(false);
            setExportJobId(null);
            setExportProgress(0);
            return;
          }
          
          // Failed
          if (status.status === 'failed') {
            showError(`Xatolik: ${status.error}`);
            setExporting(false);
            setExportJobId(null);
            setExportProgress(0);
            return;
          }
          
          // Continue polling
          setTimeout(pollStatus, 2000); // Check every 2 seconds
          
        } catch (error: any) {
          console.error('Status check error:', error);
          showError('Status tekshirishda xatolik');
          setExporting(false);
          setExportJobId(null);
        }
      };
      
      // Start polling
      setTimeout(pollStatus, 1000); // First check after 1 second
      
    } catch (error: any) {
      console.error('Error starting PDF export:', error);
      
      // Fallback to sync version if async fails
      if (error.response?.status === 503 || error.response?.status === 404) {
        console.log('⚠️ Falling back to sync PDF export...');
        await handleDownloadPDFSync();
      } else {
        showError(error.response?.data?.message || 'PDF yuklashda xatolik');
        setExporting(false);
        setExportJobId(null);
      }
    }
  };
  
  // Fallback: Sync PDF version (old method)
  const handleDownloadPDFSync = async () => {
    try {
      success('PDF yuklanmoqda...');
      
      const endpoint = isBlockTest 
        ? `/block-tests/${id}/export-pdf`
        : `/tests/${id}/export-pdf`;
      
      const params = selectedStudents.length > 0 
        ? `?students=${selectedStudents.map(s => s._id).join(',')}`
        : '';
      
      const response = await api.get(`${endpoint}${params}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const filename = isBlockTest 
        ? `block-test-${id}-${Date.now()}.pdf`
        : `test-${id}-${Date.now()}.pdf`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      success('PDF yuklandi');
      setExporting(false);
    } catch (error: any) {
      console.error('Error downloading PDF:', error);
      showError('PDF yuklashda xatolik');
      setExporting(false);
    }
  };

  const handleDownloadWord = async () => {
    try {
      setExporting(true);
      setExportProgress(0);
      success('Word yaratilmoqda...');
      
      const endpoint = isBlockTest 
        ? `/block-tests/${id}/export-docx-async`
        : `/tests/${id}/export-docx-async`;
      
      // Step 1: Start export job
      const { data } = await api.post(endpoint, {
        students: selectedStudents.map(s => s._id),
        settings: {
          fontSize,
          fontFamily,
          lineHeight,
          columnsCount,
          backgroundOpacity,
          backgroundImage: backgroundImage !== '/logo.png' ? backgroundImage : undefined
        }
      });
      
      const { jobId, estimatedTime } = data;
      setExportJobId(jobId);
      
      console.log(`✅ Export job started: ${jobId}, estimated: ${estimatedTime}s`);
      
      // Step 2: Poll status
      const pollStatus = async () => {
        try {
          const statusEndpoint = isBlockTest
            ? `/block-tests/export-status/${jobId}`
            : `/tests/export-status/${jobId}`;
          
          const { data: status } = await api.get(statusEndpoint);
          
          // Update progress
          setExportProgress(status.progress || 0);
          
          // Completed
          if (status.status === 'completed') {
            success('Word tayyor!');
            
            // Download file
            const link = document.createElement('a');
            link.href = status.result.fileUrl;
            link.download = status.result.fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            setExporting(false);
            setExportJobId(null);
            setExportProgress(0);
            return;
          }
          
          // Failed
          if (status.status === 'failed') {
            showError(`Xatolik: ${status.error}`);
            setExporting(false);
            setExportJobId(null);
            setExportProgress(0);
            return;
          }
          
          // Continue polling
          setTimeout(pollStatus, 2000); // Check every 2 seconds
          
        } catch (error: any) {
          console.error('Status check error:', error);
          showError('Status tekshirishda xatolik');
          setExporting(false);
          setExportJobId(null);
        }
      };
      
      // Start polling
      setTimeout(pollStatus, 1000); // First check after 1 second
      
    } catch (error: any) {
      console.error('Error starting export:', error);
      
      // Fallback to sync version if async fails
      if (error.response?.status === 503 || error.response?.status === 404) {
        console.log('⚠️ Falling back to sync export...');
        await handleDownloadWordSync();
      } else {
        showError(error.response?.data?.message || 'Word yuklashda xatolik');
        setExporting(false);
        setExportJobId(null);
      }
    }
  };
  
  // Fallback: Sync version (old method)
  const handleDownloadWordSync = async () => {
    try {
      success('Word yuklanmoqda...');
      
      const endpoint = isBlockTest 
        ? `/block-tests/${id}/export-docx`
        : `/tests/${id}/export-docx`;
      
      // Sozlamalarni query parametrlar orqali yuboramiz
      const params = new URLSearchParams();
      
      if (selectedStudents.length > 0) {
        params.append('students', selectedStudents.map(s => s._id).join(','));
      }
      
      // Print sozlamalari
      params.append('fontSize', fontSize.toString());
      params.append('fontFamily', fontFamily);
      params.append('lineHeight', lineHeight.toString());
      params.append('columnsCount', columnsCount.toString());
      params.append('backgroundOpacity', backgroundOpacity.toString());
      
      // Background image ni base64 formatda yuboramiz (agar mavjud bo'lsa)
      if (backgroundImage && backgroundImage !== '/logo.png') {
        params.append('customBackground', backgroundImage);
      } else if (backgroundImage === '/logo.png') {
        params.append('useDefaultLogo', 'true');
      }
      
      const response = await api.get(`${endpoint}?${params.toString()}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const filename = isBlockTest 
        ? `block-test-${id}-${Date.now()}.docx`
        : `test-${id}-${Date.now()}.docx`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      success('Word yuklandi');
    } catch (error: any) {
      console.error('Error downloading Word:', error);
      showError('Word yuklashda xatolik');
    }
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

    // Проверяем есть ли варианты
    const hasVariants = variants.length > 0;
    const hasShuffledVariants = variants.some(v => v.shuffledQuestions && v.shuffledQuestions.length > 0);

    if (!hasVariants) {
      return (
        <div className="text-center py-12">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 max-w-2xl mx-auto">
            <p className="text-yellow-800 font-medium mb-2">⚠️ Variantlar yaratilmagan</p>
            <p className="text-yellow-700 text-sm">
              Testni chop etishdan oldin "Variantlarni aralash" tugmasini bosing
            </p>
          </div>
        </div>
      );
    }

    if (!hasShuffledVariants) {
      console.warn('⚠️ Variants exist but have no shuffled questions');
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
                // Более надежный поиск варианта
                const variant = variants.find(v => {
                  const variantStudentId = typeof v.studentId === 'string' 
                    ? v.studentId 
                    : v.studentId?._id;
                  return variantStudentId === student._id;
                });
                
                const variantCode = variant?.variantCode || '';
                const questionsToRender = variant?.shuffledQuestions && variant.shuffledQuestions.length > 0
                  ? variant.shuffledQuestions
                  : test.questions;

                console.log(`🎨 RENDER: Student ${student.fullName}:`, {
                  studentId: student._id,
                  hasVariant: !!variant,
                  variantStudentId: variant ? (typeof variant.studentId === 'string' ? variant.studentId : variant.studentId?._id) : 'none',
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

    // Определяем количество вопросов для выбора layout
    const firstVariant = variants.find(v => v.studentId?._id === selectedStudents[0]?._id);
    const questionsToRender = firstVariant?.shuffledQuestions && firstVariant.shuffledQuestions.length > 0
      ? firstVariant.shuffledQuestions
      : test.questions;
    const totalQuestions = questionsToRender?.length || 0;
    
    // Для 6 и 2 листов на странице: если вопросов <= 44, используем вертикальный layout, иначе горизонтальный
    const useVerticalLayout = (sheetsPerPage === 6 || sheetsPerPage === 2) && totalQuestions <= 44;

    return (
      <div>
        {pages.map((studentsOnPage, pageIndex) => (
          <div key={pageIndex} className="page-break" style={{
            width: '100%',
            margin: '0',
            display: sheetsPerPage === 1 ? 'flex' : 'grid',
            justifyContent: sheetsPerPage === 1 ? 'center' : undefined,
            gridTemplateColumns: 
              sheetsPerPage === 6 ? (useVerticalLayout ? '1fr 1fr' : '1fr 1fr 1fr') : 
              sheetsPerPage === 4 ? '1fr 1fr' : 
              sheetsPerPage === 2 ? (useVerticalLayout ? '1fr' : '1fr 1fr') : 
              '1fr',
            gridTemplateRows: 
              sheetsPerPage === 6 ? (useVerticalLayout ? '1fr 1fr 1fr' : '1fr 1fr') : 
              sheetsPerPage === 4 ? '1fr 1fr' : 
              sheetsPerPage === 2 ? (useVerticalLayout ? '1fr 1fr' : '1fr') : 
              '1fr',
            gap: 
              sheetsPerPage === 6 ? '3mm' :
              sheetsPerPage === 4 ? '5mm' : 
              sheetsPerPage === 2 ? '8mm' : 
              '0',
            minHeight: '277mm',
            padding: sheetsPerPage === 6 ? '5mm' : '10mm',
            boxSizing: 'border-box',
            // Убираем разрыв страницы для последней группы
            pageBreakAfter: pageIndex < pages.length - 1 ? 'always' : 'auto',
            breakAfter: pageIndex < pages.length - 1 ? 'page' : 'auto',
            pageBreakInside: 'avoid',
            breakInside: 'avoid'
          }}>
            {studentsOnPage.map((student) => {
              const variant = variants.find(v => v.studentId?._id === student._id);
              const variantCode = variant?.variantCode || '';
              const questionsToRender = variant?.shuffledQuestions && variant.shuffledQuestions.length > 0
                ? variant.shuffledQuestions
                : test.questions;

              return (
                <div key={student._id} style={{
                  width: sheetsPerPage === 1 ? '50%' : 
                         (sheetsPerPage === 2 && useVerticalLayout) ? '50%' : 
                         '100%',
                  height: '100%',
                  overflow: 'visible',
                  pageBreakInside: 'avoid',
                  breakInside: 'avoid',
                  margin: (sheetsPerPage === 2 && useVerticalLayout) ? '0 auto' : '0'
                }}>
                  <AnswerSheet
                    student={{
                      fullName: student.fullName,
                      variantCode: variantCode
                    }}
                    test={{
                      name: test.name || 'Test',
                      subjectName: isBlockTest ? undefined : (test.subjectId?.nameUzb || 'Test'),
                      classNumber: test.classNumber || 10,
                      groupLetter: test.groupId?.nameUzb?.charAt(0) || 'A',
                      groupName: test.groupId?.nameUzb,
                      periodMonth: isBlockTest ? test.periodMonth : undefined,
                      periodYear: isBlockTest ? test.periodYear : undefined
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
            {type === 'questions' && (
              <>
                <Button size="sm" variant="outline" onClick={handleDownloadPDF}>
                  <FileText className="w-4 h-4 mr-1" />
                  PDF yuklash
                </Button>
                <Button size="sm" variant="outline" onClick={handleDownloadWord} disabled={exporting}>
                  <FileText className="w-4 h-4 mr-1" />
                  {exporting ? `Yuklanmoqda... ${exportProgress}%` : 'Word yuklash'}
                </Button>
              </>
            )}
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
                  <option value="Cambria">Cambria</option>
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
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 4, 6].map((count) => (
                <button 
                  key={count}
                  onClick={() => setSheetsPerPage(count)} 
                  className={`py-2 rounded border ${sheetsPerPage === count ? 'bg-blue-500 text-white border-blue-500' : 'bg-white border-gray-300 hover:bg-gray-50'}`}
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
            padding: 0;
            box-sizing: border-box;
            page-break-after: always;
            page-break-inside: avoid;
            break-after: page;
            break-inside: avoid;
          }
          
          .print-page::before {
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
          
          .print-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          
          /* Для answer sheets */
          .page-break:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
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
