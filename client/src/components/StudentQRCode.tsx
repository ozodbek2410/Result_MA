import { QRCodeSVG } from 'qrcode.react';
import { Download, X } from 'lucide-react';
import { Button } from './ui/Button';

interface StudentQRCodeProps {
  student: {
    _id: string;
    fullName: string;
    profileToken: string;
  };
  onClose?: () => void;
}

export default function StudentQRCode({ student, onClose }: StudentQRCodeProps) {
  const profileUrl = `https://mathacademy.biznesjon.uz/p/${student.profileToken}`;

  const downloadQRCode = () => {
    const svg = document.getElementById(`qr-${student._id}`);
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      
      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `${student.fullName}-QR.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" style={{ margin: 0, width: '100vw', height: '100vh', left: 0, top: 0 }}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        )}

        <div className="text-center mb-6">
          <h3 className="text-2xl font-bold text-gray-900 mb-2">
            {student.fullName}
          </h3>
          <p className="text-sm text-gray-600">
            O'quvchi profili QR kodi
          </p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-6 mb-6 flex justify-center items-center">
          <div className="bg-white rounded-lg p-4">
            <QRCodeSVG
              id={`qr-${student._id}`}
              value={profileUrl}
              size={256}
              level="H"
              includeMargin={true}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-600 mb-1">Profil havolasi:</p>
            <p className="text-sm font-mono text-gray-900 break-all">
              {profileUrl}
            </p>
          </div>

          <Button
            onClick={downloadQRCode}
            className="w-full gap-2"
          >
            <Download className="w-4 h-4" />
            QR kodni yuklab olish
          </Button>
        </div>

        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-xs text-blue-800">
            💡 Bu QR kodni skanerlash orqali o'quvchining profili va test natijalari ko'rinadi
          </p>
        </div>
      </div>
    </div>
  );
}
