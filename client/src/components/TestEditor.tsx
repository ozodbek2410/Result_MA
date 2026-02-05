import { useState } from 'react';
import { Button } from './ui/Button';
import { Plus, Trash2, Image as ImageIcon, X } from 'lucide-react';
import 'katex/dist/katex.min.css';
import RichTextEditor from './editor/RichTextEditor';
import MathText from './MathText';

// Helper function to get variant letter (A, B, C, D, E, F, ...)
const getVariantLetter = (index: number): string => {
  return String.fromCharCode(65 + index); // 65 is 'A' in ASCII
};

interface Question {
  text: string;
  formula?: string;
  imageUrl?: string;
  variants: {
    letter: string;
    text: string;
    formula?: string;
    imageUrl?: string;
  }[];
  correctAnswer: string;
  points: number;
}

interface TestEditorProps {
  questions: Question[];
  onChange: (questions: Question[]) => void;
}

export default function TestEditor({ questions, onChange }: TestEditorProps) {
  const [expandedQuestion, setExpandedQuestion] = useState<number | null>(null);

  const addQuestion = () => {
    const newQuestion: Question = {
      text: '',
      variants: [
        { letter: 'A', text: '' },
        { letter: 'B', text: '' },
        { letter: 'C', text: '' },
        { letter: 'D', text: '' }
      ],
      correctAnswer: 'A',
      points: 1
    };
    onChange([...questions, newQuestion]);
    setExpandedQuestion(questions.length);
  };

  const removeQuestion = (index: number) => {
    onChange(questions.filter((_, i) => i !== index));
    if (expandedQuestion === index) setExpandedQuestion(null);
  };

  const addVariant = (qIndex: number) => {
    const updated = [...questions];
    const currentVariants = updated[qIndex].variants;
    const newLetter = getVariantLetter(currentVariants.length);
    
    updated[qIndex].variants = [
      ...currentVariants,
      { letter: newLetter, text: '' }
    ];
    onChange(updated);
  };

  const removeVariant = (qIndex: number, vIndex: number) => {
    const updated = [...questions];
    const variants = updated[qIndex].variants.filter((_, i) => i !== vIndex);
    
    // Re-assign letters after removal
    updated[qIndex].variants = variants.map((v, i) => ({
      ...v,
      letter: getVariantLetter(i)
    }));
    
    // Update correct answer if it was the removed variant
    const removedLetter = updated[qIndex].variants[vIndex]?.letter;
    if (updated[qIndex].correctAnswer === removedLetter && variants.length > 0) {
      updated[qIndex].correctAnswer = variants[0].letter;
    }
    
    onChange(updated);
  };

  const updateQuestion = (index: number, field: keyof Question, value: any) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const updateVariant = (qIndex: number, vIndex: number, field: string, value: any) => {
    const updated = [...questions];
    updated[qIndex].variants[vIndex] = { ...updated[qIndex].variants[vIndex], [field]: value };
    onChange(updated);
  };

  const handleImageUpload = async (qIndex: number, vIndex: number | null, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      // Здесь должен быть реальный upload
      // const { data } = await api.post('/uploads', formData);
      // const imageUrl = data.url;
      
      // Временно используем локальный URL
      const imageUrl = URL.createObjectURL(file);
      
      if (vIndex === null) {
        updateQuestion(qIndex, 'imageUrl', imageUrl);
      } else {
        updateVariant(qIndex, vIndex, 'imageUrl', imageUrl);
      }
    } catch (err) {
      console.error('Error uploading image:', err);
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-0">
        <h3 className="text-sm font-medium text-gray-900">
          Savollar ({questions.length})
        </h3>
        <Button type="button" size="sm" onClick={addQuestion} className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-1" />
          Savol qo'shish
        </Button>
      </div>

      {questions.length === 0 ? (
        <div className="text-center py-6 sm:py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-xs sm:text-sm text-gray-600 mb-2">Hali savollar yo'q</p>
          <Button type="button" variant="outline" size="sm" onClick={addQuestion} className="w-full sm:w-auto">
            Birinchi savolni qo'shing
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
                  <div className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-sm sm:text-base font-bold text-blue-600">{qIndex + 1}</span>
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
                  {/* Question Text with Rich Text Editor */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Savol matni
                    </label>
                    
                    <RichTextEditor
                      value={question.text}
                      onChange={(value) => updateQuestion(qIndex, 'text', value)}
                      placeholder="Savolni kiriting... (Formula qo'shish uchun Alt+= bosing)"
                      className="mb-2"
                    />
                  </div>

                  {/* Question Image */}
                  {question.imageUrl ? (
                    <div className="relative inline-block">
                      <img src={question.imageUrl} alt="Question" className="max-w-xs rounded-lg border border-gray-200" />
                      <button
                        type="button"
                        onClick={() => updateQuestion(qIndex, 'imageUrl', undefined)}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-lg hover:bg-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="inline-flex items-center gap-2 text-sm text-blue-600 cursor-pointer hover:text-blue-700">
                      <ImageIcon className="w-4 h-4" />
                      <span>Rasm qo'shish</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(qIndex, null, file);
                        }}
                      />
                    </label>
                  )}

                  {/* Variants */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">
                        Javob variantlari (to'g'risini tanlang):
                      </label>
                      <button
                        type="button"
                        onClick={() => addVariant(qIndex)}
                        className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                      >
                        <Plus className="w-4 h-4" />
                        Variant
                      </button>
                    </div>
                    
                    <div className="space-y-2">
                      {question.variants.map((variant, vIndex) => (
                        <div key={vIndex} className="space-y-1">
                          <div className="flex items-center gap-2">
                            {/* Variant Letter Circle */}
                            <button
                              type="button"
                              onClick={() => updateQuestion(qIndex, 'correctAnswer', variant.letter)}
                              className={`
                                w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0 transition-all
                                ${question.correctAnswer === variant.letter 
                                  ? 'bg-green-500 shadow-md' 
                                  : 'bg-gray-300 hover:bg-gray-400'
                                }
                              `}
                            >
                              {variant.letter}
                            </button>

                            {/* Variant Input with Rich Text */}
                            <div className="flex-1">
                              <RichTextEditor
                                value={variant.text}
                                onChange={(value) => updateVariant(qIndex, vIndex, 'text', value)}
                                placeholder={`Variant ${variant.letter}`}
                                className="text-sm"
                              />
                            </div>

                            {/* Image Upload Icon */}
                            {!variant.imageUrl && (
                              <label className="p-2 hover:bg-blue-50 rounded cursor-pointer transition-colors flex-shrink-0 border border-blue-200 hover:border-blue-400" title="Rasm qo'shish">
                                <ImageIcon className="w-4 h-4 text-blue-600" />
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleImageUpload(qIndex, vIndex, file);
                                  }}
                                />
                              </label>
                            )}

                            {/* Delete Variant Button */}
                            {question.variants.length > 2 && (
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
                          
                          {/* Variant Image */}
                          {variant.imageUrl && (
                            <div className="ml-10 relative inline-block mt-2">
                              <img src={variant.imageUrl} alt={`Variant ${variant.letter}`} className="max-w-xs rounded border border-gray-200" />
                              <button
                                type="button"
                                onClick={() => updateVariant(qIndex, vIndex, 'imageUrl', undefined)}
                                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-lg hover:bg-red-600"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
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
