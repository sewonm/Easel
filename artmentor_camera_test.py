#!/usr/bin/env python3
"""
ArtMentor Camera Test - Python Version
Tests the same functionality as the MentraOS app using laptop camera
"""

import cv2
import numpy as np
import json
import os
from datetime import datetime
from enum import Enum
import argparse
from pathlib import Path

class AppMode(Enum):
    TRACE_PROJECTION = "trace"
    REFERENCE_IMAGE = "reference"
    MODEL_3D = "model3d"

class ArtMentorCameraTest:
    def __init__(self):
        self.camera = None
        self.current_mode = AppMode.TRACE_PROJECTION
        self.running = True

        # Services
        self.trace_service = TraceProjectionService()
        self.reference_service = ReferenceImageService()
        self.model3d_service = Model3DService()

        # State
        self.show_overlay = True
        self.surface_detected = False

        print("🎯 ArtMentor Camera Test initialized")
        print("📱 Controls:")
        print("   SPACE: Take photo/action")
        print("   M: Switch modes")
        print("   D: Double press action (detect surface/upload)")
        print("   O: Toggle overlay")
        print("   Q: Quit")

    def init_camera(self):
        """Initialize laptop camera"""
        self.camera = cv2.VideoCapture(0)
        if not self.camera.isOpened():
            print("❌ Could not open camera")
            return False

        # Set camera properties
        self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        self.camera.set(cv2.CAP_PROP_FPS, 30)

        print("✅ Camera initialized")
        return True

    def run(self):
        """Main app loop"""
        if not self.init_camera():
            return

        print(f"🚀 Starting ArtMentor Camera Test - Mode: {self.get_mode_name()}")

        while self.running:
            ret, frame = self.camera.read()
            if not ret:
                print("❌ Failed to read camera frame")
                break

            # Process frame
            display_frame = self.process_frame(frame)

            # Add UI overlay
            self.add_ui_overlay(display_frame)

            # Display
            cv2.imshow('ArtMentor Camera Test', display_frame)

            # Handle keyboard input
            key = cv2.waitKey(1) & 0xFF
            self.handle_key(key, frame)

        self.cleanup()

    def process_frame(self, frame):
        """Process camera frame and add overlays"""
        display_frame = frame.copy()

        if not self.show_overlay:
            return display_frame

        # Apply mode-specific overlays
        if self.current_mode == AppMode.TRACE_PROJECTION:
            display_frame = self.apply_trace_overlay(display_frame)
        elif self.current_mode == AppMode.REFERENCE_IMAGE:
            display_frame = self.apply_reference_overlay(display_frame)
        elif self.current_mode == AppMode.MODEL_3D:
            display_frame = self.apply_3d_overlay(display_frame)

        return display_frame

    def apply_trace_overlay(self, frame):
        """Apply SVG trace projection overlay"""
        if not self.surface_detected:
            # Draw detection hint
            h, w = frame.shape[:2]
            cv2.rectangle(frame, (w//4, h//4), (3*w//4, 3*h//4), (0, 255, 255), 2)
            cv2.putText(frame, "Place paper here and press D to detect",
                       (w//4, h//4-10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        else:
            # Get SVG overlay from service
            svg_overlay = self.trace_service.get_current_svg_overlay()
            if svg_overlay is not None:
                frame = self.blend_overlay(frame, svg_overlay)
            else:
                # Draw default circle template
                h, w = frame.shape[:2]
                center = (w//2, h//2)
                radius = min(w, h) // 6
                cv2.circle(frame, center, radius, (0, 255, 0), 3)
                cv2.putText(frame, "Circle Template", (center[0]-60, center[1]+radius+30),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        return frame

    def apply_reference_overlay(self, frame):
        """Apply reference image overlay"""
        ref_image = self.reference_service.get_current_reference()

        if ref_image is not None:
            frame = self.blend_overlay(frame, ref_image, alpha=0.6)
        else:
            # Show upload instructions
            h, w = frame.shape[:2]
            cv2.putText(frame, "No reference image loaded", (50, h//2),
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            cv2.putText(frame, "Press D to load image", (50, h//2 + 40),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

        return frame

    def apply_3d_overlay(self, frame):
        """Apply 3D model overlay (simplified 2D representation)"""
        model_data = self.model3d_service.get_current_model()

        if model_data:
            # Draw a simple 3D-looking cube
            h, w = frame.shape[:2]
            center_x, center_y = w//2, h//2
            size = 80

            # Cube faces
            # Front face
            pts1 = np.array([[center_x-size, center_y-size], [center_x+size, center_y-size],
                            [center_x+size, center_y+size], [center_x-size, center_y+size]], np.int32)
            cv2.fillPoly(frame, [pts1], (50, 50, 200))
            cv2.polylines(frame, [pts1], True, (255, 255, 255), 2)

            # Top face (3D effect)
            offset = 30
            pts2 = np.array([[center_x-size, center_y-size], [center_x+size, center_y-size],
                            [center_x+size-offset, center_y-size-offset], [center_x-size-offset, center_y-size-offset]], np.int32)
            cv2.fillPoly(frame, [pts2], (80, 80, 230))
            cv2.polylines(frame, [pts2], True, (255, 255, 255), 2)

            # Right face (3D effect)
            pts3 = np.array([[center_x+size, center_y-size], [center_x+size, center_y+size],
                            [center_x+size-offset, center_y+size-offset], [center_x+size-offset, center_y-size-offset]], np.int32)
            cv2.fillPoly(frame, [pts3], (30, 30, 170))
            cv2.polylines(frame, [pts3], True, (255, 255, 255), 2)

            # Add rotation animation effect
            import time
            angle = int(time.time() * 50) % 360
            cv2.putText(frame, f"3D Cube (rotating: {angle}°)", (center_x-80, center_y+size+40),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        else:
            h, w = frame.shape[:2]
            cv2.putText(frame, "No 3D model loaded", (50, h//2),
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)

        return frame

    def blend_overlay(self, background, overlay, alpha=0.7):
        """Blend overlay image with background"""
        try:
            # Resize overlay to fit background
            h, w = background.shape[:2]
            overlay_resized = cv2.resize(overlay, (w, h))

            # Convert to same format if needed
            if len(overlay_resized.shape) == 2:  # Grayscale
                overlay_resized = cv2.cvtColor(overlay_resized, cv2.COLOR_GRAY2BGR)

            # Blend images
            return cv2.addWeighted(background, 1-alpha, overlay_resized, alpha, 0)
        except Exception as e:
            print(f"❌ Error blending overlay: {e}")
            return background

    def add_ui_overlay(self, frame):
        """Add UI elements to frame"""
        h, w = frame.shape[:2]

        # Mode indicator
        mode_text = self.get_mode_name()
        cv2.rectangle(frame, (10, 10), (250, 60), (0, 0, 0), -1)
        cv2.putText(frame, f"Mode: {mode_text}", (20, 35),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

        # Status
        status = "Surface Detected" if self.surface_detected else "No Surface"
        if self.current_mode == AppMode.TRACE_PROJECTION:
            cv2.putText(frame, status, (20, 55),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0) if self.surface_detected else (255, 255, 0), 1)

        # Overlay toggle indicator
        overlay_status = "ON" if self.show_overlay else "OFF"
        cv2.putText(frame, f"Overlay: {overlay_status}", (w-150, 30),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0) if self.show_overlay else (0, 0, 255), 2)

    def handle_key(self, key, frame):
        """Handle keyboard input"""
        if key == ord('q'):
            self.running = False
        elif key == ord(' '):  # Space - single press action
            self.handle_single_press(frame)
        elif key == ord('m'):  # M - switch modes
            self.switch_mode()
        elif key == ord('d'):  # D - double press action
            self.handle_double_press(frame)
        elif key == ord('o'):  # O - toggle overlay
            self.show_overlay = not self.show_overlay
            print(f"🔄 Overlay: {'ON' if self.show_overlay else 'OFF'}")

    def handle_single_press(self, frame):
        """Handle single press action (like button press on glasses)"""
        print(f"📸 Single press - {self.get_mode_name()} mode")

        if self.current_mode == AppMode.TRACE_PROJECTION:
            print("📸 Photo taken for trace projection")
        elif self.current_mode == AppMode.REFERENCE_IMAGE:
            print("📸 Photo taken for reference")
        elif self.current_mode == AppMode.MODEL_3D:
            print("📸 Photo taken for 3D model")

    def handle_double_press(self, frame):
        """Handle double press action"""
        print(f"📸📸 Double press - {self.get_mode_name()} mode")

        if self.current_mode == AppMode.TRACE_PROJECTION:
            self.surface_detected = not self.surface_detected
            status = "detected" if self.surface_detected else "removed"
            print(f"🎯 Surface {status}")
        elif self.current_mode == AppMode.REFERENCE_IMAGE:
            self.load_reference_image()
        elif self.current_mode == AppMode.MODEL_3D:
            self.load_3d_model()

    def switch_mode(self):
        """Switch between app modes"""
        modes = list(AppMode)
        current_index = modes.index(self.current_mode)
        self.current_mode = modes[(current_index + 1) % len(modes)]
        print(f"🔄 Switched to: {self.get_mode_name()}")

    def get_mode_name(self):
        """Get display name for current mode"""
        names = {
            AppMode.TRACE_PROJECTION: "Trace Projection",
            AppMode.REFERENCE_IMAGE: "Reference Image",
            AppMode.MODEL_3D: "3D Model"
        }
        return names[self.current_mode]

    def load_reference_image(self):
        """Load reference image from file"""
        import tkinter as tk
        from tkinter import filedialog

        # Hide the root window
        root = tk.Tk()
        root.withdraw()

        # Open file dialog
        file_path = filedialog.askopenfilename(
            title="Select Reference Image",
            filetypes=[("Image files", "*.jpg *.jpeg *.png *.bmp *.tiff")]
        )

        if file_path:
            success = self.reference_service.load_image(file_path)
            if success:
                print(f"✅ Reference image loaded: {os.path.basename(file_path)}")
            else:
                print("❌ Failed to load reference image")

        root.destroy()

    def load_3d_model(self):
        """Load 3D model (simplified)"""
        self.model3d_service.load_default_model()
        print("✅ 3D model loaded (cube)")

    def cleanup(self):
        """Cleanup resources"""
        if self.camera:
            self.camera.release()
        cv2.destroyAllWindows()
        print("👋 ArtMentor Camera Test closed")


class TraceProjectionService:
    """Simplified trace projection service"""

    def __init__(self):
        self.svg_templates = self.load_svg_templates()
        self.current_svg = "circle"

    def load_svg_templates(self):
        """Load SVG templates"""
        return {
            "circle": self.create_circle_overlay(),
            "square": self.create_square_overlay(),
            "triangle": self.create_triangle_overlay()
        }

    def create_circle_overlay(self):
        """Create circle SVG overlay as image"""
        overlay = np.zeros((400, 400, 3), dtype=np.uint8)
        cv2.circle(overlay, (200, 200), 150, (0, 255, 0), 3)
        return overlay

    def create_square_overlay(self):
        """Create square SVG overlay as image"""
        overlay = np.zeros((400, 400, 3), dtype=np.uint8)
        cv2.rectangle(overlay, (50, 50), (350, 350), (0, 255, 0), 3)
        return overlay

    def create_triangle_overlay(self):
        """Create triangle SVG overlay as image"""
        overlay = np.zeros((400, 400, 3), dtype=np.uint8)
        pts = np.array([[200, 50], [50, 350], [350, 350]], np.int32)
        cv2.polylines(overlay, [pts], True, (0, 255, 0), 3)
        return overlay

    def get_current_svg_overlay(self):
        """Get current SVG overlay"""
        return self.svg_templates.get(self.current_svg)


class ReferenceImageService:
    """Simplified reference image service"""

    def __init__(self):
        self.current_image = None

    def load_image(self, file_path):
        """Load reference image from file"""
        try:
            self.current_image = cv2.imread(file_path)
            return self.current_image is not None
        except Exception as e:
            print(f"❌ Error loading image: {e}")
            return False

    def get_current_reference(self):
        """Get current reference image"""
        return self.current_image


class Model3DService:
    """Simplified 3D model service"""

    def __init__(self):
        self.current_model = None

    def load_default_model(self):
        """Load default 3D model"""
        self.current_model = {
            "type": "cube",
            "name": "Basic Cube",
            "loaded": True
        }

    def get_current_model(self):
        """Get current 3D model"""
        return self.current_model


def main():
    parser = argparse.ArgumentParser(description='ArtMentor Camera Test')
    parser.add_argument('--mode', choices=['trace', 'reference', 'model3d'],
                       default='trace', help='Initial mode')
    args = parser.parse_args()

    app = ArtMentorCameraTest()

    # Set initial mode
    if args.mode == 'reference':
        app.current_mode = AppMode.REFERENCE_IMAGE
    elif args.mode == 'model3d':
        app.current_mode = AppMode.MODEL_3D

    try:
        app.run()
    except KeyboardInterrupt:
        print("\n👋 Interrupted by user")
    except Exception as e:
        print(f"❌ Error: {e}")


if __name__ == "__main__":
    main()