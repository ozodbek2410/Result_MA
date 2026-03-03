import { useEffect, useRef, useState, useCallback } from 'react';
import {
  X, RotateCw, Zap, ZapOff, CheckCircle, XCircle,
  ArrowLeft, Loader2, Camera,
} from 'lucide-react';
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

// ---- Constants ----
const A4_RATIO = 297 / 210;
const MARK_RX = 4.5 / 210; // corner mark center X (relative to paper width)
const MARK_RY = 4.5 / 297; // corner mark center Y (relative to paper height)
const FRAME_W_RATIO = 0.82;
const CROP_MARGIN = 0.08; // 8% extra margin when cropping
const AUTO_TH = 3; // instant capture (~0.25s debounce)
const ANALYSIS_W = 320;

export function LiveScannerModal({ isOpen, onClose, onResult }: LiveScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null);
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

  useEffect(() => { stateRef.current = state; }, [state]);

  // Lazy init temp canvas
  const getTempCanvas = useCallback(() => {
    if (!tempCanvasRef.current) tempCanvasRef.current = document.createElement('canvas');
    return tempCanvasRef.current;
  }, []);

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

  // Map screen rect to video rect (inverse object-cover)
  const screenToVideoRect = useCallback((
    sx: number, sy: number, sw: number, sh: number,
    scrW: number, scrH: number, vidW: number, vidH: number,
  ) => {
    const vAsp = vidW / vidH, sAsp = scrW / scrH;
    let scale: number, offX = 0, offY = 0;
    if (vAsp > sAsp) { scale = vidH / scrH; offX = (vidW - scrW * scale) / 2; }
    else { scale = vidW / scrW; offY = (vidH - scrH * scale) / 2; }
    const vx = Math.max(0, offX + sx * scale);
    const vy = Math.max(0, offY + sy * scale);
    const vw = Math.min(vidW - vx, sw * scale);
    const vh = Math.min(vidH - vy, sh * scale);
    return { vx, vy, vw, vh };
  }, []);

  // ---- CAPTURE with smart crop ----
  const capturePhoto = useCallback(async () => {
    if (capturingRef.current) return;
    capturingRef.current = true;
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas) { capturingRef.current = false; return; }

    // Save dimensions BEFORE state change
    const scrW = video.clientWidth, scrH = video.clientHeight;
    const vidW = video.videoWidth, vidH = video.videoHeight;
    const { fx, fy, fw, fh } = getFrame(scrW, scrH);

    // Crop region with margin
    const mx = fw * CROP_MARGIN, my = fh * CROP_MARGIN;
    const crop = screenToVideoRect(
      fx - mx, fy - my, fw + 2 * mx, fh + 2 * my,
      scrW, scrH, vidW, vidH,
    );

    // Draw ONLY the frame area to canvas (smart crop)
    canvas.width = Math.round(crop.vw);
    canvas.height = Math.round(crop.vh);
    const ctx = canvas.getContext('2d');
    if (!ctx) { capturingRef.current = false; return; }
    ctx.drawImage(video, crop.vx, crop.vy, crop.vw, crop.vh, 0, 0, canvas.width, canvas.height);

    if (navigator.vibrate) navigator.vibrate(50);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    setCapturedImage(dataUrl);

    setState('captured');
    stopCamera();
    setState('processing');
    setProcessingProgress(0);

    const progressInterval = setInterval(() => {
      setProcessingProgress(p => p >= 90 ? p : p + Math.random() * 20);
    }, 150);

    try {
      const blob = await new Promise<Blob>(resolve =>
        canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.95),
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
  }, [stopCamera, onResult, getFrame, screenToVideoRect]);

  // ---- DETECTION: brightness + content ----
  const detectPaper = useCallback(() => {
    const video = videoRef.current, overlay = overlayRef.current;
    if (!video || !overlay || video.videoWidth === 0) return false;

    const ow = overlay.clientWidth, oh = overlay.clientHeight;
    overlay.width = ow; overlay.height = oh;
    const ctx = overlay.getContext('2d')!;
    const { fx, fy, fw, fh } = getFrame(ow, oh);

    // Draw visible video (object-cover crop) to analysis canvas
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
    const tctx = tc.getContext('2d')!;
    tctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, ANALYSIS_W, ah);
    const pixels = tctx.getImageData(0, 0, ANALYSIS_W, ah).data;

    // Frame area in analysis coords
    const afx = fx / ow * ANALYSIS_W;
    const afy = fy / oh * ah;
    const afw = fw / ow * ANALYSIS_W;
    const afh = fh / oh * ah;

    // ---- Sample INSIDE frame (8×8 grid = 64 points) ----
    const grid = 8;
    const stepX = afw / (grid + 1), stepY = afh / (grid + 1);
    let brightSum = 0, whiteN = 0, darkN = 0, total = 0;
    for (let gy = 1; gy <= grid; gy++) {
      for (let gx = 1; gx <= grid; gx++) {
        const px = Math.round(afx + gx * stepX);
        const py = Math.round(afy + gy * stepY);
        if (px < 0 || py < 0 || px >= ANALYSIS_W || py >= ah) continue;
        const i = (py * ANALYSIS_W + px) * 4;
        const gray = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        brightSum += gray;
        if (gray > 180) whiteN++;
        if (gray < 80) darkN++;
        total++;
      }
    }
    const avgBright = total > 0 ? brightSum / total : 0;
    const whiteRatio = total > 0 ? whiteN / total : 0;
    const darkRatio = total > 0 ? darkN / total : 0;

    // Detection: bright surface with printed content (white + dark areas)
    // No outside comparison needed — paper often fills entire screen
    const detected = avgBright > 125 && whiteRatio > 0.20 && darkRatio > 0.02;

    // ======== DRAW OVERLAY ========
    ctx.clearRect(0, 0, ow, oh);

    // Dark background
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, ow, oh);
    // Clear cutout for guide frame
    ctx.clearRect(fx, fy, fw, fh);

    // Thin inner border on frame (subtle)
    ctx.strokeStyle = detected ? '#22c55e' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = detected ? 2.5 : 1;
    ctx.setLineDash(detected ? [] : [6, 4]);
    ctx.strokeRect(fx, fy, fw, fh);
    ctx.setLineDash([]);

    // Corner brackets at frame corners
    const bLen = Math.max(22, fw * 0.07);
    const bColor = detected ? '#22c55e' : 'rgba(255,255,255,0.55)';
    ctx.strokeStyle = bColor;
    ctx.lineWidth = detected ? 3.5 : 2.5;
    ctx.lineCap = 'round';

    // TL
    ctx.beginPath();
    ctx.moveTo(fx + bLen, fy); ctx.lineTo(fx, fy); ctx.lineTo(fx, fy + bLen);
    ctx.stroke();
    // TR
    ctx.beginPath();
    ctx.moveTo(fx + fw - bLen, fy); ctx.lineTo(fx + fw, fy); ctx.lineTo(fx + fw, fy + bLen);
    ctx.stroke();
    // BL
    ctx.beginPath();
    ctx.moveTo(fx + bLen, fy + fh); ctx.lineTo(fx, fy + fh); ctx.lineTo(fx, fy + fh - bLen);
    ctx.stroke();
    // BR
    ctx.beginPath();
    ctx.moveTo(fx + fw - bLen, fy + fh); ctx.lineTo(fx + fw, fy + fh); ctx.lineTo(fx + fw, fy + fh - bLen);
    ctx.stroke();

    // Small crosshairs at corner mark positions (subtle alignment hints)
    const markTargets = [
      { x: fx + fw * MARK_RX, y: fy + fh * MARK_RY },
      { x: fx + fw * (1 - MARK_RX), y: fy + fh * MARK_RY },
      { x: fx + fw * MARK_RX, y: fy + fh * (1 - MARK_RY) },
      { x: fx + fw * (1 - MARK_RX), y: fy + fh * (1 - MARK_RY) },
    ];
    ctx.strokeStyle = detected ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    markTargets.forEach(t => {
      const s = 5;
      ctx.beginPath();
      ctx.moveTo(t.x - s, t.y); ctx.lineTo(t.x + s, t.y);
      ctx.moveTo(t.x, t.y - s); ctx.lineTo(t.x, t.y + s);
      ctx.stroke();
    });

    // Progress ring (below frame)
    if (detected && detectionCountRef.current > 2) {
      const progress = Math.min(detectionCountRef.current / AUTO_TH, 1);
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

    // Status label above frame
    const labelY = fy - 16;
    if (labelY > 25) {
      ctx.textAlign = 'center';
      if (detected) {
        ctx.fillStyle = 'rgba(34,197,94,0.9)';
        ctx.beginPath(); ctx.roundRect(ow / 2 - 65, labelY - 12, 130, 26, 6); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui';
        ctx.fillText('Tayyor, skanerlash...', ow / 2, labelY + 2);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.font = '11px system-ui';
        ctx.fillText('Varoqni ramkaga moslang', ow / 2, labelY + 2);
      }
    }

    return detected;
  }, [getFrame, getTempCanvas]);

  // Detection loop
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
          detectionCountRef.current = Math.max(0, detectionCountRef.current - 1);
          if (detectionCountRef.current === 0) { setPaperDetected(false); setAutoProgress(0); }
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
      } catch { /* not supported */ }
    }
  };

  const resetToScanning = () => {
    setState('scanning'); setCapturedImage(null); setCameraError(null);
    setProcessingProgress(0); setAutoProgress(0);
    detectionCountRef.current = 0; capturingRef.current = false; setPaperDetected(false);
  };

  const handleClose = () => {
    stopCamera(); setState('scanning'); setCapturedImage(null); setCameraError(null);
    capturingRef.current = false; detectionCountRef.current = 0; onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div className="relative w-full h-full flex flex-col">
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-black/70 to-transparent p-3 sm:p-4">
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
                  ? (paperDetected ? `Skanerlash... ${Math.round(autoProgress * 100)}%` : 'Varoqni moslang')
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
