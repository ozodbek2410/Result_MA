import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { 
  Plus, 
  ClipboardList,
  Edit2,
  Trash2,
  Calendar,
  Users,
  Search,
  ArrowRight
} from 'lucide-react';

const assignmentTypeLabels: Record<string, string> = {
  yozma_ish: 'Yozma ish',
  diktant: 'Diktant',
  ogzaki: 'Og\'zaki',
  savol_javob: 'Savol-javob',
  yopiq_test: 'Yopiq test'
};

const assignmentTypeColors: Record<string, { bg: string, text: string, border: string }> = {
  yozma_ish: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  diktant: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  ogzaki: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' },
  savol_javob: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' },
  yopiq_test: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' }
};

export default function AssignmentsPage() {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchAssignments();
  }, []);

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/assignments');
      setAssignments(data);
    } catch (error) {
      console.error('Error fetching assignments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Topshiriqni o\'chirmoqchimisiz?')) return;
    
    try {
      await api.delete(`/assignments/${id}`);
      fetchAssignments();
    } catch (error) {
      console.error('Error deleting assignment:', error);
      alert('Topshiriqni o\'chirishda xatolik yuz berdi');
    }
  };

  const filteredAssignments = assignments.filter(assignment =>
    assignment.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    assignment.groupId?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-6 animate-fade-in pb-16 sm:pb-20">
        <div className="animate-pulse">
          <div className="h-10 sm:h-12 w-48 sm:w-64 bg-slate-200 rounded-xl sm:rounded-2xl mb-2 sm:mb-3"></div>
          <div className="h-5 sm:h-6 w-64 sm:w-96 bg-slate-200 rounded-lg sm:rounded-xl"></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 sm:h-52 lg:h-56 bg-slate-200 rounded-2xl sm:rounded-3xl animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8 animate-fade-in pb-24 sm:pb-24">
      {/* Header */}
      <div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/30">
              <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900">Topshiriqlar</h1>
              <p className="text-xs sm:text-sm text-slate-600 hidden sm:block">Topshiriqlarni yaratish va boshqarish</p>
            </div>
          </div>
          <Button 
            size="lg"
            onClick={() => navigate('/teacher/assignments/create')}
            className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 shadow-lg shadow-orange-500/30 w-full sm:w-auto"
          >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
            <span className="hidden xs:inline">Topshiriq qo'shish</span>
            <span className="xs:hidden">Qo'shish</span>
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Topshiriq yoki guruh bo'yicha qidirish..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 sm:pl-12 pr-3 sm:pr-4 py-2.5 sm:py-3 bg-white border-2 border-slate-200 rounded-xl sm:rounded-2xl focus:outline-none focus:border-orange-500 transition-colors text-sm sm:text-base text-slate-900 placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Assignments Grid */}
      {filteredAssignments.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          {filteredAssignments.map((assignment, index) => {
            const typeColor = assignmentTypeColors[assignment.type] || assignmentTypeColors.yozma_ish;
            return (
              <div
                key={assignment._id}
                style={{ animationDelay: `${index * 100}ms` }}
                className="group animate-slide-in"
              >
                <Card 
                  className="h-full border-2 border-slate-200/50 hover:border-orange-300 transition-all duration-300 hover:shadow-2xl hover:shadow-orange-500/20 hover:-translate-y-2 cursor-pointer overflow-hidden"
                  onClick={() => navigate(`/teacher/assignments/${assignment._id}`)}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-50 to-red-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <CardContent className="p-4 sm:p-5 lg:p-6 relative">
                    {/* Icon & Actions */}
                    <div className="flex items-start justify-between mb-3 sm:mb-4">
                      <div className="w-11 h-11 sm:w-12 sm:h-12 lg:w-14 lg:h-14 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                        <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" />
                      </div>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => navigate(`/teacher/assignments/edit/${assignment._id}`)}
                          className="p-1.5 sm:p-2 hover:bg-blue-100 rounded-lg sm:rounded-xl transition-colors touch-target"
                          title="Tahrirlash"
                        >
                          <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600" />
                        </button>
                        <button
                          onClick={() => handleDelete(assignment._id)}
                          className="p-1.5 sm:p-2 hover:bg-red-100 rounded-lg sm:rounded-xl transition-colors touch-target"
                          title="O'chirish"
                        >
                          <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-600" />
                        </button>
                      </div>
                    </div>

                    {/* Assignment Info */}
                    <div className="mb-3 sm:mb-4">
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-2 sm:mb-3 group-hover:text-orange-600 transition-colors line-clamp-2">
                        {assignment.title}
                      </h3>
                      <Badge className={`${typeColor.bg} ${typeColor.text} ${typeColor.border} border text-xs sm:text-sm`}>
                        {assignmentTypeLabels[assignment.type]}
                      </Badge>
                    </div>

                    {/* Group & Date */}
                    <div className="space-y-2 mb-3 sm:mb-4">
                      {assignment.groupId && (
                        <div className="flex items-center gap-2 p-2 sm:p-3 bg-slate-50 rounded-lg sm:rounded-xl">
                          <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600 flex-shrink-0" />
                          <span className="text-xs sm:text-sm font-semibold text-slate-700 truncate">
                            {assignment.groupId.name}
                          </span>
                        </div>
                      )}
                      {assignment.dueDate && (
                        <div className="flex items-center gap-2 text-slate-600">
                          <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                          <span className="text-xs sm:text-sm font-medium">
                            {new Date(assignment.dueDate).toLocaleDateString('uz-UZ', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric'
                            })}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Arrow */}
                    <div className="flex justify-end pt-3 sm:pt-4 border-t border-slate-200">
                      <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 group-hover:text-orange-600 group-hover:translate-x-1 transition-all" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="border-2 border-slate-200/50">
          <CardContent className="py-12 sm:py-16 text-center px-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl sm:rounded-3xl flex items-center justify-center mx-auto mb-4 sm:mb-6">
              <ClipboardList className="w-8 h-8 sm:w-10 sm:h-10 text-slate-400" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">
              {searchQuery ? 'Topshiriqlar topilmadi' : 'Topshiriqlar yo\'q'}
            </h3>
            <p className="text-sm sm:text-base text-slate-600 mb-4 sm:mb-6 max-w-md mx-auto">
              {searchQuery 
                ? 'Qidiruv bo\'yicha hech narsa topilmadi. Boshqa so\'z bilan qidiring.'
                : 'Birinchi topshiriqni yaratish uchun yuqoridagi tugmani bosing'
              }
            </p>
            {!searchQuery && (
              <Button 
                size="lg"
                onClick={() => navigate('/teacher/assignments/create')}
                className="bg-gradient-to-r from-orange-500 to-red-600"
              >
                <Plus className="w-5 h-5 mr-2" />
                Topshiriq qo'shish
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
