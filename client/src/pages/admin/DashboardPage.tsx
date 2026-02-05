import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';
import { 
  Building2, 
  BookOpen, 
  Users, 
  GraduationCap, 
  ChevronRight, 
  TrendingUp,
  Sparkles,
  BarChart3,
  Percent,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { PageNavbar } from '@/components/ui/PageNavbar';
import { StatsCard } from '@/components/ui/StatsCard';

interface BranchStats {
  _id: string;
  name: string;
  studentsCount: number;
  teachersCount: number;
  groupsCount: number;
  averageScore: number;
}

interface Statistics {
  totalBranches: number;
  totalSubjects: number;
  totalStudents: number;
  totalTeachers: number;
  branches: BranchStats[];
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Statistics>({
    totalBranches: 0,
    totalSubjects: 0,
    totalStudents: 0,
    totalTeachers: 0,
    branches: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const { data } = await api.get('/statistics');
      setStats({
        totalBranches: data.totalBranches || 0,
        totalSubjects: data.totalSubjects || 0,
        totalStudents: data.totalStudents || 0,
        totalTeachers: data.totalTeachers || 0,
        branches: data.branches || []
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate overall average score across all branches
  const calculateOverallPercentage = () => {
    if (!stats.branches.length) return 0;
    const totalPercentage = stats.branches.reduce((sum, branch) => sum + branch.averageScore, 0);
    return Math.round(totalPercentage / stats.branches.length);
  };

  const statCards = [
    { 
      title: 'Filiallar', 
      value: stats.totalBranches, 
      icon: Building2, 
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600'
    },
    { 
      title: 'Fanlar', 
      value: stats.totalSubjects, 
      icon: BookOpen, 
      color: 'bg-green-500',
      bgColor: 'bg-green-50',
      textColor: 'text-green-600'
    },
    { 
      title: "O'quvchilar", 
      value: stats.totalStudents, 
      icon: GraduationCap, 
      color: 'bg-purple-500',
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-600'
    },
    { 
      title: "O'qituvchilar", 
      value: stats.totalTeachers, 
      icon: Users, 
      color: 'bg-orange-500',
      bgColor: 'bg-orange-50',
      textColor: 'text-orange-600'
    },
  ];

  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-6 lg:space-y-8 p-3 sm:p-4 lg:p-6 bg-gradient-to-br from-gray-50 via-blue-50/20 to-purple-50/20 min-h-screen">
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg border border-gray-100 p-4 sm:p-6">
          <div className="animate-pulse">
            <div className="h-6 sm:h-8 bg-gray-200 rounded-lg w-32 sm:w-48 mb-2"></div>
            <div className="h-3 sm:h-4 bg-gray-200 rounded w-48 sm:w-64"></div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 lg:gap-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-white rounded-xl sm:rounded-2xl shadow-lg border border-gray-100 p-4 sm:p-6">
              <div className="animate-pulse">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gray-200 rounded-xl sm:rounded-2xl mb-3 sm:mb-4"></div>
                <div className="h-2.5 sm:h-3 bg-gray-200 rounded w-16 sm:w-20 mb-2 sm:mb-3"></div>
                <div className="h-8 sm:h-10 bg-gray-200 rounded w-12 sm:w-16"></div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl sm:rounded-2xl shadow-lg border border-gray-100 p-4 sm:p-6">
              <div className="animate-pulse">
                <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gray-200 rounded-xl sm:rounded-2xl"></div>
                  <div className="flex-1">
                    <div className="h-4 sm:h-5 bg-gray-200 rounded w-24 sm:w-32 mb-2"></div>
                    <div className="h-2.5 sm:h-3 bg-gray-200 rounded w-12 sm:w-16"></div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <div className="h-16 sm:h-20 bg-gray-200 rounded-lg sm:rounded-xl"></div>
                  <div className="h-16 sm:h-20 bg-gray-200 rounded-lg sm:rounded-xl"></div>
                  <div className="h-16 sm:h-20 bg-gray-200 rounded-lg sm:rounded-xl"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8 p-3 sm:p-4 lg:p-6 gradient-mesh min-h-screen">
      {/* Header */}
      <div className="animate-fade-in">
        <PageNavbar
          title="Bosh sahifa"
          description="Umumiy statistika va filiallar"
          badge="Live"
          gradient={true}
          showAddButton={true}
          addButtonText="Yangi filial"
          onAddClick={() => navigate('/admin/branches')}
        />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 lg:gap-6 animate-slide-up">
        <StatsCard
          title="Filiallar"
          value={stats.totalBranches}
          icon={Building2}
          color="blue"
          gradient={true}
          subtitle="Jami faol filiallar"
        />
        
        <StatsCard
          title="Fanlar"
          value={stats.totalSubjects}
          icon={BookOpen}
          color="green"
          gradient={true}
          subtitle="O'quv fanlari"
        />
        
        <StatsCard
          title="O'quvchilar"
          value={stats.totalStudents}
          icon={GraduationCap}
          color="purple"
          gradient={true}
          subtitle="Ro'yxatdan o'tgan"
        />
        
        <StatsCard
          title="O'qituvchilar"
          value={stats.totalTeachers}
          icon={Users}
          color="orange"
          gradient={true}
          subtitle="Faol o'qituvchilar"
        />
        
        <StatsCard
          title="O'rtacha foiz"
          value={`${calculateOverallPercentage()}%`}
          icon={Percent}
          color={
            calculateOverallPercentage() >= 80 ? 'green' :
            calculateOverallPercentage() >= 60 ? 'orange' : 'red'
          }
          gradient={true}
          subtitle="Test natijalari"
        />
      </div>

      {/* Branches List */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div>
            <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-blue-600" />
              Filiallar
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1">Barcha filiallar va ularning statistikasi</p>
          </div>
          <Button 
            variant="outline" 
            size="default" 
            onClick={() => navigate('/admin/statistics')}
            className="group w-full sm:w-auto"
            fullWidth={false}
          >
            <span className="truncate">Batafsil statistika</span>
            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform flex-shrink-0" />
          </Button>
        </div>

        {stats.branches.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
            {stats.branches.map((branch, index) => (
              <div
                key={branch._id}
                className="group relative bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer overflow-hidden border border-gray-100"
                onClick={() => navigate(`/admin/branches/${branch._id}/statistics`)}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                
                <div className="relative p-4 sm:p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4 sm:mb-5">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <div className="relative flex-shrink-0">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform duration-300">
                          <Building2 className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                        </div>
                        <div className="absolute -top-1 -right-1 w-3 h-3 sm:w-4 sm:h-4 bg-green-500 rounded-full border-2 border-white"></div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-gray-900 text-base sm:text-lg group-hover:text-blue-600 transition-colors truncate">
                          {branch.name}
                        </h3>
                        <p className="text-xs text-gray-500 font-medium">Filial</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all flex-shrink-0" />
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-3 sm:mb-4">
                    <div className="text-center p-2 sm:p-3 bg-purple-50 rounded-xl group-hover:bg-purple-100 transition-colors">
                      <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 mx-auto mb-1" />
                      <p className="text-base sm:text-lg font-bold text-gray-900">{branch.studentsCount}</p>
                      <p className="text-xs text-gray-600 truncate">O'quvchi</p>
                    </div>

                    <div className="text-center p-2 sm:p-3 bg-orange-50 rounded-xl group-hover:bg-orange-100 transition-colors">
                      <Users className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 mx-auto mb-1" />
                      <p className="text-base sm:text-lg font-bold text-gray-900">{branch.teachersCount}</p>
                      <p className="text-xs text-gray-600 truncate">O'qituvchi</p>
                    </div>

                    <div className="text-center p-2 sm:p-3 bg-green-50 rounded-xl group-hover:bg-green-100 transition-colors">
                      <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 mx-auto mb-1" />
                      <p className="text-base sm:text-lg font-bold text-gray-900">{branch.groupsCount}</p>
                      <p className="text-xs text-gray-600 truncate">Guruh</p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="pt-3 sm:pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        O'rtacha foiz
                      </span>
                      <span className={`text-xs sm:text-sm font-bold ${
                        branch.averageScore >= 80 ? 'text-green-600' :
                        branch.averageScore >= 60 ? 'text-orange-600' :
                        'text-red-600'
                      }`}>
                        {branch.averageScore}%
                      </span>
                    </div>
                    <Progress value={branch.averageScore} className="h-2.5" />
                  </div>
                </div>

                {/* Shine effect */}
              </div>
            ))}
          </div>
        ) : (
          <div className="relative bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="relative p-16 text-center">
              <div className="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
                <Building2 className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Filiallar topilmadi</h3>
              <p className="text-gray-600 mb-8 max-w-md mx-auto">
                Hozircha hech qanday filial qo'shilmagan. Birinchi filialni qo'shish uchun quyidagi tugmani bosing.
              </p>
              <Button 
                onClick={() => navigate('/admin/branches')}
                size="lg"
                className="shadow-xl"
              >
                <Building2 className="w-5 h-5 mr-2" />
                Birinchi filialni qo'shish
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
