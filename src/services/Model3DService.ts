import * as fs from 'fs';
import * as path from 'path';
import { BitmapGenerator } from './BitmapGenerator';

export interface Model3D {
  id: string;
  name: string;
  modelData: string; // GLTF/OBJ content or URL
  modelType: 'gltf' | 'obj' | 'url';
  isActive: boolean;
  uploadTime: Date;
}

export class Model3DService {
  private models: Map<string, Model3D> = new Map();
  private activeModelId: string | null = null;
  private storageDir: string;

  constructor(storageDir: string = './storage/models') {
    this.storageDir = storageDir;
    this.ensureStorageDirectory();
    this.loadDefaultModels();
  }

  /**
   * Add a 3D model from file content
   */
  async addModel(
    modelData: string,
    name: string,
    modelType: 'gltf' | 'obj' = 'gltf'
  ): Promise<string> {
    try {
      const id = this.generateId();

      const model: Model3D = {
        id,
        name,
        modelData,
        modelType,
        isActive: false,
        uploadTime: new Date()
      };

      this.models.set(id, model);

      // Save to persistent storage
      await this.saveModelToDisk(id, modelData, modelType);

      console.log(`3D model added: ${name} (${id})`);
      return id;
    } catch (error) {
      console.error('Failed to add 3D model:', error);
      throw error;
    }
  }

  /**
   * Add a 3D model from URL (for web-based models)
   */
  async addModelFromURL(url: string, name: string): Promise<string> {
    try {
      const id = this.generateId();

      const model: Model3D = {
        id,
        name,
        modelData: url,
        modelType: 'url',
        isActive: false,
        uploadTime: new Date()
      };

      this.models.set(id, model);
      console.log(`3D model from URL added: ${name} (${id})`);
      return id;
    } catch (error) {
      console.error('Failed to add 3D model from URL:', error);
      throw error;
    }
  }

  /**
   * Get a 3D model by ID
   */
  getModel(id: string): Model3D | null {
    return this.models.get(id) || null;
  }

  /**
   * Set active 3D model for projection
   */
  setActiveModel(id: string): boolean {
    if (!this.models.has(id)) return false;

    // Deactivate all models
    this.models.forEach(model => model.isActive = false);

    // Activate selected model
    const model = this.models.get(id)!;
    model.isActive = true;
    this.activeModelId = id;

    console.log(`Active 3D model set to: ${model.name}`);
    return true;
  }

  /**
   * Get active 3D model
   */
  getActiveModel(): Model3D | null {
    if (!this.activeModelId) return null;
    return this.models.get(this.activeModelId) || null;
  }

  /**
   * Get 3D model as BMP bitmap for MentraOS display
   */
  async get3DModelBitmap(): Promise<string | null> {
    const activeModel = this.getActiveModel();
    if (!activeModel) {
      console.log('No active 3D model');
      return this.getDefault3DBitmap();
    }

    try {
      // Create bitmap canvas
      let canvas = BitmapGenerator.createBlankCanvas();

      // Render wireframe representation of the 3D model
      if (activeModel.name.toLowerCase().includes('cube')) {
        canvas = this.renderCubeWireframe(canvas);
      } else {
        // Default to cube wireframe for unknown models
        canvas = this.renderCubeWireframe(canvas);
      }

      // Add model name label
      canvas = BitmapGenerator.drawText(canvas, activeModel.name.substring(0, 15).toUpperCase(), 5, 5, 1);

      // Convert to BMP and return hex string
      const bmp = BitmapGenerator.convertToBMP(canvas);
      const hexData = BitmapGenerator.bmpToHex(bmp);

      console.log(`Generated 3D model bitmap: ${activeModel.name}`);
      return hexData;
    } catch (error) {
      console.error('Failed to create 3D model bitmap:', error);
      return this.getDefault3DBitmap();
    }
  }

