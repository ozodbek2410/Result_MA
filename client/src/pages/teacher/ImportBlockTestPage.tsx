import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Upload, X, CheckCircle, AlertCircle, Loader2, ArrowLeft, ImagePlus, FileText, ClipboardList, Plus } from 'lucide-react';
import api from '@/lib/api';
import { useImportBlockTest, useGenerateVariants } from '@/hooks/useBlockTests';
import RichTextEditor from '@/components/editor/RichTextEditor';
import { convertLatexToTiptapJson, convertChemistryToTiptapJson, convertPhysicsToTiptapJson } from '@/lib/latexUtils';
import { useToast } from '@/hooks/useToast';

interface ParsedQuestion {
  text: string;
  variants: { letter: string; text: string }[];
  correctAnswer: string;
  points: number;
  originalNumber?: number;
  image?: string;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
}

interface SubjectTab {
  id: string;
  parserKey: string;
  subjectId: string;
  file: File | null;
  questions: ParsedQuestion[];
  status: 'idle' | 'uploading' | 'parsed' | 'error';
  error: string;
}

const PARSERS = [
  { value: 'math', label: 'Matematika' },
  { value: 'physics', label: 'Fizika' },
  { value: 'chemistry', label: 'Kimyo' },
  { value: 'biology', label: 'Biologiya' },
  { value: 'literature', label: 'Ona tili va Adabiyot' },
];

function getParserKeyFromSubject(subjectName: string): string {
  const lower = subjectName.toLowerCase();
  if (lower.includes('matematika') || lower.includes('algebra') || lower.includes('geometriya')) return 'math';
  if (lower.includes('fizika')) return 'physics';
  if (lower.includes('kimyo')) return 'chemistry';
  if (lower.includes('biologiya') || lower.includes('tibbiyot')) return 'biology';
  if (lower.includes('ona tili') || lower.includes('adabiyot')) return 'literature';
  return 'math';
}

let _id = 0;
const newTab = (): SubjectTab => ({
  id: `t${++_id}`,
  parserKey: 'math',
  subjectId: '',
  file: null,
  questions: [],
  status: 'idle',
  error: '',
});

