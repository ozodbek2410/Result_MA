import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/store/authStore';
import { ShieldAlert, KeyRound } from 'lucide-react';

const MIN_LENGTH = 8;

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { success, error } = useToast();
  const { user, setMustChangePassword } = useAuthStore();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);

  const validate = (): string | null => {
    if (!form.currentPassword) return 'Joriy parolni kiriting';
    if (form.newPassword.length < MIN_LENGTH) return `Yangi parol kamida ${MIN_LENGTH} belgidan iborat`;
    if (!/[A-Z]/.test(form.newPassword)) return 'Parolda kamida 1 ta katta harf';
    if (!/[0-9]/.test(form.newPassword)) return 'Parolda kamida 1 ta raqam';
    if (form.newPassword !== form.confirmPassword) return 'Parollar mos emas';
    if (form.newPassword === form.currentPassword) return 'Yangi parol eski paroldan farq qilishi kerak';
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) return error(err);
    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setMustChangePassword(false);
      success('Parol o\'zgartirildi');
      navigate('/teacher/dashboard');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Xatolik';
      error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-2 border-slate-200 shadow-2xl">
        <CardContent className="p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Parolni yangilang</h1>
              <p className="text-sm text-slate-600">Birinchi kirish — xavfsiz parol o'rnatish majburiy</p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-700">
            <div className="font-semibold mb-1">{user?.username}</div>
            <ul className="list-disc pl-5 text-xs space-y-0.5 text-slate-600">
              <li>Kamida {MIN_LENGTH} ta belgi</li>
              <li>Kamida 1 ta katta harf va 1 ta raqam</li>
              <li>Eski paroldan farq qilishi shart</li>
            </ul>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Input
              label="Joriy parol"
              type="password"
              value={form.currentPassword}
              onChange={e => setForm({ ...form, currentPassword: e.target.value })}
              required
            />
            <Input
              label="Yangi parol"
              type="password"
              value={form.newPassword}
              onChange={e => setForm({ ...form, newPassword: e.target.value })}
              required
              minLength={MIN_LENGTH}
            />
            <Input
              label="Yangi parolni qaytaring"
              type="password"
              value={form.confirmPassword}
              onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
              required
              minLength={MIN_LENGTH}
            />
            <Button type="submit" disabled={loading} className="w-full gap-2">
              <KeyRound className="w-4 h-4" />
              {loading ? 'Saqlanmoqda...' : 'Saqlash'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
