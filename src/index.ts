import 'dotenv/config';
import { AppServer, AppSession, ViewType, AuthenticatedRequest, PhotoData } from '@mentra/sdk';
import { Request, Response } from 'express';
import * as ejs from 'ejs';
import * as path from 'path';
import multer from 'multer';
import { TraceProjectionService } from './services/TraceProjectionService';
import { ReferenceImageService } from './services/ReferenceImageService';
import { Model3DService } from './services/Model3DService';
import { BitmapGenerator } from './services/BitmapGenerator';

/**
 * Interface representing app mode states
 */
enum AppMode {
  TRACE_PROJECTION = 'trace',
  REFERENCE_IMAGE = 'reference',
  MODEL_3D = 'model3d'
}

/**
 * Interface representing a stored photo with metadata
 */
interface StoredPhoto {
  requestId: string;
  buffer: Buffer;
  timestamp: Date;
  userId: string;
  mimeType: string;
  filename: string;
  size: number;
}

const PACKAGE_NAME = process.env.PACKAGE_NAME ?? (() => { throw new Error('PACKAGE_NAME is not set in .env file'); })();
const MENTRAOS_API_KEY = process.env.MENTRAOS_API_KEY ?? (() => { throw new Error('MENTRAOS_API_KEY is not set in .env file'); })();
const HF_API_KEY = process.env.HF_API_KEY ?? (() => { throw new Error('HF_API_KEY is not set in .env file'); })();
const PORT = parseInt(process.env.PORT || '3000');

/**
 * ArtMentor: Art Education App for MentraOS Smart Glasses
 * Provides trace projection, reference image display, and 3D model features
 */
class ArtMentorApp extends AppServer {
  private photos: Map<string, StoredPhoto> = new Map();
  private latestPhotoTimestamp: Map<string, number> = new Map();
  private isStreamingPhotos: Map<string, boolean> = new Map();
  private nextPhotoTime: Map<string, number> = new Map();

  // Art education services
  private traceProjectionService: TraceProjectionService;
  private referenceImageService: ReferenceImageService;
  private model3DService: Model3DService;

