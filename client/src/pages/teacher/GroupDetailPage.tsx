import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PageNavbar } from '@/components/ui/PageNavbar';
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/Dialog';
import { Checkbox } from '@/components/ui/Checkbox';
import { useToast } from '@/hooks/useToast';
import StudentProfileModal from '@/components/StudentProfileModal';
import StudentQRCode from '@/components/StudentQRCode';
import { 
  ArrowLeft,
  Users, 
  GraduationCap,
  Calendar,
  MapPin,
  User,
  FileText,
  Plus,
  Search,
  BarChart3,
  QrCode
} from 'lucide-react';
import { Input } from '@/components/ui/Input';

export default function GroupDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [addingStudents, setAddingStudents] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [qrStudent, setQrStudent] = useState<any>(null);
  const { success, error } = useToast();

  useEffect(() => {
    if (id) {
      fetchGroupDetails();
      fetchStudents();
      fetchTests();
    }
  }, [id]);

  const fetchGroupDetails = async () => {
    try {
      const { data } = await api.get(`/groups/${id}`);
      setGroup(data);
    } catch (error: any) {
      console.error('Error fetching group:', error);
      if (error.response?.status === 403) {
        // Нет доступа к группе
        setGroup(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async () => {
    try {
      const { data } = await api.get(`/students?groupId=${id}`);
      setStudents(data);
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  };

  const fetchTests = async () => {
    try {
      const { data } = await api.get(`/tests?groupId=${id}`);
      setTests(data);
    } catch (error) {
      console.error('Error fetching tests:', error);
    }
  };

  const fetchAllStudents = async () => {
    try {
      // Получаем всех студентов филиала с этим предметом
      const { data } = await api.get('/students', {
        params: {
          subjectId: group.subjectId?._id || group.subjectId,
          classNumber: group.classNumber
        }
      });
      setAllStudents(data);
    } catch (err) {
      console.error('Error fetching all students:', err);
    }
  };

  const handleAddStudents = async () => {
    if (selectedStudents.length === 0) {
      error('Kamida bitta o\'quvchi tanlang');
      return;
    }

    setAddingStudents(true);
    try {
      // Har bir o'quvchini qo'shish
      await Promise.all(
        selectedStudents.map(studentId =>
          api.post(`/teacher/groups/${id}/students/${studentId}`)
        )
      );
      
      success(`${selectedStudents.length} ta o'quvchi qo'shildi!`);
      setShowAddModal(false);
      setSelectedStudents([]);
      fetchStudents();
    } catch (err: any) {
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    } finally {
      setAddingStudents(false);
    }
  };

  const toggleStudent = (studentId: string) => {
    setSelectedStudents(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const filteredStudents = students.filter(student =>
    student.fullName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Card className="border-0 shadow-soft">
          <CardContent className="py-16 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-red-100 to-red-200 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Users className="w-10 h-10 text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Guruhga kirish rad etildi</h3>
            <p className="text-gray-600 mb-6">Bu guruh sizga biriktirilmagan yoki mavjud emas</p>
            <Button onClick={() => navigate('/teacher/groups')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Mening guruhlarimga qaytish
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in pb-24 sm:pb-24">
      {/* Mobile-friendly Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate('/teacher/groups')}
            className="flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-900 truncate">{group.name}</h1>
            <p className="text-xs sm:text-sm text-slate-600 hidden sm:block">Guruh tafsilotlari va o'quvchilar</p>
          </div>
        </div>
        <Button 
          size="sm"
          onClick={() => {
            fetchAllStudents();
            setShowAddModal(true);
          }}
          className="flex-shrink-0"
        >
          <Plus className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">O'quvchi qo'shish</span>
        </Button>
      </div>

      {/* Add Students Modal */}
      <Dialog open={showAddModal} onClose={() => setShowAddModal(false)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-green-600" />
            O'quvchilarni guruhga qo'shish
          </DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Guruhga qo'shmoqchi bo'lgan o'quvchilarni tanlang
            </p>

            <div className="max-h-96 overflow-y-auto space-y-2 border border-gray-200 rounded-lg p-3">
              {allStudents.length === 0 ? (
                <p className="text-center text-gray-500 py-8">
                  Bu fandan va sinfdan o'quvchilar yo'q.
                </p>
              ) : (
                allStudents
                  .filter(student => !students.find(s => s._id === student._id))
                  .length === 0 ? (
                    <p className="text-center text-gray-500 py-8">
                      Barcha o'quvchilar allaqachon bu guruhda.
                    </p>
                  ) : (
                    allStudents
                      .filter(student => !students.find(s => s._id === student._id))
                      .map((student) => {
                        // Найти группу студента для этого предмета
                        const studentGroupForSubject = student.groups?.find((g: any) => {
                          const groupSubjectId = g.subjectId?._id || g.subjectId;
                          const currentSubjectId = group.subjectId?._id || group.subjectId;
                          return groupSubjectId?.toString() === currentSubjectId?.toString();
                        });
                        
                        return (
                          <label
                            key={student._id}
                            className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                          >
                            <Checkbox
                              checked={selectedStudents.includes(student._id)}
                              onChange={() => toggleStudent(student._id)}
                            />
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">{student.fullName}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <p className="text-sm text-gray-500">{student.classNumber}-sinf</p>
                                {studentGroupForSubject && (
                                  <Badge variant="warning" size="sm">
                                    {studentGroupForSubject.name}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </label>
                        );
                      })
                  )
              )}
            </div>

            {selectedStudents.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>{selectedStudents.length}</strong> ta o'quvchi tanlandi
                </p>
              </div>
            )}

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-xs text-yellow-800">
                ⚠️ <strong>Diqqat:</strong> Agar o'quvchi shu fandan boshqa guruhda bo'lsa, avtomatik ravishda o'sha guruhdan chiqariladi va bu guruhga qo'shiladi.
              </p>
            </div>

            <div className="flex gap-2 pt-4">
              <Button 
                onClick={handleAddStudents} 
                loading={addingStudents}
                disabled={selectedStudents.length === 0}
                className="bg-green-600 hover:bg-green-700"
              >
                Qo'shish
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedStudents([]);
                }}
              >
                Bekor qilish
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Group Info Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <Card className="border-0 shadow-soft bg-gradient-to-br from-blue-50 to-blue-100/50">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600">Sinf</p>
                <p className="text-base sm:text-xl font-bold text-gray-900 mt-0.5 sm:mt-1">
                  {group.classNumber}-sinf
                </p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-soft flex-shrink-0">
                <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-soft bg-gradient-to-br from-green-50 to-green-100/50">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600">O'quvchilar</p>
                <p className="text-base sm:text-xl font-bold text-gray-900 mt-0.5 sm:mt-1">{students.length} ta</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-soft flex-shrink-0">
                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-soft bg-gradient-to-br from-orange-50 to-orange-100/50">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600">Testlar</p>
                <p className="text-base sm:text-xl font-bold text-gray-900 mt-0.5 sm:mt-1">{tests.length} ta</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-soft flex-shrink-0">
                <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Group Details */}
      <Card className="border-0 shadow-soft">
        <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100 border-b">
          <CardTitle className="text-lg">Guruh ma'lumotlari</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Guruh nomi</p>
                  <p className="font-semibold text-gray-900">{group.name}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                  <GraduationCap className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Sinf</p>
                  <p className="font-semibold text-gray-900">{group.classNumber}-sinf ({group.letter})</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                  <User className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">O'qituvchi</p>
                  <p className="font-semibold text-gray-900">
                    {group.teacherId?.fullName || 'Biriktirilmagan'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-pink-100 rounded-xl flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-pink-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Filial</p>
                  <p className="font-semibold text-gray-900">
                    {group.branchId?.name || 'N/A'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Yaratilgan</p>
                  <p className="font-semibold text-gray-900">
                    {new Date(group.createdAt).toLocaleDateString('uz-UZ')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Students List */}
      <Card className="border-0 shadow-soft">
        <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">O'quvchilar ro'yxati</CardTitle>
            <Badge variant="info" size="md">
              {students.length} ta o'quvchi
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                placeholder="O'quvchi qidirish..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {filteredStudents.length > 0 ? (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                        #
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                        F.I.O
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                        Telefon
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                        Status
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                        Amallar
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredStudents.map((student, index) => (
                      <tr 
                        key={student._id} 
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-6 py-4 text-sm text-gray-900">{index + 1}</td>
                        <td 
                          className="px-6 py-4 cursor-pointer"
                          onClick={() => setSelectedStudentId(student._id)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center text-white font-bold">
                              {student.fullName?.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-gray-900">{student.fullName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{student.phone || 'N/A'}</td>
                        <td className="px-6 py-4">
                          <Badge variant="success" size="sm">Faol</Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setQrStudent(student);
                              }}
                              className="p-2 hover:bg-purple-50 rounded-lg transition-colors"
                              title="QR kod"
                            >
                              <QrCode className="w-4 h-4 text-purple-600" />
                            </button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setSelectedStudentId(student._id)}
                            >
                              <BarChart3 className="w-4 h-4 mr-1" />
                              Natijalar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile List View */}
              <div className="md:hidden space-y-3">
                {filteredStudents.map((student, index) => (
                  <div
                    key={student._id}
                    className="p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-300 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0">
                        {student.fullName?.charAt(0).toUpperCase()}
                      </div>
                      <div 
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => setSelectedStudentId(student._id)}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-gray-500">#{index + 1}</span>
                          <Badge variant="success" size="sm">Faol</Badge>
                        </div>
                        <h3 className="font-semibold text-gray-900 mb-1 truncate">{student.fullName}</h3>
                        <p className="text-sm text-gray-600">{student.phone || 'Telefon yo\'q'}</p>
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setQrStudent(student);
                          }}
                          className="p-2 hover:bg-purple-50 rounded-lg transition-colors"
                          title="QR kod"
                        >
                          <QrCode className="w-4 h-4 text-purple-600" />
                        </button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="flex-shrink-0"
                          onClick={() => setSelectedStudentId(student._id)}
                        >
                          <BarChart3 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="py-12 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <GraduationCap className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {searchQuery ? 'O\'quvchilar topilmadi' : 'O\'quvchilar yo\'q'}
              </h3>
              <p className="text-gray-600 mb-4">
                {searchQuery 
                  ? 'Qidiruv bo\'yicha hech narsa topilmadi'
                  : 'Bu guruhda hali o\'quvchilar yo\'q'
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Student Profile Modal */}
      <StudentProfileModal 
        studentId={selectedStudentId} 
        onClose={() => setSelectedStudentId(null)} 
      />

      {/* QR Code Modal */}
      {qrStudent && (
        <StudentQRCode
          student={qrStudent}
          onClose={() => setQrStudent(null)}
        />
      )}
    </div>
  );
}
