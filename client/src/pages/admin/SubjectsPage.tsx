import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Loading } from '@/components/ui/Loading';
import { EmptyState } from '@/components/ui/EmptyState';
import { BookMarked } from 'lucide-react';

interface SubjectItem {
  _id: string;
  crmId?: number;
  nameUzb: string;
  isMandatory: boolean;
  isActive: boolean;
  lastSyncedAt?: string;
}

export default function SubjectsPage() {
  const { data: subjects, isLoading } = useQuery<SubjectItem[]>({
    queryKey: ['admin-subjects'],
    queryFn: async () => {
      const res = await api.get('/subjects');
      return res.data;
    },
  });

  if (isLoading) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Fanlar"
        description="CRM dan sinxronlangan fanlar ro'yxati"
        icon={BookMarked}
      />

      {!subjects || subjects.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="Fanlar topilmadi"
          description="CRM dan sinxronlangandan keyin fanlar bu yerda ko'rinadi"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjects.map((subject) => (
            <div
              key={subject._id}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-gray-900 text-lg">{subject.nameUzb}</h3>
                <div className="flex items-center gap-1.5">
                  {subject.crmId ? (
                    <Badge variant="info" size="sm">CRM</Badge>
                  ) : (
                    <Badge variant="outline" size="sm">Lokal</Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-500">
                {subject.isMandatory && (
                  <Badge variant="warning" size="sm">Majburiy</Badge>
                )}
                <Badge variant={subject.isActive ? 'success' : 'secondary'} size="sm">
                  {subject.isActive ? 'Faol' : 'Nofaol'}
                </Badge>
              </div>
              {subject.lastSyncedAt && (
                <p className="text-xs text-gray-400 mt-3">
                  Yangilangan: {new Date(subject.lastSyncedAt).toLocaleDateString('uz-UZ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
