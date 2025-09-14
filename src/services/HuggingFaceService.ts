import axios from 'axios';
import { createCanvas, loadImage } from 'canvas';
import sharp from 'sharp';

export interface EdgeDetectionResult {
  edges: Buffer;
  contours: Array<{ x: number; y: number }[]>;
  success: boolean;
}

export interface DepthEstimationResult {
  depthMap: Buffer;
  depthData: number[][];
  success: boolean;
}

export class HuggingFaceService {
  private apiKey: string;
  private baseUrl = 'https://api-inference.huggingface.co/models';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Detect edges in an image using HuggingFace models
   */
  async detectEdges(imageBuffer: Buffer): Promise<EdgeDetectionResult> {
    try {
      // Use DPT model for edge-like features detection
      const response = await axios.post(
        `${this.baseUrl}/Intel/dpt-large`,
        imageBuffer,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/octet-stream',
          },
          responseType: 'arraybuffer'
        }
      );

      // Process the response to extract edges
      const depthBuffer = Buffer.from(response.data);

      // Convert depth map to edge map using gradient computation
      const edges = await this.depthToEdges(depthBuffer);

      // Extract contours from edge map
      const contours = await this.extractContours(edges);

      return {
        edges,
        contours,
        success: true
      };
    } catch (error) {
      console.error('Edge detection failed:', error);
      return {
        edges: Buffer.alloc(0),
        contours: [],
        success: false
      };
    }
  }

  /**
   * Estimate depth from an image
   */
  async estimateDepth(imageBuffer: Buffer): Promise<DepthEstimationResult> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/Intel/dpt-large`,
        imageBuffer,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/octet-stream',
          },
          responseType: 'arraybuffer'
        }
      );

      const depthBuffer = Buffer.from(response.data);

      // Convert buffer to 2D depth array for processing
      const depthData = await this.bufferToDepthArray(depthBuffer);

      return {
        depthMap: depthBuffer,
        depthData,
        success: true
      };
    } catch (error) {
      console.error('Depth estimation failed:', error);
      return {
        depthMap: Buffer.alloc(0),
        depthData: [],
        success: false
      };
    }
  }

  /**
   * Convert depth map to edge detection using gradient computation
   */
  private async depthToEdges(depthBuffer: Buffer): Promise<Buffer> {
    try {
      // Use Sharp to process the depth map
      const image = sharp(depthBuffer);
      const { width, height } = await image.metadata();

      // Apply Sobel edge detection
      const edges = await image
        .greyscale()
        .convolve({
          width: 3,
          height: 3,
          kernel: [-1, -2, -1, 0, 0, 0, 1, 2, 1]
        })
        .png()
        .toBuffer();

      return edges;
    } catch (error) {
      console.error('Depth to edges conversion failed:', error);
      return Buffer.alloc(0);
    }
  }

  /**
   * Extract contours from edge image
   */
  private async extractContours(edgeBuffer: Buffer): Promise<Array<{ x: number; y: number }[]>> {
    try {
      const image = await loadImage(edgeBuffer);
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');

      ctx.drawImage(image, 0, 0);
      const imageData = ctx.getImageData(0, 0, image.width, image.height);

      // Simple contour extraction (can be enhanced with more sophisticated algorithms)
      const contours: Array<{ x: number; y: number }[]> = [];
      const visited = new Set<string>();

      for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
          const idx = (y * image.width + x) * 4;
          const intensity = imageData.data[idx];

          // If pixel is bright enough and not visited, trace contour
          if (intensity > 128 && !visited.has(`${x},${y}`)) {
            const contour = this.traceContour(imageData, x, y, visited);
            if (contour.length > 10) { // Only keep significant contours
              contours.push(contour);
            }
          }
        }
      }

      return contours;
    } catch (error) {
      console.error('Contour extraction failed:', error);
      return [];
    }
  }

  /**
   * Trace a contour starting from a point
   */
  private traceContour(
    imageData: ImageData,
    startX: number,
    startY: number,
    visited: Set<string>
  ): Array<{ x: number; y: number }> {
    const contour: Array<{ x: number; y: number }> = [];
    const stack = [{ x: startX, y: startY }];

    while (stack.length > 0) {
      const { x, y } = stack.pop()!;
      const key = `${x},${y}`;

      if (visited.has(key) || x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) {
        continue;
      }

      const idx = (y * imageData.width + x) * 4;
      const intensity = imageData.data[idx];

      if (intensity < 128) continue;

      visited.add(key);
      contour.push({ x, y });

      // Add 8-connected neighbors
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          stack.push({ x: x + dx, y: y + dy });
        }
      }
    }

    return contour;
  }

  /**
   * Convert depth buffer to 2D array
   */
  private async bufferToDepthArray(buffer: Buffer): Promise<number[][]> {
    try {
      const image = sharp(buffer);
      const { width, height } = await image.metadata();

      if (!width || !height) return [];

      const { data } = await image.raw().toBuffer({ resolveWithObject: true });
      const depthArray: number[][] = [];

      for (let y = 0; y < height; y++) {
        depthArray[y] = [];
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 3; // RGB
          const depth = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          depthArray[y][x] = depth / 255; // Normalize to 0-1
        }
      }

      return depthArray;
    } catch (error) {
      console.error('Buffer to depth array conversion failed:', error);
      return [];
    }
  }
}