import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * S3 Service for file storage
 * Supports both AWS S3 and MinIO (self-hosted S3-compatible storage)
 */
export class S3Service {
  private static client: S3Client;
  private static bucket: string;
  
  /**
   * Initialize S3 client
   */
  private static getClient(): S3Client {
    if (!this.client) {
      const useMinio = process.env.USE_MINIO === 'true';
      
      const config: any = {
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY || '',
          secretAccessKey: process.env.AWS_SECRET_KEY || ''
        }
      };
      
      // MinIO configuration
      if (useMinio && process.env.S3_ENDPOINT) {
        config.endpoint = process.env.S3_ENDPOINT;
        config.forcePathStyle = true; // Required for MinIO
      }
      
      this.client = new S3Client(config);
      this.bucket = process.env.S3_BUCKET || 'resultma-exports';
      
      console.log(`✅ S3 Service initialized (${useMinio ? 'MinIO' : 'AWS S3'})`);
    }
    
    return this.client;
  }
  
  /**
   * Upload file to S3
   * @param buffer File buffer
   * @param key File key (path)
   * @returns Signed URL for download
   */
  static async upload(buffer: Buffer, key: string): Promise<string> {
    const client = this.getClient();
    
    try {
      // Upload file
      await client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ContentDisposition: 'attachment'
      }));
      
      console.log(`✅ Uploaded to S3: ${key} (${(buffer.length / 1024).toFixed(2)} KB)`);
      
      // Generate signed URL (valid for 1 hour)
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key
        }),
        { expiresIn: 3600 } // 1 hour
      );
      
      return url;
      
    } catch (error: any) {
      console.error('❌ S3 upload error:', error);
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }
  
  /**
   * Get signed URL for existing file
   * @param key File key
   * @param expiresIn Expiration time in seconds (default: 1 hour)
   * @returns Signed URL
   */
  static async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const client = this.getClient();
    
    try {
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key
        }),
        { expiresIn }
      );
      
      return url;
      
    } catch (error: any) {
      console.error('❌ S3 getSignedUrl error:', error);
      throw new Error(`Failed to get signed URL: ${error.message}`);
    }
  }
  
  /**
   * Check if S3 is configured
   */
  static isConfigured(): boolean {
    return !!(
      process.env.AWS_ACCESS_KEY &&
      process.env.AWS_SECRET_KEY &&
      process.env.S3_BUCKET
    );
  }
}

export default S3Service;
