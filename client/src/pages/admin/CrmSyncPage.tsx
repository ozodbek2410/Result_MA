import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Loading } from '@/components/ui/Loading';
import { RefreshCw, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface SyncResult {
  branches: { created: number; updated: number; deactivated: number };
  subjects: { created: number; updated: number };
  directions: { created: number; updated: number };
  teachers: { created: number; updated: number };
  groups: { created: number; updated: number; deactivated: number };
  students: { created: number; updated: number; deactivated: number };
  duration: number;
  syncErrors: string[];
}

interface SyncLog {
  _id: string;
  type: 'full' | 'manual' | 'scheduled';
  status: 'running' | 'completed' | 'failed';
  result?: SyncResult;
  startedAt: string;
  completedAt?: string;
  triggeredBy?: { fullName?: string; username: string };
  error?: string;
}

interface SyncStatus {
  isConfigured: boolean;
  isRunning: boolean;
  lastSync: SyncLog | null;
}

export default function CrmSyncPage() {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const { data: status, isLoading } = useQuery<SyncStatus>({
    queryKey: ['crm-sync-status'],
    queryFn: async () => {
      const res = await api.get('/crm/sync/status');
      return res.data;
    },
    refetchInterval: 5000,
  });

  const { data: logsData } = useQuery<{ logs: SyncLog[]; total: number }>({
    queryKey: ['crm-sync-logs'],
    queryFn: async () => {
      const res = await api.get('/crm/sync/logs?limit=20');
      return res.data;
    },
    refetchInterval: 10000,
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.post('/crm/sync');
      queryClient.invalidateQueries({ queryKey: ['crm-sync-status'] });
      queryClient.invalidateQueries({ queryKey: ['crm-sync-logs'] });
    } catch {
      // Error handled by interceptor
    } finally {
      setSyncing(false);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('uz-UZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)} min`;
  };

  if (isLoading) return <Loading />;

  const isRunning = status?.isRunning || syncing;

  return (
    <div>
      <PageHeader
        title="CRM Sinxronizatsiya"
        description="Math Academy CRM tizimidan ma'lumotlarni sinxronlash"
        icon={RefreshCw}
        actions={
          <button
            onClick={handleSync}
            disabled={isRunning || !status?.isConfigured}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
            {isRunning ? 'Sinxronlanmoqda...' : 'Sinxronlash'}
          </button>
        }
      />

      {/* Status Card */}
      {!status?.isConfigured && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">CRM API sozlanmagan</p>
            <p className="text-sm text-amber-600 mt-1">
              server/.env faylida CRM_API_URL, CRM_API_KEY va CRM_BEARER_TOKEN ni sozlang
            </p>
          </div>
        </div>
      )}

      {/* Last Sync Info */}
      {status?.lastSync && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">Oxirgi sinxronizatsiya</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase">Holat</p>
              <Badge
                variant={
                  status.lastSync.status === 'completed' ? 'success' :
                  status.lastSync.status === 'running' ? 'info' : 'danger'
                }
              >
                {status.lastSync.status === 'completed' ? 'Muvaffaqiyatli' :
                 status.lastSync.status === 'running' ? 'Ishlayapti' : 'Xato'}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Vaqt</p>
              <p className="text-sm font-medium">{formatDate(status.lastSync.startedAt)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Davomiyligi</p>
              <p className="text-sm font-medium">
                {status.lastSync.result ? formatDuration(status.lastSync.result.duration) : '-'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Turi</p>
              <p className="text-sm font-medium">
                {status.lastSync.type === 'manual' ? 'Qo\'lda' : 'Avtomatik'}
              </p>
            </div>
          </div>

          {/* Sync Result Details */}
          {status.lastSync.result && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {Object.entries(status.lastSync.result).map(([key, value]) => {
                if (key === 'duration' || key === 'syncErrors') return null;
                const v = value as { created: number; updated: number; deactivated?: number };
                return (
                  <div key={key} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 capitalize mb-1">{
                      key === 'branches' ? 'Filiallar' :
                      key === 'subjects' ? 'Fanlar' :
                      key === 'directions' ? 'Yo\'nalishlar' :
                      key === 'teachers' ? 'O\'qituvchilar' :
                      key === 'groups' ? 'Guruhlar' :
                      key === 'students' ? 'O\'quvchilar' : key
                    }</p>
                    <div className="flex items-center gap-2 text-sm">
                      {v.created > 0 && <span className="text-green-600">+{v.created}</span>}
                      {v.updated > 0 && <span className="text-blue-600">~{v.updated}</span>}
                      {v.deactivated && v.deactivated > 0 && <span className="text-red-600">-{v.deactivated}</span>}
                      {v.created === 0 && v.updated === 0 && (!v.deactivated || v.deactivated === 0) && (
                        <span className="text-gray-400">0</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Errors */}
          {status.lastSync.result?.syncErrors && status.lastSync.result.syncErrors.length > 0 && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm font-medium text-red-700 mb-1">Xatolar:</p>
              {status.lastSync.result.syncErrors.map((err, i) => (
                <p key={i} className="text-sm text-red-600">{err}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sync History */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Sinxronizatsiya tarixi</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {logsData?.logs?.map((log) => (
            <div key={log._id} className="px-6 py-3 flex items-center gap-4">
              {log.status === 'completed' ? (
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              ) : log.status === 'running' ? (
                <RefreshCw className="w-5 h-5 text-blue-500 animate-spin flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {log.type === 'manual' ? 'Qo\'lda' : 'Avtomatik'} sinxronizatsiya
                  </span>
                  <Badge size="sm" variant={log.status === 'completed' ? 'success' : log.status === 'failed' ? 'danger' : 'info'}>
                    {log.status}
                  </Badge>
                </div>
                {log.error && <p className="text-xs text-red-500 truncate">{log.error}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm text-gray-600">{formatDate(log.startedAt)}</p>
                {log.result && (
                  <p className="text-xs text-gray-400">{formatDuration(log.result.duration)}</p>
                )}
              </div>
            </div>
          ))}
          {(!logsData?.logs || logsData.logs.length === 0) && (
            <div className="px-6 py-8 text-center">
              <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Sinxronizatsiya tarixi yo'q</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
