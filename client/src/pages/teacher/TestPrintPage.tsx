import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import MathText from '@/components/MathText';
import { Printer, ArrowLeft, FileText, Download, FileDown, X } from 'lucide-react';
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
  const [variantsLoading, setVariantsLoading] = useState(true);
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
      setVariantsLoading(false);
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
      setVariantsLoading(false);
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

  // Handle Answer Sheet PDF Export (server-side Playwright)
  const handleDownloadAnswerKeyPDF = async () => {
    let progressTimer: ReturnType<typeof setInterval> | null = null;
    try {
      setExporting(true);
      setExportProgress(5);
      success('Javob varaqasi PDF yaratilmoqda...');

      const endpoint = isBlockTest
        ? `/block-tests/${id}/export-answer-sheets-pdf`
        : `/tests/${id}/export-answer-sheets-pdf`;

      const studentParam = selectedStudents.length > 0
        ? `?students=${selectedStudents.map(s => s._id).join(',')}`
        : '';

      const studentCount = Math.max(selectedStudents.length, 1);
      const estimatedMs = studentCount * 1500;
      const startTime = Date.now();
      progressTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const ratio = Math.min(elapsed / estimatedMs, 1);
        const simulated = 5 + 85 * (1 - Math.pow(1 - ratio, 2));
        setExportProgress(Math.round(simulated));
      }, 300);

      const response = await api.get(`${endpoint}${studentParam}`, {
        responseType: 'blob',
      });

      clearInterval(progressTimer);
      setExportProgress(100);

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `javob-varaqasi-${Date.now()}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      success('PDF yuklandi');
      setTimeout(() => {
        setExporting(false);
        setExportProgress(0);
      }, 500);
    } catch (error: unknown) {
      if (progressTimer) clearInterval(progressTimer);
      console.error('Error downloading answer sheets PDF:', error);
      showError('PDF yuklashda xatolik');
      setExporting(false);
      setExportProgress(0);
    }
  };

  // Handle Answer Sheet Word Export
  const handleDownloadAnswerKeyWord = async () => {
    let progressTimer: ReturnType<typeof setInterval> | null = null;
    try {
      setExporting(true);
      setExportProgress(5);
      success('Javob varaqasi Word yaratilmoqda...');

      const endpoint = isBlockTest
        ? `/block-tests/${id}/export-answer-sheets-docx`
        : `/tests/${id}/export-answer-sheets-docx`;

      const studentCount = Math.max(selectedStudents.length, 1);
      const estimatedMs = studentCount * 800;
      const startTime = Date.now();
      progressTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const ratio = Math.min(elapsed / estimatedMs, 1);
        setExportProgress(Math.round(5 + 85 * (1 - Math.pow(1 - ratio, 2))));
      }, 300);

      const response = await api.post(endpoint, {
        students: selectedStudents.map(s => s._id),
      }, { responseType: 'blob' });

      clearInterval(progressTimer);
      setExportProgress(100);

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `javob-varaqasi-${Date.now()}.docx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      success('Word yuklandi');
      setTimeout(() => { setExporting(false); setExportProgress(0); }, 500);
    } catch (error: unknown) {
      if (progressTimer) clearInterval(progressTimer);
      console.error('Error downloading answer sheets DOCX:', error);
      showError('Word yuklashda xatolik');
      setExporting(false);
      setExportProgress(0);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      setExporting(true);
      setExportProgress(0);
      success('PDF yaratilmoqda...');
      
      // Determine endpoint based on type
      let endpoint = '';
      if (type === 'sheets') {
        endpoint = isBlockTest 
          ? `/block-tests/${id}/export-answer-sheets-pdf-async`
          : `/tests/${id}/export-answer-sheets-pdf-async`;
      } else {
        endpoint = isBlockTest 
          ? `/block-tests/${id}/export-pdf-async`
          : `/tests/${id}/export-pdf-async`;
      }
      
      // Step 1: Start export job
      const { data } = await api.post(endpoint, {
        students: selectedStudents.map(s => s._id),
        settings: {
          fontSize,
          fontFamily,
          lineHeight,
          columnsCount,
          backgroundOpacity,
          backgroundImage: backgroundImage !== '/logo.png' ? backgroundImage : undefined,
          ...(type === 'sheets' ? { sheetsPerPage } : {})
        }
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
    let progressTimer: ReturnType<typeof setInterval> | null = null;
    try {
      success('PDF yaratilmoqda...');
      setExportProgress(5);

      const endpoint = isBlockTest
        ? `/block-tests/${id}/export-pdf`
        : `/tests/${id}/export-pdf`;

      const queryParts: string[] = [];
      if (selectedStudents.length > 0) queryParts.push(`students=${selectedStudents.map(s => s._id).join(',')}`);
      if (fontSize) queryParts.push(`fontSize=${fontSize}`);
      if (fontFamily) queryParts.push(`fontFamily=${encodeURIComponent(fontFamily)}`);
      if (lineHeight) queryParts.push(`lineHeight=${lineHeight}`);
      if (columnsCount) queryParts.push(`columnsCount=${columnsCount}`);
      if (backgroundOpacity !== undefined) queryParts.push(`backgroundOpacity=${backgroundOpacity}`);
      const params = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

      // Simulated progress — server javob berguncha sekin oshadi
      const studentCount = Math.max(selectedStudents.length, 1);
      const estimatedMs = studentCount * 3000; // ~3s per student
      const startTime = Date.now();
      progressTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const ratio = Math.min(elapsed / estimatedMs, 1);
        // Ease-out: tez boshlanib, sekinlashadi (5% -> 90%)
        const simulated = 5 + 85 * (1 - Math.pow(1 - ratio, 2));
        setExportProgress(Math.round(simulated));
      }, 300);

      const response = await api.get(`${endpoint}${params}`, {
        responseType: 'blob',
      });

      clearInterval(progressTimer);
      setExportProgress(100);

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
      setTimeout(() => {
        setExporting(false);
        setExportProgress(0);
      }, 500);
    } catch (error: unknown) {
      if (progressTimer) clearInterval(progressTimer);
      console.error('Error downloading PDF:', error);
      showError('PDF yuklashda xatolik');
      setExporting(false);
      setExportProgress(0);
    }
  };

  const handleDownloadWord = async () => {
    try {
      setExporting(true);
      setExportProgress(0);
      success('Word yaratilmoqda...');
      
      // Determine endpoint based on type
      let endpoint = '';
      if (type === 'sheets') {
        endpoint = isBlockTest 
          ? `/block-tests/${id}/export-answer-sheets-docx-async`
          : `/tests/${id}/export-answer-sheets-docx-async`;
      } else {
        endpoint = isBlockTest 
          ? `/block-tests/${id}/export-docx-async`
          : `/tests/${id}/export-docx-async`;
      }
      
      // Step 1: Start export job
      const { data } = await api.post(endpoint, {
        students: selectedStudents.map(s => s._id),
        settings: {
          fontSize,
          fontFamily,
          lineHeight,
          columnsCount: type === 'sheets' ? 1 : columnsCount,
          sheetsPerPage: type === 'sheets' ? sheetsPerPage : undefined,
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
    let progressTimer: ReturnType<typeof setInterval> | null = null;
    try {
      success('Word yaratilmoqda...');
      setExportProgress(5);

      const endpoint = isBlockTest
        ? `/block-tests/${id}/export-docx`
        : `/tests/${id}/export-docx`;

      const params = new URLSearchParams();
      if (selectedStudents.length > 0) {
        params.append('students', selectedStudents.map(s => s._id).join(','));
      }
      params.append('fontSize', fontSize.toString());
      params.append('fontFamily', fontFamily);
      params.append('lineHeight', lineHeight.toString());
      params.append('columnsCount', columnsCount.toString());
      params.append('backgroundOpacity', backgroundOpacity.toString());
      if (backgroundImage && backgroundImage !== '/logo.png') {
        params.append('customBackground', backgroundImage);
      } else if (backgroundImage === '/logo.png') {
        params.append('useDefaultLogo', 'true');
      }

      // Simulated progress
      const studentCount = Math.max(selectedStudents.length, 1);
      const estimatedMs = studentCount * 2000; // ~2s per student for Word
      const startTime = Date.now();
      progressTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const ratio = Math.min(elapsed / estimatedMs, 1);
        const simulated = 5 + 85 * (1 - Math.pow(1 - ratio, 2));
        setExportProgress(Math.round(simulated));
      }, 300);

      const response = await api.get(`${endpoint}?${params.toString()}`, {
        responseType: 'blob',
      });

      clearInterval(progressTimer);
      setExportProgress(100);

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
      setTimeout(() => {
        setExporting(false);
        setExportProgress(0);
      }, 500);
    } catch (error: unknown) {
      if (progressTimer) clearInterval(progressTimer);
      console.error('Error downloading Word:', error);
      showError('Word yuklashda xatolik');
      setExporting(false);
      setExportProgress(0);
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

  // Pre-compute variants map for O(1) lookup
  const variantsMap = useMemo(() => {
    const map = new Map<string, any>();
    variants.forEach(v => {
      const sid = typeof v.studentId === 'string' ? v.studentId : v.studentId?._id;
      if (sid) map.set(sid, v);
    });
    return map;
  }, [variants]);

  // Pre-compute raw questions count
  const rawQuestionsCount = useMemo(() => {
    if (!test) return 0;
    if (isBlockTest) {
      return test.subjectTests?.reduce((sum: number, st: any) => sum + (st.questions?.length || 0), 0) || 0;
    }
    return test.questions?.length || 0;
  }, [test, isBlockTest]);

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

    if (variantsLoading) {
      return (
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-6 space-y-3 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3" />
              <div className="h-3 bg-gray-100 rounded w-full" />
              <div className="h-3 bg-gray-100 rounded w-5/6" />
              <div className="flex gap-4 mt-2">
                <div className="h-3 bg-gray-100 rounded w-1/4" />
                <div className="h-3 bg-gray-100 rounded w-1/4" />
                <div className="h-3 bg-gray-100 rounded w-1/4" />
                <div className="h-3 bg-gray-100 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      );
    }

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
          <div key={pageIndex} className="page-break print-page mb-8 print:mb-0" style={{ '--print-bg-image': backgroundImage ? `url(${backgroundImage})` : 'url(/logo.png)', '--print-bg-opacity': backgroundOpacity } as React.CSSProperties}>
            <div className={`grid gap-6 print:gap-0 ${testsPerPage === 2 ? 'grid-cols-2' : testsPerPage === 4 ? 'grid-cols-2' : ''}`}>
              {studentsOnPage.map((student) => {
                const variant = variantsMap.get(student._id);
                const variantCode = variant?.variantCode || '';
                const rawQuestions = isBlockTest
                  ? test.subjectTests?.flatMap((st: any) => st.questions || [])
                  : test.questions;
                // shuffledQuestions mavjud bo'lsa doim uni ishlat (guruh bo'yicha kam bo'lishi mumkin)
                const questionsToRender = variant?.shuffledQuestions?.length > 0
                  ? variant.shuffledQuestions
                  : rawQuestions;

                return (
                  <div
                    key={student._id}
                    className={`${testsPerPage > 1 ? 'border-2 border-gray-300 p-3' : ''}`}
                    style={{ fontFamily, lineHeight, position: 'relative' }}
                  >
                    {/* Full-width header section — NO column-count here */}
                    <div>
                      {/* Academy Header */}
                      <div className="w-full flex items-center justify-between border-b-2 border-gray-800 pb-1 mb-1" style={{ fontFamily: 'Times New Roman, serif' }}>
                        <div className="flex items-center gap-2">
                          <img src="/logo.png" alt="Logo" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
                        </div>
                        <div className="text-center flex-1 px-2">
                          <div className="font-bold tracking-wide" style={{ fontSize: '16px', color: '#1a1a6e' }}>MATH ACADEMY</div>
                          <div className="font-bold" style={{ fontSize: '11px', color: '#444' }}>Xususiy maktabi</div>
                        </div>
                        <div className="text-right">
                          <div style={{ fontSize: '10px', color: '#333', lineHeight: '1.3' }}>Sharqona ta'lim-tarbiya<br/>va haqiqiy ilm maskani.</div>
                          <div className="font-bold" style={{ fontSize: '11px', color: '#1a1a6e' }}>&#9742; +91-333-66-22</div>
                        </div>
                      </div>
                      {/* Student info */}
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
                    </div>
                    {/* Questions — 2-column section */}
                    <div style={{ columnCount: columnsCount === 2 ? 2 : undefined, columnGap: columnsCount === 2 ? '1rem' : undefined }}>
                      {isBlockTest && test.subjectTests?.length > 0 ? (() => {
                        // Shuffled savollarni subjectId bo'yicha guruhlash
                        const hasShuffled = variant?.shuffledQuestions?.length > 0;

                        if (!hasShuffled) {
                          return (
                            <div className="text-center text-gray-400 py-4 text-sm">
                              Bu o'quvchi uchun variant yaratilmagan
                            </div>
                          );
                        }

                        const map = new Map<string, { name: string; groupLetter: string | null; questions: any[] }>();
                        for (const q of variant.shuffledQuestions) {
                          const sid = (q.subjectId?._id || q.subjectId || '').toString();
                          const name = q.subjectId?.nameUzb || 'Fan';
                          if (!map.has(sid)) map.set(sid, { name, groupLetter: q.studentGroupLetter || null, questions: [] });
                          map.get(sid)!.questions.push(q);
                        }
                        const subjectGroups = Array.from(map.values());

                        let globalIndex = 0;

                        return subjectGroups.filter(sg => sg.questions.length > 0).map((sg, sgIndex) => (
                          <div key={sgIndex}>
                            <div className="font-bold border-b border-gray-600 pb-1 mb-2 mt-3" style={{ fontSize: `${fontSize + 1}px` }}>
                              {sg.name}{sg.groupLetter ? ` (${sg.groupLetter} guruh)` : ''} — {sg.questions.length} ta savol
                            </div>
                            <div className={spacingClasses.questions}>
                              {sg.questions.map((question: any, qi: number) => {
                                const currentIndex = globalIndex++;
                                const questionText = convertTiptapJsonToText(question.text);
                                return (
                                  <div key={qi} className={`page-break-inside-avoid ${spacingClasses.question}`}>
                                    <div className="mb-1">
                                      <span className="font-bold">{currentIndex + 1}. </span>
                                      <span><MathText text={questionText} /></span>
                                    </div>
                                    {question.imageUrl && (
                                      <div className="my-1 ml-6">
                                        <img src={question.imageUrl} alt="Question" style={question.imageWidth ? { width: question.imageWidth, maxWidth: '100%', height: 'auto' } : undefined} onLoad={(e) => { const img = e.currentTarget; if (!img.style.width) { const w = Math.round(img.naturalWidth * 0.64); img.style.width = w + 'px'; img.style.height = 'auto'; } }} />
                                      </div>
                                    )}
                                    <div className={testsPerPage > 1 ? 'ml-3' : 'ml-6'}>
                                      {question.variants?.map((qVariant: any, vi: number) => {
                                        const variantText = convertTiptapJsonToText(qVariant.text);
                                        return (
                                          <span key={`${qi}-${vi}-${qVariant.letter}`} className="mr-3">
                                            <span className="font-semibold">{qVariant.letter}) </span>
                                            {qVariant.imageUrl ? (
                                              <img src={qVariant.imageUrl} alt={qVariant.letter} className="inline-block align-middle" style={qVariant.imageWidth ? { width: qVariant.imageWidth, maxWidth: '100%', height: 'auto' } : undefined} onLoad={(e) => { const img = e.currentTarget; if (!img.style.width) { const w = Math.round(img.naturalWidth * 0.64); img.style.width = w + 'px'; img.style.height = 'auto'; } }} />
                                            ) : (
                                              <MathText text={variantText} />
                                            )}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ));
                      })() : (
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
                                  <div className="my-1 ml-6">
                                    <img src={question.imageUrl} alt="Question" style={question.imageWidth ? { width: question.imageWidth, maxWidth: '100%', height: 'auto' } : undefined} onLoad={(e) => { const img = e.currentTarget; if (!img.style.width) { const w = Math.round(img.naturalWidth * 0.64); img.style.width = w + 'px'; img.style.height = 'auto'; } }} />
                                  </div>
                                )}
                                <div className={testsPerPage > 1 ? 'ml-3' : 'ml-6'}>
                                  {question.variants?.map((qVariant: any, vi: number) => {
                                    const variantText = convertTiptapJsonToText(qVariant.text);
                                    return (
                                      <span key={`${index}-${vi}-${qVariant.letter}`} className="mr-3">
                                        <span className="font-semibold">{qVariant.letter}) </span>
                                        {qVariant.imageUrl ? (
                                          <img src={qVariant.imageUrl} alt={qVariant.letter} className="inline-block align-middle" style={qVariant.imageWidth ? { width: qVariant.imageWidth, maxWidth: '100%', height: 'auto' } : undefined} onLoad={(e) => { const img = e.currentTarget; if (!img.style.width) { const w = Math.round(img.naturalWidth * 0.64); img.style.width = w + 'px'; img.style.height = 'auto'; } }} />
                                        ) : (
                                          <MathText text={variantText} />
                                        )}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
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
          const variant = variantsMap.get(student._id);
          const variantCode = variant?.variantCode || '';
          const questionsToRender = variant?.shuffledQuestions && variant.shuffledQuestions.length > 0
            ? variant.shuffledQuestions
            : (isBlockTest ? test.subjectTests?.flatMap((st: any) => st.questions || []) : test.questions);

          return (
            <div key={student._id} className="page-break mb-8">
              {/* Academy Header */}
              <div className="flex items-center justify-between border-b-2 border-gray-800 pb-1 mb-1" style={{ fontFamily: 'Times New Roman, serif' }}>
                <div className="flex items-center gap-2">
                  <img src="/logo.png" alt="Logo" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
                </div>
                <div className="text-center flex-1 px-2">
                  <div className="font-bold tracking-wide" style={{ fontSize: '16px', color: '#1a1a6e' }}>MATH ACADEMY</div>
                  <div className="font-bold" style={{ fontSize: '11px', color: '#444' }}>Xususiy maktabi</div>
                </div>
                <div className="text-right">
                  <div style={{ fontSize: '10px', color: '#333', lineHeight: '1.3' }}>Sharqona ta&apos;lim-tarbiya<br/>va haqiqiy ilm maskani.</div>
                  <div className="font-bold" style={{ fontSize: '11px', color: '#1a1a6e' }}>&#9742; +91-333-66-22</div>
                </div>
              </div>
              <div className="flex justify-between items-start mb-6">
                <div className="text-center flex-1">
                  <h1 className="text-2xl font-bold mb-2">Javoblar kaliti</h1>
                  <p className="text-lg">{student.fullName}</p>
                  <p className="text-sm">Variant: {variantCode}</p>
                </div>
              </div>
              <hr className="border-t-2 border-gray-800 mb-4" />
              <div>
                {isBlockTest && test.subjectTests?.length > 0 ? (() => {
                  const hasShuffled = variant?.shuffledQuestions?.length > 0;

                  if (!hasShuffled) {
                    return (
                      <div className="text-center text-gray-400 py-4 text-sm">
                        Bu o'quvchi uchun variant yaratilmagan
                      </div>
                    );
                  }

                  const map = new Map<string, { name: string; groupLetter: string | null; questions: any[] }>();
                  for (const q of variant.shuffledQuestions) {
                    const sid = (q.subjectId?._id || q.subjectId || '').toString();
                    const name = q.subjectId?.nameUzb || 'Fan';
                    if (!map.has(sid)) map.set(sid, { name, groupLetter: q.studentGroupLetter || null, questions: [] });
                    map.get(sid)!.questions.push(q);
                  }
                  const subjectGroups = Array.from(map.values());

                  let globalIndex = 0;

                  return subjectGroups.filter(sg => sg.questions.length > 0).map((sg, sgIndex) => (
                    <div key={sgIndex}>
                      <div className="font-bold border-b border-gray-400 pb-1 mb-2 mt-3">
                        {sg.name}{sg.groupLetter ? ` (${sg.groupLetter} guruh)` : ''} — {sg.questions.length} ta savol
                      </div>
                      {sg.questions.map((question: any, qi: number) => {
                        const currentIndex = globalIndex++;
                        return (
                          <div key={qi} className="mb-1">
                            <span className="font-bold">{currentIndex + 1}. </span>
                            <span className="font-bold text-blue-600">{question.correctAnswer}</span>
                          </div>
                        );
                      })}
                    </div>
                  ));
                })() : (
                  questionsToRender?.map((question: any, index: number) => (
                    <div key={index} className="mb-1">
                      <span className="font-bold">{index + 1}. </span>
                      <span className="font-bold text-blue-600">{question.correctAnswer}</span>
                    </div>
                  ))
                )}
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

    // Determine total questions for layout
    const allRawQuestions = isBlockTest
      ? test.subjectTests?.flatMap((st: any) => st.questions || [])
      : test.questions;
    const totalQuestions = allRawQuestions?.length || 0;
    
    // Для 6 и 2 листов на странице: если вопросов <= 44, используем вертикальный layout, иначе горизонтальный
    const useVerticalLayout = (sheetsPerPage === 6 || sheetsPerPage === 2) && totalQuestions <= 44;

    return (
      <div>
        {pages.map((studentsOnPage, pageIndex) => (
          <div key={pageIndex} className="page-break" style={{
            width: '100%',
            margin: '0',
            display: 'flex',
            flexWrap: sheetsPerPage > 1 ? 'wrap' : 'nowrap',
            justifyContent: 'center',
            alignItems: 'flex-start',
            padding: sheetsPerPage === 1 ? '20mm 0' : '5mm',
            boxSizing: 'border-box',
            gap:
              sheetsPerPage === 6 ? '3mm' :
              sheetsPerPage === 4 ? '5mm' :
              sheetsPerPage === 2 ? '8mm' :
              '0',
            pageBreakAfter: pageIndex < pages.length - 1 ? 'always' : 'auto',
            breakAfter: pageIndex < pages.length - 1 ? 'page' : 'auto',
          }}>
            {studentsOnPage.map((student) => {
              const variant = variantsMap.get(student._id);
              const variantCode = variant?.variantCode || '';
              // Block test: faqat variant dan ol, raw fallback qilma (noto'g'ri guruhlar chiqadi)
              const questionsToRender = variant?.shuffledQuestions?.length > 0
                ? variant.shuffledQuestions
                : (isBlockTest ? [] : test.questions);

              return (
                <div key={student._id} style={{
                  width: sheetsPerPage === 1 ? '100%' :
                         (sheetsPerPage === 2 && useVerticalLayout) ? '50%' :
                         '100%',
                  height: '100%',
                  overflow: 'visible',
                  pageBreakInside: 'avoid',
                  breakInside: 'avoid',
                  margin: sheetsPerPage === 1 ? '0 auto' : (sheetsPerPage === 2 && useVerticalLayout) ? '0 auto' : '0',
                  display: 'flex',
                  justifyContent: 'center'
                }}>
                  <AnswerSheet
                    student={{
                      fullName: student.fullName,
                      variantCode: variantCode
                    }}
                    test={{
                      name: test.name || 'Test',
                      subjectName: isBlockTest
                        ? (test.subjectTests?.map((st: { subjectId?: { nameUzb?: string } }) => st.subjectId?.nameUzb).filter(Boolean).join(', ') || 'Blok test')
                        : (test.subjectId?.nameUzb || 'Test'),
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
      {/* Top Bar - Print and Export Buttons */}
      <div className="no-print mb-4 p-4 bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            {/* Left: Back Button */}
            <Button size="sm" variant="outline" onClick={() => navigate(isBlockTest ? `/teacher/block-tests/${id}` : `/teacher/tests/${id}`)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Orqaga
            </Button>

            {/* Right: Action Buttons */}
            <div className="flex items-center gap-2">
              {/* Print Button */}
              <Button size="sm" onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700">
                <Printer className="w-4 h-4 mr-1" />
                Chop etish
              </Button>

              {/* Export Buttons */}
              <div className="flex items-center gap-1.5 border-l pl-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={type === 'sheets' ? handleDownloadAnswerKeyPDF : handleDownloadPDF}
                  disabled={exporting}
                  className="border-red-300 text-red-600 hover:bg-red-50"
                >
                  <FileDown className="w-4 h-4 mr-1" />
                  {type === 'sheets' ? 'Titul PDF' : 'PDF'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={type === 'sheets' ? handleDownloadAnswerKeyWord : handleDownloadWord}
                  disabled={exporting}
                  className="border-blue-300 text-blue-600 hover:bg-blue-50"
                >
                  <FileText className="w-4 h-4 mr-1" />
                  {exporting ? `${exportProgress}%` : (type === 'sheets' ? 'Titul Word' : 'Word')}
                </Button>
              </div>

              {/* Settings Button */}
              {(type === 'questions' || type === 'sheets') && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowSettingsPanel(!showSettingsPanel)}
                  className="border-gray-300"
                >
                  Sozlamalar
                </Button>
              )}
            </div>
          </div>

          {/* Export Progress Bar */}
          {exporting && exportProgress > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  {type === 'sheets' ? 'Javob varaqalari' : 'Test'} yuklanmoqda...
                </span>
                <span className="text-sm font-medium text-blue-600">{exportProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fixed Side Panel - Settings */}
      {showSettingsPanel && (
        <div className="no-print fixed right-4 top-20 w-72 bg-white border shadow-lg rounded-lg p-4 max-h-[calc(100vh-100px)] overflow-y-auto z-50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 text-sm">Sozlamalar</h3>
            <button onClick={() => setShowSettingsPanel(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            {/* Sheets per page - faqat sheets uchun */}
            {type === 'sheets' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Bir sahifada</label>
                <div className="grid grid-cols-4 gap-1">
                  {[1, 2, 4, 6].map((count) => (
                    <button
                      key={count}
                      onClick={() => setSheetsPerPage(count)}
                      className={`py-1.5 rounded text-xs ${sheetsPerPage === count ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Font family */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Shrift</label>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="w-full p-1.5 border rounded text-sm"
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

            {/* Font size */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">O'lcham: {fontSize}px</label>
              <input type="range" min="7" max="18" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-full" />
            </div>

            {/* Line height - faqat questions uchun */}
            {type === 'questions' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Qator oralig'i</label>
                <select value={lineHeight} onChange={(e) => setLineHeight(Number(e.target.value))} className="w-full p-1.5 border rounded text-sm">
                  <option value={1}>1.0</option>
                  <option value={1.15}>1.15</option>
                  <option value={1.5}>1.5</option>
                  <option value={2}>2.0</option>
                </select>
              </div>
            )}

            {/* Columns - faqat questions uchun */}
            {type === 'questions' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Ustunlar</label>
                <div className="flex gap-1">
                  {[1, 2].map((c) => (
                    <button
                      key={c}
                      onClick={() => setColumnsCount(c)}
                      className={`flex-1 py-1.5 rounded text-xs ${columnsCount === c ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Background / Logo */}
            <div className="border-t pt-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Fon rasmi / Logo</label>
              <div className="flex gap-1 mb-2">
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="background-upload" />
                <label htmlFor="background-upload" className="flex-1 px-2 py-1 bg-blue-500 text-white rounded cursor-pointer hover:bg-blue-600 text-xs text-center">
                  Yuklash
                </label>
                <button onClick={resetBackground} className="flex-1 px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-xs">
                  Logo
                </button>
                {backgroundImage && (
                  <button onClick={removeBackgroundImage} className="flex-1 px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-xs">
                    O'chirish
                  </button>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Shaffoflik: {Math.round(backgroundOpacity * 100)}%</label>
                <input type="range" min="0" max="0.5" step="0.01" value={backgroundOpacity} onChange={(e) => setBackgroundOpacity(Number(e.target.value))} className="w-full" />
              </div>
              {backgroundImage && (
                <div className="mt-1 p-1 bg-gray-50 rounded border">
                  <img src={backgroundImage} alt="Preview" className="h-12 mx-auto object-contain" />
                </div>
              )}
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

          @page {
            size: A4 portrait;
            margin: ${type === 'sheets' ? '0' : '10mm 12mm'};
          }

          .print-page {
            position: relative;
            width: 100%;
            padding: 0;
            box-sizing: border-box;
            page-break-after: always;
            break-after: page;
          }

          /* Background watermark logo on every page */
          .print-page::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 300px;
            height: 300px;
            background-image: var(--print-bg-image, url(/logo.png));
            background-size: contain;
            background-repeat: no-repeat;
            background-position: center;
            opacity: var(--print-bg-opacity, 0.05);
            z-index: 0;
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
            position: relative;
            border: 1px dashed #ccc;
            margin-bottom: 2rem;
            padding: 1rem;
          }
          .print-page::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 300px;
            height: 300px;
            background-image: var(--print-bg-image, url(/logo.png));
            background-size: contain;
            background-repeat: no-repeat;
            background-position: center;
            opacity: var(--print-bg-opacity, 0.05);
            z-index: 0;
            pointer-events: none;
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
