import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { lazy, Suspense, useMemo, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { usePermissions } from '../hooks/usePermissions';
import { 
  Users, 
  LogOut,
  Menu,
  X,
  LayoutDashboard,
  Building2,
  Compass,
  GraduationCap,
  Shield,
  BarChart3,
  UserCheck
} from 'lucide-react';
import { Loading } from '../components/ui/Loading';

// Lazy load all pages
const BranchGroupsPage = lazy(() => import('../pages/branch/GroupsPage'));
const BranchGroupDetailPage = lazy(() => import('../pages/branch/GroupDetailPage'));
const StudentsPage = lazy(() => import('../pages/branch/StudentsPage'));
const TeachersPage = lazy(() => import('../pages/branch/TeachersPage'));
const BranchStatisticsPage = lazy(() => import('../pages/branch/BranchStatisticsPage'));
const BranchDashboardPage = lazy(() => import('../pages/branch/BranchDashboardPage'));
const BranchesPage = lazy(() => import('../pages/admin/BranchesPage'));
const SubjectsPage = lazy(() => import('../pages/admin/SubjectsPage'));
const DirectionsPage = lazy(() => import('../pages/admin/DirectionsPage'));
const RolesPage = lazy(() => import('../pages/admin/RolesPage'));

const allMenuItems = [
  { path: '/custom/dashboard', label: 'Bosh sahifa', icon: LayoutDashboard, permission: 'view_dashboard' },
  { path: '/custom/branches', label: 'Filiallar', icon: Building2, permission: 'view_branches' },
  { path: '/custom/subjects', label: 'Fanlar', icon: Compass, permission: 'view_subjects' },
  { path: '/custom/roles', label: 'Rollar', icon: Shield, permission: 'view_roles' },
  { path: '/custom/groups', label: 'Guruhlar', icon: Users, permission: 'view_groups' },
  { path: '/custom/students', label: "O'quvchilar", icon: GraduationCap, permission: 'view_students' },
  { path: '/custom/teachers', label: "O'qituvchilar", icon: UserCheck, permission: 'view_teachers' },
  { path: '/custom/statistics', label: 'Statistika', icon: BarChart3, permission: 'view_statistics' },
];

export default function CustomRoleLayout() {
  const { logout, user } = useAuthStore();
  const { hasPermission } = usePermissions();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  // Ruxsat berilgan menyu elementlarini filtrlash (useMemo bilan optimize qilish)
  const visibleMenuItems = useMemo(() => {
    return allMenuItems.filter(item => hasPermission(item.permission));
  }, [hasPermission, user?.permissions]);

  // Bottom navigation uchun asosiy 3 ta element + "Ko'proq" tugmasi
  const bottomNavItems = visibleMenuItems.slice(0, 3);
  const moreMenuItems = visibleMenuItems.slice(3);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 flex flex-col">
      {/* Top Header - Mobile Only */}
      <header className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b-2 border-slate-200 z-40 h-16 flex items-center justify-between px-4 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">Panel</h1>
          </div>
        </div>
        
        {/* User Profile & Logout */}
        <button
          onClick={logout}
          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-red-50 text-red-600 transition-all"
        >
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-sm">
            {user?.username?.charAt(0).toUpperCase()}
          </div>
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {/* Bottom Navigation - Mobile Only */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t-2 border-slate-200 z-50 safe-area-bottom shadow-2xl">
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
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-3xl">
              <h3 className="text-lg font-bold text-slate-900">Menyu</h3>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
            
            {/* Menu Items */}
            <div className="p-4 space-y-2">
              {visibleMenuItems.map((item) => {
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
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/30'
                        : 'text-slate-700 hover:bg-slate-100'
                      }
                    `}
                  >
                    <Icon className={`w-5 h-5 flex-shrink-0 ${
                      active ? 'text-white' : 'text-slate-500'
                    }`} />
                    <span className="font-semibold flex-1">{item.label}</span>
                    {active && <X className="w-5 h-5 text-white rotate-45" />}
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
            <div className="border-t border-slate-200 p-4 bg-slate-50">
              <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200">
                <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center text-white font-bold shadow-md">
                  {user?.username?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{user?.username}</p>
                  <p className="text-xs text-slate-500">{user?.role}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar - Desktop Only */}
      <aside className={`
        hidden lg:flex
        bg-white transition-all duration-300 flex-col fixed h-screen z-40
        ${sidebarOpen ? 'w-72' : 'w-20'}
        shadow-xl border-r-2 border-slate-200/80
      `}>
        {/* Logo Section */}
        <div className="h-20 flex items-center justify-between px-5 border-b border-slate-200 flex-shrink-0">
          {sidebarOpen && (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Panel</h1>
                <p className="text-xs text-slate-500">{user?.role}</p>
              </div>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors hidden lg:block"
          >
            {sidebarOpen ? 
              <X className="w-5 h-5 text-slate-600" /> : 
              <Menu className="w-5 h-5 text-slate-600" />
            }
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-6 overflow-y-auto">
          <div className="space-y-1.5 px-3">
            {visibleMenuItems.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">Ruxsatlar yo'q</p>
              </div>
            ) : (
              visibleMenuItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`
                      flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 group relative
                      ${active
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/30'
                        : 'text-slate-700 hover:bg-slate-100'
                      }
                    `}
                  >
                    <Icon className={`w-5 h-5 flex-shrink-0 transition-transform ${
                      active ? 'text-white' : 'text-slate-500 group-hover:text-indigo-500'
                    }`} />
                    
                    {sidebarOpen && (
                      <span className="font-semibold flex-1">{item.label}</span>
                    )}
                    
                    {!sidebarOpen && active && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-indigo-500 to-purple-500 rounded-r-full" />
                    )}
                  </Link>
                );
              })
            )}
          </div>
        </nav>

        {/* User Info & Logout */}
        <div className="border-t border-slate-200 p-4 flex-shrink-0 bg-slate-50">
          {sidebarOpen && (
            <div className="mb-3 px-2">
              <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 transition-colors">
                <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center text-white font-bold shadow-md">
                  {user?.username?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{user?.username}</p>
                  <p className="text-xs text-slate-500">{user?.role}</p>
                </div>
              </div>
            </div>
          )}
          <button
            onClick={logout}
            className={`
              flex items-center gap-3 w-full px-4 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-colors border border-red-200
              ${!sidebarOpen && 'justify-center'}
            `}
          >
            <LogOut className="w-5 h-5" />
            {sidebarOpen && <span className="font-semibold">Chiqish</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`
        flex-1 overflow-auto transition-all duration-300
        ${sidebarOpen ? 'lg:ml-72' : 'lg:ml-20'}
        pt-16 lg:pt-0
      `}>
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8">
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Navigate to="dashboard" replace />} />
              <Route path="/dashboard" element={<BranchDashboardPage />} />
              <Route path="/branches" element={<BranchesPage />} />
              <Route path="/subjects" element={<SubjectsPage />} />
              <Route path="/roles" element={<RolesPage />} />
              <Route path="/groups" element={<BranchGroupsPage />} />
              <Route path="/groups/:id" element={<BranchGroupDetailPage />} />
              <Route path="/students" element={<StudentsPage />} />
              <Route path="/teachers" element={<TeachersPage />} />
              <Route path="/statistics" element={<BranchStatisticsPage />} />
            </Routes>
          </Suspense>
        </div>
      </main>
    </div>
  );
}
