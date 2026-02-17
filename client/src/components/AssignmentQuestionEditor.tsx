import { useState } from 'react';
import { Button } from './ui/Button';
import { Textarea } from './ui/Textarea';
import { Plus, Trash2 } from 'lucide-react';
import RichTextEditor from './editor/RichTextEditor';
import MathText from './MathText';

interface Question {
  text: string;
  order: number;
  hasVariants?: boolean;
  variants?: {
    letter: string;
    text: string;
  }[];
  correctAnswer?: string;
}

interface AssignmentQuestionEditorProps {
  type: string;
  questions: Question[];
  onChange: (questions: Question[]) => void;
}

const getVariantLetter = (index: number): string => {
  return String.fromCharCode(65 + index);
};

export default function AssignmentQuestionEditor({ type, questions, onChange }: AssignmentQuestionEditorProps) {
  const [expandedQuestion, setExpandedQuestion] = useState<number | null>(null);

  // Определяем нужны ли варианты ответов для данного типа
  const needsVariants = false; // Убираем варианты для всех типов
  const isOpenQuestion = type === 'yozma_ish' || type === 'savol_javob' || type === 'yopiq_test';
  const isDictation = type === 'diktant';
  const isOral = type === 'ogzaki';

  const addQuestion = () => {
    const newQuestion: Question = {
      text: '',
      order: questions.length + 1,
      hasVariants: needsVariants,
      variants: needsVariants ? [
        { letter: 'A', text: '' },
        { letter: 'B', text: '' },
        { letter: 'C', text: '' },
        { letter: 'D', text: '' }
      ] : [],
      correctAnswer: needsVariants ? '' : undefined // Bo'sh qoldirish
    };
    onChange([...questions, newQuestion]);
    setExpandedQuestion(questions.length);
  };

  const removeQuestion = (index: number) => {
    const updated = questions.filter((_, i) => i !== index);
    // Reorder
    const reordered = updated.map((q, i) => ({ ...q, order: i + 1 }));
    onChange(reordered);
    if (expandedQuestion === index) setExpandedQuestion(null);
  };

  const updateQuestion = (index: number, field: keyof Question, value: any) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const addVariant = (qIndex: number) => {
    const updated = [...questions];
    const currentVariants = updated[qIndex].variants || [];
    const newLetter = getVariantLetter(currentVariants.length);
    
    updated[qIndex].variants = [
      ...currentVariants,
      { letter: newLetter, text: '' }
    ];
    onChange(updated);
  };

  const removeVariant = (qIndex: number, vIndex: number) => {
    const updated = [...questions];
    const variants = (updated[qIndex].variants || []).filter((_, i) => i !== vIndex);
    
    // Re-assign letters
    updated[qIndex].variants = variants.map((v, i) => ({
      ...v,
      letter: getVariantLetter(i)
    }));
    
    // Update correct answer if needed
    if (updated[qIndex].correctAnswer === updated[qIndex].variants?.[vIndex]?.letter) {
      updated[qIndex].correctAnswer = ''; // Bo'sh qoldirish
    }
    
    onChange(updated);
  };

  const updateVariant = (qIndex: number, vIndex: number, field: string, value: any) => {
    const updated = [...questions];
    if (!updated[qIndex].variants) updated[qIndex].variants = [];
    updated[qIndex].variants![vIndex] = { ...updated[qIndex].variants![vIndex], [field]: value };
    onChange(updated);
  };

  const getPlaceholder = () => {
    if (isDictation) return 'Diktant matnini kiriting...';
    if (isOral) return 'Og\'zaki topshiriq matnini kiriting...';
    if (isOpenQuestion) return 'Savolni kiriting...';
    return 'Savol matnini kiriting...';
  };

  const getLabel = () => {
    if (isDictation) return 'Diktant matni';
    if (isOral) return 'Og\'zaki topshiriq';
    return 'Savol matni';
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-0">
        <h3 className="text-sm font-medium text-gray-900">
          {isDictation ? 'Diktant' : isOral ? 'Og\'zaki topshiriqlar' : 'Savollar'} ({questions.length})
        </h3>
        <Button type="button" size="sm" onClick={addQuestion} className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-1" />
          {isDictation ? 'Diktant qo\'shish' : isOral ? 'Topshiriq qo\'shish' : 'Savol qo\'shish'}
        </Button>
      </div>

      {questions.length === 0 ? (
        <div className="text-center py-6 sm:py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-xs sm:text-sm text-gray-600 mb-2">
            {isDictation ? 'Hali diktant yo\'q' : isOral ? 'Hali topshiriqlar yo\'q' : 'Hali savollar yo\'q'}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={addQuestion} className="w-full sm:w-auto">
            {isDictation ? 'Diktant qo\'shish' : isOral ? 'Topshiriq qo\'shish' : 'Birinchi savolni qo\'shing'}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {questions.map((question, qIndex) => (
            <div key={qIndex} className="border border-gray-200 rounded-lg overflow-hidden">
              {/* Header */}
              <div 
                className="bg-gray-50 p-2 sm:p-2.5 flex items-center justify-between cursor-pointer hover:bg-gray-100 active:bg-gray-200 transition-colors"
                onClick={() => setExpandedQuestion(expandedQuestion === qIndex ? null : qIndex)}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-sm sm:text-base font-bold text-purple-600">{qIndex + 1}</span>
                  </div>
                  {question.text && (
                    <span className="text-xs sm:text-sm text-gray-700 truncate">
                      <MathText text={question.text.substring(0, 60) + (question.text.length > 60 ? '...' : '')} />
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeQuestion(qIndex);
                  }}
                  className="p-1.5 hover:bg-red-50 rounded text-red-500 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Content */}
              {expandedQuestion === qIndex && (
                <div className="p-3 sm:p-4 space-y-3 sm:space-y-4 bg-white">
                  {/* Question Text */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {getLabel()}
                    </label>
                    {isDictation ? (
                      <Textarea
                        value={question.text}
                        onChange={(e) => updateQuestion(qIndex, 'text', e.target.value)}
                        placeholder={getPlaceholder()}
                        rows={6}
                        required
                      />
                    ) : (
                      <RichTextEditor
                        value={question.text}
                        onChange={(value) => updateQuestion(qIndex, 'text', value)}
                        placeholder={getPlaceholder() + ' (Formula qo\'shish uchun Alt+= bosing)'}
                      />
                    )}
                  </div>

                  {/* Variants for closed tests */}
                  {needsVariants && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-700">
                          Javob variantlari (to'g'risini tanlang):
                        </label>
                        <button
                          type="button"
                          onClick={() => addVariant(qIndex)}
                          className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700"
                        >
                          <Plus className="w-4 h-4" />
                          Variant
                        </button>
                      </div>
                      
                      <div className="space-y-2">
                        {(question.variants || []).map((variant, vIndex) => (
                          <div key={vIndex} className="space-y-2 border border-gray-200 rounded-lg p-2 sm:p-3 bg-gray-50">
                            {/* Variant Header - Letter and Delete Button */}
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => updateQuestion(qIndex, 'correctAnswer', variant.letter)}
                                className={`
                                  w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-base sm:text-lg text-white flex-shrink-0 transition-all
                                  ${question.correctAnswer === variant.letter 
                                    ? 'bg-green-500 shadow-md ring-2 ring-green-300' 
                                    : 'bg-gray-400 hover:bg-gray-500 active:bg-gray-600'
                                  }
                                `}
                                title={question.correctAnswer === variant.letter ? "To'g'ri javob" : "To'g'ri javob sifatida belgilash"}
                              >
                                {variant.letter}
                              </button>

                              {/* Delete Variant Button */}
                              {(question.variants?.length || 0) > 2 && (
                                <button
                                  type="button"
                                  onClick={() => removeVariant(qIndex, vIndex)}
                                  className="p-2 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors flex-shrink-0 border border-gray-200 hover:border-red-400"
                                  title="Variantni o'chirish"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>

                            {/* Variant Input with Rich Text Editor - Full Width */}
                            <div className="w-full">
                              <RichTextEditor
                                value={variant.text}
                                onChange={(value) => updateVariant(qIndex, vIndex, 'text', value)}
                                placeholder={`Variant ${variant.letter} matnini kiriting... (Formula qo'shish uchun Alt+= bosing)`}
                                className="text-sm"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
