import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { lazy, Suspense, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { usePermissions } from '../hooks/usePermissions';
import {
  Users,
  FileText,
  LogOut,
  Menu,
  X,
  LayoutDashboard,
  BookOpen,
  ChevronRight,
  ClipboardList,
  ScanLine,
  Building2,
  UserCog,
  BookMarked,
  Compass,
  BarChart3,
  GraduationCap,
} from 'lucide-react';
import { Loading } from '../components/ui/Loading';

// Lazy load teacher pages
const MyGroupsPage = lazy(() => import('../pages/teacher/MyGroupsPage'));
const GroupDetailPage = lazy(() => import('../pages/teacher/GroupDetailPage'));
const TestsPage = lazy(() => import('../pages/teacher/TestsPage'));
const CreateTestPage = lazy(() => import('../pages/teacher/CreateTestPage'));
const BlockTestsPage = lazy(() => import('../pages/teacher/BlockTestsPage'));
const ImportBlockTestPage = lazy(() => import('../pages/teacher/ImportBlockTestPage'));
const UnifiedTestImportPage = lazy(() => import('../pages/teacher/Tests/TestImportPage'));
const ConfigureBlockTestPage = lazy(() => import('../pages/teacher/ConfigureBlockTestPage'));
const ConfigureTestPage = lazy(() => import('../pages/teacher/ConfigureTestPage'));
const TeacherDashboardPage = lazy(() => import('../pages/teacher/TeacherDashboardPage'));
const TestViewPage = lazy(() => import('../pages/teacher/TestViewPage'));
const TestPrintPage = lazy(() => import('../pages/teacher/TestPrintPage'));
const BlockTestVariantsPage = lazy(() => import('../pages/teacher/BlockTestVariantsPage'));
const EditBlockTestPage = lazy(() => import('../pages/teacher/EditBlockTestPage'));
const TitulGeneratorPage = lazy(() => import('../pages/teacher/TitulGeneratorPage'));
const MergeBlockTestsPage = lazy(() => import('../pages/teacher/MergeBlockTestsPage'));
const EditBlockTestSubjectPage = lazy(() => import('../pages/teacher/EditBlockTestSubjectPage'));
const CreateBlockTestPage = lazy(() => import('../pages/teacher/CreateBlockTestPage'));
const AssignmentsPage = lazy(() => import('../pages/teacher/AssignmentsPage'));
const CreateAssignmentPage = lazy(() => import('../pages/teacher/CreateAssignmentPage'));
const AssignmentDetailPage = lazy(() => import('../pages/teacher/AssignmentDetailPage'));
const OMRCheckerPage = lazy(() => import('../pages/teacher/OMRCheckerPage'));

// Admin pages
const CrmSyncPage = lazy(() => import('../pages/admin/CrmSyncPage'));
const BranchesPage = lazy(() => import('../pages/admin/BranchesPage'));
const AdminUsersPage = lazy(() => import('../pages/admin/UsersPage'));
const AdminDashboardPage = lazy(() => import('../pages/admin/AdminDashboardPage'));
const SubjectsPage = lazy(() => import('../pages/admin/SubjectsPage'));
const DirectionsPage = lazy(() => import('../pages/admin/DirectionsPage'));
const AdminGroupsPage = lazy(() => import('../pages/admin/GroupsPage'));

interface MenuItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
}

// Admin menu — only management + statistics
const adminMenuDef: MenuItem[] = [
  { path: '/teacher/dashboard', label: 'Statistika', icon: BarChart3 },
  { path: '/teacher/admin/branches', label: 'Filiallar', icon: Building2, roles: ['SUPER_ADMIN'] },
  { path: '/teacher/admin/users', label: 'Foydalanuvchilar', icon: UserCog },
  { path: '/teacher/admin/subjects', label: 'Fanlar', icon: BookMarked },
  { path: '/teacher/admin/directions', label: 'Yo\'nalishlar', icon: Compass },
  { path: '/teacher/admin/groups', label: 'Guruhlar', icon: GraduationCap },
];

