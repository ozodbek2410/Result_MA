import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import StudentActivityModal from '../components/StudentActivityModal';
import { GraduationCap, TrendingUp, Calendar, Award, BookOpen, Users, AlertCircle, Bell } from 'lucide-react';

export default function PublicProfile() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data } = await axios.get(`/api/public/profile/${token}`);
        setData(data);
      } catch (error) {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Yuklanmoqda...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-12 pb-12 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Profil topilmadi</h2>
            <p className="text-gray-600">Ushbu havola noto'g'ri yoki eskirgan</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getGradeColor = (percentage: number) => {
    if (percentage >= 90) return 'text-green-600';
    if (percentage >= 70) return 'text-blue-600';
    if (percentage >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header Card */}
        <Card className="border-2 border-primary/20 shadow-xl">
          <CardContent className="pt-8 pb-8">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="w-24 h-24 bg-gradient-to-br from-primary to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
                <GraduationCap className="w-12 h-12 text-white" />
              </div>
              <div className="flex-1 text-center md:text-left">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{data.student.fullName}</h1>
                {data.student.studentCode && (
                  <p className="text-sm text-gray-400 font-mono mb-2">ID: {data.student.studentCode}</p>
                )}
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                  <Badge variant="info" className="text-sm px-3 py-1">
                    {data.student.classNumber}-sinf
                  </Badge>
                  {data.student.direction && (
                    <Badge variant="purple" className="text-sm px-3 py-1">
                      {data.student.direction.nameUzb}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-center gap-3">
                <div className={`text-5xl font-bold ${getGradeColor(data.avgPercentage)} mb-1`}>
                  {data.avgPercentage}%
                </div>
                <p className="text-sm text-gray-600 font-medium">O'rtacha natija</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowActivityModal(true)}
                  className="mt-2"
                >
                  <Bell className="w-4 h-4 mr-1" />
                  O'zgarishlar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg">
            <CardContent className="pt-6 pb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm mb-1">Guruhlar</p>
                  <p className="text-3xl font-bold">{data.groupsCount || 0}</p>
                </div>
                <Users className="w-10 h-10 text-blue-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0 shadow-lg">
            <CardContent className="pt-6 pb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm mb-1">Jami testlar</p>
                  <p className="text-3xl font-bold">{data.results.length}</p>
                </div>
                <BookOpen className="w-10 h-10 text-green-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 shadow-lg">
            <CardContent className="pt-6 pb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm mb-1">Eng yuqori</p>
                  <p className="text-3xl font-bold">
                    {data.results.length > 0 
                      ? Math.max(...data.results.map((r: any) => r.percentage))
                      : 0}%
                  </p>
                </div>
                <Award className="w-10 h-10 text-purple-200" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Groups Section */}
        {data.groups && data.groups.length > 0 && (
          <Card className="shadow-xl">
            <CardHeader className="border-b bg-gray-50">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Guruhlar va fanlar
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.groups.map((group: any) => (
                  <div
                    key={group._id}
                    className="flex items-center gap-4 p-4 border-2 border-gray-100 rounded-xl hover:border-primary/30 hover:shadow-md transition-all"
                  >
                    <div className="w-12 h-12 bg-gradient-to-br from-primary to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <BookOpen className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{group.subjectName}</h3>
                      <p className="text-sm text-gray-600">{group.groupName}</p>
                    </div>
                    <Badge variant="info">{group.letter}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Test Results */}
        <Card className="shadow-xl">
          <CardHeader className="border-b bg-gray-50">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Testlar tarixi
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {data.results.length === 0 ? (
              <div className="text-center py-12">
                <BookOpen className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-600 text-lg">Hali testlar yo'q</p>
                <p className="text-gray-500 text-sm mt-2">Birinchi testni topshiring va natijalar bu yerda ko'rinadi</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.results.map((result: any, index: number) => (
                  <div
                    key={result._id}
                    className="flex items-center gap-4 p-5 border-2 border-gray-100 rounded-xl hover:border-primary/30 hover:shadow-md transition-all cursor-pointer"
                    onClick={() => result.type === 'test' ? navigate(`/test-result/${result._id}/${token}`) : null}
                  >
                    <div className={`w-12 h-12 ${result.type === 'assignment' ? 'bg-purple-100' : 'bg-primary/10'} rounded-xl flex items-center justify-center flex-shrink-0`}>
                      {result.type === 'assignment' ? (
                        <BookOpen className="w-6 h-6 text-purple-600" />
                      ) : (
                        <span className="text-primary font-bold text-lg">#{index + 1}</span>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 truncate">
                          {result.name}
                        </h3>
                        <Badge variant={result.type === 'assignment' ? 'purple' : 'info'} className="text-xs">
                          {result.type === 'assignment' ? 'Topshiriq' : 'Test'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {new Date(result.createdAt).toLocaleDateString('uz-UZ', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                          })}
                        </span>
                        <span className="text-gray-400">•</span>
                        <span>{result.totalPoints}/{result.maxPoints} ball</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`text-3xl font-bold ${getGradeColor(result.percentage)}`}>
                        {result.percentage}%
                      </div>
                      <Badge
                        variant={
                          result.percentage >= 90 ? 'success' :
                          result.percentage >= 70 ? 'info' :
                          result.percentage >= 50 ? 'warning' : 'danger'
                        }
                        className="mt-1"
                      >
                        {result.percentage >= 90 ? 'A\'lo' :
                         result.percentage >= 70 ? 'Yaxshi' :
                         result.percentage >= 50 ? 'Qoniqarli' : 'Qoniqarsiz'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-sm text-gray-600 py-4">
          <p>© 2024 Ta'lim Tizimi • Barcha huquqlar himoyalangan</p>
        </div>
      </div>

      {/* Activity Modal */}
      {showActivityModal && data?.student && (
        <StudentActivityModal
          studentId={data.student._id}
          onClose={() => setShowActivityModal(false)}
        />
      )}
    </div>
  );
}