  /**
   * Render cube wireframe on bitmap canvas
   */
  private renderCubeWireframe(canvas: Buffer): Buffer {
    const centerX = BitmapGenerator.WIDTH / 2;
    const centerY = BitmapGenerator.HEIGHT / 2;
    const size = 30;
    const depth = 20;

    // Front face
    canvas = BitmapGenerator.drawRectangle(canvas, centerX - size, centerY - size, size * 2, size * 2);

    // Back face (offset for 3D effect)
    canvas = BitmapGenerator.drawRectangle(canvas, centerX - size + depth, centerY - size - depth, size * 2, size * 2);

    // Connect corners for 3D effect
    // Top-left connections
    canvas = BitmapGenerator.drawLine(canvas, centerX - size, centerY - size, centerX - size + depth, centerY - size - depth);
    // Top-right connections
    canvas = BitmapGenerator.drawLine(canvas, centerX + size, centerY - size, centerX + size + depth, centerY - size - depth);
    // Bottom-right connections
    canvas = BitmapGenerator.drawLine(canvas, centerX + size, centerY + size, centerX + size + depth, centerY + size - depth);
    // Bottom-left connections
    canvas = BitmapGenerator.drawLine(canvas, centerX - size, centerY + size, centerX - size + depth, centerY + size - depth);

    return canvas;
  }

  /**
   * Get default 3D bitmap when no model is active
   */
  getDefault3DBitmap(): string {
    let canvas = BitmapGenerator.createBlankCanvas();

    // Draw placeholder 3D shape
    canvas = this.renderCubeWireframe(canvas);
    canvas = BitmapGenerator.drawText(canvas, 'NO 3D MODEL', 10, 80, 1);

    const bmp = BitmapGenerator.convertToBMP(canvas);
    return BitmapGenerator.bmpToHex(bmp);
  }

  /**
   * Get 3D model scene data for WebGL/Three.js rendering (legacy method)
   */
  get3DModelSceneData(): any | null {
    const activeModel = this.getActiveModel();
    if (!activeModel) {
      console.log('No active 3D model');
      return null;
    }

    console.log(`Returning 3D model scene data: ${activeModel.name}`);

    return {
      model: {
        id: activeModel.id,
        name: activeModel.name,
        data: activeModel.modelData,
        type: activeModel.modelType,
        timestamp: Date.now()
      },
      // Default camera and lighting settings for AR
      camera: {
        position: { x: 0, y: 0, z: 5 },
        target: { x: 0, y: 0, z: 0 },
        fov: 45
      },
      lighting: {
        ambient: {
          color: 0x404040,
          intensity: 0.4
        },
        directional: {
          color: 0xffffff,
          intensity: 0.8,
          position: { x: 1, y: 1, z: 1 }
        }
      },
      // AR positioning in world space
      transform: {
        position: { x: 0, y: 0, z: -2 }, // 2 meters in front
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      }
    };
  }

  /**
   * List all available models
   */
  listModels(): Array<{ id: string; name: string; modelType: string; isActive: boolean; uploadTime: Date }> {
    return Array.from(this.models.values()).map(model => ({
      id: model.id,
      name: model.name,
      modelType: model.modelType,
      isActive: model.isActive,
      uploadTime: model.uploadTime
    }));
  }

  /**
   * Remove a 3D model
   */
  async removeModel(id: string): Promise<boolean> {
    try {
      if (!this.models.has(id)) return false;

      const model = this.models.get(id)!;
      this.models.delete(id);

      // Remove from disk if it's a file-based model
      if (model.modelType !== 'url') {
        await this.removeModelFromDisk(id, model.modelType);
      }

      if (this.activeModelId === id) {
        this.activeModelId = null;
      }

      console.log(`3D model removed: ${model.name}`);
      return true;
    } catch (error) {
      console.error('Failed to remove model:', error);
      return false;
    }
  }

  /**
   * Load some default/example 3D models
   */
  private async loadDefaultModels(): Promise<void> {
    try {
      // Add some basic geometric shapes as default models

      // Basic cube GLTF
      const cubeGLTF = this.createBasicCubeGLTF();
      await this.addModel(cubeGLTF, 'Basic Cube', 'gltf');

      // Example model URLs (these would need to be real URLs to work)
      // await this.addModelFromURL('https://example.com/models/sphere.gltf', 'Example Sphere');

      // Set cube as default active model
      if (this.models.size > 0) {
        const firstModel = Array.from(this.models.keys())[0];
        this.setActiveModel(firstModel);
      }
    } catch (error) {
      console.error('Failed to load default models:', error);
    }
  }

