import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { 
  Users, 
  Building2, 
  BookOpen, 
  GraduationCap, 
  Target,
  Activity
} from 'lucide-react';
import { PageNavbar } from '@/components/ui/PageNavbar';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import { StatsCard } from '@/components/ui/StatsCard';
import api from '@/lib/api';

interface Statistics {
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
    fillPercentage?: number;
  }>;
}

export default function StatisticsPage() {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStatistics();
  }, []);

  const fetchStatistics = async () => {
    try {
      const { data } = await api.get('/statistics');
      setStats(data);
    } catch (error) {
      console.error('Error fetching statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageNavbar
          title="Statistika"
          description="Umumiy tizim statistikasi"
        />
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <SkeletonCard variant="stats" count={4} />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <SkeletonCard variant="stats" count={3} />
        </div>
        
        <div>
          <div className="h-6 bg-gray-200 rounded w-48 mb-4 animate-pulse"></div>
          <div className="space-y-4">
            <SkeletonCard variant="list" count={3} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-16 sm:pb-20">
      <PageNavbar
        title="Statistika"
        description="Umumiy tizim statistikasi"
      />

      {/* Main Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        <StatsCard
          title="Jami Filiallar"
          value={stats?.totalBranches || 0}
          icon={Building2}
          color="blue"
          subtitle="Faol filiallar soni"
        />
        
        <StatsCard
          title="O'quvchilar"
          value={stats?.totalStudents || 0}
          icon={GraduationCap}
          color="purple"
          subtitle="Ro'yxatdan o'tgan"
        />
        
        <StatsCard
          title="O'qituvchilar"
          value={stats?.totalTeachers || 0}
          icon={Users}
          color="orange"
          subtitle="Faol o'qituvchilar"
        />
        
        <StatsCard
          title="Fanlar"
          value={stats?.totalSubjects || 0}
          icon={BookOpen}
          color="green"
          subtitle="O'quv fanlari"
        />
      </div>

      {/* Branches Statistics */}
      <div>
        <div className="mb-3 sm:mb-4">
          <h2 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
            Filiallar Statistikasi
          </h2>
          <p className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1">Har bir filial bo'yicha ma'lumot</p>
        </div>

        {stats?.branches && stats.branches.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:gap-4">
            {stats.branches.map((branch, index) => (
              <Card 
                key={branch._id} 
                className="hover:shadow-lg transition-all duration-300"
              >
                <CardContent className="p-4 sm:p-5 lg:p-6">
                  {/* Mobile Layout */}
                  <div className="lg:hidden">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="relative flex-shrink-0">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                          <Building2 className="w-6 h-6 text-white" />
                        </div>
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
                          <span className="text-xs text-white font-bold">{index + 1}</span>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-bold text-gray-900 truncate">{branch.name}</h3>
                        <p className="text-xs text-gray-500">Filial #{index + 1}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-purple-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <GraduationCap className="w-4 h-4 text-purple-600" />
                          <span className="text-lg font-bold text-gray-900">{branch.studentsCount}</span>
                        </div>
                        <p className="text-xs text-gray-600">O'quvchilar</p>
                      </div>

                      <div className="bg-orange-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Users className="w-4 h-4 text-orange-600" />
                          <span className="text-lg font-bold text-gray-900">{branch.teachersCount}</span>
                        </div>
                        <p className="text-xs text-gray-600">O'qituvchilar</p>
                      </div>

                      <div className="bg-green-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Target className="w-4 h-4 text-green-600" />
                          <span className="text-lg font-bold text-gray-900">{branch.groupsCount}</span>
                        </div>
                        <p className="text-xs text-gray-600">Guruhlar</p>
                      </div>

                      <div className="bg-blue-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Activity className="w-4 h-4 text-blue-600" />
                          <span className={`text-lg font-bold ${
                            (branch.fillPercentage || 0) >= 100 ? 'text-red-600' :
                            (branch.fillPercentage || 0) >= 80 ? 'text-orange-600' :
                            'text-green-600'
                          }`}>
                            {branch.fillPercentage || 0}%
                          </span>
                        </div>
                        <p className="text-xs text-gray-600">To'ldirilganlik</p>
                      </div>
                    </div>
                  </div>

                  {/* Desktop Layout */}
                  <div className="hidden lg:flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="relative">
                        <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                          <Building2 className="w-7 h-7 text-white" />
                        </div>
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
                          <span className="text-xs text-white font-bold">{index + 1}</span>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">{branch.name}</h3>
                        <p className="text-sm text-gray-500">Filial #{index + 1}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-8">
                      <div className="text-center">
                        <div className="flex items-center gap-2 mb-1">
                          <GraduationCap className="w-5 h-5 text-purple-600" />
                          <span className="text-2xl font-bold text-gray-900">{branch.studentsCount}</span>
                        </div>
                        <p className="text-xs text-gray-600">O'quvchilar</p>
                      </div>

                      <div className="text-center">
                        <div className="flex items-center gap-2 mb-1">
                          <Users className="w-5 h-5 text-orange-600" />
                          <span className="text-2xl font-bold text-gray-900">{branch.teachersCount}</span>
                        </div>
                        <p className="text-xs text-gray-600">O'qituvchilar</p>
                      </div>

                      <div className="text-center">
                        <div className="flex items-center gap-2 mb-1">
                          <Target className="w-5 h-5 text-green-600" />
                          <span className="text-2xl font-bold text-gray-900">{branch.groupsCount}</span>
                        </div>
                        <p className="text-xs text-gray-600">Guruhlar</p>
                      </div>

                      <div className="text-center min-w-[100px]">
                        <div className="flex items-center gap-2 mb-1">
                          <Activity className="w-5 h-5 text-blue-600" />
                          <span className={`text-2xl font-bold ${
                            (branch.fillPercentage || 0) >= 100 ? 'text-red-600' :
                            (branch.fillPercentage || 0) >= 80 ? 'text-orange-600' :
                            'text-green-600'
                          }`}>
                            {branch.fillPercentage || 0}%
                          </span>
                        </div>
                        <p className="text-xs text-gray-600">To'ldirilganlik</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 sm:py-16 text-center px-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-100 rounded-2xl sm:rounded-3xl flex items-center justify-center mx-auto mb-4 sm:mb-6">
                <Building2 className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400" />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">Filiallar topilmadi</h3>
              <p className="text-sm sm:text-base text-gray-600">Hozircha statistika uchun ma'lumot yo'q</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
