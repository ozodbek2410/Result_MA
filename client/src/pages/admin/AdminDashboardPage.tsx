import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loading } from '@/components/ui/Loading';
import { usePermissions } from '@/hooks/usePermissions';
import { BarChart3, Users, GraduationCap, BookOpen, Building2, FileText, RefreshCw } from 'lucide-react';

interface SystemStats {
  totalBranches: number;
  totalSubjects: number;
  totalStudents: number;
  totalTeachers: number;
  totalTests: number;
  totalTestResults: number;
  averageScore: number;
  branches: Array<{
    _id: string;
    name: string;
    studentsCount: number;
    teachersCount: number;
    groupsCount: number;
    averageScore: number;
  }>;
}

interface BranchDashboard {
  topStudents: Array<{
    _id: string;
    fullName: string;
    testsCompleted: number;
    averageScore: number;
    rank: number;
  }>;
}

interface SyncStatus {
  isConfigured: boolean;
  syncEnabled: boolean;
  lastSync?: {
    status: string;
    completedAt: string;
    result?: {
      students: { created: number; updated: number };
      teachers: { created: number; updated: number };
    };
  };
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { isSuperAdmin } = usePermissions();

  const { data: stats, isLoading: statsLoading } = useQuery<SystemStats>({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const res = await api.get('/statistics');
      return res.data;
    },
    enabled: isSuperAdmin,
  });

  const { data: branchData, isLoading: branchLoading } = useQuery<BranchDashboard>({
    queryKey: ['branch-dashboard'],
    queryFn: async () => {
      const res = await api.get('/statistics/branch/dashboard');
      return res.data;
    },
    enabled: !isSuperAdmin,
  });

  const { data: syncStatus } = useQuery<SyncStatus>({
    queryKey: ['sync-status'],
    queryFn: async () => {
      const res = await api.get('/crm/sync/status');
      return res.data;
    },
  });

  if (statsLoading || branchLoading) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Statistika"
        description={isSuperAdmin ? 'Umumiy tizim statistikasi' : 'Filial statistikasi'}
        icon={BarChart3}
      />

      {/* CRM Sync Status */}
      {syncStatus?.lastSync && (
        <div className={`mb-6 rounded-lg border p-4 flex items-center gap-3 ${
          syncStatus.lastSync.status === 'completed' ? 'bg-green-50 border-green-200' :
          syncStatus.lastSync.status === 'failed' ? 'bg-red-50 border-red-200' :
          'bg-yellow-50 border-yellow-200'
        }`}>
          <RefreshCw className={`w-5 h-5 ${
            syncStatus.lastSync.status === 'completed' ? 'text-green-600' :
            syncStatus.lastSync.status === 'failed' ? 'text-red-600' :
            'text-yellow-600 animate-spin'
          }`} />
          <div className="flex-1">
            <p className="text-sm font-medium">
              CRM Sync: {syncStatus.lastSync.status === 'completed' ? 'Muvaffaqiyatli' :
                syncStatus.lastSync.status === 'failed' ? 'Xatolik' : 'Jarayonda'}
            </p>
            <p className="text-xs text-gray-500">
              {new Date(syncStatus.lastSync.completedAt).toLocaleString('uz-UZ')}
            </p>
          </div>
        </div>
      )}

      {/* SUPER_ADMIN: System-wide stats */}
      {isSuperAdmin && stats && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard icon={Building2} label="Filiallar" value={stats.totalBranches} color="bg-indigo-500" />
            <StatCard icon={GraduationCap} label="O'quvchilar" value={stats.totalStudents} color="bg-emerald-500" />
            <StatCard icon={Users} label="O'qituvchilar" value={stats.totalTeachers} color="bg-purple-500" />
            <StatCard icon={BookOpen} label="Fanlar" value={stats.totalSubjects} color="bg-amber-500" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            <StatCard icon={FileText} label="Testlar" value={stats.totalTests} color="bg-blue-500" />
            <StatCard icon={FileText} label="Test natijalari" value={stats.totalTestResults} color="bg-cyan-500" />
            <StatCard icon={BarChart3} label="O'rtacha ball" value={`${stats.averageScore}%`} color="bg-rose-500" />
          </div>

          {/* Branches table */}
          {stats.branches.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200">
                <h3 className="font-semibold text-gray-900">Filiallar bo'yicha statistika</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Filial</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">O'quvchilar</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">O'qituvchilar</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Guruhlar</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">O'rtacha ball</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {stats.branches.map((branch) => (
                      <tr key={branch._id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{branch.name}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{branch.studentsCount}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{branch.teachersCount}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{branch.groupsCount}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-semibold ${branch.averageScore >= 70 ? 'text-green-600' : branch.averageScore >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                            {branch.averageScore}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* FIL_ADMIN: Branch stats */}
      {!isSuperAdmin && branchData && (
        <>
          {branchData.topStudents.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200">
                <h3 className="font-semibold text-gray-900">Top o'quvchilar reytingi</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-16">#</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">O'quvchi</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Testlar</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">O'rtacha ball</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {branchData.topStudents.slice(0, 50).map((student) => (
                      <tr key={student._id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex w-8 h-8 items-center justify-center rounded-full text-sm font-bold ${
                            student.rank <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {student.rank}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{student.fullName}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{student.testsCompleted}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-semibold ${student.averageScore >= 70 ? 'text-green-600' : student.averageScore >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                            {student.averageScore}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <GraduationCap className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Hali test natijalari yo'q</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
