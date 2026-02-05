import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/Dialog';
import { useToast } from '@/hooks/useToast';
import { Plus, Building2, MapPin, Calendar, Edit2, Trash2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { PageNavbar } from '@/components/ui/PageNavbar';
import { SkeletonCard } from '@/components/ui/SkeletonCard';

export default function BranchesPage() {
  const [branches, setBranches] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({ name: '', location: '' });
  const { success, error } = useToast();

  useEffect(() => {
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    try {
      const { data } = await api.get('/branches');
      setBranches(data);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/branches', formData);
      setFormData({ name: '', location: '' });
      setShowForm(false);
      fetchBranches();
      success('Filial muvaffaqiyatli qo\'shildi!');
    } catch (err) {
      error('Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  const filteredBranches = branches.filter(branch =>
    branch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    branch.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <PageNavbar
          title="Filiallar"
          description="Barcha filiallarni boshqarish"
        />
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <SkeletonCard variant="stats" count={3} />
        </div>
        
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard variant="default" count={6} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* Navbar */}
      <PageNavbar
        title="Filiallar"
        description="Barcha filiallarni boshqarish"
        showSearch={true}
        searchPlaceholder="Filial yoki manzil bo'yicha qidirish..."
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        showAddButton={true}
        addButtonText="Filial qo'shish"
        onAddClick={() => setShowForm(true)}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
              </div>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-gray-600 font-medium mb-1">Jami filiallar</p>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900">{branches.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-50 rounded-xl flex items-center justify-center">
                <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
              </div>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-gray-600 font-medium mb-1">Faol filiallar</p>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900">{branches.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-purple-50 rounded-xl flex items-center justify-center">
                <Plus className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
              </div>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-gray-600 font-medium mb-1">Yangi (bu oy)</p>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900">0</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialog */}
      <Dialog open={showForm} onClose={() => setShowForm(false)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            Yangi filial qo'shish
          </DialogTitle>
        </DialogHeader>
        <DialogContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Filial nomi"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="Markaziy filial"
              helperText="Filialning to'liq nomini kiriting"
            />
            <Input
              label="Manzil"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              required
              placeholder="Toshkent, Chilonzor tumani"
              helperText="Filialning to'liq manzilini kiriting"
            />
            <div className="flex gap-3 pt-4">
              <Button type="submit" loading={loading} className="flex-1">
                Saqlash
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1">
                Bekor qilish
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Branches Grid */}
      {filteredBranches.length > 0 ? (
        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filteredBranches.map((branch, index) => (
            <Card 
              key={branch._id} 
              className="hover:shadow-xl transition-all hover:-translate-y-1"
            >
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-start justify-between mb-3 sm:mb-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                    <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <div className="flex gap-1">
                    <button className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors">
                      <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600" />
                    </button>
                    <button className="p-1.5 sm:p-2 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-600" />
                    </button>
                  </div>
                </div>
                
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2 sm:mb-3 line-clamp-2">{branch.name}</h3>
                
                <div className="space-y-2 sm:space-y-2.5 mb-3 sm:mb-4">
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
                    <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                    <span className="line-clamp-1">{branch.location}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
                    <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                    <span>{new Date(branch.createdAt).toLocaleDateString('uz-UZ')}</span>
                  </div>
                </div>

                <div className="pt-3 sm:pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs sm:text-sm text-gray-600">Status:</span>
                    <Badge variant="success" size="sm">
                      Faol
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="py-16 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Building2 className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {searchQuery ? 'Filiallar topilmadi' : 'Filiallar yo\'q'}
            </h3>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              {searchQuery 
                ? 'Qidiruv bo\'yicha hech narsa topilmadi. Boshqa so\'z bilan qidiring.'
                : 'Birinchi filialni qo\'shish uchun yuqoridagi tugmani bosing'
              }
            </p>
            {!searchQuery && (
              <Button onClick={() => setShowForm(true)} size="lg">
                <Plus className="w-5 h-5 mr-2" />
                Filial qo'shish
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
