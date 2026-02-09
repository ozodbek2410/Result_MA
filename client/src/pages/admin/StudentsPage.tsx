import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/hooks/useToast';
import { Plus, Copy, GraduationCap, Edit2, Trash2, ExternalLink, ChevronRight, Download, Upload, FileSpreadsheet, Search, QrCode } from 'lucide-react';
import { PageNavbar } from '@/components/ui/PageNavbar';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import StudentProfileModal from '@/components/StudentProfileModal';
import StudentQRCode from '@/components/StudentQRCode';

export default function StudentsPage() {
  const [students, setStudents] = useState<any[]>([]);
  const [displayedStudents, setDisplayedStudents] = useState<any[]>([]); // Студенты для отображения
  const [loadingMore, setLoadingMore] = useState(false); // Загрузка следующей порции
  const [directions, setDirections] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedDirectionForTemplate, setSelectedDirectionForTemplate] = useState('');
  const [selectedDirectionForImport, setSelectedDirectionForImport] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDirection, setSelectedDirection] = useState<string>(''); // Фильтр по направлению
  const [selectedClass, setSelectedClass] = useState<number | ''>(''); // Фильтр по классу
  const [qrStudent, setQrStudent] = useState<any>(null);
  const [formData, setFormData] = useState({
    fullName: '',
    classNumber: 7 as number,
    phone: '',
    directionId: '',
    selectedSubjects: {} as Record<string, string>, // для выбора "или"
    groups: [] as { groupId: string; subjectId: string }[]
  });
  const { success, error } = useToast();

  const BATCH_SIZE = 10; // Показывать по 10 студентов за раз

  useEffect(() => {
    fetchStudents();
    fetchDirections();
    fetchSubjects();
    fetchGroups();
  }, []);

  // Постепенно показываем студентов
  useEffect(() => {
    if (students.length > 0) {
      // Если студентов стало больше или это первая загрузка
      if (displayedStudents.length === 0 || students.length !== displayedStudents.length) {
        // Показываем первую порцию сразу
        setDisplayedStudents(students.slice(0, BATCH_SIZE));
        
        // Затем постепенно добавляем остальных
        let currentIndex = BATCH_SIZE;
        const interval = setInterval(() => {
          if (currentIndex >= students.length) {
            clearInterval(interval);
            return;
          }
          
          const nextBatch = students.slice(currentIndex, currentIndex + BATCH_SIZE);
          setDisplayedStudents(prev => [...prev, ...nextBatch]);
          currentIndex += BATCH_SIZE;
        }, 50); // Добавляем новую порцию каждые 50ms
        
        return () => clearInterval(interval);
      }
    }
  }, [students]);

  const fetchStudents = async () => {
    try {
      const { data } = await api.get('/students');
      setStudents(data);
    } catch (err: any) {
      console.error('🔍 fetchStudents - Error:', err);
    } finally {
      setPageLoading(false);
    }
  };

  const fetchDirections = async () => {
    try {
      const { data } = await api.get('/directions');
      setDirections(data);
    } catch (err: any) {
      console.error('Error fetching directions:', err);
    }
  };

  const fetchSubjects = async () => {
    try {
      const { data } = await api.get('/subjects');
      setSubjects(data);
    } catch (err: any) {
      console.error('Error fetching subjects:', err);
    }
  };

  const fetchGroups = async () => {
    try {
      const { data } = await api.get('/groups');
      setGroups(data);
    } catch (err: any) {
      console.error('Error fetching groups:', err);
    }
  };

  const getDirectionSubjects = () => {
    if (!formData.directionId) {
      return [];
    }
    
    const direction = directions.find(d => d._id === formData.directionId);
    
    if (!direction) {
      return [];
    }
    
    if (!direction.subjects || direction.subjects.length === 0) {
      return [];
    }
    
    const result: any[] = [];
    direction.subjects?.forEach((subjectChoice: any) => {
      
      if (subjectChoice.type === 'single') {
        const subjectId = typeof subjectChoice.subjectIds[0] === 'object' 
          ? subjectChoice.subjectIds[0]._id 
          : subjectChoice.subjectIds[0];
        const subject = subjects.find(s => s._id === subjectId);
        if (subject) {
          result.push({ ...subject, isChoice: false, choiceGroup: null });
        }
      } else if (subjectChoice.type === 'choice') {
        const choiceSubjects = subjects.filter(s => {
          const subjectIds = subjectChoice.subjectIds.map((id: any) => 
            typeof id === 'object' ? id._id : id
          );
          return subjectIds.includes(s._id);
        });
        choiceSubjects.forEach(s => result.push({ 
          ...s, 
          isChoice: true, 
          choiceGroup: subjectChoice.subjectIds.map((id: any) => 
            typeof id === 'object' ? id._id : id
          ).join(',') 
        }));
      }
    });
    
    return result;
  };

  const getMandatorySubjects = () => {
    const directionSubjects = getDirectionSubjects();
    const directionSubjectIds = directionSubjects.map(s => s._id);
    return subjects.filter(s => s.isMandatory && !directionSubjectIds.includes(s._id));
  };

  const getAllStudentSubjects = () => {
    // Для младших классов (< 7) возвращаем все предметы класса
    if (formData.classNumber < 7) {
      // Получаем уникальные предметы из групп класса
      const classGroups = groups.filter(g => g.classNumber === formData.classNumber);
      const uniqueSubjects = new Map();
      
      classGroups.forEach(g => {
        const subjectId = typeof g.subjectId === 'object' ? g.subjectId._id : g.subjectId;
        const subject = subjects.find(s => s._id === subjectId);
        if (subject && !uniqueSubjects.has(subject._id)) {
          uniqueSubjects.set(subject._id, subject);
        }
      });
      
      return Array.from(uniqueSubjects.values());
    }
    
    const directionSubjects = getDirectionSubjects();
    const mandatory = getMandatorySubjects();
    
    // Собираем все предметы (без дополнительных, так как шаг 3 удален)
    const allSubjects = [...directionSubjects, ...mandatory];
    
    // Фильтруем выбранные из "или"
    const filtered: any[] = [];
    const processedGroups = new Set();
    
    allSubjects.forEach(subject => {
      if (subject.isChoice && subject.choiceGroup) {
        if (!processedGroups.has(subject.choiceGroup)) {
          processedGroups.add(subject.choiceGroup);
          const selectedId = formData.selectedSubjects[subject.choiceGroup];
          if (selectedId) {
            const selected = allSubjects.find(s => s._id === selectedId);
            if (selected) filtered.push(selected);
          }
        }
      } else {
        filtered.push(subject);
      }
    });
    
    return filtered;
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (!formData.fullName || !formData.classNumber) {
        error('F.I.Sh va sinf majburiy');
        return;
      }
      
      // Для младших классов (< 7) пропускаем выбор направления
      if (formData.classNumber < 7) {
        setFormData({ ...formData, directionId: '', selectedSubjects: {} });
        setStep(4);
      } else {
        setStep(2);
      }
    } else if (step === 2) {
      if (!formData.directionId) {
        error('Yo\'nalish tanlang');
        return;
      }
      
      // Проверяем что все "или" выборы сделаны
      const directionSubjects = getDirectionSubjects();
      const choiceGroups = new Set(directionSubjects.filter(s => s.isChoice).map(s => s.choiceGroup));
      for (const group of choiceGroups) {
        if (!formData.selectedSubjects[group]) {
          error('Barcha fanlarni tanlang');
          return;
        }
      }
      
      setStep(4);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Собираем все предметы
    const allSubjects = getAllStudentSubjects();
    const subjectIds = allSubjects.map(s => s._id);
    
    // Для старших классов (>= 7) проверяем что для каждого предмета выбрана группа
    if (formData.classNumber >= 7) {
      if (!formData.groups || formData.groups.length !== subjectIds.length) {
        error('Barcha fanlar uchun guruh tanlang');
        return;
      }
    }
    // Для младших классов (< 7) группы опциональны - сервер добавит автоматически
    
    setLoading(true);
    try {
      const submitData = {
        fullName: formData.fullName,
        classNumber: formData.classNumber,
        phone: formData.phone || undefined,
        directionId: formData.classNumber < 7 ? undefined : formData.directionId,
        subjectIds,
        groups: formData.groups || [],
        isYoungStudent: formData.classNumber < 7
      };

      if (editingStudent) {
        const response = await api.put(`/students/${editingStudent._id}`, submitData);
        fetchStudents();
        success('O\'quvchi muvaffaqiyatli yangilandi!');
      } else {
        const { data } = await api.post('/students', submitData);
        fetchStudents();
        success('O\'quvchi muvaffaqiyatli qo\'shildi!');
      }
      handleCloseForm();
    } catch (err: any) {
      console.error('🔍 handleSubmit - Error saving student:', err);
      console.error('🔍 handleSubmit - Error response:', err.response?.data);
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (student: any) => {
    setEditingStudent(student);
    
    // Преобразуем группы из формата API в формат формы
    const formattedGroups = (student.groups || []).map((g: any) => {
      const result = {
        groupId: g._id,
        subjectId: typeof g.subjectId === 'object' ? g.subjectId._id : g.subjectId
      };
      return result;
    });
    
    // Восстанавливаем selectedSubjects на основе subjectIds студента
    const direction = directions.find(d => d._id === student.directionId?._id);
    const selectedSubjects: any = {};
    
    if (direction) {
      // Для каждой группы выбора в направлении
      direction.subjectChoices?.forEach((choice: any) => {
        if (choice.type === 'choice') {
          // Находим какой предмет из этой группы выбран у студента
          const selectedSubjectId = choice.subjectIds.find((sid: string) => 
            student.subjectIds?.some((s: any) => (typeof s === 'object' ? s._id : s) === sid)
          );
          
          if (selectedSubjectId) {
            selectedSubjects[choice.choiceGroup] = selectedSubjectId;
          }
        }
      });
    }
    
    setFormData({
      fullName: student.fullName,
      classNumber: student.classNumber,
      phone: student.phone || '',
      directionId: student.directionId?._id || '',
      selectedSubjects,
      groups: formattedGroups
    });
    setShowForm(true);
  };

  const handleDelete = async (studentId: string) => {
    if (!confirm('O\'quvchini o\'chirmoqchimisiz?')) return;
    
    try {
      await api.delete(`/students/${studentId}`);
      fetchStudents();
      success('O\'quvchi o\'chirildi!');
    } catch (err: any) {
      console.error('Error deleting student:', err);
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingStudent(null);
    setStep(1);
    setFormData({ 
      fullName: '', 
      classNumber: 7 as number, 
      phone: '', 
      directionId: '', 
      selectedSubjects: {},
      groups: []
    });
  };

  const handleGroupSelect = (subjectId: string, groupId: string) => {
    // Фильтруем старые группы, убирая группу для этого предмета
    const newGroups = (formData.groups || []).filter(g => {
      const gSubjectId = typeof g.subjectId === 'object' ? (g.subjectId as any)._id : g.subjectId;
      return gSubjectId !== subjectId;
    });
    
    // Добавляем новую группу если выбрана
    if (groupId) {
      newGroups.push({ groupId, subjectId });
    }
    
    setFormData({ ...formData, groups: newGroups });
  };

  const copyProfileLink = (token: string) => {
    const url = `${window.location.origin}/p/${token}`;
    navigator.clipboard.writeText(url);
    success('Profil havolasi nusxalandi!');
  };

  const openProfile = (token: string) => {
    window.open(`/p/${token}`, '_blank');
  };

  const handleDownloadTemplate = async () => {
    if (!selectedDirectionForTemplate) {
      error('Yo\'nalish tanlang');
      return;
    }

    try {
      const response = await api.get(`/students/download-template/${selectedDirectionForTemplate}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'student_import_template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      success('Template yuklab olindi!');
      setShowTemplateModal(false);
      setSelectedDirectionForTemplate('');
    } catch (err: any) {
      console.error('Error downloading template:', err);
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        error('Faqat Excel fayllar (.xlsx, .xls) qabul qilinadi');
        return;
      }
      setImportFile(file);
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      error('Fayl tanlang');
      return;
    }

    if (!selectedDirectionForImport) {
      error('Yo\'nalish tanlang');
      return;
    }

    setImporting(true);
    setImportResults(null);

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result?.toString().split(',')[1];
        
        try {
          const { data } = await api.post('/students/bulk-import', {
            directionId: selectedDirectionForImport,
            fileData: base64
          });
          
          setImportResults(data);
          fetchStudents();
          
          if (data.errorCount === 0) {
            success(`${data.successCount} ta o'quvchi muvaffaqiyatli qo'shildi!`);
          } else {
            error(`${data.errorCount} ta xatolik yuz berdi`);
          }
        } catch (err: any) {
          console.error('Error importing:', err);
          error(err.response?.data?.message || 'Import xatosi');
        } finally {
          setImporting(false);
        }
      };
      
      reader.readAsDataURL(importFile);
    } catch (err: any) {
      console.error('Error reading file:', err);
      error('Faylni o\'qishda xatolik');
      setImporting(false);
    }
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportFile(null);
    setSelectedDirectionForImport('');
    setImportResults(null);
  };

  if (pageLoading) {
    return (
      <div className="space-y-6">
        <PageNavbar
          title="O'quvchilar"
          description="O'quvchilarni boshqarish va profil havolalari"
        />
        <div className="space-y-4">
          <SkeletonCard variant="list" count={5} />
        </div>
      </div>
    );
  }

  // Filter students by search query, direction and class
  const filteredStudents = displayedStudents.filter(student => {
    const matchesSearch = student.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.phone?.includes(searchQuery) ||
      student.directionId?.nameUzb?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesDirection = !selectedDirection || 
      (student.directionId?._id === selectedDirection || student.directionId === selectedDirection);
    
    const matchesClass = !selectedClass || student.classNumber === selectedClass;
    
    return matchesSearch && matchesDirection && matchesClass;
  });
  
  // Показываем индикатор загрузки если еще не все студенты отображены
  const hasMoreToLoad = displayedStudents.length < students.length;

  return (
    <div className="space-y-6 pb-20">
      <PageNavbar
        title="O'quvchilar"
        description="O'quvchilarni boshqarish va profil havolalari"
        badge={`${students.length} ta${hasMoreToLoad ? ` (${displayedStudents.length} ko'rsatilmoqda)` : ''}`}
        showSearch={students.length > 0}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="O'quvchi ismini, telefon yoki yo'nalishni qidirish..."
        showAddButton={true}
        addButtonText="O'quvchi qo'shish"
        onAddClick={() => setShowForm(true)}
        extraActions={
          <>
            <Button
              variant="outline"
              onClick={() => setShowTemplateModal(true)}
              className="flex items-center gap-2 flex-1 sm:flex-initial"
              size="sm"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Template yuklab olish</span>
              <span className="sm:hidden">Template</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 flex-1 sm:flex-initial"
              size="sm"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Excel orqali import</span>
              <span className="sm:hidden">Import</span>
            </Button>
          </>
        }
      />

      {/* Filters */}
      <div className="space-y-4">
        {/* Direction Filter - Tabs */}
        {directions.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Yo'nalish bo'yicha</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedDirection('')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  selectedDirection === ''
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Barchasi ({students.length})
              </button>
              {directions.map((direction) => {
                const count = students.filter(s => 
                  s.directionId?._id === direction._id || s.directionId === direction._id
                ).length;
                return (
                  <button
                    key={direction._id}
                    onClick={() => setSelectedDirection(direction._id)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      selectedDirection === direction._id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {direction.nameUzb} ({count})
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Class Filter - Small Select */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Sinf bo'yicha</label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value ? parseInt(e.target.value) : '')}
            className="px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-sm"
          >
            <option value="">Barchasi</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((classNum) => {
              const count = students.filter(s => s.classNumber === classNum).length;
              if (count === 0) return null;
              return (
                <option key={classNum} value={classNum}>
                  {classNum}-sinf ({count})
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Template Download Modal */}
      <Dialog open={showTemplateModal} onClose={() => setShowTemplateModal(false)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-green-600" />
            Template yuklab olish
          </DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                Yo'nalishni tanlang va Excel template yuklab oling. Template yo'nalish fanlariga mos ravishda tayyorlanadi.
              </p>
            </div>

            <Select
              label="Yo'nalish"
              value={selectedDirectionForTemplate}
              onChange={(e) => setSelectedDirectionForTemplate(e.target.value)}
              required
            >
              <option value="">Tanlang</option>
              {directions.map((d) => (
                <option key={d._id} value={d._id}>{d.nameUzb}</option>
              ))}
            </Select>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleDownloadTemplate}
                disabled={!selectedDirectionForTemplate}
                className="flex-1"
              >
                <Download className="w-4 h-4 mr-2" />
                Yuklab olish
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowTemplateModal(false);
                  setSelectedDirectionForTemplate('');
                }}
              >
                Bekor qilish
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Modal */}
      <Dialog open={showImportModal} onClose={closeImportModal}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-6 h-6 text-blue-600" />
            Excel orqali import
          </DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            {!importResults ? (
              <>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-900">
                    ⚠️ Avval template yuklab olib, to'ldiring. Keyin shu yerdan import qiling.
                  </p>
                </div>

                <Select
                  label="Yo'nalish"
                  value={selectedDirectionForImport}
                  onChange={(e) => setSelectedDirectionForImport(e.target.value)}
                  required
                >
                  <option value="">Tanlang</option>
                  {directions.map((d) => (
                    <option key={d._id} value={d._id}>{d.nameUzb}</option>
                  ))}
                </Select>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Excel fayl
                  </label>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileSelect}
                    className="block w-full text-sm text-gray-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-lg file:border-0
                      file:text-sm file:font-semibold
                      file:bg-blue-50 file:text-blue-700
                      hover:file:bg-blue-100
                      cursor-pointer"
                  />
                  {importFile && (
                    <p className="mt-2 text-sm text-green-600">
                      ✓ {importFile.name}
                    </p>
                  )}
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={handleImport}
                    disabled={!importFile || !selectedDirectionForImport}
                    loading={importing}
                    className="flex-1"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Import qilish
                  </Button>
                  <Button variant="outline" onClick={closeImportModal}>
                    Bekor qilish
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h4 className="font-semibold text-green-900 mb-2">Import yakunlandi!</h4>
                    <div className="space-y-1 text-sm">
                      <p>✅ Muvaffaqiyatli: {importResults.successCount}</p>
                      <p>⏭️ O'tkazib yuborildi: {importResults.skippedCount}</p>
                      <p>❌ Xatolar: {importResults.errorCount}</p>
                    </div>
                  </div>

                  {importResults.results.errors.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-h-60 overflow-y-auto">
                      <h4 className="font-semibold text-red-900 mb-2">Xatolar:</h4>
                      <div className="space-y-2">
                        {importResults.results.errors.map((err: any, idx: number) => (
                          <div key={idx} className="text-sm text-red-800">
                            <strong>Qator {err.row}:</strong> {err.name} - {err.error}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {importResults.results.skipped.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 max-h-60 overflow-y-auto">
                      <h4 className="font-semibold text-yellow-900 mb-2">O'tkazib yuborildi:</h4>
                      <div className="space-y-2">
                        {importResults.results.skipped.map((skip: any, idx: number) => (
                          <div key={idx} className="text-sm text-yellow-800">
                            <strong>Qator {skip.row}:</strong> {skip.name} - {skip.reason}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {importResults.results.success.length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-h-60 overflow-y-auto">
                      <h4 className="font-semibold text-blue-900 mb-2">Muvaffaqiyatli qo'shildi:</h4>
                      <div className="space-y-2">
                        {importResults.results.success.slice(0, 10).map((succ: any, idx: number) => (
                          <div key={idx} className="text-sm text-blue-800">
                            <strong>Qator {succ.row}:</strong> {succ.name}
                          </div>
                        ))}
                        {importResults.results.success.length > 10 && (
                          <p className="text-sm text-blue-600">
                            ... va yana {importResults.results.success.length - 10} ta
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-4">
                  <Button onClick={closeImportModal} className="flex-1">
                    Yopish
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showForm} onClose={handleCloseForm}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-primary" />
            {editingStudent ? 'O\'quvchini tahrirlash' : 'Yangi o\'quvchi'}
            <span className="ml-auto text-sm text-gray-500">Qadam {step > 2 ? step - 1 : step}/3</span>
          </DialogTitle>
        </DialogHeader>
        <DialogContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Шаг 1: Основная информация */}
            {step === 1 && (
              <div className="space-y-4">
                <Input
                  label="F.I.Sh"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  required
                  placeholder="Aliyev Ali Alijon o'g'li"
                />
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Sinf"
                    type="number"
                    min="1"
                    max="11"
                    value={(formData.classNumber ?? 7).toString()}
                    onChange={(e) => setFormData({ ...formData, classNumber: parseInt(e.target.value) || 7 })}
                    required
                  />
                  <PhoneInput
                    label="Telefon"
                    value={formData.phone}
                    onChange={(value) => setFormData({ ...formData, phone: value })}
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="button" onClick={handleNextStep}>
                    Keyingi <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                  <Button type="button" variant="outline" onClick={handleCloseForm}>
                    Bekor qilish
                  </Button>
                </div>
              </div>
            )}

            {/* Шаг 2: Выбор направления и предметов (только для классов >= 7) */}
            {step === 2 && formData.classNumber >= 7 && (
              <div className="space-y-4">
                <Select
                  label="Yo'nalish"
                  value={formData.directionId}
                  onChange={(e) => {
                    const directionId = e.target.value;
                    setFormData({ 
                      ...formData, 
                      directionId,
                      selectedSubjects: {}
                    });
                  }}
                  required
                >
                  <option value="">Tanlang</option>
                  {directions.map((d) => (
                    <option key={d._id} value={d._id}>{d.nameUzb}</option>
                  ))}
                </Select>

                {formData.directionId && (
                  <div className="space-y-3">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-medium text-sm text-blue-900 mb-2">Yo'nalish fanlari:</h4>
                      <div className="space-y-2">
                        {getDirectionSubjects().reduce((acc: any[], subject: any) => {
                          if (subject.isChoice) {
                            const group = subject.choiceGroup;
                            if (!acc.find((item: any) => item.type === 'choice' && item.group === group)) {
                              const choiceSubjects = getDirectionSubjects().filter((s: any) => s.choiceGroup === group);
                              acc.push({ type: 'choice', group, subjects: choiceSubjects });
                            }
                          } else {
                            acc.push({ type: 'single', subject });
                          }
                          return acc;
                        }, []).map((item: any, idx: number) => (
                          <div key={idx}>
                            {item.type === 'single' ? (
                              <div className="flex items-center gap-2 text-sm">
                                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                                <span>{item.subject.nameUzb}</span>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <p className="text-sm font-medium text-gray-700">Tanlang:</p>
                                <div className="flex flex-wrap gap-2 ml-4">
                                  {item.subjects.map((s: any) => (
                                    <label key={s._id} className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={item.group}
                                        checked={formData.selectedSubjects[item.group] === s._id}
                                        onChange={() => setFormData({
                                          ...formData,
                                          selectedSubjects: { ...formData.selectedSubjects, [item.group]: s._id }
                                        })}
                                        className="w-4 h-4"
                                      />
                                      <span className="text-sm">{s.nameUzb}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {getMandatorySubjects().length > 0 && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <h4 className="font-medium text-sm text-green-900 mb-2">Majburiy fanlar:</h4>
                        <div className="space-y-1">
                          {getMandatorySubjects().map((subject: any) => (
                            <div key={subject._id} className="flex items-center gap-2 text-sm">
                              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                              <span>{subject.nameUzb}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Показываем выбранные предметы при редактировании */}
                {editingStudent && formData.selectedSubjects && Object.keys(formData.selectedSubjects).length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-sm text-blue-900 mb-2">Tanlangan fanlar:</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.keys(formData.selectedSubjects).map(subjectId => {
                        const subject = subjects.find(s => s._id === subjectId);
                        return subject ? (
                          <span key={subjectId} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                            {subject.nameUzb}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setStep(1)}>
                    Orqaga
                  </Button>
                  <Button type="button" onClick={handleNextStep}>
                    Keyingi <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* Шаг 4: Выбор групп */}
            {step === 4 && (
              <div className="space-y-4">
                {formData.classNumber < 7 ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
                    <p className="text-sm text-green-900">
                      <strong>Kichik sinf o'quvchisi:</strong> Guruhlarni tanlash ixtiyoriy. Agar tanlamasangiz, barcha mavjud guruhlar avtomatik qo'shiladi.
                    </p>
                  </div>
                ) : (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                    <p className="text-sm text-blue-900">
                      <strong>Oxirgi qadam:</strong> Har bir fan uchun guruh tanlang
                    </p>
                  </div>
                )}

                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {getAllStudentSubjects().map((subject: any) => {
                    // Фильтруем группы для данного предмета и класса
                    const subjectGroups = groups.filter(g => {
                      const groupSubjectId = typeof g.subjectId === 'object' ? g.subjectId._id : g.subjectId;
                      const groupClassNumber = parseInt((g.classNumber ?? 0).toString());
                      const formClassNumber = parseInt((formData.classNumber ?? 0).toString());
                      
                      return groupSubjectId === subject._id && groupClassNumber === formClassNumber;
                    });
                    
                    // Ищем выбранную группу для этого предмета
                    const selectedGroup = formData.groups?.find(g => {
                      const gSubjectId = typeof g.subjectId === 'object' ? (g.subjectId as any)._id : g.subjectId;
                      const match = gSubjectId === subject._id;
                      return match;
                    });
                    
                    return (
                      <div key={subject._id} className="bg-white border border-gray-200 rounded-lg p-3">
                        <label className="block">
                          <span className="font-medium text-sm text-gray-900 mb-2 block">
                            {subject.nameUzb}
                          </span>
                          {subjectGroups.length === 0 ? (
                            <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                              ⚠️ Bu fan uchun {formData.classNumber}-sinf guruhi yo'q
                            </div>
                          ) : formData.classNumber < 7 ? (
                            <Select
                              value={selectedGroup?.groupId || ''}
                              onChange={(e) => handleGroupSelect(subject._id, e.target.value)}
                            >
                              <option value="">Guruh tanlang (ixtiyoriy)</option>
                              {subjectGroups.map((g: any) => (
                                <option key={g._id} value={g._id}>
                                  {g.letter}-guruh {g.teacherId ? `(${g.teacherId.fullName})` : ''}
                                </option>
                              ))}
                            </Select>
                          ) : (
                            <Select
                              value={selectedGroup?.groupId || ''}
                              onChange={(e) => handleGroupSelect(subject._id, e.target.value)}
                              required
                            >
                              <option value="">Guruh tanlang</option>
                              {subjectGroups.map((g: any) => (
                                <option key={g._id} value={g._id}>
                                  {g.letter}-guruh {g.teacherId ? `(${g.teacherId.fullName})` : ''}
                                </option>
                              ))}
                            </Select>
                          )}
                        </label>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={() => setStep(formData.classNumber < 7 ? 1 : 2)}>
                    Orqaga
                  </Button>
                  <Button type="submit" loading={loading} className="flex-1">
                    Saqlash va tugatish
                  </Button>
                </div>
              </div>
            )}
          </form>
        </DialogContent>
      </Dialog>

      {filteredStudents.length === 0 ? (
        <Card className="border-2 border-dashed border-gray-300">
          <CardContent className="py-16">
            {students.length === 0 ? (
              <EmptyState
                icon={GraduationCap}
                title="O'quvchilar yo'q"
                description="Yangi o'quvchi qo'shish uchun yuqoridagi tugmani bosing"
                action={{
                  label: "O'quvchi qo'shish",
                  onClick: () => setShowForm(true)
                }}
              />
            ) : (
              <div className="text-center">
                <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
                  <Search className="w-10 h-10 text-gray-400" />
                </div>
                <p className="text-gray-600 mb-4">Qidiruv bo'yicha o'quvchi topilmadi</p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-purple-600 hover:text-purple-700 font-medium"
                >
                  Tozalash
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredStudents.map((student) => (
            <Card 
              key={student._id} 
              className="group hover:shadow-lg transition-all duration-200 border border-gray-200"
            >
              <CardContent className="p-4">
                <div 
                  className="cursor-pointer"
                  onClick={() => setSelectedStudentId(student._id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <GraduationCap className="w-6 h-6 text-white" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-gray-900 group-hover:text-purple-600 transition-colors line-clamp-1">
                        {student.fullName}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {student.classNumber < 7 ? (
                          <Badge variant="success" size="sm">
                            Umumiy
                          </Badge>
                        ) : student.directionId ? (
                          <Badge variant="info" size="sm">
                            {student.directionId.nameUzb}
                          </Badge>
                        ) : null}
                        <Badge variant="default" size="sm">
                          {student.classNumber}-sinf
                        </Badge>
                        {student.branchId && (
                          <Badge variant="outline" size="sm">
                            {student.branchId.name}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-3">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                    <span>Profil faol</span>
                  </div>
                  
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setQrStudent(student)}
                      className="p-1.5 hover:bg-purple-50 rounded-lg transition-colors"
                      title="QR kod"
                    >
                      <QrCode className="w-4 h-4 text-purple-600" />
                    </button>
                    <button
                      onClick={() => openProfile(student.profileToken)}
                      className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Profilni ochish"
                    >
                      <ExternalLink className="w-4 h-4 text-blue-600" />
                    </button>
                    <button
                      onClick={() => copyProfileLink(student.profileToken)}
                      className="p-1.5 hover:bg-green-50 rounded-lg transition-colors"
                      title="Havola nusxalash"
                    >
                      <Copy className="w-4 h-4 text-green-600" />
                    </button>
                    <button 
                      onClick={() => handleEdit(student)}
                      className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Tahrirlash"
                    >
                      <Edit2 className="w-4 h-4 text-gray-600" />
                    </button>
                    <button 
                      onClick={() => handleDelete(student._id)}
                      className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                      title="O'chirish"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      {/* Индикатор загрузки дополнительных студентов */}
      {hasMoreToLoad && !searchQuery && (
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-3 text-gray-500">
            <div className="w-6 h-6 border-3 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm font-medium">
              Загрузка студентов... ({displayedStudents.length} из {students.length})
            </span>
          </div>
        </div>
      )}

      {/* Student Profile Modal */}
      <StudentProfileModal 
        studentId={selectedStudentId} 
        onClose={() => setSelectedStudentId(null)} 
      />

      {/* QR Code Modal */}
      {qrStudent && (
        <StudentQRCode
          student={qrStudent}
          onClose={() => setQrStudent(null)}
        />
      )}
    </div>
  );
}
