import { useState } from 'react';
import { Button } from './ui/Button';
import { Plus, Trash2, Image as ImageIcon, X, FileText } from 'lucide-react';
import 'katex/dist/katex.min.css';
import RichTextEditor from './editor/RichTextEditor';
import MathText from './MathText';
import api from '../lib/api';

// Helper function to get variant letter (A, B, C, D, E, F, ...)
const getVariantLetter = (index: number): string => {
  return String.fromCharCode(65 + index); // 65 is 'A' in ASCII
};

interface Question {
  text: string;
  contextText?: string;
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
      correctAnswer: '', // Bo'sh qoldirish - foydalanuvchi o'zi tanlaydi
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
    if (updated[qIndex].correctAnswer === removedLetter) {
      updated[qIndex].correctAnswer = ''; // Bo'sh qoldirish
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
      console.log('🔄 Uploading image to server...', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
      });
      
      const { data } = await api.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      console.log('✅ Image uploaded, full server response:', JSON.stringify(data, null, 2));
      console.log('📁 Image path from server:', data.path);
      console.log('🌐 Full URL from server:', data.url);
      
      // Используем путь с сервера (относительный путь, proxy перенаправит на бэкенд)
      const imageUrl = data.path;
      
      console.log('🖼️ Setting image URL in state:', imageUrl);
      console.log('📍 Question index:', qIndex, 'Variant index:', vIndex);
      
      if (vIndex === null) {
        updateQuestion(qIndex, 'imageUrl', imageUrl);
        console.log('✅ Image URL set for question', qIndex);
      } else {
        updateVariant(qIndex, vIndex, 'imageUrl', imageUrl);
        console.log('✅ Image URL set for variant', vIndex, 'of question', qIndex);
      }
      
      // Проверяем что URL действительно сохранился
      setTimeout(() => {
        console.log('🔍 Verifying image URL after state update...');
        if (vIndex === null) {
          console.log('Question imageUrl:', questions[qIndex]?.imageUrl);
        } else {
          console.log('Variant imageUrl:', questions[qIndex]?.variants[vIndex]?.imageUrl);
        }
      }, 100);
      
    } catch (err) {
      console.error('❌ Error uploading image:', err);
      alert('Rasmni yuklashda xatolik');
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
                  {/* Context Text (reading passage) */}
                  {(question.contextText || question.contextImage) ? (
                    <div className="relative bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-amber-700">Matn (passage)</label>
                        <button
                          type="button"
                          onClick={() => { updateQuestion(qIndex, 'contextText', undefined); updateQuestion(qIndex, 'contextImage', undefined); }}
                          className="p-1 hover:bg-amber-100 rounded text-amber-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {question.contextImage && (
                        <img src={question.contextImage} alt="Context" className="rounded mb-2" style={{ float: 'right', maxWidth: '40%', maxHeight: 250, margin: '0 0 4px 8px' }} />
                      )}
                      {question.contextText && (
                        <>
                          <textarea
                            value={question.contextText}
                            onChange={(e) => updateQuestion(qIndex, 'contextText', e.target.value)}
                            className="w-full min-h-[80px] text-sm bg-white border border-amber-200 rounded p-2 resize-y"
                            placeholder="Matn kiritng..."
                          />
                          <div className="mt-2 text-xs text-amber-600">
                            <MathText text={question.contextText} />
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}

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

                  {/* Question Image + Context Text buttons */}
                  <div className="flex flex-wrap gap-2">
                    {question.imageUrl ? (
                      <div className="relative inline-block">
                        <img
                          src={question.imageUrl}
                          alt="Question"
                          className="max-w-full sm:max-w-xs rounded-lg border border-gray-300 shadow-sm"
                        />
                        <button
                          type="button"
                          onClick={() => updateQuestion(qIndex, 'imageUrl', undefined)}
                          className="absolute top-1 right-1 p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 shadow-md"
                        >
                          <X className="w-3 h-3 sm:w-4 sm:h-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="inline-flex items-center gap-2 text-sm text-blue-600 cursor-pointer hover:text-blue-700 p-2 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
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
                    {!question.contextText && (
                      <button
                        type="button"
                        onClick={() => updateQuestion(qIndex, 'contextText', '')}
                        className="inline-flex items-center gap-2 text-sm text-amber-600 p-2 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors"
                      >
                        <FileText className="w-4 h-4" />
                        <span>Matn qo'shish</span>
                      </button>
                    )}
                  </div>

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
                    
                    <div className="space-y-3">
                      {question.variants.map((variant, vIndex) => (
                        <div key={vIndex} className="space-y-2 border border-gray-200 rounded-lg p-2 sm:p-3 bg-gray-50">
                          {/* Variant Header - Letter and Actions */}
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

                            <div className="flex items-center gap-1 sm:gap-2">
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
                          </div>

                          {/* Variant Input - Full Width */}
                          <div className="w-full">
                            <RichTextEditor
                              value={variant.text}
                              onChange={(value) => updateVariant(qIndex, vIndex, 'text', value)}
                              placeholder={`Variant ${variant.letter} matnini kiriting...`}
                              className="text-sm"
                            />
                          </div>
                          
                          {/* Variant Image */}
                          {variant.imageUrl && (
                            <div className="relative inline-block">
                              <img 
                                src={variant.imageUrl} 
                                alt={`Variant ${variant.letter}`} 
                                className="max-w-full sm:max-w-xs rounded border border-gray-300 shadow-sm" 
                              />
                              <button
                                type="button"
                                onClick={() => updateVariant(qIndex, vIndex, 'imageUrl', undefined)}
                                className="absolute top-1 right-1 p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 shadow-md"
                              >
                                <X className="w-3 h-3 sm:w-4 sm:h-4" />
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
