import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { StudentList } from '@/components/ui/StudentCard';
import MathText from '@/components/MathText';
import TestOptionsModal from '@/components/TestOptionsModal';
import { useToast } from '@/hooks/useToast';
import { ArrowLeft, FileText, Users, Eye, Shuffle } from 'lucide-react';

export default function TestViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { success, error } = useToast();
  
  const [test, setTest] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');

  useEffect(() => {
    fetchTest();
  }, [id]);

  const fetchTest = async () => {
    try {
      setLoading(true);
      
      // Load test
      const { data: testData } = await api.get(`/tests/${id}`);
      setTest(testData);
      
      // Load students
      if (testData.groupId) {
        const groupId = testData.groupId._id || testData.groupId;
        api.get(`/students/group/${groupId}`).then(({ data }) => {
          setStudents(data);
        }).catch(err => console.error('Error loading students:', err));
      }
      
      // Load variants
      api.get(`/tests/${id}/variants`).then(({ data }) => {
        setVariants(data);
      }).catch(err => console.error('Error loading variants:', err));
      
    } catch (err) {
      console.error('Error fetching test:', err);
      error('Test yuklanmadi');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateVariants = async () => {
    try {
      setGenerating(true);
      await api.post(`/tests/${id}/generate-variants`);
      success('Variantlar yaratildi');
      fetchTest();
    } catch (err: any) {
      console.error('Error generating variants:', err);
      error('Variantlar yaratishda xatolik');
    } finally {
      setGenerating(false);
    }
  };

  const filteredStudents = students.filter(student =>
    student.fullName.toLowerCase().includes(studentSearchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate('/teacher/tests')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Orqaga
          </Button>
        </div>
        <Card className="border-0 shadow-soft">
          <CardContent className="py-12 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
            <p className="text-gray-500 mt-4">Yuklanmoqda...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!test) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate('/teacher/tests')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Orqaga
          </Button>
        </div>
        <Card className="border-0 shadow-soft">
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">Test topilmadi</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasVariants = variants.length > 0;

  return (
    <div className="space-y-6 animate-fade-in pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate('/teacher/tests')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Orqaga
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{test.name}</h1>
            <p className="text-sm text-slate-600 mt-1">
              {test.classNumber}-sinf • {test.subjectId?.nameUzb} • {test.groupId?.name}
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

      {/* Actions Card */}
      <button
        onClick={() => setShowOptionsModal(true)}
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
            students={filteredStudents}
            emptyMessage={studentSearchQuery ? "Qidiruv bo'yicha o'quvchi topilmadi" : "O'quvchilar topilmadi"}
            compact={true}
          />
        </div>
      </div>

      {/* Test Options Modal */}
      {test && (
        <TestOptionsModal
          isOpen={showOptionsModal}
          onClose={() => setShowOptionsModal(false)}
          test={test}
          onRefresh={fetchTest}
        />
      )}
    </div>
  );
}
