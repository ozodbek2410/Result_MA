import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Loading } from '@/components/ui/Loading';
import { EmptyState } from '@/components/ui/EmptyState';
import { Compass } from 'lucide-react';

interface SubjectRef {
  _id: string;
  nameUzb: string;
}

interface DirectionSubject {
  type: 'single' | 'choice';
  subjectIds: SubjectRef[];
}

interface DirectionItem {
  _id: string;
  crmId?: number;
  nameUzb: string;
  subjects: DirectionSubject[];
  isActive: boolean;
  lastSyncedAt?: string;
}

export default function DirectionsPage() {
  const { data: directions, isLoading } = useQuery<DirectionItem[]>({
    queryKey: ['admin-directions'],
    queryFn: async () => {
      const res = await api.get('/directions');
      return res.data;
    },
  });

  if (isLoading) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Yo'nalishlar"
        description="CRM dan sinxronlangan yo'nalishlar va ularga tegishli fanlar"
        icon={Compass}
      />

      {!directions || directions.length === 0 ? (
        <EmptyState
          icon={Compass}
          title="Yo'nalishlar topilmadi"
          description="CRM dan sinxronlangandan keyin yo'nalishlar bu yerda ko'rinadi"
        />
      ) : (
        <div className="space-y-4">
          {directions.map((direction) => (
            <div
              key={direction._id}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg">{direction.nameUzb}</h3>
                  {direction.lastSyncedAt && (
                    <p className="text-xs text-gray-400 mt-1">
                      Yangilangan: {new Date(direction.lastSyncedAt).toLocaleDateString('uz-UZ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {direction.crmId ? (
                    <Badge variant="info" size="sm">CRM</Badge>
                  ) : (
                    <Badge variant="outline" size="sm">Lokal</Badge>
                  )}
                  <Badge variant={direction.isActive ? 'success' : 'secondary'} size="sm">
                    {direction.isActive ? 'Faol' : 'Nofaol'}
                  </Badge>
                </div>
              </div>

              {/* Subjects */}
              {direction.subjects.length > 0 && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-2">Fanlar</p>
                  <div className="flex flex-wrap gap-2">
                    {direction.subjects.map((ds, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                        {ds.subjectIds.map((subject) => (
                          <Badge key={subject._id} variant="outline" size="sm">
                            {subject.nameUzb}
                          </Badge>
                        ))}
                        {ds.type === 'choice' && ds.subjectIds.length > 1 && (
                          <span className="text-xs text-gray-400">(tanlov)</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
