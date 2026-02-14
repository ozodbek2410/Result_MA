import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { PageNavbar } from '@/components/ui/PageNavbar';
import { useToast } from '@/hooks/useToast';
import { useTests, useDeleteTest } from '@/hooks/useTests';
import { useRefreshOnReturn } from '@/hooks/useRefreshOnReturn';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import { Plus, Upload, FileText, Edit2, Trash2, Calendar, ArrowRight } from 'lucide-react';

export default function TestsPage() {
  const navigate = useNavigate();
  
  // React Query hooks
  const { data: tests = [], isLoading: loading, refetch } = useTests('minimal');
  const deleteTestMutation = useDeleteTest();
  
  const [searchQuery, setSearchQuery] = useState('');
  const { success, error } = useToast();

  // Автоматическое обновление при возврате на страницу
  useRefreshOnReturn(refetch);

  const handleCardClick = (test: any) => {
    // Navigate to test detail page with proper route
    navigate(`/teacher/tests/${test._id}`);
  };

  const handleEdit = (testId: string) => {
    navigate(`/teacher/tests/edit/${testId}`);
  };

  const handleDelete = async (testId: string) => {
    if (!confirm('Testni o\'chirmoqchimisiz?')) return;
    
    try {
      await deleteTestMutation.mutateAsync(testId);
      success('Test o\'chirildi!');
    } catch (err: any) {
      console.error('❌ Error deleting test:', err);
      error(err.response?.data?.message || 'Xatolik yuz berdi');
    }
  };

  const filteredTests = tests.filter(test =>
    test.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-6 lg:space-y-8 animate-fade-in pb-24">
        {/* Header Skeleton */}
        <div className="animate-pulse">
          <div className="h-10 w-48 bg-gradient-to-r from-slate-200 to-slate-300 rounded-2xl mb-3"></div>
          <div className="h-5 w-72 bg-slate-200 rounded-xl"></div>
        </div>
        
        {/* Tests Grid Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          <SkeletonCard variant="test" count={6} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-24 sm:pb-24">
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <PageNavbar
          title="Testlar"
          description="Testlarni yaratish va boshqarish"
          badge={`${filteredTests.length} ta`}
          showSearch={tests.length > 0}
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Test nomi bo'yicha qidirish..."
          showAddButton={true}
          addButtonText="Test yaratish"
          onAddClick={() => navigate('/teacher/tests/create')}
          extraActions={
            <Button 
              variant="outline"
              onClick={() => navigate('/teacher/tests/import')}
              className="flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Yuklash</span>
            </Button>
          }
          gradient={true}
        />

        {/* Tests Grid */}
        {filteredTests.length === 0 ? (
          <div className="bg-gradient-to-br from-white via-emerald-50/30 to-green-50/30 border border-emerald-100 rounded-2xl shadow-lg p-16 text-center">
            <div className="w-24 h-24 bg-gradient-to-br from-green-400 via-emerald-500 to-teal-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-green-500/30">
              <FileText className="w-12 h-12 text-white" />
            </div>
            <h3 className="text-2xl font-bold bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 bg-clip-text text-transparent mb-3">
              {searchQuery ? 'Testlar topilmadi' : 'Testlar yo\'q'}
            </h3>
            <p className="text-slate-600 mb-8 max-w-md mx-auto text-lg">
              {searchQuery 
                ? 'Qidiruv bo\'yicha hech narsa topilmadi. Boshqa so\'z bilan qidiring.'
                : 'Birinchi testni yaratish uchun yuqoridagi tugmani bosing'
              }
            </p>
            {!searchQuery && (
              <Button 
                size="lg" 
                onClick={() => navigate('/teacher/tests/create')} 
                className="bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 hover:shadow-xl hover:shadow-green-500/40 hover:scale-105 transition-all duration-300"
              >
                <Plus className="w-5 h-5 mr-2" />
                Test yaratish
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
            {filteredTests.map((test, index) => (
              <div
                key={test._id}
                style={{ animationDelay: `${index * 50}ms` }}
                className="group animate-slide-in"
              >
                <div 
                  className="bg-gradient-to-br from-white via-emerald-50/30 to-green-50/30 border border-emerald-100 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden cursor-pointer p-6 relative"
                  onClick={() => handleCardClick(test)}
                >
                  {/* Icon & Actions */}
                  <div className="flex items-start justify-between mb-5 relative z-10">
                    <div className="w-16 h-16 bg-gradient-to-br from-green-400 via-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center shadow-lg shadow-green-500/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                      <FileText className="w-8 h-8 text-white" />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(test._id);
                        }}
                        className="p-2.5 hover:bg-blue-100/80 backdrop-blur-sm rounded-xl transition-all duration-200 hover:scale-110 active:scale-95"
                        title="Tahrirlash"
                      >
                        <Edit2 className="w-4 h-4 text-slate-600" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(test._id);
                        }}
                        className="p-2.5 hover:bg-red-100/80 backdrop-blur-sm rounded-xl transition-all duration-200 hover:scale-110 active:scale-95"
                        title="O'chirish"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </div>

                  {/* Test Info */}
                  <div className="mb-4 relative z-10">
                    <h3 className="text-lg font-bold text-slate-900 mb-3 group-hover:text-green-600 transition-colors line-clamp-2">
                      {test.name}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Calendar className="w-4 h-4" />
                      <span>{new Date(test.createdAt).toLocaleDateString('uz-UZ')}</span>
                    </div>
                  </div>

                  {/* Action */}
                  <div className="flex items-center justify-end text-slate-600 pt-4 border-t border-slate-200/50 relative z-10">
                    <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-green-600 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
