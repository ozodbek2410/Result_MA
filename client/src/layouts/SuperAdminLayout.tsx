import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { lazy, Suspense, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { 
  Building2, 
  BookOpen, 
  Compass, 
  Users, 
  BarChart3,
  LogOut,
  Menu,
  X,
  LayoutDashboard,
  GraduationCap,
  ChevronRight,
  Shield
} from 'lucide-react';
import { Loading } from '../components/ui/Loading';

// Lazy load all admin pages
const BranchesPage = lazy(() => import('../pages/admin/BranchesPage'));
const SubjectsPage = lazy(() => import('../pages/admin/SubjectsPage'));
const DirectionsPage = lazy(() => import('../pages/admin/DirectionsPage'));
const UsersPage = lazy(() => import('../pages/admin/UsersPage'));
const StatisticsPage = lazy(() => import('../pages/admin/StatisticsPage'));
const DashboardPage = lazy(() => import('../pages/admin/DashboardPage'));
const BranchStatisticsPage = lazy(() => import('../pages/admin/BranchStatisticsPage'));
const RolesPage = lazy(() => import('../pages/admin/RolesPage'));

const menuItems = [
  { path: '/admin/dashboard', label: 'Bosh sahifa', icon: LayoutDashboard },
  { path: '/admin/branches', label: 'Filiallar', icon: Building2 },
  { path: '/admin/subjects', label: 'Fanlar', icon: BookOpen },
  { path: '/admin/directions', label: "Yo'nalishlar", icon: Compass },
  { path: '/admin/users', label: 'Foydalanuvchilar', icon: Users },
  { path: '/admin/roles', label: 'Rollar', icon: Shield },
  { path: '/admin/statistics', label: 'Statistika', icon: BarChart3 },
];

export default function SuperAdminLayout() {
  const { logout, user } = useAuthStore();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  // Bottom navigation uchun asosiy 3 ta element + "Ko'proq" tugmasi
  const bottomNavItems = menuItems.slice(0, 3);
  const moreMenuItems = menuItems.slice(3);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 flex flex-col">
      {/* Top Header - Mobile Only */}
      <header className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b-2 border-gray-200 z-40 h-16 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-primary to-purple-600 rounded-lg flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold text-gray-900">Ta'lim</h1>
        </div>
        
        {/* User Profile Button */}
        <button
          onClick={logout}
          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-red-50 text-red-600 transition-all"
        >
          <div className="w-8 h-8 bg-gradient-to-br from-primary to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            {user?.username?.charAt(0).toUpperCase()}
          </div>
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {/* Bottom Navigation - Mobile Only */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 z-50 safe-area-bottom shadow-2xl">
        <div className="grid grid-cols-4 h-20">
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`
                  flex flex-col items-center justify-center gap-1 transition-all duration-200
                  ${active
                    ? 'text-primary'
                    : 'text-gray-500'
                  }
                `}
              >
                <div className={`
                  p-2 rounded-xl transition-all duration-200
                  ${active ? 'bg-primary/10 scale-110' : ''}
                `}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium truncate max-w-full px-1">
                  {item.label.split(' ')[0]}
                </span>
              </Link>
            );
          })}
          
          {/* Ko'proq tugmasi */}
          {moreMenuItems.length > 0 && (
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="flex flex-col items-center justify-center gap-1 text-gray-500 transition-all duration-200"
            >
              <div className="p-2 rounded-xl">
                <Menu className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium">Ko'proq</span>
            </button>
          )}
        </div>
      </nav>

      {/* Mobile Menu Modal */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 animate-fade-in">
          {/* Overlay */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          
          {/* Menu Panel */}
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl animate-slide-up max-h-[80vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-3xl">
              <h3 className="text-lg font-bold text-gray-900">Menyu</h3>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            
            {/* Menu Items */}
            <div className="p-4 space-y-2">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`
                      flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-200
                      ${active
                        ? 'bg-gradient-to-r from-primary to-purple-600 text-white shadow-lg shadow-primary/30'
                        : 'text-gray-700 hover:bg-gray-100'
                      }
                    `}
                  >
                    <Icon className={`w-5 h-5 flex-shrink-0 ${
                      active ? 'text-white' : 'text-gray-500'
                    }`} />
                    <span className="font-semibold flex-1">{item.label}</span>
                    {active && <ChevronRight className="w-5 h-5 text-white" />}
                  </Link>
                );
              })}
              
              {/* Logout Button */}
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                className="flex items-center gap-4 w-full px-4 py-3.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-colors border border-red-200 mt-4"
              >
                <LogOut className="w-5 h-5" />
                <span className="font-semibold">Chiqish</span>
              </button>
            </div>
            
            {/* User Info */}
            <div className="border-t border-gray-200 p-4 bg-gray-50">
              <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200">
                <div className="w-11 h-11 bg-gradient-to-br from-primary to-purple-600 rounded-xl flex items-center justify-center text-white font-bold shadow-md">
                  {user?.username?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{user?.username}</p>
                  <p className="text-xs text-gray-500">Super Admin</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar - Desktop Only */}
      <aside className={`
        hidden lg:flex
        bg-white border-r-2 border-gray-200/80 transition-all duration-300 flex-col fixed h-screen z-40
        ${sidebarOpen ? 'w-64' : 'w-20'}
        shadow-xl
      `}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200 flex-shrink-0 bg-gradient-to-r from-primary/5 to-purple-50">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-purple-600 rounded-lg flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-lg font-bold text-gray-900">Ta'lim Tizimi</h1>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors hidden lg:block"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          <div className="space-y-1 px-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative
                    ${active
                      ? 'bg-gradient-to-r from-primary to-primary-hover text-white shadow-soft'
                      : 'text-gray-700 hover:bg-gray-100'
                    }
                  `}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-white' : 'text-gray-600 group-hover:text-primary'}`} />
                  {sidebarOpen && (
                    <>
                      <span className="font-medium flex-1">{item.label}</span>
                      {active && <ChevronRight className="w-4 h-4" />}
                    </>
                  )}
                  {!sidebarOpen && active && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full" />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User Info & Logout */}
        <div className="border-t border-gray-200 p-4 flex-shrink-0 bg-gray-50">
          {sidebarOpen && (
            <div className="mb-3 px-2">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-gradient-to-br from-primary to-purple-600 rounded-xl flex items-center justify-center text-white font-bold">
                  {user?.username?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{user?.username}</p>
                  <p className="text-xs text-gray-500">Super Admin</p>
                </div>
              </div>
            </div>
          )}
          <button
            onClick={logout}
            className={`
              flex items-center gap-3 w-full px-3 py-2.5 text-red-600 hover:bg-red-50 rounded-xl transition-all
              ${!sidebarOpen && 'justify-center'}
            `}
          >
            <LogOut className="w-5 h-5" />
            {sidebarOpen && <span className="font-medium">Chiqish</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`
        flex-1 overflow-auto transition-all duration-300
        ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-20'}
        pt-16 lg:pt-0
      `}>
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8">
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/branches" element={<BranchesPage />} />
              <Route path="/branches/:id/statistics" element={<BranchStatisticsPage />} />
              <Route path="/subjects" element={<SubjectsPage />} />
              <Route path="/directions" element={<DirectionsPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/roles" element={<RolesPage />} />
              <Route path="/statistics" element={<StatisticsPage />} />
            </Routes>
          </Suspense>
        </div>
      </main>
    </div>
  );
}
