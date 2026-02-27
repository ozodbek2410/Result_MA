import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import {
  Plus, X, Upload, CheckCircle, AlertCircle, Loader2,
  Trash2, ImagePlus, Shuffle, Pin, ChevronLeft, ChevronRight,
} from 'lucide-react';
import api from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import RichTextEditor from '@/components/editor/RichTextEditor';

export interface BlockTestFormData {
  classNumber: number;
  subjectId: string;
  groupLetter: string;
  periodMonth: number;
  periodYear: number;
  shuffleAfterImport: boolean;
}

interface BlockTestImportFormProps {
  parsedQuestions?: unknown[];
  onConfirm?: (data: BlockTestFormData) => Promise<void>;
  onCancel?: () => void;
  isProcessing?: boolean;
  standalone?: boolean;
}

function getParserKeyFromSubject(name: string): string {
  const l = name.toLowerCase();
  if (l.includes('matematika') || l.includes('algebra') || l.includes('geometriya')) return 'math';
  if (l.includes('fizika')) return 'physics';
  if (l.includes('kimyo')) return 'chemistry';
  if (l.includes('biologiya') || l.includes('tibbiyot')) return 'biology';
  if (l.includes('ona tili') || l.includes('adabiyot')) return 'literature';
  return 'math';
}

interface ParsedQuestion {
  text: string;
  formula?: string;
  variants: { letter: string; text: string; formula?: string; imageUrl?: string; imageWidth?: number; imageHeight?: number }[];
  correctAnswer: string;
  points: number;
  image?: string;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  media?: { type: string; url: string; position: string }[];
  pinned?: boolean;
}

