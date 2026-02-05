import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/Dialog';
import { Checkbox } from '@/components/ui/Checkbox';
import { useToast } from '@/hooks/useToast';
import { Plus, BookOpen, Edit2, Trash2, CheckCircle2 } from 'lucide-react';
import { PageNavbar } from '@/components/ui/PageNavbar';
import { SkeletonCard } from '@/components/ui/SkeletonCard';

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingSubject, setEditingSubject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({ nameUzb: '', isMandatory: false });
  const { success, error } = useToast();
  const { hasPermission } = usePermissions();

  useEffect(() => {
    fetchSubjects();
  }, []);

  const fetchSubjects = async () => {
    try {
      const { data } = await api.get('/subjects');
      setSubjects(data);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingSubject) {
        await api.put(`/subjects/${editingSubject._id}`, formData);
        success('Fan muvaffaqiyatli yangilandi!');
      } else {
        await api.post('/subjects', formData);
        success('Fan muvaffaqiyatli qo\'shildi!');
      }
      setFormData({ nameUzb: '', isMandatory: false });
      setEditingSubject(null);
      setShowForm(false);
      fetchSubjects();
    } catch (err: any) {
      console.error('Error saving subject:', err);
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (subject: any) => {
    setEditingSubject(subject);
    setFormData({
      nameUzb: subject.nameUzb,
      isMandatory: subject.isMandatory
    });
    setShowForm(true);
  };

  const handleDelete = async (subjectId: string) => {
    if (!confirm('Fanni o\'chirmoqchimisiz?')) return;
    
    try {
      await api.delete(`/subjects/${subjectId}`);
      fetchSubjects();
      success('Fan o\'chirildi!');
    } catch (err: any) {
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingSubject(null);
    setFormData({ nameUzb: '', isMandatory: false });
  };

  // Фильтрация по поиску
  const filteredSubjects = subjects.filter(subject => {
    const searchLower = searchQuery.toLowerCase();
    return subject.nameUzb?.toLowerCase().includes(searchLower);
  });

  const mandatorySubjects = filteredSubjects.filter(s => s.isMandatory);
  const optionalSubjects = filteredSubjects.filter(s => !s.isMandatory);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageNavbar
          title="Fanlar"
          description="O'quv fanlarini boshqarish"
        />
        
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard variant="default" count={6} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-16 sm:pb-20">
      {/* Navbar */}
      <PageNavbar
        title="Fanlar"
        description="O'quv fanlarini boshqarish"
        badge={`${filteredSubjects.length} ta`}
        showSearch={true}
        searchPlaceholder="Fan nomi bo'yicha qidirish..."
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        showAddButton={hasPermission('create_subjects')}
        addButtonText="Fan qo'shish"
        onAddClick={() => setShowForm(true)}
      />

      <Dialog open={showForm} onClose={handleCloseForm}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" />
            {editingSubject ? 'Fanni tahrirlash' : 'Yangi fan'}
          </DialogTitle>
        </DialogHeader>
        <DialogContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Fan nomi"
              value={formData.nameUzb}
              onChange={(e) => setFormData({ ...formData, nameUzb: e.target.value })}
              required
              placeholder="Matematika"
            />
            
            <div className="p-4 bg-gray-50 rounded-lg">
              <Checkbox
                id="mandatory"
                label="Majburiy fan (barcha o'quvchilar uchun)"
                checked={formData.isMandatory}
                onChange={(e) => setFormData({ ...formData, isMandatory: e.target.checked })}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" loading={loading}>
                {editingSubject ? 'Yangilash' : 'Saqlash'}
              </Button>
              <Button type="button" variant="outline" onClick={handleCloseForm}>
                Bekor qilish
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {mandatorySubjects.length > 0 && (
        <div>
          <h2 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
            </div>
            Majburiy fanlar
          </h2>
          <div className="grid gap-3 sm:gap-4 lg:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {mandatorySubjects.map((subject) => (
              <Card key={subject._id} className="hover:shadow-xl transition-all hover:-translate-y-1">
                <CardContent className="p-4 sm:p-5 lg:p-6">
                  <div className="flex items-start justify-between mb-3 sm:mb-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 rounded-xl flex items-center justify-center">
                      <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                    </div>
                    {(hasPermission('edit_subjects') || hasPermission('delete_subjects')) && (
                      <div className="flex gap-1">
                        {hasPermission('edit_subjects') && (
                          <button 
                            onClick={() => handleEdit(subject)}
                            className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Tahrirlash"
                          >
                            <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600" />
                          </button>
                        )}
                        {hasPermission('delete_subjects') && (
                          <button 
                            onClick={() => handleDelete(subject._id)}
                            className="p-1.5 sm:p-2 hover:bg-red-50 rounded-lg transition-colors"
                            title="O'chirish"
                          >
                            <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-600" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2 sm:mb-3 line-clamp-2">{subject.nameUzb}</h3>
                  <span className="inline-block px-2.5 sm:px-3 py-0.5 sm:py-1 text-xs bg-green-100 text-green-700 rounded-full font-medium">
                    Majburiy
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {optionalSubjects.length > 0 && (
        <div>
          <h2 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
            </div>
            Ixtiyoriy fanlar
          </h2>
          <div className="grid gap-3 sm:gap-4 lg:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {optionalSubjects.map((subject) => (
              <Card key={subject._id} className="hover:shadow-xl transition-all hover:-translate-y-1">
                <CardContent className="p-4 sm:p-5 lg:p-6">
                  <div className="flex items-start justify-between mb-3 sm:mb-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                    </div>
                    {(hasPermission('edit_subjects') || hasPermission('delete_subjects')) && (
                      <div className="flex gap-1">
                        {hasPermission('edit_subjects') && (
                          <button 
                            onClick={() => handleEdit(subject)}
                            className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Tahrirlash"
                          >
                            <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600" />
                          </button>
                        )}
                        {hasPermission('delete_subjects') && (
                          <button 
                            onClick={() => handleDelete(subject._id)}
                            className="p-1.5 sm:p-2 hover:bg-red-50 rounded-lg transition-colors"
                            title="O'chirish"
                          >
                            <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-600" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2 sm:mb-3 line-clamp-2">{subject.nameUzb}</h3>
                  <span className="inline-block px-2.5 sm:px-3 py-0.5 sm:py-1 text-xs bg-blue-100 text-blue-700 rounded-full font-medium">
                    Ixtiyoriy
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {subjects.length === 0 && !showForm && (
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="py-12 sm:py-16 text-center px-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-100 rounded-2xl sm:rounded-3xl flex items-center justify-center mx-auto mb-4 sm:mb-6">
              <BookOpen className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">Fanlar yo'q</h3>
            <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6 max-w-md mx-auto">Birinchi fanni qo'shish uchun yuqoridagi tugmani bosing</p>
            {hasPermission('create_subjects') && (
              <Button onClick={() => setShowForm(true)} size="lg">
                <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                Fan qo'shish
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {filteredSubjects.length === 0 && searchQuery && (
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="py-12 sm:py-16 text-center px-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-100 rounded-2xl sm:rounded-3xl flex items-center justify-center mx-auto mb-4 sm:mb-6">
              <BookOpen className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">Fanlar topilmadi</h3>
            <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6 max-w-md mx-auto">
              Qidiruv bo'yicha hech narsa topilmadi. Boshqa so'z bilan qidiring.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
