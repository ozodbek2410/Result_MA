import { useEffect, useRef, useState, useCallback } from 'react';
import {
  X, RotateCw, Zap, ZapOff, XCircle,
  Loader2, Camera,
} from 'lucide-react';
import api from '../lib/api';
import {
  detectCorners, estimateMissingCorner, validateCorners,
  readQR, readQRAsync,
  type CornersResult, type QRData,
} from '../lib/omr';

type ScanState = 'scanning' | 'captured' | 'processing' | 'result' | 'error';

interface ScanResult {
  success: boolean;
  detected_answers?: Record<number, string>;
  total_questions?: number;
  annotated_image?: string;
  uploaded_image?: string;
  error?: string;
  qr_found?: boolean;
  qr_code?: {
    variantCode: string;
    testId: string;
    studentId: string;
    studentName: string;
    testName: string;
  };
  comparison?: {
    correct: number;
    incorrect: number;
    unanswered: number;
    total: number;
    score: number;
    warning?: string;
    details: Array<{
      question: number;
      student_answer: string | null;
      correct_answer: string;
      is_correct: boolean;
    }>;
  };
}

interface LiveScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResult: (result: ScanResult, file: File) => void;
}

// ---- Constants ----
const A4_RATIO = 297 / 210;
const FRAME_W_RATIO = 0.88;
const ANALYSIS_W = 480;
const STABLE_FRAMES_NEEDED = 10; // ~2s — barcha telefonlarda ishonchli capture
// Sharpness threshold ishlatilmaydi (QR o'qilishi natural blur filter):
// xira rasmda QR detect bo'lmaydi → auto-capture trigger bo'lmaydi.

