import { useEffect, useRef, useState, useCallback } from 'react';
import { X, RotateCw, Zap, ZapOff, CheckCircle, XCircle, ArrowLeft, Loader2, Camera } from 'lucide-react';
import api from '../lib/api';

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

// A4 aspect ratio: 210mm / 297mm
const A4_RATIO = 210 / 297;
// Auto-capture after this many consecutive detections (~2.5s stable)
const AUTO_CAPTURE_THRESHOLD = 30;

export function LiveScannerModal({ isOpen, onClose, onResult }: LiveScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const detectionCountRef = useRef(0);
  const capturingRef = useRef(false);
  const stateRef = useRef<ScanState>('scanning');

  const [state, setState] = useState<ScanState>('scanning');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [paperDetected, setPaperDetected] = useState(false);
  const [autoProgress, setAutoProgress] = useState(0);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState(0);

  // Keep stateRef in sync
  useEffect(() => { stateRef.current = state; }, [state]);

  const stopCamera = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // Capture photo and send to server
  const capturePhoto = useCallback(async () => {
    if (capturingRef.current) return;
    capturingRef.current = true;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) { capturingRef.current = false; return; }

    setState('captured');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) { capturingRef.current = false; return; }
    ctx.drawImage(video, 0, 0);

    if (navigator.vibrate) navigator.vibrate(50);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    setCapturedImage(dataUrl);
    stopCamera();

    setState('processing');
    setProcessingProgress(0);

    const progressInterval = setInterval(() => {
      setProcessingProgress((p) => (p >= 90 ? p : p + Math.random() * 20));
    }, 150);

    try {
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.95)
      );
      const file = new File([blob], `omr-scan-${Date.now()}.jpg`, { type: 'image/jpeg' });

      const formData = new FormData();
      formData.append('image', file);

      const response = await api.post('/omr/check-answers', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      clearInterval(progressInterval);
      setProcessingProgress(100);

      if (response.data.success) {
        setState('result');
        onResult(response.data, file);
      } else {
        setState('error');
        setCameraError(response.data.error || 'Skanerlashda xatolik');
      }
    } catch {
      clearInterval(progressInterval);
      setState('error');
      setCameraError('Server bilan aloqa xatosi');
    } finally {
      capturingRef.current = false;
    }
  }, [stopCamera, onResult]);

  // Calculate A4 guide rectangle
  const getGuideRect = useCallback((ow: number, oh: number) => {
    const padX = ow * 0.06;
    const padTop = oh * 0.08;
    const padBottom = oh * 0.15;
    const availW = ow - padX * 2;
    const availH = oh - padTop - padBottom;

    let gw: number, gh: number;
    if (availW / availH < A4_RATIO) {
      gw = availW;
      gh = gw / A4_RATIO;
    } else {
      gh = availH;
      gw = gh * A4_RATIO;
    }
    const gx = (ow - gw) / 2;
    const gy = padTop + (availH - gh) / 2;
    return { gx, gy, gw, gh };
  }, []);

  // Robust paper detection using edge contrast + fill + pattern analysis
  const detectPaper = useCallback(() => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay || video.videoWidth === 0) return false;

    const ctx = overlay.getContext('2d');
    if (!ctx) return false;

    overlay.width = overlay.clientWidth;
    overlay.height = overlay.clientHeight;
    const ow = overlay.width;
    const oh = overlay.height;

    // Higher res for better analysis
    const tempCanvas = document.createElement('canvas');
    const sw = 240, sh = 180;
    tempCanvas.width = sw;
    tempCanvas.height = sh;
    const tc = tempCanvas.getContext('2d');
    if (!tc) return false;
    tc.drawImage(video, 0, 0, sw, sh);
    const pixels = tc.getImageData(0, 0, sw, sh).data;

    const guide = getGuideRect(ow, oh);
    const sx1 = Math.floor((guide.gx / ow) * sw);
    const sy1 = Math.floor((guide.gy / oh) * sh);
    const sx2 = Math.floor(((guide.gx + guide.gw) / ow) * sw);
    const sy2 = Math.floor(((guide.gy + guide.gh) / oh) * sh);
    const grayAt = (x: number, y: number) => {
      if (x < 0 || x >= sw || y < 0 || y >= sh) return 0;
      const i = (y * sw + x) * 4;
      return (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    };

    // === CHECK 1: Inner brightness (paper should be white) ===
    const insetX = Math.floor((sx2 - sx1) * 0.12);
    const insetY = Math.floor((sy2 - sy1) * 0.08);
    let innerBright = 0, innerTotal = 0;
    for (let y = sy1 + insetY; y < sy2 - insetY; y += 2) {
      for (let x = sx1 + insetX; x < sx2 - insetX; x += 2) {
        innerTotal++;
        if (grayAt(x, y) > 140) innerBright++;
      }
    }
    const innerBrightRatio = innerTotal > 0 ? innerBright / innerTotal : 0;

    // === CHECK 2: Edge contrast (paper edge = bright→dark transition) ===
    const edgeInset = 3; // pixels inside guide border
    const edgeOutset = 8; // pixels outside guide border
    let edgeContrastScore = 0;
    let edgeChecks = 0;

    // Top edge
    for (let x = sx1 + 10; x < sx2 - 10; x += 6) {
      const inside = grayAt(x, sy1 + edgeInset);
      const outside = grayAt(x, sy1 - edgeOutset);
      if (inside - outside > 40) edgeContrastScore++;
      edgeChecks++;
    }
    // Bottom edge
    for (let x = sx1 + 10; x < sx2 - 10; x += 6) {
      const inside = grayAt(x, sy2 - edgeInset);
      const outside = grayAt(x, sy2 + edgeOutset);
      if (inside - outside > 40) edgeContrastScore++;
      edgeChecks++;
    }
    // Left edge
    for (let y = sy1 + 10; y < sy2 - 10; y += 6) {
      const inside = grayAt(sx1 + edgeInset, y);
      const outside = grayAt(sx1 - edgeOutset, y);
      if (inside - outside > 40) edgeContrastScore++;
      edgeChecks++;
    }
    // Right edge
    for (let y = sy1 + 10; y < sy2 - 10; y += 6) {
      const inside = grayAt(sx2 - edgeInset, y);
      const outside = grayAt(sx2 + edgeOutset, y);
      if (inside - outside > 40) edgeContrastScore++;
      edgeChecks++;
    }
    const edgeRatio = edgeChecks > 0 ? edgeContrastScore / edgeChecks : 0;

    // === CHECK 3: Grid area bubble pattern (regular dark spots) ===
    // Bubbles are in the lower 70% of the sheet
    const gridY1 = sy1 + Math.floor((sy2 - sy1) * 0.28);
    const gridY2 = sy2 - 3;
    const gridX1 = sx1 + 3;
    const gridX2 = sx2 - 3;

    // Count dark pixels in grid area and check for vertical column structure
    let darkInGrid = 0, gridSamples = 0;
    const columnDarkCounts: number[] = new Array(10).fill(0);
    for (let y = gridY1; y < gridY2; y += 2) {
      for (let x = gridX1; x < gridX2; x += 2) {
        const g = grayAt(x, y);
        gridSamples++;
        if (g < 80) {
          darkInGrid++;
          const colIdx = Math.floor(((x - gridX1) / (gridX2 - gridX1)) * 10);
          columnDarkCounts[colIdx]++;
        }
      }
    }
    const darkRatio = gridSamples > 0 ? darkInGrid / gridSamples : 0;
    // Bubbles create structured dark patterns: 5-30% dark in grid
    const hasBubblePattern = darkRatio > 0.04 && darkRatio < 0.35;
    // Check column structure: at least 3 columns with similar dark density
    const avgColDark = columnDarkCounts.reduce((a, b) => a + b, 0) / 10;
    const activeColumns = columnDarkCounts.filter(c => c > avgColDark * 0.3).length;
    const hasColumnStructure = activeColumns >= 3;

    // === CHECK 4: Header area (top 25% should have some content but mostly white) ===
    const headerY2 = sy1 + Math.floor((sy2 - sy1) * 0.25);
    let headerBright = 0, headerTotal = 0, headerDark = 0;
    for (let y = sy1 + 3; y < headerY2; y += 2) {
      for (let x = sx1 + 3; x < sx2 - 3; x += 2) {
        headerTotal++;
        const g = grayAt(x, y);
        if (g > 150) headerBright++;
        if (g < 60) headerDark++;
      }
    }
    const headerBrightRatio = headerTotal > 0 ? headerBright / headerTotal : 0;
    const headerDarkRatio = headerTotal > 0 ? headerDark / headerTotal : 0;
    // Header should be mostly white (>50%) with some dark content (QR code, text: 2-20%)
    const hasHeader = headerBrightRatio > 0.45 && headerDarkRatio > 0.01 && headerDarkRatio < 0.25;

    // === FINAL DECISION ===
    // Strict: need brightness + edge contrast + (bubbles OR header pattern)
    const detected =
      innerBrightRatio > 0.50 &&          // Paper is white enough
      edgeRatio > 0.25 &&                  // Clear edge on at least 2 sides
      (hasBubblePattern && hasColumnStructure) && // Grid area has bubble pattern
      hasHeader;                            // Header area looks right

    // --- Draw overlay ---
    ctx.clearRect(0, 0, ow, oh);
    const { gx, gy, gw, gh } = guide;

    // Darken outside guide
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, ow, gy);
    ctx.fillRect(0, gy + gh, ow, oh - gy - gh);
    ctx.fillRect(0, gy, gx, gh);
    ctx.fillRect(gx + gw, gy, ow - gx - gw, gh);

    // Guide border
    const color = detected ? '#22c55e' : 'rgba(255,255,255,0.6)';
    ctx.strokeStyle = color;
    ctx.lineWidth = detected ? 3 : 1.5;
    ctx.setLineDash(detected ? [] : [8, 6]);
    ctx.strokeRect(gx, gy, gw, gh);
    ctx.setLineDash([]);

    // Corner brackets
    const cl = Math.min(30, gw * 0.08);
    ctx.lineWidth = 4;
    ctx.strokeStyle = detected ? '#22c55e' : '#3b82f6';
    const cps = [
      [gx, gy, 1, 1], [gx + gw, gy, -1, 1],
      [gx, gy + gh, 1, -1], [gx + gw, gy + gh, -1, -1],
    ];
    for (const [cx, cy, dx, dy] of cps) {
      ctx.beginPath();
      ctx.moveTo(cx + (dx as number) * cl, cy as number);
      ctx.lineTo(cx as number, cy as number);
      ctx.lineTo(cx as number, cy + (dy as number) * cl);
      ctx.stroke();
    }

    // Auto-capture progress ring
    if (detected && detectionCountRef.current > 2) {
      const progress = Math.min(detectionCountRef.current / AUTO_CAPTURE_THRESHOLD, 1);
      const ringX = ow / 2;
      const ringY = gy + gh + (oh - gy - gh) / 2 - 5;
      const ringR = 28;

      // Background circle
      ctx.beginPath();
      ctx.arc(ringX, ringY, ringR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
      ctx.fill();

      // Progress arc
      ctx.beginPath();
      ctx.arc(ringX, ringY, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Percentage text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(progress * 100)}%`, ringX, ringY);
    }

    // Detection indicators inside guide (small icons)
    const indSize = 10;
    const indY = gy + 8;
    const indicators = [
      { ok: innerBrightRatio > 0.50, label: 'Oq' },
      { ok: edgeRatio > 0.25, label: 'Chegara' },
      { ok: hasBubblePattern && hasColumnStructure, label: 'Bubble' },
      { ok: hasHeader, label: 'Sarlavha' },
    ];
    const indStartX = gx + 8;
    ctx.font = '10px system-ui';
    ctx.textAlign = 'left';
    indicators.forEach((ind, i) => {
      const ix = indStartX + i * 62;
      ctx.fillStyle = ind.ok ? 'rgba(34,197,94,0.8)' : 'rgba(239,68,68,0.6)';
      ctx.beginPath();
      ctx.arc(ix + 5, indY + 5, indSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(ind.label, ix + 14, indY + 9);
    });

    // Status text
    const statusY = gy + gh + 16;
    ctx.font = 'bold 13px system-ui';
    ctx.textAlign = 'center';
    if (detected) {
      ctx.fillStyle = 'rgba(34, 197, 94, 0.85)';
      const tw = ctx.measureText('Avtomatik skanerlash...').width + 24;
      ctx.beginPath();
      ctx.roundRect(ow / 2 - tw / 2, statusY - 2, tw, 26, 6);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText('Avtomatik skanerlash...', ow / 2, statusY + 11);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText('Varaqni yaqinroq tutib ramkaga moslang', ow / 2, statusY + 11);
    }

    return detected;
  }, [getGuideRect]);

  // Detection loop with auto-capture
  const startDetection = useCallback(() => {
    let frameCount = 0;
    const loop = () => {
      if (!streamRef.current || stateRef.current !== 'scanning') return;
      frameCount++;
      if (frameCount % 5 === 0) {
        const detected = detectPaper();
        if (detected) {
          detectionCountRef.current++;
          setPaperDetected(true);
          setAutoProgress(Math.min(detectionCountRef.current / AUTO_CAPTURE_THRESHOLD, 1));

          // Auto-capture when threshold reached
          if (detectionCountRef.current >= AUTO_CAPTURE_THRESHOLD && !capturingRef.current) {
            capturePhoto();
            return;
          }
        } else {
          detectionCountRef.current = Math.max(0, detectionCountRef.current - 3);
          if (detectionCountRef.current === 0) {
            setPaperDetected(false);
            setAutoProgress(0);
          }
        }
      }
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
  }, [detectPaper, capturePhoto]);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      stopCamera();

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = mediaStream;

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
        startDetection();
      }
    } catch {
      setCameraError("Kameraga kirish imkoni yo'q");
    }
  }, [facingMode, stopCamera, startDetection]);

  useEffect(() => {
    if (isOpen && state === 'scanning') {
      startCamera();
    }
    return () => { if (!isOpen) stopCamera(); };
  }, [isOpen, state, startCamera, stopCamera]);

  useEffect(() => {
    if (isOpen && state === 'scanning') {
      stopCamera();
      startCamera();
    }
  }, [facingMode]);

  const toggleFlash = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    const caps = track.getCapabilities() as Record<string, unknown>;
    if (caps.torch) {
      try {
        await track.applyConstraints({ advanced: [{ torch: !flashEnabled } as never] });
        setFlashEnabled(!flashEnabled);
      } catch { /* unsupported */ }
    }
  };

  const resetToScanning = () => {
    setState('scanning');
    setCapturedImage(null);
    setCameraError(null);
    setProcessingProgress(0);
    setAutoProgress(0);
    detectionCountRef.current = 0;
    capturingRef.current = false;
    setPaperDetected(false);
  };

  const handleClose = () => {
    stopCamera();
    setState('scanning');
    setCapturedImage(null);
    setCameraError(null);
    capturingRef.current = false;
    detectionCountRef.current = 0;
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div className="relative w-full h-full flex flex-col">
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-black/80 to-transparent p-3 sm:p-4">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${
                state === 'scanning'
                  ? (paperDetected ? 'bg-green-500 animate-pulse' : 'bg-white/50')
                  : state === 'processing' ? 'bg-yellow-500 animate-pulse'
                  : state === 'result' ? 'bg-green-500' : 'bg-red-500'
              }`} />
              <span className="text-white font-semibold text-sm">
                {state === 'scanning'
                  ? (paperDetected ? `Skanerlash... ${Math.round(autoProgress * 100)}%` : 'Varaqni joylashtiring')
                  : state === 'processing' ? 'Tahlil qilinmoqda...'
                  : state === 'result' ? 'Tayyor!' : 'Xatolik'}
              </span>
            </div>
            <div className="flex gap-2">
              {state === 'scanning' && (
                <>
                  <button
                    onClick={() => setFacingMode((p) => (p === 'user' ? 'environment' : 'user'))}
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

        {/* Camera view */}
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
                      <div className="h-full bg-blue-500 rounded-full transition-all duration-200" style={{ width: `${processingProgress}%` }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {state === 'result' && capturedImage && (
            <img src={capturedImage} alt="Result" className="w-full h-full object-contain" />
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

        {/* Bottom: manual capture button (scanning state) */}
        {state === 'scanning' && !cameraError && (
          <div className="absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/70 to-transparent p-4 pb-8">
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={capturePhoto}
                className={`w-[68px] h-[68px] rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-90 ${
                  paperDetected ? 'bg-green-500 ring-4 ring-green-500/30' : 'bg-white'
                }`}
              >
                <Camera className={`h-7 w-7 ${paperDetected ? 'text-white' : 'text-gray-900'}`} />
              </button>
              <span className="text-white/50 text-[11px]">yoki qo'lda suratga oling</span>
            </div>
          </div>
        )}

        {/* Result bottom */}
        {state === 'result' && (
          <div className="absolute bottom-0 left-0 right-0 z-30 bg-black/90 backdrop-blur-md p-4 pb-6 border-t border-white/10">
            <div className="max-w-md mx-auto space-y-3">
              <div className="flex items-center justify-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-white font-semibold text-sm">Muvaffaqiyatli!</span>
              </div>
              <div className="flex gap-3">
                <button onClick={resetToScanning} className="flex-1 py-3 bg-white/10 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2">
                  <Camera className="w-4 h-4" /> Yana
                </button>
                <button onClick={handleClose} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2">
                  <ArrowLeft className="w-4 h-4" /> Natija
                </button>
              </div>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
