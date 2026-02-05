import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/Dialog';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/hooks/useToast';
import { usePermissions } from '@/hooks/usePermissions';
import { PageNavbar } from '@/components/ui/PageNavbar';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import { Plus, Shield, Edit2, Trash2, Check } from 'lucide-react';

interface Role {
  _id: string;
  name: string;
  displayName: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
}

interface Permission {
  key: string;
  label: string;
  group: string;
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    displayName: '',
    description: '',
    permissions: [] as string[]
  });
  const { success, error } = useToast();
  const { hasPermission } = usePermissions();
  
  // Проверка прав доступа
  const canCreate = hasPermission('create_roles');
  const canUpdate = hasPermission('edit_roles');
  const canDelete = hasPermission('delete_roles');

  useEffect(() => {
    fetchRoles();
    fetchPermissions();
  }, []);

  const fetchRoles = async () => {
    try {
      const { data } = await api.get('/roles');
      // Показываем все роли, включая системные
      setRoles(data);
    } catch (err: any) {
      error('Rollarni yuklashda xatolik');
    } finally {
      setLoading(false);
    }
  };

  const fetchPermissions = async () => {
    try {
      const { data } = await api.get('/roles/permissions/list');
      setPermissions(data);
    } catch (err) {
      console.error('Error fetching permissions');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.displayName) {
      error('Nom va ko\'rsatiladigan nom majburiy');
      return;
    }
    
    setLoading(true);
    try {
      if (editingRole) {
        await api.put(`/roles/${editingRole._id}`, formData);
        success('Rol muvaffaqiyatli yangilandi!');
      } else {
        await api.post('/roles', formData);
        success('Rol muvaffaqiyatli yaratildi!');
      }
      setFormData({ name: '', displayName: '', description: '', permissions: [] });
      setEditingRole(null);
      setShowForm(false);
      fetchRoles();
    } catch (err: any) {
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (role: Role) => {
    setEditingRole(role);
    setFormData({
      name: role.name,
      displayName: role.displayName,
      description: role.description || '',
      permissions: role.permissions
    });
    setShowForm(true);
  };

  const handleDelete = async (roleId: string) => {
    if (!confirm('Rolni o\'chirmoqchimisiz?')) return;
    
    try {
      await api.delete(`/roles/${roleId}`);
      fetchRoles();
      success('Rol o\'chirildi!');
    } catch (err: any) {
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingRole(null);
    setFormData({ name: '', displayName: '', description: '', permissions: [] });
  };

  const togglePermission = (permission: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter(p => p !== permission)
        : [...prev.permissions, permission]
    }));
  };

  const toggleGroupPermissions = (groupPerms: Permission[]) => {
    const groupKeys = groupPerms.map(p => p.key);
    const allSelected = groupKeys.every(key => formData.permissions.includes(key));
    
    setFormData(prev => ({
      ...prev,
      permissions: allSelected
        ? prev.permissions.filter(p => !groupKeys.includes(p))
        : [...new Set([...prev.permissions, ...groupKeys])]
    }));
  };

  const groupPermissions = () => {
    const groups: Record<string, Permission[]> = {};
    permissions.forEach(perm => {
      if (!groups[perm.group]) {
        groups[perm.group] = [];
      }
      groups[perm.group].push(perm);
    });
    return groups;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageNavbar
          title="Rollar"
          description="Tizim rollarini boshqarish"
        />
        
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard variant="default" count={6} />
        </div>
      </div>
    );
  }

  // Фильтрация ролей по поиску
  const filteredRoles = roles.filter(role => {
    const searchLower = searchQuery.toLowerCase();
    return (
      role.name?.toLowerCase().includes(searchLower) ||
      role.displayName?.toLowerCase().includes(searchLower) ||
      role.description?.toLowerCase().includes(searchLower)
    );
  });

  // Сортировка: системные роли первыми
  const sortedRoles = [...filteredRoles].sort((a, b) => {
    if (a.isSystem && !b.isSystem) return -1;
    if (!a.isSystem && b.isSystem) return 1;
    return a.displayName.localeCompare(b.displayName);
  });

  return (
    <div className="space-y-4 sm:space-y-6 animate-in pb-16 sm:pb-20">
      {/* Navbar */}
      <PageNavbar
        title="Rollar"
        description="Tizim rollarini boshqarish"
        badge={`${sortedRoles.length} ta`}
        showSearch={true}
        searchPlaceholder="Rol nomi yoki tavsif bo'yicha qidirish..."
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        showAddButton={canCreate}
        addButtonText="Rol qo'shish"
        onAddClick={() => setShowForm(true)}
      />

      {/* Dialog */}
      <Dialog open={showForm} onClose={handleCloseForm} className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            {editingRole ? 'Rolni tahrirlash' : 'Yangi rol'}
          </DialogTitle>
        </DialogHeader>
        <DialogContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Rol nomi (inglizcha)"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              disabled={!!editingRole}
              placeholder="MANAGER"
              helperText="Faqat katta harflar va pastki chiziq"
            />
            
            <Input
              label="Ko'rsatiladigan nom"
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              required
              placeholder="Menejer"
            />
            
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Tavsif
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Rol haqida qisqacha ma'lumot"
                className="input min-h-[80px] resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                Ruxsatlar ({formData.permissions.length} tanlangan)
              </label>
              <div className="max-h-[500px] overflow-y-auto space-y-4 border rounded-lg p-4 bg-muted/30">
                {Object.entries(groupPermissions()).map(([groupName, perms]) => {
                  const allSelected = perms.every(p => formData.permissions.includes(p.key));
                  return (
                    <div key={groupName} className="space-y-2">
                      <div className="flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur-sm py-1 px-2 -mx-2 rounded-md border-b">
                        <h4 className="text-sm font-semibold text-foreground">
                          {groupName}
                        </h4>
                        <button
                          type="button"
                          onClick={() => toggleGroupPermissions(perms)}
                          className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                        >
                          {allSelected ? 'Bekor qilish' : 'Barchasini tanlash'}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {perms.map(perm => (
                          <label
                            key={perm.key}
                            className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted cursor-pointer transition-colors"
                          >
                            <div className="relative">
                              <input
                                type="checkbox"
                                checked={formData.permissions.includes(perm.key)}
                                onChange={() => togglePermission(perm.key)}
                                className="sr-only"
                              />
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                formData.permissions.includes(perm.key)
                                  ? 'bg-primary border-primary'
                                  : 'border-input'
                              }`}>
                                {formData.permissions.includes(perm.key) && (
                                  <Check className="w-3 h-3 text-white" />
                                )}
                              </div>
                            </div>
                            <span className="text-sm text-foreground">
                              {perm.label}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit" loading={loading} className="flex-1">
                {editingRole ? 'Yangilash' : 'Saqlash'}
              </Button>
              <Button type="button" variant="outline" onClick={handleCloseForm} className="flex-1">
                Bekor qilish
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Roles Grid */}
      {sortedRoles.length === 0 ? (
        <Card>
          <CardContent className="py-12 sm:py-16 text-center px-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-muted rounded-lg flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <Shield className="w-7 h-7 sm:w-8 sm:h-8 text-muted-foreground" />
            </div>
            <h3 className="text-base sm:text-lg font-semibold text-foreground mb-2">
              {searchQuery ? 'Rollar topilmadi' : 'Rollar yo\'q'}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground mb-4 sm:mb-6 max-w-md mx-auto">
              {searchQuery 
                ? 'Qidiruv bo\'yicha hech narsa topilmadi. Boshqa so\'z bilan qidiring.'
                : 'Yangi rol qo\'shish uchun yuqoridagi tugmani bosing'
              }
            </p>
            {!searchQuery && canCreate && (
              <Button onClick={() => setShowForm(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Rol qo'shish
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {sortedRoles.map((role) => (
            <Card key={role._id} className="card-hover">
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col h-full">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                    </div>
                    {!role.isSystem && (canUpdate || canDelete) && (
                      <div className="flex gap-1">
                        {canUpdate && (
                          <button
                            onClick={() => handleEdit(role)}
                            className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(role._id)}
                            className="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-destructive" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm sm:text-base font-semibold text-foreground line-clamp-1">{role.displayName}</h3>
                      {role.isSystem && (
                        <Badge variant="secondary" size="sm">Tizim</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-2 sm:mb-3 truncate">{role.name}</p>
                    {role.description && (
                      <p className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3 line-clamp-2">{role.description}</p>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap gap-1 mt-auto">
                    {role.permissions.slice(0, 2).map(perm => {
                      const permObj = permissions.find(p => p.key === perm);
                      return (
                        <Badge key={perm} variant="secondary" size="sm">
                          {permObj ? permObj.label : perm}
                        </Badge>
                      );
                    })}
                    {role.permissions.length > 2 && (
                      <Badge variant="secondary" size="sm">
                        +{role.permissions.length - 2}
                      </Badge>
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
