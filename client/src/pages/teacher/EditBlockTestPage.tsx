import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ArrowLeft, Save, Trash2, Edit2, Plus, Upload, X, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

function getParserKeyFromSubject(subjectName: string): string {
  const lower = subjectName.toLowerCase();
  if (lower.includes('matematika') || lower.includes('algebra') || lower.includes('geometriya')) return 'math';
  if (lower.includes('fizika')) return 'physics';
  if (lower.includes('kimyo')) return 'chemistry';
  if (lower.includes('biologiya') || lower.includes('tibbiyot')) return 'biology';
  if (lower.includes('ona tili') || lower.includes('adabiyot')) return 'literature';
  return 'math';
}

export default function EditBlockTestPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [blockTest, setBlockTest] = useState<any>(null);
  const [classNumber, setClassNumber] = useState('');
  const [periodMonth, setPeriodMonth] = useState('');
  const [periodYear, setPeriodYear] = useState('');

  // Yangi fan qo'shish uchun state
  const [showAddForm, setShowAddForm] = useState(false);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [newSubjectId, setNewSubjectId] = useState('');
  const [newGroupLetter, setNewGroupLetter] = useState('');
  const [newFile, setNewFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [parsedQuestions, setParsedQuestions] = useState<any[] | null>(null);
  const [addError, setAddError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadBlockTest();
    loadSubjects();
  }, [id]);

  const loadSubjects = async () => {
    try {
      const { data } = await api.get('/subjects');
      setSubjects(data);
    } catch (error) {
      console.error('Error loading subjects:', error);
    }
  };

  // Faqat blok test fanlari (5 ta)
  const blockTestSubjects = subjects.filter((s: any) => {
    const key = getParserKeyFromSubject(s.nameUzb);
    const lower = s.nameUzb.toLowerCase();
    if (key === 'math') return lower.includes('matematika') || lower.includes('algebra');
    return true;
  });

  const loadBlockTest = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/block-tests/${id}`);

      const allSubjects: any[] = [];

      if (data.subjectTests && Array.isArray(data.subjectTests)) {
        data.subjectTests.forEach((st: any) => {
          if (st.subjectId) {
            allSubjects.push({
              ...st,
              testId: data._id
            });
          }
        });
      }

      const mergedBlockTest = {
        ...data,
        subjectTests: allSubjects,
        allTestIds: [data._id]
      };

      setBlockTest(mergedBlockTest);
      setClassNumber(data.classNumber?.toString() || '');

      if (data.periodMonth && data.periodYear) {
        setPeriodMonth(data.periodMonth.toString());
        setPeriodYear(data.periodYear.toString());
      } else {
        const testDate = data.date ? new Date(data.date) : new Date();
        setPeriodMonth((testDate.getMonth() + 1).toString());
        setPeriodYear(testDate.getFullYear().toString());
      }
    } catch (error) {
      console.error('Error loading block test:', error);
      alert('Testni yuklashda xatolik yuz berdi');
      navigate('/teacher/block-tests');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.put(`/block-tests/${id}`, {
        classNumber: parseInt(classNumber),
        periodMonth: parseInt(periodMonth),
        periodYear: parseInt(periodYear)
      });
      alert('Test muvaffaqiyatli saqlandi');
      navigate('/teacher/block-tests');
    } catch (error) {
      console.error('Error saving block test:', error);
      alert('Testni saqlashda xatolik yuz berdi');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSubject = async (subjectIndex: number) => {
    const subject = blockTest.subjectTests[subjectIndex];
    const subjectName = subject.subjectId?.nameUzb || 'Fan';
    const testId = subject.testId;
    const questionCount = subject.questions?.length || 0;

    if (!confirm(`${subjectName} fanini o'chirmoqchimisiz?\n(${questionCount} ta savol)\n\nBu amalni qaytarib bo'lmaydi!`)) {
      return;
    }

    try {
      setSaving(true);

      const { data: testData } = await api.get(`/block-tests/${testId}`);

      const originalSubjectIndex = testData.subjectTests.findIndex((st: any) => {
        const sameSubject = (st.subjectId._id || st.subjectId) === (subject.subjectId._id || subject.subjectId);
        const sameQuestionCount = st.questions?.length === subject.questions?.length;

        if (sameSubject && sameQuestionCount) {
          if (st.questions?.length > 0 && subject.questions?.length > 0) {
            const sameFirstQuestion = st.questions[0].text === subject.questions[0].text;
            return sameFirstQuestion;
          }
          return true;
        }
        return false;
      });

      if (originalSubjectIndex === -1) {
        alert('Fan topilmadi');
        return;
      }

      if (testData.subjectTests.length === 1) {
        await api.delete(`/block-tests/${testId}`);
        alert(`${subjectName} fani va uning testi muvaffaqiyatli o'chirildi`);
      } else {
        const updatedSubjectTests = testData.subjectTests.filter((_: any, idx: number) =>
          idx !== originalSubjectIndex
        );

        await api.put(`/block-tests/${testId}`, {
          subjectTests: updatedSubjectTests
        });

        alert(`${subjectName} fani muvaffaqiyatli o'chirildi (${questionCount} ta savol)`);
      }

      await loadBlockTest();
    } catch (error) {
      console.error('Error deleting subject:', error);
      alert('Fanni o\'chirishda xatolik yuz berdi');
    } finally {
      setSaving(false);
    }
  };

  // Fayl yuklash va parse qilish
  const handleFileUpload = async () => {
    if (!newSubjectId) {
      setAddError('Avval fanni tanlang!');
      return;
    }
    if (!newFile) {
      setAddError('Fayl tanlanmagan!');
      return;
    }

    setAddError('');
    setUploading(true);
    setParsedQuestions(null);

    try {
      const selectedSubject = subjects.find((s: any) => s._id === newSubjectId);
      const parserKey = selectedSubject ? getParserKeyFromSubject(selectedSubject.nameUzb) : 'math';

      const formData = new FormData();
      formData.append('file', newFile);
      formData.append('format', 'word');
      formData.append('subjectId', parserKey);

      const { data } = await api.post('/tests/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });

      if (data.questions && data.questions.length > 0) {
        setParsedQuestions(data.questions);
      } else {
        setAddError('Faylda savollar topilmadi');
      }
    } catch (error: any) {
      console.error('Error parsing file:', error);
      setAddError(error.response?.data?.message || 'Faylni tahlil qilishda xatolik');
    } finally {
      setUploading(false);
    }
  };

  // Parse qilingan savollarni blok testga qo'shish
  const handleConfirmAdd = async () => {
    if (!parsedQuestions || parsedQuestions.length === 0) return;

    setUploading(true);
    setAddError('');

    try {
      await api.post('/block-tests/import/confirm', {
        questions: parsedQuestions,
        classNumber: parseInt(classNumber),
        subjectId: newSubjectId,
        groupLetter: newGroupLetter || null,
        periodMonth: parseInt(periodMonth),
        periodYear: parseInt(periodYear),
      });

      // Formni tozalash
      setShowAddForm(false);
      setNewSubjectId('');
      setNewGroupLetter('');
      setNewFile(null);
      setParsedQuestions(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      // Blok testni qayta yuklash
      await loadBlockTest();
      alert('Fan muvaffaqiyatli qo\'shildi! Eski variantlar o\'chirildi — "Sozlash" sahifasida variantlarni qayta yarating.');
    } catch (error: any) {
      console.error('Error adding subject:', error);
      setAddError(error.response?.data?.message || 'Fan qo\'shishda xatolik');
    } finally {
      setUploading(false);
    }
  };

  const resetAddForm = () => {
    setShowAddForm(false);
    setNewSubjectId('');
    setNewGroupLetter('');
    setNewFile(null);
    setParsedQuestions(null);
    setAddError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/teacher/block-tests')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Orqaga
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Blok testni tahrirlash</h1>
            <p className="text-gray-600 mt-1">Test ma'lumotlarini o'zgartirish</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saqlanmoqda...' : 'Saqlash'}
        </Button>
      </div>

      {/* Edit Form */}
      <Card className="border-0 shadow-soft">
        <CardHeader>
          <CardTitle>Asosiy ma'lumotlar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sinf <span className="text-red-500">*</span>
            </label>
            <Input
              type="number"
              value={classNumber}
              onChange={(e) => setClassNumber(e.target.value)}
              placeholder="Masalan: 9"
              min="1"
              max="11"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Davr <span className="text-red-500">*</span>
            </label>
            <Input
              type="month"
              value={`${periodYear}-${String(periodMonth).padStart(2, '0')}`}
              onChange={(e) => {
                const [year, month] = e.target.value.split('-');
                setPeriodYear(year);
                setPeriodMonth(month);
              }}
            />
            <p className="text-xs text-gray-500 mt-1">
              Testlar shu davr bo'yicha guruhlashadi
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Subjects Info */}
      <Card className="border-0 shadow-soft">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Fanlar</CardTitle>
          {!showAddForm && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="w-4 h-4 mr-1" />
              Fan qo'shish
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {blockTest?.subjectTests?.map((st: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex-1">
                  <span className="font-medium">{st.subjectId?.nameUzb || 'Fan'}</span>
                  {st.groupLetter && (
                    <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                      {st.groupLetter} guruh
                    </span>
                  )}
                  {!st.groupLetter && (
                    <span className="ml-2 px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded-full">
                      Umumiy
                    </span>
                  )}
                  <span className="text-sm text-gray-600 ml-3">{st.questions?.length || 0} ta savol</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/teacher/block-tests/${st.testId}/edit-subject/${blockTest.subjectTests.findIndex((s: any) => s.testId === st.testId && s.subjectId?._id === st.subjectId?._id)}`)}
                  >
                    <Edit2 className="w-4 h-4 mr-1" />
                    Tahrirlash
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteSubject(idx)}
                    disabled={saving}
                    className="text-red-600 hover:text-red-700 hover:border-red-300"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}

            {(!blockTest?.subjectTests || blockTest.subjectTests.length === 0) && (
              <p className="text-gray-500 text-center py-4">Fanlar topilmadi</p>
            )}
          </div>

          {/* Yangi fan qo'shish formi */}
          {showAddForm && (
            <div className="mt-4 border border-blue-200 rounded-lg p-4 bg-blue-50/50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800">Yangi fan qo'shish (.docx)</h3>
                <button onClick={resetAddForm} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                {/* Fan tanlash */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fan</label>
                  <select
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    value={newSubjectId}
                    onChange={(e) => setNewSubjectId(e.target.value)}
                    disabled={uploading}
                  >
                    <option value="">Fanni tanlang</option>
                    {blockTestSubjects.map((s: any) => (
                      <option key={s._id} value={s._id}>{s.nameUzb}</option>
                    ))}
                  </select>
                </div>

                {/* Guruh harfi */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Guruh harfi (ixtiyoriy)</label>
                  <select
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    value={newGroupLetter}
                    onChange={(e) => setNewGroupLetter(e.target.value)}
                    disabled={uploading}
                  >
                    <option value="">Umumiy (barcha guruhlar)</option>
                    <option value="A">A guruh</option>
                    <option value="B">B guruh</option>
                    <option value="C">C guruh</option>
                    <option value="D">D guruh</option>
                  </select>
                </div>

                {/* Fayl yuklash */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">.docx fayl</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".docx"
                    onChange={(e) => {
                      setNewFile(e.target.files?.[0] || null);
                      setParsedQuestions(null);
                      setAddError('');
                    }}
                    disabled={uploading}
                    className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>

                {/* Xatolik */}
                {addError && (
                  <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded-md">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{addError}</p>
                  </div>
                )}

                {/* Parse natijasi */}
                {parsedQuestions && (
                  <div className="flex items-start gap-2 p-2 bg-green-50 border border-green-200 rounded-md">
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-green-700">
                      {parsedQuestions.length} ta savol topildi. Tasdiqlash uchun "Qo'shish" tugmasini bosing.
                    </p>
                  </div>
                )}

                {/* Tugmalar */}
                <div className="flex gap-2 pt-1">
                  {!parsedQuestions ? (
                    <Button
                      size="sm"
                      onClick={handleFileUpload}
                      disabled={uploading || !newFile || !newSubjectId}
                    >
                      {uploading ? (
                        <>
                          <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                          Tahlil qilinmoqda...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-1" />
                          Yuklash va tahlil qilish
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={handleConfirmAdd}
                      disabled={uploading}
                    >
                      {uploading ? (
                        <>
                          <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                          Saqlanmoqda...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Qo'shish ({parsedQuestions.length} savol)
                        </>
                      )}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={resetAddForm} disabled={uploading}>
                    Bekor qilish
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
