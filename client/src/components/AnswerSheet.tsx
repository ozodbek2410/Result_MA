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

// Savol soniga qarab adaptiv layout
function getGridLayout(totalQuestions: number) {
  if (totalQuestions <= 44) {
    return {
      columns: 2,
      bubbleSize: 7.5,    // mm
      bubbleGap: 2.5,     // mm - doiralar orasidagi masofa
      rowMargin: 1.2,     // mm - qatorlar orasidagi masofa
      columnGap: 8,       // mm - ustunlar orasidagi masofa
      numberWidth: 8,     // mm - raqam joyi
      fontSize: 9,        // pt - raqam shrifti
      bubbleFontSize: 8,  // pt - doira ichidagi harf
      borderWidth: 2,     // px
    };
  }
  if (totalQuestions <= 60) {
    return {
      columns: 3,
      bubbleSize: 7.5,
      bubbleGap: 2.5,
      rowMargin: 1.2,
      columnGap: 6,
      numberWidth: 8,
      fontSize: 9,
      bubbleFontSize: 8,
      borderWidth: 2,
    };
  }
  if (totalQuestions <= 75) {
    return {
      columns: 3,
      bubbleSize: 7,
      bubbleGap: 2,
      rowMargin: 0.8,
      columnGap: 5,
      numberWidth: 8,
      fontSize: 8,
      bubbleFontSize: 7,
      borderWidth: 2,
    };
  }
  if (totalQuestions <= 100) {
    // 4 ustun — 90 savol = 23 qator, 100 savol = 25 qator
    return {
      columns: 4,
      bubbleSize: 6.5,
      bubbleGap: 1.5,
      rowMargin: 0.6,
      columnGap: 4,
      numberWidth: 7,
      fontSize: 7.5,
      bubbleFontSize: 6.5,
      borderWidth: 1.5,
    };
  }
  // 100+ savol — 5 ustun
  return {
    columns: 5,
    bubbleSize: 5.5,
    bubbleGap: 1.2,
    rowMargin: 0.4,
    columnGap: 3,
    numberWidth: 6,
    fontSize: 7,
    bubbleFontSize: 6,
    borderWidth: 1.5,
  };
}

