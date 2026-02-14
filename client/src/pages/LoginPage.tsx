import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import { Lock, User, AlertCircle, ArrowLeft, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setError('');
    setLoading(true);

    try {
      const { data } = await api.post('/auth/login', { username, password });
      setAuth(data.user, data.token);
      
      // Redirect all users to teacher panel
      navigate('/teacher/dashboard');
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Login yoki parol noto\'g\'ri';
      setError(errorMessage);
      console.error('Login error:', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Animated Background Elements - same as landing */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-400/20 rounded-full blur-3xl animate-pulse float-animation"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-indigo-400/20 rounded-full blur-3xl animate-pulse float-animation" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-purple-400/10 rounded-full blur-3xl animate-pulse float-animation" style={{ animationDelay: '4s' }}></div>
      </div>

      {/* Navigation - same as landing */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-effect border-b border-white/20 shadow-lg">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Logo */}
            <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => navigate('/')}>
              <div className="relative">
                <img 
                  src="/logo.png" 
                  alt="Math Academy Logo" 
                  className="w-12 h-12 object-contain transition-transform group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  Math Academy
                </span>
                <span className="text-xs text-gray-600 font-medium">Matematika maktabi</span>
              </div>
            </div>

            {/* Back Button */}
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 px-6 py-3 glass-effect hover:bg-white/20 rounded-xl transition-all font-medium text-[15px] group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span className="hidden sm:inline">Orqaga</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content - Centered Login Card */}
      <div className="relative z-10 flex items-center justify-center min-h-screen px-4 pt-20">
        <div className="w-full max-w-md">
          {/* Login Card - same style as landing */}
          <div className="premium-card glass-effect rounded-3xl p-10 shadow-2xl">
            {/* Header */}
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center mb-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl glow-pulse"></div>
                  <img 
                    src="/logo.png" 
                    alt="Math Academy Logo" 
                    className="relative w-20 h-20 object-contain"
                  />
                </div>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Kirish</h2>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Username Input */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700 ml-1">
                  Login
                </label>
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl opacity-0 group-focus-within:opacity-10 transition-opacity blur"></div>
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 transition-colors group-focus-within:text-blue-600 z-10" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    placeholder="Loginni kiriting"
                    className="relative w-full pl-12 pr-4 py-4 glass-effect border border-white/20 rounded-xl 
                      focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20
                      outline-none transition-all text-gray-900 placeholder:text-gray-400
                      hover:border-white/30 shadow-sm"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700 ml-1">
                  Parol
                </label>
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl opacity-0 group-focus-within:opacity-10 transition-opacity blur"></div>
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 transition-colors group-focus-within:text-blue-600 z-10" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="Parolni kiriting"
                    className="relative w-full pl-12 pr-12 py-4 glass-effect border border-white/20 rounded-xl 
                      focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20
                      outline-none transition-all text-gray-900 placeholder:text-gray-400
                      hover:border-white/30 shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors z-10"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex items-start gap-3 p-4 glass-effect border border-red-200/50 rounded-xl animate-fade-in">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 font-medium">{error}</p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="shimmer-button relative w-full group overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-xl"></div>
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="relative px-6 py-4 text-white font-semibold text-lg flex items-center justify-center gap-2">
                  {loading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Yuklanmoqda...</span>
                    </>
                  ) : (
                    <span>Kirish</span>
                  )}
                </div>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
