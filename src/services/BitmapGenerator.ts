import sharp from 'sharp';

/**
 * Bitmap Generator for MentraOS 526x100 monochrome displays
 * Generates BMP files that can be displayed using session.layouts.showBitmapView()
 */
export class BitmapGenerator {
  static readonly WIDTH = 526;
  static readonly HEIGHT = 100;

  /**
   * Create a blank bitmap canvas
   */
  static createBlankCanvas(): Buffer {
    // Create a white (255) background image
    return Buffer.from(Array(BitmapGenerator.WIDTH * BitmapGenerator.HEIGHT).fill(255));
  }

  /**
   * Draw a circle on the canvas
   */
  static drawCircle(canvas: Buffer, centerX: number, centerY: number, radius: number, filled = false): Buffer {
    const result = Buffer.from(canvas);

    for (let y = 0; y < BitmapGenerator.HEIGHT; y++) {
      for (let x = 0; x < BitmapGenerator.WIDTH; x++) {
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        const pixelIndex = y * BitmapGenerator.WIDTH + x;

        if (filled) {
          if (distance <= radius) {
            result[pixelIndex] = 0; // Black pixel
          }
        } else {
          // Draw outline (2 pixel thickness for visibility)
          if (distance <= radius && distance >= radius - 2) {
            result[pixelIndex] = 0; // Black pixel
          }
        }
      }
    }

    return result;
  }

  /**
   * Draw a rectangle on the canvas
   */
  static drawRectangle(canvas: Buffer, x: number, y: number, width: number, height: number, filled = false): Buffer {
    const result = Buffer.from(canvas);

    for (let py = Math.max(0, y); py < Math.min(BitmapGenerator.HEIGHT, y + height); py++) {
      for (let px = Math.max(0, x); px < Math.min(BitmapGenerator.WIDTH, x + width); px++) {
        const pixelIndex = py * BitmapGenerator.WIDTH + px;

        if (filled) {
          result[pixelIndex] = 0; // Black pixel
        } else {
          // Draw outline (2 pixel thickness)
          if (px <= x + 1 || px >= x + width - 2 || py <= y + 1 || py >= y + height - 2) {
            result[pixelIndex] = 0; // Black pixel
          }
        }
      }
    }

    return result;
  }

  /**
   * Draw a triangle on the canvas
   */
  static drawTriangle(canvas: Buffer, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, filled = false): Buffer {
    const result = Buffer.from(canvas);

    // Simple triangle drawing using line drawing
    result = BitmapGenerator.drawLine(result, x1, y1, x2, y2);
    result = BitmapGenerator.drawLine(result, x2, y2, x3, y3);
    result = BitmapGenerator.drawLine(result, x3, y3, x1, y1);

    return result;
  }

  /**
   * Draw a line on the canvas (Bresenham's algorithm)
   */
  static drawLine(canvas: Buffer, x1: number, y1: number, x2: number, y2: number, thickness = 2): Buffer {
    const result = Buffer.from(canvas);

    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;

    let x = x1;
    let y = y1;

    while (true) {
      // Draw thick line by drawing multiple pixels
      for (let tx = -Math.floor(thickness/2); tx <= Math.floor(thickness/2); tx++) {
        for (let ty = -Math.floor(thickness/2); ty <= Math.floor(thickness/2); ty++) {
          const px = x + tx;
          const py = y + ty;

          if (px >= 0 && px < BitmapGenerator.WIDTH && py >= 0 && py < BitmapGenerator.HEIGHT) {
            const pixelIndex = py * BitmapGenerator.WIDTH + px;
            result[pixelIndex] = 0; // Black pixel
          }
        }
      }

      if (x === x2 && y === y2) break;

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }

    return result;
  }

