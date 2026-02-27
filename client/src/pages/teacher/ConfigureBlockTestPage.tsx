import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { StudentList } from '@/components/ui/StudentCard';
import { useToast } from '@/hooks/useToast';
import StudentSelectionPrintModal from '@/components/StudentSelectionPrintModal';
import BlockTestActionsModal from '@/components/BlockTestActionsModal';
import {
  ArrowLeft,
  Users,
  Eye,
  FileText,
  BookOpen
} from 'lucide-react';

export default function ConfigureBlockTestPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { success, error } = useToast();

  const [loading, setLoading] = useState(true);
  const [isShuffling, setIsShuffling] = useState(false);
  const [blockTest, setBlockTest] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [showActionsModal, setShowActionsModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printMode, setPrintMode] = useState<'questions' | 'answers'>('questions');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, [id]);

  const filteredStudents = students.filter(student => {
    const matchSearch = student.fullName.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchSearch) return false;
    if (selectedGroupId) {
      return student.groupIds?.includes(selectedGroupId) || student.groupId === selectedGroupId;
    }
    return true;
  }
  );

  const loadData = async () => {
    try {
      setLoading(true);

      const { data: testData } = await api.get(`/block-tests/${id}`);

      const groupIdParam = typeof testData.groupId === 'object' ? testData.groupId?._id : testData.groupId;

      const { data: sameGroupTests } = await api.get('/block-tests', {
        params: {
          classNumber: testData.classNumber,
          periodMonth: testData.periodMonth,
          periodYear: testData.periodYear,
          ...(groupIdParam ? { groupId: groupIdParam } : {}),
          fields: 'full'
        }
      });

      const allSubjects: any[] = [];
      sameGroupTests.forEach((test: any) => {
        test.subjectTests?.forEach((st: any) => {
          if (st.subjectId) {
            allSubjects.push({
              ...st,
              testId: test._id
            });
          }
        });
      });

      const mergedBlockTest = {
        ...testData,
        subjectTests: allSubjects,
        allTestIds: sameGroupTests.map((t: any) => t._id)
      };

      setBlockTest(mergedBlockTest);

      // Fetch groups for this class
      const { data: groupsData } = await api.get('/teacher/my-groups').catch(() => ({ data: [] }));
      const classGroups = groupsData.filter((g: any) => g.classNumber === testData.classNumber);
      setGroups(classGroups);

      const { data: studentsData } = await api.get('/students', {
        params: testData.groupId ? { groupId: typeof testData.groupId === 'object' ? testData.groupId._id : testData.groupId } : { classNumber: testData.classNumber }
      });

      // Variant statusini yuklash
      let variantStudentIds = new Set<string>();
      try {
        const { data: variantsData } = await api.get(`/student-variants/block-test/${id}`);
        variantStudentIds = new Set(variantsData.map((v: any) => (v.studentId?._id || v.studentId)?.toString()));
      } catch { /* variantlar yo'q */ }

      setStudents(studentsData.map((s: any) => ({
        ...s,
        hasVariant: variantStudentIds.has(s._id?.toString())
      })));

    } catch (err: any) {
      error('Ma\'lumotlarni yuklashda xatolik');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async (selectedStudentIds: string[], fontSize: number = 12) => {
    try {
      const selectedStudentsData = students.filter(s => selectedStudentIds.includes(s._id));
      localStorage.setItem('selectedStudents', JSON.stringify(selectedStudentsData));

      let url = '';
      const studentParams = selectedStudentIds.length > 0 ? `?students=${selectedStudentIds.join(',')}` : '';

      switch (printMode) {
        case 'questions':
          url = `/teacher/block-tests/${id}/print/questions${studentParams}`;
          break;
        case 'answers':
          url = `/teacher/block-tests/${id}/print/sheets${studentParams}`;
          break;
      }

      navigate(url);
      setShowPrintModal(false);
    } catch (err: any) {
      console.error('Error printing:', err);
      error('Chop etishda xatolik');
    }
  };

  // Fanlar va jami savollar
  const totalQuestions = blockTest?.subjectTests?.reduce((sum: number, st: any) => sum + (st.questions?.length || 0), 0) || 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/teacher/block-tests')}
          className="flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 truncate">Blok test</h1>
          <p className="text-xs text-slate-500">
            {blockTest?.classNumber}-sinf • {students.length} ta o'quvchi • {totalQuestions} ta savol
          </p>
        </div>
      </div>

      {/* Fanlar ro'yxati */}
      {blockTest?.subjectTests?.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-b px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              Fanlar
              <Badge variant="info" size="sm">{blockTest.subjectTests.length} ta fan</Badge>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {blockTest.subjectTests.map((st: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-sm flex items-center justify-center">
                    {idx + 1}
                  </div>
                  <span className="font-medium text-slate-900">{st.subjectId?.nameUzb || 'Fan'}</span>
                  {st.groupLetter ? (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                      {st.groupLetter} guruh
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                      Umumiy
                    </span>
                  )}
                </div>
                <span className="text-sm font-semibold text-slate-600">{st.questions?.length || 0} ta savol</span>
              </div>
            ))}
          </div>
          <div className="bg-slate-50 border-t px-4 py-2 text-right">
            <span className="text-sm font-bold text-slate-700">Jami: {totalQuestions} ta savol</span>
          </div>
        </div>
      )}

      {/* Actions Card */}
      <button
        onClick={() => setShowActionsModal(true)}
        className="w-full bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:bg-blue-50/50 transition-all group"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-slate-900 text-sm">Testni ko'rish va chop etish</div>
              <div className="text-xs text-slate-500">Variantlar, javoblar va chop etish</div>
            </div>
          </div>
          <Eye className="w-5 h-5 text-slate-400 group-hover:text-blue-500 transition-colors" />
        </div>
      </button>

      {/* Students List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Users className="w-4 h-4" />
              O'quvchilar ro'yxati
            </div>
            <Badge variant="info" size="sm">
              {filteredStudents.length} / {students.length}
            </Badge>
          </div>
        </div>

        {/* Group filter + Search */}
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 space-y-2">
          {groups.length > 0 && (
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Barcha o'quvchilar</option>
              {groups.map((g: any) => (
                <option key={g._id} value={g._id}>
                  {g.letter} guruh — {g.subjectId?.nameUzb || g.name} ({g.studentsCount} o'quvchi)
                </option>
              ))}
            </select>
          )}
          <div className="relative">
            <Input
              type="text"
              placeholder="O'quvchi ismini qidirish..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div>
          {students.length > 0 && (() => {
            const withVariant = students.filter(s => s.hasVariant).length;
            const total = students.length;
            return withVariant < total ? (
              <div className="mb-3 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                {withVariant}/{total} o'quvchida variant bor. Variantlarni qayta yarating.
              </div>
            ) : (
              <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                Barcha {total} o'quvchida variant mavjud.
              </div>
            );
          })()}
          <StudentList
            students={filteredStudents}
            emptyMessage={searchQuery ? "Qidiruv bo'yicha o'quvchi topilmadi" : "O'quvchilar topilmadi"}
          />
        </div>
      </div>

      {/* Block Test Actions Modal */}
      <BlockTestActionsModal
        isOpen={showActionsModal}
        onClose={() => setShowActionsModal(false)}
        blockTest={blockTest}
        studentCount={students.length}
        onViewAnswerKeys={() => {
          setShowActionsModal(false);
          navigate(`/teacher/block-tests/${id}/answer-keys`);
        }}
        onViewAllTests={() => {}}
        onViewAnswerSheets={() => {
          setShowActionsModal(false);
          navigate(`/teacher/block-tests/${id}/print/sheets`);
        }}
        onPrintQuestions={() => {
          setShowActionsModal(false);
          setPrintMode('questions');
          setShowPrintModal(true);
        }}
        onPrintAnswers={() => {
          setShowActionsModal(false);
          setPrintMode('answers');
          setShowPrintModal(true);
        }}
        onShuffle={async () => {
          try {
            setIsShuffling(true);
            const studentIds = students.map(s => s._id);
            await api.post(`/block-tests/${id}/generate-variants`, {
              studentIds
            });

            success(`${studentIds.length} ta o'quvchi uchun variantlar muvaffaqiyatli aralashtirildi!`);

            await loadData();
          } catch (err: any) {
            console.error('Error shuffling:', err);
            error('Variantlarni aralashtirishda xatolik');
          } finally {
            setIsShuffling(false);
          }
        }}
        isShuffling={isShuffling}
      />

      {/* Print Modal */}
      <StudentSelectionPrintModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        students={students}
        mode={printMode}
        onPrint={handlePrint}
      />
    </div>
  );
}
