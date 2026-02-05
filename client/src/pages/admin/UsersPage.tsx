import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Select } from '@/components/ui/Select';
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/hooks/useToast';
import { Plus, Shield, User, Edit2, Trash2 } from 'lucide-react';
import { PageNavbar } from '@/components/ui/PageNavbar';
import { SkeletonCard } from '@/components/ui/SkeletonCard';

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: '',
    branchId: '',
    phone: '',
    fullName: '',
    parentPhone: ''
  });
  const { success, error } = useToast();

  useEffect(() => {
    fetchUsers();
    fetchBranches();
    fetchRoles();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data } = await api.get('/users');
      setUsers(data);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      error(err.response?.data?.message || 'Foydalanuvchilarni yuklashda xatolik');
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      const { data } = await api.get('/branches');
      setBranches(data);
    } catch (err) {
      console.error('Error fetching branches');
    }
  };

  const fetchRoles = async () => {
    try {
      const { data } = await api.get('/roles');
      console.log('Fetched roles:', data);
      // Tizim rollarini birinchi qo'yish
      const sortedRoles = data.sort((a: any, b: any) => {
        if (a.isSystem && !b.isSystem) return -1;
        if (!a.isSystem && b.isSystem) return 1;
        return 0;
      });
      setRoles(sortedRoles);
      // Agar formData'da rol bo'lmasa, birinchi rolni tanlash
      if (sortedRoles.length > 0 && !formData.role) {
        console.log('Setting default role:', sortedRoles[0].name);
        setFormData(prev => ({ ...prev, role: sortedRoles[0].name }));
      }
    } catch (err) {
      console.error('Error fetching roles');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('Form data before submit:', formData);
    console.log('Available roles:', roles);
    console.log('Selected role:', formData.role);
    console.log('Is role valid?', roles.some(r => r.name === formData.role));
    
    // Agar rol noto'g'ri bo'lsa, birinchi rolni tanlash
    if (!formData.role || !roles.some(r => r.name === formData.role)) {
      const defaultRole = roles[0]?.name;
      console.warn('Invalid role detected, setting to:', defaultRole);
      setFormData(prev => ({ ...prev, role: defaultRole }));
      error('Iltimos, to\'g\'ri rol tanlang');
      return;
    }
    
    // Для учеников логин и пароль не требуются
    if (formData.role !== 'STUDENT') {
      if (!formData.username || (!editingUser && !formData.password)) {
        error('Login va parol majburiy');
        return;
      }
    }
    
    // Super Admin uchun filial majburiy emas
    if (formData.role !== 'SUPER_ADMIN' && !formData.branchId) {
      error('Filial tanlang');
      return;
    }
    
    if (formData.role === 'TEACHER' && !formData.fullName) {
      error('F.I.Sh majburiy (o\'qituvchi uchun)');
      return;
    }
    
    if (formData.role === 'STUDENT' && !formData.fullName) {
      error('F.I.Sh majburiy (o\'quvchi uchun)');
      return;
    }
    
    if (formData.role === 'STUDENT' && !formData.phone) {
      error('Telefon majburiy (o\'quvchi uchun)');
      return;
    }
    
    if (formData.role === 'STUDENT' && !formData.parentPhone) {
      error('Ota-ona telefoni majburiy (o\'quvchi uchun)');
      return;
    }
    
    setLoading(true);
    try {
      if (editingUser) {
        await api.put(`/users/${editingUser._id}`, formData);
        success('Foydalanuvchi muvaffaqiyatli yangilandi!');
      } else {
        await api.post('/users', formData);
        success('Foydalanuvchi muvaffaqiyatli yaratildi!');
      }
      setFormData({ username: '', password: '', role: roles[0]?.name || '', branchId: '', phone: '', fullName: '', parentPhone: '' });
      setEditingUser(null);
      setShowForm(false);
      fetchUsers();
    } catch (err: any) {
      console.error('Error saving user:', err);
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (user: any) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      role: user.role,
      branchId: user.branchId?._id || '',
      phone: user.phone || '',
      fullName: user.fullName || '',
      parentPhone: user.parentPhone || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Foydalanuvchini o\'chirmoqchimisiz?')) return;
    
    try {
      console.log('Удаление пользователя:', userId);
      const response = await api.delete(`/users/${userId}`);
      console.log('Ответ сервера:', response.data);
      await fetchUsers();
      success('Foydalanuvchi o\'chirildi!');
    } catch (err: any) {
      console.error('Error deleting user:', err);
      console.error('Error response:', err.response?.data);
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingUser(null);
    setFormData({ username: '', password: '', role: roles[0]?.name || '', branchId: '', phone: '', fullName: '', parentPhone: '' });
  };

  const getRoleBadge = (role: string) => {
    const roleObj = roles.find(r => r.name === role);
    const displayName = roleObj?.displayName || role;
    
    switch (role) {
      case 'SUPER_ADMIN':
        return <Badge variant="danger">{displayName}</Badge>;
      case 'FIL_ADMIN':
        return <Badge variant="info">{displayName}</Badge>;
      case 'TEACHER':
        return <Badge variant="success">{displayName}</Badge>;
      default:
        return <Badge>{displayName}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageNavbar
          title="Foydalanuvchilar"
          description="Tizim foydalanuvchilarini boshqarish"
        />
        
        <div className="grid gap-6">
          <SkeletonCard variant="list" count={5} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-16 sm:pb-20">
      {/* Navbar */}
      <PageNavbar
        title="Foydalanuvchilar"
        description="Tizim foydalanuvchilarini boshqarish"
        showAddButton={true}
        addButtonText="Foydalanuvchi qo'shish"
        onAddClick={() => {
          const defaultRole = roles.length > 0 ? roles[0].name : '';
          console.log('Opening form with default role:', defaultRole);
          setFormData({ 
            username: '', 
            password: '', 
            role: defaultRole, 
            branchId: '', 
            phone: '', 
            fullName: '',
            parentPhone: ''
          });
          setEditingUser(null);
          setShowForm(true);
        }}
      />

      <Dialog open={showForm} onClose={handleCloseForm}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-6 h-6 text-primary" />
            {editingUser ? 'Foydalanuvchini tahrirlash' : 'Yangi foydalanuvchi'}
          </DialogTitle>
        </DialogHeader>
        <DialogContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {formData.role !== 'STUDENT' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Login"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                  placeholder="username"
                />
                <Input
                  label="Parol"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required={!editingUser}
                  placeholder={editingUser ? "Bo'sh qoldiring (o'zgartirmaslik uchun)" : "********"}
                />
              </div>
            )}
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Rol"
                value={formData.role}
                onChange={(e) => {
                  console.log('Role changed to:', e.target.value);
                  const newRole = e.target.value;
                  setFormData({ 
                    ...formData, 
                    role: newRole,
                    // Автоматически выбираем филиал при выборе STUDENT
                    ...(newRole === 'STUDENT' ? { branchId: formData.branchId || branches[0]?._id || '' } : {})
                  });
                }}
                required
              >
                {roles.length === 0 && <option value="">Yuklanmoqda...</option>}
                {roles.map((role) => (
                  <option key={role._id} value={role.name}>
                    {role.displayName} ({role.name})
                  </option>
                ))}
                <option value="STUDENT">O'quvchi (STUDENT)</option>
              </Select>
              
              <Select
                label="Filial"
                value={formData.branchId}
                onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                required={formData.role !== 'SUPER_ADMIN'}
              >
                <option value="">Tanlang</option>
                {branches.map((b) => (
                  <option key={b._id} value={b._id}>{b.name}</option>
                ))}
              </Select>
            </div>

            {formData.role === 'SUPER_ADMIN' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900 font-medium mb-1">
                  ℹ️ Ma'lumot
                </p>
                <p className="text-sm text-blue-700">
                  Super Admin uchun filial va telefon raqami ixtiyoriy
                </p>
              </div>
            )}

            {formData.role === 'TEACHER' && formData.branchId && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm text-amber-900 font-medium mb-1">
                  ⚠️ Diqqat
                </p>
                <p className="text-sm text-amber-700">
                  O'qituvchi faqat tanlangan filial adminiga ko'rinadi: <strong>{branches.find(b => b._id === formData.branchId)?.name}</strong>
                </p>
              </div>
            )}

            {formData.role === 'TEACHER' && (
              <Input
                label="F.I.Sh"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                required
                placeholder="Aliyev Ali Alijon o'g'li"
              />
            )}

            {formData.role === 'STUDENT' && (
              <>
                <Input
                  label="F.I.Sh"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  required
                  placeholder="Aliyev Ali Alijon o'g'li"
                />
                <PhoneInput
                  label="Telefon"
                  value={formData.phone}
                  onChange={(value) => setFormData({ ...formData, phone: value })}
                  required
                />
                <PhoneInput
                  label="Ota-ona telefoni"
                  value={formData.parentPhone || ''}
                  onChange={(value) => setFormData({ ...formData, parentPhone: value })}
                  required
                />
              </>
            )}

            {formData.role !== 'STUDENT' && formData.role === 'TEACHER' && (
              <PhoneInput
                label="Telefon"
                value={formData.phone}
                onChange={(value) => setFormData({ ...formData, phone: value })}
              />
            )}

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-4">
              <Button type="submit" loading={loading} fullWidth className="sm:flex-1">
                {editingUser ? 'Yangilash' : 'Saqlash'}
              </Button>
              <Button type="button" variant="outline" onClick={handleCloseForm} fullWidth className="sm:flex-1">
                Bekor qilish
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {users.length === 0 ? (
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="py-16 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <User className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Foydalanuvchilar yo'q</h3>
            <p className="text-gray-600 mb-6">Yangi foydalanuvchi qo'shish uchun yuqoridagi tugmani bosing</p>
            <Button onClick={() => {
              setFormData({ username: '', password: '', role: roles[0]?.name || '', branchId: '', phone: '', fullName: '', parentPhone: '' });
              setShowForm(true);
            }} size="lg">
              <Plus className="w-5 h-5 mr-2" />
              Foydalanuvchi qo'shish
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {users.map((user) => (
            <Card key={user._id} className="card-hover">
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col h-full">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-11 h-11 bg-gradient-to-br from-primary to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                      <Shield className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => handleEdit(user)}
                        className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button 
                        onClick={() => handleDelete(user._id)}
                        className="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-foreground mb-1 truncate">
                      {user.fullName || user.username}
                    </h3>
                    <div className="flex items-center gap-2 mb-2">
                      {getRoleBadge(user.role)}
                    </div>
                    {user.branchId && (
                      <p className="text-sm text-muted-foreground mb-2 truncate">
                        📍 {user.branchId.name || 'Filial'}
                      </p>
                    )}
                    {user.phone && (
                      <p className="text-sm text-muted-foreground truncate">
                        📞 {user.phone}
                      </p>
                    )}
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
