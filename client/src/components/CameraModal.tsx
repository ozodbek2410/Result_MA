import { useEffect, useRef, useState } from 'react';
import { X, Camera, RotateCw, Zap, ZapOff } from 'lucide-react';
import { Button } from './ui/Button';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

export function CameraModal({ isOpen, onClose, onCapture }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && stream) {
      stopCamera();
      startCamera();
    }
  }, [facingMode]);

  const startCamera = async () => {
    try {
      setError(null);
      stopCamera(); // Остановить предыдущий поток перед запуском нового
      
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      setError('Kameraga kirish imkoni yo\'q. Iltimos, brauzer sozlamalarini tekshiring.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const toggleFlash = async () => {
    if (stream) {
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities() as any;
      
      if (capabilities.torch) {
        try {
          await track.applyConstraints({
            advanced: [{ torch: !flashEnabled } as any]
          });
          setFlashEnabled(!flashEnabled);
        } catch (error) {
          console.error('Error toggling flash:', error);
          alert('Vspyshka bu qurilmada qo\'llab-quvvatlanmaydi');
        }
      } else {
        alert('Vspyshka bu qurilmada qo\'llab-quvvatlanmaydi');
      }
    }
  };

  const switchCamera = async () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const capturePhoto = async () => {
    if (videoRef.current && canvasRef.current && !capturing) {
      setCapturing(true);
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], `omr-${Date.now()}.jpg`, { type: 'image/jpeg' });
            onCapture(file);
            stopCamera();
            onClose();
          }
          setCapturing(false);
        }, 'image/jpeg', 0.95);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div className="relative w-full h-full flex flex-col">
        {/* Верхняя панель управления */}
        <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/70 to-transparent p-4">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <h2 className="text-white font-semibold text-lg">Rasm olish</h2>
            <div className="flex gap-2">
              <button
                onClick={switchCamera}
                className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                title="Kamerani almashtirish"
              >
                <RotateCw className="h-5 w-5" />
              </button>
              <button
                onClick={toggleFlash}
                className={`w-10 h-10 rounded-full backdrop-blur-sm flex items-center justify-center transition-colors ${
                  flashEnabled 
                    ? 'bg-yellow-500/80 text-white hover:bg-yellow-500' 
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
                title={flashEnabled ? 'Chiroqni o\'chirish' : 'Chiroqni yoqish'}
              >
                {flashEnabled ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
              </button>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                title="Yopish"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Видео */}
        <div className="flex-1 flex items-center justify-center bg-black relative">
          {error ? (
            <div className="text-center p-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                <X className="w-8 h-8 text-red-500" />
              </div>
              <p className="text-white text-sm mb-4">{error}</p>
              <button
                onClick={startCamera}
                className="px-6 py-2 bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Qayta urinish
              </button>
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain"
            />
          )}
        </div>

        {/* Нижняя панель с кнопкой съёмки */}
        <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/70 to-transparent p-6">
          <div className="flex flex-col items-center gap-3">
            <p className="text-white/80 text-sm text-center">
              Javob varag'ini ramkaga joylashtiring
            </p>
            <button
              onClick={capturePhoto}
              disabled={capturing}
              className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              title="Suratga olish"
            >
              {capturing ? (
                <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent" />
              ) : (
                <Camera className="h-10 w-10 text-gray-900" />
              )}
            </button>
          </div>
        </div>

        {/* Скрытый canvas для обработки */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
