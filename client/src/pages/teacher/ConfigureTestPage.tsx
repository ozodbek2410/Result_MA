import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { StudentList } from '@/components/ui/StudentCard';
import { useToast } from '@/hooks/useToast';
import TestOptionsModal from '@/components/TestOptionsModal';
import { 
  ArrowLeft, 
  Users, 
  Eye,
  FileText,
  Printer,
  Shuffle
} from 'lucide-react';

export default function ConfigureTestPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { success, error } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [test, setTest] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Загружаем тест
      const { data: testData } = await api.get(`/tests/${id}`);
      setTest(testData);
      
      // Загружаем студентов группы
      if (testData.groupId) {
        const groupId = testData.groupId._id || testData.groupId;
        const { data: studentsData } = await api.get(`/students/group/${groupId}`);
        setStudents(studentsData);
      }
      
      // Загружаем варианты
      const { data: variantsData } = await api.get(`/tests/${id}/variants`);
      setVariants(variantsData);
      
    } catch (err: any) {
      console.error('Error loading data:', err);
      error('Ma\'lumotlarni yuklashda xatolik');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateVariants = async () => {
    try {
      console.log('🔄 Generating variants for test:', id);
      const response = await api.post(`/tests/${id}/generate-variants`);
      console.log('✅ Variants generated:', response.data);
      success('Variantlar yaratildi');
      loadData();
    } catch (err: any) {
      console.error('Error generating variants:', err);
      error('Variantlar yaratishda xatolik');
    }
  };

  // Фильтрация студентов по поисковому запросу
  const filteredStudents = students.filter(student =>
    student.fullName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Button variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Orqaga
            </Button>
          </div>
          <div className="bg-white rounded-xl p-12 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
            <p className="text-gray-500 mt-4">Yuklanmoqda...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!test) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Button variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Orqaga
            </Button>
          </div>
          <div className="bg-white rounded-xl p-12 text-center">
            <p className="text-gray-500">Test topilmadi</p>
          </div>
        </div>
      </div>
    );
  }

  const hasVariants = variants.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Orqaga
            </Button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{test.name}</h1>
              <p className="text-slate-600 mt-1">
                {test.classNumber}-sinf • {test.subjectId?.nameUzb} • {test.groupId?.name}
              </p>
            </div>
          </div>
        </div>

        {/* Test Info Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center">
              <FileText className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-slate-600">Savollar</p>
                <p className="text-2xl font-bold text-slate-900">{test.questions?.length || 0} ta</p>
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

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => setShowOptionsModal(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Eye className="w-4 h-4 mr-2" />
            Ko'rish va chop etish
              </Button>
              
              <Button
                onClick={handleGenerateVariants}
                variant="outline"
              >
          </Button>


        </div>

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
              emptyMessage={searchQuery ? "Qidiruv bo'yicha o'quvchi topilmadi" : "O'quvchilar topilmadi"}
              compact={true}
            />
          </div>
        </div>
      </div>

      {/* Test Options Modal */}
      {test && (
        <TestOptionsModal
          isOpen={showOptionsModal}
          onClose={() => setShowOptionsModal(false)}
          test={test}
          onRefresh={loadData}
        />
      )}
    </div>
  );
}
