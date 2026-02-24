import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Loading } from '@/components/ui/Loading';
import { EmptyState } from '@/components/ui/EmptyState';
import { Users, Search, GraduationCap, BookOpen, User } from 'lucide-react';
import { Input } from '@/components/ui/Input';

interface GroupItem {
  _id: string;
  crmId?: number;
  name: string;
  classNumber: number;
  letter: string;
  studentsCount: number;
  teacherId?: { _id: string; fullName?: string; username: string };
  branchId?: { _id: string; name: string };
  subjectId?: { _id: string; nameUzb: string };
}

export default function GroupsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data: groups, isLoading } = useQuery<GroupItem[]>({
    queryKey: ['admin-groups'],
    queryFn: async () => {
      const res = await api.get('/groups');
      return res.data;
    },
  });

  if (isLoading) return <Loading />;

  const filtered = (groups ?? []).filter((g) => {
    const q = search.toLowerCase();
    return (
      g.name.toLowerCase().includes(q) ||
      g.teacherId?.fullName?.toLowerCase().includes(q) ||
      g.branchId?.name?.toLowerCase().includes(q) ||
      g.subjectId?.nameUzb?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="Guruhlar"
        description="Barcha guruhlar ro'yxati"
        icon={Users}
      />

      {/* Search */}
      {(groups?.length ?? 0) > 0 && (
        <div className="mb-4 max-w-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Guruh, o'qituvchi, fan bo'yicha..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Guruhlar topilmadi"
          description="CRM dan sinxronlangandan keyin guruhlar bu yerda ko'rinadi"
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Jami: {filtered.length} ta guruh</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Guruh</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fan</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">O'qituvchi</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Filial</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">O'quvchilar</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Manba</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((group) => (
                  <tr
                    key={group._id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/teacher/groups/${group._id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                          <Users className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{group.name}</p>
                          <p className="text-xs text-gray-400">{group.classNumber}-sinf, {group.letter}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {group.subjectId ? (
                        <div className="flex items-center gap-1.5 text-sm text-gray-700">
                          <BookOpen className="w-3.5 h-3.5 text-gray-400" />
                          {group.subjectId.nameUzb}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {group.teacherId ? (
                        <div className="flex items-center gap-1.5 text-sm text-gray-700">
                          <User className="w-3.5 h-3.5 text-gray-400" />
                          {group.teacherId.fullName || group.teacherId.username}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Tayinlanmagan</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {group.branchId?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1 text-sm text-gray-700">
                        <GraduationCap className="w-4 h-4 text-gray-400" />
                        {group.studentsCount ?? 0}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {group.crmId ? (
                        <Badge variant="info" size="sm">CRM</Badge>
                      ) : (
                        <Badge variant="outline" size="sm">Lokal</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
