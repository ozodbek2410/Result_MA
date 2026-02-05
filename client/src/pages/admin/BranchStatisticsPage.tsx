import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';
import { 
  Building2, 
  GraduationCap, 
  Users, 
  TrendingUp, 
  TrendingDown,
  ArrowLeft, 
  BookOpen, 
  Percent,
  UserCheck,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { SkeletonCard } from '@/components/ui/SkeletonCard';

interface BranchStatistics {
  branch: {
    _id: string;
    name: string;
    location: string;
  };
  studentsCount: number;
  teachersCount: number;
  groupsCount: number;
  groups: Array<{
    _id: string;
    name: string;
    capacity: number;
    studentsCount: number;
    averageScore?: number;
  }>;
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

export default function BranchStatisticsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [stats, setStats] = useState<BranchStatistics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchBranchStats();
    }
  }, [id]);

  const fetchBranchStats = async () => {
    try {
      const { data } = await api.get(`/branches/${id}/statistics`);
      setStats(data);
    } catch (error) {
      console.error('Error fetching branch statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateOverallPercentage = () => {
    if (!stats || !stats.groups.length) return 0;
    
    // Calculate average test percentage across all groups
    let totalPercentage = 0;
    let groupsWithTests = 0;
    
    stats.groups.forEach(group => {
      const groupAvg = group.averageScore || 0;
      if (groupAvg > 0) {
        totalPercentage += groupAvg;
        groupsWithTests++;
      }
    });
    
    return groupsWithTests > 0 ? Math.round(totalPercentage / groupsWithTests) : 0;
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-24 h-10 bg-gray-200 rounded-xl animate-pulse"></div>
          <div className="flex-1">
            <div className="h-8 bg-gray-200 rounded w-48 mb-2 animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded w-64 animate-pulse"></div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <SkeletonCard variant="stats" count={4} />
        </div>
        
        <div>
          <div className="h-6 bg-gray-200 rounded w-32 mb-4 animate-pulse"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <SkeletonCard variant="default" count={6} />
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-pink-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl">
            <AlertCircle className="w-10 h-10 text-white" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-3">Filial topilmadi</h3>
          <p className="text-gray-600 mb-6">Bu filial mavjud emas yoki o'chirilgan</p>
          <Button onClick={() => navigate('/admin')} size="lg">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Bosh sahifaga qaytish
          </Button>
        </motion.div>
      </div>
    );
  }

  const overallPercentage = calculateOverallPercentage();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-3 sm:p-4 lg:p-6 pb-20 sm:pb-24">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 lg:space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4"
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/admin')}
            className="bg-white/80 backdrop-blur-sm hover:bg-white border-gray-200"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Orqaga
          </Button>
          <div className="flex-1 w-full">
            <div className="flex items-center gap-3 sm:gap-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/30"
              >
                <Building2 className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-white" />
              </motion.div>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mb-0.5 sm:mb-1 truncate">{stats.branch.name}</h1>
                <p className="text-xs sm:text-sm lg:text-base text-gray-600 flex items-center gap-2 truncate">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0"></span>
                  <span className="truncate">{stats.branch.location}</span>
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6"
        >
          <motion.div variants={item}>
            <Card className="relative overflow-hidden bg-gradient-to-br from-purple-500 to-purple-600 border-0 shadow-xl shadow-purple-500/20 hover:shadow-2xl hover:shadow-purple-500/30 transition-all duration-300 hover:-translate-y-1">
              <CardContent className="p-4 sm:p-5 lg:p-6">
                <div className="absolute top-0 right-0 w-24 h-24 sm:w-32 sm:h-32 bg-white/10 rounded-full -mr-12 sm:-mr-16 -mt-12 sm:-mt-16"></div>
                <div className="relative">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white/20 backdrop-blur-sm rounded-xl sm:rounded-2xl flex items-center justify-center">
                      <GraduationCap className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                    </div>
                    <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-white/60" />
                  </div>
                  <div>
                    <p className="text-purple-100 font-medium mb-1 sm:mb-2 text-sm sm:text-base">O'quvchilar</p>
                    <p className="text-3xl sm:text-4xl font-bold text-white">{stats.studentsCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={item}>
            <Card className="relative overflow-hidden bg-gradient-to-br from-orange-500 to-orange-600 border-0 shadow-xl shadow-orange-500/20 hover:shadow-2xl hover:shadow-orange-500/30 transition-all duration-300 hover:-translate-y-1">
              <CardContent className="p-4 sm:p-5 lg:p-6">
                <div className="absolute top-0 right-0 w-24 h-24 sm:w-32 sm:h-32 bg-white/10 rounded-full -mr-12 sm:-mr-16 -mt-12 sm:-mt-16"></div>
                <div className="relative">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white/20 backdrop-blur-sm rounded-xl sm:rounded-2xl flex items-center justify-center">
                      <Users className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                    </div>
                    <UserCheck className="w-4 h-4 sm:w-5 sm:h-5 text-white/60" />
                  </div>
                  <div>
                    <p className="text-orange-100 font-medium mb-1 sm:mb-2 text-sm sm:text-base">O'qituvchilar</p>
                    <p className="text-3xl sm:text-4xl font-bold text-white">{stats.teachersCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={item}>
            <Card className="relative overflow-hidden bg-gradient-to-br from-green-500 to-green-600 border-0 shadow-xl shadow-green-500/20 hover:shadow-2xl hover:shadow-green-500/30 transition-all duration-300 hover:-translate-y-1">
              <CardContent className="p-4 sm:p-5 lg:p-6">
                <div className="absolute top-0 right-0 w-24 h-24 sm:w-32 sm:h-32 bg-white/10 rounded-full -mr-12 sm:-mr-16 -mt-12 sm:-mt-16"></div>
                <div className="relative">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white/20 backdrop-blur-sm rounded-xl sm:rounded-2xl flex items-center justify-center">
                      <BookOpen className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                    </div>
                    <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-white/60" />
                  </div>
                  <div>
                    <p className="text-green-100 font-medium mb-1 sm:mb-2 text-sm sm:text-base">Guruhlar</p>
                    <p className="text-3xl sm:text-4xl font-bold text-white">{stats.groupsCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={item}>
            <Card className="relative overflow-hidden bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-xl shadow-blue-500/20 hover:shadow-2xl hover:shadow-blue-500/30 transition-all duration-300 hover:-translate-y-1">
              <CardContent className="p-4 sm:p-5 lg:p-6">
                <div className="absolute top-0 right-0 w-24 h-24 sm:w-32 sm:h-32 bg-white/10 rounded-full -mr-12 sm:-mr-16 -mt-12 sm:-mt-16"></div>
                <div className="relative">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white/20 backdrop-blur-sm rounded-xl sm:rounded-2xl flex items-center justify-center">
                      <Percent className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                    </div>
                    {overallPercentage >= 80 ? (
                      <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-white/60" />
                    ) : (
                      <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-white/60" />
                    )}
                  </div>
                  <div>
                    <p className="text-blue-100 font-medium mb-1 sm:mb-2 text-sm sm:text-base">O'rtacha foiz</p>
                    <p className="text-3xl sm:text-4xl font-bold text-white">{overallPercentage}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>

        {/* Groups List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 mb-4 sm:mb-6">
            <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">Guruhlar ro'yxati</h2>
            <div className="text-xs sm:text-sm text-gray-600">
              Jami: <span className="font-bold text-gray-900">{stats.groups.length}</span> ta guruh
            </div>
          </div>

          {stats.groups && stats.groups.length > 0 ? (
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6"
            >
              {stats.groups.map((group, index) => {
                const avgPercentage = (group as any).averagePercentage || 0;
                const isGood = avgPercentage >= 80;
                const isAverage = avgPercentage >= 60 && avgPercentage < 80;
                const isPoor = avgPercentage < 60;

                return (
                  <motion.div
                    key={group._id}
                    variants={item}
                    whileHover={{ scale: 1.02, y: -5 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <Card className="relative overflow-hidden bg-white border-gray-200 shadow-lg hover:shadow-2xl transition-all duration-300">
                      <div className={`absolute top-0 left-0 right-0 h-1 ${
                        isGood ? 'bg-gradient-to-r from-green-500 to-emerald-500' :
                        isAverage ? 'bg-gradient-to-r from-orange-500 to-yellow-500' :
                        'bg-gradient-to-r from-red-500 to-pink-500'
                      }`}></div>
                      
                      <CardContent className="p-4 sm:p-5 lg:p-6">
                        <div className="flex items-start gap-3 sm:gap-4 mb-4 sm:mb-6">
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: index * 0.05, type: "spring" }}
                            className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg ${
                              isGood ? 'bg-gradient-to-br from-green-500 to-emerald-500' :
                              isAverage ? 'bg-gradient-to-br from-orange-500 to-yellow-500' :
                              'bg-gradient-to-br from-red-500 to-pink-500'
                            }`}
                          >
                            <BookOpen className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                          </motion.div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-gray-900 text-base sm:text-lg mb-0.5 sm:mb-1 truncate">{group.name}</h3>
                            <p className="text-xs sm:text-sm text-gray-500">Guruh</p>
                          </div>
                        </div>
                        
                        <div className="space-y-3 sm:space-y-4">
                          <div className="flex items-center justify-between p-2.5 sm:p-3 bg-gray-50 rounded-lg sm:rounded-xl">
                            <span className="text-xs sm:text-sm font-medium text-gray-600">O'quvchilar</span>
                            <span className="text-lg sm:text-xl font-bold text-gray-900">
                              {group.studentsCount} <span className="text-gray-400">/</span> {group.capacity}
                            </span>
                          </div>
                          
                          <div>
                            <div className="flex items-center justify-between mb-2 sm:mb-3">
                              <span className="text-xs sm:text-sm font-medium text-gray-600">O'rtacha foiz</span>
                              <span className={`text-base sm:text-lg font-bold ${
                                isGood ? 'text-green-600' : 
                                isAverage ? 'text-orange-600' : 
                                'text-red-600'
                              }`}>
                                {avgPercentage}%
                              </span>
                            </div>
                            <div className="relative">
                              <Progress 
                                value={avgPercentage} 
                                className="h-2.5 sm:h-3"
                              />
                            </div>
                          </div>

                          {avgPercentage === 0 && (
                            <div className="flex items-center gap-2 p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl">
                              <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 flex-shrink-0" />
                              <span className="text-xs font-medium text-gray-700">Test natijalari yo'q</span>
                            </div>
                          )}
                          {isGood && avgPercentage > 0 && (
                            <div className="flex items-center gap-2 p-2.5 sm:p-3 bg-green-50 border border-green-200 rounded-lg sm:rounded-xl">
                              <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600 flex-shrink-0" />
                              <span className="text-xs font-medium text-green-700">A'lo natija</span>
                            </div>
                          )}
                          {isAverage && (
                            <div className="flex items-center gap-2 p-2.5 sm:p-3 bg-orange-50 border border-orange-200 rounded-lg sm:rounded-xl">
                              <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-600 flex-shrink-0" />
                              <span className="text-xs font-medium text-orange-700">O'rtacha natija</span>
                            </div>
                          )}
                          {isPoor && avgPercentage > 0 && (
                            <div className="flex items-center gap-2 p-2.5 sm:p-3 bg-red-50 border border-red-200 rounded-lg sm:rounded-xl">
                              <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-600 flex-shrink-0" />
                              <span className="text-xs font-medium text-red-700">Yaxshilash kerak</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <Card className="bg-white/80 backdrop-blur-sm border-gray-200 shadow-xl">
                <CardContent className="p-16 text-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-gray-400 to-gray-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl">
                    <BookOpen className="w-10 h-10 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Guruhlar topilmadi</h3>
                  <p className="text-gray-600">Bu filialda hozircha guruhlar yo'q</p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
