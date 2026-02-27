/**
 * TITUL VARAQA GENERATOR
 * Test uchun titul varaqa yaratish
 */

import QRCode from 'qrcode';

export interface TitulSheetConfig {
  studentId: string;
  studentName: string;
  testId: string;
  testName: string;
  variant: 'A' | 'B' | 'C' | 'D';
  groupId: string;
  groupName: string;
  date: string;
  questionCount?: number; // Number of questions in the test
}

export async function generateTitulSheet(config: TitulSheetConfig): Promise<string> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas context topilmadi');

  // A4 o'lcham (300 DPI)
  const width = 2480;  // 210mm * 300dpi / 25.4
  const height = 3508; // 297mm * 300dpi / 25.4
  canvas.width = width;
  canvas.height = height;

  // Oq fon
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // 1. ANCHOR MARKERLAR (4 burchakda qora doiralar)
  drawAnchorMarkers(ctx, width, height);

  // 2. SARLAVHA
  drawHeader(ctx, width, config);

  // 3. QR KOD
  await drawQRCode(ctx, width, height, config);

  // 4. TALABA MA'LUMOTLARI
  drawStudentInfo(ctx, width, config);

  // 5. VARIANT BELGILASH (OMR)
  drawVariantOMR(ctx, width, height, config.variant);

  // 6. ID RAQAM BELGILASH (OMR)
  drawIDNumberOMR(ctx, width, height, config.studentId);

  // 7. JAVOBLAR BO'LIMI (30 ta savol, har birida A/B/C/D)
  drawAnswersOMR(ctx, width, height, config.questionCount || 30);

  // 8. CHIZIQLAR VA DEKORATSIYA
  drawBorders(ctx, width, height);

  return canvas.toDataURL('image/png');
}

function drawAnchorMarkers(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const size = 80; // Kvadrat o'lchami (kattaroq)
  const margin = 150; // Chetdan uzoqroq
  const smallSize = 60; // Kichik kvadratlar

  // 4 ta burchakda asosiy markerlar
  const mainPositions = [
    { x: margin, y: margin },                    // Top Left
    { x: width - margin, y: margin },            // Top Right
    { x: margin, y: height - margin },           // Bottom Left
    { x: width - margin, y: height - margin },   // Bottom Right
  ];

  // Qo'shimcha markerlar (Evalbee kabi - ko'proq)
  const extraPositions = [
    // Yuqori qator (3 ta)
    { x: width * 0.3, y: margin },
    { x: width * 0.5, y: margin },
    { x: width * 0.7, y: margin },
    
    // Pastki qator (3 ta)
    { x: width * 0.3, y: height - margin },
    { x: width * 0.5, y: height - margin },
    { x: width * 0.7, y: height - margin },
    
    // Chap ustun (2 ta)
    { x: margin, y: height * 0.4 },
    { x: margin, y: height * 0.6 },
    
    // O'ng ustun (2 ta)
    { x: width - margin, y: height * 0.4 },
    { x: width - margin, y: height * 0.6 },
  ];

  ctx.fillStyle = '#000000';
  
  // Asosiy markerlar (kattaroq)
  mainPositions.forEach((pos) => {
    ctx.fillRect(pos.x - size/2, pos.y - size/2, size, size);
  });
  
  // Qo'shimcha markerlar (kichikroq)
  extraPositions.forEach((pos) => {
    ctx.fillRect(pos.x - smallSize/2, pos.y - smallSize/2, smallSize, smallSize);
  });
}

function drawHeader(ctx: CanvasRenderingContext2D, width: number, config: TitulSheetConfig) {
  ctx.fillStyle = '#1E40AF';
  ctx.font = 'bold 80px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('TITUL VARAQA', width / 2, 250);

  ctx.fillStyle = '#374151';
  ctx.font = '40px Arial';
  ctx.fillText(config.testName, width / 2, 320);

  ctx.font = '30px Arial';
  ctx.fillStyle = '#6B7280';
  ctx.fillText(config.date, width / 2, 370);
}

async function drawQRCode(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: TitulSheetConfig
) {
  // QR ma'lumotlar - JSON format
  const qrData = JSON.stringify({
    testId: config.testId,
    studentId: config.studentId,
    variant: config.variant,
    groupId: config.groupId,
    type: 'block_test'
  });
  
  // QR kod yaratish - yuqori aniqlik, rамкаsiz
  const qrDataUrl = await QRCode.toDataURL(qrData, {
    width: 500,
    margin: 0,
    errorCorrectionLevel: 'H',
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });

  // QR kodni chizish (o'ng yuqori)
  const qrImg = new Image();
  await new Promise((resolve) => {
    qrImg.onload = resolve;
    qrImg.src = qrDataUrl;
  });

  const qrX = width * 0.70;
  const qrY = height * 0.05;
  const qrSize = width * 0.20;

  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  // QR label
  ctx.fillStyle = '#6B7280';
  ctx.font = '24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('QR KOD', qrX + qrSize / 2, qrY + qrSize + 40);
}

