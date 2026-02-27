import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ArrowLeft, Save, Trash2, Edit2, Plus, Upload, X, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { convertLatexToTiptapJson, convertChemistryToTiptapJson, convertPhysicsToTiptapJson } from '@/lib/latexUtils';

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

  // Group selector
  const [groups, setGroups] = useState<{ _id: string; name: string; classNumber: number; letter: string; subjectId?: { nameUzb: string }; studentsCount: number }[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');

  // Yangi fanlar qo'shish uchun state
  const [showAddForm, setShowAddForm] = useState(false);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  interface SubjectRow {
    rowId: string;
    subjectId: string;
    groupLetter: string;
    file: File | null;
    parsedQuestions: any[] | null;
    error: string;
    status: 'idle' | 'loading' | 'done' | 'error';
  }

  const newRow = (): SubjectRow => ({
    rowId: Math.random().toString(36).slice(2),
    subjectId: '',
    groupLetter: '',
    file: null,
    parsedQuestions: null,
    error: '',
    status: 'idle',
  });

  const [rows, setRows] = useState<SubjectRow[]>([newRow()]);

  useEffect(() => {
    loadBlockTest();
    loadSubjects();
    loadGroups();
  }, [id]);

  const loadSubjects = async () => {
    try {
      const { data } = await api.get('/subjects');
      setSubjects(data);
    } catch (error) {
      console.error('Error loading subjects:', error);
    }
  };

  const loadGroups = async () => {
    try {
      const { data } = await api.get('/groups');
      const sorted = (data || []).sort((a: { classNumber: number; letter: string }, b: { classNumber: number; letter: string }) =>
        a.classNumber !== b.classNumber ? a.classNumber - b.classNumber : a.letter.localeCompare(b.letter)
      );
      setGroups(sorted);
    } catch (error) {
      console.error('Error loading groups:', error);
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
      const gId = typeof data.groupId === 'object' ? data.groupId?._id : data.groupId;
      if (gId) setSelectedGroupId(gId);

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
        periodYear: parseInt(periodYear),
        groupId: selectedGroupId || undefined
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

  const updateRow = (rowId: string, patch: Partial<SubjectRow>) => {
    setRows(prev => prev.map(r => r.rowId === rowId ? { ...r, ...patch } : r));
  };

  const handleFileUploadAll = async () => {
    const toProcess = rows.filter(r => r.subjectId && r.file && !r.parsedQuestions);
    if (toProcess.length === 0) return;

    setUploading(true);

    await Promise.all(toProcess.map(async (row) => {
      updateRow(row.rowId, { status: 'loading', error: '' });
      try {
        const selectedSubject = subjects.find((s: any) => s._id === row.subjectId);
        const parserKey = selectedSubject ? getParserKeyFromSubject(selectedSubject.nameUzb) : 'math';

        const formData = new FormData();
        formData.append('file', row.file!);
        formData.append('format', 'word');
        formData.append('subjectId', parserKey);

        const { data } = await api.post('/tests/import', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000,
        });

        if (data.questions && data.questions.length > 0) {
          const isChemistry = parserKey === 'chemistry';
          const isPhysics = parserKey === 'physics';

          const converted = data.questions.map((q: any) => {
            const hasFormulas = q.text?.includes('\\(') || q.text?.includes('\\[') ||
              (isChemistry && (q.text?.includes('_') || q.text?.includes('^') || q.text?.includes('\\cdot'))) ||
              (isPhysics && (q.text?.includes('_') || q.text?.includes('^') || q.text?.includes('\\times')));

            let questionText = q.text;
            if (hasFormulas) {
              const json = isChemistry ? convertChemistryToTiptapJson(q.text)
                : isPhysics ? convertPhysicsToTiptapJson(q.text)
                : convertLatexToTiptapJson(q.text);
              if (json) questionText = JSON.stringify(json);
            }

            const variants = (q.variants || []).map((v: any) => {
              const vHas = v.text?.includes('\\(') || v.text?.includes('\\[') ||
                (isChemistry && (v.text?.includes('_') || v.text?.includes('^') || v.text?.includes('\\cdot'))) ||
                (isPhysics && (v.text?.includes('_') || v.text?.includes('^') || v.text?.includes('\\times')));
              if (vHas) {
                const json = isChemistry ? convertChemistryToTiptapJson(v.text)
                  : isPhysics ? convertPhysicsToTiptapJson(v.text)
                  : convertLatexToTiptapJson(v.text);
                return { ...v, text: json ? JSON.stringify(json) : v.text };
              }
              return v;
            });

            return { ...q, text: questionText, variants };
          });

          updateRow(row.rowId, { parsedQuestions: converted, status: 'done' });
        } else {
          updateRow(row.rowId, { error: 'Faylda savollar topilmadi', status: 'error' });
        }
      } catch (error: any) {
        updateRow(row.rowId, {
          error: error.response?.data?.message || 'Faylni tahlil qilishda xatolik',
          status: 'error',
        });
      }
    }));

    setUploading(false);
  };

  const handleConfirmAdd = async () => {
    const doneRows = rows.filter(r => r.parsedQuestions && r.parsedQuestions.length > 0);
    if (doneRows.length === 0) return;

    setUploading(true);
    try {
      for (const row of doneRows) {
        await api.post('/block-tests/import/confirm', {
          questions: row.parsedQuestions,
          classNumber: parseInt(classNumber),
          subjectId: row.subjectId,
          groupLetter: row.groupLetter || null,
          periodMonth: parseInt(periodMonth),
          periodYear: parseInt(periodYear),
          groupId: selectedGroupId || undefined,
          blockTestId: id,
        });
      }
      resetAddForm();
      await loadBlockTest();
      alert(`${doneRows.length} ta fan muvaffaqiyatli qo'shildi!`);
    } catch (error: any) {
      alert(error.response?.data?.message || 'Fan qo\'shishda xatolik');
    } finally {
      setUploading(false);
    }
  };

  const resetAddForm = () => {
    setShowAddForm(false);
    setRows([newRow()]);
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
              Guruh <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedGroupId}
              onChange={(e) => {
                const g = groups.find(gr => gr._id === e.target.value);
                setSelectedGroupId(e.target.value);
                if (g) setClassNumber(String(g.classNumber));
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Guruhni tanlang</option>
              {groups.map(g => (
                <option key={g._id} value={g._id}>
                  {g.classNumber}-{g.letter} {g.subjectId?.nameUzb || g.name} ({g.studentsCount})
                </option>
              ))}
            </select>
          </div>

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

          {/* Bir nechta fan qo'shish formi */}
          {showAddForm && (
            <div className="mt-4 border border-blue-200 rounded-lg p-4 bg-blue-50/50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800">Fanlar qo'shish (.docx)</h3>
                <button onClick={resetAddForm} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                {/* Ustun sarlavhalari */}
                <div className="grid grid-cols-[1fr_120px_1fr_32px] gap-2 px-1 text-xs font-medium text-gray-500">
                  <span>Fan</span>
                  <span>Guruh</span>
                  <span>.docx fayl</span>
                  <span></span>
                </div>

                {rows.map((row) => (
                  <div key={row.rowId} className="grid grid-cols-[1fr_120px_1fr_32px] gap-2 items-center">
                    {/* Fan */}
                    <select
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm w-full"
                      value={row.subjectId}
                      onChange={(e) => updateRow(row.rowId, { subjectId: e.target.value, parsedQuestions: null, error: '', status: 'idle' })}
                      disabled={uploading || row.status === 'done'}
                    >
                      <option value="">Fanni tanlang</option>
                      {blockTestSubjects.map((s: any) => (
                        <option key={s._id} value={s._id}>{s.nameUzb}</option>
                      ))}
                    </select>

                    {/* Guruh harfi */}
                    <select
                      className="rounded-md border border-gray-300 px-2 py-2 text-sm w-full"
                      value={row.groupLetter}
                      onChange={(e) => updateRow(row.rowId, { groupLetter: e.target.value })}
                      disabled={uploading || row.status === 'done'}
                    >
                      <option value="">Umumiy</option>
                      {['A', 'B', 'C', 'D', 'E', 'F'].map(l => (
                        <option key={l} value={l}>{l} guruh</option>
                      ))}
                    </select>

                    {/* Fayl */}
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept=".docx"
                        onChange={(e) => updateRow(row.rowId, { file: e.target.files?.[0] || null, parsedQuestions: null, error: '', status: 'idle' })}
                        disabled={uploading || row.status === 'done'}
                        className="w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                      {row.status === 'done' && (
                        <span className="text-xs text-green-600 whitespace-nowrap font-medium">
                          {row.parsedQuestions?.length} ta
                        </span>
                      )}
                      {row.status === 'loading' && (
                        <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full flex-shrink-0" />
                      )}
                      {row.error && (
                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      )}
                    </div>

                    {/* O'chirish */}
                    <button
                      onClick={() => setRows(prev => prev.length > 1 ? prev.filter(r => r.rowId !== row.rowId) : prev)}
                      className="text-gray-400 hover:text-red-500 disabled:opacity-30"
                      disabled={uploading || rows.length === 1}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {/* Qator qo'shish */}
                <button
                  onClick={() => setRows(prev => [...prev, newRow()])}
                  disabled={uploading}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium disabled:opacity-40"
                >
                  <Plus className="w-4 h-4" />
                  Fan qo'shish
                </button>

                {/* Xatolar ro'yxati */}
                {rows.some(r => r.error) && (
                  <div className="p-2 bg-red-50 border border-red-200 rounded-md space-y-1">
                    {rows.filter(r => r.error).map(r => (
                      <div key={r.rowId} className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-red-700">
                          {subjects.find(s => s._id === r.subjectId)?.nameUzb || 'Fan'}: {r.error}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tugmalar */}
                <div className="flex gap-2 pt-1">
                  {rows.some(r => r.status !== 'done' && r.subjectId && r.file) && (
                    <Button
                      size="sm"
                      onClick={handleFileUploadAll}
                      disabled={uploading || !rows.some(r => r.subjectId && r.file && r.status !== 'done')}
                    >
                      {uploading ? (
                        <>
                          <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                          Tahlil qilinmoqda...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-1" />
                          Tahlil qilish
                        </>
                      )}
                    </Button>
                  )}
                  {rows.some(r => r.status === 'done') && (
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
                          Qo'shish ({rows.filter(r => r.status === 'done').length} ta fan)
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
