import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/hooks/useToast';
import { Plus, Users, Edit2, Trash2, User, ChevronRight, Search } from 'lucide-react';
import { PageNavbar } from '@/components/ui/PageNavbar';
import { SkeletonCard } from '@/components/ui/SkeletonCard';

export default function GroupsPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    classNumber: 7 as number,
    subjectId: '',
    letter: 'A',
    teacherId: ''
  });
  const { success, error } = useToast();

  useEffect(() => {
    fetchGroups();
    fetchSubjects();
    fetchTeachers();
  }, []);

  const fetchGroups = async () => {
    try {
      const { data } = await api.get('/groups');
      setGroups(data);
    } catch (err: any) {
      console.error('Error fetching groups:', err);
      error('Guruhlarni yuklashda xatolik');
    } finally {
      setPageLoading(false);
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

  const fetchTeachers = async () => {
    try {
      console.log('Загрузка учителей...');
      const { data } = await api.get('/teachers');
      console.log('Учителя загружены:', data);
      setTeachers(data);
    } catch (err: any) {
      console.error('Error fetching teachers:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.subjectId || !formData.letter) {
      error('Barcha majburiy maydonlarni to\'ldiring');
      return;
    }
    
    setLoading(true);
    try {
      console.log('=== СОХРАНЕНИЕ ГРУППЫ ===');
      console.log('FormData:', formData);
      console.log('TeacherId:', formData.teacherId);
      console.log('Editing:', editingGroup ? 'Да' : 'Нет');
      
      if (editingGroup) {
        const response = await api.put(`/groups/${editingGroup._id}`, formData);
        console.log('Ответ сервера (обновление):', response.data);
        success('Guruh muvaffaqiyatli yangilandi!');
      } else {
        const response = await api.post('/groups', formData);
        console.log('Ответ сервера (создание):', response.data);
        success('Guruh muvaffaqiyatli qo\'shildi!');
      }
      setFormData({ name: '', classNumber: 7 as number, subjectId: '', letter: 'A', teacherId: '' });
      setEditingGroup(null);
      setShowForm(false);
      fetchGroups();
    } catch (err: any) {
      console.error('Error saving group:', err);
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (group: any) => {
    setEditingGroup(group);
    setFormData({
      name: group.name,
      classNumber: group.classNumber,
      subjectId: group.subjectId?._id || '',
      letter: group.letter,
      teacherId: group.teacherId?._id || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (groupId: string) => {
    if (!confirm('Guruhni o\'chirmoqchimisiz?')) return;
    
    try {
      await api.delete(`/groups/${groupId}`);
      fetchGroups();
      success('Guruh o\'chirildi!');
    } catch (err: any) {
      console.error('Error deleting group:', err);
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingGroup(null);
    setFormData({ name: '', classNumber: 7 as number, subjectId: '', letter: 'A', teacherId: '' });
  };

  if (pageLoading) {
    return (
      <div className="space-y-6">
        <PageNavbar
          title="Guruhlar"
          description="Guruhlarni boshqarish va o'qituvchilarni tayinlash"
        />
        <div className="space-y-4">
          <SkeletonCard variant="list" count={5} />
        </div>
      </div>
    );
  }

  // Filter groups by search query
  const filteredGroups = groups.filter(group =>
    group.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    group.subjectId?.nameUzb?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    group.teacherId?.fullName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-20">
      <PageNavbar
        title="Guruhlar"
        description="Guruhlarni boshqarish va o'qituvchilarni tayinlash"
        badge={`${filteredGroups.length} ta`}
        showSearch={true}
        searchPlaceholder="Guruh nomi, fan yoki o'qituvchini qidirish..."
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        showAddButton={true}
        addButtonText="Guruh qo'shish"
        onAddClick={() => setShowForm(true)}
      />

      <Dialog open={showForm} onClose={handleCloseForm}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            {editingGroup ? 'Guruhni tahrirlash' : 'Yangi guruh'}
          </DialogTitle>
        </DialogHeader>
        <DialogContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Guruh nomi"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="9-A Matematika"
            />
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Sinf"
                type="number"
                min="1"
                max="11"
                value={formData.classNumber}
                onChange={(e) => setFormData({ ...formData, classNumber: parseInt(e.target.value) })}
                required
              />
              <Input
                label="Harf"
                value={formData.letter}
                onChange={(e) => setFormData({ ...formData, letter: e.target.value.toUpperCase() })}
                required
                placeholder="A"
                maxLength={1}
              />
            </div>

            <Select
              label="Fan"
              value={formData.subjectId}
              onChange={(e) => setFormData({ ...formData, subjectId: e.target.value })}
              required
            >
              <option value="">Tanlang</option>
              {subjects.map((s) => (
                <option key={s._id} value={s._id}>{s.nameUzb}</option>
              ))}
            </Select>

            <Select
              label="O'qituvchi (ixtiyoriy)"
              value={formData.teacherId}
              onChange={(e) => setFormData({ ...formData, teacherId: e.target.value })}
            >
              <option value="">Keyinroq tayinlash</option>
              {teachers.map((t) => (
                <option key={t._id} value={t._id}>{t.fullName}</option>
              ))}
            </Select>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900 font-medium mb-1">
                💡 Maslahat
              </p>
              <p className="text-sm text-blue-700">
                O'qituvchini keyinroq ham tayinlash mumkin
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-4">
              <Button type="submit" loading={loading} className="w-full sm:w-auto">
                {editingGroup ? 'Yangilash' : 'Saqlash'}
              </Button>
              <Button type="button" variant="outline" onClick={handleCloseForm} className="w-full sm:w-auto">
                Bekor qilish
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {filteredGroups.length === 0 ? (
        <Card className="border-2 border-dashed border-gray-300">
          <CardContent className="py-16">
            {groups.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Guruhlar yo'q"
                description="Yangi guruh qo'shish uchun yuqoridagi tugmani bosing"
                action={{
                  label: "Guruh qo'shish",
                  onClick: () => setShowForm(true)
                }}
              />
            ) : (
              <div className="text-center">
                <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
                  <Search className="w-10 h-10 text-gray-400" />
                </div>
                <p className="text-gray-600 mb-4">Qidiruv bo'yicha guruh topilmadi</p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Tozalash
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredGroups.map((group) => (
            <Card 
              key={group._id} 
              className="group hover:shadow-2xl transition-all duration-300 cursor-pointer border border-gray-200 overflow-hidden"
              onClick={() => navigate(`/custom/groups/${group._id}`)}
            >
              <CardContent className="p-6 relative">
                <div className="flex items-start gap-4 mb-4">
                  <div className="relative flex-shrink-0">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                      <Users className="w-8 h-8 text-white" />
                    </div>
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full border-2 border-white flex items-center justify-center shadow-md">
                      <span className="text-xs text-white font-bold">{group.studentsCount || 0}</span>
                    </div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors line-clamp-1">
                      {group.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="info">{group.classNumber}-sinf</Badge>
                      <Badge variant="success">{group.letter}</Badge>
                      {group.subjectId && (
                        <Badge variant="purple">{group.subjectId.nameUzb}</Badge>
                      )}
                    </div>
                  </div>
                </div>

                {group.teacherId ? (
                  <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-100 mb-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 uppercase font-semibold">O'qituvchi</p>
                      <p className="font-bold text-gray-900 truncate">{group.teacherId.fullName}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl border border-yellow-200 mb-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-lg flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-yellow-700 font-semibold">⚠️ O'qituvchi tayinlanmagan</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="font-medium">{group.studentsCount || 0} o'quvchi</span>
                  </div>
                  
                  <div className="flex gap-1">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/custom/groups/${group._id}`);
                      }}
                      className="p-2 hover:bg-blue-50 rounded-lg transition-colors group/btn"
                      title="Ko'rish"
                    >
                      <ChevronRight className="w-5 h-5 text-blue-600 group-hover/btn:translate-x-1 transition-transform" />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(group);
                      }}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Tahrirlash"
                    >
                      <Edit2 className="w-5 h-5 text-gray-600" />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(group._id);
                      }}
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
