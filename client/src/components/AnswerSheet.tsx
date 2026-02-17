import { useEffect, useRef, memo } from 'react';
import QRCode from 'qrcode';

interface AnswerSheetProps {
  student: {
    fullName: string;
    variantCode: string;
  };
  test: {
    name: string;
    subjectName?: string;
    classNumber: number;
    groupLetter: string;
    groupName?: string;
    periodMonth?: number;
    periodYear?: number;
  };
  questions: number;
  qrData: string;
  columns?: number;
  compact?: boolean;
  sheetsPerPage?: number;
}

function AnswerSheet({ student, test, questions, qrData, columns, compact = false, sheetsPerPage = 1 }: AnswerSheetProps) {
  const qrRef = useRef<HTMLCanvasElement>(null);

  const scale = sheetsPerPage === 4 ? 0.7 : sheetsPerPage === 2 ? 0.9 : 1;
  const qrSize = sheetsPerPage === 6 ? 50 : sheetsPerPage === 4 ? 60 : sheetsPerPage === 2 ? 70 : 80;

  useEffect(() => {
    if (qrRef.current && qrData) {
      // Нормализуем данные перед генерацией QR-кода (trim + uppercase)
      const normalizedData = qrData.trim().toUpperCase();
      
      QRCode.toCanvas(qrRef.current, normalizedData, {
        width: qrSize,
        margin: 1,
        errorCorrectionLevel: 'H', // Высокий уровень коррекции ошибок для надежности
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      }).catch((err) => {
        console.error('QR code generation error:', err);
      });
    }
  }, [qrData, qrSize]);

  const headerMarginBottom = sheetsPerPage >= 4 ? 0.5 : 1;
  
  // Динамически вычисляем количество вопросов на основе пропса
  const totalQuestions = questions || 45;
  
  // Динамически выбираем количество колонок в зависимости от количества вопросов
  // До 44 вопросов - 2 колонки (более вертикальный формат)
  // 45+ вопросов - 3 колонки (более горизонтальный формат)
  const columnsCount = totalQuestions <= 44 ? 2 : 3;
  const questionsPerColumn = Math.ceil(totalQuestions / columnsCount);
  
  // Вычисляем сколько вопросов в каждой колонке
  const getColumnQuestions = (columnIndex: number) => {
    const start = columnIndex * questionsPerColumn;
    const end = Math.min(start + questionsPerColumn, totalQuestions);
    return end - start;
  };

  const circleSize = sheetsPerPage === 6 ? '3.5mm' : sheetsPerPage >= 4 ? '4mm' : '5mm';
  const fontSize = sheetsPerPage === 6 ? '8px' : sheetsPerPage === 4 ? '9px' : '11px';
  const headerFontSize = sheetsPerPage === 6 ? '10px' : sheetsPerPage === 4 ? '11px' : '14px';
  const infoFontSize = sheetsPerPage === 6 ? '6px' : sheetsPerPage === 4 ? '7px' : '9px';
  const borderWidth = sheetsPerPage >= 4 ? '2px' : '3px';
  const padding = sheetsPerPage >= 4 ? '0.5mm' : '1mm';
  const gap = sheetsPerPage >= 4 ? '0.3mm' : '0.5mm';
  const circleGap = sheetsPerPage === 6 ? '1.5px' : '2px';

  const formatPeriod = (month: number, year: number) => {
    const months = [
      'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
      'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'
    ];
    return `${months[month - 1]} ${year}`;
  };

  const renderQuestionRow = (questionNumber: number) => {
    return (
      <div className="flex items-center" style={{ height: '100%' }}>
        <span className="w-6 font-bold text-gray-900 text-right mr-2" style={{ fontSize }}>{questionNumber}.</span>
        <div className="flex" style={{ gap: circleGap }}>
          {['A', 'B', 'C', 'D'].map((letter) => (
            <div key={letter}>
              <div
                className="rounded-full"
                style={{
                  width: circleSize,
                  height: circleSize,
                  border: '2px solid #000000',
                  backgroundColor: '#ffffff'
                }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      className="bg-white mx-auto relative print:m-0 flex flex-col"
      style={{
        fontFamily: 'Arial, sans-serif',
        backgroundColor: '#ffffff',
        width: '100%',
        height: '100%',
        boxSizing: 'border-box'
      }}
    >
      {/* Header */}
      <div
        className="border-gray-900 flex-shrink-0"
        style={{
          marginBottom: `${headerMarginBottom}mm`,
          borderWidth,
          padding
        }}
      >
        <div className="flex justify-between items-start gap-1 h-full">
          <div className="flex-shrink-0">
            <h1 className="font-bold mb-0.5 leading-tight text-gray-900" style={{ fontSize: headerFontSize }}>JAVOB VARAQASI</h1>
            <div className="flex flex-col gap-0 leading-tight" style={{ fontSize: infoFontSize }}>
              <div className="flex items-center">
                <span className="font-semibold">O'quvchi:</span>
                <span className="ml-1">{student.fullName}</span>
              </div>
              {test.subjectName && (
                <div className="flex items-center">
                  <span className="font-semibold">Fan:</span>
                  <span className="ml-1">{test.subjectName}</span>
                </div>
              )}
              {test.periodMonth && test.periodYear && (
                <div className="flex items-center">
                  <span className="font-semibold">Davr:</span>
                  <span className="ml-1">{formatPeriod(test.periodMonth, test.periodYear)}</span>
                </div>
              )}
              <div className="flex items-center">
                <span className="font-semibold">Variant:</span>
                <span className="ml-1 font-bold text-blue-600">{student.variantCode}</span>
              </div>
              <div className="flex items-center">
                <span className="font-semibold">Sinf:</span>
                <span className="ml-1">{test.classNumber}-{test.groupLetter}</span>
              </div>
            </div>
          </div>
          {qrData && (
            <div className="flex flex-col items-center gap-0.5 bg-white flex-shrink-0" style={{ padding: '0.5mm' }}>
              <canvas ref={qrRef} className="block"></canvas>
              <p className="text-gray-900 font-mono font-bold leading-none text-[7px]">{student.variantCode}</p>
            </div>
          )}
        </div>
      </div>

      {/* Answer Grid */}
      <div
        className="border-gray-900 flex flex-col flex-grow"
        style={{
          padding: '0',
          borderWidth
        }}
      >
        <h2 className="font-bold text-center text-gray-900 border-b-2 border-gray-400 leading-tight flex-shrink-0 py-0.5" style={{ fontSize: headerFontSize }}>
          JAVOBLAR ({totalQuestions} ta savol)
        </h2>

        <div
          className="flex-grow flex"
          style={{
            gap: sheetsPerPage >= 4 ? '1mm' : '2mm',
            padding: sheetsPerPage >= 4 ? '1mm' : '2mm'
          }}
        >
          {/* Динамическое количество колонок (2 или 3) */}
          {Array.from({ length: columnsCount }, (_, colIndex) => {
            const startQuestion = colIndex * questionsPerColumn + 1;
            const columnQuestionsCount = getColumnQuestions(colIndex);
            
            return (
              <div
                key={`column-${colIndex}`}
                className="flex-1 flex flex-col"
                style={{
                  display: 'grid',
                  gridTemplateRows: `repeat(${questionsPerColumn}, 1fr)`,
                  gap
                }}
              >
                {Array.from({ length: columnQuestionsCount }, (_, i) => {
                  const questionNumber = startQuestion + i;
                  return (
                    <div key={`q-${questionNumber}`}>
                      {renderQuestionRow(questionNumber)}
                    </div>
                  );
                })}
                {/* Добавляем пустые ячейки для выравнивания */}
                {Array.from({ length: questionsPerColumn - columnQuestionsCount }, (_, i) => (
                  <div key={`placeholder-${colIndex}-${i}`} style={{ visibility: 'hidden' }} />
                ))}
              </div>
            );
          })}
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
    prevProps.columns === nextProps.columns &&
    prevProps.sheetsPerPage === nextProps.sheetsPerPage &&
    prevProps.compact === nextProps.compact
  );
});
