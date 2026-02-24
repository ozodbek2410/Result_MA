import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Loading } from '@/components/ui/Loading';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/hooks/useToast';
import { usePermissions } from '@/hooks/usePermissions';
import { Building2, MapPin, Phone, Plus, Edit, Trash2 } from 'lucide-react';

interface Branch {
  _id: string;
  crmId?: number;
  name: string;
  location: string;
  address?: string;
  phone?: string;
  isActive: boolean;
  lastSyncedAt?: string;
}

export default function BranchesPage() {
  const { isSuperAdmin } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [editBranch, setEditBranch] = useState<Branch | null>(null);
  const [formData, setFormData] = useState({ name: '', location: '', phone: '' });

  const { data: branches, isLoading } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: async () => {
      const res = await api.get('/branches');
      return res.data;
    },
  });

  const openCreate = () => {
    setEditBranch(null);
    setFormData({ name: '', location: '', phone: '' });
    setShowModal(true);
  };

  const openEdit = (branch: Branch) => {
    setEditBranch(branch);
    setFormData({ name: branch.name, location: branch.location, phone: branch.phone || '' });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.location) {
      toast('Nomi va manzil majburiy', 'error');
      return;
    }
    try {
      if (editBranch) {
        await api.put(`/branches/${editBranch._id}`, formData);
        toast('Filial yangilandi', 'success');
      } else {
        await api.post('/branches', formData);
        toast('Filial yaratildi', 'success');
      }
      setShowModal(false);
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast(error.response?.data?.message || 'Xatolik', 'error');
    }
  };

  const handleDelete = async (branch: Branch) => {
    if (!confirm(`"${branch.name}" filialini o'chirmoqchimisiz?`)) return;
    try {
      await api.delete(`/branches/${branch._id}`);
      toast("Filial o'chirildi", 'success');
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    } catch {
      toast("O'chirishda xatolik", 'error');
    }
  };

  if (isLoading) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Filiallar"
        description="Filiallar ro'yxati — CRM va lokal"
        icon={Building2}
        actions={
          isSuperAdmin && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Yangi filial
            </button>
          )
        }
      />

      {!branches || branches.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Filiallar topilmadi"
          description="CRM sinxronizatsiyasini ishga tushiring yoki yangi filial qo'shing"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {branches.map((branch) => (
            <div
              key={branch._id}
              className="bg-white rounded-lg border border-gray-200 p-5 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-gray-900">{branch.name}</h3>
                <Badge variant={branch.isActive ? 'success' : 'secondary'} size="sm">
                  {branch.isActive ? 'Faol' : 'Nofaol'}
                </Badge>
              </div>

              <div className="space-y-2 text-sm text-gray-600">
                {branch.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span>{branch.location}</span>
                  </div>
                )}
                {branch.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span>{branch.phone}</span>
                  </div>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {branch.crmId ? (
                    <>
                      <Badge variant="info" size="sm">CRM #{branch.crmId}</Badge>
                      {branch.lastSyncedAt && (
                        <span className="text-xs text-gray-400">
                          {new Date(branch.lastSyncedAt).toLocaleDateString('uz-UZ')}
                        </span>
                      )}
                    </>
                  ) : (
                    <Badge variant="outline" size="sm">Lokal</Badge>
                  )}
                </div>

                {isSuperAdmin && !branch.crmId && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(branch)}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors"
                      title="Tahrirlash"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(branch)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                      title="O'chirish"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title={editBranch ? 'Filialni tahrirlash' : 'Yangi filial'}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Filial nomi</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Masalan: Chilonzor filiali"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Manzil</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Shahar, tuman"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+998 90 000 00 00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Bekor qilish
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                {editBranch ? 'Saqlash' : 'Yaratish'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
