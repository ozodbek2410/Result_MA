import fs from 'fs/promises';
import path from 'path';

/**
 * Local File Service - fallback when S3 is not configured
 * Stores files locally and serves them via Express static route
 */
export class LocalFileService {
  private static readonly EXPORTS_DIR = path.join(process.cwd(), 'exports');
  
  /**
   * Get base URL from environment
   */
  private static getBaseUrl(): string {
    return process.env.BASE_URL || 'http://localhost:5000';
  }
  
  /**
   * Initialize exports directory
   */
  static async init(): Promise<void> {
    try {
      await fs.mkdir(this.EXPORTS_DIR, { recursive: true });
      console.log('✅ Local file storage initialized:', this.EXPORTS_DIR);
    } catch (error) {
      console.error('❌ Failed to initialize local storage:', error);
    }
  }
  
  /**
   * Upload file to local storage
   * @param buffer File buffer
   * @param key File key (path)
   * @returns Public URL for download
   */
  static async upload(buffer: Buffer, key: string): Promise<string> {
    try {
      // Create full path
      const filePath = path.join(this.EXPORTS_DIR, key);
      const dir = path.dirname(filePath);
      
      // Ensure directory exists
      await fs.mkdir(dir, { recursive: true });
      
      // Write file
      await fs.writeFile(filePath, buffer);
      
      console.log(`✅ Saved locally: ${key} (${(buffer.length / 1024).toFixed(2)} KB)`);
      
      // Return public URL
      const publicUrl = `${this.getBaseUrl()}/exports/${key}`;
      return publicUrl;
      
    } catch (error: any) {
      console.error('❌ Local file save error:', error);
      throw new Error(`Local file save failed: ${error.message}`);
    }
  }
  
  /**
   * Delete old files (cleanup)
   * @param maxAgeHours Maximum age in hours (default: 24)
   */
  static async cleanup(maxAgeHours: number = 24): Promise<void> {
    try {
      const now = Date.now();
      const maxAge = maxAgeHours * 60 * 60 * 1000;
      
      const deleteOldFiles = async (dir: string) => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            await deleteOldFiles(fullPath);
          } else {
            const stats = await fs.stat(fullPath);
            if (now - stats.mtimeMs > maxAge) {
              await fs.unlink(fullPath);
              console.log(`🗑️ Deleted old file: ${entry.name}`);
            }
          }
        }
      };
      
      await deleteOldFiles(this.EXPORTS_DIR);
      console.log('✅ Cleanup completed');
      
    } catch (error) {
      console.error('❌ Cleanup error:', error);
    }
  }
  
  /**
   * Check if local storage is available
   */
  static isAvailable(): boolean {
    return true; // Always available
  }
}

export default LocalFileService;
