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

interface MarkCandidate {
  x: number;
  y: number;
  score: number;
}

// Auto-capture after consecutive detections (~2s stable)
const AUTO_CAPTURE_THRESHOLD = 24;
// Mark detection: sliding window size (pixels in analysis canvas)
const MARK_WIN = 7;
// Minimum dark pixel ratio in window to be considered a mark
const MARK_DARK_RATIO = 0.35;
// Dark pixel threshold
const DARK_THRESHOLD = 80;

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
  const [foundMarks, setFoundMarks] = useState(0);

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

  // Find the densest dark blob in a search zone using sliding window
  const findMarkInZone = useCallback((
    pixels: Uint8ClampedArray, sw: number, sh: number,
    zx1: number, zy1: number, zx2: number, zy2: number
  ): MarkCandidate | null => {
    let bestScore = 0;
    let bestX = 0, bestY = 0;
    const winArea = MARK_WIN * MARK_WIN;

    // Clamp to frame
    const x1 = Math.max(0, zx1);
    const y1 = Math.max(0, zy1);
    const x2 = Math.min(sw - MARK_WIN, zx2);
    const y2 = Math.min(sh - MARK_WIN, zy2);

    for (let wy = y1; wy <= y2; wy += 2) {
      for (let wx = x1; wx <= x2; wx += 2) {
        let darkCount = 0;
        for (let dy = 0; dy < MARK_WIN; dy++) {
          for (let dx = 0; dx < MARK_WIN; dx++) {
            const i = ((wy + dy) * sw + (wx + dx)) * 4;
            const gray = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
            if (gray < DARK_THRESHOLD) darkCount++;
          }
        }
        const score = darkCount / winArea;
        if (score > bestScore) {
          bestScore = score;
          bestX = wx + MARK_WIN / 2;
          bestY = wy + MARK_WIN / 2;
        }
      }
    }

    if (bestScore >= MARK_DARK_RATIO) {
      return { x: bestX, y: bestY, score: bestScore };
    }
    return null;
  }, []);

  // Validate that 4 marks form a reasonable rectangle
  const validateRectangle = useCallback((marks: (MarkCandidate | null)[]): boolean => {
    const valid = marks.filter((m): m is MarkCandidate => m !== null);
    if (valid.length < 3) return false;

    // With 3+ marks, check distances are reasonable
    if (valid.length >= 4) {
      const tl = marks[0]!, tr = marks[1]!, bl = marks[2]!, br = marks[3]!;
      const topW = Math.abs(tr.x - tl.x);
      const botW = Math.abs(br.x - bl.x);
      const leftH = Math.abs(bl.y - tl.y);
      const rightH = Math.abs(br.y - tr.y);

      // Sides should be roughly parallel (within 30%)
      if (topW > 0 && botW > 0) {
        const wRatio = Math.min(topW, botW) / Math.max(topW, botW);
        if (wRatio < 0.6) return false;
      }
      if (leftH > 0 && rightH > 0) {
        const hRatio = Math.min(leftH, rightH) / Math.max(leftH, rightH);
        if (hRatio < 0.6) return false;
      }

      // Width/height ratio should be somewhat close to A4 (0.5 - 0.9)
      const avgW = (topW + botW) / 2;
      const avgH = (leftH + rightH) / 2;
      if (avgH > 0) {
        const ratio = avgW / avgH;
        if (ratio < 0.4 || ratio > 1.0) return false;
      }

      // Minimum size: marks should span at least 15% of frame
      const minSpan = 20; // pixels in analysis canvas
      if (avgW < minSpan || avgH < minSpan) return false;
    }

    return true;
  }, []);

  // Main detection: find 4 corner marks
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

    // Analysis canvas - higher res for mark detection
    const tempCanvas = document.createElement('canvas');
    const sw = 320, sh = 240;
    tempCanvas.width = sw;
    tempCanvas.height = sh;
    const tc = tempCanvas.getContext('2d');
    if (!tc) return false;
    tc.drawImage(video, 0, 0, sw, sh);
    const pixels = tc.getImageData(0, 0, sw, sh).data;

    // Search for marks in 4 quadrants of the frame
    // Each search zone = one quadrant, but we extend slightly into center
    const mx = sw / 2, my = sh / 2;
    const overlap = 15; // pixels overlap into opposite quadrant

    const zones = [
      { name: 'TL', x1: 0, y1: 0, x2: mx + overlap, y2: my + overlap },
      { name: 'TR', x1: mx - overlap, y1: 0, x2: sw, y2: my + overlap },
      { name: 'BL', x1: 0, y1: my - overlap, x2: mx + overlap, y2: sh },
      { name: 'BR', x1: mx - overlap, y1: my - overlap, x2: sw, y2: sh },
    ];

    const marks: (MarkCandidate | null)[] = zones.map(z =>
      findMarkInZone(pixels, sw, sh, z.x1, z.y1, z.x2, z.y2)
    );

    const marksFound = marks.filter(m => m !== null).length;
    const isRect = validateRectangle(marks);
    const detected = marksFound >= 3 && isRect;

    setFoundMarks(marksFound);

    // --- Draw overlay ---
    ctx.clearRect(0, 0, ow, oh);

    // Semi-transparent background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, ow, oh);

    // If marks found, draw the detected paper area
    if (marksFound >= 2) {
      const validMarks = marks.filter((m): m is MarkCandidate => m !== null);
      // Scale from analysis coords to overlay coords
      const scX = ow / sw, scY = oh / sh;

      if (marksFound >= 3) {
        // Draw paper area (bright cutout)
        const xs = validMarks.map(m => m.x * scX);
        const ys = validMarks.map(m => m.y * scY);
        const minX = Math.min(...xs) - 10;
        const minY = Math.min(...ys) - 10;
        const maxX = Math.max(...xs) + 10;
        const maxY = Math.max(...ys) + 10;

        // Clear the paper area (make it brighter)
        ctx.clearRect(minX, minY, maxX - minX, maxY - minY);

        // Draw paper border
        ctx.strokeStyle = detected ? '#22c55e' : '#f59e0b';
        ctx.lineWidth = detected ? 3 : 2;
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
      }

      // Draw each found mark with a circle indicator
      marks.forEach((mark, i) => {
        if (!mark) return;
        const mx = mark.x * scX;
        const my = mark.y * scY;

        // Filled circle on mark
        ctx.beginPath();
        ctx.arc(mx, my, 12, 0, Math.PI * 2);
        ctx.fillStyle = detected ? 'rgba(34, 197, 94, 0.7)' : 'rgba(245, 158, 11, 0.7)';
        ctx.fill();
        ctx.strokeStyle = detected ? '#16a34a' : '#d97706';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Checkmark or corner label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(['TL', 'TR', 'BL', 'BR'][i], mx, my);
      });

      // Draw X for missing marks
      marks.forEach((mark, i) => {
        if (mark) return;
        // Expected position based on found marks
        const scX = ow / sw, scY = oh / sh;
        const cornerX = [15, sw - 15, 15, sw - 15][i] * scX;
        const cornerY = [15, 15, sh - 15, sh - 15][i] * scY;

        ctx.beginPath();
        ctx.arc(cornerX, cornerY, 12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.5)';
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', cornerX, cornerY);
      });
    }

    // Auto-capture progress ring (bottom center)
    if (detected && detectionCountRef.current > 2) {
      const progress = Math.min(detectionCountRef.current / AUTO_CAPTURE_THRESHOLD, 1);
      const ringX = ow / 2;
      const ringY = oh - 90;
      const ringR = 30;

      ctx.beginPath();
      ctx.arc(ringX, ringY, ringR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(ringX, ringY, ringR - 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(progress * 100)}%`, ringX, ringY);
    }

    // Status text top-center area
    const statusY = 50;
    ctx.font = 'bold 13px system-ui';
    ctx.textAlign = 'center';
    if (detected) {
      ctx.fillStyle = 'rgba(34, 197, 94, 0.9)';
      const tw = 180;
      ctx.beginPath();
      ctx.roundRect(ow / 2 - tw / 2, statusY - 12, tw, 28, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(`${marksFound}/4 marker topildi`, ow / 2, statusY + 3);
    } else if (marksFound > 0) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
      const tw = 200;
      ctx.beginPath();
      ctx.roundRect(ow / 2 - tw / 2, statusY - 12, tw, 28, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(`${marksFound}/4 marker (yaqinroq tutng)`, ow / 2, statusY + 3);
    }

    return detected;
  }, [findMarkInZone, validateRectangle]);

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
          if (detectionCountRef.current >= AUTO_CAPTURE_THRESHOLD && !capturingRef.current) {
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
    if (isOpen && state === 'scanning') startCamera();
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
    setFoundMarks(0);
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
        <div className="absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-black/70 to-transparent p-3 sm:p-4">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${
                state === 'scanning'
                  ? (paperDetected ? 'bg-green-500 animate-pulse' : foundMarks > 0 ? 'bg-yellow-500' : 'bg-white/50')
                  : state === 'processing' ? 'bg-yellow-500 animate-pulse'
                  : state === 'result' ? 'bg-green-500' : 'bg-red-500'
              }`} />
              <span className="text-white font-semibold text-sm">
                {state === 'scanning'
                  ? (paperDetected ? `Skanerlash... ${Math.round(autoProgress * 100)}%` : foundMarks > 0 ? `${foundMarks}/4 marker` : '4 ta markerni toping')
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
