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
import { UserCog, Plus, Search, Edit, Trash2, Key } from 'lucide-react';

interface BranchItem {
  _id: string;
  name: string;
}

interface SubjectItem {
  _id: string;
  nameUzb: string;
}

interface UserItem {
  _id: string;
  crmId?: number;
  username: string;
  fullName?: string;
  phone?: string;
  role: string;
  branchId?: { _id: string; name: string };
  teacherSubjects?: Array<{ _id: string; nameUzb: string }>;
  isActive: boolean;
  lastSyncedAt?: string;
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  FIL_ADMIN: 'Filial Admin',
  TEACHER: 'O\'qituvchi',
  METHODIST: 'Metodist',
  STUDENT: 'O\'quvchi',
};

const ROLE_VARIANTS: Record<string, 'danger' | 'warning' | 'info' | 'purple' | 'secondary'> = {
  SUPER_ADMIN: 'danger',
  FIL_ADMIN: 'warning',
  TEACHER: 'info',
  METHODIST: 'purple',
  STUDENT: 'secondary',
};

// Creatable roles (no SUPER_ADMIN)
const CREATABLE_ROLES = [
  { value: 'FIL_ADMIN', label: 'Filial Admin' },
  { value: 'TEACHER', label: 'O\'qituvchi' },
  { value: 'METHODIST', label: 'Metodist' },
];