function AnswerSheet({ student, test, questions, qrData }: AnswerSheetProps) {
  const qrRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (qrRef.current && qrData) {
      const normalizedData = qrData.trim().toUpperCase();

      QRCode.toCanvas(qrRef.current, normalizedData, {
        width: 100,
        margin: 1,
        errorCorrectionLevel: 'H',
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      }).catch((err) => {
        console.error('QR code generation error:', err);
      });
    }
  }, [qrData]);

  // Inject print styles
  useEffect(() => {
    const styleId = 'answer-sheet-print-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }

          body {
            margin: 0;
            padding: 0;
          }

          .answer-sheet-container {
            page-break-after: always;
            page-break-inside: avoid;
          }

          .answer-sheet-container * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
        }
      `;
      document.head.appendChild(style);
    }

    return () => {
      const style = document.getElementById(styleId);
      if (style) {
        style.remove();
      }
    };
  }, []);

  const totalQuestions = questions || 45;
  const layout = getGridLayout(totalQuestions);

  const questionsPerColumn = Math.ceil(totalQuestions / layout.columns);

  const getColumnQuestions = (columnIndex: number) => {
    const start = columnIndex * questionsPerColumn;
    const end = Math.min(start + questionsPerColumn, totalQuestions);
    return end - start;
  };

  const formatPeriod = (month: number, year: number) => {
    const months = [
      'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
      'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'
    ];
    return `${months[month - 1]} ${year}`;
  };

  const renderQuestionRow = (questionNumber: number) => {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        margin: `${layout.rowMargin}mm 0`,
        padding: '0'
      }}>
        <div style={{
          width: `${layout.numberWidth}mm`,
          fontWeight: 'bold',
          fontSize: `${layout.fontSize}pt`,
          textAlign: 'left'
        }}>
          {questionNumber}.
        </div>
        <div style={{
          display: 'flex',
          gap: `${layout.bubbleGap}mm`,
          flex: 1
        }}>
          {['A', 'B', 'C', 'D'].map((letter) => (
            <div key={letter} style={{ display: 'inline-block' }}>
              <div
                style={{
                  width: `${layout.bubbleSize}mm`,
                  height: `${layout.bubbleSize}mm`,
                  border: `${layout.borderWidth}px solid #000000`,
                  borderRadius: '50%',
                  backgroundColor: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: `${layout.bubbleFontSize}pt`,
                  fontWeight: 'bold',
                  boxSizing: 'border-box'
                }}
              >
                {letter}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const containerStyle: React.CSSProperties = {
    width: '210mm',
    position: 'relative',
    background: 'white',
    padding: '10mm',
    fontFamily: 'Arial, sans-serif',
    color: 'black',
    boxSizing: 'border-box',
    margin: '0 auto',
    pageBreakAfter: 'always',
    fontSize: 'initial',
    lineHeight: 'initial',
    letterSpacing: 'initial',
    wordSpacing: 'initial'
  };

  return (
    <div className="answer-sheet-container" style={containerStyle}>
        {/* Academy Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '2px solid #333',
          paddingBottom: '2mm',
          marginBottom: '2mm',
          padding: '0 5mm',
          fontFamily: 'Times New Roman, serif'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2mm' }}>
            <img src="/logo.png" alt="Logo" style={{ width: '12mm', height: '12mm', objectFit: 'contain' }} />
          </div>
          <div style={{ textAlign: 'center', flex: 1, padding: '0 2mm' }}>
            <div style={{ fontWeight: 'bold', color: '#1a1a6e', fontSize: '14pt', letterSpacing: '0.5px' }}>MATH ACADEMY</div>
            <div style={{ fontWeight: 'bold', color: '#444', fontSize: '9pt' }}>Xususiy maktabi</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#333', fontSize: '8pt', lineHeight: '1.3' }}>Sharqona ta&#39;lim-tarbiya<br/>va haqiqiy ilm maskani.</div>
            <div style={{ fontWeight: 'bold', color: '#1a1a6e', fontSize: '9pt' }}>&#9742; +91-333-66-22</div>
          </div>
        </div>

        {/* Corner Marks */}
        <div style={{
          position: 'absolute',
          top: '1mm',
          left: '1mm',
          width: '12mm',
          height: '12mm',
          background: 'black',
          border: '6mm solid black',
          boxSizing: 'border-box',
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact'
        }} />
        <div style={{
          position: 'absolute',
          top: '1mm',
          right: '1mm',
          width: '12mm',
          height: '12mm',
          background: 'black',
          border: '6mm solid black',
          boxSizing: 'border-box',
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact'
        }} />
        <div style={{
          position: 'absolute',
          bottom: '1mm',
          left: '1mm',
          width: '12mm',
          height: '12mm',
          background: 'black',
          border: '6mm solid black',
          boxSizing: 'border-box',
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact'
        }} />
        <div style={{
          position: 'absolute',
          bottom: '1mm',
          right: '1mm',
          width: '12mm',
          height: '12mm',
          background: 'black',
          border: '6mm solid black',
          boxSizing: 'border-box',
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact'
        }} />

      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '3mm',
        padding: '0 5mm'
      }}>
        <div style={{ flex: 1 }}>
          <h1 style={{
            fontSize: '16pt',
            fontWeight: 'bold',
            marginBottom: '2mm'
          }}>
            JAVOB VARAQASI
          </h1>
          <div style={{ fontSize: '10pt' }}>
            <div style={{ margin: '1mm 0' }}>
              <span style={{ fontWeight: 600 }}>O'quvchi:</span> {student.fullName}
            </div>
            {test.subjectName && (
              <div style={{ margin: '1mm 0' }}>
                <span style={{ fontWeight: 600 }}>Fan:</span> {test.subjectName}
              </div>
            )}
            {test.periodMonth && test.periodYear && (
              <div style={{ margin: '1mm 0' }}>
                <span style={{ fontWeight: 600 }}>Davr:</span> {formatPeriod(test.periodMonth, test.periodYear)}
              </div>
            )}
            <div style={{ margin: '1mm 0' }}>
              <span style={{ fontWeight: 600 }}>Variant:</span> <span style={{ fontWeight: 'bold' }}>{student.variantCode}</span>
            </div>
            <div style={{ margin: '1mm 0' }}>
              <span style={{ fontWeight: 600 }}>Sinf:</span> {test.classNumber}-{test.groupLetter}
              {totalQuestions > 0 && (
                <span style={{ marginLeft: '5mm', fontWeight: 600 }}>Savollar soni: {totalQuestions}</span>
              )}
            </div>
          </div>
        </div>
        {qrData && (
          <div style={{
            width: '30mm',
            height: '30mm',
            border: '2px solid black',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <canvas ref={qrRef} style={{ display: 'block' }}></canvas>
          </div>
        )}
      </div>

      {/* Ko'rsatmalar */}
      <div style={{
        background: '#f0f0f0',
        padding: '2mm',
        marginBottom: '3mm',
        border: '1px solid #ccc',
        fontSize: '8pt'
      }}>
        <h3 style={{
          fontSize: '9pt',
          fontWeight: 'bold',
          marginBottom: '1.5mm'
        }}>
          Ko'rsatmalar:
        </h3>
        <ul style={{
          margin: '0',
          paddingLeft: '5mm'
        }}>
          <li style={{ margin: '0.5mm 0' }}>Qora yoki ko'k ruchka ishlatiladi. Doirachani to'liq to'ldiring.</li>
          <li style={{ margin: '0.5mm 0' }}>Bir savolga faqat bitta javob belgilang. O'chirish yoki tuzatish mumkin emas.</li>
        </ul>
      </div>

      {/* Answer Grid */}
      <div style={{
        display: 'flex',
        gap: `${layout.columnGap}mm`,
        padding: '0 5mm'
      }}>
        {Array.from({ length: layout.columns }, (_, colIndex) => {
          const startQuestion = colIndex * questionsPerColumn + 1;
          const columnQuestionsCount = getColumnQuestions(colIndex);

          return (
            <div key={`column-${colIndex}`} style={{ flex: 1 }}>
              {Array.from({ length: columnQuestionsCount }, (_, i) => {
                const questionNumber = startQuestion + i;
                return (
                  <div key={`q-${questionNumber}`}>
                    {renderQuestionRow(questionNumber)}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(AnswerSheet, (prevProps, nextProps) => {
  return (
    prevProps.student.fullName === nextProps.student.fullName &&
    prevProps.student.variantCode === nextProps.student.variantCode &&
    prevProps.questions === nextProps.questions &&
    prevProps.qrData === nextProps.qrData
  );
});