  // User state management
  private currentMode: Map<string, AppMode> = new Map();
  private upload: multer.Multer;

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
    });

    // Initialize art education services
    this.traceProjectionService = new TraceProjectionService('./storage/svg');
    this.referenceImageService = new ReferenceImageService('./storage/references');
    this.model3DService = new Model3DService('./storage/models');

    // Setup file upload
    this.upload = multer({ storage: multer.memoryStorage() });

    this.setupWebviewRoutes();
    this.setupArtRoutes();
    this.setupTestRoutes();
  }


  /**
   * Handle new session creation and button press events
   */
  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    this.logger.info(`ArtMentor session started for user ${userId}`);

    // Initialize user state
    this.isStreamingPhotos.set(userId, false);
    this.nextPhotoTime.set(userId, Date.now());
    this.currentMode.set(userId, AppMode.TRACE_PROJECTION);

    // Show initial mode status
    session.layouts.showTextWall("ArtMentor Ready\nMode: Trace Projection\nPress to take photo, hold to switch mode", { durationMs: 3000 });

    // Handle button presses for different modes
    session.events.onButtonPress(async (button) => {
      this.logger.info(`Button pressed: ${button.buttonId}, type: ${button.pressType}`);

      if (button.pressType === 'long') {
        // Switch modes on long press
        this.switchMode(userId, session);
        return;
      } else if (button.pressType === 'double') {
        // Calibrate or toggle overlay visibility on double press
        await this.handleCalibrationOrToggle(userId, session);
        return;
      } else {
        // Handle single press - show BitmapView without camera for testing
        await this.handleSinglePressWithoutCamera(userId, session);
      }
    });

    // Continuous processing loop for real-time features
    setInterval(async () => {
      try {
        const currentMode = this.currentMode.get(userId);

        if (currentMode === AppMode.TRACE_PROJECTION) {
          // Check if we need to update trace projection
          if (this.isStreamingPhotos.get(userId)) {
            await this.updateTraceProjection(userId, session);
          }
        }
      } catch (error) {
        this.logger.error(`Error in processing loop: ${error}`);
      }
    }, 1000);
  }

  protected async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
    // Clean up user state
    this.isStreamingPhotos.set(userId, false);
    this.nextPhotoTime.delete(userId);
    this.currentMode.delete(userId);
    this.logger.info(`ArtMentor session stopped for user ${userId}, reason: ${reason}`);
  }

  /**
   * Switch between app modes (trace, reference, 3D model)
   */
  private switchMode(userId: string, session: AppSession): void {
    const currentMode = this.currentMode.get(userId) || AppMode.TRACE_PROJECTION;
    let newMode: AppMode;

    switch (currentMode) {
      case AppMode.TRACE_PROJECTION:
        newMode = AppMode.REFERENCE_IMAGE;
        break;
      case AppMode.REFERENCE_IMAGE:
        newMode = AppMode.MODEL_3D;
        break;
      case AppMode.MODEL_3D:
        newMode = AppMode.TRACE_PROJECTION;
        break;
      default:
        newMode = AppMode.TRACE_PROJECTION;
    }

    this.currentMode.set(userId, newMode);
    session.layouts.showTextWall(`Mode switched to: ${this.getModeDisplayName(newMode)}`, { durationMs: 2000 });
    this.logger.info(`User ${userId} switched to mode: ${newMode}`);
  }

  /**
   * Handle calibration or toggle overlay visibility
   */
  private async handleCalibrationOrToggle(userId: string, session: AppSession): Promise<void> {
    const currentMode = this.currentMode.get(userId);

    switch (currentMode) {
      case AppMode.TRACE_PROJECTION:
        try {
          const photo = await session.camera.requestPhoto();
          const surface = await this.traceProjectionService.detectRectangularSurface(photo.buffer);
          if (surface) {
            // Show detection success with bitmap
            const bitmapHex = await this.traceProjectionService.getSVGProjectionBitmap();
            if (bitmapHex) {
              session.layouts.showBitmapView(bitmapHex);
            }
            session.layouts.showTextWall("Surface detected and calibrated!", { durationMs: 2000 });
          } else {
            session.layouts.showTextWall("No surface detected - try again", { durationMs: 2000 });
          }
        } catch (error) {
          session.layouts.showTextWall("Calibration error", { durationMs: 2000 });
        }
        break;

      case AppMode.REFERENCE_IMAGE:
        session.layouts.showTextWall("Reference image controls available", { durationMs: 2000 });
        break;

      case AppMode.MODEL_3D:
        session.layouts.showTextWall("3D model controls available", { durationMs: 2000 });
        break;
    }
  }

  /**
   * Handle single press without camera - shows simple bitmap rectangles for testing
   */
  private async handleSinglePressWithoutCamera(userId: string, session: AppSession): Promise<void> {
    const currentMode = this.currentMode.get(userId);

    try {
      // Create a simple test bitmap - just rectangles
      const testBitmap = this.createSimpleTestBitmap(currentMode);

      session.layouts.showTextWall(`${this.getModeDisplayName(currentMode)} overlay...`, { durationMs: 1000 });

      // Try to show the bitmap
      session.layouts.showBitmapView(testBitmap);
      this.logger.info(`Simple test bitmap displayed for user ${userId} in ${currentMode} mode`);

    } catch (error) {
      this.logger.error(`Error displaying test bitmap: ${error}`);
      session.layouts.showTextWall("Error showing bitmap", { durationMs: 2000 });
    }
  }

  /**
   * Create a very simple test bitmap with rectangles
   */
  private createSimpleTestBitmap(mode: AppMode): string {
    // Create blank canvas
    let canvas = BitmapGenerator.createBlankCanvas();

    switch (mode) {
      case AppMode.TRACE_PROJECTION:
        // Simple rectangle
        canvas = BitmapGenerator.drawRectangle(canvas, 100, 20, 326, 60);
        canvas = BitmapGenerator.drawText(canvas, 'TRACE', 200, 40, 2);
        break;

      case AppMode.REFERENCE_IMAGE:
        // Two rectangles
        canvas = BitmapGenerator.drawRectangle(canvas, 50, 10, 200, 40);
        canvas = BitmapGenerator.drawRectangle(canvas, 276, 50, 200, 40);
        canvas = BitmapGenerator.drawText(canvas, 'REF', 220, 30, 1);
        break;

      case AppMode.MODEL_3D:
        // Three rectangles
        canvas = BitmapGenerator.drawRectangle(canvas, 50, 15, 100, 30);
        canvas = BitmapGenerator.drawRectangle(canvas, 200, 35, 100, 30);
        canvas = BitmapGenerator.drawRectangle(canvas, 350, 55, 100, 30);
        canvas = BitmapGenerator.drawText(canvas, '3D', 240, 25, 2);
        break;
    }

    // Convert to BMP and return base64
    const bmp = BitmapGenerator.convertToBMP(canvas);
    return bmp.toString('base64');
  }

  /**
   * Handle mode-specific actions on single button press (with camera)
   */
  private async handleModeSpecificAction(userId: string, session: AppSession): Promise<void> {
    const currentMode = this.currentMode.get(userId);

    try {
      const photo = await session.camera.requestPhoto();
      this.cachePhoto(photo, userId);

      switch (currentMode) {
        case AppMode.TRACE_PROJECTION:
          session.layouts.showTextWall("Processing for trace projection...", { durationMs: 1000 });
          await this.processTraceProjection(userId, photo.buffer, session);
          break;

        case AppMode.REFERENCE_IMAGE:
          session.layouts.showTextWall("Photo captured for reference", { durationMs: 1000 });
          await this.processReferenceImage(userId, photo.buffer, session);
          break;

        case AppMode.MODEL_3D:
          session.layouts.showTextWall("Generating 3D model...", { durationMs: 1000 });
          await this.process3DModel(userId, photo.buffer, session);
          break;
      }
    } catch (error) {
      this.logger.error(`Error in mode-specific action: ${error}`);
      session.layouts.showTextWall("Error processing photo", { durationMs: 2000 });
    }
  }

  /**
   * Process image for trace projection
   */
  private async processTraceProjection(userId: string, imageBuffer: Buffer, session: AppSession): Promise<void> {
    try {
      // Detect surface for projection
      const surface = await this.traceProjectionService.detectRectangularSurface(imageBuffer);
      if (surface) {
        this.logger.info(`Surface detected for user ${userId}`);

        // Get SVG projection bitmap
        const bitmapHex = await this.traceProjectionService.getSVGProjectionBitmap();
        if (bitmapHex) {
          // Display bitmap on MentraOS glasses
          session.layouts.showBitmapView(bitmapHex);
          session.layouts.showTextWall("Trace projection active", { durationMs: 2000 });
        }
      } else {
        session.layouts.showTextWall("No surface detected - try again", { durationMs: 2000 });
      }
    } catch (error) {
      this.logger.error(`Trace projection processing failed: ${error}`);
      session.layouts.showTextWall("Processing failed", { durationMs: 2000 });
    }
  }

  /**
   * Process image for reference display
   */
  private async processReferenceImage(userId: string, imageBuffer: Buffer, session: AppSession): Promise<void> {
    try {
      // Add image to reference service
      const imageId = await this.referenceImageService.addReferenceImage(imageBuffer, `Ref_${Date.now()}`);
      if (imageId) {
        this.referenceImageService.setActiveImage(imageId);

        // Get reference image bitmap
        const bitmapHex = await this.referenceImageService.getCurrentReferenceImageBitmap();
        if (bitmapHex) {
          // Display bitmap on MentraOS glasses
          session.layouts.showBitmapView(bitmapHex);
          session.layouts.showTextWall("Reference image displayed", { durationMs: 2000 });
        }
      }
    } catch (error) {
      this.logger.error(`Reference image processing failed: ${error}`);
      session.layouts.showTextWall("Image processing failed", { durationMs: 2000 });
    }
  }

  /**
   * Process image for 3D model generation
   */
  private async process3DModel(userId: string, imageBuffer: Buffer, session: AppSession): Promise<void> {
    try {
      // For now, just activate the default cube model
      // In the future, this could generate a model from the image
      const models = this.model3DService.listModels();
      if (models.length > 0) {
        this.model3DService.setActiveModel(models[0].id);

        // Get 3D model bitmap
        const bitmapHex = await this.model3DService.get3DModelBitmap();
        if (bitmapHex) {
          // Display bitmap on MentraOS glasses
          session.layouts.showBitmapView(bitmapHex);
          session.layouts.showTextWall("3D model displayed", { durationMs: 2000 });
        }
      } else {
        session.layouts.showTextWall("No 3D model available", { durationMs: 2000 });
      }
    } catch (error) {
      this.logger.error(`3D model processing failed: ${error}`);
      session.layouts.showTextWall("3D model processing failed", { durationMs: 2000 });
    }
  }

  /**
   * Update trace projection overlay
   */
  private async updateTraceProjection(userId: string, session: AppSession): Promise<void> {
    try {
      // Get current SVG projection bitmap
      const bitmapHex = await this.traceProjectionService.getSVGProjectionBitmap();
      if (bitmapHex) {
        // Display updated bitmap on MentraOS glasses
        session.layouts.showBitmapView(bitmapHex);
      }
    } catch (error) {
      this.logger.error(`Trace projection update failed: ${error}`);
    }
  }

  /**
   * Get display name for app mode
   */
  private getModeDisplayName(mode: AppMode): string {
    switch (mode) {
      case AppMode.TRACE_PROJECTION:
        return "Trace Projection";
      case AppMode.REFERENCE_IMAGE:
        return "Reference Image";
      case AppMode.MODEL_3D:
        return "3D Model";
      default:
        return "Unknown";
    }
  }

  /**
   * Cache a photo for display
   */
  private async cachePhoto(photo: PhotoData, userId: string) {
    // create a new stored photo object which includes the photo data and the user id
    const cachedPhoto: StoredPhoto = {
      requestId: photo.requestId,
      buffer: photo.buffer,
      timestamp: photo.timestamp,
      userId: userId,
      mimeType: photo.mimeType,
      filename: photo.filename,
      size: photo.size
    };

    // this example app simply stores the photo in memory for display in the webview, but you could also send the photo to an AI api,
    // or store it in a database or cloud storage, send it to roboflow, or do other processing here

    // cache the photo for display
    this.photos.set(userId, cachedPhoto);
    // update the latest photo timestamp
    this.latestPhotoTimestamp.set(userId, cachedPhoto.timestamp.getTime());
    this.logger.info(`Photo cached for user ${userId}, timestamp: ${cachedPhoto.timestamp}`);
  }


  /**
   * Set up art-specific API routes
   */
  private setupArtRoutes(): void {
    const app = this.getExpressApp();

    // Upload reference image
    app.post('/api/upload-reference', this.upload.single('image'), (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;

      if (!userId || !req.file) {
        res.status(400).json({ error: 'No file uploaded or user not authenticated' });
        return;
      }

      this.referenceImageService.addReferenceImage(
        req.file.buffer,
        req.file.originalname || 'Reference Image'
      ).then(imageId => {
        this.referenceImageService.setActiveImage(imageId);
        res.json({ success: true, imageId });
      }).catch(error => {
        res.status(500).json({ error: error.message });
      });
    });

    // Upload 3D model
    app.post('/api/upload-model', this.upload.single('model'), (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;

      if (!userId || !req.file) {
        res.status(400).json({ error: 'No file uploaded or user not authenticated' });
        return;
      }

      const modelData = req.file.buffer.toString('utf8');
      this.model3DService.addModel(
        modelData,
        req.file.originalname || '3D Model'
      ).then(modelId => {
        this.model3DService.setActiveModel(modelId);
        res.json({ success: true, modelId });
      }).catch(error => {
        res.status(500).json({ error: error.message });
      });
    });

    // Get current AR overlay data
    app.get('/api/ar-overlay', async (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;
      const mode = req.query.mode || this.currentMode.get(userId);

      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      try {
        let overlayData = null;

        switch (mode) {
          case AppMode.TRACE_PROJECTION:
            const svgOverlay = await this.traceProjectionService.getSVGProjectionOverlay();
            overlayData = svgOverlay ? { hasOverlay: true } : { hasOverlay: false };
            break;
          case AppMode.REFERENCE_IMAGE:
            const refImage = this.referenceImageService.getCurrentReferenceImageBuffer();
            overlayData = refImage ? { hasOverlay: true } : { hasOverlay: false };
            break;
          case AppMode.MODEL_3D:
            const modelData = this.model3DService.get3DModelSceneData();
            overlayData = modelData ? { hasOverlay: true } : { hasOverlay: false };
            break;
        }

        res.json({
          mode,
          hasOverlay: !!overlayData,
          overlayType: mode,
          timestamp: Date.now()
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get trace overlay image
    app.get('/api/trace-overlay', (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;

      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const overlay = this.traceProjectionService.getCurrentTraceOverlay();
      if (!overlay) {
        res.status(404).json({ error: 'No trace overlay available' });
        return;
      }

      res.set({
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache'
      });
      res.send(overlay);
    });

    // Get reference image overlay
    app.get('/api/reference-overlay', async (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;

      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      try {
        const overlay = await this.referenceImageService.createAROverlay(800, 600);
        if (!overlay) {
          res.status(404).json({ error: 'No reference overlay available' });
          return;
        }

        res.set({
          'Content-Type': 'image/png',
          'Cache-Control': 'no-cache'
        });
        res.send(overlay);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // List reference images
    app.get('/api/reference-images', (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;

      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const images = this.referenceImageService.listReferenceImages();
      res.json({ images });
    });

    // List 3D models
    app.get('/api/models', (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;

      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const models = this.model3DService.listModels();
      res.json({ models });
    });

    // Set active reference image
    app.post('/api/set-reference/:id', (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;
      const imageId = req.params.id;

      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const success = this.referenceImageService.setActiveImage(imageId);
      res.json({ success });
    });

    // Set active 3D model
    app.post('/api/set-model/:id', (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;
      const modelId = req.params.id;

      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const success = this.model3DService.setActiveModel(modelId);
      res.json({ success });
    });

    // Get 3D model scene data
    app.get('/api/model-scene', (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;

      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const sceneData = this.model3DService.get3DModelSceneData();
      if (!sceneData) {
        res.status(404).json({ error: 'No active 3D model' });
        return;
      }

      res.json(sceneData);
    });

    // List SVG files
    app.get('/api/svg-files', (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;

      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const svgFiles = this.traceProjectionService.listSVGFiles();
      res.json({ svgFiles });
    });

    // Upload SVG file
    app.post('/api/upload-svg', this.upload.single('svg'), (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;

      if (!userId || !req.file) {
        res.status(400).json({ error: 'No file uploaded or user not authenticated' });
        return;
      }

      const svgContent = req.file.buffer.toString('utf8');
      this.traceProjectionService.addSVGFile(
        svgContent,
        req.file.originalname || 'Uploaded SVG'
      ).then(svgId => {
        this.traceProjectionService.setActiveSVG(svgId);
        res.json({ success: true, svgId });
      }).catch(error => {
        res.status(500).json({ error: error.message });
      });
    });

    // Set active SVG
    app.post('/api/set-svg/:id', (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;
      const svgId = req.params.id;

      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const success = this.traceProjectionService.setActiveSVG(svgId);
      res.json({ success });
    });

    // Get SVG overlay image
    app.get('/api/svg-overlay', async (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;

      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      try {
        const overlay = await this.traceProjectionService.getSVGProjectionOverlay();
        if (!overlay) {
          res.status(404).json({ error: 'No SVG overlay available' });
          return;
        }

        res.set({
          'Content-Type': 'image/png',
          'Cache-Control': 'no-cache'
        });
        res.send(overlay);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get reference image
    app.get('/api/reference-image', (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;

      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const imageBuffer = this.referenceImageService.getCurrentReferenceImageBuffer();
      if (!imageBuffer) {
        res.status(404).json({ error: 'No reference image available' });
        return;
      }

      res.set({
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache'
      });
      res.send(imageBuffer);
    });
  }

  /**
   * Set up webview routes for AR display functionality
   */
  private setupWebviewRoutes(): void {
    const app = this.getExpressApp();

    // API endpoint to get the latest photo for the authenticated user
    app.get('/api/latest-photo', (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;

      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const photo = this.photos.get(userId);
      if (!photo) {
        res.status(404).json({ error: 'No photo available' });
        return;
      }

      res.json({
        requestId: photo.requestId,
        timestamp: photo.timestamp.getTime(),
        hasPhoto: true
      });
    });

    // API endpoint to get photo data
    app.get('/api/photo/:requestId', (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;
      const requestId = req.params.requestId;

      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const photo = this.photos.get(userId);
      if (!photo || photo.requestId !== requestId) {
        res.status(404).json({ error: 'Photo not found' });
        return;
      }

      res.set({
        'Content-Type': photo.mimeType,
        'Cache-Control': 'no-cache'
      });
      res.send(photo.buffer);
    });

    // Main webview route - displays the ArtMentor AR interface
    app.get('/webview', async (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;

      if (!userId) {
        res.status(401).send(`
          <html>
            <head><title>ArtMentor - Not Authenticated</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1>Please open this page from the MentraOS app</h1>
            </body>
          </html>
        `);
        return;
      }

      const currentMode = this.currentMode.get(userId) || AppMode.TRACE_PROJECTION;
      const templatePath = path.join(process.cwd(), 'views', 'artmentor-viewer.ejs');
      const html = await ejs.renderFile(templatePath, { currentMode });
      res.send(html);
    });

    // Legacy photo viewer route for compatibility
    app.get('/photo-viewer', async (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;

      if (!userId) {
        res.status(401).send('Not authenticated');
        return;
      }

      const templatePath = path.join(process.cwd(), 'views', 'photo-viewer.ejs');
      const html = await ejs.renderFile(templatePath, {});
      res.send(html);
    });
  }

  /**
   * Setup test routes for demonstrating BitmapView functionality
   */
  private setupTestRoutes(): void {
    const app = this.getExpressApp();

    // Root route with simple info
    app.get('/', (req, res) => {
      res.json({
        app: 'ArtMentor',
        status: 'running',
        package: PACKAGE_NAME,
        endpoints: {
          health: '/health',
          testBitmaps: '/test/bitmaps',
          testTrace: '/test/trace',
          testReference: '/test/reference',
          test3d: '/test/3d'
        },
        note: 'Use MentraOS app to connect, not browser'
      });
    });

    // Test bitmap generation endpoints
    app.get('/test/bitmaps', (req, res) => {
      const testPattern = this.traceProjectionService.getDefaultTraceBitmap();
      res.json({
        testPattern,
        instructions: 'This is a hex string of 526x100 monochrome BMP data for MentraOS BitmapView'
      });
    });

    app.get('/test/trace', async (req, res) => {
      const bitmap = await this.traceProjectionService.getSVGProjectionBitmap();
      res.json({ traceBitmap: bitmap });
    });

    app.get('/test/reference', async (req, res) => {
      const bitmap = this.referenceImageService.getDefaultReferenceBitmap();
      res.json({ referenceBitmap: bitmap });
    });

    app.get('/test/3d', async (req, res) => {
      const bitmap = await this.model3DService.get3DModelBitmap();
      res.json({ model3dBitmap: bitmap });
    });
  }
}



// Start the ArtMentor server
// DEV CONSOLE URL: https://console.mentra.glass/
// Get your webhook URL from ngrok (or whatever public URL you have)
const app = new ArtMentorApp();

app.start().catch(console.error);