import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PageNavbar } from '@/components/ui/PageNavbar';
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
  QrCode,
  UserMinus,
  Trash2,
  BookOpen,
  Save,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Input } from '@/components/ui/Input';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

interface SubjectConfig {
  subjectId: string;
  groupLetter: string;
}

export default function GroupDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [qrStudent, setQrStudent] = useState<any>(null);
  // Group-level subject+letter config
  const [subjectConfigs, setSubjectConfigs] = useState<SubjectConfig[]>([]);
  const [allSubjects, setAllSubjects] = useState<any[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);
  // Per-student subject+letter assignments — key: `${studentId}:${subjectId}`
  const [studentLetters, setStudentLetters] = useState<Record<string, string>>({});
  const [savingLetters, setSavingLetters] = useState(false);
  const [showSubjectConfig, setShowSubjectConfig] = useState(false);
  const [showStudentLetters, setShowStudentLetters] = useState(false);
  const { success, error } = useToast();

  useEffect(() => {
    if (id) {
      fetchGroupDetails();
      fetchStudents();
      fetchTests();
      fetchSubjectConfig();
      fetchAllSubjects();
      fetchStudentLetters();
    }
  }, [id]);

  const fetchGroupDetails = async () => {
    try {
      const { data } = await api.get(`/groups/${id}`);
      setGroup(data);
    } catch (err: any) {
      console.error('Error fetching group:', err);
      if (err.response?.status === 403) setGroup(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubjectConfig = async () => {
    try {
      const { data } = await api.get(`/groups/${id}/subject-config`);
      setSubjectConfigs(data.map((c: any) => ({
        subjectId: c.subjectId?._id || c.subjectId,
        groupLetter: c.groupLetter || ''
      })));
    } catch (err) {
      console.warn('Could not load subject config', err);
    }
  };

  const fetchAllSubjects = async () => {
    try {
      const { data } = await api.get('/subjects');
      setAllSubjects(data);
    } catch (err) {
      console.warn('Could not load subjects', err);
    }
  };

  const saveSubjectConfig = async () => {
    const valid = subjectConfigs.filter(c => c.subjectId);
    if (valid.length === 0) {
      error('Kamida bitta fan tanlang');
      return;
    }
    setSavingConfig(true);
    try {
      await api.put(`/groups/${id}/subject-config`, { configs: valid });
      success('Fan guruhlari saqlandi');
      await fetchSubjectConfig();
    } catch (err: any) {
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    } finally {
      setSavingConfig(false);
    }
  };

  const addConfigRow = () => {
    setSubjectConfigs(prev => [...prev, { subjectId: '', groupLetter: '' }]);
  };

  const updateConfigRow = (idx: number, patch: Partial<SubjectConfig>) => {
    setSubjectConfigs(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  };

  const removeConfigRow = (idx: number) => {
    setSubjectConfigs(prev => prev.filter((_, i) => i !== idx));
  };

  const fetchStudentLetters = async () => {
    try {
      const { data } = await api.get(`/groups/${id}/student-letters`);
      const map: Record<string, string> = {};
      data.forEach((d: any) => {
        if (d.studentId && d.subjectId && d.groupLetter) {
          map[`${d.studentId}:${d.subjectId}`] = d.groupLetter;
        }
      });
      setStudentLetters(map);
    } catch (err) {
      console.warn('Could not load student letters', err);
    }
  };

  const saveStudentLetters = async () => {
    setSavingLetters(true);
    try {
      // Barcha harflarni yuborish (bo'sh qiymatlar ham — serverda $unset qilinadi)
      const letters = Object.entries(studentLetters)
        .map(([key, groupLetter]) => {
          const [studentId, subjectId] = key.split(':');
          return { studentId, subjectId, groupLetter };
        });
      await api.put(`/groups/${id}/student-letters`, { letters });
      success('Bo\'limlar saqlandi');
      // Serverdan qayta yuklash
      await fetchStudentLetters();
    } catch (err: any) {
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    } finally {
      setSavingLetters(false);
    }
  };

  const setStudentLetter = async (studentId: string, subjectId: string, letter: string) => {
    setStudentLetters(prev => ({
      ...prev,
      [`${studentId}:${subjectId}`]: letter
    }));
    // Auto-save immediately
    try {
      await api.put(`/groups/${id}/student-letters`, {
        letters: [{ studentId, subjectId, groupLetter: letter }]
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Xatolik';
      error(msg);
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


  const handleRemoveStudent = async (studentId: string, studentName: string) => {
    if (!confirm(`${studentName} ni guruhdan chiqarmoqchimisiz?`)) return;
    try {
      await api.delete(`/teacher/groups/${id}/students/${studentId}`);
      success(`${studentName} guruhdan chiqarildi`);
      fetchStudents();
    } catch (err: any) {
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    }
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
      </div>

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

      {/* Subject Group Config */}
      <Card className="border-0 shadow-soft">
        <CardHeader
          className="bg-gradient-to-r from-gray-50 to-gray-100 border-b cursor-pointer select-none"
          onClick={() => setShowSubjectConfig(prev => !prev)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-600" />
              <CardTitle className="text-lg">Fan guruhlari</CardTitle>
              {subjectConfigs.length > 0 && (
                <Badge variant="info" size="sm">{subjectConfigs.length} ta fan</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {showSubjectConfig ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </div>
          </div>
        </CardHeader>
        {showSubjectConfig && (
          <CardContent className="p-4">
            <div className="flex items-center justify-end gap-2 mb-3">
              <Button size="sm" variant="outline" onClick={addConfigRow}>
                <Plus className="w-4 h-4 mr-1" />
                Fan qo'shish
              </Button>
              <Button size="sm" onClick={saveSubjectConfig} loading={savingConfig}>
                Saqlash
              </Button>
            </div>
            {subjectConfigs.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                <BookOpen className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">Fan guruhlari belgilanmagan</p>
                <p className="text-xs text-gray-400 mt-1">Blok test uchun fanlarni va guruh harfini belgilang</p>
              </div>
            ) : (
              <div className="space-y-2">
                {subjectConfigs.map((cfg, idx) => {
                  const sub = allSubjects.find((s: any) => s._id === cfg.subjectId);
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm flex-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        value={cfg.subjectId}
                        onChange={(e) => updateConfigRow(idx, { subjectId: e.target.value })}
                      >
                        <option value="">Fanni tanlang</option>
                        {allSubjects.map((s: any) => (
                          <option key={s._id} value={s._id}>{s.nameUzb}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => removeConfigRow(idx)}
                        className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-500 flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Per-student subject+letter assignment */}
      {students.length > 0 && (() => {
        // Build subject list: group's main subject + GroupSubjectConfig subjects
        const seen = new Set<string>();
        const letterSubjects: any[] = [];
        if (group?.subjectId && typeof group.subjectId === 'object') {
          const sid = group.subjectId._id || group.subjectId;
          seen.add(sid.toString());
          letterSubjects.push(group.subjectId);
        }
        subjectConfigs.forEach(cfg => {
          if (cfg.subjectId && !seen.has(cfg.subjectId)) {
            seen.add(cfg.subjectId);
            const sub = allSubjects.find((s: any) => s._id === cfg.subjectId);
            if (sub) letterSubjects.push(sub);
          }
        });
        if (letterSubjects.length === 0) return null;
        return (
          <Card className="border-0 shadow-soft">
            <CardHeader
              className="bg-gradient-to-r from-gray-50 to-gray-100 border-b cursor-pointer select-none"
              onClick={() => setShowStudentLetters(prev => !prev)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-600" />
                  <CardTitle className="text-lg">O'quvchi bo'limlari</CardTitle>
                  <Badge variant="info" size="sm">{students.length} ta</Badge>
                </div>
                <div className="flex items-center gap-2">
                  {showStudentLetters ? (
                    <ChevronUp className="w-5 h-5 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-500" />
                  )}
                </div>
              </div>
            </CardHeader>
            {showStudentLetters && (
              <CardContent className="p-0">
                <div className="flex items-center justify-end gap-2 px-4 pt-3">
                  <Button size="sm" onClick={saveStudentLetters} loading={savingLetters}>
                    <Save className="w-4 h-4 mr-1" />
                    Saqlash
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase">O'quvchi</th>
                        {letterSubjects.map((sub: any) => (
                          <th key={sub._id} className="px-4 py-3 text-center font-semibold text-gray-600 text-xs uppercase whitespace-nowrap">
                            {sub.nameUzb}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {students.map((student: any) => (
                        <tr key={student._id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium text-gray-900 whitespace-nowrap">{student.fullName}</td>
                          {letterSubjects.map((sub: any) => {
                            const key = `${student._id}:${sub._id}`;
                            return (
                              <td key={sub._id} className="px-4 py-2 text-center">
                                <select
                                  className="rounded border border-gray-300 px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                  value={studentLetters[key] || ''}
                                  onChange={(e) => setStudentLetter(student._id, sub._id, e.target.value)}
                                >
                                  <option value="">-</option>
                                  {LETTERS.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 px-4 py-2 border-t">
                  Har bir o'quvchiga fan bo'yicha guruh harfini belgilang. Blok test yaratilganda shu ma'lumot ishlatiladi.
                </p>
              </CardContent>
            )}
          </Card>
        );
      })()}

      {/* Students List */}
      <Card className="border-0 shadow-soft">
        <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">O'quvchilar ro'yxati</CardTitle>
            <Badge variant="info" size="md">{students.length} ta o'quvchi</Badge>
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
                            {student.studentCode && <span className="ml-2 text-xs text-gray-400 font-mono">ID: {student.studentCode}</span>}
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
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveStudent(student._id, student.fullName);
                              }}
                              className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                              title="Guruhdan chiqarish"
                            >
                              <UserMinus className="w-4 h-4 text-red-500" />
                            </button>
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
                        {student.studentCode && <p className="text-xs text-gray-400 font-mono">ID: {student.studentCode}</p>}
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
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveStudent(student._id, student.fullName);
                          }}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                          title="Guruhdan chiqarish"
                        >
                          <UserMinus className="w-4 h-4 text-red-500" />
                        </button>
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
