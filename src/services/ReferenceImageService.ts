import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { BitmapGenerator } from './BitmapGenerator';

export interface ReferenceImage {
  id: string;
  buffer: Buffer;
  name: string;
  uploadTime: Date;
  isActive: boolean;
}

export class ReferenceImageService {
  private referenceImages: Map<string, ReferenceImage> = new Map();
  private storageDir: string;
  private activeImageId: string | null = null;

  constructor(storageDir: string = './storage/references') {
    this.storageDir = storageDir;
    this.ensureStorageDirectory();
  }

  /**
   * Add a new reference image for projection onto glass
   */
  async addReferenceImage(
    imageBuffer: Buffer,
    name: string
  ): Promise<string> {
    try {
      const id = this.generateId();

      // Process and optimize the image for AR projection
      const processedBuffer = await this.processImageForProjection(imageBuffer);

      const referenceImage: ReferenceImage = {
        id,
        buffer: processedBuffer,
        name,
        uploadTime: new Date(),
        isActive: false
      };

      this.referenceImages.set(id, referenceImage);

      // Save to persistent storage
      await this.saveImageToDisk(id, processedBuffer);

      console.log(`Reference image added: ${name} (${id})`);
      return id;
    } catch (error) {
      console.error('Failed to add reference image:', error);
      throw error;
    }
  }

  /**
   * Get a reference image by ID
   */
  getReferenceImage(id: string): ReferenceImage | null {
    return this.referenceImages.get(id) || null;
  }

  /**
   * Set active reference image for projection
   */
  setActiveImage(id: string): boolean {
    if (!this.referenceImages.has(id)) return false;

    // Deactivate all images
    this.referenceImages.forEach(img => img.isActive = false);

    // Activate selected image
    const image = this.referenceImages.get(id)!;
    image.isActive = true;
    this.activeImageId = id;

    console.log(`Active reference image set to: ${image.name}`);
    return true;
  }

  /**
   * Get active reference image
   */
  getActiveImage(): ReferenceImage | null {
    if (!this.activeImageId) return null;
    return this.referenceImages.get(this.activeImageId) || null;
  }

  /**
   * Get the current reference image as BMP bitmap for MentraOS display
   */
  async getCurrentReferenceImageBitmap(): Promise<string | null> {
    const activeImage = this.getActiveImage();
    if (!activeImage) {
      console.log('No active reference image');
      return this.getDefaultReferenceBitmap();
    }

    try {
      // Convert image to 526x100 monochrome bitmap
      const bitmapCanvas = await BitmapGenerator.convertImageToBitmap(activeImage.buffer);

      // Add image name label
      const labeledCanvas = BitmapGenerator.drawText(bitmapCanvas, activeImage.name.substring(0, 15).toUpperCase(), 5, 5, 1);

      // Convert to BMP and return hex string
      const bmp = BitmapGenerator.convertToBMP(labeledCanvas);
      const hexData = BitmapGenerator.bmpToHex(bmp);

      console.log(`Generated reference image bitmap: ${activeImage.name}`);
      return hexData;
    } catch (error) {
      console.error('Failed to create reference image bitmap:', error);
      return this.getDefaultReferenceBitmap();
    }
  }

  /**
   * Get default reference bitmap when no image is active
   */
  getDefaultReferenceBitmap(): string {
    let canvas = BitmapGenerator.createBlankCanvas();

    // Draw placeholder content
    canvas = BitmapGenerator.drawText(canvas, 'NO REFERENCE', 50, 30, 2);
    canvas = BitmapGenerator.drawText(canvas, 'UPLOAD IMAGE', 60, 60, 1);

    // Draw border
    canvas = BitmapGenerator.drawRectangle(canvas, 10, 10, BitmapGenerator.WIDTH - 20, BitmapGenerator.HEIGHT - 20);

    const bmp = BitmapGenerator.convertToBMP(canvas);
    return BitmapGenerator.bmpToHex(bmp);
  }

  /**
   * Get the current reference image buffer (legacy method)
   */
  getCurrentReferenceImageBuffer(): Buffer | null {
    const activeImage = this.getActiveImage();
    if (!activeImage) {
      console.log('No active reference image');
      return null;
    }

    console.log(`Returning reference image: ${activeImage.name}`);
    return activeImage.buffer;
  }

  /**
   * Remove a reference image
   */
  async removeReferenceImage(id: string): Promise<boolean> {
    try {
      if (!this.referenceImages.has(id)) return false;

      this.referenceImages.delete(id);

      // Remove from disk
      await this.removeImageFromDisk(id);

      if (this.activeImageId === id) {
        this.activeImageId = null;
      }

      return true;
    } catch (error) {
      console.error('Failed to remove reference image:', error);
      return false;
    }
  }

  /**
   * List all reference images
   */
  listReferenceImages(): Array<{ id: string; name: string; uploadTime: Date; isActive: boolean }> {
    return Array.from(this.referenceImages.values()).map(img => ({
      id: img.id,
      name: img.name,
      uploadTime: img.uploadTime,
      isActive: img.isActive
    }));
  }

  /**
   * Process uploaded image for MentraOS bitmap display
   */
  private async processImageForProjection(buffer: Buffer): Promise<Buffer> {
    try {
      // Process for high contrast monochrome conversion
      return await sharp(buffer)
        .resize(400, 300, { fit: 'inside', withoutEnlargement: true })
        .modulate({ brightness: 1.3, saturation: 0.8 }) // High contrast for monochrome
        .greyscale() // Convert to grayscale for better monochrome conversion
        .normalize() // Normalize contrast
        .png({ compressionLevel: 1 })
        .toBuffer();
    } catch (error) {
      console.error('Image processing failed:', error);
      return buffer;
    }
  }

  /**
   * Save image to persistent storage
   */
  private async saveImageToDisk(id: string, buffer: Buffer): Promise<void> {
    const filePath = path.join(this.storageDir, `${id}.png`);
    await fs.promises.writeFile(filePath, buffer);
  }

  /**
   * Remove image from persistent storage
   */
  private async removeImageFromDisk(id: string): Promise<void> {
    const filePath = path.join(this.storageDir, `${id}.png`);
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      // File might not exist, which is fine
      console.warn('Could not remove image file:', error);
    }
  }

  /**
   * Ensure storage directory exists
   */
  private ensureStorageDirectory(): void {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
    } catch (error) {
      console.error('Failed to create storage directory:', error);
    }
  }

  /**
   * Generate unique ID for reference images
   */
  private generateId(): string {
    return `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}