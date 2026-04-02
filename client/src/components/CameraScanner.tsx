/**
 * CameraScanner — EvalBee kabi real-time kamera skanerlash
 *
 * Flow:
 * 1. Kamerani ochish (getUserMedia)
 * 2. Har 500ms frame olib jsQR bilan QR kod izlash
 * 3. QR topilganda: yashil ramka + "Skanerlash tayyor" holat
 * 4. QR 1 soniya barqaror bo'lsa → avtomatik skanerlash
 *    YOKI foydalanuvchi tugma bosadi
 * 5. Frame ni base64 ga o'tkazib /api/omr/scan-v2 ga yuborish
 * 6. Natijani ko'rsatish
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';
import api from '@/lib/api';

interface ScanResult {
  success: boolean;
  qr_code?: {
    found: boolean;
    variant_code?: string;
    total_questions?: number;
    student_name?: string;
    test_name?: string;
    score?: number;
    total?: number;
    correct_answers?: Record<string, string>;
  };
  detected_answers?: Record<string, string>;
  stats?: {
    answered: number;
    empty: number;
    multi_select: number;
    total: number;
    detection_rate: number;
    avg_confidence: number;
  };
  error?: string;
}

interface CameraScannerProps {
  onResult?: (result: ScanResult) => void;
  onClose?: () => void;
}

type ScanState = 'idle' | 'searching' | 'qr_found' | 'scanning' | 'done' | 'error';

export default function CameraScanner({ onResult, onClose }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number | null>(null);
  const qrStableRef = useRef<{ code: string; since: number } | null>(null);
  const isProcessingRef = useRef(false);

  const [state, setState] = useState<ScanState>('idle');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  // Kamerani ochish
  const startCamera = useCallback(async () => {
    try {
      setState('searching');
      setError(null);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        startScanLoop();
      }
    } catch (err: unknown) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Kamerani ochib bo\'lmadi');
    }
  }, [facingMode]);

  // QR skan loop — har 400ms
  const startScanLoop = () => {
    const loop = () => {
      scanFrame();
      scanLoopRef.current = window.setTimeout(loop, 400);
    };
    scanLoopRef.current = window.setTimeout(loop, 400);
  };

  const scanFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!video || !canvas || !overlay || video.readyState < 2 || isProcessingRef.current) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, vw, vh);

    const imageData = ctx.getImageData(0, 0, vw, vh);
    const qrResult = jsQR(imageData.data, vw, vh, { inversionAttempts: 'dontInvert' });

    // Overlay canvas — video ustida ko'rsatish
    overlay.width = vw;
    overlay.height = vh;
    const octx = overlay.getContext('2d')!;
    octx.clearRect(0, 0, vw, vh);

    if (qrResult) {
      // QR topildi — yashil ramka chizish
      const loc = qrResult.location;
      octx.beginPath();
      octx.strokeStyle = '#00ff00';
      octx.lineWidth = 4;
      octx.moveTo(loc.topLeftCorner.x, loc.topLeftCorner.y);
      octx.lineTo(loc.topRightCorner.x, loc.topRightCorner.y);
      octx.lineTo(loc.bottomRightCorner.x, loc.bottomRightCorner.y);
      octx.lineTo(loc.bottomLeftCorner.x, loc.bottomLeftCorner.y);
      octx.closePath();
      octx.stroke();

      const code = qrResult.data;
      setQrCode(code);
      setState('qr_found');

      // Barqarorlik tekshiruvi — 1 soniya bir xil QR = avtomatik skan
      const now = Date.now();
      if (qrStableRef.current?.code === code) {
        if (now - qrStableRef.current.since >= 1000) {
          captureAndScan();
        }
      } else {
        qrStableRef.current = { code, since: now };
      }
    } else {
      qrStableRef.current = null;
      setQrCode(null);
      setState(s => s === 'qr_found' ? 'searching' : s);
    }
  };

  const captureAndScan = useCallback(async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setState('scanning');

    // Scan loop ni to'xtatish
    if (scanLoopRef.current) {
      clearTimeout(scanLoopRef.current);
      scanLoopRef.current = null;
    }

    try {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Canvas yo\'q');

      // Yuqori sifat JPEG
      const base64 = canvas.toDataURL('image/jpeg', 0.92);

      const response = await api.post('/omr/scan-v2', { imageBase64: base64 });
      const scanResult: ScanResult = response.data;

      setResult(scanResult);
      setState('done');
      onResult?.(scanResult);
    } catch (err: unknown) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Skanerlash xatolik');
      isProcessingRef.current = false;
    }
  }, [onResult]);

  // Qayta skanerlash
  const rescan = () => {
    isProcessingRef.current = false;
    setResult(null);
    setQrCode(null);
    setError(null);
    setState('searching');
    startScanLoop();
  };

  // Kamera almashish (old/orqa)
  const flipCamera = () => {
    setFacingMode(f => f === 'environment' ? 'user' : 'environment');
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (scanLoopRef.current) clearTimeout(scanLoopRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [facingMode]);

  const stateLabel: Record<ScanState, string> = {
    idle: 'Kamera yuklanmoqda...',
    searching: 'QR kodni izlamoqda...',
    qr_found: 'QR topildi! Varaqdagi barchasini ko\'rsat',
    scanning: 'Skanerlashmoqda...',
    done: 'Tayyor!',
    error: 'Xatolik',
  };

  const stateColor: Record<ScanState, string> = {
    idle: 'bg-gray-600',
    searching: 'bg-yellow-600',
    qr_found: 'bg-green-600',
    scanning: 'bg-blue-600',
    done: 'bg-green-700',
    error: 'bg-red-600',
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-black/80">
        <button onClick={onClose} className="text-white text-sm px-3 py-1 border border-white/30 rounded">
          Yopish
        </button>
        <span className="text-white font-bold text-sm">Javob varaqasini skaner qiling</span>
        <button onClick={flipCamera} className="text-white text-sm px-3 py-1 border border-white/30 rounded">
          Kamera
        </button>
      </div>

      {/* Camera view */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Hidden canvas for processing */}
        <canvas ref={canvasRef} className="hidden" />
        {/* Overlay canvas — QR ramkasi */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: 'cover' }}
        />

        {/* Scan guide — qog'oz ko'rsatish chizig'i */}
        {state === 'searching' && (
          <div className="absolute inset-6 border-2 border-white/40 rounded-lg pointer-events-none">
            <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl" />
            <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr" />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl" />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-white rounded-br" />
          </div>
        )}

        {/* Processing overlay */}
        {state === 'scanning' && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <div className="text-white text-center">
              <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-lg font-bold">Skanerlashmoqda...</p>
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className={`px-4 py-2 ${stateColor[state]} text-white text-center text-sm font-medium`}>
        {stateLabel[state]}
        {qrCode && state === 'qr_found' && (
          <span className="ml-2 text-xs opacity-80">QR: {qrCode.slice(0, 20)}...</span>
        )}
      </div>

      {/* Manual scan button */}
      {(state === 'qr_found' || state === 'searching') && (
        <div className="p-4 bg-black">
          <button
            onClick={captureAndScan}
            disabled={state !== 'qr_found'}
            className="w-full py-4 rounded-xl text-white font-bold text-lg bg-blue-600 disabled:opacity-40 active:scale-95 transition-transform"
          >
            {state === 'qr_found' ? 'Skanerlash' : 'QR kutilmoqda...'}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-900 text-white text-sm">
          {error}
          <button onClick={rescan} className="ml-4 underline">Qayta urinish</button>
        </div>
      )}

      {/* Result */}
      {result && state === 'done' && (
        <div className="bg-gray-900 p-4 max-h-64 overflow-y-auto">
          {result.success ? (
            <div className="text-white space-y-2">
              {result.qr_code?.found && (
                <div className="bg-green-800 rounded p-3">
                  <p className="font-bold">{result.qr_code.student_name || 'O\'quvchi topilmadi'}</p>
                  <p className="text-sm opacity-80">{result.qr_code.test_name}</p>
                  {result.qr_code.score != null && (
                    <p className="text-xl font-bold mt-1">
                      {result.qr_code.score} / {result.qr_code.total} ball
                    </p>
                  )}
                </div>
              )}
              <div className="bg-gray-800 rounded p-3 text-sm">
                <p>Javoblar: {result.stats?.answered} / {result.stats?.total}</p>
                <p>Aniqlik: {result.stats?.detection_rate}%</p>
                <p>Bo'sh: {result.stats?.empty} | Bir nechta: {result.stats?.multi_select}</p>
              </div>
              <button
                onClick={rescan}
                className="w-full py-3 bg-blue-700 rounded-lg text-white font-bold"
              >
                Keyingi varaq
              </button>
            </div>
          ) : (
            <div className="text-red-400">
              <p>{result.error || 'Skanerlash muvaffaqiyatsiz'}</p>
              <button onClick={rescan} className="mt-2 text-white underline">Qayta urinish</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
