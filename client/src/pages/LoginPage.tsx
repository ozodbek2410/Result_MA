import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import { Lock, User, AlertCircle, ArrowLeft } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Дополнительная защита от всплытия события
    
    setError('');
    setLoading(true);

    try {
      const { data } = await api.post('/auth/login', { username, password });
      setAuth(data.user, data.token);
      
      // Определяем куда направить пользователя на основе роли и прав
      const role = data.user.role;
      const permissions = data.user.permissions || [];
      
      if (role === 'SUPER_ADMIN') {
        navigate('/admin/dashboard');
      } else if (role === 'FIL_ADMIN') {
        navigate('/custom/dashboard');
      } else if (role === 'TEACHER') {
        navigate('/teacher/groups');
      } else {
        // Для кастомных ролей всегда используем custom layout
        navigate('/custom/dashboard');
      }
    } catch (err: any) {
      // Предотвращаем любую навигацию при ошибке
      const errorMessage = err.response?.data?.message || 'Login yoki parol noto\'g\'ri';
      setError(errorMessage);
      console.error('Login error:', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4 relative overflow-hidden">
      {/* Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-400/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-400/10 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Login Card - White card on all devices */}
        <div className="bg-white/95 backdrop-blur-sm shadow-2xl rounded-2xl p-8 border border-gray-100 animate-fade-in">
          {/* Back Button */}
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mb-6 flex items-center gap-2 text-gray-700 hover:text-blue-600 transition-all group"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-semibold">Orqaga</span>
          </button>

          {/* Logo & Title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center mb-6">
              <img 
                src="/logo.png" 
                alt="Logo" 
                className="w-28 h-28 object-contain drop-shadow-2xl"
              />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Xush kelibsiz</h1>
            <p className="text-gray-600 text-sm md:text-base">Tizimga kirish uchun ma'lumotlaringizni kiriting</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Username Input */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">
                Login
              </label>
              <div className="relative group">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 transition-colors group-focus-within:text-blue-500" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  placeholder="Loginni kiriting"
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-gray-200 rounded-xl 
                    focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white
                    outline-none transition-all text-gray-900 placeholder:text-gray-400
                    hover:border-gray-300 shadow-sm"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">
                Parol
              </label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 transition-colors group-focus-within:text-blue-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Parolni kiriting"
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-gray-200 rounded-xl 
                    focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white
                    outline-none transition-all text-gray-900 placeholder:text-gray-400
                    hover:border-gray-300 shadow-sm"
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-4 rounded-xl 
                transition-all duration-200 shadow-lg hover:shadow-2xl 
                disabled:opacity-50 disabled:cursor-not-allowed
                hover:from-blue-700 hover:to-indigo-700
                active:scale-[0.98] mt-6"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Yuklanmoqda...
                </span>
              ) : 'Kirish'}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-xs text-gray-500">
              © 2025 Test Platform. Barcha huquqlar himoyalangan.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
