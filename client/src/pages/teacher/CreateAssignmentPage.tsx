import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/hooks/useToast';
import AssignmentQuestionEditor from '@/components/AssignmentQuestionEditor';
import { ArrowLeft, Save, ClipboardList, Upload } from 'lucide-react';
import api from '@/lib/api';

const assignmentTypes = [
  { value: 'yozma_ish', label: 'Yozma ish' },
  { value: 'diktant', label: 'Diktant' },
  { value: 'ogzaki', label: 'Og\'zaki' },
  { value: 'savol_javob', label: 'Savol-javob' },
  { value: 'yopiq_test', label: 'Yopiq test' }
];

export default function CreateAssignmentPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { success, error } = useToast();
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState(1);
  const [fetchingAssignment, setFetchingAssignment] = useState(false);
  
  const [formData, setFormData] = useState({
    groupId: '',
    title: '',
    description: '',
    type: 'yozma_ish',
    fileUrl: '',
    dueDate: '',
    questions: [] as any[]
  });

  useEffect(() => {
    fetchGroups();
    if (id) {
      fetchAssignment();
    }
  }, [id]);

  const fetchGroups = async () => {
    try {
      const { data } = await api.get('/groups');
      setGroups(data);
    } catch (err) {
      console.error('Error fetching groups:', err);
    }
  };

  const fetchAssignment = async () => {
    console.log('Fetching assignment with id:', id);
    setFetchingAssignment(true);
    try {
      const { data } = await api.get(`/assignments/${id}`);
      console.log('Assignment data received:', data);
      
      // Сервер возвращает { assignment, submissions }, нам нужен только assignment
      const assignmentData = data.assignment || data;
      
      const newFormData = {
        groupId: assignmentData.groupId?._id || assignmentData.groupId || '',
        title: assignmentData.title || '',
        description: assignmentData.description || '',
        type: assignmentData.type || 'yozma_ish',
        fileUrl: assignmentData.fileUrl || '',
        dueDate: assignmentData.dueDate ? new Date(assignmentData.dueDate).toISOString().split('T')[0] : '',
        questions: assignmentData.questions || []
      };
      
      console.log('Setting form data:', newFormData);
      setFormData(newFormData);
    } catch (err) {
      console.error('Error fetching assignment:', err);
      error('Topshiriqni yuklashda xatolik');
      navigate('/teacher/assignments');
    } finally {
      setFetchingAssignment(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    try {
      const { data } = await api.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setFormData(prev => ({ ...prev, fileUrl: data.url }));
      success('Fayl yuklandi!');
    } catch (err: any) {
      console.error('Error uploading file:', err);
      error('Faylni yuklashda xatolik');
    } finally {
      setUploading(false);
    }
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (!formData.groupId || !formData.title || !formData.type) {
        error('Majburiy maydonlarni to\'ldiring');
        return;
      }
      setStep(2);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.groupId || !formData.title || !formData.type) {
      error('Majburiy maydonlarni to\'ldiring');
      return;
    }

    setLoading(true);
    try {
      if (id) {
        await api.put(`/assignments/${id}`, formData);
        success('Topshiriq muvaffaqiyatli yangilandi!');
      } else {
        await api.post('/assignments', formData);
        success('Topshiriq muvaffaqiyatli yaratildi!');
      }
      navigate('/teacher/assignments');
    } catch (err: any) {
      console.error('Error saving assignment:', err);
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  if (fetchingAssignment) {
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="max-w-3xl mx-auto p-3 sm:p-4 space-y-3 animate-fade-in">
          <div className="animate-pulse space-y-3">
            <div className="h-10 bg-slate-200 rounded-xl w-48"></div>
            <div className="h-64 bg-slate-200 rounded-2xl"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-3xl mx-auto p-3 sm:p-4 space-y-3 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/teacher/assignments')}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Orqaga
          </Button>
          <div className="flex-1">
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                <ClipboardList className="w-4 h-4 text-white" />
              </div>
              {id ? 'Topshiriqni tahrirlash' : 'Yangi topshiriq yaratish'}
            </h1>
            <p className="text-xs text-gray-600 mt-0.5">
              Qadam {step}/2
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {step === 1 && (
            <Card className="border shadow-sm">
              <CardContent className="p-3 sm:p-4">
                <div className="space-y-3">
                  <div>
                    <h2 className="text-base font-bold text-gray-900 mb-1">
                      Topshiriq ma'lumotlari
                    </h2>
                    <p className="text-xs text-gray-600 mb-3">
                      Topshiriq haqida asosiy ma'lumotlarni kiriting
                    </p>
                  </div>

                  <Input
                    label="Topshiriq nomi"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                    placeholder="Masalan: 1-nazorat ishi"
                    className="h-9"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Select
                      label="Guruh"
                      value={formData.groupId}
                      onChange={(e) => setFormData({ ...formData, groupId: e.target.value })}
                      required
                      className="h-9"
                    >
                      <option value="">Tanlang</option>
                      {groups.map((g) => (
                        <option key={g._id} value={g._id}>
                          {g.name}
                        </option>
                      ))}
                    </Select>

                    <Select
                      label="Topshiriq turi"
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      required
                      className="h-9"
                    >
                      {assignmentTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <Textarea
                    label="Tavsif (ixtiyoriy)"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Topshiriq haqida qo'shimcha ma'lumot..."
                    rows={3}
                    className="text-sm"
                  />

                  <Input
                    label="Topshirish muddati (ixtiyoriy)"
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="h-9"
                  />

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Fayl yuklash (ixtiyoriy)
                    </label>
                    <div className="flex items-center gap-2">
                      <label className="flex-1">
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 text-center hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer">
                          <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                          <p className="text-xs text-gray-600">
                            {uploading ? 'Yuklanmoqda...' : 'Fayl tanlash'}
                          </p>
                          {formData.fileUrl && (
                            <p className="text-xs text-green-600 mt-1">
                              ✓ Yuklandi
                            </p>
                          )}
                        </div>
                        <input
                          type="file"
                          className="hidden"
                          onChange={handleFileUpload}
                          disabled={uploading}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-3 border-t">
                    <Button 
                      type="button" 
                      onClick={handleNextStep}
                      size="sm"
                      className="h-9"
                    >
                      Keyingi qadam
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={() => navigate('/teacher/assignments')}
                      className="h-9"
                    >
                      Bekor qilish
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 2 && (
            <Card className="border shadow-sm">
              <CardContent className="p-3 sm:p-4">
                <div className="space-y-3">
                  <div>
                    <h2 className="text-base font-bold text-gray-900 mb-1">
                      Savollar
                    </h2>
                    <p className="text-xs text-gray-600 mb-3">
                      Topshiriq uchun savollar qo'shing
                    </p>
                  </div>

                  <AssignmentQuestionEditor
                    type={formData.type}
                    questions={formData.questions}
                    onChange={(questions) => setFormData({ ...formData, questions })}
                  />

                  <div className="flex gap-2 pt-3 border-t">
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={() => setStep(1)}
                      className="h-9"
                    >
                      Orqaga
                    </Button>
                    <Button 
                      type="submit" 
                      loading={loading}
                      size="sm"
                      className="h-9"
                    >
                      <Save className="w-4 h-4 mr-1" />
                      {id ? 'Saqlash' : 'Yaratish'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </form>
      </div>
    </div>
  );
}
