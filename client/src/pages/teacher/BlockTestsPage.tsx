import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { StudentList } from '@/components/ui/StudentCard';
import { PageNavbar } from '@/components/ui/PageNavbar';
import { useToast } from '@/hooks/useToast';
import { useBlockTests, useDeleteBlockTest } from '@/hooks/useBlockTests';
import { useRefreshOnReturn } from '@/hooks/useRefreshOnReturn';
import TestOptionsModal from '@/components/TestOptionsModal';
import StudentConfigModal from '@/components/StudentConfigModal';
import GroupConfigModal from '@/components/GroupConfigModal';
import StudentSelectionPrintModal from '@/components/StudentSelectionPrintModal';
import BlockTestActionsModal from '@/components/BlockTestActionsModal';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import { 
  Plus, 
  BookOpen, 
  Search, 
  Calendar,
  Edit2,
  Trash2,
  Upload,
  ArrowRight,
  Layers,
  ArrowLeft,
  Users,
  Settings,
  RotateCcw,
  Save,
  User,
  Eye,
  FileText,
  Printer,
  Shuffle,
  MoreVertical
} from 'lucide-react';

export default function BlockTestsPage() {
  const navigate = useNavigate();
  const { success, error } = useToast();
  
  // React Query hooks
  const { data: blockTests = [], isLoading: loading, refetch } = useBlockTests('minimal');
  const deleteBlockTestMutation = useDeleteBlockTest();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTest, setSelectedTest] = useState<any>(null);
  const [showVariantsModal, setShowVariantsModal] = useState(false);
  
  // Configuration view state
  const [showConfigView, setShowConfigView] = useState(false);
  const [configBlockTest, setConfigBlockTest] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [studentConfigs, setStudentConfigs] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showGroupSettingsModal, setShowGroupSettingsModal] = useState(false);
  const [showActionsModal, setShowActionsModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [printMode, setPrintMode] = useState<'questions' | 'answers' | 'sheets'>('questions');
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);

  // Prefetch cache для предзагрузки
  const prefetchCache = new Map<string, any>();

  // Автоматическое обновление при возврате на страницу
  useRefreshOnReturn(refetch);

  // Prefetch - загружаем данные заранее при наведении
  const prefetchBlockTestData = async (testId: string) => {
    if (prefetchCache.has(testId)) return; // Уже загружено
    
    try {
      console.log('🔄 Prefetching block test:', testId);
      
      // Загружаем блок-тест в фоне
      const { data: testData } = await api.get(`/block-tests/${testId}`);
      
      // Загружаем студентов в фоне
      const { data: studentsData } = await api.get('/students', {
        params: { classNumber: testData.classNumber }
      });
      
      // Сохраняем в кэш
      prefetchCache.set(testId, {
        test: testData,
        students: studentsData,
        timestamp: Date.now()
      });
      
      console.log('✅ Prefetched block test:', testId);
    } catch (err: any) {
      // Тихо игнорируем 404 - тест может быть удален
      if (err.response?.status !== 404) {
        console.log('⚠️ Prefetch failed:', testId);
      }
    }
  };

  // Load configuration data с приоритетной загрузкой
  const loadConfigData = async (testId: string) => {
    try {
      console.log('🔄 loadConfigData started for:', testId);
      setConfigLoading(true);
      
      // ПРИОРИТЕТ 1: Проверяем prefetch кэш
      const cached = prefetchCache.get(testId);
      if (cached && Date.now() - cached.timestamp < 60000) { // Кэш 1 минута
        console.log('⚡ Using prefetched data');
        
        const testData = cached.test;
        
        // Используем данные из кэша, которые уже содержат subjectTests
        const allSubjects: any[] = [];
        if (testData.subjectTests && Array.isArray(testData.subjectTests)) {
          testData.subjectTests.forEach((st: any) => {
            if (st.subjectId) {
              allSubjects.push({ ...st, testId: testData._id });
            }
          });
        }
        
        const mergedBlockTest = {
          ...testData,
          subjectTests: allSubjects,
          allTestIds: [testData._id]
        };
        
        console.log('✅ Setting cached data to state');
        setConfigBlockTest(mergedBlockTest);
        setStudents(cached.students);
        setShowConfigView(true);
        setConfigLoading(false);
        
        // ПРИОРИТЕТ 3: Загружаем конфигурации в фоне
        const studentIds = cached.students.map((s: any) => s._id);
        api.post('/student-test-configs/batch', { studentIds })
          .then(({ data }) => {
            console.log('✅ Configs loaded');
            setStudentConfigs(data);
          })
          .catch(err => console.error('❌ Error loading configs:', err));
        
        return;
      }
      
      console.log('🌐 Fetching block test from server...');
      
      // ПРИОРИТЕТ 1: Загружаем блок-тест (самое важное)
      const { data: testData } = await api.get(`/block-tests/${testId}`);
      
      console.log('📊 Loaded block test with subjects:', testData.subjectTests?.length || 0);
      
      // Используем данные, которые уже пришли с сервера
      // testData уже содержит все subjectTests с вопросами
      const allSubjects: any[] = [];
      
      if (testData.subjectTests && Array.isArray(testData.subjectTests)) {
        testData.subjectTests.forEach((st: any) => {
          if (st.subjectId) {
            allSubjects.push({ ...st, testId: testData._id });
          }
        });
      }
      
      console.log('📝 Total subjects:', allSubjects.length);
      
      const mergedBlockTest = {
        ...testData,
        subjectTests: allSubjects,
        allTestIds: [testData._id]
      };
      
      console.log('✅ Setting block test to state');
      setConfigBlockTest(mergedBlockTest);
      setShowConfigView(true); // Показываем сразу!
      setConfigLoading(false);
      
      console.log('🔄 Loading students for class:', testData.classNumber);
      
      // ПРИОРИТЕТ 2: Загружаем студентов (показываем список)
      api.get('/students', { params: { classNumber: testData.classNumber } })
        .then(({ data: studentsData }) => {
          console.log('✅ Students loaded:', studentsData.length);
          setStudents(studentsData);
          
          // ПРИОРИТЕТ 3: Загружаем конфигурации в фоне
          const studentIds = studentsData.map((s: any) => s._id);
          console.log('🔄 Loading configs for', studentIds.length, 'students');
          return api.post('/student-test-configs/batch', { studentIds });
        })
        .then(({ data: configs }) => {
          console.log('✅ Configs loaded:', configs.length);
          setStudentConfigs(configs);
        })
        .catch(err => {
          console.error('❌ Error loading students/configs:', err);
        });
      
    } catch (err: any) {
      console.error('❌ Error loading data:', err);
      error('Ma\'lumotlarni yuklashda xatolik');
      setConfigLoading(false);
    }
  };

  const handleCardClick = (firstTest: any) => {
    console.log('🖱️ Card clicked, navigating to:', `/teacher/block-tests/${firstTest._id}`);
    
    // Navigate to dedicated page instead of modal
    navigate(`/teacher/block-tests/${firstTest._id}`);
  };

  const handleBackToList = () => {
    setShowConfigView(false);
    setConfigBlockTest(null);
    setStudents([]);
    setStudentConfigs([]);
    setStudentSearchQuery('');
  };

  // Memoize filtered and grouped tests to prevent recalculation on every render
  const filteredTests = useMemo(() => 
    blockTests.filter(test =>
      test.classNumber?.toString().includes(searchQuery) ||
      test.date?.includes(searchQuery)
    ),
    [blockTests, searchQuery]
  );

  const groupedArray = useMemo(() => {
    console.log('📊 Grouping block tests:', blockTests.length);
    
    const groupedTests = filteredTests.reduce((acc: any, test) => {
      // Группируем по классу и периоду (месяц+год), а не по дате создания
      const key = `${test.classNumber}-${test.periodMonth}-${test.periodYear}`;
      
      console.log(`📝 Test: class=${test.classNumber}, period=${test.periodMonth}/${test.periodYear}, key=${key}`);
      
      if (!acc[key]) {
        acc[key] = {
          classNumber: test.classNumber,
          date: test.date,
          dateKey: new Date(test.date).toISOString().split('T')[0],
          periodMonth: test.periodMonth,
          periodYear: test.periodYear,
          tests: []
        };
      }
      
      acc[key].tests.push(test);
      
      return acc;
    }, {});

    return Object.values(groupedTests).sort((a: any, b: any) => {
      if (a.classNumber !== b.classNumber) return b.classNumber - a.classNumber;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [filteredTests]);

  const handleDeleteTest = useCallback(async (group: any) => {
    if (!confirm('Bu guruhdagi barcha testlarni o\'chirmoqchimisiz?')) return;
    
    try {
      console.log('🗑️ Deleting', group.tests.length, 'block tests...');
      
      // Очищаем prefetch кэш для удаляемых тестов
      group.tests.forEach((test: any) => {
        prefetchCache.delete(test._id);
        console.log('🧹 Cleared prefetch cache for:', test._id);
      });
      
      // Удаляем все тесты параллельно, игнорируя 404 (уже удалены)
      await Promise.all(
        group.tests.map(async (test: any) => {
          try {
            await api.delete(`/block-tests/${test._id}`);
          } catch (err: any) {
            // Если 404 - тест уже удален, это нормально
            if (err.response?.status === 404) {
              console.log('⚠️ Block test already deleted:', test._id);
              return;
            }
            throw err; // Другие ошибки пробрасываем дальше
          }
        })
      );
      
      console.log('✅ All block tests deleted, refreshing list...');
      
      // Принудительно обновляем список
      refetch();
      
      success('Testlar o\'chirildi');
    } catch (err) {
      console.error('❌ Error deleting tests:', err);
      error('Testlarni o\'chirishda xatolik yuz berdi');
    }
  }, [refetch, success, error]);

  const handleResetAll = async () => {
    if (!confirm(`Barcha o'quvchilar uchun sozlamalarni tiklashni xohlaysizmi?\n\nBu amal:\n• Qo'shimcha fanlarni o'chiradi\n• Dефолт savollar soniga qaytaradi\n• Ballar sozlamasini tozalaydi`)) {
      return;
    }
    
    try {
      setSaving(true);
      
      // Сначала удаляем все конфигурации
      await api.post(`/student-test-configs/reset-class/${configBlockTest.classNumber}`);
      
      // Затем создаём новые конфигурации для всех студентов
      const configs = await Promise.all(
        students.map(async (student: any) => {
          try {
            const { data } = await api.post(`/student-test-configs/create-for-block-test/${student._id}/${configBlockTest._id}`);
            return data;
          } catch (createErr) {
            console.error('Error creating config for student:', student._id, createErr);
            return null;
          }
        })
      );
      
      setStudentConfigs(configs);
      success('Barcha sozlamalar tiklandi');
    } catch (err: any) {
      console.error('Error resetting configs:', err);
      error('Sozlamalarni tiklashda xatolik');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyConfigs = async () => {
    try {
      setSaving(true);
      await api.post(`/student-test-configs/apply-to-block-test/${configBlockTest._id}`);
      success('Sozlamalar qo\'llanildi');
      handleBackToList();
      refetch(); // Обновляем список через React Query
    } catch (err: any) {
      console.error('❌ Error applying configs:', err);
      error('Sozlamalarni qo\'llashda xatolik');
    } finally {
      setSaving(false);
    }
  };

  const getStudentConfig = (studentId: string) => {
    return studentConfigs.find(c => c?.studentId === studentId);
  };

  const handleConfigureStudent = (student: any) => {
    setSelectedStudent(student);
    setShowConfigModal(true);
  };

  const handleConfigSaved = () => {
    if (configBlockTest) {
      loadConfigData(configBlockTest._id);
    }
  };

  const handlePrint = async (selectedStudentIds: string[], fontSize: number = 12) => {
    try {
      console.log('handlePrint called with:', { selectedStudentIds, printMode, id: configBlockTest._id, fontSize });
      
      // Сохраняем выбранных студентов в localStorage
      const selectedStudentsData = students.filter(s => selectedStudentIds.includes(s._id));
      localStorage.setItem('selectedStudents', JSON.stringify(selectedStudentsData));
      
      let url = '';
      const studentParams = selectedStudentIds.length > 0 ? `?students=${selectedStudentIds.join(',')}` : '';
      
      switch (printMode) {
        case 'questions':
          url = `/teacher/block-tests/${configBlockTest._id}/print/questions${studentParams}`;
          break;
        case 'answers':
          url = `/teacher/block-tests/${configBlockTest._id}/answer-sheets${studentParams}`;
          break;
      }
      
      console.log('Opening URL:', url);
      
      navigate(url);
      
      setShowPrintModal(false);
    } catch (err: any) {
      console.error('Error printing:', err);
      error('Chop etishda xatolik');
    }
  };

  // Фильтрация студентов по поисковому запросу - OPTIMIZED with useMemo
  const filteredStudentsForConfig = useMemo(() => 
    students.filter(student =>
      student.fullName.toLowerCase().includes(studentSearchQuery.toLowerCase())
    ),
    [students, studentSearchQuery]
  );

  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-6 lg:space-y-8 animate-fade-in pb-24">
        {/* Header Skeleton */}
        <div className="animate-pulse">
          <div className="h-10 w-56 bg-gradient-to-r from-purple-200 to-pink-200 rounded-2xl mb-3"></div>
          <div className="h-5 w-80 bg-slate-200 rounded-xl"></div>
        </div>
        
        {/* Block Tests Grid Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
          <SkeletonCard variant="blocktest" count={6} />
        </div>
      </div>
    );
  }

  // Show configuration view
  if (showConfigView && configBlockTest) {
    return (
      <div className="space-y-5 animate-fade-in">
        {/* Compact Header - Single Line */}
        <div className="flex items-center justify-between gap-4">
          {/* Left: Back + Title */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackToList}
              className="flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-slate-900 truncate">Blok testni sozlash</h1>
              <p className="text-xs text-slate-500">
                {configBlockTest?.classNumber}-sinf • {students.length} ta o'quvchi
              </p>
            </div>
          </div>
          
          {/* Right: Action Buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Desktop buttons */}
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowGroupSettingsModal(true)}
              className="hidden md:flex"
            >
              <Users className="w-4 h-4 mr-2" />
              Guruh sozlamalari
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleResetAll}
              disabled={saving}
              className="hidden md:flex"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Tiklash
            </Button>
            
            {/* Mobile menu button */}
            <div className="relative md:hidden">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowMobileMenu(!showMobileMenu)}
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
              
              {showMobileMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowMobileMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-2 z-50">
                    <button
                      onClick={() => {
                        setShowGroupSettingsModal(true);
                        setShowMobileMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-3"
                    >
                      <Users className="w-4 h-4 text-slate-500" />
                      Guruh sozlamalari
                    </button>
                    <button
                      onClick={() => {
                        handleResetAll();
                        setShowMobileMenu(false);
                      }}
                      disabled={saving}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-3 disabled:opacity-50"
                    >
                      <RotateCcw className="w-4 h-4 text-slate-500" />
                      Tiklash
                    </button>
                  </div>
                </>
              )}
            </div>
            
            {/* Save button - always visible */}
            <Button 
              size="sm"
              onClick={handleApplyConfigs}
              disabled={saving}
              loading={saving}
            >
              <Save className="w-4 h-4 mr-2" />
              Saqlash
            </Button>
          </div>
        </div>

        {/* Actions Card - Clean and Simple */}
        <button
          onClick={() => setShowActionsModal(true)}
          className="w-full bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:bg-blue-50/50 transition-all group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-left">
                <div className="font-semibold text-slate-900 text-sm">Testni ko'rish va chop etish</div>
                <div className="text-xs text-slate-500">Variantlar, javoblar va chop etish</div>
              </div>
            </div>
            <Eye className="w-5 h-5 text-slate-400 group-hover:text-blue-500 transition-colors" />
          </div>
        </button>

        {/* Students List */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Users className="w-4 h-4" />
                O'quvchilar ro'yxati
              </div>
              <Badge variant="info" size="sm">
                {filteredStudentsForConfig.length} / {students.length}
              </Badge>
            </div>
          </div>
          
          {/* Search Input */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div className="relative">
              <Input
                type="text"
                placeholder="O'quvchi ismini qidirish..."
                value={studentSearchQuery}
                onChange={(e) => setStudentSearchQuery(e.target.value)}
                className="pl-10"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              {studentSearchQuery && (
                <button
                  onClick={() => setStudentSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          
          <div>
            {students.length === 0 && !loading ? (
              <StudentList
                students={filteredStudentsForConfig}
                configs={studentConfigs}
                onConfigure={handleConfigureStudent}
                emptyMessage={studentSearchQuery ? "Qidiruv bo'yicha o'quvchi topilmadi" : "O'quvchilar topilmadi"}
              />
            ) : students.length === 0 ? (
              <div className="space-y-2">
                <SkeletonCard variant="student" count={8} />
              </div>
            ) : (
              <StudentList
                students={filteredStudentsForConfig}
                configs={studentConfigs}
                onConfigure={handleConfigureStudent}
                emptyMessage={studentSearchQuery ? "Qidiruv bo'yicha o'quvchi topilmadi" : "O'quvchilar topilmadi"}
              />
            )}
          </div>
        </div>

        {/* Student Config Modal */}
        {selectedStudent && (
          <StudentConfigModal
            isOpen={showConfigModal}
            onClose={() => {
              setShowConfigModal(false);
              setSelectedStudent(null);
            }}
            student={selectedStudent}
            config={getStudentConfig(selectedStudent._id)}
            blockTest={configBlockTest}
            onSave={handleConfigSaved}
          />
        )}

        {/* Group Settings Modal */}
        <GroupConfigModal
          isOpen={showGroupSettingsModal}
          onClose={() => setShowGroupSettingsModal(false)}
          students={students}
          studentConfigs={studentConfigs}
          blockTest={configBlockTest}
          onSave={handleConfigSaved}
        />

        {/* Block Test Actions Modal */}
        <BlockTestActionsModal
          isOpen={showActionsModal}
          onClose={() => setShowActionsModal(false)}
          blockTest={configBlockTest}
          studentCount={students.length}
          onViewAnswerKeys={() => {
            setShowActionsModal(false);
            navigate(`/teacher/block-tests/${configBlockTest._id}/answer-keys`);
          }}
          onViewAllTests={() => {
            setShowActionsModal(false);
            navigate(`/teacher/block-tests/${configBlockTest._id}/all-tests`);
          }}
          onViewAnswerSheets={() => {
            setShowActionsModal(false);
            navigate(`/teacher/block-tests/${configBlockTest._id}/answer-sheets`);
          }}
          onPrintQuestions={() => {
            setShowActionsModal(false);
            setPrintMode('questions');
            setShowPrintModal(true);
          }}
          onPrintAnswers={() => {
            setShowActionsModal(false);
            setPrintMode('answers');
            setShowPrintModal(true);
          }}
          onShuffle={async () => {
            // Сразу перемешиваем для всех студентов без модального окна
            try {
              setIsShuffling(true);
              const studentIds = students.map(s => s._id);
              await api.post(`/block-tests/${configBlockTest._id}/generate-variants`, {
                studentIds
              });
              
              // Показываем уведомление
              success(`${studentIds.length} ta o'quvchi uchun variantlar muvaffaqiyatli aralashtirildi!`);
              
              await loadConfigData(configBlockTest._id);
            } catch (err: any) {
              console.error('Error shuffling:', err);
              error('Variantlarni aralashtirishda xatolik');
            } finally {
              setIsShuffling(false);
            }
          }}
          isShuffling={isShuffling}
        />

        {/* Print Modal */}
        <StudentSelectionPrintModal
          isOpen={showPrintModal}
          onClose={() => setShowPrintModal(false)}
          students={students}
          mode={printMode}
          onPrint={handlePrint}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-24 sm:pb-24">
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <PageNavbar
          title="Blok testlar"
          description="Blok testlarni yaratish va boshqarish"
          badge={`${groupedArray.length} ta`}
          showSearch={blockTests.length > 0}
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Sinf yoki sana bo'yicha qidirish..."
          showAddButton={true}
          addButtonText="Blok test qo'shish"
          onAddClick={() => navigate('/teacher/block-tests/create')}
          extraActions={
            <Button 
              variant="outline"
              onClick={() => navigate('/teacher/block-tests/import')}
              className="flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Yuklash</span>
            </Button>
          }
          gradient={true}
        />

        {/* Block Tests Grid */}
        {groupedArray.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
            {groupedArray.map((group: any, groupIndex: number) => {
              const firstTest = group.tests[0];
              const formattedDate = new Date(group.date).toLocaleDateString('uz-UZ', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              });
              
              return (
                <div
                  key={`${group.classNumber}-${group.dateKey}`}
                  style={{ animationDelay: `${groupIndex * 50}ms` }}
                  className="group animate-slide-in"
                  onMouseEnter={() => prefetchBlockTestData(firstTest._id)}
                >
                  <div 
                    className="bg-gradient-to-br from-white via-purple-50/30 to-pink-50/30 border border-purple-100 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden cursor-pointer p-6 relative"
                    onClick={() => handleCardClick(firstTest)}
                  >
                    {/* Icon & Actions */}
                    <div className="flex items-start justify-between mb-5 relative z-10">
                      <div className="w-16 h-16 bg-gradient-to-br from-purple-500 via-pink-500 to-rose-500 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                        <BookOpen className="w-8 h-8 text-white" />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/teacher/block-tests/${firstTest._id}/edit`);
                          }}
                          className="p-2.5 hover:bg-blue-100/80 backdrop-blur-sm rounded-xl transition-all duration-200 hover:scale-110 active:scale-95"
                          title="Tahrirlash"
                        >
                          <Edit2 className="w-4 h-4 text-slate-600" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTest(group);
                          }}
                          className="p-2.5 hover:bg-red-100/80 backdrop-blur-sm rounded-xl transition-all duration-200 hover:scale-110 active:scale-95"
                          title="O'chirish"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </div>

                    {/* Block Test Info */}
                    <div className="mb-4 relative z-10">
                      <h3 className="text-xl font-bold text-slate-900 mb-3 group-hover:text-purple-600 transition-colors">
                        {group.classNumber}-sinf
                      </h3>
                      <div className="flex flex-wrap gap-2 mb-4">
                        <span className="px-3 py-1.5 bg-purple-100/80 backdrop-blur-sm text-purple-700 rounded-full text-sm font-semibold border border-purple-200/50">
                          {group.classNumber}-sinf
                        </span>
                        <span className="px-3 py-1.5 bg-pink-100/80 backdrop-blur-sm text-pink-700 rounded-full text-sm font-semibold border border-pink-200/50">
                          {group.periodMonth}/{group.periodYear}
                        </span>
                      </div>
                    </div>

                    {/* Date & Arrow */}
                    <div className="flex items-center justify-between pt-4 border-t border-slate-200/50 relative z-10">
                      <div className="flex items-center gap-2 text-slate-600">
                        <Calendar className="w-4 h-4" />
                        <span className="text-sm font-medium">{formattedDate}</span>
                      </div>
                      <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-purple-600 group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-gradient-to-br from-white via-purple-50/30 to-pink-50/30 border border-purple-100 rounded-2xl shadow-lg p-16 text-center">
            <div className="w-24 h-24 bg-gradient-to-br from-purple-400 via-pink-500 to-rose-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-purple-500/30">
              <BookOpen className="w-12 h-12 text-white" />
            </div>
            <h3 className="text-2xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 bg-clip-text text-transparent mb-3">
              {searchQuery ? 'Testlar topilmadi' : 'Blok testlar yo\'q'}
            </h3>
            <p className="text-slate-600 mb-8 max-w-md mx-auto text-lg">
              {searchQuery 
                ? 'Qidiruv bo\'yicha hech narsa topilmadi. Boshqa so\'z bilan qidiring.'
                : 'Birinchi blok testni yaratish uchun yuqoridagi tugmani bosing'
              }
            </p>
            {!searchQuery && (
              <Button 
                size="lg"
                onClick={() => navigate('/teacher/block-tests/import')}
                className="bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 hover:shadow-xl hover:shadow-purple-500/40 hover:scale-105 transition-all duration-300"
              >
                <Upload className="w-5 h-5 mr-2" />
                Blok test yuklash
              </Button>
            )}
          </div>
        )}

        <TestOptionsModal
          isOpen={showVariantsModal}
          onClose={() => setShowVariantsModal(false)}
          test={selectedTest}
        />
      </div>
    </div>
  );
}
