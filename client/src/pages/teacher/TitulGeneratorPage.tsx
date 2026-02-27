/**
 * TITUL VARAQA GENERATOR SAHIFASI
 * Test uchun titul varaqa yaratish
 */

import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { useToast } from '../../hooks/useToast';
import { PageNavbar } from '@/components/ui/PageNavbar';
import { generateTitulSheet, downloadTitulSheet, type TitulSheetConfig } from '../../lib/titulGenerator';

export default function TitulGeneratorPage() {
  const { success, error } = useToast();
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [config, setConfig] = useState<TitulSheetConfig>({
    studentId: '1234567890',
    studentName: 'Aliyev Vali',
    testId: 'TEST001',
    testName: 'Matematika Blok Test',
    variant: 'A',
    groupId: 'GRP-5',
    groupName: '10-A sinf',
    date: new Date().toLocaleDateString('uz-UZ'),
  });

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const dataUrl = await generateTitulSheet(config);
      setPreviewUrl(dataUrl);
      success('Titul varaqa yaratildi!');
    } catch (err: any) {
      error(err.message || 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!previewUrl) return;
    const filename = `titul_${config.studentId}_${config.variant}.png`;
    downloadTitulSheet(previewUrl, filename);
    success('Yuklab olindi!');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageNavbar
        title="Titul Varaqa Generator"
        description="Test uchun titul varaqa yaratish"
      />

      <div className="max-w-7xl mx-auto">

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sozlamalar */}
          <Card className="p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              ⚙️ Sozlamalar
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Talaba ID
                </label>
                <Input
                  value={config.studentId}
                  onChange={(e) => setConfig({ ...config, studentId: e.target.value })}
                  placeholder="1234567890"
                  maxLength={10}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Talaba Ismi
                </label>
                <Input
                  value={config.studentName}
                  onChange={(e) => setConfig({ ...config, studentName: e.target.value })}
                  placeholder="Aliyev Vali"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Test ID
                </label>
                <Input
                  value={config.testId}
                  onChange={(e) => setConfig({ ...config, testId: e.target.value })}
                  placeholder="TEST001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Test Nomi
                </label>
                <Input
                  value={config.testName}
                  onChange={(e) => setConfig({ ...config, testName: e.target.value })}
                  placeholder="Matematika Blok Test"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Variant
                </label>
                <Select
                  value={config.variant}
                  onChange={(e) => setConfig({ ...config, variant: e.target.value as any })}
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Guruh ID
                </label>
                <Input
                  value={config.groupId}
                  onChange={(e) => setConfig({ ...config, groupId: e.target.value })}
                  placeholder="GRP-5"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Guruh Nomi
                </label>
                <Input
                  value={config.groupName}
                  onChange={(e) => setConfig({ ...config, groupName: e.target.value })}
                  placeholder="10-A sinf"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sana
                </label>
                <Input
                  value={config.date}
                  onChange={(e) => setConfig({ ...config, date: e.target.value })}
                  placeholder="28.01.2026"
                />
              </div>

              <Button
                onClick={handleGenerate}
                disabled={loading}
                className="w-full py-3 text-lg bg-purple-600 hover:bg-purple-700"
              >
                {loading ? '⏳ Yaratilmoqda...' : '🚀 Yaratish'}
              </Button>
            </div>
          </Card>

          {/* Preview */}
          <Card className="p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              👁️ Ko'rinish
            </h2>

            {previewUrl ? (
              <div>
                <div className="mb-4 border-4 border-purple-200 rounded-lg overflow-hidden">
                  <img
                    src={previewUrl}
                    alt="Titul Varaqa"
                    className="w-full"
                  />
                </div>

                <div className="space-y-3">
                  <Button
                    onClick={handleDownload}
                    className="w-full py-3 text-lg bg-green-600 hover:bg-green-700"
                  >
                    💾 Yuklab Olish
                  </Button>

                  <Button
                    onClick={() => setPreviewUrl(null)}
                    variant="outline"
                    className="w-full py-3 text-lg"
                  >
                    🔄 Tozalash
                  </Button>
                </div>

                {/* Ma'lumotlar */}
                <div className="mt-6 bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h3 className="font-bold text-purple-900 mb-2">📊 QR Ma'lumotlar:</h3>
                  <code className="text-sm text-purple-800 break-all">
                    {config.studentId}|{config.testId}|VAR-{config.variant}|{config.groupId}
                  </code>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-96 bg-gray-100 rounded-lg">
                <div className="text-center text-gray-500">
                  <div className="text-6xl mb-4">📄</div>
                  <div className="text-lg">Titul varaqa bu yerda ko'rinadi</div>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Yo'riqnoma */}
        <Card className="mt-6 p-6 bg-blue-50 border-blue-200">
          <h3 className="text-xl font-bold text-blue-900 mb-4">
            💡 Yo'riqnoma
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-800">
            <div>
              <strong>✓ Anchor Markerlar:</strong> 4 burchakda qora doiralar
            </div>
            <div>
              <strong>✓ QR Kod:</strong> O'ng yuqori burchakda
            </div>
            <div>
              <strong>✓ Variant OMR:</strong> Chap tomonda A, B, C, D
            </div>
            <div>
              <strong>✓ ID Raqam OMR:</strong> 10 ta ustun, har biri 0-9
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
