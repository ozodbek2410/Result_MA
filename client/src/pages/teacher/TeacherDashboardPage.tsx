import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, FileText, BookOpen, ArrowRight, Sparkles, CheckCircle2, Trophy, Award, TrendingUp, Medal } from 'lucide-react';
import api from '@/lib/api';

interface RecentActivity {
  id: string;
  type: 'test' | 'block-test' | 'assignment';
  title: string;
  date: string;
  studentsCount?: number;
}

interface TopGroup {
  groupId: string;
  groupName: string;
  studentsCount: number;
  testsCount: number;
  averagePercentage: number;
}

interface TopStudent {
  studentId: string;
  studentName: string;
  groupName: string;
  testsCount: number;
  averagePercentage: number;
}

interface DashboardStats {
  topGroups: TopGroup[];
  topStudents: TopStudent[];
}

export default function TeacherDashboardPage() {
  const [stats, setStats] = useState({
    groups: 0,
    tests: 0,
    blockTests: 0,
    assignments: 0,
    totalStudents: 0,
    activeAssignments: 0
  });
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({
    topGroups: [],
    topStudents: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    fetchDashboardStats();
  }, []);

  const fetchStats = async () => {
    try {
      const [groupsRes, testsRes, blockTestsRes, assignmentsRes] = await Promise.all([
        api.get('/groups'),
        api.get('/tests'),
        api.get('/block-tests'),
        api.get('/assignments')
      ]);

      setStats({
        groups: groupsRes.data.length,
        tests: testsRes.data.length,
        blockTests: blockTestsRes.data.length,
        assignments: assignmentsRes.data.length,
        totalStudents: 0,
        activeAssignments: 0
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDashboardStats = async () => {
    try {
      const response = await api.get('/statistics/teacher/dashboard');
      setDashboardStats(response.data);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    }
  };

  const statsCards = [
    { 
      title: 'Mening guruhlarim', 
      value: stats.groups, 
      icon: Users, 
      gradient: 'from-blue-500 to-cyan-500',
      bgGradient: 'from-blue-50 to-cyan-50',
      link: '/teacher/groups',
      description: 'Faol guruhlar'
    },
    { 
      title: 'Testlar', 
      value: stats.tests, 
      icon: FileText, 
      gradient: 'from-green-500 to-emerald-500',
      bgGradient: 'from-green-50 to-emerald-50',
      link: '/teacher/tests',
      description: 'Yaratilgan testlar'
    },
    { 
      title: 'Blok testlar', 
      value: stats.blockTests, 
      icon: BookOpen, 
      gradient: 'from-purple-500 to-pink-500',
      bgGradient: 'from-purple-50 to-pink-50',
      link: '/teacher/block-tests',
      description: 'Kompleks testlar'
    },
    { 
      title: 'Topshiriqlar', 
      value: stats.assignments, 
      icon: CheckCircle2, 
      gradient: 'from-orange-500 to-red-500',
      bgGradient: 'from-orange-50 to-red-50',
      link: '/teacher/assignments',
      description: 'Berilgan vazifalar'
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/20 pb-20">
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          {/* Header Skeleton */}
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-6 shadow-lg border border-white/50 mb-6 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gray-200 rounded-2xl"></div>
              <div className="flex-1">
                <div className="h-6 w-40 bg-gray-200 rounded mb-2"></div>
                <div className="h-4 w-56 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>

          {/* Stats Skeleton - Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 shadow-md border border-white/50 animate-pulse">
                <div className="w-12 h-12 bg-gray-200 rounded-xl mb-4"></div>
                <div className="h-4 w-24 bg-gray-200 rounded mb-2"></div>
                <div className="h-8 w-16 bg-gray-200 rounded mb-2"></div>
                <div className="h-3 w-32 bg-gray-200 rounded"></div>
              </div>
            ))}
          </div>

          {/* Quick Actions Skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Groups Skeleton */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gray-200 rounded-xl animate-pulse"></div>
                <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>
              </div>
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-md border-2 border-gray-100 overflow-hidden">
                <div className="divide-y divide-gray-100">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="p-4 animate-pulse">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-gray-200 rounded-xl"></div>
                        <div className="flex-1">
                          <div className="h-4 w-32 bg-gray-200 rounded mb-2"></div>
                          <div className="h-3 w-24 bg-gray-200 rounded"></div>
                        </div>
                        <div className="text-right">
                          <div className="h-6 w-16 bg-gray-200 rounded mb-1"></div>
                          <div className="h-3 w-12 bg-gray-200 rounded"></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Top Students Skeleton */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gray-200 rounded-xl animate-pulse"></div>
                <div className="h-6 w-40 bg-gray-200 rounded animate-pulse"></div>
              </div>
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-md border-2 border-gray-100 overflow-hidden">
                <div className="divide-y divide-gray-100">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="p-4 animate-pulse">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-gray-200 rounded-xl"></div>
                        <div className="flex-1">
                          <div className="h-4 w-40 bg-gray-200 rounded mb-2"></div>
                          <div className="h-3 w-32 bg-gray-200 rounded"></div>
                        </div>
                        <div className="text-right">
                          <div className="h-6 w-16 bg-gray-200 rounded mb-1"></div>
                          <div className="h-3 w-12 bg-gray-200 rounded"></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/20 pb-20">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Welcome Header - Enhanced */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl md:rounded-3xl p-4 md:p-6 shadow-lg border border-white/50 mb-4 md:mb-6">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="relative flex-shrink-0">
              <div className="relative w-12 h-12 md:w-16 md:h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl md:rounded-2xl flex items-center justify-center">
                <Sparkles className="w-6 h-6 md:w-8 md:h-8 text-white" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg md:text-2xl font-bold text-gray-900 mb-0.5 md:mb-1">
                Xush kelibsiz!
              </h1>
              <p className="text-xs md:text-sm text-gray-600">Bugungi faoliyatingiz va statistika</p>
            </div>
          </div>
        </div>

        {/* Stats Cards - Grid on Desktop, List on Mobile */}
        <div className="mb-8">
          {/* Desktop Grid View */}
          <div className="hidden sm:grid grid-cols-2 lg:grid-cols-4 gap-4">
            {statsCards.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <Link 
                  key={stat.title} 
                  to={stat.link}
                  className="group block"
                >
                  <div className="relative bg-white/80 backdrop-blur-sm rounded-2xl p-5 shadow-md hover:shadow-xl transition-all duration-300 border border-white/50 hover:border-blue-200 hover:-translate-y-1 overflow-hidden">
                    {/* Background decoration */}
                    <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${stat.gradient} opacity-5 rounded-full -mr-16 -mt-16 group-hover:opacity-10 transition-opacity`}></div>
                    
                    <div className="relative">
                      {/* Icon */}
                      <div className={`inline-flex w-12 h-12 bg-gradient-to-br ${stat.gradient} rounded-xl items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      
                      {/* Content */}
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">
                          {stat.title}
                        </p>
                        <p className="text-3xl font-bold text-gray-900 mb-1">
                          {stat.value}
                        </p>
                        <p className="text-xs text-gray-500">{stat.description}</p>
                      </div>
                      
                      {/* Arrow indicator */}
                      <div className="absolute top-0 right-0">
                        <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all duration-300" />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Mobile List View */}
          <div className="sm:hidden space-y-2">
            {statsCards.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <Link 
                  key={stat.title} 
                  to={stat.link}
                  className="block"
                >
                  <div className="relative bg-white/80 backdrop-blur-sm rounded-xl p-3 shadow-sm active:shadow-md transition-all duration-200 border border-white/50 active:border-blue-200 overflow-hidden">
                    <div className="flex items-center gap-3">
                      {/* Icon */}
                      <div className={`flex-shrink-0 w-10 h-10 bg-gradient-to-br ${stat.gradient} rounded-lg flex items-center justify-center`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-600 mb-0.5">
                          {stat.title}
                        </p>
                        <p className="text-xl font-bold text-gray-900">
                          {stat.value}
                        </p>
                      </div>

                      {/* Arrow */}
                      <ArrowRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Quick Actions - Horizontal Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          {/* Top 5 Groups */}
          <div>
            <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
              <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg md:rounded-xl flex items-center justify-center shadow-md">
                <Trophy className="w-4 h-4 md:w-5 md:h-5 text-white" />
              </div>
              <h2 className="text-lg md:text-xl font-bold text-gray-900">Top 5 Guruhlar</h2>
            </div>
            
            <div className="bg-white/80 backdrop-blur-sm rounded-xl md:rounded-2xl shadow-md border-2 border-gray-100 overflow-hidden">
              {dashboardStats.topGroups.length === 0 ? (
                <div className="p-6 md:p-8 text-center">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-gray-100 rounded-xl md:rounded-2xl mx-auto mb-3 md:mb-4 flex items-center justify-center">
                    <Trophy className="w-6 h-6 md:w-8 md:h-8 text-gray-400" />
                  </div>
                  <p className="text-sm md:text-base text-gray-500">Hozircha ma'lumot yo'q</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {dashboardStats.topGroups.map((group, index) => (
                    <div 
                      key={`group-${group.groupId}-${index}`}
                      className="p-3 md:p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2 md:gap-4">
                        {/* Rank Badge */}
                        <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center font-bold text-white shadow-md flex-shrink-0 text-sm md:text-base ${
                          index === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-500' :
                          index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-400' :
                          index === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-500' :
                          'bg-gradient-to-br from-blue-400 to-blue-500'
                        }`}>
                          {index + 1}
                        </div>
                        
                        {/* Group Info */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 mb-0.5 md:mb-1 text-sm md:text-base truncate">
                            {group.groupName}
                          </h3>
                          <div className="flex items-center gap-2 md:gap-3 text-xs text-gray-500">
                            <span>{group.studentsCount} o'quvchi</span>
                            <span>•</span>
                            <span>{group.testsCount} test</span>
                          </div>
                        </div>
                        
                        {/* Percentage */}
                        <div className="text-right flex-shrink-0">
                          <div className="text-lg md:text-2xl font-bold text-gray-900">
                            {group.averagePercentage}%
                          </div>
                          <div className="text-xs text-gray-500 hidden md:block">o'rtacha</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Top 10 Students */}
          <div>
            <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
              <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-lg md:rounded-xl flex items-center justify-center shadow-md">
                <Award className="w-4 h-4 md:w-5 md:h-5 text-white" />
              </div>
              <h2 className="text-lg md:text-xl font-bold text-gray-900">Top 10 O'quvchilar</h2>
            </div>
            
            <div className="bg-white/80 backdrop-blur-sm rounded-xl md:rounded-2xl shadow-md border-2 border-gray-100 overflow-hidden">
              {dashboardStats.topStudents.length === 0 ? (
                <div className="p-6 md:p-8 text-center">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-gray-100 rounded-xl md:rounded-2xl mx-auto mb-3 md:mb-4 flex items-center justify-center">
                    <Award className="w-6 h-6 md:w-8 md:h-8 text-gray-400" />
                  </div>
                  <p className="text-sm md:text-base text-gray-500">Hozircha ma'lumot yo'q</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {dashboardStats.topStudents.map((student, index) => (
                    <div 
                      key={`student-${student.studentId}-${index}`}
                      className="p-3 md:p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2 md:gap-4">
                        {/* Rank Badge */}
                        <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center font-bold text-white shadow-md flex-shrink-0 text-sm md:text-base ${
                          index === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-500' :
                          index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-400' :
                          index === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-500' :
                          'bg-gradient-to-br from-green-400 to-green-500'
                        }`}>
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                        </div>
                        
                        {/* Student Info */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 mb-0.5 md:mb-1 truncate text-sm md:text-base">
                            {student.studentName}
                          </h3>
                          <div className="flex items-center gap-2 md:gap-3 text-xs text-gray-500">
                            <span className="truncate">{student.groupName}</span>
                            <span>•</span>
                            <span>{student.testsCount} test</span>
                          </div>
                        </div>
                        
                        {/* Percentage */}
                        <div className="text-right flex-shrink-0">
                          <div className="text-lg md:text-2xl font-bold text-gray-900">
                            {student.averagePercentage}%
                          </div>
                          <div className="text-xs text-gray-500 hidden md:block">o'rtacha</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
