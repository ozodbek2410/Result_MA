import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Users, Printer } from 'lucide-react';
import api from '@/lib/api';

interface Student {
  _id: string;
  fullName: string;
}

interface StudentSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string | null;
  onConfirm: (selectedStudents: Student[]) => void;
  title?: string;
}

export default function StudentSelectionModal({
  isOpen,
  onClose,
  groupId,
  onConfirm,
  title = "O'quvchilarni tanlang"
}: StudentSelectionModalProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && groupId) {
      fetchStudents();
    }
  }, [isOpen, groupId]);

  const fetchStudents = async () => {
    if (!groupId) return;
    
    try {
      setLoading(true);
      const { data } = await api.get(`/students/group/${groupId}`);
      setStudents(data);
      // По умолчанию выбираем всех учеников
      setSelectedIds(new Set(data.map((s: Student) => s._id)));
    } catch (error) {
      console.error('Error fetching students:', error);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (studentId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId);
    } else {
      newSelected.add(studentId);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(students.map(s => s._id)));
  };

  const handleClearAll = () => {
    setSelectedIds(new Set());
  };

  const handleConfirm = () => {
    const selected = students.filter(s => selectedIds.has(s._id));
    onConfirm(selected);
    onClose();
  };

  const getFullName = (student: Student) => {
    return student.fullName;
  };

  const getInitials = (student: Student) => {
    const parts = student.fullName.split(' ');
    if (parts.length >= 2) {
      return parts[0].charAt(0) + parts[1].charAt(0);
    }
    return student.fullName.substring(0, 2).toUpperCase();
  };

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3">
          <Users className="w-6 h-6 text-blue-600" />
          <span>{title}</span>
        </DialogTitle>
      </DialogHeader>

      <DialogContent>
        {loading ? (
          <div className="py-12 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
            <p className="text-gray-500 mt-4">Yuklanmoqda...</p>
          </div>
        ) : students.length === 0 ? (
          <div className="py-12 text-center">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Guruhda o'quvchilar topilmadi</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-900">
                <span className="font-semibold">{selectedIds.size}</span> ta tanlangan / 
                <span className="font-semibold"> {students.length}</span> ta jami
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                className="flex-1"
              >
                Hammasi
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearAll}
                className="flex-1"
              >
                Tozalash
              </Button>
            </div>

            {/* Students List */}
            <div className="border rounded-lg max-h-96 overflow-y-auto">
              {students.map((student, index) => (
                <div
                  key={student._id}
                  className={`flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors ${
                    index !== students.length - 1 ? 'border-b' : ''
                  }`}
                >
                  <Checkbox
                    checked={selectedIds.has(student._id)}
                    onChange={() => handleToggle(student._id)}
                  />
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                      {getInitials(student)}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{getFullName(student)}</p>
                    </div>
                  </div>
                  {selectedIds.has(student._id) && (
                    <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="flex gap-3 pt-3 border-t">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                Bekor qilish
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={selectedIds.size === 0}
                className="flex-1"
              >
                <Printer className="w-4 h-4 mr-2" />
                Chop etish ({selectedIds.size})
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
