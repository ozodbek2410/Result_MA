import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Printer, Download } from 'lucide-react';
import MathText from '@/components/MathText';
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, PageBreak } from 'docx';
import { saveAs } from 'file-saver';

interface StudentVariant {
  student: any;
  config: any;
  questions: any[];
}

export default function BlockTestPrintQuestionsPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const studentIds = searchParams.get('students')?.split(',') || [];
  const fontSizeParam = searchParams.get('fontSize');
  
  const [loading, setLoading] = useState(true);
  const [blockTest, setBlockTest] = useState<any>(null);
  const [studentVariants, setStudentVariants] = useState<StudentVariant[]>([]);
  
  // Print settings - get from URL or use defaults
  const [fontSize, setFontSize] = useState(fontSizeParam ? parseInt(fontSizeParam) : 12);
  const [spacing, setSpacing] = useState('normal');
  const [showSubjectLabels, setShowSubjectLabels] = useState(true);
  const [columnsCount, setColumnsCount] = useState(1);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Загружаем блок-тест
      const { data: testData } = await api.get(`/block-tests/${id}`);
      console.log('Block test data:', testData);
      
      // Загружаем все блок-тесты с таким же классом и датой
      const { data: allTests } = await api.get('/block-tests');
      const testDate = new Date(testData.date).toISOString().split('T')[0];
      
      // Фильтруем тесты по классу и дате
      const sameGroupTests = allTests.filter((t: any) => {
        const tDate = new Date(t.date).toISOString().split('T')[0];
        return t.classNumber === testData.classNumber && tDate === testDate;
      });
      
      console.log('📊 Found tests in same group:', sameGroupTests.length);
      
      // Объединяем все предметы из всех тестов
      const allSubjects: any[] = [];
      sameGroupTests.forEach((test: any) => {
        test.subjectTests?.forEach((st: any) => {
          if (st.subjectId) {
            allSubjects.push({
              ...st,
              testId: test._id // Сохраняем ID теста для каждого предмета
            });
          }
        });
      });
      
      console.log('📝 Total subjects:', allSubjects.length);
      
      // Создаем объединенный блок-тест для отображения
      const mergedBlockTest = {
        ...testData,
        subjectTests: allSubjects,
        allTestIds: sameGroupTests.map((t: any) => t._id)
      };
      
      setBlockTest(mergedBlockTest);
      
      const { data: allStudents } = await api.get('/students', {
        params: { classNumber: mergedBlockTest.classNumber }
      });
      
      const selectedStudents = allStudents.filter((s: any) => 
        studentIds.includes(s._id)
      );
      console.log('Selected students:', selectedStudents);
      
      // Загружаем конфигурации и формируем варианты
      const variants: StudentVariant[] = [];
      
      // Загружаем все варианты для этого блок-теста
      let allVariants: any[] = [];
      try {
        const { data: variantsData } = await api.get(`/student-variants/block-test/${id}`);
        allVariants = variantsData;
        console.log('📦 Loaded variants:', allVariants.length);
      } catch (err) {
        console.warn('No variants found, using original questions');
      }
      
      for (const student of selectedStudents) {
        try {
          const { data: config } = await api.get(`/student-test-configs/${student._id}`);
          console.log(`Config for ${student.fullName}:`, config);
          
          // Находим вариант для этого студента
          const studentVariant = allVariants.find((v: any) => 
            v.studentId._id === student._id || v.studentId === student._id
          );
          
          // Собираем вопросы для этого ученика
          const questions: any[] = [];
          let questionNumber = 1;
          
          for (const subjectConfig of config.subjects) {
            const subjectId = subjectConfig.subjectId._id || subjectConfig.subjectId;
            
            // Находим тест по этому предмету
            const subjectTest = mergedBlockTest.subjectTests.find(
              (st: any) => (st.subjectId._id || st.subjectId) === subjectId
            );
            
            console.log(`Subject ${subjectConfig.subjectId.nameUzb}:`, {
              subjectId,
              subjectTest,
              questionCount: subjectConfig.questionCount
            });
            
            if (subjectTest && subjectTest.questions) {
              // Берем нужное количество вопросов
              const questionsToUse = subjectTest.questions.slice(0, subjectConfig.questionCount);
              
              // Если есть перемешанный вариант, используем его
              const subjectQuestions = questionsToUse.map((q: any, idx: number) => {
                // Ищем перемешанный вопрос в shuffledQuestions
                let questionData = q;
                if (studentVariant?.shuffledQuestions) {
                  const shuffledQ = studentVariant.shuffledQuestions.find(
                    (sq: any) => sq._id === q._id || sq.text === q.text
                  );
                  if (shuffledQ) {
                    questionData = shuffledQ;
                  }
                }
                
                return {
                  number: questionNumber++,
                  subjectName: subjectConfig.subjectId.nameUzb || 'Fan',
                  question: questionData.text || questionData.question || '',
                  options: questionData.variants?.map((v: any) => v.text) || questionData.options || [],
                  correctAnswer: questionData.correctAnswer || '',
                  points: questionData.points || 1,
                  image: questionData.imageUrl || questionData.image
                };
              });
              
              console.log(`Questions for ${subjectConfig.subjectId.nameUzb}:`, subjectQuestions);
              questions.push(...subjectQuestions);
            }
          }
          
          console.log(`Total questions for ${student.fullName}:`, questions);
          
          variants.push({
            student,
            config,
            questions
          });
        } catch (err) {
          console.error(`Error loading config for student ${student._id}:`, err);
        }
      }
      
      console.log('All variants:', variants);
      setStudentVariants(variants);
      
    } catch (err: any) {
      console.error('Error loading data:', err);
      alert('Ma\'lumotlarni yuklashda xatolik');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Функция для очистки текста от HTML и LaTeX
  const cleanText = (text: string): string => {
    if (!text) return '';
    
    // Удаляем HTML теги
    let cleaned = text.replace(/<[^>]*>/g, '');
    
    // Удаляем LaTeX формулы (оставляем содержимое)
    cleaned = cleaned.replace(/\$\$([^$]+)\$\$/g, '$1');
    cleaned = cleaned.replace(/\$([^$]+)\$/g, '$1');
    
    // Декодируем HTML entities
    cleaned = cleaned.replace(/&nbsp;/g, ' ');
    cleaned = cleaned.replace(/&lt;/g, '<');
    cleaned = cleaned.replace(/&gt;/g, '>');
    cleaned = cleaned.replace(/&amp;/g, '&');
    cleaned = cleaned.replace(/&quot;/g, '"');
    
    return cleaned.trim();
  };

  const handleDownloadWord = async () => {
    try {
      const sections: any[] = [];

      for (const variant of studentVariants) {
        // Заголовок для каждого студента
        sections.push(
          new Paragraph({
            text: 'BLOK TEST - SAVOLLAR',
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: variant.student.fullName,
                bold: true,
                size: 28
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 }
          }),
          new Paragraph({
            text: `${blockTest.classNumber}-sinf | ${variant.student.directionId?.nameUzb || ''}`,
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 }
          }),
          new Paragraph({
            text: `Jami: ${variant.questions.length} ta savol`,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
          })
        );

        // Группируем вопросы по предметам
        const questionsBySubject = new Map<string, any[]>();
        variant.questions.forEach((q: any) => {
          if (!questionsBySubject.has(q.subjectName)) {
            questionsBySubject.set(q.subjectName, []);
          }
          questionsBySubject.get(q.subjectName)!.push(q);
        });

        // Добавляем вопросы по предметам
        for (const [subjectName, questions] of questionsBySubject) {
          // Заголовок предмета
          sections.push(
            new Paragraph({
              text: subjectName,
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 300, after: 200 }
            })
          );

          // Вопросы предмета
          for (const question of questions) {
            // Очищаем текст вопроса
            const questionText = cleanText(question.question);
            sections.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${question.number}. `,
                    bold: true
                  }),
                  new TextRun({
                    text: questionText
                  })
                ],
                spacing: { before: 200, after: 100 }
              })
            );

            // Варианты ответов
            if (question.options && question.options.length > 0) {
              question.options.forEach((option: string, idx: number) => {
                const optionText = cleanText(option);
                sections.push(
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `${String.fromCharCode(65 + idx)}) `,
                        bold: true
                      }),
                      new TextRun({
                        text: optionText
                      })
                    ],
                    spacing: { after: 50 },
                    indent: { left: 400 }
                  })
                );
              });
            }
          }

          // Разделитель между предметами
          sections.push(
            new Paragraph({
              text: '─'.repeat(50),
              alignment: AlignmentType.CENTER,
              spacing: { before: 300, after: 300 }
            })
          );
        }

        // Разрыв страницы между студентами
        if (variant !== studentVariants[studentVariants.length - 1]) {
          sections.push(new Paragraph({ children: [new PageBreak()] }));
        }
      }

      const doc = new Document({
        sections: [{
          properties: {},
          children: sections
        }]
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `blok-test-savollar-${blockTest.classNumber}-sinf.docx`);
    } catch (error) {
      console.error('Error generating Word document:', error);
      alert('Word faylini yaratishda xatolik yuz berdi');
    }
  };
  
  // Get spacing classes based on setting
  const getSpacingClasses = () => {
    switch (spacing) {
      case 'compact':
        return {
          container: 'p-2',
          header: 'mb-2 pb-1',
          questions: 'space-y-1',
          question: 'pb-1',
          options: 'space-y-0 ml-2'
        };
      case 'relaxed':
        return {
          container: 'p-6',
          header: 'mb-4 pb-3',
          questions: 'space-y-4',
          question: 'pb-3',
          options: 'space-y-1.5 ml-4'
        };
      default: // normal
        return {
          container: 'p-4',
          header: 'mb-3 pb-2',
          questions: 'space-y-2',
          question: 'pb-2',
          options: 'space-y-0.5 ml-3'
        };
    }
  };
  
  const spacingClasses = getSpacingClasses();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white print-view-mode">
      {/* Settings Panel */}
      <div className="print:hidden fixed top-4 right-4 z-50 flex gap-2">
        <Button 
          onClick={() => setShowSettingsPanel(!showSettingsPanel)} 
          variant="outline"
          size="lg"
        >
          ⚙️ Sozlamalar
        </Button>
        <Button onClick={handleDownloadWord} variant="outline" size="lg">
          <Download className="w-5 h-5 mr-2" />
          Word yuklash
        </Button>
        <Button onClick={handlePrint} size="lg">
          <Printer className="w-5 h-5 mr-2" />
          Chop etish
        </Button>
      </div>

      {/* Settings Dropdown */}
      {showSettingsPanel && (
        <div className="print:hidden fixed top-20 right-4 z-50 bg-white border-2 border-gray-300 rounded-lg shadow-xl p-4 w-80">
          <h3 className="font-bold text-lg mb-4">Chop etish sozlamalari</h3>
          
          {/* Font Size */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Shrift o'lchami: {fontSize}px
            </label>
            <input
              type="range"
              min="8"
              max="18"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Kichik (8px)</span>
              <span>Katta (18px)</span>
            </div>
          </div>

          {/* Spacing */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Oraliq
            </label>
            <select
              value={spacing}
              onChange={(e) => setSpacing(e.target.value)}
              className="w-full p-2 border rounded"
            >
              <option value="compact">Zich</option>
              <option value="normal">O'rtacha</option>
              <option value="relaxed">Keng</option>
            </select>
          </div>

          {/* Columns */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Ustunlar soni
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setColumnsCount(1)}
                className={`flex-1 py-2 px-4 rounded border-2 font-medium transition-colors ${
                  columnsCount === 1
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300'
                }`}
              >
                1 ustun
              </button>
              <button
                onClick={() => setColumnsCount(2)}
                className={`flex-1 py-2 px-4 rounded border-2 font-medium transition-colors ${
                  columnsCount === 2
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300'
                }`}
              >
                2 ustun
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {columnsCount === 1 ? 'Katta shrift uchun qulay' : 'Ko\'proq savol sig\'adi'}
            </p>
          </div>

          {/* Show Subject Labels */}
          <div className="mb-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showSubjectLabels}
                onChange={(e) => setShowSubjectLabels(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">Fan nomlarini ko'rsatish</span>
            </label>
          </div>

          <button
            onClick={() => setShowSettingsPanel(false)}
            className="w-full bg-gray-200 hover:bg-gray-300 py-2 rounded font-medium"
          >
            Yopish
          </button>
        </div>
      )}

      <div className={spacingClasses.container} style={{ fontSize: `${fontSize}px` }}>
        {studentVariants.map((variant, index) => {
          // Группируем вопросы по предметам
          const questionsBySubject = new Map<string, any[]>();
          variant.questions.forEach((q: any) => {
            if (!questionsBySubject.has(q.subjectName)) {
              questionsBySubject.set(q.subjectName, []);
            }
            questionsBySubject.get(q.subjectName)!.push(q);
          });

          return (
            <div key={variant.student._id} className={`mb-4 page-break`} style={{ pageBreakAfter: 'always' }}>
              <div className={`${spacingClasses.header} border-b-2 border-gray-800 mb-4`}>
                <h1 className="font-bold text-center mb-1" style={{ fontSize: `${fontSize + 4}px` }}>
                  BLOK TEST - SAVOLLAR
                </h1>
                <div className="text-center">
                  <p className="font-semibold">{variant.student.fullName}</p>
                  <p className="text-gray-600" style={{ fontSize: `${fontSize - 2}px` }}>
                    {blockTest.classNumber}-sinf | {variant.student.directionId?.nameUzb}
                  </p>
                  <p className="text-gray-500" style={{ fontSize: `${fontSize - 2}px` }}>
                    Jami: {variant.questions.length} ta savol
                  </p>
                </div>
              </div>

              {/* Вопросы по предметам */}
              {Array.from(questionsBySubject.entries()).map(([subjectName, questions], subjectIndex) => (
                <div key={subjectName} className="mb-6">
                  {/* Заголовок предмета */}
                  <div className="bg-blue-50 border-l-4 border-blue-500 px-3 py-2 mb-3">
                    <h2 className="font-bold text-blue-900" style={{ fontSize: `${fontSize + 2}px` }}>
                      {subjectName}
                    </h2>
                  </div>

                  {/* Вопросы предмета */}
                  <div className={`${spacingClasses.questions} ${columnsCount === 2 ? 'columns-2 gap-4' : ''}`}>
                    {questions.map((question) => (
                      <div key={question.number} className={`border-b border-gray-200 ${spacingClasses.question}`}>
                        <div className="flex items-start gap-2">
                          <span className="font-bold min-w-[30px]">
                            {question.number}.
                          </span>
                          <div className="flex-1">
                            <div className="mb-1.5 leading-tight">
                              <MathText text={question.question} />
                            </div>
                            {question.image && (
                              <div className="my-2">
                                <img 
                                  src={question.image} 
                                  alt="Question" 
                                  className="max-w-full h-auto"
                                  style={{ maxHeight: '200px', objectFit: 'contain' }}
                                />
                              </div>
                            )}
                            <div className={spacingClasses.options}>
                              {question.options?.map((option: string, idx: number) => (
                                <div key={idx} className="flex items-start gap-1.5">
                                  <span className="font-medium min-w-[20px]">
                                    {String.fromCharCode(65 + idx)})
                                  </span>
                                  <div className="flex-1 leading-tight">
                                    <MathText text={option} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Разделитель между предметами */}
                  {subjectIndex < questionsBySubject.size - 1 && (
                    <div className="my-4 border-t-2 border-dashed border-gray-300"></div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <style>{`
        @media print {
          * {
            box-sizing: border-box;
          }
          
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            overflow: visible !important;
          }
          
          .page-break {
            page-break-after: always;
            page-break-inside: avoid;
            break-after: page;
            break-inside: avoid;
          }
          
          .page-break:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          
          @page {
            size: A4 portrait;
            margin: 1cm;
            padding: 0;
          }
          
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          
          .columns-2 {
            column-count: 2;
            column-gap: 1rem;
          }
          
          /* Сохраняем цвета при печати */
          .bg-blue-50 {
            background-color: #eff6ff !important;
          }
          
          .border-blue-500 {
            border-color: #3b82f6 !important;
          }
          
          .text-blue-900 {
            color: #1e3a8a !important;
          }
          
          /* Убираем сайдбар и навигацию */
          aside, nav, header, .sidebar { display: none !important; }
          main { margin: 0 !important; padding: 0 !important; }
        }
        
        /* Скрываем сайдбар в режиме просмотра */
        body:has(.print-view-mode) aside,
        body:has(.print-view-mode) nav,
        body:has(.print-view-mode) header,
        body:has(.print-view-mode) .sidebar {
          display: none !important;
        }
        body:has(.print-view-mode) main {
          margin: 0 !important;
          padding: 0 !important;
          max-width: 100% !important;
        }
      `}</style>
    </div>
  );
}