// Teacher menu — teaching features only
const teacherMenuDef: MenuItem[] = [
  { path: '/teacher/dashboard', label: 'Bosh sahifa', icon: LayoutDashboard },
  { path: '/teacher/groups', label: 'Mening guruhlarim', icon: Users },
  { path: '/teacher/assignments', label: 'Topshiriqlar', icon: ClipboardList },
  { path: '/teacher/tests', label: 'Testlar', icon: FileText },
  { path: '/teacher/block-tests', label: 'Blok testlar', icon: BookOpen },
  { path: '/teacher/scanner', label: 'Javob Tekshirish', icon: ScanLine },
];

export default function TeacherLayout() {
  const { logout, user } = useAuthStore();
  const { isAdmin, isSuperAdmin } = usePermissions();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  // Role-based menu: admin sees management, teacher sees teaching
  const visibleMenuItems = isAdmin
    ? adminMenuDef.filter(item => !item.roles || (user?.role && item.roles.includes(user.role)))
    : teacherMenuDef;

  const panelTitle = isSuperAdmin ? 'Admin' : isAdmin ? 'Filial Admin' : 'O\'qituvchi';

  // Bottom navigation for mobile
  const bottomNavItems = visibleMenuItems.slice(0, 3);
  const moreMenuItems = visibleMenuItems.slice(3);

  const renderSidebarItem = (item: MenuItem, gradient: string, hoverColor: string) => {
    const Icon = item.icon;
    const active = isActive(item.path);
    return (
      <Link
        key={item.path}
        to={item.path}
        className={`
          flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 group relative
          ${active
            ? `bg-gradient-to-r ${gradient} text-white shadow-lg`
            : 'text-slate-700 hover:bg-slate-100'
          }
        `}
      >
        <Icon className={`w-5 h-5 flex-shrink-0 transition-transform ${
          active ? 'text-white' : `text-slate-500 group-hover:${hoverColor}`
        }`} />
        {sidebarOpen && <span className="font-semibold flex-1">{item.label}</span>}
        {!sidebarOpen && active && (
          <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b ${gradient} rounded-r-full`} />
        )}
      </Link>
    );
  };

  const sidebarGradient = isAdmin
    ? 'from-emerald-500 to-teal-500'
    : 'from-indigo-500 to-purple-500';
  const sidebarHoverColor = isAdmin ? 'text-emerald-500' : 'text-indigo-500';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 flex flex-col">
      {/* Top Header - Mobile Only */}
      <header className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b-2 border-slate-200 z-40 h-16 flex items-center justify-between px-4 shadow-sm">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 bg-gradient-to-br ${isAdmin ? 'from-emerald-500 to-teal-500' : 'from-indigo-500 via-purple-500 to-pink-500'} rounded-xl flex items-center justify-center`}>
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">{panelTitle}</h1>
          </div>
        </div>
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
                  ${active ? 'text-primary' : 'text-gray-500'}
                `}
              >
                <div className={`p-2 rounded-xl transition-all duration-200 ${active ? 'bg-primary/10 scale-110' : ''}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium truncate max-w-full px-1">
                  {item.label.split(' ')[0]}
                </span>
              </Link>
            );
          })}
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
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl animate-slide-up max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-3xl">
              <h3 className="text-lg font-bold text-slate-900">Menyu</h3>
              <button onClick={() => setMobileMenuOpen(false)} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
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
                        ? `bg-gradient-to-r ${sidebarGradient} text-white shadow-lg`
                        : 'text-slate-700 hover:bg-slate-100'
                      }
                    `}
                  >
                    <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-white' : 'text-slate-500'}`} />
                    <span className="font-semibold flex-1">{item.label}</span>
                    {active && <ChevronRight className="w-5 h-5 text-white" />}
                  </Link>
                );
              })}
              <button
                onClick={() => { setMobileMenuOpen(false); logout(); }}
                className="flex items-center gap-4 w-full px-4 py-3.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-colors border border-red-200 mt-4"
              >
                <LogOut className="w-5 h-5" />
                <span className="font-semibold">Chiqish</span>
              </button>
            </div>
            <div className="border-t border-slate-200 p-4 bg-slate-50">
              <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200">
                <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center text-white font-bold shadow-md">
                  {user?.username?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{user?.username}</p>
                  <p className="text-xs text-slate-500">{panelTitle}</p>
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
        <div className="h-20 flex items-center justify-between px-5 border-b border-slate-200 flex-shrink-0">
          {sidebarOpen && (
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 bg-gradient-to-br ${isAdmin ? 'from-emerald-500 to-teal-500' : 'from-indigo-500 via-purple-500 to-pink-500'} rounded-2xl flex items-center justify-center shadow-lg`}>
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">{panelTitle}</h1>
                <p className="text-xs text-slate-500">Panel</p>
              </div>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors hidden lg:block"
          >
            {sidebarOpen ? <X className="w-5 h-5 text-slate-600" /> : <Menu className="w-5 h-5 text-slate-600" />}
          </button>
        </div>

        <nav className="flex-1 py-6 overflow-y-auto">
          <div className="space-y-1.5 px-3">
            {visibleMenuItems.map((item) => renderSidebarItem(item, sidebarGradient, sidebarHoverColor))}
          </div>
        </nav>

        <div className="border-t border-slate-200 p-4 flex-shrink-0 bg-slate-50">
          {sidebarOpen && (
            <div className="mb-3 px-2">
              <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 transition-colors">
                <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center text-white font-bold shadow-md">
                  {user?.username?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{user?.username}</p>
                  <p className="text-xs text-slate-500">{panelTitle}</p>
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
              <Route path="/dashboard" element={isAdmin ? <AdminDashboardPage /> : <TeacherDashboardPage />} />
              {/* Teacher routes */}
              <Route path="/groups" element={<MyGroupsPage />} />
              <Route path="/groups/:id" element={<GroupDetailPage />} />
              <Route path="/assignments" element={<AssignmentsPage />} />
              <Route path="/assignments/create" element={<CreateAssignmentPage />} />
              <Route path="/assignments/edit/:id" element={<CreateAssignmentPage />} />
              <Route path="/assignments/:id" element={<AssignmentDetailPage />} />
              <Route path="/tests" element={<TestsPage />} />
              <Route path="/tests/create" element={<CreateTestPage />} />
              <Route path="/tests/import" element={<UnifiedTestImportPage />} />
              <Route path="/tests/edit/:id" element={<CreateTestPage />} />
              <Route path="/tests/:id" element={<TestViewPage />} />
              <Route path="/tests/:id/configure" element={<ConfigureTestPage />} />
              <Route path="/tests/:id/print/:type" element={<TestPrintPage />} />
              <Route path="/block-tests" element={<BlockTestsPage />} />
              <Route path="/block-tests/create" element={<CreateBlockTestPage />} />
              <Route path="/block-tests/import" element={<ImportBlockTestPage />} />
              <Route path="/block-tests/merge" element={<MergeBlockTestsPage />} />
              <Route path="/block-tests/:id/configure" element={<ConfigureBlockTestPage />} />
              <Route path="/block-tests/:id" element={<ConfigureBlockTestPage />} />
              <Route path="/block-tests/:id/edit" element={<EditBlockTestPage />} />
              <Route path="/block-tests/:id/edit-subject/:subjectIndex" element={<EditBlockTestSubjectPage />} />
              <Route path="/block-tests/:id/variants" element={<BlockTestVariantsPage />} />
              <Route path="/block-tests/:id/print/:type" element={<TestPrintPage />} />
              <Route path="/titul-generator" element={<TitulGeneratorPage />} />
              <Route path="/scanner" element={<OMRCheckerPage />} />
              {/* Admin routes */}
              <Route path="/admin/crm-sync" element={<CrmSyncPage />} />
              <Route path="/admin/branches" element={<BranchesPage />} />
              <Route path="/admin/users" element={<AdminUsersPage />} />
              <Route path="/admin/subjects" element={<SubjectsPage />} />
              <Route path="/admin/directions" element={<DirectionsPage />} />
              <Route path="/admin/groups" element={<AdminGroupsPage />} />
            </Routes>
          </Suspense>
        </div>
      </main>
    </div>
  );
}
