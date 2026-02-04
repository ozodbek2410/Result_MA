import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { StudentList } from '@/components/ui/StudentCard';
import { useToast } from '@/hooks/useToast';
import TestOptionsModal from '@/components/TestOptionsModal';
import StudentConfigModal from '@/components/StudentConfigModal';
import GroupConfigModal from '@/components/GroupConfigModal';
import StudentSelectionPrintModal from '@/components/StudentSelectionPrintModal';
import ShuffleVariantsModal from '@/components/ShuffleVariantsModal';
import BlockTestActionsModal from '@/components/BlockTestActionsModal';
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
  MoreVertical,
  Filter,
  SortAsc,
  Grid3x3,
  List,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export default function BlockTestsPage() {
  const navigate = useNavigate();
  const { success, error } = useToast();
  
  const [blockTests, setBlockTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTest, setSelectedTest] = useState<any>(null);
  const [showVariantsModal, setShowVariantsModal] = useState(false);
  
  // View mode state
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'date' | 'class' | 'questions'>('date');
  const [filterClass, setFilterClass] = useState<string>('all');
  
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
  const [showShuffleModal, setShowShuffleModal] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [printMode, setPrintMode] = useState<'all' | 'questions' | 'answers'>('all');
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchBlockTests();
  }, []);

  const fetchBlockTests = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/block-tests');
      setBlockTests(data);
    } catch (error) {
      console.error('Error fetching block tests:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load configuration data
  const loadConfigData = async (testId: string) => {
    try {
      setLoading(true);
      
      // Загружаем блок-тест
      const { data: testData } = await api.get(`/block-tests/${testId}`);
      
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
              testId: test._id // Сохраняем ID теста для каждого предмета
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
      
      setConfigBlockTest(mergedBlockTest);
      
      // Загружаем учеников класса
      const { data: studentsData } = await api.get('/students', {
        params: { classNumber: testData.classNumber }
      });
      setStudents(studentsData);
      
      // Загружаем конфигурации учеников ПАРТИЯМИ (по 5 за раз)
      const studentIds = studentsData.map((s: any) => s._id);
      
      // Используем batch endpoint для оптимизации
      let configs: any[] = [];
      try {
        const { data: batchConfigs } = await api.post('/student-test-configs/batch', {
          studentIds
        });
        configs = batchConfigs;
      } catch (batchError) {
        console.warn('Batch endpoint failed, using individual requests');
        
        // Fallback: загружаем по 5 за раз
        const batchSize = 5;
        for (let i = 0; i < studentsData.length; i += batchSize) {
          const batch = studentsData.slice(i, i + batchSize);
          
          const batchResults = await Promise.all(
            batch.map(async (student: any) => {
              try {
                const { data } = await api.get(`/student-test-configs/${student._id}`);
                return data;
              } catch (err: any) {
                // Если конфигурации нет (404), создаем дефолтную
                if (err.response?.status === 404) {
                  try {
                    const { data } = await api.post(`/student-test-configs/create-for-block-test/${student._id}/${testId}`);
                    return data;
                  } catch (createErr) {
                    console.error('Error creating config:', createErr);
                    return null;
                  }
                }
                return null;
              }
            })
          );
          
          configs.push(...batchResults);
          
          // Небольшая задержка между партиями
          if (i + batchSize < studentsData.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      }
      
      setStudentConfigs(configs);
      setShowConfigView(true);
    } catch (err: any) {
      console.error('Error loading data:', err);
      error('Ma\'lumotlarni yuklashda xatolik');
    } finally {
      setLoading(false);
    }
  };

  const handleCardClick = (firstTest: any) => {
    loadConfigData(firstTest._id);
  };

  const handleBackToList = () => {
    setShowConfigView(false);
    setConfigBlockTest(null);
    setStudents([]);
    setStudentConfigs([]);
    setStudentSearchQuery('');
  };

  const filteredTests = blockTests.filter(test =>
    test.classNumber?.toString().includes(searchQuery) ||
    test.date?.includes(searchQuery)
  );

  const groupedTests = filteredTests.reduce((acc: any, test) => {
    const dateKey = new Date(test.date).toISOString().split('T')[0];
    const key = `${test.classNumber}-${dateKey}`;
    
    if (!acc[key]) {
      acc[key] = {
        classNumber: test.classNumber,
        date: test.date,
        dateKey: dateKey,
        tests: [],
        allSubjects: [],
        totalStudents: 0,
        totalQuestions: 0
      };
    }
    
    acc[key].tests.push(test);
    
    // Collect ALL subject tests (don't filter duplicates)
    if (test.subjectTests && Array.isArray(test.subjectTests)) {
      test.subjectTests.forEach((st: any) => {
        // Add all subject tests without checking for duplicates
        acc[key].allSubjects.push(st);
        
        // Count questions from each subject test
        if (st.questions && Array.isArray(st.questions)) {
          acc[key].totalQuestions += st.questions.length;
        }
      });
    }
    
    const studentIds = new Set(acc[key].tests.flatMap((t: any) => 
      t.studentConfigs?.map((sc: any) => sc.studentId?.toString() || sc.studentId) || []
    ));
    acc[key].totalStudents = studentIds.size;
    
    return acc;
  }, {});

  let groupedArray = Object.values(groupedTests);
  
  // Apply class filter
  if (filterClass !== 'all') {
    groupedArray = groupedArray.filter((group: any) => 
      group.classNumber.toString() === filterClass
    );
  }
  
  // Apply sorting
  groupedArray.sort((a: any, b: any) => {
    switch (sortBy) {
      case 'class':
        return b.classNumber - a.classNumber;
      case 'questions':
        return b.totalQuestions - a.totalQuestions;
      case 'date':
      default:
        if (a.classNumber !== b.classNumber) return b.classNumber - a.classNumber;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
    }
  });
  
  // Get unique class numbers for filter
  const uniqueClasses = Array.from(new Set(blockTests.map(t => t.classNumber))).sort((a, b) => b - a);

  const handleDeleteTest = async (group: any) => {
    if (!confirm('Bu guruhdagi barcha testlarni o\'chirmoqchimisiz?')) return;
    
    try {
      for (const test of group.tests) {
        await api.delete(`/block-tests/${test._id}`);
      }
      fetchBlockTests();
    } catch (error) {
      console.error('Error deleting tests:', error);
      alert('Testlarni o\'chirishda xatolik yuz berdi');
    }
  };

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
      fetchBlockTests();
    } catch (err: any) {
      console.error('Error applying configs:', err);
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
      
      const studentIdsParam = selectedStudentIds.join(',');
      let url = '';
      
      switch (printMode) {
        case 'all':
          url = `/teacher/block-tests/${configBlockTest._id}/print-all?students=${studentIdsParam}&fontSize=${fontSize}`;
          break;
        case 'questions':
          url = `/teacher/block-tests/${configBlockTest._id}/print-questions?students=${studentIdsParam}&fontSize=${fontSize}`;
          break;
        case 'answers':
          url = `/teacher/block-tests/${configBlockTest._id}/print-answers?students=${studentIdsParam}&fontSize=${fontSize}`;
          break;
      }
      
      console.log('Opening URL:', url);
      
      // Используем navigate вместо window.open для сохранения контекста
      navigate(url);
      
      setShowPrintModal(false);
    } catch (err: any) {
      console.error('Error printing:', err);
      error('Chop etishda xatolik');
    }
  };

  const handleShuffle = async (selectedStudentIds: string[]) => {
    try {
      setSaving(true);
      
      // Generate variants via API
      await api.post(`/block-tests/${configBlockTest._id}/generate-variants`, {
        studentIds: selectedStudentIds
      });
      
      success(`${selectedStudentIds.length} ta o'quvchi uchun variantlar aralashtirildi`);
      setShowShuffleModal(false);
      await loadConfigData(configBlockTest._id);
    } catch (err: any) {
      console.error('Error shuffling:', err);
      error('Variantlarni aralashtirishda xatolik');
    } finally {
      setSaving(false);
    }
  };

  // Фильтрация студентов по поисковому запросу
  const filteredStudentsForConfig = students.filter(student =>
    student.fullName.toLowerCase().includes(studentSearchQuery.toLowerCase())
  );

  if (loading && !showConfigView) {
    return (
      <div className="space-y-4 sm:space-y-6 animate-fade-in px-2 sm:px-0">
        <div className="animate-pulse">
          <div className="h-10 sm:h-12 w-48 sm:w-64 bg-slate-200 rounded-xl sm:rounded-2xl mb-2 sm:mb-3"></div>
          <div className="h-4 sm:h-6 w-64 sm:w-96 bg-slate-200 rounded-lg sm:rounded-xl"></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-56 sm:h-64 bg-slate-200 rounded-2xl sm:rounded-3xl animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  // Show configuration view
  if (showConfigView && configBlockTest) {
    return (
      <div className="space-y-4 sm:space-y-5 animate-fade-in px-2 sm:px-0 pb-16 sm:pb-20">
        {/* Compact Header - Responsive */}
        <div className="bg-white border-2 border-slate-200 rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            {/* Left: Back + Title */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToList}
                className="flex-shrink-0 hover:bg-purple-50 hover:text-purple-600"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-bold text-slate-900 truncate">Blok testni sozlash</h1>
                <p className="text-xs text-slate-500 hidden sm:block">
                  {configBlockTest?.classNumber}-sinf • {students.length} ta o'quvchi
                </p>
                <p className="text-xs text-slate-500 sm:hidden">
                  {configBlockTest?.classNumber}-sinf • {students.length} o'quvchi
                </p>
              </div>
            </div>
            
            {/* Right: Action Buttons */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              {/* Desktop buttons */}
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowGroupSettingsModal(true)}
                className="hidden lg:flex border-2 hover:border-purple-500 hover:text-purple-600"
              >
                <Users className="w-4 h-4 mr-2" />
                Guruh sozlamalari
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleResetAll}
                disabled={saving}
                className="hidden lg:flex border-2 hover:border-orange-500 hover:text-orange-600"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Tiklash
              </Button>
              
              {/* Mobile menu button */}
              <div className="relative lg:hidden">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowMobileMenu(!showMobileMenu)}
                  className="border-2"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
                
                {showMobileMenu && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowMobileMenu(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border-2 border-slate-200 py-2 z-50 animate-slide-in">
                      <button
                        onClick={() => {
                          setShowGroupSettingsModal(true);
                          setShowMobileMenu(false);
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm hover:bg-purple-50 hover:text-purple-600 flex items-center gap-3 transition-colors"
                      >
                        <Users className="w-4 h-4" />
                        Guruh sozlamalari
                      </button>
                      <button
                        onClick={() => {
                          handleResetAll();
                          setShowMobileMenu(false);
                        }}
                        disabled={saving}
                        className="w-full px-4 py-2.5 text-left text-sm hover:bg-orange-50 hover:text-orange-600 flex items-center gap-3 disabled:opacity-50 transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" />
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
                className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 shadow-lg shadow-purple-500/30"
              >
                <Save className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Saqlash</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Actions Card - Clean and Simple */}
        <button
          onClick={() => setShowActionsModal(true)}
          className="w-full bg-gradient-to-br from-white to-blue-50/30 border-2 border-slate-200 rounded-xl sm:rounded-2xl p-4 sm:p-5 hover:border-blue-400 hover:shadow-xl hover:shadow-blue-500/20 transition-all duration-300 group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-11 h-11 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl sm:rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg shadow-blue-500/30">
                <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="text-left">
                <div className="font-bold text-slate-900 text-sm sm:text-base group-hover:text-blue-600 transition-colors">Testni ko'rish va chop etish</div>
                <div className="text-xs sm:text-sm text-slate-500">Variantlar, javoblar va chop etish</div>
              </div>
            </div>
            <Eye className="w-5 h-5 sm:w-6 sm:h-6 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
          </div>
        </button>

        {/* Students List */}
        <div className="bg-white border-2 border-slate-200 rounded-xl sm:rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-gradient-to-r from-slate-50 to-slate-100/50 border-b-2 border-slate-200 px-3 sm:px-4 py-3 sm:py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-slate-700">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                O'quvchilar ro'yxati
              </div>
              <Badge variant="info" size="sm" className="shadow-sm">
                {filteredStudentsForConfig.length} / {students.length}
              </Badge>
            </div>
          </div>
          
          {/* Search Input */}
          <div className="px-3 sm:px-4 py-3 bg-slate-50/50 border-b-2 border-slate-200">
            <div className="relative">
              <Input
                type="text"
                placeholder="O'quvchi ismini qidirish..."
                value={studentSearchQuery}
                onChange={(e) => setStudentSearchQuery(e.target.value)}
                className="pl-10 sm:pl-11 pr-10 border-2 focus:border-purple-500 rounded-xl"
              />
              <Search className="absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
              {studentSearchQuery && (
                <button
                  onClick={() => setStudentSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          
          <div className="max-h-[60vh] overflow-y-auto">
            <StudentList
              students={filteredStudentsForConfig}
              configs={studentConfigs}
              onConfigure={handleConfigureStudent}
              emptyMessage={studentSearchQuery ? "Qidiruv bo'yicha o'quvchi topilmadi" : "O'quvchilar topilmadi"}
            />
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
          onPrintAll={() => {
            setShowActionsModal(false);
            setPrintMode('all');
            setShowPrintModal(true);
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
          onShuffle={() => {
            setShowActionsModal(false);
            setShowShuffleModal(true);
          }}
        />

        {/* Print Modal */}
        <StudentSelectionPrintModal
          isOpen={showPrintModal}
          onClose={() => setShowPrintModal(false)}
          students={students}
          mode={printMode}
          onPrint={handlePrint}
        />

        {/* Shuffle Modal */}
        <ShuffleVariantsModal
          isOpen={showShuffleModal}
          onClose={() => setShowShuffleModal(false)}
          students={students}
          onShuffle={handleShuffle}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Clean Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                Blok testlar
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                {groupedArray.length} ta test • {groupedArray.reduce((sum: number, g: any) => sum + g.totalStudents, 0)} ta o'quvchi
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button 
                variant="outline"
                onClick={() => navigate('/teacher/block-tests/import')}
                className="hidden sm:flex"
              >
                <Upload className="w-4 h-4 mr-2" />
                Yuklash
              </Button>
              
              <Button 
                onClick={() => navigate('/teacher/block-tests/create')}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Yangi test
              </Button>
            </div>
          </div>

          {/* Search and Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Sinf yoki sana bo'yicha qidirish..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex gap-2">
              {/* Filter */}
              <div className="relative">
                <Button
                  variant="outline"
                  onClick={() => setShowFilterMenu(!showFilterMenu)}
                  className="gap-2"
                >
                  <Filter className="w-4 h-4" />
                  <span className="hidden sm:inline">Filter</span>
                  {filterClass !== 'all' && (
                    <Badge variant="primary" size="sm">1</Badge>
                  )}
                </Button>
                
                {showFilterMenu && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowFilterMenu(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
                      <button
                        onClick={() => {
                          setFilterClass('all');
                          setShowFilterMenu(false);
                        }}
                        className={`w-full px-4 py-2 text-left text-sm ${
                          filterClass === 'all' 
                            ? 'bg-blue-50 text-blue-600 font-medium' 
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        Barcha sinflar
                      </button>
                      {uniqueClasses.map((classNum) => (
                        <button
                          key={classNum}
                          onClick={() => {
                            setFilterClass(classNum.toString());
                            setShowFilterMenu(false);
                          }}
                          className={`w-full px-4 py-2 text-left text-sm ${
                            filterClass === classNum.toString()
                              ? 'bg-blue-50 text-blue-600 font-medium'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          {classNum}-sinf
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* View Toggle */}
              <div className="hidden sm:flex bg-white border border-slate-300 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded ${
                    viewMode === 'grid'
                      ? 'bg-blue-100 text-blue-600'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Grid3x3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded ${
                    viewMode === 'list'
                      ? 'bg-blue-100 text-blue-600'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tests Grid/List */}
                  placeholder="Sinf yoki sana bo'yicha qidirish..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 sm:pl-12 pr-10 sm:pr-12 py-3 sm:py-3.5 lg:py-4 bg-slate-50 border-2 border-slate-200 rounded-xl sm:rounded-2xl focus:outline-none focus:border-purple-500 focus:bg-white focus:ring-4 focus:ring-purple-500/10 transition-all duration-300 text-sm sm:text-base text-slate-900 placeholder:text-slate-400 font-medium"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors z-10"
                  >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Filter & Sort */}
              <div className="flex gap-2 sm:gap-3">
                {/* Filter Dropdown */}
                <div className="relative">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => setShowFilterMenu(!showFilterMenu)}
                    className="border-2 hover:border-purple-500 hover:text-purple-600 hover:bg-purple-50 transition-all duration-300 gap-2"
                  >
                    <Filter className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span className="hidden sm:inline font-semibold">Filter</span>
                    {filterClass !== 'all' && (
                      <Badge variant="primary" size="sm" className="ml-1">1</Badge>
                    )}
                  </Button>
                  
                  {showFilterMenu && (
                    <>
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setShowFilterMenu(false)}
                      />
                      <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-2xl border-2 border-slate-200 py-2 z-50 animate-slide-in">
                        <div className="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Sinf bo'yicha</div>
                        <button
                          onClick={() => {
                            setFilterClass('all');
                            setShowFilterMenu(false);
                          }}
                          className={`w-full px-4 py-2.5 text-left text-sm font-medium transition-colors ${
                            filterClass === 'all' 
                              ? 'bg-purple-50 text-purple-600' 
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          Barcha sinflar
                        </button>
                        {uniqueClasses.map((classNum) => (
                          <button
                            key={classNum}
                            onClick={() => {
                              setFilterClass(classNum.toString());
                              setShowFilterMenu(false);
                            }}
                            className={`w-full px-4 py-2.5 text-left text-sm font-medium transition-colors ${
                              filterClass === classNum.toString()
                                ? 'bg-purple-50 text-purple-600'
                                : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            {classNum}-sinf
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* View Mode Toggle */}
                <div className="hidden sm:flex bg-slate-100 rounded-xl p-1 border-2 border-slate-200">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 rounded-lg transition-all duration-300 ${
                      viewMode === 'grid'
                        ? 'bg-white text-purple-600 shadow-md'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Grid3x3 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 rounded-lg transition-all duration-300 ${
                      viewMode === 'list'
                        ? 'bg-white text-purple-600 shadow-md'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <List className="w-5 h-5" />
                  </button>
                </div>

                {/* Action Buttons */}
                <Button 
                  variant="outline"
                  size="lg"
                  onClick={() => navigate('/teacher/block-tests/import')}
                  className="border-2 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-all duration-300 gap-2"
                >
                  <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden md:inline font-semibold">Yuklash</span>
                </Button>
                
                <Button 
                  size="lg"
                  onClick={() => navigate('/teacher/block-tests/create')}
                  className="bg-gradient-to-r from-purple-500 via-purple-600 to-pink-600 hover:from-purple-600 hover:via-purple-700 hover:to-pink-700 shadow-xl shadow-purple-500/50 hover:shadow-2xl hover:shadow-purple-500/60 transition-all duration-300 gap-2 font-semibold"
                >
                  <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">Yangi test</span>
                  <span className="sm:hidden">Yangi</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Block Tests Grid/List */}
        {groupedArray.length > 0 ? (
          <>
            {viewMode === 'grid' ? (
              // Grid View - Premium Cards
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
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
                    >
                      <div 
                        className="relative h-full bg-white/80 backdrop-blur-xl border-2 border-slate-200/80 rounded-2xl sm:rounded-3xl overflow-hidden transition-all duration-500 hover:border-purple-400 hover:shadow-2xl hover:shadow-purple-500/30 hover:-translate-y-2 cursor-pointer"
                        onClick={() => handleCardClick(firstTest)}
                      >
                        {/* Gradient Overlay on Hover */}
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-pink-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                        
                        {/* Animated Border Glow */}
                        <div className="absolute inset-0 rounded-2xl sm:rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                          <div className="absolute inset-0 rounded-2xl sm:rounded-3xl bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 blur-xl opacity-50"></div>
                        </div>
                        
                        <div className="relative p-5 sm:p-6 lg:p-7">
                          {/* Header with Icon & Badge */}
                          <div className="flex items-start justify-between mb-5 sm:mb-6">
                            <div className="relative">
                              <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl sm:rounded-2xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity"></div>
                              <div className="relative w-14 h-14 sm:w-16 sm:h-16 lg:w-18 lg:h-18 bg-gradient-to-br from-purple-500 via-purple-600 to-pink-600 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-xl shadow-purple-500/50 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
                                <BookOpen className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <Badge variant="primary" size="sm" className="shadow-lg font-bold">
                                {group.classNumber}-sinf
                              </Badge>
                              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-purple-600 group-hover:translate-x-2 transition-all duration-300" />
                            </div>
                          </div>

                          {/* Date */}
                          <div className="flex items-center gap-2 mb-4 sm:mb-5">
                            <div className="w-9 h-9 bg-gradient-to-br from-blue-100 to-blue-200 rounded-xl flex items-center justify-center">
                              <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                            </div>
                            <span className="text-sm sm:text-base font-semibold text-slate-700">{formattedDate}</span>
                          </div>

                          {/* Stats Grid */}
                          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5 sm:mb-6">
                            <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl p-3 border border-blue-200/50">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Layers className="w-3.5 h-3.5 text-blue-600" />
                              </div>
                              <div className="text-lg sm:text-xl font-black text-blue-900">{group.allSubjects.length}</div>
                              <div className="text-xs text-blue-700 font-medium">Testlar</div>
                            </div>
                            
                            <div className="bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl p-3 border border-green-200/50">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Users className="w-3.5 h-3.5 text-green-600" />
                              </div>
                              <div className="text-lg sm:text-xl font-black text-green-900">{group.totalStudents}</div>
                              <div className="text-xs text-green-700 font-medium">O'quvchi</div>
                            </div>
                            
                            <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 rounded-xl p-3 border border-orange-200/50">
                              <div className="flex items-center gap-1.5 mb-1">
                                <FileText className="w-3.5 h-3.5 text-orange-600" />
                              </div>
                              <div className="text-lg sm:text-xl font-black text-orange-900">{group.totalQuestions}</div>
                              <div className="text-xs text-orange-700 font-medium">Savol</div>
                            </div>
                          </div>
                          
                          {/* Actions */}
                          <div className="flex gap-2 pt-5 border-t-2 border-slate-200">
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="flex-1 border-2 hover:border-purple-500 hover:text-purple-600 hover:bg-purple-50 transition-all duration-300 font-semibold"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/teacher/block-tests/${firstTest._id}/edit`);
                              }}
                            >
                              <Edit2 className="w-4 h-4 mr-1.5" />
                              Tahrirlash
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTest(group);
                              }}
                              className="border-2 text-red-600 hover:text-red-700 hover:border-red-400 hover:bg-red-50 transition-all duration-300"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // List View - Compact & Professional
              <div className="space-y-3 sm:space-y-4">
                {groupedArray.map((group: any, groupIndex: number) => {
                  const firstTest = group.tests[0];
                  const formattedDate = new Date(group.date).toLocaleDateString('uz-UZ', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  });
                  
                  return (
                    <div
                      key={`${group.classNumber}-${group.dateKey}`}
                      style={{ animationDelay: `${groupIndex * 30}ms` }}
                      className="group animate-slide-in"
                    >
                      <div 
                        className="relative bg-white/80 backdrop-blur-xl border-2 border-slate-200/80 rounded-xl sm:rounded-2xl overflow-hidden transition-all duration-300 hover:border-purple-400 hover:shadow-xl hover:shadow-purple-500/20 cursor-pointer"
                        onClick={() => handleCardClick(firstTest)}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 via-pink-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        
                        <div className="relative p-4 sm:p-5 lg:p-6">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                            {/* Icon */}
                            <div className="flex-shrink-0">
                              <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/40 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                                <BookOpen className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                              </div>
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-xl sm:text-2xl font-black text-slate-900 group-hover:text-purple-600 transition-colors">
                                  {group.classNumber}-sinf
                                </h3>
                                <Badge variant="primary" size="sm" className="font-bold">
                                  {group.allSubjects.length} test
                                </Badge>
                              </div>
                              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm text-slate-600">
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="w-4 h-4 text-blue-500" />
                                  <span className="font-medium">{formattedDate}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Users className="w-4 h-4 text-green-500" />
                                  <span className="font-medium">{group.totalStudents} o'quvchi</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <FileText className="w-4 h-4 text-orange-500" />
                                  <span className="font-medium">{group.totalQuestions} savol</span>
                                </div>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="border-2 hover:border-purple-500 hover:text-purple-600 hover:bg-purple-50 transition-all duration-300 font-semibold"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/teacher/block-tests/${firstTest._id}/edit`);
                                }}
                              >
                                <Edit2 className="w-4 h-4 sm:mr-1.5" />
                                <span className="hidden sm:inline">Tahrirlash</span>
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteTest(group);
                                }}
                                className="border-2 text-red-600 hover:text-red-700 hover:border-red-400 hover:bg-red-50 transition-all duration-300"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-purple-600 group-hover:translate-x-1 transition-all ml-2" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          // Empty State - Premium Design
          <div className="bg-white/80 backdrop-blur-xl border-2 border-slate-200/80 rounded-3xl shadow-xl overflow-hidden">
            <div className="py-16 sm:py-20 lg:py-24 text-center px-4">
              <div className="relative inline-block mb-8">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full blur-3xl opacity-30 animate-pulse-slow"></div>
                <div className="relative w-24 h-24 sm:w-28 sm:h-28 lg:w-32 lg:h-32 bg-gradient-to-br from-slate-100 to-slate-200 rounded-full flex items-center justify-center">
                  <BookOpen className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 text-slate-400" />
                </div>
              </div>
              <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mb-3">
                {searchQuery ? 'Testlar topilmadi' : 'Blok testlar yo\'q'}
              </h3>
              <p className="text-base sm:text-lg text-slate-600 mb-8 max-w-md mx-auto font-medium">
                {searchQuery 
                  ? 'Qidiruv bo\'yicha hech narsa topilmadi. Boshqa so\'z bilan qidiring.'
                  : 'Birinchi blok testni yaratish uchun yuqoridagi tugmani bosing'
                }
              </p>
              {!searchQuery && (
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button 
                    size="lg"
                    onClick={() => navigate('/teacher/block-tests/import')}
                    className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-xl shadow-blue-500/40 font-semibold"
                  >
                    <Upload className="w-5 h-5 mr-2" />
                    Blok test yuklash
                  </Button>
                  <Button 
                    size="lg"
                    onClick={() => navigate('/teacher/block-tests/create')}
                    className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 shadow-xl shadow-purple-500/40 font-semibold"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Yangi test yaratish
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <TestOptionsModal
        isOpen={showVariantsModal}
        onClose={() => setShowVariantsModal(false)}
        test={selectedTest}
      />
    </div>
  );
}
