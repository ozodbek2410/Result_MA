import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Upload, ArrowLeft } from 'lucide-react';
import { useTestType } from '@/hooks/useTestType';
import { BlockTestImportForm } from './components/BlockTestImportForm';

interface TestImportPageProps {
  defaultType?: 'regular' | 'block';
}

export default function TestImportPage({ defaultType = 'regular' }: TestImportPageProps) {
  const navigate = useNavigate();
  const { isRegular } = useTestType(defaultType);

  const handleBack = () => {
    navigate(isRegular ? '/teacher/tests' : '/teacher/block-tests');
  };

  return (
    <div className="min-h-screen bg-gray-50 -m-4 sm:-m-6 lg:-m-8">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft className="w-5 h-5 mr-2" />
              Orqaga
            </Button>
            <div className="flex items-center gap-2">
              <Upload className="w-6 h-6 text-primary" />
              <h1 className="text-2xl font-bold">Test import qilish</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Content — both test types use the same multi-subject import form */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <BlockTestImportForm standalone={true} />
        </div>
      </div>
    </div>
  );
}
