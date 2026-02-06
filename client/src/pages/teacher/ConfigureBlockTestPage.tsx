import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { StudentList } from '@/components/ui/StudentCard';
import { useToast } from '@/hooks/useToast';
import StudentConfigModal from '@/components/StudentConfigModal';
import GroupConfigModal from '@/components/GroupConfigModal';
import StudentSelectionPrintModal from '@/components/StudentSelectionPrintModal';
import ShuffleVariantsModal from '@/components/ShuffleVariantsModal';
import BlockTestActionsModal from '@/components/BlockTestActionsModal';
import { 
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

export default function ConfigureBlockTestPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { success, error } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [blockTest, setBlockTest] = useState<any>(null);
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
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, [id]);

  // Фильтрация студентов по поисковому запросу
  const filteredStudents = students.filter(student =>
    student.fullName.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
      
      setBlockTest(mergedBlockTest);
      
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
                    const { data } = await api.post(`/student-test-configs/create-for-block-test/${student._id}/${id}`);
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
    } catch (err: any) {
      console.error('Error loading data:', err);
      error('Ma\'lumotlarni yuklashda xatolik');
    } finally {
      setLoading(false);
    }
  };

  const handleResetAll = async () => {
    if (!confirm(`Barcha o'quvchilar uchun sozlamalarni tiklashni xohlaysizmi?\n\nBu amal:\n• Qo'shimcha fanlarni o'chiradi\n• Dефолт savollar soniga qaytaradi\n• Ballar sozlamasini tozalaydi`)) {
      return;
    }
    
    try {
      setSaving(true);
      
      // Сначала удаляем все конфигурации
      await api.post(`/student-test-configs/reset-class/${blockTest.classNumber}`);
      
      // Затем создаём новые конфигурации для всех студентов
      const configs = await Promise.all(
        students.map(async (student: any) => {
          try {
            const { data } = await api.post(`/student-test-configs/create-for-block-test/${student._id}/${id}`);
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
      await api.post(`/student-test-configs/apply-to-block-test/${id}`);
      success('Sozlamalar qo\'llanildi');
      navigate('/teacher/block-tests');
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
    loadData();
  };

  const handlePrint = async (selectedStudentIds: string[], fontSize: number = 12) => {
    try {
      console.log('handlePrint called with:', { selectedStudentIds, printMode, id, fontSize });
      
      const studentIdsParam = selectedStudentIds.join(',');
      let url = '';
      
      switch (printMode) {
        case 'all':
          url = `/teacher/block-tests/${id}/print-all?students=${studentIdsParam}&fontSize=${fontSize}`;
          break;
        case 'questions':
          url = `/teacher/block-tests/${id}/print-questions?students=${studentIdsParam}&fontSize=${fontSize}`;
          break;
        case 'answers':
          url = `/teacher/block-tests/${id}/print-answers?students=${studentIdsParam}&fontSize=${fontSize}`;
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
      await api.post(`/block-tests/${id}/generate-variants`, {
        studentIds: selectedStudentIds
      });
      
      success(`${selectedStudentIds.length} ta o'quvchi uchun variantlar aralashtirildi`);
      setShowShuffleModal(false);
      await loadData();
    } catch (err: any) {
      console.error('Error shuffling:', err);
      error('Variantlarni aralashtirishda xatolik');
    } finally {
      setSaving(false);
    }
  };



  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Compact Header - Single Line */}
      <div className="flex items-center justify-between gap-4">
        {/* Left: Back + Title */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/teacher/block-tests')}
            className="flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900 truncate">Blok testni sozlash</h1>
            <p className="text-xs text-slate-500">
              {blockTest?.classNumber}-sinf • {students.length} ta o'quvchi
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
            className="hidden md:flex"
          >
            <Save className="w-4 h-4 mr-2" />
            Saqlash
          </Button>
          
          {/* Save button - mobile (icon only) */}
          <Button 
            size="sm"
            onClick={handleApplyConfigs}
            disabled={saving}
            loading={saving}
            className="md:hidden"
          >
            <Save className="w-4 h-4" />
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
              {filteredStudents.length} / {students.length}
            </Badge>
          </div>
        </div>
        
        {/* Search Input */}
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <div className="relative">
            <Input
              type="text"
              placeholder="O'quvchi ismini qidirish..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
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
            students={filteredStudents}
            configs={studentConfigs}
            onConfigure={handleConfigureStudent}
            emptyMessage={searchQuery ? "Qidiruv bo'yicha o'quvchi topilmadi" : "O'quvchilar topilmadi"}
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
          blockTest={blockTest}
          onSave={handleConfigSaved}
        />
      )}

      {/* Group Settings Modal */}
      <GroupConfigModal
        isOpen={showGroupSettingsModal}
        onClose={() => setShowGroupSettingsModal(false)}
        students={students}
        studentConfigs={studentConfigs}
        blockTest={blockTest}
        onSave={handleConfigSaved}
      />

      {/* Block Test Actions Modal */}
      <BlockTestActionsModal
        isOpen={showActionsModal}
        onClose={() => setShowActionsModal(false)}
        blockTest={blockTest}
        studentCount={students.length}
        onViewAnswerKeys={() => {
          setShowActionsModal(false);
          navigate(`/teacher/block-tests/${id}/answer-keys`);
        }}
        onViewAllTests={() => {
          setShowActionsModal(false);
          navigate(`/teacher/block-tests/${id}/all-tests`);
        }}
        onViewAnswerSheets={() => {
          setShowActionsModal(false);
          navigate(`/teacher/block-tests/${id}/answer-sheets`);
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
