# ArtMentor - AI-Powered Art Education for MentraOS Smart Glasses

ArtMentor transforms your Mentra smart glasses into a powerful art education tool with three core features:

## 🎨 Features

### 1. **Trace Projection**
- Projects edge-detected outlines onto your canvas/paper
- Uses HuggingFace computer vision models for edge detection
- Real-time camera calibration for accurate projection
- Perfect for learning line art and proportions

### 2. **Reference Image Display**
- Upload and display reference images in AR space
- Adjustable position, size, and opacity
- Multiple reference images support
- Spatial anchoring for consistent positioning

### 3. **3D Model Display**
- View 3D models for life drawing practice
- Generate 3D models from photos using depth estimation
- Pre-loaded geometric shapes (cube, sphere, cylinder)
- Real-time lighting and rotation controls

## 🚀 Quick Start

### 1. Set up your environment
```bash
# Copy environment variables
cp .env.example .env

# Edit .env with your API keys:
# - Get MentraOS API key from: https://console.mentra.glass/
# - Get HuggingFace API key from: https://huggingface.co/settings/tokens
```

### 2. Install dependencies
```bash
bun install
```

### 3. Run the app
```bash
bun run dev
```

### 4. Register your app
1. Go to [console.mentra.glass](https://console.mentra.glass/)
2. Create new app with package name from your `.env` file
3. Set your ngrok URL as the public URL

## 🎮 Controls

### Button Controls
- **Single Press**: Take photo and process based on current mode
- **Long Press**: Switch between modes (Trace → Reference → 3D Model)
- **Double Press**: Calibrate projection or access advanced controls

### Modes
1. **Trace Mode**: Processes photos for edge detection and projection
2. **Reference Mode**: Displays uploaded reference images
3. **3D Model Mode**: Shows 3D models for life drawing

## 📱 Web Interface

Access the web interface at `http://localhost:3000/webview` to:
- Upload reference images
- Upload 3D models (GLTF/OBJ format)
- View current AR overlays
- Switch between different references/models

## 🧠 AI Models Used

### Edge Detection & Trace Projection
- **Primary**: `Intel/dpt-large` - Depth estimation converted to edges
- **Alternative**: Custom Canny edge detection pipeline

### Depth Estimation & 3D Generation
- **Primary**: `Intel/dpt-large` - Monocular depth estimation
- **Secondary**: `depth-anything-v2` - Advanced depth estimation
- **3D Generation**: Custom depth-to-GLTF conversion

### Computer Vision Pipeline
- **Object Detection**: `facebook/detr-resnet-50` - For calibration
- **Scene Understanding**: `microsoft/dit-base-finetuned-ade`

## 📁 Project Structure

```
src/
├── index.ts                    # Main ArtMentor app
├── services/
│   ├── HuggingFaceService.ts   # AI model integration
│   ├── TraceProjectionService.ts # Edge detection & projection
│   ├── ReferenceImageService.ts # Reference image management
│   └── Model3DService.ts       # 3D model handling
views/
├── artmentor-viewer.ejs        # AR overlay WebView
└── photo-viewer.ejs           # Legacy photo viewer
storage/
├── references/                 # Uploaded reference images
└── models/                    # 3D models and generated meshes
```

## 🔧 Configuration

### Environment Variables
```env
PORT=3000                              # Server port
PACKAGE_NAME=com.yourname.artmentor    # MentraOS app package name
MENTRAOS_API_KEY=your_key_here        # MentraOS developer API key
HF_API_KEY=your_hf_key_here           # HuggingFace API key
```

### API Endpoints

- `POST /api/upload-reference` - Upload reference image
- `POST /api/upload-model` - Upload 3D model
- `GET /api/ar-overlay` - Get current AR overlay data
- `GET /api/trace-overlay` - Get trace projection image
- `GET /api/reference-overlay` - Get reference image overlay
- `GET /api/reference-images` - List uploaded reference images
- `GET /api/models` - List available 3D models

## 🎯 Use Cases

### Art Students
- **Proportion Practice**: Use trace projection to learn correct proportions
- **Reference Studies**: Display multiple references while drawing
- **Life Drawing**: Practice with 3D models when live models aren't available

### Art Educators
- **Interactive Lessons**: Project examples directly onto students' work
- **Progressive Learning**: Start with simple traces, advance to references
- **Skill Assessment**: Compare student work with projected guides

### Professional Artists
- **Concept Sketching**: Quick reference access during ideation
- **Plein Air Drawing**: Overlay references for complex scenes
- **Technical Drawing**: Use 3D models for accurate perspective

## 🔄 Workflow Examples

### Trace Projection Workflow
1. Switch to Trace mode (long press)
2. Either take photo of subject or upload reference image via web interface
3. Calibrate projection on your paper (double press)
4. Start drawing along the projected edges
5. Single press to update projection as needed

### Reference Image Workflow
1. Upload reference images via web interface
2. Switch to Reference mode (long press)
3. Select active reference from web interface
4. Adjust position and size using web controls
5. Draw while viewing the floating reference

### 3D Model Workflow
1. Switch to 3D Model mode (long press)
2. Select from pre-loaded shapes or upload custom models
3. Take photo to generate 3D model from depth (single press)
4. Use web interface to adjust lighting and rotation
5. Practice life drawing with the 3D reference

## 🛠 Development

### Adding New AI Models
1. Update `HuggingFaceService.ts` with new model endpoints
2. Implement processing logic in respective service files
3. Update AR overlay rendering in `artmentor-viewer.ejs`

### Custom 3D Models
- Support for GLTF and OBJ formats
- Automatic texture mapping from source images
- Basic geometric primitives included

### Calibration System
- Automatic paper/canvas corner detection
- Perspective transformation matrices
- Real-time projection alignment

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Test with actual Mentra hardware
5. Submit a pull request

## 📄 License

ISC License - See LICENSE file for details

## 🆘 Support

- MentraOS Documentation: [docs.mentra.glass](https://docs.mentra.glass)
- HuggingFace Models: [huggingface.co/models](https://huggingface.co/models)
- Discord Community: [Mentra Community](https://discord.gg/mentra)

---

**ArtMentor** - Bringing AI-powered art education to the future of wearable computing! 🎨✨