import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Camera, RotateCw, Zap, ZapOff, CheckCircle, XCircle, Save, ArrowLeft, Loader2 } from 'lucide-react';
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

export function LiveScannerModal({ isOpen, onClose, onResult }: LiveScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const detectionCountRef = useRef(0);
  const lastDetectionRef = useRef(false);

  const [state, setState] = useState<ScanState>('scanning');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [paperDetected, setPaperDetected] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState(0);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      stopCamera();

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = mediaStream;

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
        startDetection();
      }
    } catch {
      setCameraError("Kameraga kirish imkoni yo'q");
    }
  }, [facingMode]);

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

  // Simple paper detection using brightness analysis
  const detectPaper = useCallback(() => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay || video.videoWidth === 0) return false;

    const ctx = overlay.getContext('2d');
    if (!ctx) return false;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    overlay.width = overlay.clientWidth;
    overlay.height = overlay.clientHeight;

    const ow = overlay.width;
    const oh = overlay.height;

    // Draw video to small temp canvas for analysis
    const tempCanvas = document.createElement('canvas');
    const sw = 160;
    const sh = 120;
    tempCanvas.width = sw;
    tempCanvas.height = sh;
    const tc = tempCanvas.getContext('2d');
    if (!tc) return false;
    tc.drawImage(video, 0, 0, sw, sh);
    const imgData = tc.getImageData(0, 0, sw, sh);
    const pixels = imgData.data;

    // Analyze center region for paper (bright region)
    const cx1 = Math.floor(sw * 0.15);
    const cy1 = Math.floor(sh * 0.1);
    const cx2 = Math.floor(sw * 0.85);
    const cy2 = Math.floor(sh * 0.9);

    let brightCount = 0;
    let totalCount = 0;
    let edgeScore = 0;

    // Check brightness in center region
    for (let y = cy1; y < cy2; y++) {
      for (let x = cx1; x < cx2; x++) {
        const i = (y * sw + x) * 4;
        const gray = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        totalCount++;
        if (gray > 160) brightCount++;
      }
    }

    // Check edges (top, bottom, left, right of guide area) for dark/different
    const checkEdge = (startX: number, startY: number, endX: number, endY: number) => {
      let dark = 0;
      let count = 0;
      const stepX = endX === startX ? 0 : (endX > startX ? 1 : -1);
      const stepY = endY === startY ? 0 : (endY > startY ? 1 : -1);
      let x = startX, y = startY;
      while (x !== endX || y !== endY) {
        const i = (y * sw + x) * 4;
        const gray = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        if (gray < 120) dark++;
        count++;
        x += stepX;
        y += stepY;
        if (count > 200) break;
      }
      return count > 0 ? dark / count : 0;
    };

    // Check corner marks (4 corners of the guide area)
    const cornerSize = 6; // pixels in low-res
    const corners = [
      { x: cx1, y: cy1 }, // TL
      { x: cx2 - cornerSize, y: cy1 }, // TR
      { x: cx1, y: cy2 - cornerSize }, // BL
      { x: cx2 - cornerSize, y: cy2 - cornerSize }, // BR
    ];

    let cornersFound = 0;
    for (const c of corners) {
      let darkPixels = 0;
      let totalPixels = 0;
      for (let dy = 0; dy < cornerSize; dy++) {
        for (let dx = 0; dx < cornerSize; dx++) {
          const px = c.x + dx;
          const py = c.y + dy;
          if (px >= 0 && px < sw && py >= 0 && py < sh) {
            const i = (py * sw + px) * 4;
            const gray = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
            if (gray < 80) darkPixels++;
            totalPixels++;
          }
        }
      }
      if (totalPixels > 0 && darkPixels / totalPixels > 0.3) cornersFound++;
    }

    const brightRatio = brightCount / totalCount;
    const detected = brightRatio > 0.45 && (cornersFound >= 2 || brightRatio > 0.6);

    // Draw overlay
    ctx.clearRect(0, 0, ow, oh);

    // Guide frame
    const guideMargin = 0.08;
    const gx = ow * guideMargin;
    const gy = oh * 0.05;
    const gw = ow * (1 - guideMargin * 2);
    const gh = oh * 0.9;

    // Semi-transparent background outside guide
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    // Top
    ctx.fillRect(0, 0, ow, gy);
    // Bottom
    ctx.fillRect(0, gy + gh, ow, oh - gy - gh);
    // Left
    ctx.fillRect(0, gy, gx, gh);
    // Right
    ctx.fillRect(gx + gw, gy, ow - gx - gw, gh);

    // Guide border
    const color = detected ? '#22c55e' : '#ffffff';
    ctx.strokeStyle = color;
    ctx.lineWidth = detected ? 3 : 2;
    ctx.setLineDash(detected ? [] : [10, 5]);

    // Rounded rectangle
    const r = 12;
    ctx.beginPath();
    ctx.moveTo(gx + r, gy);
    ctx.lineTo(gx + gw - r, gy);
    ctx.arcTo(gx + gw, gy, gx + gw, gy + r, r);
    ctx.lineTo(gx + gw, gy + gh - r);
    ctx.arcTo(gx + gw, gy + gh, gx + gw - r, gy + gh, r);
    ctx.lineTo(gx + r, gy + gh);
    ctx.arcTo(gx, gy + gh, gx, gy + gh - r, r);
    ctx.lineTo(gx, gy + r);
    ctx.arcTo(gx, gy, gx + r, gy, r);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // Corner indicators
    const cornerLen = 25;
    const cornerPositions = [
      { x: gx, y: gy, dx: 1, dy: 1 },
      { x: gx + gw, y: gy, dx: -1, dy: 1 },
      { x: gx, y: gy + gh, dx: 1, dy: -1 },
      { x: gx + gw, y: gy + gh, dx: -1, dy: -1 },
    ];

    ctx.lineWidth = 4;
    ctx.strokeStyle = detected ? '#22c55e' : '#3b82f6';
    for (const cp of cornerPositions) {
      ctx.beginPath();
      ctx.moveTo(cp.x + cp.dx * cornerLen, cp.y);
      ctx.lineTo(cp.x, cp.y);
      ctx.lineTo(cp.x, cp.y + cp.dy * cornerLen);
      ctx.stroke();
    }

    // Status text at bottom of guide
    if (detected) {
      ctx.fillStyle = 'rgba(34, 197, 94, 0.9)';
      ctx.roundRect(ow / 2 - 80, gy + gh + 8, 160, 32, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Varaq aniqlandi!', ow / 2, gy + gh + 29);
    }

    return detected;
  }, []);

  // Detection loop
  const startDetection = useCallback(() => {
    let frameCount = 0;
    const loop = () => {
      if (!streamRef.current || state !== 'scanning') return;
      frameCount++;
      // Process every 5th frame for performance
      if (frameCount % 5 === 0) {
        const detected = detectPaper();
        if (detected) {
          detectionCountRef.current++;
          if (!lastDetectionRef.current) {
            lastDetectionRef.current = true;
            setPaperDetected(true);
          }
        } else {
          detectionCountRef.current = Math.max(0, detectionCountRef.current - 2);
          if (detectionCountRef.current === 0 && lastDetectionRef.current) {
            lastDetectionRef.current = false;
            setPaperDetected(false);
          }
        }
      }
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
  }, [detectPaper, state]);

  // Camera lifecycle
  useEffect(() => {
    if (isOpen && state === 'scanning') {
      startCamera();
    }
    return () => {
      if (!isOpen) {
        stopCamera();
      }
    };
  }, [isOpen, startCamera, stopCamera, state]);

  // Switch camera
  useEffect(() => {
    if (isOpen && state === 'scanning') {
      stopCamera();
      startCamera();
    }
  }, [facingMode]);

  // Capture photo
  const capturePhoto = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    setState('captured');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    // Vibrate feedback
    if (navigator.vibrate) navigator.vibrate(50);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    setCapturedImage(dataUrl);
    stopCamera();

    // Auto-send to server
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
    }
  }, [stopCamera, onResult]);

  // Flash toggle
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

  // Reset to scanning
  const resetToScanning = () => {
    setState('scanning');
    setCapturedImage(null);
    setCameraError(null);
    setProcessingProgress(0);
    detectionCountRef.current = 0;
    lastDetectionRef.current = false;
    setPaperDetected(false);
  };

  // Close handler
  const handleClose = () => {
    stopCamera();
    setState('scanning');
    setCapturedImage(null);
    setCameraError(null);
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
                state === 'scanning' ? (paperDetected ? 'bg-green-500 animate-pulse' : 'bg-red-500') :
                state === 'processing' ? 'bg-yellow-500 animate-pulse' :
                state === 'result' ? 'bg-green-500' : 'bg-red-500'
              }`} />
              <span className="text-white font-semibold text-sm">
                {state === 'scanning' ? (paperDetected ? 'Varaq aniqlandi' : 'Varaqni joylashtiring') :
                 state === 'captured' ? 'Suratga olindi' :
                 state === 'processing' ? 'Tahlil qilinmoqda...' :
                 state === 'result' ? 'Tayyor!' :
                 'Xatolik'}
              </span>
            </div>
            <div className="flex gap-2">
              {state === 'scanning' && (
                <>
                  <button
                    onClick={() => setFacingMode((p) => (p === 'user' ? 'environment' : 'user'))}
                    className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                  >
                    <RotateCw className="h-4 w-4" />
                  </button>
                  <button
                    onClick={toggleFlash}
                    className={`w-9 h-9 rounded-full backdrop-blur-sm flex items-center justify-center transition-colors ${
                      flashEnabled ? 'bg-yellow-500/80 text-white' : 'bg-white/20 text-white hover:bg-white/30'
                    }`}
                  >
                    {flashEnabled ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
                  </button>
                </>
              )}
              <button
                onClick={handleClose}
                className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Camera / Captured Image View */}
        <div className="flex-1 flex items-center justify-center bg-black relative">
          {state === 'scanning' && !cameraError && (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <canvas
                ref={overlayRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
              />
            </>
          )}

          {(state === 'captured' || state === 'processing') && capturedImage && (
            <div className="relative w-full h-full">
              <img src={capturedImage} alt="Captured" className="w-full h-full object-contain" />
              {state === 'processing' && (
                <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                  </div>
                  <div className="w-48">
                    <div className="flex justify-between mb-1">
                      <span className="text-white text-xs font-medium">Tahlil qilinmoqda</span>
                      <span className="text-white text-xs font-bold">{Math.round(processingProgress)}%</span>
                    </div>
                    <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all duration-200 rounded-full"
                        style={{ width: `${processingProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {state === 'result' && capturedImage && (
            <div className="w-full h-full flex flex-col">
              <div className="flex-1 overflow-auto">
                <img src={capturedImage} alt="Result" className="w-full object-contain" />
              </div>
            </div>
          )}

          {(state === 'error' || cameraError) && (
            <div className="text-center p-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
              <p className="text-white text-sm mb-4">{cameraError}</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={resetToScanning}
                  className="px-6 py-2.5 bg-white text-gray-900 rounded-xl hover:bg-gray-100 transition-colors font-semibold text-sm"
                >
                  Qayta urinish
                </button>
                <button
                  onClick={handleClose}
                  className="px-6 py-2.5 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-colors font-semibold text-sm"
                >
                  Yopish
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom controls */}
        {state === 'scanning' && !cameraError && (
          <div className="absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/80 to-transparent p-4 pb-6 sm:pb-8">
            <div className="flex flex-col items-center gap-3 max-w-md mx-auto">
              <p className="text-white/70 text-xs text-center">
                Javob varag'ini ramkaga joylashtiring va suratga oling
              </p>
              <button
                onClick={capturePhoto}
                className={`w-[72px] h-[72px] rounded-full flex items-center justify-center shadow-2xl transition-all duration-200 active:scale-90 ${
                  paperDetected
                    ? 'bg-green-500 hover:bg-green-400 ring-4 ring-green-500/30'
                    : 'bg-white hover:bg-gray-100'
                }`}
              >
                <Camera className={`h-8 w-8 ${paperDetected ? 'text-white' : 'text-gray-900'}`} />
              </button>
            </div>
          </div>
        )}

        {/* Result bottom bar */}
        {state === 'result' && (
          <div className="absolute bottom-0 left-0 right-0 z-30 bg-black/90 backdrop-blur-md p-4 pb-6 border-t border-white/10">
            <div className="max-w-md mx-auto space-y-3">
              <div className="flex items-center justify-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-white font-semibold text-sm">Muvaffaqiyatli skanerlandi!</span>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={resetToScanning}
                  className="flex-1 py-3 bg-white/10 text-white rounded-xl font-semibold text-sm hover:bg-white/20 transition-colors flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  Yana skanerlash
                </button>
                <button
                  onClick={handleClose}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-500 transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Natijani ko'rish
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Hidden canvas */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
