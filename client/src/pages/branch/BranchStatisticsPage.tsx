import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/Card';
import { 
  Users, 
  Building2, 
  GraduationCap, 
  Target,
  Activity,
  UserCog
} from 'lucide-react';
import { PageNavbar } from '@/components/ui/PageNavbar';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import { StatsCard } from '@/components/ui/StatsCard';
import api from '@/lib/api';

interface Statistics {
  totalGroups: number;
  totalStudents: number;
  totalTeachers: number;
  totalTests: number;
  totalTestResults: number;
  averageScore: number;
  groups: Array<{
    _id: string;
    name: string;
    studentsCount: number;
    teacherId?: {
      fullName: string;
    };
    averageScore?: number;
  }>;
}

export default function BranchStatisticsPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStatistics();
  }, []);

  const fetchStatistics = async () => {
    try {
      const [groupsRes, studentsRes, teachersRes, testResultsRes, studentGroupsRes] = await Promise.all([
        api.get('/groups'),
        api.get('/students'),
        api.get('/teachers'),
        api.get('/test-results').catch(() => ({ data: [] })),
        api.get('/observer/student-groups').catch(() => ({ data: [] }))
      ]);

      const testResults = testResultsRes.data;
      const studentGroups = studentGroupsRes.data;

      // Create a map of studentId to groupIds
      const studentToGroupMap: Record<string, string[]> = {};
      studentGroups.forEach((sg: any) => {
        const studentId = sg.studentId?._id || sg.studentId;
        const groupId = sg.groupId?._id || sg.groupId;
        if (!studentToGroupMap[studentId]) {
          studentToGroupMap[studentId] = [];
        }
        studentToGroupMap[studentId].push(groupId);
      });

      // Calculate average score for each group
      const groupScores: Record<string, { total: number; count: number }> = {};
      
      testResults.forEach((result: any) => {
        const studentId = result.studentId?._id || result.studentId;
        if (!studentId) return;

        const groupIds = studentToGroupMap[studentId] || [];
        
        groupIds.forEach((groupId: string) => {
          if (!groupScores[groupId]) {
            groupScores[groupId] = { total: 0, count: 0 };
          }

          if (result.percentage !== undefined && result.percentage !== null) {
            groupScores[groupId].total += result.percentage;
            groupScores[groupId].count += 1;
          }
        });
      });

      const groups = groupsRes.data.map((group: any) => {
        const scores = groupScores[group._id];
        return {
          _id: group._id,
          name: group.name,
          studentsCount: group.studentsCount || 0,
          teacherId: group.teacherId,
          averageScore: scores && scores.count > 0 ? Math.round(scores.total / scores.count) : 0
        };
      });

      // Calculate overall average score
      let totalScore = 0;
      let validResults = 0;
      
      testResults.forEach((result: any) => {
        if (result.percentage !== undefined && result.percentage !== null) {
          totalScore += result.percentage;
          validResults++;
        }
      });

      const averageScore = validResults > 0 ? Math.round(totalScore / validResults) : 0;

      setStats({
        totalGroups: groupsRes.data.length,
        totalStudents: studentsRes.data.length,
        totalTeachers: teachersRes.data.length,
        totalTests: 0,
        totalTestResults: testResults.length,
        averageScore,
        groups
      });
    } catch (error) {
      console.error('Error fetching statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateAveragePerGroup = () => {
    if (!stats || stats.totalGroups === 0) return 0;
    return Math.round(stats.totalStudents / stats.totalGroups);
  };

  const calculateTeacherStudentRatio = () => {
    if (!stats || stats.totalTeachers === 0) return 0;
    return Math.round(stats.totalStudents / stats.totalTeachers);
  };

  const calculateTestsPerStudent = () => {
    if (!stats || stats.totalStudents === 0) return 0;
    return (stats.totalTestResults / stats.totalStudents).toFixed(1);
  };

  const calculateActivityRate = () => {
    if (!stats || stats.totalTests === 0) return 0;
    return Math.round((stats.totalTestResults / stats.totalTests) * 100);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageNavbar
          title="Statistika"
          description="Filial statistikasi"
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
    <div className="space-y-6">
      <PageNavbar
        title="Statistika"
        description="Filial statistikasi va hisobotlar"
      />

      {/* Main Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Guruhlar"
          value={stats?.totalGroups || 0}
          icon={Users}
          color="blue"
          subtitle="Faol guruhlar"
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
          icon={UserCog}
          color="orange"
          subtitle="Faol o'qituvchilar"
        />
        
        <StatsCard
          title="Guruh/O'quvchi"
          value={calculateAveragePerGroup()}
          icon={Activity}
          color="green"
          subtitle="O'rtacha o'quvchilar"
        />
      </div>

      {/* Groups Statistics */}
      <div>
        <div className="mb-4">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            Guruhlar Statistikasi
          </h2>
          <p className="text-sm text-gray-600 mt-1">Har bir guruh bo'yicha ma'lumot</p>
        </div>

        {stats?.groups && stats.groups.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {stats.groups.map((group, index) => (
              <Card 
                key={group._id} 
                className="hover:shadow-xl transition-all duration-300 cursor-pointer border border-gray-200"
                onClick={() => navigate(`/custom/groups/${group._id}`)}
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="relative">
                        <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                          <Users className="w-7 h-7 text-white" />
                        </div>
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
                          <span className="text-xs text-white font-bold">{index + 1}</span>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-900 hover:text-blue-600 transition-colors">{group.name}</h3>
                        {group.teacherId ? (
                          <p className="text-sm text-gray-600">O'qituvchi: {group.teacherId.fullName}</p>
                        ) : (
                          <p className="text-sm text-gray-500 italic">O'qituvchi tayinlanmagan</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-8">
                      <div className="text-center">
                        <div className="flex items-center gap-2 mb-1">
                          <GraduationCap className="w-5 h-5 text-purple-600" />
                          <span className="text-2xl font-bold text-gray-900">{group.studentsCount}</span>
                        </div>
                        <p className="text-xs text-gray-600">O'quvchilar</p>
                      </div>

                      {group.averageScore !== undefined && (
                        <div className="text-center min-w-[100px]">
                          <div className="flex items-center gap-2 mb-1">
                            <Activity className="w-5 h-5 text-blue-600" />
                            <span className={`text-2xl font-bold ${
                              (group.averageScore || 0) >= 80 ? 'text-green-600' :
                              (group.averageScore || 0) >= 60 ? 'text-blue-600' :
                              (group.averageScore || 0) >= 40 ? 'text-orange-600' :
                              'text-red-600'
                            }`}>
                              {group.averageScore}%
                            </span>
                          </div>
                          <p className="text-xs text-gray-600">O'rtacha reyting</p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-16 text-center">
              <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Users className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Guruhlar topilmadi</h3>
              <p className="text-gray-600">Hozircha statistika uchun ma'lumot yo'q</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
