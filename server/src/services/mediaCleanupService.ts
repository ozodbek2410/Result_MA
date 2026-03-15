import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import Test from '../models/Test';

/**
 * 🧹 MEDIA CLEANUP SERVICE
 * Eski va ishlatilmayotgan media fayllarni tozalash
 */
export class MediaCleanupService {
  private uploadDir: string;

  constructor() {
    this.uploadDir = path.join(process.cwd(), 'uploads');
  }

  /**
   * Eski fayllarni tozalash (N kundan eski)
   */
  async cleanupOldFiles(daysOld: number = 30): Promise<number> {
    try {
      console.log(`🧹 [CLEANUP] Cleaning files older than ${daysOld} days...`);
      
      const now = Date.now();
      const maxAge = daysOld * 24 * 60 * 60 * 1000; // milliseconds
      
      let deletedCount = 0;
      
      // test-images papkani tozalash
      const testImagesDir = path.join(this.uploadDir, 'test-images');
      if (fsSync.existsSync(testImagesDir)) {
        const files = await fs.readdir(testImagesDir);
        
        for (const file of files) {
          const filePath = path.join(testImagesDir, file);
          const stats = await fs.stat(filePath);
          
          const age = now - stats.mtimeMs;
          
          if (age > maxAge) {
            await fs.unlink(filePath);
            deletedCount++;
            console.log(`  🗑️  Deleted: ${file} (${Math.floor(age / (24 * 60 * 60 * 1000))} days old)`);
          }
        }
      }
      
      console.log(`✅ [CLEANUP] Deleted ${deletedCount} old files`);
      
      return deletedCount;
    } catch (error) {
      console.error('❌ [CLEANUP] Error:', error);
      return 0;
    }
  }

  /**
   * Ishlatilmayotgan fayllarni tozalash
   * (Database'da yo'q fayllar)
   */
  async cleanupUnusedFiles(): Promise<number> {
    try {
      console.log('[CLEANUP] Cleaning unused files...');

      // Collect all image URLs referenced in DB
      const referencedUrls = new Set<string>();

      const tests = await Test.find({}, { 'questions.imageUrl': 1, 'questions.media': 1 }).lean();
      for (const test of tests) {
        for (const q of (test as any).questions || []) {
          if (q.imageUrl) referencedUrls.add(path.basename(q.imageUrl));
          if (q.media) {
            for (const m of q.media) {
              if (m.url) referencedUrls.add(path.basename(m.url));
            }
          }
        }
      }

      // Compare with files on disk
      const testImagesDir = path.join(this.uploadDir, 'test-images');
      if (!fsSync.existsSync(testImagesDir)) return 0;

      const files = await fs.readdir(testImagesDir);
      let deletedCount = 0;

      for (const file of files) {
        if (!referencedUrls.has(file)) {
          // File not referenced — check age (only delete if older than 24h to avoid race)
          const filePath = path.join(testImagesDir, file);
          const stats = await fs.stat(filePath);
          if (Date.now() - stats.mtimeMs > 24 * 60 * 60 * 1000) {
            await fs.unlink(filePath);
            deletedCount++;
          }
        }
      }

      console.log(`[CLEANUP] Deleted ${deletedCount} unused files (${files.length} total, ${referencedUrls.size} referenced)`);
      return deletedCount;
    } catch (error) {
      console.error('[CLEANUP] Error:', error);
      return 0;
    }
  }

  /**
   * Barcha statistikani ko'rsatish
   */
  async getStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    byFolder: Record<string, { files: number; size: number }>;
  }> {
    try {
      const stats = {
        totalFiles: 0,
        totalSize: 0,
        byFolder: {} as Record<string, { files: number; size: number }>,
      };
      
      if (!fsSync.existsSync(this.uploadDir)) {
        return stats;
      }
      
      const folders = await fs.readdir(this.uploadDir);
      
      for (const folder of folders) {
        const folderPath = path.join(this.uploadDir, folder);
        const folderStats = await fs.stat(folderPath);
        
        if (folderStats.isDirectory()) {
          const files = await fs.readdir(folderPath);
          let folderSize = 0;
          
          for (const file of files) {
            const filePath = path.join(folderPath, file);
            const fileStats = await fs.stat(filePath);
            
            if (fileStats.isFile()) {
              folderSize += fileStats.size;
            }
          }
          
          stats.byFolder[folder] = {
            files: files.length,
            size: folderSize,
          };
          
          stats.totalFiles += files.length;
          stats.totalSize += folderSize;
        }
      }
      
      return stats;
    } catch (error) {
      console.error('❌ [CLEANUP] Error getting stats:', error);
      return {
        totalFiles: 0,
        totalSize: 0,
        byFolder: {},
      };
    }
  }

  /**
   * Barcha test fayllarni o'chirish (DANGER!)
   */
  async cleanupAllTestFiles(): Promise<number> {
    try {
      console.log('⚠️  [CLEANUP] Deleting ALL test files...');
      
      let deletedCount = 0;
      
      const testImagesDir = path.join(this.uploadDir, 'test-images');
      if (fsSync.existsSync(testImagesDir)) {
        const files = await fs.readdir(testImagesDir);
        
        for (const file of files) {
          const filePath = path.join(testImagesDir, file);
          await fs.unlink(filePath);
          deletedCount++;
        }
      }
      
      console.log(`✅ [CLEANUP] Deleted ${deletedCount} test files`);
      
      return deletedCount;
    } catch (error) {
      console.error('❌ [CLEANUP] Error:', error);
      return 0;
    }
  }

  /**
   * Fayl hajmini human-readable formatga o'tkazish
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  /**
   * Statistikani chiroyli ko'rsatish
   */
  async printStats(): Promise<void> {
    const stats = await this.getStats();
    
    console.log('\n' + '='.repeat(70));
    console.log('📊 UPLOADS STATISTIKASI');
    console.log('='.repeat(70));
    console.log(`Jami fayllar: ${stats.totalFiles}`);
    console.log(`Jami hajm: ${this.formatSize(stats.totalSize)}`);
    console.log('-'.repeat(70));
    
    for (const [folder, data] of Object.entries(stats.byFolder)) {
      console.log(`📁 ${folder}/`);
      console.log(`   Fayllar: ${data.files}`);
      console.log(`   Hajm: ${this.formatSize(data.size)}`);
    }
    
    console.log('='.repeat(70) + '\n');
  }
}
