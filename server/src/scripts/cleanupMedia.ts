import { MediaCleanupService } from '../services/mediaCleanupService';

/**
 * 🧹 MEDIA CLEANUP SCRIPT
 * 
 * Ishlatish:
 * npm run cleanup-media -- stats          # Statistikani ko'rsatish
 * npm run cleanup-media -- old 30         # 30 kundan eski fayllarni o'chirish
 * npm run cleanup-media -- all            # BARCHA test fayllarni o'chirish (DANGER!)
 */
async function main() {
  const service = new MediaCleanupService();
  
  const command = process.argv[2] || 'stats';
  
  try {
    switch (command) {
      case 'stats':
        await service.printStats();
        break;
        
      case 'old': {
        const days = parseInt(process.argv[3] || '30');
        console.log(`🧹 Cleaning files older than ${days} days...\n`);
        const deleted = await service.cleanupOldFiles(days);
        console.log(`\n✅ Deleted ${deleted} files`);
        await service.printStats();
        break;
      }
        
      case 'all': {
        console.log('⚠️  WARNING: This will delete ALL test files!');
        console.log('Press Ctrl+C to cancel...\n');
        
        // 3 soniya kutish
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const deleted = await service.cleanupAllTestFiles();
        console.log(`\n✅ Deleted ${deleted} files`);
        await service.printStats();
        break;
      }
        
      default:
        console.error('❌ Unknown command:', command);
        console.log('\nIshlatish:');
        console.log('  npm run cleanup-media -- stats');
        console.log('  npm run cleanup-media -- old 30');
        console.log('  npm run cleanup-media -- all');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
