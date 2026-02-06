import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/hooks/useToast';
import MathText from '@/components/MathText';
import { 
  ArrowLeft, 
  ClipboardList,
  Calendar,
  Users,
  FileText,
  Save,
  CheckCircle2,
  TrendingUp,
  Award,
  BookOpen,
  Edit2
} from 'lucide-react';

const assignmentTypeLabels: Record<string, string> = {
  yozma_ish: 'Yozma ish',
  diktant: 'Diktant',
  ogzaki: 'Og\'zaki',
  savol_javob: 'Savol-javob',
  yopiq_test: 'Yopiq test'
};

const assignmentTypeColors: Record<string, { bg: string, text: string, border: string }> = {
  yozma_ish: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  diktant: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  ogzaki: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' },
  savol_javob: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' },
  yopiq_test: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' }
};

export default function AssignmentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { success, error } = useToast();
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [grades, setGrades] = useState<Record<string, { percentage: number | string; notes: string }>>({});

  useEffect(() => {
    fetchAssignment();
  }, [id]);

  const fetchAssignment = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/assignments/${id}`);
      setAssignment(data.assignment);
      setSubmissions(data.submissions);
      
      const initialGrades: Record<string, { percentage: number; notes: string }> = {};
      data.submissions.forEach((sub: any) => {
        initialGrades[sub._id] = {
          percentage: sub.percentage ?? '',
          notes: sub.notes || ''
        };
      });
      setGrades(initialGrades);
    } catch (err) {
      console.error('Error fetching assignment:', err);
      error('Topshiriqni yuklashda xatolik');
    } finally {
      setLoading(false);
    }
  };

  const handleGradeChange = (submissionId: string, field: 'percentage' | 'notes', value: string | number) => {
    setGrades(prev => ({
      ...prev,
      [submissionId]: {
        ...prev[submissionId],
        [field]: field === 'percentage' ? (value === '' ? '' : Number(value)) : value
      }
    }));
  };

  const handleSaveGrade = async (submissionId: string) => {
    const grade = grades[submissionId];
    const percentage = Number(grade.percentage);
    
    if (grade.percentage === '' || isNaN(percentage)) {
      error('Ballni kiriting');
      return;
    }
    
    if (percentage < 0 || percentage > 100) {
      error('Foiz 0 dan 100 gacha bo\'lishi kerak');
      return;
    }

    try {
      await api.post(`/assignments/${id}/grade/${submissionId}`, {
        percentage: percentage,
        notes: grade.notes
      });
      success('Baho saqlandi!');
      fetchAssignment();
    } catch (err: any) {
      console.error('Error saving grade:', err);
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="animate-pulse">
          <div className="h-12 w-64 bg-slate-200 rounded-2xl mb-3"></div>
          <div className="h-6 w-96 bg-slate-200 rounded-xl"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-slate-200 rounded-3xl animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <Card className="border-2 border-slate-200/50">
        <CardContent className="py-16 text-center">
          <ClipboardList className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <p className="text-xl font-bold text-slate-900">Topshiriq topilmadi</p>
        </CardContent>
      </Card>
    );
  }

  const gradedCount = submissions.filter(s => s.percentage !== undefined && s.percentage !== null).length;
  const averagePercentage = gradedCount > 0
    ? submissions.reduce((sum, s) => sum + (s.percentage || 0), 0) / gradedCount
    : 0;

  const typeColor = assignmentTypeColors[assignment.type] || assignmentTypeColors.yozma_ish;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/teacher/assignments')}
            className="border hover:border-orange-500"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Orqaga
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/teacher/assignments/edit/${id}`)}
            className="border hover:border-blue-500 hover:text-blue-600"
          >
            <Edit2 className="w-4 h-4 mr-1" />
            Tahrirlash
          </Button>
        </div>
        
        <div className="bg-gradient-to-r from-orange-500 to-red-600 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center flex-shrink-0">
              <ClipboardList className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold mb-2">{assignment.title}</h1>
              <div className="flex flex-wrap gap-2">
                <div className={`px-3 py-1 ${typeColor.bg} ${typeColor.text} rounded-lg text-sm font-semibold`}>
                  {assignmentTypeLabels[assignment.type]}
                </div>
                {assignment.groupId && (
                  <div className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-lg flex items-center gap-1 text-sm">
                    <Users className="w-3 h-3" />
                    <span className="font-semibold">{assignment.groupId.name}</span>
                  </div>
                )}
                {assignment.dueDate && (
                  <div className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-lg flex items-center gap-1 text-sm">
                    <Calendar className="w-3 h-3" />
                    <span className="font-semibold">
                      {new Date(assignment.dueDate).toLocaleDateString('uz-UZ', {
                        day: 'numeric',
                        month: 'long'
                      })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border border-slate-200 hover:border-blue-300 transition-all">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-600 font-semibold uppercase">Jami o'quvchilar</p>
                <p className="text-2xl font-bold text-slate-900">{submissions.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 hover:border-green-300 transition-all">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-600 font-semibold uppercase">Baholangan</p>
                <p className="text-2xl font-bold text-green-600">{gradedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 hover:border-purple-300 transition-all">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-600 font-semibold uppercase">O'rtacha ball</p>
                <p className="text-2xl font-bold text-purple-600">{averagePercentage.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assignment Details */}
      {(assignment.description || assignment.fileUrl || (assignment.questions && assignment.questions.length > 0)) && (
        <Card className="border border-slate-200">
          <CardContent className="p-3">
            <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-orange-600" />
              Topshiriq tafsilotlari
            </h2>

            {assignment.description && (
              <div className="mb-3 p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-600 font-semibold uppercase mb-1">Tavsif</p>
                <p className="text-slate-900 text-sm">{assignment.description}</p>
              </div>
            )}

            {assignment.fileUrl && (
              <div className="mb-3">
                <a 
                  href={assignment.fileUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-lg hover:from-blue-600 hover:to-cyan-700 transition-all text-sm"
                >
                  <FileText className="w-4 h-4" />
                  <span className="font-semibold">Faylni ko'rish</span>
                </a>
              </div>
            )}

            {assignment.questions && assignment.questions.length > 0 && (
              <div>
                <p className="text-xs text-slate-600 font-semibold uppercase mb-2">
                  Savollar ({assignment.questions.length})
                </p>
                <div className="space-y-2">
                  {assignment.questions.map((q: any, idx: number) => (
                    <div key={idx} className="border border-slate-200 rounded-lg overflow-hidden hover:border-orange-300 transition-colors">
                      <div className="bg-gradient-to-r from-orange-50 to-red-50 p-2 border-b border-slate-200">
                        <p className="font-bold text-slate-900 text-sm">
                          {idx + 1}. <MathText text={q.text} />
                        </p>
                      </div>
                      {q.variants && q.variants.length > 0 && (
                        <div className="p-2 space-y-1">
                          {q.variants.map((v: any, vIdx: number) => {
                            const isCorrect = v.letter === q.correctAnswer;
                            return (
                              <div 
                                key={vIdx} 
                                className={`p-2 rounded-lg border transition-all text-sm ${
                                  isCorrect 
                                    ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300' 
                                    : 'bg-slate-50 border-slate-200'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold flex-shrink-0 text-xs ${
                                    isCorrect ? 'bg-green-500 text-white' : 'bg-slate-300 text-slate-700'
                                  }`}>
                                    {v.letter}
                                  </div>
                                  <span className={`flex-1 ${isCorrect ? 'text-green-900 font-semibold' : 'text-slate-700'}`}>
                                    <MathText text={v.text} />
                                  </span>
                                  {isCorrect && (
                                    <div className="flex items-center gap-1 text-green-600 font-bold text-xs">
                                      <span>✓</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Students List */}
      <Card className="border-2 border-slate-200/50">
        <CardContent className="p-0">
          <div className="p-3 sm:p-4 border-b border-slate-200">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <Award className="w-5 h-5 text-orange-600" />
              O'quvchilar ro'yxati
            </h2>
          </div>
          
          {submissions.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-600">O'quvchilar yo'q</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-12">
                      #
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      O'quvchi
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider w-32">
                      Ball (0-100%)
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Izoh
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider w-28">
                      Amallar
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {submissions.map((submission, index) => (
                    <tr 
                      key={submission._id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-3 py-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                          {index + 1}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div>
                          <p className="font-semibold text-slate-900 text-sm">
                            {submission.studentId?.fullName || 'O\'quvchi nomi yo\'q'}
                          </p>
                          {submission.gradedAt && (
                            <p className="text-xs text-slate-500">
                              {new Date(submission.gradedAt).toLocaleDateString('uz-UZ')}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={grades[submission._id]?.percentage === '' ? '' : grades[submission._id]?.percentage}
                          onChange={(e) => handleGradeChange(submission._id, 'percentage', e.target.value)}
                          placeholder="0"
                          className="text-center text-base font-bold h-9 w-full"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <Input
                          type="text"
                          value={grades[submission._id]?.notes || ''}
                          onChange={(e) => handleGradeChange(submission._id, 'notes', e.target.value)}
                          placeholder="Izoh yozing..."
                          className="h-9 text-sm w-full"
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Button
                          onClick={() => handleSaveGrade(submission._id)}
                          size="sm"
                          className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 h-9 px-4"
                        >
                          <Save className="w-3.5 h-3.5 mr-1" />
                          Saqlash
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