function drawStudentInfo(ctx: CanvasRenderingContext2D, _width: number, config: TitulSheetConfig) {
  const startX = 200;
  const startY = 500;
  const lineHeight = 80;

  ctx.fillStyle = '#111827';
  ctx.font = 'bold 36px Arial';
  ctx.textAlign = 'left';

  const info = [
    `Talaba: ${config.studentName}`,
    `ID: ${config.studentId}`,
    `Guruh: ${config.groupName}`,
    `Test ID: ${config.testId}`,
  ];

  info.forEach((text, i) => {
    ctx.fillText(text, startX, startY + i * lineHeight);
  });
}

function drawVariantOMR(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  selectedVariant: string
) {
  const startX = width * 0.05;
  const startY = height * 0.30;
  const circleRadius = 40;
  const spacing = 120;

  // Label
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 36px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('VARIANT:', startX, startY - 20);

  // Variantlar
  const variants = ['A', 'B', 'C', 'D'];
  variants.forEach((variant, i) => {
    const x = startX + 50;
    const y = startY + 50 + i * spacing;

    // Doira
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, circleRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Agar tanlangan bo'lsa - to'ldirish
    if (variant === selectedVariant) {
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(x, y, circleRadius - 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Harf
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(variant, x + circleRadius + 20, y + 15);
  });
}

function drawIDNumberOMR(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  studentId: string
) {
  const startX = width * 0.05;
  const startY = height * 0.50;
  const circleRadius = 25;
  const colSpacing = 80;
  const rowSpacing = 60;

  // Label
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 36px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('ID RAQAM:', startX, startY - 20);

  // 10 ta ustun (har bir raqam uchun)
  for (let col = 0; col < 10; col++) {
    const x = startX + 50 + col * colSpacing;
    
    // Ustun raqami
    ctx.fillStyle = '#6B7280';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(col.toString(), x, startY + 30);

    // 10 ta qator (0-9)
    for (let row = 0; row < 10; row++) {
      const y = startY + 60 + row * rowSpacing;

      // Doira
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, circleRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Agar bu raqam tanlangan bo'lsa
      const digit = studentId[col];
      if (digit && parseInt(digit) === row) {
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(x, y, circleRadius - 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Raqam
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(row.toString(), x, y + 7);
    }
  }
}

function drawBorders(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // Tashqi chegara
  ctx.strokeStyle = '#1E40AF';
  ctx.lineWidth = 8;
  ctx.strokeRect(50, 50, width - 100, height - 100);

  // Ichki chegara
  ctx.strokeStyle = '#93C5FD';
  ctx.lineWidth = 2;
  ctx.strokeRect(70, 70, width - 140, height - 140);
}

function drawAnswersOMR(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  questionCount: number = 30
) {
  const startX = width * 0.40;
  const startY = height * 0.35;
  const areaWidth = width * 0.50;
  const areaHeight = height * 0.60;

  // Label
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 36px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('JAVOBLAR:', startX, startY - 30);

  // Use actual question count instead of fixed 30
  const questionsPerColumn = 10;
  const totalQuestions = questionCount;
  const columns = Math.ceil(totalQuestions / questionsPerColumn);

  const columnWidth = areaWidth / Math.max(columns, 3); // Minimum 3 columns for layout
  const rowHeight = areaHeight / questionsPerColumn;
  const circleRadius = Math.min(columnWidth, rowHeight) * 0.08;
  const variantSpacing = columnWidth / 5;

  for (let q = 0; q < totalQuestions; q++) {
    const col = Math.floor(q / questionsPerColumn);
    const row = q % questionsPerColumn;

    const questionX = startX + col * columnWidth;
    const questionY = startY + row * rowHeight;

    // Savol raqami - ALWAYS use q + 1 for sequential numbering
    ctx.fillStyle = '#374151';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`${q + 1}.`, questionX, questionY + rowHeight / 2 + 7);

    // A, B, C, D variantlari
    const variants = ['A', 'B', 'C', 'D'];
    for (let v = 0; v < 4; v++) {
      const variantX = questionX + (v + 0.5) * variantSpacing;
      const variantY = questionY + rowHeight / 2;

      // Doira
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(variantX, variantY, circleRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Harf
      ctx.fillStyle = '#6B7280';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(variants[v], variantX, variantY + 5);
    }
  }
}

// ============================================================================
// BATCH GENERATION - Ko'p titul varaqa yaratish
// ============================================================================

export async function generateBatchTitulSheets(
  configs: TitulSheetConfig[]
): Promise<string[]> {
  const sheets: string[] = [];
  
  for (const config of configs) {
    const sheet = await generateTitulSheet(config);
    sheets.push(sheet);
  }
  
  return sheets;
}

// ============================================================================
// DOWNLOAD - Titul varaqani yuklab olish
// ============================================================================

export function downloadTitulSheet(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
}
