import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Dialog, DialogHeader, DialogTitle, DialogContent } from './ui/Dialog';
import { Badge } from './ui/Badge';
import { Card, CardContent } from './ui/Card';
import { 
  GraduationCap, 
  BookOpen, 
  Users, 
  Award, 
  TrendingUp,
  Calendar,
  Phone,
  Target,
  CheckCircle2
} from 'lucide-react';

interface StudentProfileModalProps {
  studentId: string | null;
  onClose: () => void;
}

export default function StudentProfileModal({ studentId, onClose }: StudentProfileModalProps) {
  const [student, setStudent] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (studentId) {
      fetchStudentProfile();
    }
  }, [studentId]);

  const fetchStudentProfile = async () => {
    if (!studentId) return;
    
    setLoading(true);
    try {
      const { data } = await api.get(`/students/${studentId}/profile`);
      setStudent(data);
    } catch (error) {
      console.error('Error fetching student profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const getGradeColor = (percentage: number) => {
    if (percentage >= 90) return 'text-green-600';
    if (percentage >= 70) return 'text-blue-600';
    if (percentage >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (!studentId) return null;

  return (
    <Dialog open={!!studentId} onClose={onClose}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-primary" />
          Profil
        </DialogTitle>
      </DialogHeader>
      <DialogContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : student ? (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-br from-primary/10 to-blue-100/50 rounded-xl p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-gradient-to-br from-primary to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <GraduationCap className="w-8 h-8 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">{student.fullName}</h2>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="info">{student.classNumber}-sinf</Badge>
                    {student.classNumber < 7 ? (
                      <Badge variant="success">Umumiy</Badge>
                    ) : student.directionId ? (
                      <Badge variant="purple">{student.directionId.nameUzb}</Badge>
                    ) : null}
                  </div>
                </div>
              </div>
              
              {student.phone && (
                <div className="flex items-center gap-2 text-gray-700">
                  <Phone className="w-4 h-4" />
                  <span className="text-sm font-medium">{student.phone}</span>
                </div>
              )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0">
                <CardContent className="p-4 text-center">
                  <Users className="w-6 h-6 mx-auto mb-2 text-blue-100" />
                  <p className="text-2xl font-bold">{student.groupsCount || 0}</p>
                  <p className="text-xs text-blue-100">Guruhlar</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0">
                <CardContent className="p-4 text-center">
                  <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-green-100" />
                  <p className="text-2xl font-bold">{student.completedTests || 0}</p>
                  <p className="text-xs text-green-100">Testlar</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0">
                <CardContent className="p-4 text-center">
                  <Award className="w-6 h-6 mx-auto mb-2 text-purple-100" />
                  <p className="text-2xl font-bold">{student.avgPercentage || 0}%</p>
                  <p className="text-xs text-purple-100">O'rtacha</p>
                </CardContent>
              </Card>
            </div>

            {/* Groups */}
            {student.groups && student.groups.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    Guruhlar
                  </h3>
                  <div className="space-y-2">
                    {student.groups.map((group: any) => (
                      <div
                        key={group._id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                            <BookOpen className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{group.subjectName}</p>
                            <p className="text-sm text-gray-500">{group.groupName}</p>
                          </div>
                        </div>
                        <Badge variant="info" size="sm">{group.letter}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent Tests */}
            {student.recentTests && student.recentTests.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    So'nggi testlar
                  </h3>
                  <div className="space-y-2">
                    {student.recentTests.slice(0, 5).map((test: any) => (
                      <div
                        key={test._id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">{test.testName}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(test.createdAt).toLocaleDateString('uz-UZ')}
                          </div>
                        </div>
                        <div className="text-right ml-3">
                          <div className={`text-xl font-bold ${getGradeColor(test.percentage)}`}>
                            {test.percentage}%
                          </div>
                          <p className="text-xs text-gray-500">{test.score}/{test.maxScore}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Empty State */}
            {(!student.groups || student.groups.length === 0) && 
             (!student.recentTests || student.recentTests.length === 0) && (
              <div className="text-center py-8">
                <Target className="w-16 h-16 mx-auto text-gray-300 mb-3" />
                <p className="text-gray-600">Ma'lumotlar yo'q</p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-600">Ma'lumot topilmadi</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
