import React, { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Printer, Search } from 'lucide-react';

interface StudentSelectionPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: any[];
  mode: 'questions' | 'answers' | 'sheets';
  onPrint: (selectedStudentIds: string[], fontSize?: number) => void;
}

export default function StudentSelectionPrintModal({
  isOpen,
  onClose,
  students,
  mode,
  onPrint
}: StudentSelectionPrintModalProps) {
  const [selectedStudents, setSelectedStudents] = useState<string[]>(
    students.map(s => s._id)
  );
  const [searchQuery, setSearchQuery] = useState('');

  const filteredStudents = students.filter(student =>
    student.fullName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleAll = () => {
    if (selectedStudents.length === students.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(students.map(s => s._id));
    }
  };

  const handleToggleStudent = (studentId: string) => {
    if (selectedStudents.includes(studentId)) {
      setSelectedStudents(selectedStudents.filter(id => id !== studentId));
    } else {
      setSelectedStudents([...selectedStudents, studentId]);
    }
  };

  const handlePrint = () => {
    onPrint(selectedStudents);
  };

  const getTitle = () => {
    switch (mode) {
      case 'questions':
        return 'Savollarni chop etish';
      case 'answers':
        return 'Javob varaqlarini chop etish';
    }
  };

  const getDescription = () => {
    switch (mode) {
      case 'questions':
        return 'Faqat test savollari chop etiladi';
      case 'answers':
        return 'Faqat javob varaqlari chop etiladi';
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="max-w-2xl">
      <div className="p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{getTitle()}</h2>
        <p className="text-sm text-gray-600 mb-6">{getDescription()}</p>

        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              type="text"
              placeholder="O'quvchi ismini qidirish..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Select All */}
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <label className="flex items-center gap-3 cursor-pointer">
            <Checkbox
              checked={selectedStudents.length === students.length}
              onChange={handleToggleAll}
            />
            <span className="font-medium text-gray-900">
              Barchasini tanlash ({selectedStudents.length}/{students.length})
            </span>
          </label>
        </div>

        {/* Students List */}
        <div className="max-h-96 overflow-y-auto space-y-2 mb-6">
          {filteredStudents.map((student) => (
            <div
              key={student._id}
              className="p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={selectedStudents.includes(student._id)}
                  onChange={() => handleToggleStudent(student._id)}
                />
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{student.fullName}</p>
                  <p className="text-sm text-gray-600">
                    {student.directionId?.nameUzb || 'Yo\'nalish ko\'rsatilmagan'}
                  </p>
                </div>
              </label>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Bekor qilish
          </Button>
          <Button
            onClick={handlePrint}
            disabled={selectedStudents.length === 0}
            className="flex-1"
          >
            <Printer className="w-4 h-4 mr-2" />
            Chop etish ({selectedStudents.length})
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
