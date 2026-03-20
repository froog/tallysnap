#!/usr/bin/env python3
"""
export.py — Export trained Quiddler OCR model to ONNX and CoreML

Exports the best trained weights to:
  - ONNX: portable format for cross-platform inference
  - CoreML: Apple-native format for maximum M4 ANE performance (optional)

Usage:
    python export.py                              # Export best.pt from latest run
    python export.py --weights models/quiddler-v1/weights/best.pt
    python export.py --format onnx               # ONNX only
    python export.py --format coreml             # CoreML only
    python export.py --format all                # Both (default)
"""

import argparse
import sys
from pathlib import Path


def find_best_weights(models_dir: Path) -> Path | None:
    """Find the most recently trained best.pt file."""
    candidates = sorted(models_dir.rglob("best.pt"), key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0] if candidates else None


def export_onnx(model, output_dir: Path, imgsz: int) -> Path:
    """Export to ONNX format."""
    print("\n--- Exporting to ONNX ---")
    path = model.export(
        format="onnx",
        imgsz=imgsz,
        dynamic=True,       # Dynamic batch size
        simplify=True,      # ONNX simplifier (reduces ops)
        opset=17,           # ONNX opset version
    )
    onnx_path = Path(path)
    # Copy to models/ for easy access
    dest = output_dir / "quiddler.onnx"
    import shutil
    shutil.copy2(onnx_path, dest)
    print(f"ONNX model saved: {dest} ({dest.stat().st_size / 1024 / 1024:.1f} MB)")
    return dest


def export_coreml(model, output_dir: Path, imgsz: int) -> Path | None:
    """Export to CoreML format for Apple Neural Engine."""
    print("\n--- Exporting to CoreML (Apple ANE) ---")
    try:
        path = model.export(
            format="coreml",
            imgsz=imgsz,
            nms=True,   # Include NMS in CoreML model
        )
        coreml_path = Path(path)
        dest = output_dir / "quiddler.mlpackage"
        import shutil
        if coreml_path.is_dir():
            if dest.exists():
                shutil.rmtree(dest)
            shutil.copytree(coreml_path, dest)
        else:
            shutil.copy2(coreml_path, dest)
        print(f"CoreML model saved: {dest}")
        print("  → CoreML runs on Apple Neural Engine for maximum M4 performance")
        return dest
    except Exception as e:
        print(f"WARNING: CoreML export failed: {e}")
        print("  CoreML requires: pip install coremltools")
        print("  Continuing without CoreML export.")
        return None


def benchmark(weights_path: Path, imgsz: int) -> None:
    """Run a quick benchmark to measure inference speed."""
    print("\n--- Benchmarking ---")
    try:
        import time
        import torch
        import numpy as np
        from ultralytics import YOLO

        model = YOLO(str(weights_path))
        device = "mps" if torch.backends.mps.is_available() else "cpu"

        # Warm up
        dummy = torch.rand(1, 3, imgsz, imgsz).to(device)
        for _ in range(3):
            model.predict(source=np.zeros((imgsz, imgsz, 3), dtype=np.uint8), verbose=False)

        # Benchmark
        times = []
        for _ in range(10):
            t0 = time.perf_counter()
            model.predict(source=np.zeros((imgsz, imgsz, 3), dtype=np.uint8), verbose=False)
            times.append(time.perf_counter() - t0)

        avg_ms = sum(times) / len(times) * 1000
        print(f"  Average inference: {avg_ms:.1f}ms on {device}")
        print(f"  (Cloud API baseline: ~2000–5000ms)")
        print(f"  Speedup: ~{2500 / avg_ms:.0f}x faster than cloud API")
    except Exception as e:
        print(f"  Benchmark skipped: {e}")


def main():
    parser = argparse.ArgumentParser(description="Export trained Quiddler OCR model")
    parser.add_argument("--weights", type=Path, default=None,
                        help="Path to trained weights .pt file (auto-detects latest if not specified)")
    parser.add_argument("--format", choices=["onnx", "coreml", "all"], default="all",
                        help="Export format (default: all)")
    parser.add_argument("--imgsz", type=int, default=640,
                        help="Image size used during training (default: 640)")
    parser.add_argument("--benchmark", action="store_true", default=True,
                        help="Run inference benchmark after export")
    args = parser.parse_args()

    try:
        from ultralytics import YOLO
    except ImportError:
        print("ERROR: ultralytics not installed. Run: pip install ultralytics")
        sys.exit(1)

    # Find weights
    script_dir = Path(__file__).parent
    models_dir = script_dir / "models"

    if args.weights:
        weights_path = args.weights
    else:
        weights_path = find_best_weights(models_dir)
        if not weights_path:
            print("ERROR: No trained model found.")
            print("  Run: python train.py")
            sys.exit(1)

    if not weights_path.exists():
        print(f"ERROR: Weights file not found: {weights_path}")
        sys.exit(1)

    print(f"=== Exporting Quiddler OCR Model ===")
    print(f"  Weights: {weights_path}")
    print(f"  ImgSz:   {args.imgsz}px")
    print(f"  Formats: {args.format}")

    model = YOLO(str(weights_path))
    output_dir = models_dir
    output_dir.mkdir(exist_ok=True)

    exported = []

    if args.format in ("onnx", "all"):
        onnx_path = export_onnx(model, output_dir, args.imgsz)
        exported.append(onnx_path)

    if args.format in ("coreml", "all"):
        coreml_path = export_coreml(model, output_dir, args.imgsz)
        if coreml_path:
            exported.append(coreml_path)

    if args.benchmark:
        benchmark(weights_path, args.imgsz)

    print(f"\n=== Export Complete ===")
    for p in exported:
        print(f"  {p}")
    print()
    print("Start inference server:")
    print("  uvicorn server:app --port 3002")


if __name__ == "__main__":
    main()
