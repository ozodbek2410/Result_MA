import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { StudentList } from '@/components/ui/StudentCard';
import { useToast } from '@/hooks/useToast';
import TestOptionsModal from '@/components/TestOptionsModal';
import { Plus, Upload, FileText, Edit2, Trash2, Users, Eye, Search, BookOpen, ArrowRight, ArrowLeft, Shuffle } from 'lucide-react';

export default function TestsPage() {
  const navigate = useNavigate();
  const [tests, setTests] = useState<any[]>([]);
  const [showVariantsModal, setShowVariantsModal] = useState(false);
  const [selectedTest, setSelectedTest] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const { success, error } = useToast();
  
  // Configuration view state
  const [showConfigView, setShowConfigView] = useState(false);
  const [configTest, setConfigTest] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');

  useEffect(() => {
    fetchTests();
  }, []);

  const fetchTests = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/tests');
      setTests(data);
    } catch (err: any) {
      console.error('Error fetching tests:', err);
      error('Testlarni yuklashda xatolik');
    } finally {
      setLoading(false);
    }
  };

  // Load configuration data
  const loadConfigData = async (testId: string) => {
    try {
      setLoading(true);
      
      // Загружаем тест
      const { data: testData } = await api.get(`/tests/${testId}`);
      setConfigTest(testData);
      
      // Загружаем студентов группы
      if (testData.groupId) {
        const groupId = testData.groupId._id || testData.groupId;
        const { data: studentsData } = await api.get(`/students/group/${groupId}`);
        setStudents(studentsData);
      }
      
      // Загружаем варианты
      const { data: variantsData } = await api.get(`/tests/${testId}/variants`);
      setVariants(variantsData);
      
      setShowConfigView(true);
    } catch (err: any) {
      console.error('Error loading data:', err);
      error('Ma\'lumotlarni yuklashda xatolik');
    } finally {
      setLoading(false);
    }
  };

  const handleCardClick = (test: any) => {
    loadConfigData(test._id);
  };

  const handleBackToList = () => {
    setShowConfigView(false);
    setConfigTest(null);
    setStudents([]);
    setVariants([]);
    setStudentSearchQuery('');
  };

  const handleGenerateVariants = async () => {
    if (!configTest) return;
    
    try {
      await api.post(`/tests/${configTest._id}/generate-variants`);
      success('Variantlar yaratildi');
      await loadConfigData(configTest._id);
    } catch (err: any) {
      console.error('Error generating variants:', err);
      error('Variantlar yaratishda xatolik');
    }
  };

  const handleEdit = (testId: string) => {
    navigate(`/teacher/tests/edit/${testId}`);
  };

  const handleDelete = async (testId: string) => {
    if (!confirm('Testni o\'chirmoqchimisiz?')) return;
    
    try {
      await api.delete(`/tests/${testId}`);
      fetchTests();
      success('Test o\'chirildi!');
    } catch (err: any) {
      console.error('Error deleting test:', err);
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  const handleShowVariants = (test: any) => {
    setSelectedTest(test);
    setShowVariantsModal(true);
  };

  const filteredStudentsForConfig = students.filter(student =>
    student.fullName.toLowerCase().includes(studentSearchQuery.toLowerCase())
  );

  const filteredTests = tests.filter(test =>
    test.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    test.groupId?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    test.subjectId?.nameUzb?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="animate-pulse">
          <div className="h-12 w-64 bg-slate-200 rounded-2xl mb-3"></div>
          <div className="h-6 w-96 bg-slate-200 rounded-xl"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-56 bg-slate-200 rounded-3xl animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  // Show configuration view
  if (showConfigView && configTest) {
    const hasVariants = variants.length > 0;
    
    return (
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleBackToList}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{configTest.name}</h1>
              <p className="text-sm text-slate-600 mt-1">
                {configTest.classNumber}-sinf • {configTest.subjectId?.nameUzb} • {configTest.groupId?.name}
              </p>
            </div>
          </div>
        </div>

        {/* Test Info Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center">
              <FileText className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-slate-600">Savollar</p>
                <p className="text-2xl font-bold text-slate-900">{configTest.questions?.length || 0} ta</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">O'quvchilar</p>
                <p className="text-2xl font-bold text-slate-900">{students.length} ta</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Variantlar</p>
                <p className="text-2xl font-bold text-slate-900">{variants.length} ta</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions Card */}
        <button
          onClick={() => setShowVariantsModal(true)}
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

        {/* Additional Actions */}
        {!hasVariants && (
          <Button
            onClick={handleGenerateVariants}
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            <Shuffle className="w-4 h-4 mr-2" />
            Variantlar yaratish
          </Button>
        )}

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
              emptyMessage={studentSearchQuery ? "Qidiruv bo'yicha o'quvchi topilmadi" : "O'quvchilar topilmadi"}
              compact={true}
            />
          </div>
        </div>

        {/* Test Options Modal */}
        {configTest && (
          <TestOptionsModal
            isOpen={showVariantsModal}
            onClose={() => setShowVariantsModal(false)}
            test={configTest}
            onRefresh={() => loadConfigData(configTest._id)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8 animate-fade-in pb-24 sm:pb-24">
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-green-500/30 flex-shrink-0">
              <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900 truncate">Testlar</h1>
              <p className="text-xs sm:text-sm text-slate-600 truncate hidden sm:block">Testlarni yaratish va boshqarish</p>
            </div>
          </div>
          <div className="flex gap-2 sm:gap-3">
            <Button 
              variant="outline" 
              size="lg"
              onClick={() => navigate('/teacher/tests/import')}
              className="flex-1 sm:flex-none border-2 hover:border-green-500 hover:text-green-600"
            >
              <Upload className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
              <span className="hidden xs:inline">Yuklash</span>
            </Button>
            <Button 
              size="lg"
              onClick={() => navigate('/teacher/tests/create')}
              className="flex-1 sm:flex-none bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-lg shadow-green-500/30"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
              <span className="hidden xs:inline">Test yaratish</span>
              <span className="xs:hidden">Yaratish</span>
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Test nomi bo'yicha qidirish..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 sm:pl-12 pr-3 sm:pr-4 py-2.5 sm:py-3 bg-white border-2 border-slate-200 rounded-xl sm:rounded-2xl focus:outline-none focus:border-green-500 transition-colors text-sm sm:text-base text-slate-900 placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Tests Grid */}
      {filteredTests.length === 0 ? (
        <Card className="border-2 border-slate-200/50">
          <CardContent className="py-16 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-slate-100 to-slate-200 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <FileText className="w-10 h-10 text-slate-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              {searchQuery ? 'Testlar topilmadi' : 'Testlar yo\'q'}
            </h3>
            <p className="text-slate-600 mb-6 max-w-md mx-auto">
              {searchQuery 
                ? 'Qidiruv bo\'yicha hech narsa topilmadi. Boshqa so\'z bilan qidiring.'
                : 'Birinchi testni yaratish uchun yuqoridagi tugmani bosing'
              }
            </p>
            {!searchQuery && (
              <Button size="lg" onClick={() => navigate('/teacher/tests/create')} className="bg-gradient-to-r from-green-500 to-emerald-600">
                <Plus className="w-5 h-5 mr-2" />
                Test yaratish
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          {filteredTests.map((test, index) => (
            <div
              key={test._id}
              style={{ animationDelay: `${index * 100}ms` }}
              className="group animate-slide-in"
            >
              <Card 
                className="h-full border-2 border-slate-200/50 hover:border-green-300 transition-all duration-300 hover:shadow-2xl hover:shadow-green-500/20 hover:-translate-y-2 overflow-hidden cursor-pointer"
                onClick={() => handleCardClick(test)}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-green-50 to-emerald-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <CardContent className="p-4 sm:p-5 lg:p-6 relative">
                  {/* Icon & Actions */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                      <FileText className="w-7 h-7 text-white" />
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(test._id);
                        }}
                        className="p-2 hover:bg-blue-100 rounded-xl transition-colors"
                      >
                        <Edit2 className="w-4 h-4 text-slate-600" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(test._id);
                        }}
                        className="p-2 hover:bg-red-100 rounded-xl transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </div>

                  {/* Test Info */}
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-slate-900 mb-3 group-hover:text-green-600 transition-colors line-clamp-2">
                      {test.name}
                    </h3>
                    <div className="flex flex-wrap gap-2 mb-3">
                      <Badge className="bg-green-100 text-green-700 border-green-200">
                        {test.classNumber}-sinf
                      </Badge>
                      {test.subjectId && (
                        <Badge className="bg-purple-100 text-purple-700 border-purple-200">
                          {test.subjectId.nameUzb}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Group */}
                  {test.groupId && (
                    <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl mb-4">
                      <Users className="w-4 h-4 text-slate-600" />
                      <span className="text-sm font-semibold text-slate-700">
                        {test.groupId.name}
                      </span>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="flex items-center justify-between text-slate-600 pt-4 border-t border-slate-200">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      <span className="text-sm font-medium">
                        {test.questions?.length || 0} ta savol
                      </span>
                    </div>
                    <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-green-600 group-hover:translate-x-1 transition-all" />
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
