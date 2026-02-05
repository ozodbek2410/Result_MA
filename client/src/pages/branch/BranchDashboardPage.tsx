import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Users, GraduationCap, UserCog, Target, Activity } from 'lucide-react';
import { PageNavbar } from '@/components/ui/PageNavbar';
import { StatsCard } from '@/components/ui/StatsCard';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import api from '@/lib/api';

interface BranchStats {
  totalGroups: number;
  totalStudents: number;
  totalTeachers: number;
  totalTests: number;
  totalTestResults: number;
  averageScore: number;
  fillPercentage: number;
  topStudents?: Array<{
    _id: string;
    fullName: string;
    averageScore: number;
    testsCompleted: number;
    rank: number;
  }>;
}

export default function BranchDashboardPage() {
  const [stats, setStats] = useState<BranchStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const [groupsRes, studentsRes, teachersRes, dashboardRes] = await Promise.all([
        api.get('/groups'),
        api.get('/students'),
        api.get('/teachers'),
        api.get('/statistics/branch/dashboard')
      ]);

      // Calculate fill percentage
      const groups = groupsRes.data;
      let totalCapacity = 0;
      let totalStudents = 0;
      
      groups.forEach((group: any) => {
        totalCapacity += group.capacity || 20;
        totalStudents += group.studentsCount || 0;
      });

      const fillPercentage = totalCapacity > 0 ? Math.round((totalStudents / totalCapacity) * 100) : 0;

      setStats({
        totalGroups: groupsRes.data.length,
        totalStudents: studentsRes.data.length,
        totalTeachers: teachersRes.data.length,
        totalTests: 0,
        totalTestResults: 0,
        averageScore: 0,
        fillPercentage,
        topStudents: (dashboardRes.data.topStudents || []).map((student: any, index: number) => ({
          ...student,
          rank: student.rank || index + 1 // Ensure rank is set, fallback to index + 1
        }))
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateTeacherStudentRatio = () => {
    if (!stats || stats.totalTeachers === 0) return 0;
    return Math.round(stats.totalStudents / stats.totalTeachers);
  };

  const calculateActivityRate = () => {
    if (!stats || stats.totalTests === 0) return 0;
    return Math.round((stats.totalTestResults / stats.totalTests) * 100);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageNavbar
          title="Bosh sahifa"
          description="Filial statistikasi"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <SkeletonCard variant="stats" count={4} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <SkeletonCard variant="stats" count={3} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-20 gradient-mesh min-h-screen p-2 sm:p-4 lg:p-6">
      <div className="animate-fade-in">
        <PageNavbar
          title="Bosh sahifa"
          description="Filial statistikasi va umumiy ma'lumotlar"
          gradient={true}
        />
      </div>

      {/* Main Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 animate-slide-up">
        <StatsCard
          title="Guruhlar"
          value={stats?.totalGroups || 0}
          icon={Users}
          color="blue"
          gradient={true}
          subtitle="Faol guruhlar"
        />
        
        <StatsCard
          title="O'quvchilar"
          value={stats?.totalStudents || 0}
          icon={GraduationCap}
          color="purple"
          gradient={true}
          subtitle="Ro'yxatdan o'tgan"
        />
        
        <StatsCard
          title="O'qituvchilar"
          value={stats?.totalTeachers || 0}
          icon={UserCog}
          color="orange"
          gradient={true}
          subtitle="Faol o'qituvchilar"
        />
        
        <StatsCard
          title="Guruh/O'quvchi"
          value={stats?.totalGroups ? Math.round(stats.totalStudents / stats.totalGroups) : 0}
          icon={Activity}
          color="green"
          gradient={true}
          subtitle="O'rtacha o'quvchilar soni"
        />
      </div>

      {/* Top Students Ranking */}
      <Card className="hover-lift glass-card animate-scale-in">
        <CardContent className="p-3 sm:p-4 lg:p-6">
          <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
            <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 gradient-primary rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0">
              <Target className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base sm:text-lg lg:text-2xl font-bold text-foreground truncate">O'quvchilar Reytingi</h3>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                {stats?.topStudents && stats.topStudents.length > 0 
                  ? `Top ${stats.topStudents.length}` 
                  : 'Natijalar'}
              </p>
            </div>
          </div>

          {stats?.totalStudents === 0 ? (
            <div className="text-center py-8 sm:py-12">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-100 rounded-2xl sm:rounded-3xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <GraduationCap className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400" />
              </div>
              <p className="text-sm sm:text-base text-gray-600">Hozircha o'quvchilar yo'q</p>
            </div>
          ) : !stats?.topStudents || stats.topStudents.length === 0 ? (
            <div className="text-center py-8 sm:py-12">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-100 rounded-2xl sm:rounded-3xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <GraduationCap className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400" />
              </div>
              <p className="text-sm sm:text-base text-gray-600">O'quvchilar yuklanmoqda...</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {stats.topStudents.map((student) => {
                const rank = student.rank;
                const isTopThree = rank <= 3;
                
                return (
                  <div 
                    key={student._id}
                    className={`flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg sm:rounded-xl border transition-all ${
                      isTopThree 
                        ? 'bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200' 
                        : 'bg-white border-gray-100'
                    }`}
                  >
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center shadow-md flex-shrink-0 ${
                      rank === 1 ? 'bg-gradient-to-br from-yellow-400 to-yellow-500' :
                      rank === 2 ? 'bg-gradient-to-br from-gray-300 to-gray-400' :
                      rank === 3 ? 'bg-gradient-to-br from-orange-400 to-orange-500' :
                      'bg-gradient-to-br from-blue-500 to-blue-600'
                    }`}>
                      <span className="text-base sm:text-lg font-bold text-white">{rank}</span>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm sm:text-base font-bold text-gray-900 truncate">{student.fullName}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {student.testsCompleted > 0 
                          ? `${student.testsCompleted} test` 
                          : 'Test yo\'q'}
                      </p>
                    </div>
                    
                    <div className="text-right flex-shrink-0">
                      <p className={`text-lg sm:text-xl font-bold ${
                        student.averageScore >= 80 ? 'text-green-600' :
                        student.averageScore >= 60 ? 'text-blue-600' :
                        student.averageScore >= 40 ? 'text-orange-600' :
                        'text-red-600'
                      }`}>
                        {student.averageScore}%
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
