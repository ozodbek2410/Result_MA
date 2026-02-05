import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/Dialog';
import { useToast } from '@/hooks/useToast';
import StudentProfileModal from '@/components/StudentProfileModal';
import { 
  GraduationCap, 
  Search, 
  Plus,
  Phone,
  Users,
  Edit2,
  Trash2
} from 'lucide-react';

export default function MyStudentsPage() {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    fullName: '',
    phone: '',
    parentPhone: ''
  });
  const { success, error } = useToast();

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/teacher/my-students');
      setStudents(data);
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.username || !formData.password || !formData.fullName) {
      error('Login, parol va F.I.Sh majburiy');
      return;
    }

    try {
      await api.post('/teacher/students', formData);
      success('O\'quvchi muvaffaqiyatli yaratildi!');
      setShowForm(false);
      setFormData({ username: '', password: '', fullName: '', phone: '', parentPhone: '' });
      fetchStudents();
    } catch (err: any) {
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  const filteredStudents = students.filter(student =>
    student.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.username?.toLowerCase().includes(searchQuery.toLowerCase())
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
    <div className="space-y-4 sm:space-y-6 lg:space-y-8 animate-fade-in pb-24 sm:pb-24">
      {/* Header */}
      <div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-green-500/30 flex-shrink-0">
              <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900 truncate">Mening o'quvchilarim</h1>
              <p className="text-xs sm:text-sm text-slate-600 truncate hidden sm:block">Guruhlarimga biriktirilgan o'quvchilar</p>
            </div>
          </div>
          <Button onClick={() => setShowForm(true)} className="gap-2 bg-green-600 hover:bg-green-700 w-full sm:w-auto flex-shrink-0">
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden xs:inline">O'quvchi qo'shish</span>
            <span className="xs:hidden">Qo'shish</span>
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
          <input
            type="text"
            placeholder="O'quvchi qidirish..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 sm:pl-12 pr-3 sm:pr-4 py-2.5 sm:py-3 bg-white border-2 border-slate-200 rounded-xl sm:rounded-2xl focus:outline-none focus:border-green-500 transition-colors text-sm sm:text-base text-slate-900 placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Create Student Dialog */}
      <Dialog open={showForm} onClose={() => setShowForm(false)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-green-600" />
            Yangi o'quvchi qo'shish
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
            
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Login"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
                placeholder="student123"
              />
              <Input
                label="Parol"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                placeholder="********"
              />
            </div>

            <PhoneInput
              label="Telefon"
              value={formData.phone}
              onChange={(value) => setFormData({ ...formData, phone: value })}
            />

            <PhoneInput
              label="Ota-ona telefoni"
              value={formData.parentPhone}
              onChange={(value) => setFormData({ ...formData, parentPhone: value })}
            />

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-800">
                💡 <strong>Eslatma:</strong> O'quvchi avtomatik ravishda sizning filialingizga biriktiriladi
              </p>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" className="bg-green-600 hover:bg-green-700">Saqlash</Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Bekor qilish
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Students Grid - Desktop / List - Mobile */}
      {filteredStudents.length > 0 ? (
        <>
          {/* Desktop Grid View */}
          <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
            {filteredStudents.map((student, index) => (
              <div
                key={student._id}
                style={{ animationDelay: `${index * 100}ms` }}
                className="group animate-slide-in"
                onClick={() => setSelectedStudentId(student._id)}
              >
                <Card className="h-full border-2 border-slate-200/50 hover:border-green-300 transition-all duration-300 hover:shadow-2xl hover:shadow-green-500/20 hover:-translate-y-2 cursor-pointer">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-50 to-emerald-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <CardContent className="p-6 relative">
                    {/* Icon & Name */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                        <GraduationCap className="w-7 h-7 text-white" />
                      </div>
                    </div>

                    {/* Student Info */}
                    <div className="mb-4">
                      <h3 className="text-xl font-bold text-slate-900 mb-1 group-hover:text-green-600 transition-colors">
                        {student.fullName}
                      </h3>
                      <p className="text-sm text-slate-600">@{student.username}</p>
                    </div>

                    {/* Contact Info */}
                    <div className="space-y-2">
                      {student.phone && (
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Phone className="w-4 h-4" />
                          <span>{student.phone}</span>
                        </div>
                      )}
                      {student.parentPhone && (
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Phone className="w-4 h-4 text-orange-500" />
                          <span>Ota-ona: {student.parentPhone}</span>
                        </div>
                      )}
                    </div>

                    {/* Groups */}
                    {student.groups && student.groups.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-200">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Users className="w-4 h-4" />
                          <span>{student.groups.length} ta guruhda</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>

          {/* Mobile List View */}
          <div className="md:hidden space-y-3">
            {filteredStudents.map((student, index) => (
              <div
                key={student._id}
                style={{ animationDelay: `${index * 50}ms` }}
                className="animate-slide-in"
                onClick={() => setSelectedStudentId(student._id)}
              >
                <Card className="border-2 border-slate-200/50 hover:border-green-300 transition-all duration-200 active:scale-98 cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                        <GraduationCap className="w-6 h-6 text-white" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-slate-900 mb-0.5 truncate">
                          {student.fullName}
                        </h3>
                        <p className="text-xs text-slate-600 mb-2">@{student.username}</p>

                        {/* Contact Info */}
                        <div className="space-y-1">
                          {student.phone && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-600">
                              <Phone className="w-3.5 h-3.5" />
                              <span>{student.phone}</span>
                            </div>
                          )}
                          {student.parentPhone && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-600">
                              <Phone className="w-3.5 h-3.5 text-orange-500" />
                              <span className="truncate">Ota-ona: {student.parentPhone}</span>
                            </div>
                          )}
                          {student.groups && student.groups.length > 0 && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-600">
                              <Users className="w-3.5 h-3.5" />
                              <span>{student.groups.length} ta guruhda</span>
                            </div>
                          )}
                        </div>
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
              <GraduationCap className="w-10 h-10 text-slate-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              {searchQuery ? 'O\'quvchilar topilmadi' : 'Sizda o\'quvchilar yo\'q'}
            </h3>
            <p className="text-slate-600 max-w-md mx-auto mb-6">
              {searchQuery 
                ? 'Qidiruv bo\'yicha hech narsa topilmadi. Boshqa so\'z bilan qidiring.'
                : 'Yangi o\'quvchi qo\'shish uchun yuqoridagi tugmani bosing.'
              }
            </p>
            {!searchQuery && (
              <Button onClick={() => setShowForm(true)} className="bg-green-600 hover:bg-green-700">
                <Plus className="w-5 h-5 mr-2" />
                O'quvchi qo'shish
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Student Profile Modal */}
      <StudentProfileModal 
        studentId={selectedStudentId} 
        onClose={() => setSelectedStudentId(null)} 
      />
    </div>
  );
}
