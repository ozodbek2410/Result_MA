import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface AnswerSheetProps {
  student: {
    fullName: string;
    variantCode: string;
  };
  test: {
    name: string;
    subjectName: string;
    classNumber: number;
    groupLetter: string;
  };
  questions: number;
  qrData: string;
  columns?: number; // 2 или 3 столбца
}

export default function AnswerSheet({ student, test, questions, qrData, columns }: AnswerSheetProps) {
  const qrRef = useRef<HTMLCanvasElement>(null);

  // Проверка и логирование
  useEffect(() => {
    console.log('AnswerSheet props:', {
      studentName: student.fullName,
      variantCode: student.variantCode,
      questions,
      columns,
      testName: test.name,
      qrData,
      qrDataType: typeof qrData,
      qrDataLength: qrData?.length
    });
    
    if (questions <= 0) {
      console.warn('⚠️ Questions count is 0 or negative:', questions);
    }
    
    if (!qrData || qrData === '') {
      console.warn('⚠️ QR data is empty or undefined');
    }
  }, [student, test, questions, columns, qrData]);

  useEffect(() => {
    if (qrRef.current && qrData) {
      console.log('Generating QR code for:', qrData);
      QRCode.toCanvas(qrRef.current, qrData, {
        width: 80,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      }).then(() => {
        console.log('QR code generated successfully');
      }).catch((err) => {
        console.error('QR code generation error:', err);
      });
    } else {
      console.warn('QR code not generated:', { hasRef: !!qrRef.current, qrData });
    }
  }, [qrData]);

  // Автоматически определяем количество колонок в зависимости от количества вопросов
  // Защита от некорректных значений
  const safeQuestions = Math.max(1, Math.min(questions || 0, 200)); // от 1 до 200
  const autoColumns = columns || (safeQuestions > 60 ? 3 : 2);
  const questionsPerColumn = Math.ceil(safeQuestions / autoColumns);

  const renderAnswerBubbles = (questionNumber: number) => {
    return (
      <div className="flex items-center gap-1 mb-1" key={questionNumber}>
        <span className="w-6 text-[11px] font-bold text-gray-900 text-right">{questionNumber}.</span>
        <div className="flex gap-1.5">
          {['A', 'B', 'C', 'D'].map((letter) => (
            <div key={letter} className="flex items-center">
              {/* Уменьшенные кружки для компактности */}
              <div className="w-4 h-4 border-[2px] border-gray-900 bg-white rounded-full"></div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderColumn = (startNum: number, endNum: number) => {
    const columnQuestions = [];
    
    // Добавляем заголовок с буквами только один раз в начале колонки
    columnQuestions.push(
      <div key="header" className="flex items-center gap-1 mb-1.5 pb-1 border-b border-gray-300">
        <span className="w-6 text-[11px] font-bold text-gray-900 text-right"></span>
        <div className="flex gap-1.5">
          {['A', 'B', 'C', 'D'].map((letter) => (
            <div key={letter} className="flex items-center justify-center w-4">
              <span className="text-[10px] font-bold text-gray-700">{letter}</span>
            </div>
          ))}
        </div>
      </div>
    );
    
    // Генерируем только реальные вопросы
    const actualEndNum = Math.min(endNum, safeQuestions);
    for (let i = startNum; i <= actualEndNum; i++) {
      columnQuestions.push(renderAnswerBubbles(i));
    }
    
    return columnQuestions;
  };

  return (
    <div className="bg-white w-[210mm] h-[297mm] mx-auto relative print:m-0 print:h-auto" style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* Черные квадраты-маркеры убраны */}
      
      {/* Основной контент */}
      <div className="pt-[15mm] px-[15mm] pb-[12mm]">
        {/* Header - компактный */}
        <div className="border-[3px] border-gray-900 p-2 mb-2">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h1 className="text-base font-bold mb-1 text-gray-900">JAVOB VARAQASI</h1>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0 text-[10px]">
                <div className="flex">
                  <span className="font-semibold w-14">O'quvchi:</span>
                  <span className="flex-1 truncate">{student.fullName}</span>
                </div>
                <div className="flex">
                  <span className="font-semibold w-12">Variant:</span>
                  <span className="flex-1 font-bold text-blue-600">{student.variantCode}</span>
                </div>
                <div className="flex">
                  <span className="font-semibold w-14">Fan:</span>
                  <span className="flex-1 truncate">{test.subjectName}</span>
                </div>
                <div className="flex">
                  <span className="font-semibold w-12">Sinf:</span>
                  <span className="flex-1">{test.classNumber}-{test.groupLetter}</span>
                </div>
              </div>
            </div>
            {qrData && (
              <div className="flex flex-col items-center gap-1 ml-3 p-2 bg-white">
                <canvas ref={qrRef} className="block"></canvas>
                <p className="text-[8px] text-gray-900 font-mono font-bold">{student.variantCode}</p>
              </div>
            )}
          </div>
        </div>

        {/* Instructions - компактные */}
        {/* Инструкции убраны для экономии места */}

        {/* Answer Grid - максимум места */}
        <div className="border-[3px] border-gray-900 p-2">
          <h2 className="font-bold text-xs mb-1.5 text-center text-gray-900 border-b-2 border-gray-400 pb-1">
            JAVOBLAR ({safeQuestions} ta savol)
          </h2>
          
          <div className={`grid gap-3 ${autoColumns === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {Array.from({ length: autoColumns }, (_, colIndex) => {
              const startNum = colIndex * questionsPerColumn + 1;
              const endNum = (colIndex + 1) * questionsPerColumn;
              return (
                <div key={colIndex} className="border-r-2 last:border-r-0 border-gray-300 pr-2 last:pr-0">
                  {renderColumn(startNum, endNum)}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer - минимальный */}
        <div className="mt-1 pt-1 border-t border-gray-300">
          <div className="flex justify-between items-center text-[8px] text-gray-500">
            <p>🤖 Avtomatik skanerlash</p>
            <p className="font-mono">{new Date().toLocaleDateString('uz-UZ')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
