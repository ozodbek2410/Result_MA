import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/Dialog';
import { PageNavbar } from '@/components/ui/PageNavbar';
import { useToast } from '@/hooks/useToast';
import { Plus, RefreshCw, ShieldCheck, XCircle, CheckCircle2 } from 'lucide-react';

interface Assignment {
  _id: string;
  teacherId: { _id: string; fullName?: string; username?: string } | string;
  groupId: { _id: string; name: string; classNumber: number; letter: string } | string;
  subjectId: { _id: string; nameUzb?: string } | string;
  source: 'CRM_SYNC' | 'MANUAL' | 'MIGRATION';
  isManualOverride: boolean;
  isActive: boolean;
  deactivatedAt?: string;
  deactivatedReason?: string;
  createdAt: string;
}

interface OptionLite {
  _id: string;
  label: string;
}

export default function TeacherAssignmentsPage() {
  const { success, error } = useToast();
  const [rows, setRows] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [search, setSearch] = useState('');
  const [teachers, setTeachers] = useState<OptionLite[]>([]);
  const [groups, setGroups] = useState<OptionLite[]>([]);
  const [subjects, setSubjects] = useState<OptionLite[]>([]);
  const [form, setForm] = useState({ teacherId: '', groupId: '', subjectId: '' });

  const load = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin/teacher-assignments');
      setRows(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadRefs = async () => {
    try {
      const [{ data: t }, { data: g }, { data: s }] = await Promise.all([
        api.get('/users?role=TEACHER'),
        api.get('/groups'),
        api.get('/subjects'),
      ]);
      const teacherOpts = (Array.isArray(t) ? t : t?.data || []).map((x: { _id: string; fullName?: string; username?: string }) => ({
        _id: x._id,
        label: x.fullName || x.username || x._id,
      }));
      setTeachers(teacherOpts);
      setGroups((g || []).map((x: { _id: string; name: string }) => ({ _id: x._id, label: x.name })));
      setSubjects((s || []).map((x: { _id: string; nameUzb?: string }) => ({ _id: x._id, label: x.nameUzb || x._id })));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    load();
    loadRefs();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => {
      const t = typeof r.teacherId === 'object' ? r.teacherId.fullName || '' : '';
      const g = typeof r.groupId === 'object' ? r.groupId.name : '';
      const s = typeof r.subjectId === 'object' ? r.subjectId.nameUzb || '' : '';
      return `${t} ${g} ${s}`.toLowerCase().includes(q);
    });
  }, [rows, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.teacherId || !form.groupId || !form.subjectId) {
      error('Barcha maydonlarni to\'ldiring');
      return;
    }
    try {
      await api.post('/admin/teacher-assignments', form);
      success('Biriktirma yaratildi (manual override)');
      setShowDialog(false);
      setForm({ teacherId: '', groupId: '', subjectId: '' });
      load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Xatolik';
      error(msg);
    }
  };

  const toggleActive = async (row: Assignment) => {
    const reason = !row.isActive ? undefined : prompt('O\'chirish sababi (ixtiyoriy):') || undefined;
    try {
      await api.patch(`/admin/teacher-assignments/${row._id}`, {
        isActive: !row.isActive,
        reason,
      });
      load();
    } catch {
      error('Yangilashda xatolik');
    }
  };

  const toggleOverride = async (row: Assignment) => {
    try {
      await api.patch(`/admin/teacher-assignments/${row._id}`, {
        isManualOverride: !row.isManualOverride,
      });
      load();
    } catch {
      error('Yangilashda xatolik');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <PageNavbar
        title="O'qituvchi biriktirmalari"
        description="CRM sync va qo'lda qo'shilgan biriktirmalar ro'yxati"
        badge={`${filtered.length} ta`}
        showSearch
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="O'qituvchi, guruh yoki fan bo'yicha qidirish..."
        showAddButton
        onAddClick={() => setShowDialog(true)}
        gradient
      />

      <div className="flex justify-end">
        <Button variant="outline" onClick={load} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Yangilash
        </Button>
      </div>

      <Dialog open={showDialog} onClose={() => setShowDialog(false)}>
        <DialogHeader>
          <DialogTitle>Yangi manual biriktirma</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <Select label="O'qituvchi" value={form.teacherId} onChange={e => setForm({ ...form, teacherId: e.target.value })} required>
              <option value="">Tanlang</option>
              {teachers.map(t => <option key={t._id} value={t._id}>{t.label}</option>)}
            </Select>
            <Select label="Guruh" value={form.groupId} onChange={e => setForm({ ...form, groupId: e.target.value })} required>
              <option value="">Tanlang</option>
              {groups.map(g => <option key={g._id} value={g._id}>{g.label}</option>)}
            </Select>
            <Select label="Fan" value={form.subjectId} onChange={e => setForm({ ...form, subjectId: e.target.value })} required>
              <option value="">Tanlang</option>
              {subjects.map(s => <option key={s._id} value={s._id}>{s.label}</option>)}
            </Select>
            <div className="flex gap-2 pt-2">
              <Button type="submit">Saqlash</Button>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Bekor qilish</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="h-32 bg-slate-200 rounded-2xl animate-pulse" />
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-slate-500">Biriktirma topilmadi</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-left">
                <tr>
                  <th className="px-4 py-3">O'qituvchi</th>
                  <th className="px-4 py-3">Guruh</th>
                  <th className="px-4 py-3">Fan</th>
                  <th className="px-4 py-3">Manba</th>
                  <th className="px-4 py-3">Holat</th>
                  <th className="px-4 py-3">Amallar</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const t = typeof r.teacherId === 'object' ? r.teacherId : null;
                  const g = typeof r.groupId === 'object' ? r.groupId : null;
                  const s = typeof r.subjectId === 'object' ? r.subjectId : null;
                  return (
                    <tr key={r._id} className="border-t border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium">{t?.fullName || t?.username || '—'}</td>
                      <td className="px-4 py-3">{g ? `${g.name}` : '—'}</td>
                      <td className="px-4 py-3">{s?.nameUzb || '—'}</td>
                      <td className="px-4 py-3">
                        <Badge className={
                          r.source === 'MANUAL' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                          r.source === 'MIGRATION' ? 'bg-slate-100 text-slate-700 border-slate-200' :
                          'bg-sky-100 text-sky-800 border-sky-200'
                        }>{r.source}</Badge>
                        {r.isManualOverride && (
                          <Badge className="ml-1 bg-purple-100 text-purple-800 border-purple-200">override</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.isActive
                          ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">faol</Badge>
                          : <Badge className="bg-rose-100 text-rose-700 border-rose-200">o'chirilgan</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => toggleActive(r)}>
                            {r.isActive ? <><XCircle className="w-4 h-4 mr-1" /> O'chir</> : <><CheckCircle2 className="w-4 h-4 mr-1" /> Yoq</>}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => toggleOverride(r)}>
                            <ShieldCheck className="w-4 h-4 mr-1" />
                            {r.isManualOverride ? 'Override o\'chir' : 'Override'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
