#!/usr/bin/env python3
"""
ArtMentor Static Test - No camera required
Shows overlay functionality without camera feed
"""

import cv2
import numpy as np
import time
from enum import Enum


class AppMode(Enum):
    TRACE_PROJECTION = "trace"
    REFERENCE_IMAGE = "reference"
    MODEL_3D = "model3d"


def create_test_background():
    """Create a test background image"""
    background = np.ones((720, 1280, 3), dtype=np.uint8) * 40  # Dark gray

    # Add some pattern
    for i in range(0, 1280, 100):
        cv2.line(background, (i, 0), (i, 720), (60, 60, 60), 1)
    for i in range(0, 720, 100):
        cv2.line(background, (0, i), (1280, i), (60, 60, 60), 1)

    # Add center crosshair
    cv2.line(background, (640, 0), (640, 720), (80, 80, 80), 2)
    cv2.line(background, (0, 360), (1280, 360), (80, 80, 80), 2)

    cv2.putText(background, "ArtMentor Test Background", (50, 50),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (100, 100, 100), 2)

    return background


def apply_trace_overlay(frame, surface_detected=True):
    """Apply trace projection overlay"""
    if not surface_detected:
        # Show detection area
        cv2.rectangle(frame, (320, 180), (960, 540), (0, 255, 255), 3)
        cv2.putText(frame, "Surface Detection Area", (320, 160),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
        return frame

    # Show SVG circle template
    center = (640, 360)
    radius = 120

    # Draw circle with green color
    cv2.circle(frame, center, radius, (0, 255, 0), 4)
    cv2.circle(frame, center, radius + 20, (0, 200, 0), 2)
    cv2.circle(frame, center, radius - 20, (0, 200, 0), 2)

    # Add template label
    cv2.putText(frame, "Circle Template (SVG)", (center[0]-100, center[1]+radius+40),
               cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

    # Add corner markers for surface
    corners = [(400, 240), (880, 240), (880, 480), (400, 480)]
    for i, corner in enumerate(corners):
        cv2.circle(frame, corner, 5, (255, 255, 0), -1)
        cv2.putText(frame, f"C{i+1}", (corner[0]+10, corner[1]-10),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 0), 1)

    return frame


def apply_reference_overlay(frame, has_image=False):
    """Apply reference image overlay"""
    if not has_image:
        cv2.putText(frame, "No Reference Image", (440, 300),
                   cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 3)
        cv2.putText(frame, "Press D to load image", (480, 350),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 2)
        return frame

    # Simulate reference image overlay
    overlay = np.zeros_like(frame)

    # Create a fake reference image (architectural drawing style)
    cv2.rectangle(overlay, (340, 160), (940, 560), (100, 150, 255), 2)
    cv2.line(overlay, (340, 280), (940, 280), (100, 150, 255), 2)
    cv2.line(overlay, (640, 160), (640, 560), (100, 150, 255), 2)

    # Add some architectural details
    cv2.circle(overlay, (490, 220), 30, (100, 150, 255), 2)
    cv2.circle(overlay, (790, 220), 30, (100, 150, 255), 2)
    cv2.rectangle(overlay, (590, 300), (690, 400), (100, 150, 255), 2)

    # Blend overlay
    result = cv2.addWeighted(frame, 0.4, overlay, 0.6, 0)

    cv2.putText(result, "Reference Image Overlay (Architectural Drawing)", (300, 600),
               cv2.FONT_HERSHEY_SIMPLEX, 0.7, (150, 200, 255), 2)

    return result


def apply_3d_overlay(frame):
    """Apply 3D model overlay"""
    center_x, center_y = 640, 360
    size = 100

    # Animate rotation
    angle = int(time.time() * 50) % 360

    # Draw 3D cube with perspective
    # Front face
    front_pts = np.array([
        [center_x-size, center_y-size],
        [center_x+size, center_y-size],
        [center_x+size, center_y+size],
        [center_x-size, center_y+size]
    ], np.int32)
    cv2.fillPoly(frame, [front_pts], (50, 50, 200))
    cv2.polylines(frame, [front_pts], True, (255, 255, 255), 3)

    # Back face (with offset for 3D effect)
    offset = 60
    back_pts = np.array([
        [center_x-size+offset, center_y-size-offset],
        [center_x+size+offset, center_y-size-offset],
        [center_x+size+offset, center_y+size-offset],
        [center_x-size+offset, center_y+size-offset]
    ], np.int32)
    cv2.fillPoly(frame, [back_pts], (80, 80, 230))
    cv2.polylines(frame, [back_pts], True, (255, 255, 255), 2)

    # Connect front and back faces
    connections = [(0, 0), (1, 1), (2, 2), (3, 3)]
    for front_idx, back_idx in connections:
        cv2.line(frame, tuple(front_pts[front_idx]), tuple(back_pts[back_idx]), (255, 255, 255), 2)

    # Add rotation info
    cv2.putText(frame, f"3D Cube Model (Angle: {angle}°)", (center_x-120, center_y+size+60),
               cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)

    # Add coordinate axes
    axis_len = 80
    cv2.arrowedLine(frame, (50, 670), (50+axis_len, 670), (0, 0, 255), 3)  # X-axis (red)
    cv2.arrowedLine(frame, (50, 670), (50, 670-axis_len), (0, 255, 0), 3)  # Y-axis (green)
    cv2.arrowedLine(frame, (50, 670), (50+30, 670-30), (255, 0, 0), 3)     # Z-axis (blue)

    cv2.putText(frame, "X", (50+axis_len+10, 675), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
    cv2.putText(frame, "Y", (55, 670-axis_len-10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
    cv2.putText(frame, "Z", (85, 645), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 2)

    return frame


def add_ui_overlay(frame, mode, surface_detected=False, has_ref_image=False):
    """Add UI elements"""
    mode_names = {
        AppMode.TRACE_PROJECTION: "Trace Projection",
        AppMode.REFERENCE_IMAGE: "Reference Image",
        AppMode.MODEL_3D: "3D Model"
    }

    # Mode indicator
    cv2.rectangle(frame, (10, 10), (300, 70), (0, 0, 0), -1)
    cv2.rectangle(frame, (10, 10), (300, 70), (255, 255, 255), 2)
    cv2.putText(frame, f"Mode: {mode_names[mode]}", (20, 35),
               cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)

    # Status
    if mode == AppMode.TRACE_PROJECTION:
        status = "Surface Detected" if surface_detected else "No Surface"
        color = (0, 255, 0) if surface_detected else (255, 255, 0)
        cv2.putText(frame, status, (20, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
    elif mode == AppMode.REFERENCE_IMAGE:
        status = "Image Loaded" if has_ref_image else "No Image"
        color = (0, 255, 0) if has_ref_image else (255, 255, 0)
        cv2.putText(frame, status, (20, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

    # Controls
    controls = [
        "SPACE: Action",
        "M: Switch Mode",
        "D: Detect/Load",
        "Q: Quit"
    ]

    for i, control in enumerate(controls):
        cv2.putText(frame, control, (1050, 30 + i*25),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)


def main():
    print("🎯 ArtMentor Static Test - No Camera Required")
    print("📱 Controls:")
    print("   SPACE: Take action")
    print("   M: Switch modes")
    print("   D: Toggle surface detection / reference image")
    print("   Q: Quit")

    mode = AppMode.TRACE_PROJECTION
    surface_detected = False
    has_ref_image = False

    background = create_test_background()

    while True:
        frame = background.copy()

        # Apply mode-specific overlays
        if mode == AppMode.TRACE_PROJECTION:
            frame = apply_trace_overlay(frame, surface_detected)
        elif mode == AppMode.REFERENCE_IMAGE:
            frame = apply_reference_overlay(frame, has_ref_image)
        elif mode == AppMode.MODEL_3D:
            frame = apply_3d_overlay(frame)

        # Add UI
        add_ui_overlay(frame, mode, surface_detected, has_ref_image)

        # Display
        cv2.imshow('ArtMentor Static Test', frame)

        # Handle input
        key = cv2.waitKey(30) & 0xFF

        if key == ord('q'):
            break
        elif key == ord(' '):
            print(f"📸 Action in {mode.value} mode")
        elif key == ord('m'):
            modes = list(AppMode)
            current_idx = modes.index(mode)
            mode = modes[(current_idx + 1) % len(modes)]
            print(f"🔄 Switched to {mode.value} mode")
        elif key == ord('d'):
            if mode == AppMode.TRACE_PROJECTION:
                surface_detected = not surface_detected
                print(f"🎯 Surface {'detected' if surface_detected else 'cleared'}")
            elif mode == AppMode.REFERENCE_IMAGE:
                has_ref_image = not has_ref_image
                print(f"🖼️ Reference image {'loaded' if has_ref_image else 'cleared'}")

    cv2.destroyAllWindows()
    print("👋 ArtMentor Static Test closed")


if __name__ == "__main__":
    main()