import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Dialog, DialogHeader, DialogTitle, DialogContent } from './ui/Dialog';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { 
  Bell,
  Users,
  BookOpen,
  Edit,
  FileText,
  Award,
  Calendar,
  CheckCircle2,
  Circle
} from 'lucide-react';

interface StudentActivityModalProps {
  studentId: string | null;
  onClose: () => void;
}

const activityIcons: Record<string, any> = {
  group_added: Users,
  group_removed: Users,
  subject_added: BookOpen,
  subject_removed: BookOpen,
  profile_updated: Edit,
  test_assigned: FileText,
  grade_updated: Award
};

const activityColors: Record<string, { bg: string, text: string, icon: string }> = {
  group_added: { bg: 'bg-green-100', text: 'text-green-700', icon: 'text-green-600' },
  group_removed: { bg: 'bg-red-100', text: 'text-red-700', icon: 'text-red-600' },
  subject_added: { bg: 'bg-blue-100', text: 'text-blue-700', icon: 'text-blue-600' },
  subject_removed: { bg: 'bg-orange-100', text: 'text-orange-700', icon: 'text-orange-600' },
  profile_updated: { bg: 'bg-purple-100', text: 'text-purple-700', icon: 'text-purple-600' },
  test_assigned: { bg: 'bg-indigo-100', text: 'text-indigo-700', icon: 'text-indigo-600' },
  grade_updated: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: 'text-yellow-600' }
};

export default function StudentActivityModal({ studentId, onClose }: StudentActivityModalProps) {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (studentId) {
      fetchActivities();
    }
  }, [studentId]);

  const fetchActivities = async () => {
    if (!studentId) return;
    
    setLoading(true);
    try {
      const { data } = await api.get(`/activity-logs/student/${studentId}`);
      setActivities(data.logs || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAllAsRead = async () => {
    if (!studentId) return;
    
    try {
      await api.post(`/activity-logs/student/${studentId}/mark-read`);
      setActivities(activities.map(a => ({ ...a, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Hozir';
    if (diffMins < 60) return `${diffMins} daqiqa oldin`;
    if (diffHours < 24) return `${diffHours} soat oldin`;
    if (diffDays < 7) return `${diffDays} kun oldin`;
    
    return d.toLocaleDateString('uz-UZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  if (!studentId) return null;

  return (
    <Dialog open={!!studentId} onClose={onClose}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Bell className="w-6 h-6 text-primary" />
          O'zgarishlar tarixi
          {unreadCount > 0 && (
            <Badge variant="danger" size="sm">
              {unreadCount} yangi
            </Badge>
          )}
        </DialogTitle>
      </DialogHeader>
      <DialogContent>
        {unreadCount > 0 && (
          <div className="mb-4">
            <Button
              size="sm"
              variant="outline"
              onClick={markAllAsRead}
              className="w-full"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Barchasini o'qilgan deb belgilash
            </Button>
          </div>
        )}
        
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : activities.length > 0 ? (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {activities.map((activity) => {
              const Icon = activityIcons[activity.activityType] || Bell;
              const colors = activityColors[activity.activityType] || activityColors.profile_updated;
              
              return (
                <div
                  key={activity._id}
                  className={`flex gap-3 p-3 rounded-lg border transition-all ${
                    activity.isRead 
                      ? 'bg-white border-gray-200' 
                      : 'bg-blue-50 border-blue-300'
                  }`}
                >
                  <div className={`w-10 h-10 ${colors.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${colors.icon}`} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 text-sm mb-1">
                      {activity.title}
                    </h4>
                    
                    <p className="text-sm text-gray-600 mb-2">{activity.description}</p>
                    
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Calendar className="w-3 h-3" />
                      {formatDate(activity.createdAt)}
                      {activity.performedBy && (
                        <>
                          <span>•</span>
                          <span>{activity.performedBy.fullName || activity.performedBy.username}</span>
                        </>
                      )}
                    </div>
                  </div>
                  
                  {!activity.isRead && (
                    <div className="flex-shrink-0">
                      <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-600">Hali o'zgarishlar yo'q</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