interface SubjectTab {
  id: string;
  subjectId: string;
  groupLetter: string;
  file: File | null;
  questions: ParsedQuestion[];
  error: string;
  status: 'idle' | 'loading' | 'done' | 'error';
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const HIDDEN_SUBJECTS = ['it', 'shaxmat', 'sport', 'gimnastika', 'tarbiya', 'texnologiya', 'tasviriy', 'xoreografiya', 'xaregrofiya', 'xoreograf'];
const filterSubjects = (list: { _id: string; nameUzb: string }[]) =>
  list.filter(s => !HIDDEN_SUBJECTS.some(h => s.nameUzb.toLowerCase().includes(h)));
const months = [
  { value: 1, label: 'Yanvar' }, { value: 2, label: 'Fevral' },
  { value: 3, label: 'Mart' }, { value: 4, label: 'Aprel' },
  { value: 5, label: 'May' }, { value: 6, label: 'Iyun' },
  { value: 7, label: 'Iyul' }, { value: 8, label: 'Avgust' },
  { value: 9, label: 'Sentabr' }, { value: 10, label: 'Oktabr' },
  { value: 11, label: 'Noyabr' }, { value: 12, label: 'Dekabr' },
];

export function BlockTestImportForm({
  standalone = true, parsedQuestions, onConfirm, onCancel, isProcessing: externalProcessing,
}: BlockTestImportFormProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('editId');
  const { success, error: showError, warning: showWarning } = useToast();

  const [classNumber, setClassNumber] = useState('');
  const [periodMonth, setPeriodMonth] = useState(new Date().getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());
  const [subjects, setSubjects] = useState<{ _id: string; nameUzb: string }[]>([]);
  const [groups, setGroups] = useState<{ _id: string; name: string; classNumber: number; letter: string; subjectId?: { nameUzb: string }; studentsCount: number }[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [tabs, setTabs] = useState<SubjectTab[]>([mkTab()]);
  const [activeId, setActiveId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shuffleAfterImport, setShuffleAfterImport] = useState(true);
  const [error, setError] = useState('');
  const [editLoading, setEditLoading] = useState(!!editId);

  const curYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => curYear - 2 + i);

  useEffect(() => { api.get('/subjects').then(({ data }) => setSubjects(filterSubjects(data || []))).catch(() => {}); }, []);
  useEffect(() => {
    api.get('/groups').then(({ data }) => {
      const sorted = (data || []).sort((a: { classNumber: number; letter: string }, b: { classNumber: number; letter: string }) =>
        a.classNumber !== b.classNumber ? a.classNumber - b.classNumber : a.letter.localeCompare(b.letter)
      );
      setGroups(sorted);
    }).catch(() => {});
  }, []);
  useEffect(() => { if (!activeId && tabs.length) setActiveId(tabs[0].id); }, [tabs, activeId]);

  // Load existing block test for editing
  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        const { data: bt } = await api.get(`/block-tests/${editId}`);
        setClassNumber(String(bt.classNumber || ''));
        setPeriodMonth(bt.periodMonth || new Date().getMonth() + 1);
        setPeriodYear(bt.periodYear || new Date().getFullYear());
        const gId = typeof bt.groupId === 'object' ? bt.groupId?._id : bt.groupId;
        if (gId) setSelectedGroupId(gId);

        // Barcha tegishli blok testlarni yuklash (bir xil sinf/davr/guruh)
        let allSubjectTests: { subjectId: { _id?: string } | string; groupLetter?: string; questions?: ParsedQuestion[] }[] = [];
        try {
          const { data: relatedTests } = await api.get('/block-tests', {
            params: {
              classNumber: bt.classNumber,
              periodMonth: bt.periodMonth,
              periodYear: bt.periodYear,
              ...(gId ? { groupId: gId } : {}),
              fields: 'full',
            },
          });
          const seen = new Set<string>();
          for (const rt of relatedTests) {
            for (const st of rt.subjectTests || []) {
              if (!st.subjectId) continue;
              const sid = typeof st.subjectId === 'object' ? st.subjectId._id : st.subjectId;
              const key = `${sid}_${st.groupLetter || ''}`;
              if (!seen.has(key)) {
                seen.add(key);
                allSubjectTests.push(st);
              }
            }
          }
        } catch {
          allSubjectTests = bt.subjectTests || [];
        }

        if (allSubjectTests.length > 0) {
          const loaded: SubjectTab[] = allSubjectTests.map((st) => ({
            id: Math.random().toString(36).slice(2),
            subjectId: typeof st.subjectId === 'object' ? st.subjectId?._id || '' : st.subjectId || '',
            groupLetter: st.groupLetter || '',
            file: null,
            questions: (st.questions || []).map((q: ParsedQuestion) => ({
              text: q.text || '',
              formula: q.formula,
              variants: (q.variants || []).map(v => ({ ...v })),
              correctAnswer: q.correctAnswer || '',
              points: q.points || 1,
              pinned: q.pinned || false,
              image: undefined,
              imageUrl: q.imageUrl,
              imageWidth: q.imageWidth,
              imageHeight: q.imageHeight,
              media: q.media,
            })),
            error: '',
            status: 'done' as const,
          }));
          setTabs(loaded);
          setActiveId(loaded[0].id);
        }
      } catch (err) {
        console.error('Error loading block test for edit:', err);
        showError('Blok testni yuklashda xatolik');
      } finally {
        setEditLoading(false);
      }
    })();
  }, [editId]);

  function mkTab(): SubjectTab {
    return { id: Math.random().toString(36).slice(2), subjectId: '', groupLetter: '', file: null, questions: [], error: '', status: 'idle' };
  }

  const upd = (id: string, p: Partial<SubjectTab>) => setTabs(prev => prev.map(t => t.id === id ? { ...t, ...p } : t));

  const addTab = () => { const t = mkTab(); setTabs(p => [...p, t]); setActiveId(t.id); };

  const removeTab = (id: string) => {
    setTabs(prev => {
      if (prev.length <= 1) return prev;
      const f = prev.filter(t => t.id !== id);
      if (activeId === id) setActiveId(f[0].id);
      return f;
    });
  };

  const moveTab = (id: string, dir: -1 | 1) => {
    setTabs(prev => {
      const i = prev.findIndex(t => t.id === id);
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const active = tabs.find(t => t.id === activeId);

  // --- Parse ---
  const handleParseAll = async () => {
    const todo = tabs.filter(t => t.subjectId && t.file && t.status !== 'done');
    if (!todo.length) return;
    setUploading(true);
    await Promise.all(todo.map(async (tab) => {
      upd(tab.id, { status: 'loading', error: '' });
      try {
        const sub = subjects.find(s => s._id === tab.subjectId);
        const pk = sub ? getParserKeyFromSubject(sub.nameUzb) : 'math';
        const fd = new FormData();
        fd.append('file', tab.file!);
        fd.append('format', 'word');
        fd.append('subjectId', pk);
        const { data } = await api.post('/tests/import', fd, {
          headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000,
        });
        if (data.questions?.length > 0) {
          upd(tab.id, { questions: data.questions, status: 'done' });
          setActiveId(tab.id);
          // Alert: to'g'ri javob belgilanmagan savollar
          const noAns = (data.questions as ParsedQuestion[])
            .map((q: ParsedQuestion, i: number) => (!q.correctAnswer ? i + 1 : null))
            .filter(Boolean) as number[];
          if (noAns.length > 0) {
            const subName = sub?.nameUzb || 'Fan';
            showWarning(`${subName}: ${noAns.length} ta savolda to'g'ri javob belgilanmagan (${noAns.join(', ')}-savollar)`);
          }
        } else {
          upd(tab.id, { error: 'Savollar topilmadi', status: 'error' });
        }
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Xatolik';
        upd(tab.id, { error: msg, status: 'error' });
      }
    }));
    setUploading(false);
  };

  // --- Save ---
  const handleSave = async () => {
    if (!classNumber || !selectedGroupId) { setError('Guruhni tanlang'); return; }
    const done = tabs.filter(t => t.status === 'done' && t.subjectId && t.questions.length > 0);
    if (!done.length) { setError('Kamida bitta fanni tahlil qiling'); return; }

    const missingDetails: string[] = [];
    for (const t of done) {
      const nums = t.questions.map((q, i) => (!q.correctAnswer ? i + 1 : null)).filter(Boolean);
      if (nums.length > 0) {
        const subName = subjects.find(s => s._id === t.subjectId)?.nameUzb || 'Fan';
        missingDetails.push(`${subName}: ${nums.join(', ')}-savollar`);
      }
    }
    if (missingDetails.length > 0) { setError(`To'g'ri javob belgilanmagan: ${missingDetails.join('; ')}`); return; }

    setSaving(true); setError('');
    try {
      let savedBlockTestId = editId || '';
      for (const tab of done) {
        const qs = tab.questions.map(q => {
          const text = typeof q.text === 'object' && q.text !== null ? JSON.stringify(q.text) : q.text;
          const variants = (q.variants || []).map(v => ({
            ...v, text: typeof v.text === 'object' && v.text !== null ? JSON.stringify(v.text) : v.text,
          }));
          return { ...q, text, variants, imageUrl: q.imageUrl || q.image, image: undefined };
        });
        const res = await api.post('/block-tests/import/confirm', {
          questions: qs, classNumber: parseInt(classNumber),
          subjectId: tab.subjectId, groupLetter: tab.groupLetter || null,
          periodMonth, periodYear, groupId: selectedGroupId,
          blockTestId: savedBlockTestId || undefined,
        });
        if (res.data?.blockTest?._id) savedBlockTestId = res.data.blockTest._id;
      }
      // Save subject order
      if (savedBlockTestId && done.length > 1) {
        try {
          await api.put(`/block-tests/${savedBlockTestId}/reorder-subjects`, {
            order: done.map(t => ({ subjectId: t.subjectId, groupLetter: t.groupLetter || null })),
          });
        } catch { /* optional */ }
      }
      if (shuffleAfterImport && savedBlockTestId) {
        try {
          const { data: sts } = await api.get('/students', { params: { groupId: selectedGroupId } });
          if (sts.length > 0) await api.post(`/block-tests/${savedBlockTestId}/generate-variants`, { studentIds: sts.map((s: { _id: string }) => s._id) });
        } catch { /* optional */ }
      }
      const selectedGroup = groups.find(g => g._id === selectedGroupId);
      const groupLabel = selectedGroup ? `${selectedGroup.classNumber}-${selectedGroup.letter}` : `${classNumber}-sinf`;
      success(`${groupLabel} guruhga ${done.length} ta fan muvaffaqiyatli saqlandi`);
      navigate('/teacher/block-tests', { state: { refresh: true } });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Saqlashda xatolik';
      setError(msg);
    } finally { setSaving(false); }
  };

  // --- Question editing ---
  const qUpd = (tabId: string, idx: number, patch: Partial<ParsedQuestion>) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t;
      const qs = [...t.questions];
      qs[idx] = { ...qs[idx], ...patch };
      return { ...t, questions: qs };
    }));
  };

  const vUpd = (tabId: string, qi: number, vi: number, text: string) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t;
      const qs = [...t.questions];
      const vs = [...qs[qi].variants];
      vs[vi] = { ...vs[vi], text };
      qs[qi] = { ...qs[qi], variants: vs };
      return { ...t, questions: qs };
    }));
  };

  const addQuestion = (tabId: string) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t;
      return { ...t, questions: [...t.questions, {
        text: '', variants: [{ letter: 'A', text: '' }, { letter: 'B', text: '' }, { letter: 'C', text: '' }, { letter: 'D', text: '' }],
        correctAnswer: '', points: 1,
      }] };
    }));
  };

  const removeQuestion = (tabId: string, idx: number) => {
    setTabs(prev => prev.map(t => t.id !== tabId ? t : { ...t, questions: t.questions.filter((_, i) => i !== idx) }));
  };

  const addVariant = (tabId: string, qi: number) => {
    const ls = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t;
      const qs = [...t.questions];
      const used = qs[qi].variants.map(v => v.letter);
      const next = ls.find(l => !used.includes(l));
      if (!next) return t;
      qs[qi] = { ...qs[qi], variants: [...qs[qi].variants, { letter: next, text: '' }] };
      return { ...t, questions: qs };
    }));
  };

  const removeVariant = (tabId: string, qi: number, vi: number) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t;
      const qs = [...t.questions];
      qs[qi] = { ...qs[qi], variants: qs[qi].variants.filter((_, i) => i !== vi) };
      return { ...t, questions: qs };
    }));
  };

  const imgUpload = async (tabId: string, qi: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const fd = new FormData(); fd.append('file', f);
      const { data } = await api.post('/uploads', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      qUpd(tabId, qi, { image: data.path });
    } catch { showError('Rasmni yuklashda xatolik'); }
  };

  // --- Legacy mode ---
  if (!standalone && onConfirm && parsedQuestions) {
    return <LegacyForm parsedQuestions={parsedQuestions} onConfirm={onConfirm} onCancel={onCancel!} isProcessing={externalProcessing || false} />;
  }

  const hasReady = tabs.some(t => t.subjectId && t.file && t.status !== 'done');
  const hasDone = tabs.some(t => t.status === 'done');
  const busy = uploading || saving;
  const totalQ = tabs.reduce((s, t) => s + t.questions.length, 0);

  if (editLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mr-3" />
        <span className="text-gray-600">Blok test yuklanmoqda...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top: guruh + oy + yil — bir qatorda */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Guruh *</label>
          <select value={selectedGroupId}
            onChange={e => {
              const g = groups.find(g => g._id === e.target.value);
              setSelectedGroupId(e.target.value);
              setClassNumber(g ? String(g.classNumber) : '');
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" disabled={busy}>
            <option value="">Guruhni tanlang</option>
            {groups.map(g => (
              <option key={g._id} value={g._id}>
                {g.classNumber}-{g.letter} {g.subjectId?.nameUzb || g.name} ({g.studentsCount})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Oy</label>
          <select value={periodMonth} onChange={e => setPeriodMonth(parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" disabled={busy}>
            {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Yil</label>
          <select value={periodYear} onChange={e => setPeriodYear(parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" disabled={busy}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Fan tablari */}
      <div className="flex items-center gap-2 overflow-x-auto">
        {tabs.map((tab, tabIdx) => {
          const subName = subjects.find(s => s._id === tab.subjectId)?.nameUzb;
          const isAct = tab.id === activeId;
          return (
            <div key={tab.id} className="flex items-center gap-0.5 flex-shrink-0">
              {tabs.length > 1 && (
                <button onClick={() => moveTab(tab.id, -1)} disabled={tabIdx === 0 || busy}
                  className="p-0.5 text-gray-400 hover:text-blue-600 disabled:opacity-20 disabled:cursor-default" title="Chapga">
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setActiveId(tab.id)}
                className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium whitespace-nowrap transition-all ${
                  isAct ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}>
                {tab.status === 'done' && <span className="w-2 h-2 rounded-full bg-green-500" />}
                {tab.status === 'loading' && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
                {tab.status === 'error' && <span className="w-2 h-2 rounded-full bg-red-500" />}
                <span>{subName || 'Yangi fan'}</span>
                {tab.groupLetter && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">{tab.groupLetter}</span>}
                {tab.status === 'done' && <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">{tab.questions.length}</span>}
                {tabs.length > 1 && (
                  <span onClick={e => { e.stopPropagation(); removeTab(tab.id); }} className="ml-1 text-gray-400 hover:text-red-500">
                    <X className="w-3.5 h-3.5" />
                  </span>
                )}
              </button>
              {tabs.length > 1 && (
                <button onClick={() => moveTab(tab.id, 1)} disabled={tabIdx === tabs.length - 1 || busy}
                  className="p-0.5 text-gray-400 hover:text-blue-600 disabled:opacity-20 disabled:cursor-default" title="O'ngga">
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
        <button onClick={addTab} disabled={busy}
          className="flex items-center gap-1 px-3 py-2.5 rounded-lg border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-all flex-shrink-0 disabled:opacity-40">
          <Plus className="w-4 h-4" />Fan
        </button>
      </div>

      {/* Aktiv fan kontenti */}
      {active && (
        <div className="space-y-5">
          {/* Fan sozlamalari */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fan *</label>
              <select value={active.subjectId}
                onChange={e => upd(active.id, { subjectId: e.target.value, status: 'idle', questions: [], error: '' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" disabled={busy}>
                <option value="">Fanni tanlang</option>
                {subjects.map(s => <option key={s._id} value={s._id}>{s.nameUzb}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Guruh harfi</label>
              <select value={active.groupLetter}
                onChange={e => upd(active.id, { groupLetter: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" disabled={busy}>
                <option value="">Umumiy</option>
                {LETTERS.map(l => <option key={l} value={l}>{l} guruh</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">.docx fayl {active.status !== 'done' && '*'}</label>
              <input type="file" accept=".docx"
                onChange={e => upd(active.id, { file: e.target.files?.[0] || null, status: 'idle', questions: [], error: '' })}
                disabled={busy}
                className="w-full text-sm text-gray-500 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            </div>
          </div>

          {/* Tugmalar + xatolik */}
          {active.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{active.error}</p>
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            {hasReady && (
              <Button onClick={handleParseAll} disabled={busy} loading={uploading}>
                <Upload className="w-4 h-4 mr-1" />Tahlil qilish
              </Button>
            )}
            {hasDone && (
              <Button onClick={handleSave} disabled={busy} loading={saving}>
                <CheckCircle className="w-4 h-4 mr-1" />
                Saqlash ({tabs.filter(t => t.status === 'done').length} ta fan, {totalQ} ta savol)
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate('/teacher/block-tests')} disabled={busy}>
              Bekor qilish
            </Button>
            {hasDone && (
              <label className="flex items-center gap-2 ml-auto cursor-pointer">
                <div className={`relative w-10 h-5 rounded-full transition-colors ${shuffleAfterImport ? 'bg-blue-500' : 'bg-gray-300'}`}>
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${shuffleAfterImport ? 'translate-x-5' : ''}`} />
                </div>
                <Shuffle className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-xs text-gray-600">Aralashtirish</span>
              </label>
            )}
          </div>

          {/* Loading */}
          {active.status === 'loading' && (
            <div className="flex items-center justify-center py-12 text-blue-500">
              <Loader2 className="w-8 h-8 animate-spin mr-3" />
              <span className="text-gray-600">Tahlil qilinmoqda...</span>
            </div>
          )}

          {/* Savollar */}
          {active.status === 'done' && active.questions.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-700">{active.questions.length} ta savol</h4>
                <button onClick={() => addQuestion(active.id)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium">+ Savol qo'shish</button>
              </div>

              <div className="space-y-4">
                {active.questions.map((q, idx) => (
                  <div key={idx} className={`border-2 rounded-xl p-5 space-y-4 ${q.pinned ? 'border-amber-400 bg-amber-50/30' : 'border-gray-200'}`}>
                    {/* Question header */}
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center gap-1 mt-2">
                        <span className="font-bold text-gray-700 text-lg">{idx + 1}.</span>
                        <button type="button" onClick={() => qUpd(active.id, idx, { pinned: !q.pinned })}
                          title={q.pinned ? 'Joylashuv qulflangan' : 'Joylashuvni qulflash'}
                          className={`p-1 rounded transition-all ${q.pinned ? 'text-amber-600 bg-amber-100' : 'text-gray-300 hover:text-amber-500'}`}>
                          <Pin className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex-1 space-y-3">
                        <div className="border rounded-lg">
                          <RichTextEditor
                            value={q.text}
                            onChange={val => qUpd(active.id, idx, { text: val })}
                            placeholder="Savol matni..."
                          />
                        </div>

                        {/* Image */}
                        {(q.image || q.imageUrl) ? (
                          <div className="relative inline-block">
                            <img src={q.imageUrl || q.image} alt="Question"
                              className="rounded-lg border-2 border-gray-200"
                              style={q.imageWidth ? { width: q.imageWidth, maxWidth: '100%', height: 'auto' } : undefined}
                              onLoad={e => {
                                const img = e.currentTarget;
                                if (!img.style.width) {
                                  img.style.width = Math.round(img.naturalWidth * 0.64) + 'px';
                                  img.style.height = 'auto';
                                }
                              }} />
                            <button type="button" onClick={() => qUpd(active.id, idx, { image: undefined, imageUrl: undefined })}
                              className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 shadow-lg">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <label className="cursor-pointer">
                            <div className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all">
                              <ImagePlus className="w-5 h-5 text-gray-500" />
                              <span className="text-sm text-gray-600">Rasm qo'shish</span>
                            </div>
                            <input type="file" accept="image/*" className="hidden" onChange={e => imgUpload(active.id, idx, e)} />
                          </label>
                        )}
                      </div>
                      <button onClick={() => removeQuestion(active.id, idx)}
                        className="text-red-500 hover:text-red-700 p-2" title="Savolni o'chirish">
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Variants */}
                    <div className="space-y-3 ml-8">
                      {q.variants.map((v, vi) => (
                        <div key={vi} className="flex items-center gap-3">
                          <button type="button"
                            onClick={() => qUpd(active.id, idx, { correctAnswer: v.letter })}
                            className={`flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all ${
                              q.correctAnswer === v.letter
                                ? 'bg-green-500 border-green-600 text-white shadow-lg'
                                : 'bg-gray-50 border-gray-300 text-gray-700 hover:border-green-400 hover:bg-green-50'
                            }`}>
                            <span className="font-bold text-xl">{v.letter}</span>
                          </button>
                          <div className="flex-1">
                            <div className="border rounded-lg">
                              <RichTextEditor
                                value={v.text}
                                onChange={val => vUpd(active.id, idx, vi, val)}
                                placeholder={`Variant ${v.letter}...`}
                              />
                            </div>
                            {v.imageUrl && (
                              <img src={v.imageUrl} alt={`Variant ${v.letter}`}
                                className="mt-1 rounded border border-gray-200"
                                style={v.imageWidth ? { width: v.imageWidth, maxWidth: '100%', height: 'auto' } : undefined}
                                onLoad={e => {
                                  const img = e.currentTarget;
                                  if (!img.style.width) {
                                    img.style.width = Math.round(img.naturalWidth * 0.64) + 'px';
                                    img.style.height = 'auto';
                                  }
                                }} />
                            )}
                          </div>
                          <button onClick={() => removeVariant(active.id, idx, vi)}
                            className="text-red-500 hover:text-red-700 p-2">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                      <button onClick={() => addVariant(active.id, idx)}
                        className="ml-16 text-sm text-blue-600 hover:text-blue-700 font-medium">
                        + Variant qo'shish
                      </button>
                    </div>

                    {/* Points */}
                    <div className="flex items-center gap-3 ml-8 pt-4 border-t">
                      <label className="text-sm text-gray-600 font-medium">Ball:</label>
                      <input type="number" value={q.points} min="1"
                        onChange={e => qUpd(active.id, idx, { points: parseInt(e.target.value) || 1 })}
                        className="w-20 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-base" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

/** Legacy single-file form for backward compat */
function LegacyForm({ parsedQuestions, onConfirm, onCancel, isProcessing }: {
  parsedQuestions: unknown[]; onConfirm: (d: BlockTestFormData) => Promise<void>;
  onCancel: () => void; isProcessing: boolean;
}) {
  const { error: showErrorToast } = useToast();
  const [classNumber, setClassNumber] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [groupLetter, setGroupLetter] = useState('');
  const [subjects, setSubjects] = useState<{ _id: string; nameUzb: string }[]>([]);
  const [periodMonth, setPeriodMonth] = useState(new Date().getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());
  const [error, setError] = useState('');
  const curYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => curYear - 2 + i);

  useEffect(() => { api.get('/subjects').then(({ data }) => setSubjects(filterSubjects(data || []))).catch(() => {}); }, []);

  const handleSubmit = async () => {
    if (!classNumber) { setError('Sinfni tanlang'); showErrorToast('Sinfni tanlang'); return; }
    if (!selectedSubjectId) { setError('Fanni tanlang'); showErrorToast('Fanni tanlang'); return; }
    setError('');
    await onConfirm({ classNumber: parseInt(classNumber), subjectId: selectedSubjectId, groupLetter, periodMonth, periodYear, shuffleAfterImport: true });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900">Blok test ma'lumotlari</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sinf *</label>
          <select value={classNumber} onChange={e => setClassNumber(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" disabled={isProcessing}>
            <option value="">Tanlang</option>
            {[1,2,3,4,5,6,7,8,9,10,11].map(n => <option key={n} value={n}>{n}-sinf</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fan *</label>
          <select value={selectedSubjectId} onChange={e => setSelectedSubjectId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" disabled={isProcessing}>
            <option value="">Tanlang</option>
            {subjects.map(s => <option key={s._id} value={s._id}>{s.nameUzb}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Guruh harfi</label>
          <select value={groupLetter} onChange={e => setGroupLetter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" disabled={isProcessing}>
            <option value="">Umumiy</option>
            {LETTERS.map(l => <option key={l} value={l}>{l} guruh</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Davr</label>
          <div className="flex gap-2">
            <select value={periodMonth} onChange={e => setPeriodMonth(parseInt(e.target.value))}
              className="flex-1 px-2 py-2 border border-gray-300 rounded-lg text-sm" disabled={isProcessing}>
              {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select value={periodYear} onChange={e => setPeriodYear(parseInt(e.target.value))}
              className="w-24 px-2 py-2 border border-gray-300 rounded-lg text-sm" disabled={isProcessing}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={isProcessing}>Bekor qilish</Button>
        <Button onClick={handleSubmit} disabled={isProcessing || (parsedQuestions as unknown[]).length === 0}
          loading={isProcessing} className="flex-1">
          Saqlash ({(parsedQuestions as unknown[]).length} ta savol)
        </Button>
      </div>
    </div>
  );
}
