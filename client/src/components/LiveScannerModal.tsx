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

// A4 paper proportions & mark positions
const A4_RATIO = 297 / 210;
// Mark center = 4.5mm from edge (2mm offset + 2.5mm half of 5mm)
const MARK_RX = 4.5 / 210;
const MARK_RY = 4.5 / 297;
// Guide frame = 80% of screen width
const FRAME_W_RATIO = 0.80;
// Detection
const DARK_TH = 100;
const MARK_DARK_MIN = 0.35;
const AUTO_TH = 22;
const ANALYSIS_W = 480;

export function LiveScannerModal({ isOpen, onClose, onResult }: LiveScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef(0);
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
  const [markStatus, setMarkStatus] = useState([false, false, false, false]);

  useEffect(() => { stateRef.current = state; }, [state]);

  const stopCamera = useCallback(() => {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = 0; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  }, []);

  const capturePhoto = useCallback(async () => {
    if (capturingRef.current) return;
    capturingRef.current = true;
    const video = videoRef.current, canvas = canvasRef.current;
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
      setProcessingProgress(p => p >= 90 ? p : p + Math.random() * 20);
    }, 150);

    try {
      const blob = await new Promise<Blob>(resolve =>
        canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.95)
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

  // Guide frame & 4 target positions on screen
  const getFrameAndTargets = useCallback((ow: number, oh: number) => {
    let fw = ow * FRAME_W_RATIO;
    let fh = fw * A4_RATIO;
    if (fh > oh * 0.78) { fh = oh * 0.78; fw = fh / A4_RATIO; }
    const fx = (ow - fw) / 2;
    const fy = (oh - fh) / 2;
    return {
      fx, fy, fw, fh,
      targets: [
        { x: fx + fw * MARK_RX, y: fy + fh * MARK_RY },
        { x: fx + fw * (1 - MARK_RX), y: fy + fh * MARK_RY },
        { x: fx + fw * MARK_RX, y: fy + fh * (1 - MARK_RY) },
        { x: fx + fw * (1 - MARK_RX), y: fy + fh * (1 - MARK_RY) },
      ],
    };
  }, []);

  // Sliding window search near a target position
  const checkMarkAt = useCallback((
    pixels: Uint8ClampedArray, aw: number, ah: number,
    ax: number, ay: number, markSize: number,
  ): boolean => {
    const searchR = Math.round(markSize * 1.5);
    const markR = Math.round(markSize * 0.45);
    const markArea = (2 * markR + 1) ** 2;

    for (let sy = -searchR; sy <= searchR; sy += 2) {
      for (let sx = -searchR; sx <= searchR; sx += 2) {
        let dark = 0;
        const cx = Math.round(ax + sx), cy = Math.round(ay + sy);
        for (let dy = -markR; dy <= markR; dy++) {
          for (let dx = -markR; dx <= markR; dx++) {
            const px = cx + dx, py = cy + dy;
            if (px < 0 || py < 0 || px >= aw || py >= ah) continue;
            const i = (py * aw + px) * 4;
            if (pixels[i] + pixels[i + 1] + pixels[i + 2] < DARK_TH * 3) dark++;
          }
        }
        if (dark / markArea >= MARK_DARK_MIN) return true;
      }
    }
    return false;
  }, []);

  const detectPaper = useCallback(() => {
    const video = videoRef.current, overlay = overlayRef.current;
    if (!video || !overlay || video.videoWidth === 0) return false;

    const ow = overlay.clientWidth, oh = overlay.clientHeight;
    overlay.width = ow; overlay.height = oh;
    const ctx = overlay.getContext('2d')!;
    const { fx, fy, fw, fh, targets } = getFrameAndTargets(ow, oh);

    // Draw visible portion of video (object-cover crop) to analysis canvas
    const vw = video.videoWidth, vh = video.videoHeight;
    const vAsp = vw / vh, sAsp = ow / oh;
    let cropX: number, cropY: number, cropW: number, cropH: number;
    if (vAsp > sAsp) {
      cropH = vh; cropW = vh * sAsp; cropX = (vw - cropW) / 2; cropY = 0;
    } else {
      cropW = vw; cropH = vw / sAsp; cropX = 0; cropY = (vh - cropH) / 2;
    }

    const ah = Math.round(ANALYSIS_W * oh / ow);
    const tc = tempCanvasRef.current;
    tc.width = ANALYSIS_W; tc.height = ah;
    const tctx = tc.getContext('2d')!;
    tctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, ANALYSIS_W, ah);
    const pixels = tctx.getImageData(0, 0, ANALYSIS_W, ah).data;

    // Mark size in analysis pixels
    const fwA = (fw / ow) * ANALYSIS_W;
    const markSize = fwA * (5 / 210);

    // Check each of the 4 targets
    const status = targets.map(t => {
      const axp = (t.x / ow) * ANALYSIS_W;
      const ayp = (t.y / oh) * ah;
      return checkMarkAt(pixels, ANALYSIS_W, ah, axp, ayp, markSize);
    });

    setMarkStatus(status);
    const allFound = status.every(Boolean);
    const foundCount = status.filter(Boolean).length;

    // ===== DRAW OVERLAY =====
    ctx.clearRect(0, 0, ow, oh);

    // Dark background
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, ow, oh);
    // Clear cutout for guide frame
    ctx.clearRect(fx, fy, fw, fh);

    // Frame border
    ctx.setLineDash(allFound ? [] : [8, 4]);
    ctx.strokeStyle = allFound ? '#22c55e' : foundCount > 0 ? '#f59e0b' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = allFound ? 3 : 1.5;
    ctx.strokeRect(fx, fy, fw, fh);
    ctx.setLineDash([]);

    // Corner brackets at each target
    const bLen = Math.max(16, fw * 0.06);
    const dirs = [
      { dx: 1, dy: 1 }, { dx: -1, dy: 1 },
      { dx: 1, dy: -1 }, { dx: -1, dy: -1 },
    ];

    targets.forEach((t, i) => {
      const ok = status[i];
      const d = dirs[i];
      const color = ok ? '#22c55e' : 'rgba(255,255,255,0.6)';

      // L-shaped bracket
      ctx.strokeStyle = color;
      ctx.lineWidth = ok ? 3.5 : 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(t.x + d.dx * bLen, t.y);
      ctx.lineTo(t.x, t.y);
      ctx.lineTo(t.x, t.y + d.dy * bLen);
      ctx.stroke();

      // Small square target indicator
      const sq = ok ? 10 : 7;
      if (ok) {
        ctx.fillStyle = 'rgba(34,197,94,0.85)';
        ctx.fillRect(t.x - sq / 2, t.y - sq / 2, sq, sq);
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(t.x - sq / 2, t.y - sq / 2, sq, sq);
      }
    });

    // Auto-capture progress ring
    if (allFound && detectionCountRef.current > 2) {
      const progress = Math.min(detectionCountRef.current / AUTO_TH, 1);
      const rx = ow / 2, ry = fy + fh + 30, rr = 26;
      ctx.beginPath();
      ctx.arc(rx, ry, rr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(rx, ry, rr - 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(progress * 100)}%`, rx, ry);
    }

    // Status label above frame
    const labelY = fy - 16;
    if (labelY > 25) {
      ctx.font = 'bold 12px system-ui';
      ctx.textAlign = 'center';
      if (allFound) {
        ctx.fillStyle = 'rgba(34,197,94,0.9)';
        ctx.beginPath(); ctx.roundRect(ow / 2 - 65, labelY - 11, 130, 24, 6); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText('Skanerlash...', ow / 2, labelY + 3);
      } else if (foundCount > 0) {
        ctx.fillStyle = 'rgba(245,158,11,0.9)';
        ctx.beginPath(); ctx.roundRect(ow / 2 - 55, labelY - 11, 110, 24, 6); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(`${foundCount}/4 moslandi`, ow / 2, labelY + 3);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '11px system-ui';
        ctx.fillText('Varoqni ramkaga moslang', ow / 2, labelY + 3);
      }
    }

    return allFound;
  }, [getFrameAndTargets, checkMarkAt]);

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
          setAutoProgress(Math.min(detectionCountRef.current / AUTO_TH, 1));
          if (detectionCountRef.current >= AUTO_TH && !capturingRef.current) {
            capturePhoto();
            return;
          }
        } else {
          detectionCountRef.current = Math.max(0, detectionCountRef.current - 2);
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
      } catch { /* unsupported */ }
    }
  };

  const resetToScanning = () => {
    setState('scanning');
    setCapturedImage(null);
    setCameraError(null);
    setProcessingProgress(0);
    setAutoProgress(0);
    setMarkStatus([false, false, false, false]);
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

  const foundCount = markStatus.filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div className="relative w-full h-full flex flex-col">
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-black/70 to-transparent p-3 sm:p-4">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${
                state === 'scanning'
                  ? (paperDetected ? 'bg-green-500 animate-pulse' : foundCount > 0 ? 'bg-yellow-500' : 'bg-white/50')
                  : state === 'processing' ? 'bg-yellow-500 animate-pulse'
                  : state === 'result' ? 'bg-green-500' : 'bg-red-500'
              }`} />
              <span className="text-white font-semibold text-sm">
                {state === 'scanning'
                  ? (paperDetected
                    ? `Skanerlash... ${Math.round(autoProgress * 100)}%`
                    : foundCount > 0 ? `${foundCount}/4 marker` : 'Varoqni moslang')
                  : state === 'processing' ? 'Tahlil qilinmoqda...'
                  : state === 'result' ? 'Tayyor!' : 'Xatolik'}
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

        {/* Bottom controls */}
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
                <button
                  onClick={resetToScanning}
                  className="flex-1 py-3 bg-white/10 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" /> Yana
                </button>
                <button
                  onClick={handleClose}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
                >
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
