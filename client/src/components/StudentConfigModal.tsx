import React, { useState, useEffect } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Plus, Trash2, RotateCcw } from 'lucide-react';
import api from '@/lib/api';

interface StudentConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: any;
  config: any;
  blockTest: any;
  onSave: () => void;
}

export default function StudentConfigModal({
  isOpen,
  onClose,
  student,
  config,
  blockTest,
  onSave
}: StudentConfigModalProps) {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [allSubjects, setAllSubjects] = useState<any[]>([]);
  const [directionSubjects, setDirectionSubjects] = useState<any[]>([]);
  const [pointsConfig, setPointsConfig] = useState<any[]>([]);
  const [availableLetters, setAvailableLetters] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      Promise.all([
        loadAllSubjects(),
        loadDirectionSubjects(),
        loadAvailableLetters()
      ]).finally(() => {
        console.log('✅ All data loaded');
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && directionSubjects.length > 0 && allSubjects.length > 0) {
      console.log('🔍 StudentConfigModal: config:', config);
      console.log('🔍 Direction subjects:', directionSubjects);
      console.log('🔍 Student data:', student);
      
      // Получаем букву группы студента
      const studentGroupLetter = student?.groupId?.letter || student?.groupLetter || null;
      console.log('🔍 Student group letter:', studentGroupLetter);
      
      // Если у ученика есть конфигурация с предметами, используем её
      if (config && config.subjects && config.subjects.length > 0) {
        console.log('🔍 Using existing config subjects:', config.subjects.length);
        
        // ВСЕГДА синхронизируем groupLetter с текущей группой студента
        const subjectsWithLetters = config.subjects.map((s: any) => {
          // Если у предмета была буква, обновляем её на текущую букву группы
          // Если буквы не было, оставляем undefined
          const shouldHaveLetter = s.groupLetter !== undefined;
          
          if (shouldHaveLetter && studentGroupLetter) {
            console.log(`🔄 Syncing letter for subject ${s.subjectId?.nameUzb || s.subjectId}: ${s.groupLetter} → ${studentGroupLetter}`);
            return { ...s, groupLetter: studentGroupLetter };
          } else if (!shouldHaveLetter && studentGroupLetter) {
            // Если буквы не было, но у студента есть группа с буквой, добавляем
            console.log(`➕ Adding letter ${studentGroupLetter} for subject ${s.subjectId?.nameUzb || s.subjectId}`);
            return { ...s, groupLetter: studentGroupLetter };
          }
          
          return s;
        });
        
        setSubjects(subjectsWithLetters);
      } else {
        // Если конфигурации нет, создаём из предметов направления
        console.log('🔍 Creating default subjects from direction');
        const defaultSubjects = directionSubjects.map(subjectId => {
          const subject = allSubjects.find(s => s._id === subjectId);
          if (!subject) {
            console.warn('Subject not found:', subjectId);
            return null;
          }
          const maxQuestions = getMaxQuestionsForSubject(subjectId);
          return {
            subjectId: subject,
            questionCount: maxQuestions > 0 ? Math.min(10, maxQuestions) : 0,
            groupLetter: studentGroupLetter || undefined, // Подставляем букву группы
            isAdditional: false
          };
        }).filter(Boolean); // Убираем null значения
        
        console.log('🔍 Default subjects created:', defaultSubjects.length);
        setSubjects(defaultSubjects);
      }
      
      const defaultPointsConfig = config?.pointsConfig && config.pointsConfig.length > 0
        ? config.pointsConfig
        : [{ from: 1, to: 90, points: 3.1 }];
      setPointsConfig(defaultPointsConfig);
      
      setLoading(false);
    }
  }, [config, isOpen, directionSubjects, allSubjects, student]);

  const loadAllSubjects = async () => {
    try {
      const { data } = await api.get('/subjects');
      setAllSubjects(data);
    } catch (error) {
      console.error('Error loading subjects:', error);
    }
  };

  const loadDirectionSubjects = async () => {
    try {
      console.log('🔍 Loading direction subjects for student:', student._id);
      console.log('🔍 Student data from props:', student);
      
      // Используем данные студента из пропсов
      if (student.directionId) {
        const directionId = typeof student.directionId === 'string' 
          ? student.directionId 
          : student.directionId._id;
          
        console.log('🔍 Loading directions to find:', directionId);
        
        // Загружаем все направления
        const { data: allDirections } = await api.get('/directions');
        console.log('🔍 All directions:', allDirections.length);
        
        // Находим нужное направление
        const direction = allDirections.find((d: any) => d._id === directionId);
        
        if (!direction) {
          console.warn('🔍 Direction not found:', directionId);
          throw new Error('Direction not found');
        }
        
        console.log('🔍 Direction data:', direction);
        
        // Собираем все предметы направления
        const subjectIds: string[] = [];
        
        if (direction.subjects) {
          console.log('🔍 Direction.subjects length:', direction.subjects.length);
          
          direction.subjects.forEach((subjectChoice: any, index: number) => {
            console.log(`🔍 Subject choice ${index + 1}:`, {
              type: subjectChoice.type,
              subjectIds: subjectChoice.subjectIds,
              subjectIdsLength: subjectChoice.subjectIds?.length
            });
            
            if (subjectChoice.type === 'single') {
              // Один обязательный предмет
              subjectChoice.subjectIds.forEach((id: any) => {
                console.log('🔍 Processing subject ID:', id, 'Type:', typeof id);
                const subjectId = typeof id === 'string' ? id : id._id;
                console.log('🔍 Extracted subject ID:', subjectId);
                if (!subjectIds.includes(subjectId)) {
                  subjectIds.push(subjectId);
                  console.log('✅ Added subject ID:', subjectId);
                }
              });
            } else if (subjectChoice.type === 'choice') {
              // Предметы на выбор - берем выбранные студентом
              if (student.subjectIds) {
                subjectChoice.subjectIds.forEach((id: any) => {
                  const subjectId = typeof id === 'string' ? id : id._id;
                  const studentSubjectIds = student.subjectIds.map((sid: any) => 
                    typeof sid === 'string' ? sid : sid._id
                  );
                  if (studentSubjectIds.includes(subjectId) && !subjectIds.includes(subjectId)) {
                    subjectIds.push(subjectId);
                  }
                });
              }
            }
          });
        } else {
          console.warn('⚠️ Direction has no subjects array!');
        }
        
        console.log('🔍 Direction subject IDs:', subjectIds);
        
        // Добавляем обязательные предметы
        const { data: mandatorySubjects } = await api.get('/subjects', {
          params: { isMandatory: true }
        });
        
        console.log('🔍 Mandatory subjects:', mandatorySubjects.length);
        
        mandatorySubjects.forEach((s: any) => {
          if (!subjectIds.includes(s._id)) {
            subjectIds.push(s._id);
          }
        });
        
        console.log('🔍 Total subject IDs (with mandatory):', subjectIds.length);
        setDirectionSubjects(subjectIds);
      } else {
        console.warn('🔍 Student has no direction');
        // Если нет направления, загружаем только обязательные предметы
        const { data: mandatorySubjects } = await api.get('/subjects', {
          params: { isMandatory: true }
        });
        const subjectIds = mandatorySubjects.map((s: any) => s._id);
        console.log('🔍 Using only mandatory subjects:', subjectIds.length);
        setDirectionSubjects(subjectIds);
      }
    } catch (error) {
      console.error('Error loading direction subjects:', error);
      // В случае ошибки загружаем хотя бы обязательные предметы
      try {
        const { data: mandatorySubjects } = await api.get('/subjects', {
          params: { isMandatory: true }
        });
        const subjectIds = mandatorySubjects.map((s: any) => s._id);
        console.log('🔍 Fallback: using only mandatory subjects:', subjectIds.length);
        setDirectionSubjects(subjectIds);
      } catch (fallbackError) {
        console.error('Error loading mandatory subjects:', fallbackError);
      }
    }
  };

  const loadAvailableLetters = async () => {
    try {
      if (!blockTest?.classNumber) {
        console.log('🔍 No classNumber in blockTest');
        return;
      }
      
      const { data } = await api.get(`/groups/letters/${blockTest.classNumber}`);
      console.log('🔍 Available letters:', data);
      setAvailableLetters(data);
    } catch (error) {
      console.error('Error loading available letters:', error);
    }
  };

  const getMaxQuestionsForSubject = (subjectId: string): number => {
    if (!blockTest?.subjectTests) return 0;
    const subjectTest = blockTest.subjectTests.find(
      (st: any) => (st.subjectId?._id || st.subjectId) === subjectId
    );
    return subjectTest?.questions?.length || 0;
  };

  const handleQuestionCountChange = (index: number, value: string) => {
    const count = parseInt(value) || 0;
    const newSubjects = [...subjects];
    newSubjects[index].questionCount = count;
    setSubjects(newSubjects);
  };

  const handleGroupLetterChange = (index: number, letter: string) => {
    const newSubjects = [...subjects];
    newSubjects[index].groupLetter = letter === '' ? undefined : letter;
    setSubjects(newSubjects);
  };

  const handleAddSubject = () => {
    const existingIds = subjects.map(s => s.subjectId?._id || s.subjectId);
    const availableSubjects = allSubjects.filter(
      s => !existingIds.includes(s._id)
    );

    if (availableSubjects.length > 0) {
      const firstAvailable = availableSubjects[0];
      const maxForSubject = getMaxQuestionsForSubject(firstAvailable._id);
      const defaultCount = maxForSubject > 0 ? Math.min(10, maxForSubject) : 0;
      
      // Получаем букву группы студента для новых предметов
      const studentGroupLetter = student?.groupId?.letter || student?.groupLetter || undefined;
      
      setSubjects([
        ...subjects,
        {
          subjectId: firstAvailable,
          questionCount: defaultCount,
          groupLetter: studentGroupLetter,
          isAdditional: true
        }
      ]);
    } else {
      alert('Barcha fanlar qo\'shilgan');
    }
  };

  const handleRemoveSubject = (index: number) => {
    const subject = subjects[index];
    const subjectId = subject.subjectId?._id || subject.subjectId;
    
    // Проверяем, является ли предмет предметом направления
    if (directionSubjects.includes(subjectId)) {
      if (!confirm('Bu fan yo\'nalish fani. Rostdan ham o\'chirmoqchimisiz?')) {
        return;
      }
    }
    
    const newSubjects = subjects.filter((_, i) => i !== index);
    setSubjects(newSubjects);
  };

  const handleSubjectChange = (index: number, subjectId: string) => {
    const newSubjects = [...subjects];
    const subject = allSubjects.find(s => s._id === subjectId);
    const maxQuestions = getMaxQuestionsForSubject(subjectId);
    
    // Сохраняем текущую букву группы при смене предмета
    const currentGroupLetter = newSubjects[index].groupLetter;
    
    newSubjects[index].subjectId = subject;
    newSubjects[index].questionCount = maxQuestions > 0 ? Math.min(10, maxQuestions) : 0;
    newSubjects[index].groupLetter = currentGroupLetter;
    setSubjects(newSubjects);
  };

  const handleAddPointsRange = () => {
    if (pointsConfig.length === 0) {
      setPointsConfig([{ from: 1, to: 90, points: 3.1 }]);
      return;
    }
    
    const lastRange = pointsConfig[pointsConfig.length - 1];
    const rangeSize = lastRange.to - lastRange.from + 1;
    const halfPoint = lastRange.from + Math.floor(rangeSize / 2);
    
    if (rangeSize < 2) {
      alert('Oxirgi diapazon juda kichik, bo\'lib bo\'lmaydi');
      return;
    }
    
    const updatedConfig = [...pointsConfig];
    updatedConfig[updatedConfig.length - 1] = {
      ...lastRange,
      to: halfPoint
    };
    
    const newRange = {
      from: halfPoint + 1,
      to: lastRange.to,
      points: 3.1
    };
    
    updatedConfig.push(newRange);
    setPointsConfig(updatedConfig);
  };

  const handleRemovePointsRange = (index: number) => {
    const newConfig = pointsConfig.filter((_, i) => i !== index);
    setPointsConfig(newConfig);
  };

  const handlePointsRangeChange = (index: number, field: string, value: any) => {
    const newConfig = [...pointsConfig];
    
    if (value === '' || value === null || value === undefined) {
      newConfig[index][field] = '';
      setPointsConfig(newConfig);
      return;
    }
    
    const numValue = field === 'points' ? parseFloat(value) : parseInt(value);
    
    if (!isNaN(numValue)) {
      newConfig[index][field] = numValue;
      setPointsConfig(newConfig);
    }
  };

  const handlePointsRangeBlur = (index: number, field: string) => {
    const newConfig = [...pointsConfig];
    const currentValue = newConfig[index][field];
    
    if (currentValue === '' || currentValue === null || currentValue === undefined) {
      if (field === 'from') {
        newConfig[index][field] = index === 0 ? 1 : (pointsConfig[index - 1]?.to || 0) + 1;
      } else if (field === 'to') {
        newConfig[index][field] = 90;
      } else if (field === 'points') {
        newConfig[index][field] = 3.1;
      }
      setPointsConfig(newConfig);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Фильтруем предметы с количеством вопросов > 0
      const validSubjects = subjects.filter(s => s.questionCount > 0);
      
      if (validSubjects.length === 0) {
        alert('Kamida bitta fan tanlang');
        return;
      }

      // Пересчитываем общее количество вопросов
      const totalQuestions = validSubjects.reduce((sum, s) => sum + s.questionCount, 0);

      const payload = {
        totalQuestions,
        subjects: validSubjects.map(s => ({
          subjectId: s.subjectId?._id || s.subjectId,
          questionCount: s.questionCount,
          groupLetter: s.groupLetter || undefined,
          isAdditional: s.isAdditional || false
        })),
        pointsConfig: pointsConfig.sort((a, b) => a.from - b.from)
      };

      await api.put(`/student-test-configs/${student._id}`, payload);
      onSave();
      onClose();
    } catch (error: any) {
      console.error('Error saving config:', error);
      alert('Sozlamalarni saqlashda xatolik');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Bu o\'quvchi uchun sozlamalarni tiklashni xohlaysizmi?\n\nBu amal:\n• Barcha fanlarni o\'chiradi\n• Blok test fanlariga qaytaradi\n• Default savollar soniga qaytaradi')) {
      return;
    }

    try {
      setSaving(true);
      
      // Удаляем старую конфигурацию
      await api.post(`/student-test-configs/reset/${student._id}`);
      
      // Создаем новую на основе блок-теста
      if (blockTest && blockTest._id) {
        await api.post(`/student-test-configs/create-for-block-test/${student._id}/${blockTest._id}`);
      }
      
      // Вызываем onSave для обновления списка и закрываем модал
      onSave();
      onClose();
    } catch (error: any) {
      console.error('Error resetting config:', error);
      alert('Sozlamalarni tiklashda xatolik: ' + (error.response?.data?.message || error.message));
    } finally {
      setSaving(false);
    }
  };

  const currentTotal = subjects.reduce((sum, s) => sum + (s.questionCount || 0), 0);

  return (
    <Dialog open={isOpen} onClose={onClose} className="max-w-4xl">
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
            <span className="ml-3 text-gray-600">Yuklanmoqda...</span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {student?.fullName}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {student?.directionId?.nameUzb || 'Yo\'nalish ko\'rsatilmagan'}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  ⓘ Har bir fan uchun guruh harfini tanlang (umumiy yoki A/B/C/D)
                </p>
              </div>
            </div>

          <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Fanlar
              </label>
              <p className="text-xs text-gray-500 mt-1">
                Yo'nalish fanlari va qo'shimcha fanlar
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddSubject}
              disabled={subjects.length >= allSubjects.length}
            >
              <Plus className="w-4 h-4 mr-1" />
              Fan qo'shish
            </Button>
          </div>

          {/* Заголовки колонок */}
          <div className="flex items-center gap-3 px-4 pb-2 text-xs font-medium text-gray-600">
            <div className="flex-1">Fan nomi</div>
            <div className="w-32 text-center">Savollar</div>
            <div className="w-32 text-center">Guruh</div>
            <div className="w-10"></div>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">{subjects.map((subject, index) => {
              const subjectId = subject.subjectId?._id || subject.subjectId;
              const subjectName = subject.subjectId?.nameUzb || 'Fan';
              const isAdditional = subject.isAdditional;
              const isDirectionSubject = directionSubjects.includes(subjectId);
              
              // Проверяем, является ли предмет обязательным
              const subjectInfo = allSubjects.find(s => s._id === subjectId);
              const isMandatory = subjectInfo?.isMandatory || false;

              const realMaxQuestions = getMaxQuestionsForSubject(subjectId);
              const hasQuestions = realMaxQuestions > 0;
              const maxQuestions = hasQuestions ? realMaxQuestions : 0;
              
              const questionOptions = hasQuestions 
                ? Array.from({ length: maxQuestions }, (_, i) => i + 1)
                : [];

              const existingIds = subjects
                .map((s, i) => i !== index ? (s.subjectId?._id || s.subjectId) : null)
                .filter(Boolean);
              const availableForSelect = allSubjects.filter(
                s => !existingIds.includes(s._id) || s._id === subjectId
              );

              return (
                <div
                  key={index}
                  className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    {isAdditional ? (
                      <Select
                        value={subjectId}
                        onChange={(e) => handleSubjectChange(index, e.target.value)}
                        className="w-full"
                      >
                        {availableForSelect.map(s => (
                          <option key={s._id} value={s._id}>
                            {s.nameUzb}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {subjectName}
                        </span>
                        {isMandatory && (
                          <Badge variant="warning" size="sm">
                            Majburiy
                          </Badge>
                        )}
                        {isDirectionSubject && !isMandatory && (
                          <Badge variant="info" size="sm">
                            Yo'nalish
                          </Badge>
                        )}
                        {hasQuestions ? (
                          <span className="text-xs text-gray-500">
                            (max: {realMaxQuestions})
                          </span>
                        ) : (
                          <span className="text-xs text-red-500">
                            (test yo'q)
                          </span>
                        )}
                      </div>
                    )}
                    {isAdditional && (
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="purple" size="sm">
                          Qo'shimcha
                        </Badge>
                        {hasQuestions ? (
                          <span className="text-xs text-gray-500">
                            (max: {realMaxQuestions})
                          </span>
                        ) : (
                          <span className="text-xs text-red-500">
                            (test yo'q)
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="w-32">
                    {hasQuestions ? (
                      <Select
                        value={subject.questionCount}
                        onChange={(e) => handleQuestionCountChange(index, e.target.value)}
                        className="w-full"
                      >
                        {questionOptions.map(num => (
                          <option key={num} value={num}>
                            {num} ta
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <div className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded text-center text-gray-500">
                        0 ta
                      </div>
                    )}
                  </div>

                  <div className="w-32">
                    <Select
                      value={subject.groupLetter || ''}
                      onChange={(e) => handleGroupLetterChange(index, e.target.value)}
                      className="w-full text-sm"
                    >
                      <option value="">Umumiy</option>
                      {availableLetters.map(letter => (
                        <option key={letter} value={letter}>
                          {letter} guruh
                        </option>
                      ))}
                    </Select>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveSubject(index)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              Jami savollar:
            </span>
            <span className="text-lg font-bold text-green-600">
              {currentTotal} ta
            </span>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">
              Ballar sozlamasi
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddPointsRange}
            >
              <Plus className="w-4 h-4 mr-1" />
              Diapazon qo'shish
            </Button>
          </div>

          <div className="space-y-3">
            {pointsConfig.map((range, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    type="number"
                    value={range.from}
                    onChange={(e) => handlePointsRangeChange(index, 'from', e.target.value)}
                    onBlur={() => handlePointsRangeBlur(index, 'from')}
                    min={1}
                    className="w-20"
                    placeholder="Dan"
                  />
                  <span className="text-gray-500">-</span>
                  <Input
                    type="number"
                    value={range.to}
                    onChange={(e) => handlePointsRangeChange(index, 'to', e.target.value)}
                    onBlur={() => handlePointsRangeBlur(index, 'to')}
                    min={range.from}
                    className="w-20"
                    placeholder="Gacha"
                  />
                  <span className="text-gray-500 mx-2">=</span>
                  <Input
                    type="number"
                    step="0.1"
                    value={range.points}
                    onChange={(e) => handlePointsRangeChange(index, 'points', e.target.value)}
                    onBlur={() => handlePointsRangeBlur(index, 'points')}
                    min={0}
                    className="w-24"
                    placeholder="Ball"
                  />
                  <span className="text-sm text-gray-600">ball</span>
                </div>

                {pointsConfig.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemovePointsRange(index)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-500 mt-2">
            Ballar sozlamasi jami savollar soniga moslashtiriladi
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={saving}
            className="text-orange-600 hover:text-orange-700 hover:border-orange-300"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Tiklash
          </Button>
          <Button
            onClick={async () => {
              await handleSave();
            }}
            className="flex-1"
            disabled={saving}
            loading={saving}
          >
            Yopish
          </Button>
        </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
