import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/hooks/useToast';
import { Plus, UserCheck, Edit2, Trash2, Phone, User, Search } from 'lucide-react';
import { PageNavbar } from '@/components/ui/PageNavbar';
import { SkeletonCard } from '@/components/ui/SkeletonCard';

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    fullName: '',
    phone: ''
  });
  const { success, error } = useToast();

  useEffect(() => {
    fetchTeachers();
  }, []);

  const fetchTeachers = async () => {
    try {
      console.log('Fetching teachers...');
      const { data } = await api.get('/teachers');
      console.log('Teachers fetched:', data);
      setTeachers(data);
    } catch (err: any) {
      console.error('Error fetching teachers:', err);
      error('O\'qituvchilarni yuklashda xatolik');
    } finally {
      setPageLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.fullName || !formData.username || (!editingTeacher && !formData.password)) {
      error('Barcha majburiy maydonlarni to\'ldiring');
      return;
    }
    
    setLoading(true);
    try {
      console.log('Saving teacher:', formData);
      if (editingTeacher) {
        await api.put(`/teachers/${editingTeacher._id}`, formData);
        success('O\'qituvchi muvaffaqiyatli yangilandi!');
      } else {
        const response = await api.post('/teachers', formData);
        console.log('Teacher created response:', response.data);
        success('O\'qituvchi muvaffaqiyatli qo\'shildi!');
      }
      setFormData({ username: '', password: '', fullName: '', phone: '' });
      setEditingTeacher(null);
      setShowForm(false);
      
      // Перезагружаем список учителей
      await fetchTeachers();
    } catch (err: any) {
      console.error('Error saving teacher:', err);
      console.error('Error response:', err.response?.data);
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (teacher: any) => {
    setEditingTeacher(teacher);
    setFormData({
      username: teacher.username || '',
      password: '',
      fullName: teacher.fullName || '',
      phone: teacher.phone || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (teacherId: string) => {
    if (!confirm('O\'qituvchini o\'chirmoqchimisiz?')) return;
    
    try {
      await api.delete(`/teachers/${teacherId}`);
      fetchTeachers();
      success('O\'qituvchi o\'chirildi!');
    } catch (err: any) {
      console.error('Error deleting teacher:', err);
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingTeacher(null);
    setFormData({ username: '', password: '', fullName: '', phone: '' });
  };

  if (pageLoading) {
    return (
      <div className="space-y-6">
        <PageNavbar
          title="O'qituvchilar"
          description="O'qituvchilarni boshqarish va guruhlar tayinlash"
        />
        <div className="space-y-4">
          <SkeletonCard variant="list" count={5} />
        </div>
      </div>
    );
  }

  // Filter teachers by search query
  const filteredTeachers = teachers.filter(teacher =>
    teacher.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    teacher.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-20">
      <PageNavbar
        title="O'qituvchilar"
        description="O'qituvchilarni boshqarish va guruhlar tayinlash"
        badge={`${filteredTeachers.length} ta`}
        showSearch={teachers.length > 0}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="O'qituvchi ismini qidirish..."
        showAddButton={true}
        addButtonText="O'qituvchi qo'shish"
        onAddClick={() => setShowForm(true)}
      />

      <Dialog open={showForm} onClose={handleCloseForm}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-primary" />
            {editingTeacher ? 'O\'qituvchini tahrirlash' : 'Yangi o\'qituvchi'}
          </DialogTitle>
        </DialogHeader>
        <DialogContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="F.I.Sh"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              required
              placeholder="Aliyev Ali Alijon o'g'li"
            />
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Login"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
                placeholder="teacher1"
              />
              <Input
                label="Parol"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required={!editingTeacher}
                placeholder={editingTeacher ? "Bo'sh qoldiring (o'zgartirmaslik uchun)" : "••••••••"}
              />
            </div>

            <PhoneInput
              label="Telefon"
              value={formData.phone}
              onChange={(value) => setFormData({ ...formData, phone: value })}
            />

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900 font-medium mb-1">
                🔐 Xavfsizlik
              </p>
              <p className="text-sm text-blue-700">
                O'qituvchi login va parol bilan tizimga kirishi mumkin
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-4">
              <Button type="submit" loading={loading} className="w-full sm:w-auto">
                {editingTeacher ? 'Yangilash' : 'Saqlash'}
              </Button>
              <Button type="button" variant="outline" onClick={handleCloseForm} className="w-full sm:w-auto">
                Bekor qilish
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {filteredTeachers.length === 0 ? (
        <Card className="border-2 border-dashed border-gray-300">
          <CardContent className="py-16">
            {teachers.length === 0 ? (
              <EmptyState
                icon={UserCheck}
                title="O'qituvchilar yo'q"
                description="Yangi o'qituvchi qo'shish uchun yuqoridagi tugmani bosing"
                action={{
                  label: "O'qituvchi qo'shish",
                  onClick: () => setShowForm(true)
                }}
              />
            ) : (
              <div className="text-center">
                <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
                  <Search className="w-10 h-10 text-gray-400" />
                </div>
                <p className="text-gray-600 mb-4">Qidiruv bo'yicha o'qituvchi topilmadi</p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-green-600 hover:text-green-700 font-medium"
                >
                  Tozalash
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredTeachers.map((teacher) => (
            <Card key={teacher._id} className="group hover:shadow-2xl transition-all duration-300 border border-gray-200 overflow-hidden">
              <CardContent className="p-6 relative">
                <div className="flex items-start gap-4 mb-4">
                  <div className="relative flex-shrink-0">
                    <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                      <UserCheck className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-green-600 transition-colors line-clamp-1">
                      {teacher.fullName}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="success">
                        <User className="w-3 h-3 mr-1" />
                        {teacher.username || 'N/A'}
                      </Badge>
                    </div>
                  </div>
                </div>

                {teacher.phone && (
                  <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100 mb-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Phone className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 uppercase font-semibold">Telefon</p>
                      <p className="font-bold text-gray-900">{teacher.phone}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="font-medium">Faol o'qituvchi</span>
                  </div>
                  
                  <div className="flex gap-1">
                    <button 
                      onClick={() => handleEdit(teacher)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Tahrirlash"
                    >
                      <Edit2 className="w-5 h-5 text-gray-600" />
                    </button>
                    <button 
                      onClick={() => handleDelete(teacher._id)}
                      className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                      title="O'chirish"
                    >
                      <Trash2 className="w-5 h-5 text-red-600" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