  /**
   * Create a basic cube GLTF for testing
   */
  private createBasicCubeGLTF(): string {
    return JSON.stringify({
      "asset": { "version": "2.0" },
      "scene": 0,
      "scenes": [{ "nodes": [0] }],
      "nodes": [{ "mesh": 0 }],
      "meshes": [{
        "primitives": [{
          "attributes": {
            "POSITION": 0,
            "NORMAL": 1
          },
          "indices": 2,
          "material": 0
        }]
      }],
      "materials": [{
        "pbrMetallicRoughness": {
          "baseColorFactor": [0.8, 0.2, 0.2, 1.0],
          "metallicFactor": 0.0,
          "roughnessFactor": 0.5
        }
      }],
      "accessors": [
        {
          "bufferView": 0,
          "componentType": 5126,
          "count": 8,
          "type": "VEC3",
          "min": [-1, -1, -1],
          "max": [1, 1, 1]
        },
        {
          "bufferView": 1,
          "componentType": 5126,
          "count": 8,
          "type": "VEC3"
        },
        {
          "bufferView": 2,
          "componentType": 5123,
          "count": 36,
          "type": "SCALAR"
        }
      ],
      "bufferViews": [
        {
          "buffer": 0,
          "byteOffset": 0,
          "byteLength": 96
        },
        {
          "buffer": 0,
          "byteOffset": 96,
          "byteLength": 96
        },
        {
          "buffer": 0,
          "byteOffset": 192,
          "byteLength": 72
        }
      ],
      "buffers": [{
        "byteLength": 264,
        "uri": "data:application/octet-stream;base64," + this.getCubeBufferData()
      }]
    });
  }

  /**
   * Generate cube buffer data
   */
  private getCubeBufferData(): string {
    // Cube vertices
    const vertices = new Float32Array([
      -1, -1, -1,  1, -1, -1,  1,  1, -1, -1,  1, -1,
      -1, -1,  1,  1, -1,  1,  1,  1,  1, -1,  1,  1
    ]);

    // Cube normals (simplified)
    const normals = new Float32Array([
      0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
      0, 0,  1,  0, 0,  1,  0, 0,  1,  0, 0,  1
    ]);

    // Cube indices
    const indices = new Uint16Array([
      0, 1, 2,  0, 2, 3,  4, 6, 5,  4, 7, 6,
      0, 4, 5,  0, 5, 1,  2, 1, 5,  2, 5, 6,
      2, 6, 7,  2, 7, 3,  0, 3, 7,  0, 7, 4
    ]);

    const buffer = new ArrayBuffer(vertices.byteLength + normals.byteLength + indices.byteLength);
    new Uint8Array(buffer, 0, vertices.byteLength).set(new Uint8Array(vertices.buffer));
    new Uint8Array(buffer, vertices.byteLength, normals.byteLength).set(new Uint8Array(normals.buffer));
    new Uint8Array(buffer, vertices.byteLength + normals.byteLength, indices.byteLength).set(new Uint8Array(indices.buffer));

    return Buffer.from(buffer).toString('base64');
  }

  /**
   * Save model to disk
   */
  private async saveModelToDisk(id: string, modelData: string, modelType: string): Promise<void> {
    const extension = modelType === 'gltf' ? '.gltf' : '.obj';
    const filePath = path.join(this.storageDir, `${id}${extension}`);
    await fs.promises.writeFile(filePath, modelData);
  }

  /**
   * Remove model from disk
   */
  private async removeModelFromDisk(id: string, modelType: string): Promise<void> {
    const extension = modelType === 'gltf' ? '.gltf' : '.obj';
    const filePath = path.join(this.storageDir, `${id}${extension}`);
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      console.warn('Could not remove model file:', error);
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
   * Generate unique ID
   */
  private generateId(): string {
    return `model_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}