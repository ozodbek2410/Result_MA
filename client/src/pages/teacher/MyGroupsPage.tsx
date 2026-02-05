import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/Dialog';
import { useToast } from '@/hooks/useToast';
import { 
  Users, 
  BookOpen, 
  Search, 
  ArrowRight, 
  GraduationCap,
  Sparkles,
  Plus,
  Edit2,
  Trash2
} from 'lucide-react';

export default function MyGroupsPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    classNumber: 7,
    letter: 'A',
    subjectId: ''
  });
  const navigate = useNavigate();
  const { success, error } = useToast();

  useEffect(() => {
    fetchGroups();
    fetchSubjects();
  }, []);

  const fetchSubjects = async () => {
    try {
      const { data } = await api.get('/subjects');
      setSubjects(data);
    } catch (err) {
      console.error('Error fetching subjects:', err);
    }
  };

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/teacher/my-groups');
      setGroups(data);
    } catch (error) {
      console.error('Error fetching groups:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.subjectId) {
      error('Barcha majburiy maydonlarni to\'ldiring');
      return;
    }

    try {
      if (editingGroup) {
        await api.put(`/teacher/groups/${editingGroup._id}`, formData);
        success('Guruh muvaffaqiyatli yangilandi!');
      } else {
        await api.post('/teacher/groups', formData);
        success('Guruh muvaffaqiyatli yaratildi!');
      }
      setShowForm(false);
      setEditingGroup(null);
      setFormData({ name: '', classNumber: 7, letter: 'A', subjectId: '' });
      fetchGroups();
    } catch (err: any) {
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  const handleEdit = (group: any) => {
    setEditingGroup(group);
    setFormData({
      name: group.name,
      classNumber: group.classNumber,
      letter: group.letter,
      subjectId: group.subjectId?._id || group.subjectId
    });
    setShowForm(true);
  };

  const handleDelete = async (groupId: string) => {
    if (!confirm('Guruhni o\'chirmoqchimisiz? Barcha o\'quvchilar guruhdan chiqariladi.')) return;
    
    try {
      await api.delete(`/teacher/groups/${groupId}`);
      success('Guruh o\'chirildi!');
      fetchGroups();
    } catch (err: any) {
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingGroup(null);
    setFormData({ name: '', classNumber: 7, letter: 'A', subjectId: '' });
  };

  const filteredGroups = groups.filter(group =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    group.subjectId?.nameUzb?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in pb-20">
        <div className="animate-pulse">
          <div className="h-12 w-64 bg-slate-200 rounded-2xl mb-3"></div>
          <div className="h-6 w-96 bg-slate-200 rounded-xl"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-slate-200 rounded-3xl animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-4 gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30 flex-shrink-0">
              <Users className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl md:text-3xl font-bold text-slate-900 truncate">Mening guruhlarim</h1>
              <p className="text-xs md:text-sm text-slate-600 hidden sm:block">Sizga biriktirilgan guruhlar ro'yxati</p>
            </div>
          </div>
          <Button onClick={() => setShowForm(true)} className="gap-2 flex-shrink-0">
            <Plus className="w-4 h-4 md:w-5 md:h-5" />
            <span className="hidden sm:inline">Guruh qo'shish</span>
            <span className="sm:hidden">Qo'shish</span>
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Guruh yoki fan bo'yicha qidirish..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border-2 border-slate-200 rounded-2xl focus:outline-none focus:border-indigo-500 transition-colors text-slate-900 placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Create Group Dialog */}
      <Dialog open={showForm} onClose={() => setShowForm(false)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            {editingGroup ? 'Guruhni tahrirlash' : 'Yangi guruh yaratish'}
          </DialogTitle>
        </DialogHeader>
        <DialogContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Guruh nomi"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="7-A Matematika"
            />
            
            <div className="grid grid-cols-2 gap-4">
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

            <div className="flex gap-2 pt-4">
              <Button type="submit">{editingGroup ? 'Yangilash' : 'Saqlash'}</Button>
              <Button type="button" variant="outline" onClick={handleCloseForm}>
                Bekor qilish
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Groups Grid - Desktop / List - Mobile */}
      {filteredGroups.length > 0 ? (
        <>
          {/* Desktop Grid View - Hidden on mobile */}
          <div className="hidden md:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGroups.map((group, index) => (
              <div
                key={group._id}
                style={{ animationDelay: `${index * 100}ms` }}
                className="group animate-slide-in"
              >
                <Card 
                  className="h-full border-2 border-slate-200/50 hover:border-indigo-300 transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-500/20 hover:-translate-y-2 cursor-pointer overflow-hidden"
                  onClick={() => navigate(`/teacher/groups/${group._id}`)}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-purple-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <CardContent className="p-6 relative">
                    {/* Icon & Title */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                        <Users className="w-7 h-7 text-white" />
                      </div>
                      <div className="flex gap-1">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(group);
                          }}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Tahrirlash"
                        >
                          <Edit2 className="w-4 h-4 text-gray-600" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(group._id);
                          }}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                          title="O'chirish"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/teacher/groups/${group._id}`);
                          }}
                          className="p-2 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Ko'rish"
                        >
                          <ArrowRight className="w-5 h-5 text-indigo-600" />
                        </button>
                      </div>
                    </div>

                    {/* Group Info */}
                    <div className="mb-4">
                      <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors">
                        {group.name}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">
                          {group.classNumber}-sinf
                        </Badge>
                        <Badge className="bg-purple-100 text-purple-700 border-purple-200">
                          {group.letter}
                        </Badge>
                      </div>
                    </div>

                    {/* Subject */}
                    {group.subjectId && (
                      <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl mb-4">
                        <BookOpen className="w-4 h-4 text-slate-600" />
                        <span className="text-sm font-semibold text-slate-700">
                          {group.subjectId.nameUzb}
                        </span>
                      </div>
                    )}

                    {/* Stats */}
                    <div className="flex items-center gap-2 text-slate-600">
                      <GraduationCap className="w-4 h-4" />
                      <span className="text-sm font-medium">
                        {group.studentCount || 0} ta o'quvchi
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>

          {/* Mobile List View - Visible only on mobile */}
          <div className="md:hidden space-y-3">
            {filteredGroups.map((group, index) => (
              <div
                key={group._id}
                style={{ animationDelay: `${index * 50}ms` }}
                className="animate-slide-in"
              >
                <Card 
                  className="border-2 border-slate-200/50 hover:border-indigo-300 transition-all duration-200 active:scale-98 cursor-pointer overflow-hidden"
                  onClick={() => navigate(`/teacher/groups/${group._id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                        <Users className="w-6 h-6 text-white" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-slate-900 mb-1 truncate">
                          {group.name}
                        </h3>
                        
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 text-xs px-2 py-0.5">
                            {group.classNumber}-sinf
                          </Badge>
                          <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs px-2 py-0.5">
                            {group.letter}
                          </Badge>
                        </div>

                        {group.subjectId && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-600 mb-1">
                            <BookOpen className="w-3.5 h-3.5" />
                            <span className="font-medium truncate">{group.subjectId.nameUzb}</span>
                          </div>
                        )}

                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                          <GraduationCap className="w-3.5 h-3.5" />
                          <span>{group.studentCount || 0} ta o'quvchi</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(group);
                          }}
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Tahrirlash"
                        >
                          <Edit2 className="w-4 h-4 text-gray-600" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(group._id);
                          }}
                          className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                          title="O'chirish"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </>
      ) : (
        <Card className="border-2 border-slate-200/50">
          <CardContent className="py-16 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-slate-100 to-slate-200 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Users className="w-10 h-10 text-slate-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              {searchQuery ? 'Guruhlar topilmadi' : 'Sizga guruh biriktirilmagan'}
            </h3>
            <p className="text-slate-600 max-w-md mx-auto">
              {searchQuery 
                ? 'Qidiruv bo\'yicha hech narsa topilmadi. Boshqa so\'z bilan qidiring.'
                : 'Filial administratori sizga guruh biriktirishi kerak.'
              }
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
