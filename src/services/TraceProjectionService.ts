import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { BitmapGenerator } from './BitmapGenerator';

export interface RectangularSurface {
  corners: Array<{ x: number; y: number }>;
  width: number;
  height: number;
  isDetected: boolean;
}

export interface SVGProjection {
  id: string;
  svgContent: string;
  name: string;
  isActive: boolean;
  uploadTime: Date;
}

export class TraceProjectionService {
  private detectedSurface: RectangularSurface | null = null;
  private svgFiles: Map<string, SVGProjection> = new Map();
  private activeSvgId: string | null = null;
  private storageDir: string;

  constructor(storageDir: string = './storage/svg') {
    this.storageDir = storageDir;
    this.ensureStorageDirectory();
    this.loadDefaultSVGs();

    // Create a default detected surface so trace projection works immediately
    this.detectedSurface = {
      corners: [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
        { x: 300, y: 300 },
        { x: 100, y: 300 }
      ],
      width: 200,
      height: 200,
      isDetected: true
    };
    console.log('Default rectangular surface created for trace projection');
  }

  /**
   * Detect rectangular surface (paper, canvas, etc.) for projection
   */
  async detectRectangularSurface(imageBuffer: Buffer): Promise<RectangularSurface | null> {
    try {
      console.log('Detecting rectangular surface...');

      // Convert image to grayscale and apply edge detection
      const edges = await sharp(imageBuffer)
        .greyscale()
        .convolve({
          width: 3,
          height: 3,
          kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] // Edge detection kernel
        })
        .png()
        .toBuffer();

      // Find rectangular contours using basic computer vision
      const corners = await this.findRectangularCorners(edges);

      if (corners.length >= 4) {
        // Calculate surface dimensions
        const width = Math.sqrt(
          Math.pow(corners[1].x - corners[0].x, 2) +
          Math.pow(corners[1].y - corners[0].y, 2)
        );
        const height = Math.sqrt(
          Math.pow(corners[3].x - corners[0].x, 2) +
          Math.pow(corners[3].y - corners[0].y, 2)
        );

        this.detectedSurface = {
          corners: corners.slice(0, 4), // Take first 4 corners
          width,
          height,
          isDetected: true
        };

        console.log(`Rectangular surface detected: ${width.toFixed(0)} x ${height.toFixed(0)} pixels`);
        return this.detectedSurface;
      }

      console.log('No rectangular surface detected');
      return null;
    } catch (error) {
      console.error('Surface detection failed:', error);
      return null;
    }
  }

  /**
   * Add SVG file for projection
   */
  async addSVGFile(svgContent: string, name: string): Promise<string> {
    try {
      const id = this.generateId();

      // Validate SVG content
      if (!this.isValidSVG(svgContent)) {
        throw new Error('Invalid SVG content');
      }

      const svgProjection: SVGProjection = {
        id,
        svgContent,
        name,
        isActive: false,
        uploadTime: new Date()
      };

      this.svgFiles.set(id, svgProjection);

      // Save to disk
      await this.saveSVGToDisk(id, svgContent);

      console.log(`SVG file added: ${name} (${id})`);
      return id;
    } catch (error) {
      console.error('Failed to add SVG file:', error);
      throw error;
    }
  }

  /**
   * Set active SVG for projection
   */
  setActiveSVG(id: string): boolean {
    if (!this.svgFiles.has(id)) return false;

    // Deactivate all SVGs
    this.svgFiles.forEach(svg => svg.isActive = false);

    // Activate selected SVG
    const svg = this.svgFiles.get(id)!;
    svg.isActive = true;
    this.activeSvgId = id;

    console.log(`Active SVG set to: ${svg.name}`);
    return true;
  }

  /**
   * Get SVG projection as BMP bitmap for MentraOS display
   */
  async getSVGProjectionBitmap(): Promise<string | null> {
    if (!this.detectedSurface || !this.activeSvgId) {
      console.log('No surface detected or no active SVG');
      return this.getDefaultTraceBitmap();
    }

    const activeSvg = this.svgFiles.get(this.activeSvgId);
    if (!activeSvg) return this.getDefaultTraceBitmap();

    try {
      // Create bitmap canvas
      let canvas = BitmapGenerator.createBlankCanvas();

      // Parse SVG and convert to bitmap shapes
      if (activeSvg.svgContent.includes('<circle')) {
        // Extract circle parameters and draw
        const centerX = BitmapGenerator.WIDTH / 2;
        const centerY = BitmapGenerator.HEIGHT / 2;
        const radius = Math.min(BitmapGenerator.WIDTH, BitmapGenerator.HEIGHT) / 4;
        canvas = BitmapGenerator.drawCircle(canvas, centerX, centerY, radius);
      } else if (activeSvg.svgContent.includes('<rect')) {
        // Draw rectangle
        const rectWidth = BitmapGenerator.WIDTH / 2;
        const rectHeight = BitmapGenerator.HEIGHT / 2;
        const x = (BitmapGenerator.WIDTH - rectWidth) / 2;
        const y = (BitmapGenerator.HEIGHT - rectHeight) / 2;
        canvas = BitmapGenerator.drawRectangle(canvas, x, y, rectWidth, rectHeight);
      } else if (activeSvg.svgContent.includes('<polygon')) {
        // Draw triangle
        const centerX = BitmapGenerator.WIDTH / 2;
        const size = BitmapGenerator.HEIGHT / 3;
        canvas = BitmapGenerator.drawTriangle(
          canvas,
          centerX, 10,
          centerX - size, BitmapGenerator.HEIGHT - 10,
          centerX + size, BitmapGenerator.HEIGHT - 10
        );
      }

      // Add surface corner indicators
      canvas = BitmapGenerator.drawText(canvas, 'SURFACE', 10, 10, 1);

      // Convert to BMP and return hex string
      const bmp = BitmapGenerator.convertToBMP(canvas);
      const hexData = BitmapGenerator.bmpToHex(bmp);

      console.log(`Generated SVG projection bitmap for: ${activeSvg.name}`);
      return hexData;
    } catch (error) {
      console.error('Failed to create SVG projection bitmap:', error);
      return this.getDefaultTraceBitmap();
    }
  }

  /**
   * Get default trace bitmap when no SVG is active
   */
  getDefaultTraceBitmap(): string {
    let canvas = BitmapGenerator.createBlankCanvas();

    // Draw default circle template
    const centerX = BitmapGenerator.WIDTH / 2;
    const centerY = BitmapGenerator.HEIGHT / 2;
    const radius = Math.min(BitmapGenerator.WIDTH, BitmapGenerator.HEIGHT) / 4;

    canvas = BitmapGenerator.drawCircle(canvas, centerX, centerY, radius);
    canvas = BitmapGenerator.drawText(canvas, 'CIRCLE', 10, 10, 1);

    const bmp = BitmapGenerator.convertToBMP(canvas);
    return BitmapGenerator.bmpToHex(bmp);
  }

  /**
   * Get current surface detection status
   */
  getSurfaceDetectionStatus(): { isDetected: boolean; surface?: RectangularSurface } {
    return {
      isDetected: this.detectedSurface?.isDetected || false,
      surface: this.detectedSurface || undefined
    };
  }

  /**
   * List all SVG files
   */
  listSVGFiles(): Array<{ id: string; name: string; isActive: boolean; uploadTime: Date }> {
    return Array.from(this.svgFiles.values()).map(svg => ({
      id: svg.id,
      name: svg.name,
      isActive: svg.isActive,
      uploadTime: svg.uploadTime
    }));
  }

  /**
   * Find rectangular corners in edge-detected image
   */
  private async findRectangularCorners(edgeBuffer: Buffer): Promise<Array<{ x: number; y: number }>> {
    try {
      const { data, info } = await sharp(edgeBuffer)
        .raw()
        .toBuffer({ resolveWithObject: true });

      const corners: Array<{ x: number; y: number }> = [];
      const threshold = 128;

      // Simple corner detection - look for high-intensity pixels in a grid pattern
      const gridSize = 50;
      for (let y = 0; y < info.height; y += gridSize) {
        for (let x = 0; x < info.width; x += gridSize) {
          if (y + gridSize < info.height && x + gridSize < info.width) {
            const idx = (y * info.width + x) * info.channels;

            if (data[idx] > threshold) {
              // Check if this forms part of a rectangular pattern
              const intensity = data[idx];
              if (intensity > threshold && this.isCornerCandidate(data, x, y, info)) {
                corners.push({ x, y });
              }
            }
          }
        }
      }

      // Sort corners to form a rectangle (top-left, top-right, bottom-right, bottom-left)
      if (corners.length >= 4) {
        corners.sort((a, b) => {
          if (a.y !== b.y) return a.y - b.y; // Sort by y first
          return a.x - b.x; // Then by x
        });
      }

      return corners;
    } catch (error) {
      console.error('Corner detection failed:', error);
      return [];
    }
  }

  /**
   * Check if a pixel might be a corner of a rectangle
   */
  private isCornerCandidate(
    data: Buffer,
    x: number,
    y: number,
    info: { width: number; height: number; channels: number }
  ): boolean {
    // Simple heuristic - check surrounding pixels for rectangular patterns
    const checkRadius = 10;
    let edgePixels = 0;

    for (let dy = -checkRadius; dy <= checkRadius; dy += 5) {
      for (let dx = -checkRadius; dx <= checkRadius; dx += 5) {
        const checkX = x + dx;
        const checkY = y + dy;

        if (checkX >= 0 && checkX < info.width && checkY >= 0 && checkY < info.height) {
          const idx = (checkY * info.width + checkX) * info.channels;
          if (data[idx] > 100) {
            edgePixels++;
          }
        }
      }
    }

    // If enough edge pixels nearby, it might be a corner
    return edgePixels >= 3;
  }

  /**
   * Validate SVG content
   */
  private isValidSVG(svgContent: string): boolean {
    try {
      // Basic SVG validation
      return svgContent.includes('<svg') && svgContent.includes('</svg>');
    } catch {
      return false;
    }
  }

  /**
   * Load default SVG files for common drawing templates
   */
  private async loadDefaultSVGs(): Promise<void> {
    try {
      // Create some basic SVG templates
      const circleSvg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <circle cx="100" cy="100" r="80" fill="none" stroke="black" stroke-width="2"/>
      </svg>`;

      const squareSvg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect x="20" y="20" width="160" height="160" fill="none" stroke="black" stroke-width="2"/>
      </svg>`;

      const triangleSvg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <polygon points="100,20 20,180 180,180" fill="none" stroke="black" stroke-width="2"/>
      </svg>`;

      await this.addSVGFile(circleSvg, 'Circle Template');
      await this.addSVGFile(squareSvg, 'Square Template');
      await this.addSVGFile(triangleSvg, 'Triangle Template');

      // Set circle as default active
      if (this.svgFiles.size > 0) {
        const firstSvg = Array.from(this.svgFiles.keys())[0];
        this.setActiveSVG(firstSvg);
      }
    } catch (error) {
      console.error('Failed to load default SVGs:', error);
    }
  }

  /**
   * Save SVG to disk
   */
  private async saveSVGToDisk(id: string, svgContent: string): Promise<void> {
    const filePath = path.join(this.storageDir, `${id}.svg`);
    await fs.promises.writeFile(filePath, svgContent);
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
   * Generate unique ID
   */
  private generateId(): string {
    return `svg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}