export default function ImportBlockTestPage() {
  const navigate = useNavigate();
  const { error: showErrorToast, success: showSuccessToast } = useToast();
  const importMutation = useImportBlockTest();
  const generateVariantsMutation = useGenerateVariants();

  // Guruhlar
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [loadingGroups, setLoadingGroups] = useState(true);

  // Fanlar (DB)
  const [subjects, setSubjects] = useState<any[]>([]);

  // Asosiy sozlamalar
  const [periodMonth, setPeriodMonth] = useState(new Date().getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());

  // Multi-subject tabs
  const [tabs, setTabs] = useState<SubjectTab[]>([newTab()]);
  const [activeTab, setActiveTab] = useState(0);
  const [viewMode, setViewMode] = useState<'full' | 'compact'>('full');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // Ma'lumotlarni yuklash
  useEffect(() => {
    Promise.all([
      api.get('/teacher/my-groups').then(r => setGroups(r.data)).catch(() => setGroups([])),
      api.get('/subjects').then(r => setSubjects(r.data)).catch(() => setSubjects([])),
    ]).finally(() => setLoadingGroups(false));
  }, []);

  const selectedGroup = groups.find((g: any) => g._id === selectedGroupId);

  // ============ TAB MANAGEMENT ============

  const update = (i: number, patch: Partial<SubjectTab>) =>
    setTabs(prev => prev.map((t, idx) => idx === i ? { ...t, ...patch } : t));

  const addTab = () => {
    if (tabs.length >= 5) return;
    setTabs(prev => [...prev, newTab()]);
    setActiveTab(tabs.length);
  };

  const removeTab = (i: number) => {
    if (tabs.length <= 1) return;
    setTabs(prev => prev.filter((_, idx) => idx !== i));
    if (activeTab >= i && activeTab > 0) setActiveTab(activeTab - 1);
  };

  // ============ FILE UPLOAD ============

  const handleUpload = async (i: number) => {
    const tab = tabs[i];
    if (!tab.file) return;

    if (!tab.subjectId) {
      update(i, { error: 'Avval fanni tanlang!' });
      return;
    }

    update(i, { status: 'uploading', error: '' });

    try {
      const fd = new FormData();
      fd.append('file', tab.file);
      const ext = tab.file.name.split('.').pop()?.toLowerCase();
      fd.append('format', ['jpg', 'jpeg', 'png'].includes(ext || '') ? 'image' : 'word');
      fd.append('subjectId', tab.parserKey);

      const { data } = await api.post('/tests/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const isChemistry = tab.parserKey === 'chemistry';
      const isPhysics = tab.parserKey === 'physics';

      const questions = (data.questions || []).map((q: ParsedQuestion) => {
        const hasFormulas = q.text.includes('\\(') || q.text.includes('\\[') ||
          (isChemistry && (q.text.includes('_') || q.text.includes('^') || q.text.includes('\\cdot'))) ||
          (isPhysics && (q.text.includes('_') || q.text.includes('^') || q.text.includes('\\times') || q.text.includes('\\div')));

        let questionJson = null;
        if (hasFormulas) {
          if (isChemistry) questionJson = convertChemistryToTiptapJson(q.text);
          else if (isPhysics) questionJson = convertPhysicsToTiptapJson(q.text);
          else questionJson = convertLatexToTiptapJson(q.text);
        }

        const processedVariants = (q.variants || []).map((v: any) => {
          const vHas = v.text.includes('\\(') || v.text.includes('\\[') ||
            (isChemistry && (v.text.includes('_') || v.text.includes('^') || v.text.includes('\\cdot'))) ||
            (isPhysics && (v.text.includes('_') || v.text.includes('^') || v.text.includes('\\times') || v.text.includes('\\div')));
          if (vHas) {
            let json;
            if (isChemistry) json = convertChemistryToTiptapJson(v.text);
            else if (isPhysics) json = convertPhysicsToTiptapJson(v.text);
            else json = convertLatexToTiptapJson(v.text);
            return { ...v, text: json || v.text };
          }
          return v;
        });

        // Dedup variants by letter (parser ba'zan dublikat harflar qaytaradi)
        const seen = new Set<string>();
        const uniqueVariants = processedVariants.filter((v: any) => {
          if (seen.has(v.letter)) return false;
          seen.add(v.letter);
          return true;
        });

        // Agar 4 ta variant bo'lmasa, yetishmayotganlarini qo'shish
        const existingLetters = new Set(uniqueVariants.map((v: any) => v.letter));
        for (const letter of ['A', 'B', 'C', 'D']) {
          if (!existingLetters.has(letter)) {
            uniqueVariants.push({ letter, text: '' });
          }
        }
        uniqueVariants.sort((a: any, b: any) => a.letter.localeCompare(b.letter));

        return { ...q, text: questionJson || q.text, variants: uniqueVariants, correctAnswer: '', imageUrl: q.imageUrl, originalNumber: q.originalNumber };
      });

      // Gap detection: agar savollar ketma-ketligida bo'shliq bo'lsa, placeholder qo'shish
      const finalQuestions: ParsedQuestion[] = [];
      const warningNumbers: number[] = [];

      if (questions.length > 0 && questions[0].originalNumber) {
        // originalNumber mavjud — ketma-ketlikni tekshirish
        const maxNum = Math.max(...questions.map((q: any) => q.originalNumber || 0));
        const byNumber = new Map<number, any>();
        for (const q of questions) {
          if (q.originalNumber) byNumber.set(q.originalNumber, q);
        }

        for (let n = 1; n <= maxNum; n++) {
          if (byNumber.has(n)) {
            finalQuestions.push(byNumber.get(n));
          } else {
            // Bo'sh placeholder
            warningNumbers.push(n);
            finalQuestions.push({
              text: `Savol ${n} (avtomatik o'qib bo'lmadi)`,
              variants: [
                { letter: 'A', text: '' },
                { letter: 'B', text: '' },
                { letter: 'C', text: '' },
                { letter: 'D', text: '' },
              ],
              correctAnswer: '',
              originalNumber: n,
            } as any);
          }
        }
      } else {
        finalQuestions.push(...questions);
      }

      const warning = warningNumbers.length > 0
        ? `${warningNumbers.map(n => `Q${n}`).join(', ')} savollar avtomatik o'qib bo'lmadi. Iltimos, qo'lda to'ldiring.`
        : '';

      update(i, { questions: finalQuestions, status: 'parsed', error: warning });
    } catch (err: any) {
      update(i, {
        status: 'error',
        error: err.response?.data?.message || 'Faylni tahlil qilishda xatolik',
      });
    }
  };

  // ============ QUESTION EDITING ============

  const tab = tabs[activeTab];

  const setQ = (questions: ParsedQuestion[]) => update(activeTab, { questions });

  const changeQuestion = (qi: number, field: string, value: any) => {
    const qs = [...tab.questions];
    if (field === 'text') qs[qi].text = value;
    else if (field === 'correctAnswer') qs[qi].correctAnswer = value;
    else if (field === 'points') qs[qi].points = parseInt(value) || 1;
    setQ(qs);
  };

  const changeVariant = (qi: number, vi: number, value: string) => {
    const qs = [...tab.questions];
    qs[qi].variants[vi].text = value;
    setQ(qs);
  };

  const addVariant = (qi: number) => {
    const qs = [...tab.questions];
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    const used = qs[qi].variants.map(v => v.letter);
    const next = letters.find(l => !used.includes(l));
    if (next) { qs[qi].variants.push({ letter: next, text: '' }); setQ(qs); }
  };

  const removeVariant = (qi: number, vi: number) => {
    const qs = [...tab.questions];
    qs[qi].variants.splice(vi, 1);
    setQ(qs);
  };

  const removeQuestion = (qi: number) => setQ(tab.questions.filter((_, i) => i !== qi));

  const addQuestion = () => setQ([...tab.questions, {
    text: '', variants: [{ letter: 'A', text: '' }, { letter: 'B', text: '' }, { letter: 'C', text: '' }, { letter: 'D', text: '' }],
    correctAnswer: '', points: 1,
  }]);

  const uploadImage = async (qi: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data } = await api.post('/uploads', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const qs = [...tab.questions]; qs[qi].image = data.path; setQ(qs);
    } catch { showErrorToast('Rasmni yuklashda xatolik'); }
  };

  const removeImage = (qi: number) => {
    const qs = [...tab.questions]; delete qs[qi].image; delete qs[qi].imageUrl; setQ(qs);
  };

  // ============ SAVE ALL ============

  const handleSave = async () => {
    if (!selectedGroupId) { showErrorToast('Guruhni tanlang'); return; }

    const parsed = tabs.filter(t => t.status === 'parsed' && t.questions.length > 0);
    if (parsed.length === 0) { showErrorToast('Kamida bitta fan uchun fayl yuklang'); return; }

    for (const t of parsed) {
      if (!t.subjectId) {
        showErrorToast('Barcha tablar uchun fanni tanlang');
        return;
      }
      const noAnswer = t.questions.filter(q => !q.correctAnswer?.trim());
      if (noAnswer.length > 0) {
        showErrorToast(`"${subjects.find((s: any) => s._id === t.subjectId)?.nameUzb || 'Fan'}" da ${noAnswer.length} ta javobsiz savol bor`);
        return;
      }
    }

    setIsSaving(true);
    setError('');

    try {
      let savedTest: any = null;

      for (const t of parsed) {
        const questions = t.questions.map(q => {
          let text = q.text;
          if (typeof text === 'object' && text !== null) text = JSON.stringify(text);
          const variants = (q.variants || []).map((v: any) => {
            let vt = v.text;
            if (typeof vt === 'object' && vt !== null) vt = JSON.stringify(vt);
            return { ...v, text: vt };
          });
          return { ...q, text, variants, imageUrl: q.imageUrl || q.image, image: undefined };
        });

        savedTest = await importMutation.mutateAsync({
          questions,
          classNumber: selectedGroup.classNumber,
          subjectId: t.subjectId,
          groupLetter: selectedGroup.letter || null,
          periodMonth,
          periodYear,
        });
      }

      // Variant generatsiya
      if (savedTest) {
        try {
          const { data: students } = await api.get('/students', { params: { classNumber: selectedGroup.classNumber } });
          if (students.length > 0) {
            await generateVariantsMutation.mutateAsync({
              testId: savedTest.blockTest._id,
              studentIds: students.map((s: any) => s._id),
            });
          }
        } catch { /* variant generatsiyasi muvaffaqiyatsiz — asosiy saqlash OK */ }
      }

      const total = parsed.reduce((s, t) => s + t.questions.length, 0);
      showSuccessToast(`${parsed.length} fan, ${total} savol saqlandi!`);
      setDone(true);
      setTimeout(() => navigate('/teacher/block-tests', { state: { refresh: true } }), 2000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Saqlashda xatolik');
      showErrorToast('Saqlashda xatolik');
    } finally {
      setIsSaving(false);
    }
  };

  // ============ COMPUTED ============

  const totalQuestions = tabs.reduce((s, t) => s + (t.status === 'parsed' ? t.questions.length : 0), 0);
  const parsedCount = tabs.filter(t => t.status === 'parsed' && t.questions.length > 0).length;

  // ============ RENDER ============

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 -m-4 sm:-m-6 lg:-m-8 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Muvaffaqiyatli!</h3>
          <p className="text-gray-600">{parsedCount} fan, {totalQuestions} ta savol yuklandi</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 -m-4 sm:-m-6 lg:-m-8">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/teacher/block-tests')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-lg font-semibold">Blok test yuklash</h1>
          </div>
          <div className="flex items-center gap-3">
            {totalQuestions > 0 && (
              <span className="text-sm text-gray-500">{parsedCount} fan, {totalQuestions} savol</span>
            )}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button onClick={() => setViewMode('full')} className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'full' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600'}`}>
                <FileText className="w-3.5 h-3.5" /><span className="hidden sm:inline">To'liq</span>
              </button>
              <button onClick={() => setViewMode('compact')} className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'compact' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600'}`}>
                <ClipboardList className="w-3.5 h-3.5" /><span className="hidden sm:inline">Titul</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4 space-y-3 pb-48 lg:pb-32">
        {/* Guruh va davr */}
        <div className="bg-white border rounded-lg p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Guruh</label>
              {loadingGroups ? (
                <div className="flex items-center gap-2 px-3 py-2 border rounded-lg bg-gray-50">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm text-gray-500">Yuklanmoqda...</span>
                </div>
              ) : (
                <select
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Guruhni tanlang</option>
                  {groups.map((g: any) => (
                    <option key={g._id} value={g._id}>
                      {g.classNumber}-sinf {g.letter} — {g.subjectId?.nameUzb || g.name} ({g.studentsCount} o'quvchi)
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Davr</label>
              <input
                type="month"
                value={`${periodYear}-${String(periodMonth).padStart(2, '0')}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split('-');
                  setPeriodYear(parseInt(y));
                  setPeriodMonth(parseInt(m));
                }}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {selectedGroup && (
            <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
              <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">{selectedGroup.classNumber}-sinf</span>
              <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium">{selectedGroup.letter} guruh</span>
              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{selectedGroup.studentsCount} o'quvchi</span>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Fan tablari */}
        <div className="bg-white border rounded-lg overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-center border-b overflow-x-auto">
            {tabs.map((t, i) => {
              const label = subjects.find((s: any) => s._id === t.subjectId)?.nameUzb || 'Fan tanlang';
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(i)}
                  className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
                    activeTab === i
                      ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                      : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  {t.status === 'parsed' && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                  {t.status === 'uploading' && <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
                  {t.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                  {t.status === 'idle' && <FileText className="w-3.5 h-3.5 text-gray-400" />}
                  <span>{label}</span>
                  {t.questions.length > 0 && (
                    <span className="bg-green-100 text-green-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{t.questions.length}</span>
                  )}
                  {tabs.length > 1 && activeTab === i && (
                    <button onClick={(e) => { e.stopPropagation(); removeTab(i); }} className="ml-1 text-gray-400 hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </button>
              );
            })}
            {tabs.length < 5 && (
              <button onClick={addTab} className="flex items-center gap-1 px-4 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50 whitespace-nowrap border-b-2 border-transparent">
                <Plus className="w-4 h-4" />Fan qo'shish
              </button>
            )}
          </div>

          {/* Tab content */}
          {tab && (
            <div className="p-4 space-y-3">
              {/* Fan tanlash */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fan</label>
                <select
                  value={tab.subjectId}
                  onChange={(e) => {
                    const subjectId = e.target.value;
                    const subject = subjects.find((s: any) => s._id === subjectId);
                    const parserKey = subject ? getParserKeyFromSubject(subject.nameUzb) : 'math';
                    update(activeTab, { subjectId, parserKey });
                  }}
                  disabled={tab.status === 'uploading'}
                  className="w-full px-2 py-1.5 border rounded text-sm focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Fanni tanlang</option>
                  {subjects.filter((s: any) => {
                    const key = getParserKeyFromSubject(s.nameUzb);
                    const lower = s.nameUzb.toLowerCase();
                    // Faqat 5 ta blok test fanlari: math, physics, chemistry, biology, literature
                    if (key === 'math') return lower.includes('matematika') || lower.includes('algebra');
                    return true;
                  }).map((s: any) => <option key={s._id} value={s._id}>{s.nameUzb}</option>)}
                </select>
              </div>

              {/* File upload */}
              {(tab.status === 'idle' || tab.status === 'error') && (
                <div className="space-y-2">
                  <label className="block cursor-pointer">
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-colors">
                      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-700">{tab.file ? tab.file.name : 'Faylni tanlang'}</p>
                      <p className="text-xs text-gray-400 mt-1">Word (.docx)</p>
                    </div>
                    <input type="file" className="hidden" accept=".doc,.docx,.jpg,.jpeg,.png" onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        const patch: Partial<SubjectTab> = { file: f, error: '' };
                        // Fayl nomidan fanni avtomatik aniqlash
                        if (!tab.subjectId && f.name) {
                          const fn = f.name.toLowerCase();
                          let detected = '';
                          if (fn.includes('fizika') || fn.includes('physics')) detected = 'physics';
                          else if (fn.includes('kimyo') || fn.includes('chem')) detected = 'chemistry';
                          else if (fn.includes('biolog')) detected = 'biology';
                          else if (fn.includes('adabiyot') || fn.includes('ona_tili') || fn.includes('onatili')) detected = 'literature';
                          else if (fn.includes('matem') || fn.includes('algebra') || fn.includes('math')) detected = 'math';
                          if (detected) {
                            const match = subjects.find((s: any) => getParserKeyFromSubject(s.nameUzb) === detected);
                            if (match) { patch.subjectId = match._id; patch.parserKey = detected; }
                          }
                        }
                        update(activeTab, patch);
                      }
                    }} />
                  </label>

                  {tab.error && (
                    <div className="bg-red-50 border border-red-200 rounded p-2 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-red-700">{tab.error}</p>
                    </div>
                  )}

                  {tab.file && (
                    <div className="flex gap-2">
                      <Button onClick={() => handleUpload(activeTab)} size="sm" className="flex-1">
                        Yuklash va tahlil qilish
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => update(activeTab, { file: null })}>
                        Bekor
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {tab.status === 'uploading' && (
                <div className="flex items-center justify-center py-8 gap-2 text-blue-600">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Tahlil qilinmoqda...</span>
                </div>
              )}

              {/* Questions preview */}
              {tab.status === 'parsed' && tab.questions.length > 0 && (
                <div className="space-y-2">
                  {tab.error && (
                    <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-800">{tab.error}</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">{tab.questions.length} ta savol</span>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => update(activeTab, { status: 'idle', file: null, questions: [] })}>
                        Qayta yuklash
                      </Button>
                      <Button variant="outline" size="sm" onClick={addQuestion}>+ Savol</Button>
                    </div>
                  </div>

                  {viewMode === 'full' ? (
                    tab.questions.map((q, qi) => (
                      <div key={qi} className="bg-gray-50 border p-3 rounded-lg">
                        <div className="flex items-start gap-2">
                          <span className="font-semibold text-gray-700 text-sm mt-1">{qi + 1}.</span>
                          <div className="flex-1 space-y-2">
                            <div className="border rounded bg-white">
                              <RichTextEditor value={q.text} onChange={(v) => changeQuestion(qi, 'text', v)} placeholder="Savol..." />
                            </div>
                            {(q.image || q.imageUrl) ? (
                              <div className="relative inline-block">
                                <img src={q.imageUrl || q.image} alt="" className="rounded border"
                                  style={{ maxWidth: q.imageWidth ? `${q.imageWidth}px` : '20rem', maxHeight: q.imageHeight ? `${q.imageHeight}px` : '12rem' }}
                                />
                                <button onClick={() => removeImage(qi)} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded hover:bg-red-600">
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <label className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 border border-dashed rounded hover:border-blue-400 hover:bg-blue-50/50 transition-colors">
                                <ImagePlus className="w-3 h-3 text-gray-500" /><span className="text-xs text-gray-600">Rasm</span>
                                <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadImage(qi, e)} />
                              </label>
                            )}
                          </div>
                          <button onClick={() => removeQuestion(qi)} className="text-red-400 hover:text-red-600 p-0.5">
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="space-y-1.5 ml-5 mt-2">
                          {q.variants.map((v, vi) => (
                            <div key={vi} className="flex items-center gap-1.5">
                              <button onClick={() => changeQuestion(qi, 'correctAnswer', v.letter)}
                                className={`flex items-center justify-center w-7 h-7 rounded-full border transition-all ${
                                  q.correctAnswer === v.letter ? 'bg-green-500 border-green-600 text-white' : 'bg-gray-50 border-gray-300 text-gray-700 hover:border-green-400'
                                }`}
                              >
                                <span className="font-semibold text-xs">{v.letter}</span>
                              </button>
                              <div className="flex-1 border rounded bg-white">
                                <RichTextEditor value={v.text} onChange={(val) => changeVariant(qi, vi, val)} placeholder="Variant..." />
                              </div>
                              <button onClick={() => removeVariant(qi, vi)} className="text-red-400 hover:text-red-600 p-0.5">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          <button onClick={() => addVariant(qi)} className={`text-xs text-blue-600 hover:text-blue-700 ${q.variants.length > 0 ? 'ml-8' : ''}`}>
                            + Variant
                          </button>
                        </div>

                        <div className="flex items-center gap-2 ml-5 pt-2 border-t mt-2">
                          <label className="text-xs text-gray-500">Ball:</label>
                          <input type="number" value={q.points} onChange={(e) => changeQuestion(qi, 'points', e.target.value)}
                            className="w-14 px-1.5 py-0.5 border rounded text-xs" min="1" />
                        </div>
                      </div>
                    ))
                  ) : (
                    /* COMPACT VIEW */
                    <div className="bg-gray-50 border rounded-lg">
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b px-4 py-3 rounded-t-lg flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <ClipboardList className="w-4 h-4 text-blue-600" />
                            Titul varoq — {subjects.find((s: any) => s._id === tab.subjectId)?.nameUzb || 'Fan tanlanmagan'}
                          </h3>
                        </div>
                        <div className="flex gap-4 text-center">
                          <div><div className="text-xl font-bold">{tab.questions.length}</div><div className="text-xs text-gray-500">Jami</div></div>
                          <div><div className="text-xl font-bold text-green-600">{tab.questions.filter(q => q.correctAnswer).length}</div><div className="text-xs text-gray-500">Belgilangan</div></div>
                          <div><div className="text-xl font-bold text-amber-600">{tab.questions.filter(q => !q.correctAnswer).length}</div><div className="text-xs text-gray-500">Qolgan</div></div>
                        </div>
                      </div>
                      <div className="p-3 space-y-1">
                        {tab.questions.map((q, qi) => (
                          <div key={qi} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${
                            q.correctAnswer ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white hover:border-blue-300'
                          }`}>
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-sm">{qi + 1}</div>
                            <div className="flex-1 flex items-center gap-1.5">
                              {q.variants.map(v => (
                                <button key={v.letter} onClick={() => changeQuestion(qi, 'correctAnswer', v.letter)}
                                  className={`w-9 h-9 rounded-lg border-2 font-bold text-sm transition-all ${
                                    q.correctAnswer === v.letter ? 'bg-green-500 border-green-600 text-white shadow-md scale-110' : 'bg-white border-gray-300 text-gray-700 hover:border-green-400'
                                  }`}
                                >{v.letter}</button>
                              ))}
                            </div>
                            {q.correctAnswer && (
                              <div className="flex items-center gap-1 px-2 py-0.5 bg-green-100 border border-green-300 rounded-lg">
                                <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                                <span className="font-bold text-green-700 text-sm">{q.correctAnswer}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg xl:left-72 z-40 pb-20 xl:pb-0">
          <div className="max-w-7xl mx-auto px-4 py-2 flex gap-2">
            <Button onClick={handleSave} disabled={isSaving || totalQuestions === 0 || !selectedGroupId} className="flex-1" size="sm">
              {isSaving ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Saqlanmoqda...</>
              ) : (
                `Saqlash (${parsedCount} fan, ${totalQuestions} savol)`
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/teacher/block-tests')} disabled={isSaving}>
              Bekor qilish
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