  /**
   * Add text to the canvas (simplified bitmap font)
   */
  static drawText(canvas: Buffer, text: string, x: number, y: number, scale = 1): Buffer {
    const result = Buffer.from(canvas);

    // Simple 5x7 bitmap font patterns for basic characters
    const font: { [char: string]: number[] } = {
      'A': [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
      'R': [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
      'T': [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
      'C': [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
      'I': [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
      'L': [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
      'E': [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
      '3': [0x1f, 0x01, 0x01, 0x0f, 0x01, 0x01, 0x1f],
      'D': [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
      ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    };

    let currentX = x;

    for (const char of text.toUpperCase()) {
      const pattern = font[char] || font[' '];

      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (pattern[row] & (1 << (4 - col))) {
            // Draw scaled pixel
            for (let sy = 0; sy < scale; sy++) {
              for (let sx = 0; sx < scale; sx++) {
                const px = currentX + col * scale + sx;
                const py = y + row * scale + sy;

                if (px >= 0 && px < BitmapGenerator.WIDTH && py >= 0 && py < BitmapGenerator.HEIGHT) {
                  const pixelIndex = py * BitmapGenerator.WIDTH + px;
                  result[pixelIndex] = 0; // Black pixel
                }
              }
            }
          }
        }
      }

      currentX += (5 * scale) + scale; // Character width + spacing
    }

    return result;
  }

  /**
   * Convert a regular image to 526x100 monochrome bitmap
   */
  static async convertImageToBitmap(imageBuffer: Buffer): Promise<Buffer> {
    try {
      // Resize and convert to grayscale
      const processed = await sharp(imageBuffer)
        .resize(BitmapGenerator.WIDTH, BitmapGenerator.HEIGHT, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
        .greyscale()
        .raw()
        .toBuffer();

      // Apply simple threshold for monochrome conversion
      const result = Buffer.alloc(BitmapGenerator.WIDTH * BitmapGenerator.HEIGHT);
      for (let i = 0; i < processed.length; i++) {
        result[i] = processed[i] < 128 ? 0 : 255; // Threshold at middle gray
      }

      return result;
    } catch (error) {
      console.error('Error converting image to bitmap:', error);
      return BitmapGenerator.createBlankCanvas();
    }
  }

  /**
   * Convert raw pixel data to BMP format for MentraOS
   */
  static convertToBMP(pixels: Buffer): Buffer {
    const width = BitmapGenerator.WIDTH;
    const height = BitmapGenerator.HEIGHT;

    // BMP file structure
    const fileHeaderSize = 14;
    const infoHeaderSize = 40;
    const colorsInPalette = 2; // Monochrome (black and white)
    const paletteSize = colorsInPalette * 4;

    // Calculate row padding (BMP rows must be multiple of 4 bytes)
    const bytesPerRow = Math.ceil(width / 8); // 1 bit per pixel
    const paddedBytesPerRow = Math.ceil(bytesPerRow / 4) * 4;
    const pixelDataSize = paddedBytesPerRow * height;

    const fileSize = fileHeaderSize + infoHeaderSize + paletteSize + pixelDataSize;

    const buffer = Buffer.alloc(fileSize);
    let offset = 0;

    // BMP File Header (14 bytes)
    buffer.write('BM', offset, 'ascii'); offset += 2;
    buffer.writeUInt32LE(fileSize, offset); offset += 4;
    buffer.writeUInt16LE(0, offset); offset += 2; // Reserved
    buffer.writeUInt16LE(0, offset); offset += 2; // Reserved
    buffer.writeUInt32LE(fileHeaderSize + infoHeaderSize + paletteSize, offset); offset += 4;

    // BMP Info Header (40 bytes)
    buffer.writeUInt32LE(infoHeaderSize, offset); offset += 4;
    buffer.writeInt32LE(width, offset); offset += 4;
    buffer.writeInt32LE(height, offset); offset += 4;
    buffer.writeUInt16LE(1, offset); offset += 2; // Planes
    buffer.writeUInt16LE(1, offset); offset += 2; // Bits per pixel (monochrome)
    buffer.writeUInt32LE(0, offset); offset += 4; // Compression
    buffer.writeUInt32LE(pixelDataSize, offset); offset += 4;
    buffer.writeInt32LE(2835, offset); offset += 4; // X pixels per meter
    buffer.writeInt32LE(2835, offset); offset += 4; // Y pixels per meter
    buffer.writeUInt32LE(colorsInPalette, offset); offset += 4;
    buffer.writeUInt32LE(0, offset); offset += 4; // Important colors

    // Color palette (8 bytes for monochrome)
    buffer.writeUInt32LE(0x00000000, offset); offset += 4; // Black
    buffer.writeUInt32LE(0x00FFFFFF, offset); offset += 4; // White

    // Pixel data (BMP is bottom-up, so we need to flip vertically)
    for (let y = height - 1; y >= 0; y--) {
      let byteValue = 0;
      let bitPosition = 7;

      for (let x = 0; x < width; x++) {
        const pixelIndex = y * width + x;
        const pixelValue = pixels[pixelIndex] === 0 ? 1 : 0; // 1 for black, 0 for white in bitmap

        byteValue |= (pixelValue << bitPosition);
        bitPosition--;

        if (bitPosition < 0 || x === width - 1) {
          buffer[offset++] = byteValue;
          byteValue = 0;
          bitPosition = 7;
        }
      }

      // Add padding bytes
      while ((offset - (fileHeaderSize + infoHeaderSize + paletteSize)) % paddedBytesPerRow !== 0) {
        buffer[offset++] = 0;
      }
    }

    return buffer;
  }

  /**
   * Convert BMP buffer to hex string for MentraOS BitmapView
   */
  static bmpToHex(bmpBuffer: Buffer): string {
    return bmpBuffer.toString('hex').toLowerCase();
  }

  /**
   * Create a simple test pattern
   */
  static createTestPattern(): string {
    let canvas = BitmapGenerator.createBlankCanvas();

    // Draw border
    canvas = BitmapGenerator.drawRectangle(canvas, 5, 5, BitmapGenerator.WIDTH - 10, BitmapGenerator.HEIGHT - 10);

    // Draw center circle
    canvas = BitmapGenerator.drawCircle(canvas, BitmapGenerator.WIDTH / 2, BitmapGenerator.HEIGHT / 2, 30);

    // Add text
    canvas = BitmapGenerator.drawText(canvas, 'ARTMENTOR', 50, 20, 2);

    const bmp = BitmapGenerator.convertToBMP(canvas);
    return BitmapGenerator.bmpToHex(bmp);
  }
}