export default function UsersPage() {
  const { isSuperAdmin, isAdmin } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  // Create/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<UserItem | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    fullName: '',
    phone: '',
    role: 'TEACHER',
    branchId: '',
    teacherSubjects: [] as string[],
  });

  // Credential assignment modal
  const [showCredentialModal, setShowCredentialModal] = useState(false);
  const [credentialUser, setCredentialUser] = useState<UserItem | null>(null);
  const [credentialData, setCredentialData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
  });

  const { data: users, isLoading } = useQuery<UserItem[]>({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const res = await api.get('/users');
      return res.data;
    },
  });

  const { data: branches } = useQuery<BranchItem[]>({
    queryKey: ['branches'],
    queryFn: async () => {
      const res = await api.get('/branches');
      return res.data;
    },
  });

  const { data: subjects } = useQuery<SubjectItem[]>({
    queryKey: ['subjects'],
    queryFn: async () => {
      const res = await api.get('/subjects');
      return res.data;
    },
  });

  const filteredUsers = users?.filter(u => {
    if (search) {
      const s = search.toLowerCase();
      if (!u.username.toLowerCase().includes(s) &&
          !u.fullName?.toLowerCase().includes(s)) return false;
    }
    if (roleFilter && u.role !== roleFilter) return false;
    return true;
  }) || [];

  const openCreate = () => {
    setEditUser(null);
    setFormData({ username: '', password: '', fullName: '', phone: '', role: 'TEACHER', branchId: '', teacherSubjects: [] });
    setShowModal(true);
  };

  const openEdit = (user: UserItem) => {
    setEditUser(user);
    setFormData({
      username: user.username,
      password: '',
      fullName: user.fullName || '',
      phone: user.phone || '',
      role: user.role,
      branchId: typeof user.branchId === 'object' ? user.branchId?._id || '' : '',
      teacherSubjects: user.teacherSubjects?.map(s => s._id) || [],
    });
    setShowModal(true);
  };

  const openCredentialModal = (user: UserItem) => {
    setCredentialUser(user);
    setCredentialData({
      username: user.username || '',
      password: '',
      confirmPassword: '',
    });
    setShowCredentialModal(true);
  };

  const handleSave = async () => {
    try {
      if (editUser) {
        const updateData: Record<string, unknown> = {
          fullName: formData.fullName,
          phone: formData.phone,
          role: formData.role,
        };
        if (formData.password) updateData.password = formData.password;
        if (formData.role === 'TEACHER') updateData.teacherSubjects = formData.teacherSubjects;
        await api.put(`/users/${editUser._id}`, updateData);
        toast('Foydalanuvchi yangilandi', 'success');
      } else {
        const createData: Record<string, unknown> = { ...formData };
        if (formData.role !== 'TEACHER') delete createData.teacherSubjects;
        await api.post('/users', createData);
        toast('Foydalanuvchi yaratildi', 'success');
      }
      setShowModal(false);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast(error.response?.data?.message || 'Xatolik', 'error');
    }
  };

  const handleCredentialSave = async () => {
    if (!credentialUser) return;
    if (!credentialData.username || !credentialData.password) {
      toast('Login va parol majburiy', 'error');
      return;
    }
    if (credentialData.password !== credentialData.confirmPassword) {
      toast('Parollar mos kelmadi', 'error');
      return;
    }
    if (credentialData.password.length < 4) {
      toast('Parol kamida 4 belgidan iborat bo\'lishi kerak', 'error');
      return;
    }
    try {
      await api.patch(`/teachers/${credentialUser._id}/credentials`, {
        username: credentialData.username,
        password: credentialData.password,
      });
      toast('Login va parol tayinlandi', 'success');
      setShowCredentialModal(false);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast(error.response?.data?.message || 'Xatolik', 'error');
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Rostdan o\'chirmoqchimisiz?')) return;
    try {
      await api.delete(`/users/${userId}`);
      toast('Foydalanuvchi o\'chirildi', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } catch {
      toast('O\'chirishda xatolik', 'error');
    }
  };

  // Check if CRM teacher has auto-generated username (pattern: name_crmId)
  const isAutoGenUsername = (user: UserItem): boolean => {
    if (!user.crmId) return false;
    return user.username.endsWith(`_${user.crmId}`);
  };

  if (isLoading) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Foydalanuvchilar"
        description="Tizim foydalanuvchilari va CRM dan sinxronlangan o'qituvchilar"
        icon={UserCog}
        actions={
          isAdmin && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Yangi foydalanuvchi
            </button>
          )
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Qidirish..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Barcha rollar</option>
          <option value="SUPER_ADMIN">Super Admin</option>
          <option value="FIL_ADMIN">Filial Admin</option>
          <option value="TEACHER">O'qituvchi</option>
          <option value="METHODIST">Metodist</option>
        </select>
      </div>

      {filteredUsers.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="Foydalanuvchilar topilmadi"
          description="Qidiruv natijasi bo'sh"
        />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Foydalanuvchi</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rol</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Filial</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Holat</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Manba</th>
                  {isAdmin && <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amallar</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredUsers.map((user) => (
                  <tr key={user._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">{user.fullName || user.username}</p>
                        <p className="text-sm text-gray-500">{user.username}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={ROLE_VARIANTS[user.role] || 'secondary'} size="sm">
                        {ROLE_LABELS[user.role] || user.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {typeof user.branchId === 'object' && user.branchId?.name ? user.branchId.name : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={user.isActive ? 'success' : 'secondary'} size="sm">
                        {user.isActive ? 'Faol' : 'Nofaol'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {user.crmId ? (
                          <Badge variant="info" size="sm">CRM</Badge>
                        ) : (
                          <Badge variant="outline" size="sm">Lokal</Badge>
                        )}
                        {user.crmId && isAutoGenUsername(user) && (
                          <Badge variant="warning" size="sm">Kirish yo'q</Badge>
                        )}
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {user.crmId ? (
                            // CRM user: only credential assignment
                            <button
                              onClick={() => openCredentialModal(user)}
                              className="p-1.5 text-gray-400 hover:text-amber-600 rounded-lg hover:bg-amber-50 transition-colors"
                              title="Login tayinlash"
                            >
                              <Key className="w-4 h-4" />
                            </button>
                          ) : (
                            // Local user: edit + delete
                            <>
                              <button
                                onClick={() => openEdit(user)}
                                className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors"
                                title="Tahrirlash"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              {isSuperAdmin && user.role !== 'SUPER_ADMIN' && (
                                <button
                                  onClick={() => handleDelete(user._id)}
                                  className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                                  title="O'chirish"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <Modal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title={editUser ? 'Foydalanuvchini tahrirlash' : 'Yangi foydalanuvchi'}
        >
          <div className="space-y-4">
            {!editUser && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Login</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {editUser ? 'Yangi parol (bo\'sh qoldiring)' : 'Parol'}
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To'liq ism</label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                disabled={!!editUser?.crmId}
              >
                {CREATABLE_ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* Branch selector (SUPER_ADMIN only — FIL_ADMIN auto-fills) */}
            {isSuperAdmin && !editUser && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Filial</label>
                <select
                  value={formData.branchId}
                  onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Filialni tanlang</option>
                  {branches?.map(b => (
                    <option key={b._id} value={b._id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Subjects multi-select for TEACHER role */}
            {formData.role === 'TEACHER' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fanlar</label>
                <div className="border border-gray-300 rounded-lg p-2 max-h-40 overflow-y-auto space-y-1">
                  {subjects?.map(s => (
                    <label key={s._id} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.teacherSubjects.includes(s._id)}
                        onChange={(e) => {
                          const updated = e.target.checked
                            ? [...formData.teacherSubjects, s._id]
                            : formData.teacherSubjects.filter(id => id !== s._id);
                          setFormData({ ...formData, teacherSubjects: updated });
                        }}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm">{s.nameUzb}</span>
                    </label>
                  ))}
                  {(!subjects || subjects.length === 0) && (
                    <p className="text-sm text-gray-400 px-2">Fanlar topilmadi</p>
                  )}
                </div>
              </div>
            )}

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
                {editUser ? 'Saqlash' : 'Yaratish'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Credential Assignment Modal */}
      {showCredentialModal && credentialUser && (
        <Modal
          isOpen={showCredentialModal}
          onClose={() => setShowCredentialModal(false)}
          title="Login va parol tayinlash"
        >
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800">
                <strong>{credentialUser.fullName}</strong> uchun login va parol tayinlash.
                Bu CRM dan kelgan o'qituvchi — faqat kirish ma'lumotlarini o'zgartirish mumkin.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Login</label>
              <input
                type="text"
                value={credentialData.username}
                onChange={(e) => setCredentialData({ ...credentialData, username: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parol</label>
              <input
                type="password"
                value={credentialData.password}
                onChange={(e) => setCredentialData({ ...credentialData, password: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                placeholder="Kamida 4 belgi"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parolni tasdiqlash</label>
              <input
                type="password"
                value={credentialData.confirmPassword}
                onChange={(e) => setCredentialData({ ...credentialData, confirmPassword: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setShowCredentialModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Bekor qilish
              </button>
              <button
                onClick={handleCredentialSave}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
              >
                Tayinlash
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