export function LiveScannerModal({ isOpen, onClose, onResult }: LiveScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // High-res QR canvas — alohida, faqat QR detection uchun (full video resolution)
  // Bu past sifatli kamera/uzoq turgan telefon holatida QR'ni topadi.
  // 480px analysis canvas dan ajralgan, qolgan logika tegmaydi.
  const qrHighResCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const qrAttemptingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef(0);
  const capturingRef = useRef(false);
  const stateRef = useRef<ScanState>('scanning');

  // Corner detection state (refs for animation loop)
  const cornersRef = useRef<CornersResult | null>(null);
  const stableCountRef = useRef(0);
  const qrDataRef = useRef<QRData | null>(null);
  const savedOverlaySizeRef = useRef<{ w: number; h: number } | null>(null);

  const [state, setState] = useState<ScanState>('scanning');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [cornerCount, setCornerCount] = useState(0);
  const [qrFound, setQrFound] = useState(false);
  const [, setQrStudentName] = useState<string | null>(null);
  const [autoProgress, setAutoProgress] = useState(0);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState(0);

  useEffect(() => { stateRef.current = state; }, [state]);

  const getTempCanvas = useCallback(() => {
    if (!tempCanvasRef.current) tempCanvasRef.current = document.createElement('canvas');
    return tempCanvasRef.current;
  }, []);

  // High-res QR canvas — har frame qayta yaratmaslik uchun cached
  const getQrHighResCanvas = useCallback(() => {
    if (!qrHighResCanvasRef.current) qrHighResCanvasRef.current = document.createElement('canvas');
    return qrHighResCanvasRef.current;
  }, []);

  // Sharpness check kerak emas — QR o'qilishi natural blur reject:
  // xira rasmda QR finder pattern xira → BarcodeDetector/jsQR/pyzbar topa olmaydi
  // → auto-capture trigger bo'lmaydi (qrDataRef.current shart)
  // Foydalanuvchi avtomatik ravishda fokus topishga majbur bo'ladi.

  const stopCamera = useCallback(() => {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = 0; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  }, []);

  // Guide frame rectangle
  const getFrame = useCallback((ow: number, oh: number) => {
    let fw = ow * FRAME_W_RATIO;
    let fh = fw * A4_RATIO;
    if (fh > oh * 0.72) { fh = oh * 0.72; fw = fh / A4_RATIO; }
    return { fx: (ow - fw) / 2, fy: (oh - fh) / 2, fw, fh };
  }, []);


  // ---- CAPTURE: TO'LIQ video frame — crop/warp QILMASLIK ----
  // Server o'zi corner topib perspective correction qiladi
  const capturePhoto = useCallback(async () => {
    if (capturingRef.current) return;
    capturingRef.current = true;
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas) { capturingRef.current = false; return; }

    const vidW = video.videoWidth, vidH = video.videoHeight;

    // TO'LIQ video frame — hech narsa kesilmaydi
    canvas.width = vidW;
    canvas.height = vidH;
    const ctx = canvas.getContext('2d');
    if (!ctx) { capturingRef.current = false; return; }
    ctx.drawImage(video, 0, 0, vidW, vidH);

    if (navigator.vibrate) navigator.vibrate(50);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedImage(dataUrl);

    setState('captured');
    // Overlay o'lchamlarini SAQLASH — stopCamera() overlay ni o'chiradi
    if (overlayRef.current) {
      savedOverlaySizeRef.current = {
        w: overlayRef.current.clientWidth,
        h: overlayRef.current.clientHeight,
      };
    }
    stopCamera();
    setState('processing');
    setProcessingProgress(0);

    const progressInterval = setInterval(() => {
      setProcessingProgress(p => p >= 90 ? p : p + Math.random() * 15);
    }, 200);

    try {
      // ===== ON-DEVICE SCANNING — server kerak emas =====
      const cc = cornersRef.current;
      if (cc && cc.count >= 3) {
        // Corner coords: analysis canvas → video pixel
        const vw = video.videoWidth, vh = video.videoHeight;
        const ow = savedOverlaySizeRef.current?.w || vw;
        const oh = savedOverlaySizeRef.current?.h || vh;
        const vAsp = vw / vh, sAsp = ow / oh;
        let cropX: number, cropW: number, cropY: number, cropH: number;
        if (vAsp > sAsp) {
          cropH = vh; cropW = vh * sAsp; cropX = (vw - cropW) / 2; cropY = 0;
        } else {
          cropW = vw; cropH = vw / sAsp; cropX = 0; cropY = (vh - cropH) / 2;
        }
        const ah = Math.round(ANALYSIS_W * oh / ow);
        const sx = cropW / ANALYSIS_W;
        const sy = cropH / ah;

        const videoCorners = {
          tl: { ...cc.tl, x: cc.tl.x * sx + cropX, y: cc.tl.y * sy + cropY },
          tr: { ...cc.tr, x: cc.tr.x * sx + cropX, y: cc.tr.y * sy + cropY },
          bl: { ...cc.bl, x: cc.bl.x * sx + cropX, y: cc.bl.y * sy + cropY },
          br: { ...cc.br, x: cc.br.x * sx + cropX, y: cc.br.y * sy + cropY },
        };

        // On-device scan
        const { scanOnDevice } = await import('../lib/omr/clientScanner');
        const scanResult = scanOnDevice(canvas, videoCorners, qrDataRef.current);

        clearInterval(progressInterval);
        setProcessingProgress(100);

        // Client scan muvaffaqiyatli VA yetarli javob topilgan VA QR topilgan bo'lsa
        // Agar answered < 10% → iPhone HDR / ko'k qalam muammosi → server fallback
        // Agar QR topilmagan → server fallback (server pyzbar QR ancha kuchli)
        const answeredPct = scanResult.stats.total > 0
          ? scanResult.stats.answered / scanResult.stats.total
          : 0;
        const qrFound = scanResult.qrCode.found && !!scanResult.qrCode.variantCode;

        if (scanResult.success && answeredPct >= 0.10 && qrFound) {
          // Yetarli javob topildi — client natijasini ishlatish
          const blob = await new Promise<Blob>(resolve =>
            canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.92),
          );
          const file = new File([blob], `omr-scan-${Date.now()}.jpg`, { type: 'image/jpeg' });

          // Server format ga moslashtirish (OMRCheckerPage kutgan format)
          const serverFormat = {
            success: true,
            detected_answers: scanResult.detectedAnswers,
            stats: scanResult.stats,
            qr_code: scanResult.qrCode.found ? {
              found: true,
              variant_code: scanResult.qrCode.variantCode,
              total_questions: scanResult.qrCode.totalQuestions,
            } : { found: false },
            detection_rate: scanResult.stats.detectionRate,
            warnings: scanResult.warnings,
            _clientProcessed: true,
            _processingTimeMs: scanResult.stats.processingTimeMs,
          };

          // Server ga QR variant orqali comparison olish (DB lookup)
          if (scanResult.qrCode.found && scanResult.qrCode.variantCode) {
            try {
              const resp = await api.post('/omr/lookup-variant', {
                variantCode: scanResult.qrCode.variantCode,
                detectedAnswers: scanResult.detectedAnswers,
                totalQuestions: scanResult.stats.total,
              });
              if (resp.data?.comparison) {
                Object.assign(serverFormat, resp.data);
              }
            } catch {
              // DB lookup xatosi — natija hali ham ko'rsatiladi
            }
          }

          onResult(serverFormat as never, file);
          setState('scanning');
          setCapturedImage(null);
          capturingRef.current = false;
          stableCountRef.current = 0;
          onClose();
          return;
        } else {
          // Client scan xato/answered < 10%/QR yo'q — server fallback
          // Server pyzbar QR detection client'dan ancha kuchli — past sifatli rasmda
          // QR topilishi mumkin
          const reason = !scanResult.success
            ? `error: ${scanResult.error}`
            : !qrFound
              ? 'QR not found client-side'
              : `answered ${Math.round(answeredPct * 100)}%`;
          console.warn('[OMR] Client scan insufficient, falling back to server:', reason);
        }
      }

      // ===== SERVER FALLBACK — client scan ishlamasa =====
      const blob = await new Promise<Blob>(resolve =>
        canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.92),
      );
      const file = new File([blob], `omr-scan-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const formData = new FormData();
      formData.append('image', file);

      const response = await api.post('/omr/scan-v2', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      clearInterval(progressInterval);
      setProcessingProgress(100);
      if (response.data.success) {
        onResult(response.data, file);
        setState('scanning');
        setCapturedImage(null);
        capturingRef.current = false;
        stableCountRef.current = 0;
        onClose();
        return;
      } else {
        setState('error');
        setCameraError(response.data.error || 'Skanerlashda xatolik');
      }
    } catch {
      clearInterval(progressInterval);
      setState('error');
      setCameraError('Skanerlashda xatolik');
    } finally {
      capturingRef.current = false;
    }
  }, [stopCamera, onResult, onClose]);

  // ---- DETECTION: corner marks + QR ----
  const detectFrame = useCallback(() => {
    const video = videoRef.current, overlay = overlayRef.current;
    if (!video || !overlay || video.videoWidth === 0) return;

    const ow = overlay.clientWidth, oh = overlay.clientHeight;
    overlay.width = ow; overlay.height = oh;
    const ctx = overlay.getContext('2d')!;
    const { fx, fy, fw, fh } = getFrame(ow, oh);

    // Draw video to analysis canvas (object-cover crop)
    const vw = video.videoWidth, vh = video.videoHeight;
    const vAsp = vw / vh, sAsp = ow / oh;
    let cropX: number, cropY: number, cropW: number, cropH: number;
    if (vAsp > sAsp) {
      cropH = vh; cropW = vh * sAsp; cropX = (vw - cropW) / 2; cropY = 0;
    } else {
      cropW = vw; cropH = vw / sAsp; cropX = 0; cropY = (vh - cropH) / 2;
    }

    const ah = Math.round(ANALYSIS_W * oh / ow);
    const tc = getTempCanvas();
    tc.width = ANALYSIS_W; tc.height = ah;
    const tctx = tc.getContext('2d', { willReadFrequently: true })!;
    tctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, ANALYSIS_W, ah);

    // Frame area in analysis coords
    const afx = fx / ow * ANALYSIS_W;
    const afy = fy / oh * ah;
    const afw = fw / ow * ANALYSIS_W;
    const afh = fh / oh * ah;

    // Get ONLY the guide frame region for corner detection
    // This ensures we only find marks ON THE PAPER, not on the table/background
    const clipX = Math.max(0, Math.round(afx));
    const clipY = Math.max(0, Math.round(afy));
    const clipW = Math.min(ANALYSIS_W - clipX, Math.round(afw));
    const clipH = Math.min(ah - clipY, Math.round(afh));
    const frameImageData = tctx.getImageData(clipX, clipY, clipW, clipH);

    // Detect corner marks (searches at frame corners only)
    let corners = detectCorners(frameImageData);

    // If 3 corners found, estimate the 4th
    if (corners.count === 3) {
      corners = estimateMissingCorner(corners);
    }

    // Validate corners — 3/4 yetarli (4-chisi estimated)
    // EvalBee ham 3 ta topsa qolgan 1 tani hisoblaydi
    const valid = corners.count >= 3 && validateCorners(corners,
      Math.round(afw * 1.1), Math.round(afh * 1.1));

    // Store corners in ref (remap to full analysis coords for capture)
    if (valid && corners.tl && corners.tr && corners.bl && corners.br) {
      cornersRef.current = {
        ...corners,
        tl: { ...corners.tl, x: corners.tl.x + clipX, y: corners.tl.y + clipY },
        tr: { ...corners.tr, x: corners.tr.x + clipX, y: corners.tr.y + clipY },
        bl: { ...corners.bl, x: corners.bl.x + clipX, y: corners.bl.y + clipY },
        br: { ...corners.br, x: corners.br.x + clipX, y: corners.br.y + clipY },
      };
    }

    // QR detection — 3 bosqichli strategiya, qaysi birinchi topsa shu g'olib
    //
    // Bosqich 1: Sync jsQR 480px canvas'da (tezkor, kichik)
    //   → Yaqin va yaxshi sifatli QR uchun ishlaydi (~10-50ms)
    //
    // Bosqich 2: Async BarcodeDetector 480px canvas'da (background)
    //   → Native OS detector, jsQR'dan ko'ra robastroq (~10-30ms)
    //
    // Bosqich 3: Async BarcodeDetector FULL-RESOLUTION top-right region
    //   → Past sifatli/uzoq turgan/xira kamera holatlari uchun
    //   → 480px da QR ~72px bo'lsa, full-res da ~300-500px (10x katta)
    //   → Bu bosqich qimmat (~50-100ms), shuning uchun parallel qaytarib ishga
    //     tushirilmaydi (qrAttemptingRef bilan kontrol)
    if (!qrDataRef.current) {
      // Bosqich 1: Sync jsQR
      const sync = readQR(tctx.getImageData(0, 0, ANALYSIS_W, ah));
      if (sync) {
        qrDataRef.current = sync;
        setQrFound(true);
      } else {
        // Bosqich 2: Async native detector — 480px canvas'da
        void readQRAsync(tc).then((qr) => {
          if (qr && !qrDataRef.current) {
            qrDataRef.current = qr;
            setQrFound(true);
          }
        }).catch(() => { /* ignore */ });

        // Bosqich 3: Full-resolution top-right region scan
        // Faqat oldingi attempt tugagandan keyin yangisini boshlaymiz
        // (parallel ko'p attempts tezlik berishmaydi va memory yeydi)
        if (!qrAttemptingRef.current) {
          qrAttemptingRef.current = true;
          try {
            // QR varaqning top-right zonasida joylashgan
            // Frame'ni A4 ratio bilan video coords'ga aylantiramiz
            // (overlay coords → video coords)
            const fullVw = vw, fullVh = vh;
            const vToOverlayScaleX = cropW / ow;
            const vToOverlayScaleY = cropH / oh;

            // Sheet frame video coords'da (cropped frame ichida)
            const sheetVx = cropX + fx * vToOverlayScaleX;
            const sheetVy = cropY + fy * vToOverlayScaleY;
            const sheetVw = fw * vToOverlayScaleX;
            const sheetVh = fh * vToOverlayScaleY;

            // QR area: sheet'ning top-right ~33% × 22%
            // (qrReader.ts da readQRFromRegionAsync bilan bir xil ratio)
            const qrVx = Math.max(0, Math.floor(sheetVx + sheetVw * 0.62));
            const qrVy = Math.max(0, Math.floor(sheetVy + sheetVh * 0.02));
            const qrVw = Math.min(fullVw - qrVx, Math.floor(sheetVw * 0.36));
            const qrVh = Math.min(fullVh - qrVy, Math.floor(sheetVh * 0.22));

            if (qrVw > 50 && qrVh > 50) {
              const qrCanvas = getQrHighResCanvas();
              qrCanvas.width = qrVw;
              qrCanvas.height = qrVh;
              const qctx = qrCanvas.getContext('2d', { willReadFrequently: true });
              if (qctx) {
                qctx.drawImage(video, qrVx, qrVy, qrVw, qrVh, 0, 0, qrVw, qrVh);
                // Native detector full-res da
                void readQRAsync(qrCanvas).then((qr) => {
                  qrAttemptingRef.current = false;
                  if (qr && !qrDataRef.current) {
                    qrDataRef.current = qr;
                    setQrFound(true);
                  }
                }).catch(() => {
                  qrAttemptingRef.current = false;
                });
              } else {
                qrAttemptingRef.current = false;
              }
            } else {
              qrAttemptingRef.current = false;
            }
          } catch {
            qrAttemptingRef.current = false;
          }
        }
      }
    }

    // Update stable count
    if (valid) {
      stableCountRef.current++;
    } else {
      stableCountRef.current = Math.max(0, stableCountRef.current - 1);
    }

    setCornerCount(corners.count);
    setAutoProgress(Math.min(stableCountRef.current / STABLE_FRAMES_NEEDED, 1));

    // Auto-capture — 3 ta shart bir vaqtda bajarilishi kerak:
    // 1. valid: 4 corner topilgan (yoki 3+1 estimated) va to'g'ri to'rtburchak
    // 2. stable: STABLE_FRAMES_NEEDED davomida turg'un (~2s)
    // 3. QR topilgan — bu eng muhimi! QR yo'q bo'lsa kapture qilish ma'nosiz
    //    (student aniqlanmaydi). QR topilishi rasm SHARP ekanligini ham tasdiqlaydi
    //    (xira rasmda QR o'qilmaydi → avtomatik blur reject ham bo'ladi)
    if (
      valid &&
      stableCountRef.current >= STABLE_FRAMES_NEEDED &&
      qrDataRef.current &&
      !capturingRef.current
    ) {
      capturePhoto();
      return;
    }

    // ======== DRAW OVERLAY ========
    ctx.clearRect(0, 0, ow, oh);

    // Dark background with frame cutout
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, ow, oh);
    ctx.clearRect(fx, fy, fw, fh);

    const allGood = valid && corners.count >= 3;
    // Subtle frame border — only when NOT all found (helps alignment)
    if (!allGood) {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(fx, fy, fw, fh);
      ctx.setLineDash([]);
    }

    // 4 corner brackets — EvalBee style
    // Corner marklar A4 chetidan 7mm ichkarida (corner_margin + corner_mark/2)
    // Frame = A4 chegarasi, brackets = corner mark joylari (7/210 = 3.3% inset)
    const insetX = fw * 0.033; // 7mm / 210mm
    const insetY = fh * 0.024; // 7mm / 297mm
    const bracketLen = Math.max(50, fw * 0.15);
    const bracketW = 5;

    // Aniqlangan corner pozitsiyalarni clip → overlay coords ga aylantirish.
    // detectCorners clip space (frameImageData) ichida ishlaydi.
    // Overlay screen coords:
    //   overlay_x = (clip_x + clipX) * (ow / ANALYSIS_W) — analysis va overlay nisbati
    // ANALYSIS_W → ow → bir xil masshtab (ah → oh)
    const analysisToOverlayX = ow / ANALYSIS_W;
    const analysisToOverlayY = oh / ah;
    const toOverlayX = (clipLocalX: number) => (clipLocalX + clipX) * analysisToOverlayX;
    const toOverlayY = (clipLocalY: number) => (clipLocalY + clipY) * analysisToOverlayY;

    const bracketCorners = [
      // bracket = fixed expected pozitsiya (foydalanuvchi yo'naltirish uchun)
      // detected = aniqlangan real markaz (yashil dot + qora kvadrat shu yerda)
      {
        bracketX: fx + insetX, bracketY: fy + insetY,
        detectedX: corners.tl.found ? toOverlayX(corners.tl.x) : fx + insetX,
        detectedY: corners.tl.found ? toOverlayY(corners.tl.y) : fy + insetY,
        dx: 1, dy: 1, found: corners.tl.found,
      },
      {
        bracketX: fx + fw - insetX, bracketY: fy + insetY,
        detectedX: corners.tr.found ? toOverlayX(corners.tr.x) : fx + fw - insetX,
        detectedY: corners.tr.found ? toOverlayY(corners.tr.y) : fy + insetY,
        dx: -1, dy: 1, found: corners.tr.found,
      },
      {
        bracketX: fx + insetX, bracketY: fy + fh - insetY,
        detectedX: corners.bl.found ? toOverlayX(corners.bl.x) : fx + insetX,
        detectedY: corners.bl.found ? toOverlayY(corners.bl.y) : fy + fh - insetY,
        dx: 1, dy: -1, found: corners.bl.found,
      },
      {
        bracketX: fx + fw - insetX, bracketY: fy + fh - insetY,
        detectedX: corners.br.found ? toOverlayX(corners.br.x) : fx + fw - insetX,
        detectedY: corners.br.found ? toOverlayY(corners.br.y) : fy + fh - insetY,
        dx: -1, dy: -1, found: corners.br.found,
      },
    ];

    // Mark size in overlay pixels (corner_mark = 10mm, A4 = 210mm)
    const markPx = (10 / 210) * fw;

    for (const bc of bracketCorners) {
      const found = bc.found;

      // Bracket fon glow (faqat topilmaganda) — ko'k zona, qaerda izlanayotganini ko'rsatadi
      if (!found) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
        const gs = bracketLen * 1.3;
        ctx.fillRect(
          bc.dx > 0 ? bc.bracketX - 5 : bc.bracketX - gs + 5,
          bc.dy > 0 ? bc.bracketY - 5 : bc.bracketY - gs + 5,
          gs, gs
        );
      }

      // Bracket chiziqlari — fixed pozitsiyada (foydalanuvchi yo'naltirish)
      ctx.strokeStyle = found ? '#22c55e' : '#3b82f6';
      ctx.lineWidth = found ? bracketW + 2 : bracketW;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bc.bracketX + bc.dx * bracketLen, bc.bracketY);
      ctx.lineTo(bc.bracketX, bc.bracketY);
      ctx.lineTo(bc.bracketX, bc.bracketY + bc.dy * bracketLen);
      ctx.stroke();

      // Topilganda — EvalBee style: aniqlangan markazda QORA kvadrat + yashil dot
      // Bu telefon qaysi telefondan qattiy bo'lmasin, qora marker markazida turadi
      if (found) {
        // 1. Yashil to'ldirilgan kvadrat (10mm marker o'lchamida) — aniq markazda
        ctx.fillStyle = 'rgba(34, 197, 94, 0.85)';
        ctx.fillRect(
          bc.detectedX - markPx / 2,
          bc.detectedY - markPx / 2,
          markPx,
          markPx,
        );

        // 2. Yashil dot — sub-pixel markaz (centroid bilan hisoblangan)
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(bc.detectedX, bc.detectedY, 4, 0, Math.PI * 2);
        ctx.fill();

        // 3. Qora chiziq markazga (cross-hair) — markaz aniqligi belgisi
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bc.detectedX - 6, bc.detectedY);
        ctx.lineTo(bc.detectedX + 6, bc.detectedY);
        ctx.moveTo(bc.detectedX, bc.detectedY - 6);
        ctx.lineTo(bc.detectedX, bc.detectedY + 6);
        ctx.stroke();
      }
    }

    // When all 4 found — green border around detected paper
    if (allGood) {
      ctx.strokeStyle = 'rgba(34,197,94,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(fx, fy, fw, fh);
    }

    // Progress ring
    if (stableCountRef.current > 1) {
      const progress = Math.min(stableCountRef.current / STABLE_FRAMES_NEEDED, 1);
      const rx = ow / 2;
      const ry = Math.min(fy + fh + 35, oh - 90);
      const rr = 26;
      ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill();
      ctx.beginPath();
      ctx.arc(rx, ry, rr - 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(progress * 100)}%`, rx, ry);
    }

    // Marker count indicators (dots)
    const dotY = Math.min(fy + fh + 70, oh - 55);
    const dotSpacing = 16;
    const dotStartX = ow / 2 - (3 * dotSpacing) / 2;
    for (let i = 0; i < 4; i++) {
      const dx = dotStartX + i * dotSpacing;
      ctx.beginPath(); ctx.arc(dx, dotY, 5, 0, Math.PI * 2);
      ctx.fillStyle = i < corners.count ? '#22c55e' : 'rgba(255,255,255,0.3)';
      ctx.fill();
    }

    // QR indicator
    if (qrDataRef.current) {
      ctx.fillStyle = 'rgba(34,197,94,0.85)';
      const qrLabelW = 160;
      ctx.beginPath(); ctx.roundRect(ow / 2 - qrLabelW / 2, fy + 8, qrLabelW, 22, 4); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px system-ui';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const label = qrDataRef.current.variantCode;
      ctx.fillText(`QR: ${label}`, ow / 2, fy + 19);
    }

    // Status label — katta, aniq, yo'nalishli hint
    const labelY = fy - 20;
    if (labelY > 30) {
      ctx.textAlign = 'center';
      if (allGood) {
        // 4 corner topilgan — endi QR ham kerak
        const qrReady = !!qrDataRef.current;
        if (qrReady) {
          // Yashil pill — "Qimirlamang..." (auto-capture sanog'i ketmoqda)
          ctx.fillStyle = 'rgba(34,197,94,0.9)';
          ctx.beginPath(); ctx.roundRect(ow / 2 - 85, labelY - 14, 170, 30, 8); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = 'bold 14px system-ui';
          ctx.fillText('Qimirlamang...', ow / 2, labelY + 2);
        } else {
          // 4 corner OK lekin QR yo'q — sariq pill, fokus haqida xabar
          // Bu xira rasm holatida ham triggerlanadi (xira QR o'qilmaydi)
          ctx.fillStyle = 'rgba(245,158,11,0.92)';
          ctx.beginPath(); ctx.roundRect(ow / 2 - 110, labelY - 14, 220, 30, 8); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = 'bold 13px system-ui';
          ctx.fillText('QR kutilyapti — fokus toping', ow / 2, labelY + 2);
        }
      } else {
        // Yo'nalishli hint — qaysi tomonga siljitish kerak
        const tl = corners.tl.found, tr = corners.tr.found;
        const bl = corners.bl.found, br = corners.br.found;
        let hint: string;
        let arrow = '';

        if (corners.count === 0) {
          hint = 'Varoqni ramkaga joylashtiring';
        } else if (!tl && !tr && (bl || br)) {
          hint = 'Tepaga suring'; arrow = '\u2191';
        } else if (!bl && !br && (tl || tr)) {
          hint = 'Pastga suring'; arrow = '\u2193';
        } else if (!tl && !bl && (tr || br)) {
          hint = 'Chapga suring'; arrow = '\u2190';
        } else if (!tr && !br && (tl || bl)) {
          hint = 'O\'ngga suring'; arrow = '\u2192';
        } else if (corners.count === 3) {
          const missing = !tl ? 'chap-tepa' : !tr ? 'o\'ng-tepa' : !bl ? 'chap-past' : 'o\'ng-past';
          hint = `${missing} burchakni moslang`;
        } else if (!valid) {
          hint = 'Varoqni tekisroq tuting';
        } else {
          hint = `${corners.count}/4 — to'g'rilang`;
        }

        // Qora fon pill
        const hintText = arrow ? `${arrow}  ${hint}` : hint;
        const tw = ctx.measureText ? 200 : 200;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.beginPath(); ctx.roundRect(ow / 2 - tw / 2, labelY - 14, tw, 30, 8); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 13px system-ui';
        ctx.fillText(hintText, ow / 2, labelY + 2);
      }
    }

    // Yoqmagan burchaklarga pulsing indicator (bracket pozitsiyada — yo'naltirish)
    if (!allGood && corners.count > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
      for (const bc of bracketCorners) {
        if (!bc.found) {
          ctx.fillStyle = `rgba(239, 68, 68, ${0.3 + 0.3 * pulse})`;
          ctx.beginPath();
          ctx.arc(bc.bracketX, bc.bracketY, 12, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }, [getFrame, getTempCanvas, capturePhoto]);

  // Detection loop
  const startDetection = useCallback(() => {
    let frameCount = 0;
    const loop = () => {
      if (!streamRef.current || stateRef.current !== 'scanning') return;
      frameCount++;
      if (frameCount % 5 === 0) {
        detectFrame();
      }
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
  }, [detectFrame]);

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        startDetection();
      }
    } catch {
      setCameraError("Kameraga kirish imkoni yo'q");
    }
  }, [facingMode, stopCamera, startDetection]);

  useEffect(() => {
    if (isOpen && state === 'scanning') startCamera();
    return () => { if (!isOpen) stopCamera(); };
  }, [isOpen, state, startCamera, stopCamera]);

  useEffect(() => {
    if (isOpen && state === 'scanning') { stopCamera(); startCamera(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  const toggleFlash = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    const caps = track.getCapabilities() as Record<string, unknown>;
    if (caps.torch) {
      try {
        await track.applyConstraints({ advanced: [{ torch: !flashEnabled } as never] });
        setFlashEnabled(!flashEnabled);
      } catch { /* not supported */ }
    }
  };

  const resetToScanning = () => {
    setState('scanning'); setCapturedImage(null); setCameraError(null);
    setProcessingProgress(0); setAutoProgress(0); setCornerCount(0);
    stableCountRef.current = 0; capturingRef.current = false;
    cornersRef.current = null; qrDataRef.current = null;
    qrAttemptingRef.current = false;
    setQrFound(false); setQrStudentName(null);
  };

  const handleClose = () => {
    stopCamera(); setState('scanning'); setCapturedImage(null); setCameraError(null);
    capturingRef.current = false; stableCountRef.current = 0;
    cornersRef.current = null; qrDataRef.current = null;
    qrAttemptingRef.current = false;
    onClose();
  };

  if (!isOpen) return null;

  const isReady = cornerCount >= 3;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div className="relative w-full h-full flex flex-col">
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-black/70 to-transparent p-3 sm:p-4">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${
                state === 'scanning'
                  ? (isReady ? 'bg-green-500 animate-pulse' : cornerCount > 0 ? 'bg-yellow-500' : 'bg-white/50')
                  : state === 'processing' ? 'bg-yellow-500 animate-pulse'
                  : 'bg-red-500'
              }`} />
              <span className="text-white font-semibold text-sm">
                {state === 'scanning'
                  ? (isReady
                    ? `Skanerlash... ${Math.round(autoProgress * 100)}%`
                    : `${cornerCount}/4 marker${qrFound ? ' | QR ✓' : ''}`)
                  : state === 'processing' ? 'Tahlil qilinmoqda...'
                  : 'Xatolik'}
              </span>
              {/* Version badge — yangi build yuklanganini tekshirish uchun.
                  v4 = QR-required auto-capture (xira reject) */}
              <span className="text-white/70 text-[10px] font-mono ml-1">
                v4
              </span>
            </div>
            <div className="flex gap-2">
              {state === 'scanning' && (
                <>
                  <button
                    onClick={() => setFacingMode(p => p === 'user' ? 'environment' : 'user')}
                    className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white"
                  >
                    <RotateCw className="h-4 w-4" />
                  </button>
                  <button
                    onClick={toggleFlash}
                    className={`w-9 h-9 rounded-full backdrop-blur-sm flex items-center justify-center ${
                      flashEnabled ? 'bg-yellow-500/80 text-white' : 'bg-white/20 text-white'
                    }`}
                  >
                    {flashEnabled ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
                  </button>
                </>
              )}
              <button
                onClick={handleClose}
                className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Camera + overlay */}
        <div className="flex-1 flex items-center justify-center bg-black relative">
          {state === 'scanning' && !cameraError && (
            <>
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
            </>
          )}

          {(state === 'captured' || state === 'processing') && capturedImage && (
            <div className="relative w-full h-full">
              <img src={capturedImage} alt="Captured" className="w-full h-full object-contain" />
              {state === 'processing' && (
                <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-4">
                  <Loader2 className="w-12 h-12 text-white animate-spin" />
                  <div className="w-48">
                    <div className="flex justify-between mb-1">
                      <span className="text-white text-xs">Tahlil qilinmoqda</span>
                      <span className="text-white text-xs font-bold">{Math.round(processingProgress)}%</span>
                    </div>
                    <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-200"
                        style={{ width: `${processingProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {(state === 'error' || (cameraError && state !== 'scanning')) && (
            <div className="text-center p-6">
              <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <p className="text-white text-sm mb-4">{cameraError}</p>
              <div className="flex gap-3 justify-center">
                <button onClick={resetToScanning} className="px-6 py-2.5 bg-white text-gray-900 rounded-xl font-semibold text-sm">
                  Qayta urinish
                </button>
                <button onClick={handleClose} className="px-6 py-2.5 bg-white/20 text-white rounded-xl font-semibold text-sm">
                  Yopish
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom controls */}
        {state === 'scanning' && !cameraError && (
          <div className="absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/70 to-transparent p-4 pb-8">
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={capturePhoto}
                className={`w-[68px] h-[68px] rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-90 ${
                  isReady ? 'bg-green-500 ring-4 ring-green-500/30' : 'bg-white'
                }`}
              >
                <Camera className={`h-7 w-7 ${isReady ? 'text-white' : 'text-gray-900'}`} />
              </button>
              <span className="text-white/50 text-[11px]">
                {isReady ? 'Qimirlamang...' : "yoki qo'lda suratga oling"}
              </span>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
