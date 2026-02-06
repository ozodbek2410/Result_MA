import { useEffect, useRef, memo } from 'react';
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
    groupName?: string; // Добавляем название группы
  };
  questions: number;
  qrData: string;
  columns?: number; // 2 или 3 столбца
  compact?: boolean; // Компактный режим для печати нескольких листов на странице
}

function AnswerSheet({ student, test, questions, qrData, columns, compact = false }: AnswerSheetProps) {
  const qrRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (qrRef.current && qrData) {
      QRCode.toCanvas(qrRef.current, qrData, {
        width: 80,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      }).catch((err) => {
        console.error('QR code generation error:', err);
      });
    }
  }, [qrData]);

  // Автоматически определяем количество колонок в зависимости от количества вопросов
  // Защита от некорректных значений
  const safeQuestions = Math.max(1, Math.min(questions || 0, 200)); // от 1 до 200
  const autoColumns = columns || (safeQuestions > 60 ? 3 : 2);
  const questionsPerColumn = Math.ceil(safeQuestions / autoColumns);

  const renderAnswerBubbles = (questionNumber: number) => {
    return (
      <div className={`flex items-center gap-1 ${compact ? 'mb-0.5' : 'mb-1'}`} key={questionNumber}>
        <span className={`w-6 font-bold text-gray-900 text-right ${compact ? 'text-[9px]' : 'text-[11px]'}`}>{questionNumber}.</span>
        <div className={compact ? 'flex gap-1' : 'flex gap-1.5'}>
          {['A', 'B', 'C', 'D'].map((letter) => (
            <div key={letter} className="flex items-center">
              {/* Уменьшенные кружки для компактности */}
              <div className={compact ? 'w-3.5 h-3.5 rounded-full' : 'w-4 h-4 rounded-full'} style={{ border: '2px solid #000000', backgroundColor: '#ffffff' }}></div>
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
      <div key="header" className={`flex items-center gap-1 border-b border-gray-300 ${compact ? 'mb-1 pb-0.5' : 'mb-1.5 pb-1'}`}>
        <span className={`w-6 font-bold text-gray-900 text-right ${compact ? 'text-[9px]' : 'text-[11px]'}`}></span>
        <div className={compact ? 'flex gap-1' : 'flex gap-1.5'}>
          {['A', 'B', 'C', 'D'].map((letter) => (
            <div key={letter} className={`flex items-center justify-center ${compact ? 'w-3.5' : 'w-4'}`}>
              <span className={`font-bold text-gray-700 ${compact ? 'text-[8px]' : 'text-[10px]'}`}>{letter}</span>
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
    <div 
      className="bg-white mx-auto relative print:m-0" 
      style={{ 
        fontFamily: 'Arial, sans-serif', 
        backgroundColor: '#ffffff', 
        willChange: 'transform',
        width: '210mm',
        height: compact ? '148.5mm' : '297mm',
        overflow: compact ? 'hidden' : 'visible'
      }}
    >
      <div 
        style={{
          paddingTop: compact ? '2mm' : '15mm',
          paddingLeft: compact ? '2mm' : '15mm',
          paddingRight: compact ? '2mm' : '15mm',
          paddingBottom: compact ? '1mm' : '12mm'
        }}
      >
        {/* Header - компактный */}
        <div className={`border-[3px] border-gray-900 mb-2 ${compact ? 'p-1.5' : 'p-2'}`}>
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h1 className={`font-bold mb-1 text-gray-900 ${compact ? 'text-sm' : 'text-base'}`}>JAVOB VARAQASI</h1>
              <div className={`grid grid-cols-2 gap-x-2 gap-y-0 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
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
                {test.groupName && (
                  <div className="flex col-span-2">
                    <span className="font-semibold w-14">Guruh:</span>
                    <span className="flex-1 truncate">{test.groupName}</span>
                  </div>
                )}
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
        <div className={`border-[3px] border-gray-900 ${compact ? 'p-1.5' : 'p-2'}`}>
          <h2 className={`font-bold text-center text-gray-900 border-b-2 border-gray-400 ${compact ? 'text-[10px] mb-1 pb-0.5' : 'text-xs mb-1.5 pb-1'}`}>
            JAVOBLAR ({safeQuestions} ta savol)
          </h2>
          
          <div className={`grid ${compact ? 'gap-2' : 'gap-3'} ${autoColumns === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
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

export default memo(AnswerSheet, (prevProps, nextProps) => {
  return (
    prevProps.student.fullName === nextProps.student.fullName &&
    prevProps.student.variantCode === nextProps.student.variantCode &&
    prevProps.questions === nextProps.questions &&
    prevProps.qrData === nextProps.qrData &&
    prevProps.columns === nextProps.columns
  );
});
