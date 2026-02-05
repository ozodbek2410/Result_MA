import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { StudentList } from '@/components/ui/StudentCard';
import { PageNavbar } from '@/components/ui/PageNavbar';
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
  MoreVertical
} from 'lucide-react';

export default function BlockTestsPage() {
  const navigate = useNavigate();
  const { success, error } = useToast();
  
  const [blockTests, setBlockTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [showShuffleModal, setShowShuffleModal] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
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

  const groupedArray = Object.values(groupedTests).sort((a: any, b: any) => {
    if (a.classNumber !== b.classNumber) return b.classNumber - a.classNumber;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

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

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="animate-pulse">
          <div className="h-12 w-64 bg-slate-200 rounded-2xl mb-3"></div>
          <div className="h-6 w-96 bg-slate-200 rounded-xl"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-48 bg-slate-200 rounded-3xl animate-pulse"></div>
          ))}
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
    <div className="space-y-4 sm:space-y-6 lg:space-y-8 animate-fade-in pb-24 sm:pb-24">
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
                style={{ animationDelay: `${groupIndex * 100}ms` }}
                className="animate-slide-in"
              >
                <Card 
                  className="h-full bg-white border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all duration-200 cursor-pointer relative"
                  onClick={() => handleCardClick(firstTest)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-sm">
                        <BookOpen className="w-8 h-8 text-white" />
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/teacher/block-tests/${firstTest._id}/edit`);
                          }}
                          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
                        >
                          <Edit2 className="w-4 h-4 text-slate-600" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTest(group);
                          }}
                          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </div>

                    <h3 className="text-xl font-bold text-slate-900 mb-3">
                      {group.classNumber}-sinf
                    </h3>

                    <div className="flex flex-wrap gap-2 mb-4">
                      <span className="bg-green-100 text-green-700 px-3 py-1.5 rounded-full text-sm font-semibold">
                        {group.classNumber}-sinf
                      </span>
                      <span className="bg-purple-100 text-purple-700 px-3 py-1.5 rounded-full text-sm font-semibold">
                        {group.allSubjects.length > 0 && group.allSubjects[0].subjectId?.name || 'Matematika'}
                      </span>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-3 mb-4">
                      <div className="flex items-center gap-2 text-slate-700">
                        <Users className="w-4 h-4 text-slate-500" />
                        <span className="text-sm font-medium">{formattedDate}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                      <div className="flex items-center gap-2 text-slate-600">
                        <BookOpen className="w-4 h-4" />
                        <span className="text-sm font-medium">{group.totalQuestions} ta savol</span>
                      </div>
                      <ArrowRight className="w-5 h-5 text-slate-400" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="border-2 border-slate-200/50">
          <CardContent className="py-16 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-slate-100 to-slate-200 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <BookOpen className="w-10 h-10 text-slate-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              {searchQuery ? 'Testlar topilmadi' : 'Blok testlar yo\'q'}
            </h3>
            <p className="text-slate-600 mb-6 max-w-md mx-auto">
              {searchQuery 
                ? 'Qidiruv bo\'yicha hech narsa topilmadi. Boshqa so\'z bilan qidiring.'
                : 'Birinchi blok testni yaratish uchun yuqoridagi tugmani bosing'
              }
            </p>
            {!searchQuery && (
              <Button 
                size="lg"
                onClick={() => navigate('/teacher/block-tests/import')}
                className="bg-gradient-to-r from-purple-500 to-pink-600"
              >
                <Upload className="w-5 h-5 mr-2" />
                Blok test yuklash
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <TestOptionsModal
        isOpen={showVariantsModal}
        onClose={() => setShowVariantsModal(false)}
        test={selectedTest}
      />
    </div>
  );
}
