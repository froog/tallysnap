#!/usr/bin/env python3
"""
train.py — Train YOLOv8 model for Quiddler card detection on Mac M4

Uses Ultralytics YOLOv8-nano with Apple Silicon MPS acceleration.
Detects and classifies Quiddler card corner labels (31 classes).

Usage:
    python train.py                        # Default: yolov8n, 150 epochs
    python train.py --model yolov8s        # Larger model (slower, potentially more accurate)
    python train.py --epochs 50            # Quick test run
    python train.py --resume               # Resume interrupted training
"""

import argparse
import sys
from pathlib import Path

import torch


def check_device() -> str:
    """Determine best available device for training."""
    if torch.backends.mps.is_available():
        print("M4 GPU (MPS) detected — training will use Apple Silicon acceleration")
        return "mps"
    elif torch.cuda.is_available():
        print("CUDA GPU detected")
        return "0"
    else:
        print("WARNING: No GPU detected. Training on CPU will be slow.")
        print("  On Mac, ensure macOS 12.3+ and Apple Silicon chip.")
        return "cpu"


def validate_dataset(dataset_yaml: Path) -> bool:
    """Check that the dataset has enough images to train."""
    data_dir = dataset_yaml.parent / "data"
    train_images = list((data_dir / "images" / "train").glob("*.jpg")) + \
                   list((data_dir / "images" / "train").glob("*.jpeg")) + \
                   list((data_dir / "images" / "train").glob("*.png"))
    val_images = list((data_dir / "images" / "val").glob("*.jpg")) + \
                 list((data_dir / "images" / "val").glob("*.jpeg")) + \
                 list((data_dir / "images" / "val").glob("*.png"))

    print(f"Dataset: {len(train_images)} train images, {len(val_images)} val images")

    if len(train_images) == 0:
        print("\nERROR: No training images found!")
        print("  Run: python collect.py --images ../public/test-images/ --out data/")
        return False

    if len(train_images) < 10:
        print(f"\nWARNING: Only {len(train_images)} training images.")
        print("  Model may underfit. Aim for 200+ images across all 31 card types.")
        print("  Collect more photos and run collect.py again.")

    if len(val_images) == 0:
        print("WARNING: No validation images — accuracy metrics won't be available.")

    return True


def main():
    parser = argparse.ArgumentParser(description="Train Quiddler OCR model on Mac M4")
    parser.add_argument("--model", default="yolov8n",
                        choices=["yolov8n", "yolov8s", "yolov8m"],
                        help="YOLOv8 model size (n=nano fastest, m=medium most accurate)")
    parser.add_argument("--epochs", type=int, default=150,
                        help="Number of training epochs (default: 150)")
    parser.add_argument("--batch", type=int, default=16,
                        help="Batch size (reduce if running out of memory)")
    parser.add_argument("--imgsz", type=int, default=640,
                        help="Training image size in pixels (default: 640)")
    parser.add_argument("--resume", action="store_true",
                        help="Resume training from last checkpoint")
    parser.add_argument("--name", default="quiddler-v1",
                        help="Run name (output saved to models/<name>/)")
    args = parser.parse_args()

    # Check device
    device = check_device()

    # Paths
    script_dir = Path(__file__).parent
    dataset_yaml = script_dir / "dataset.yaml"
    models_dir = script_dir / "models"
    models_dir.mkdir(exist_ok=True)

    # Validate dataset
    if not validate_dataset(dataset_yaml):
        sys.exit(1)

    # Import here so errors from missing package are caught cleanly
    try:
        from ultralytics import YOLO
    except ImportError:
        print("ERROR: ultralytics not installed. Run: pip install ultralytics")
        sys.exit(1)

    print(f"\n=== Training Quiddler OCR Model ===")
    print(f"  Model:   {args.model}.pt (pretrained COCO weights)")
    print(f"  Device:  {device}")
    print(f"  Epochs:  {args.epochs}")
    print(f"  Batch:   {args.batch}")
    print(f"  ImgSz:   {args.imgsz}px")
    print(f"  Output:  models/{args.name}/")
    print()

    if args.resume:
        # Resume from last checkpoint
        last_ckpt = models_dir / args.name / "weights" / "last.pt"
        if not last_ckpt.exists():
            print(f"ERROR: No checkpoint found at {last_ckpt}")
            sys.exit(1)
        model = YOLO(str(last_ckpt))
        print(f"Resuming from: {last_ckpt}")
    else:
        # Start from pretrained weights (auto-downloaded on first run)
        model = YOLO(f"{args.model}.pt")

    # Train
    results = model.train(
        data=str(dataset_yaml),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=device,
        project=str(models_dir),
        name=args.name,
        exist_ok=args.resume,

        # Data augmentation — important for handling varied lighting, angles, distances
        augment=True,
        degrees=20,       # Cards can be tilted when held in hand
        hsv_h=0.02,       # Slight hue shifts (lighting variation)
        hsv_s=0.5,        # Saturation variation
        hsv_v=0.4,        # Brightness variation (shadows, glare)
        blur=0.1,         # Motion blur / focus variation
        fliplr=0.0,       # Don't flip horizontally (letters would be mirrored)
        flipud=0.0,       # Don't flip vertically
        mosaic=0.5,       # Mosaic augmentation for multi-card scenes
        scale=0.3,        # Scale jitter (cards at different distances)

        # Optimization
        optimizer="AdamW",
        lr0=0.001,
        warmup_epochs=3,
        patience=30,      # Early stopping: stop if no improvement for 30 epochs

        # Logging
        verbose=True,
        plots=True,       # Save training plots
        save=True,
        save_period=10,   # Save checkpoint every 10 epochs
    )

    best_model = models_dir / args.name / "weights" / "best.pt"
    print(f"\n=== Training Complete ===")
    print(f"  Best model: {best_model}")
    mAP50 = results.results_dict.get('metrics/mAP50(B)')
    print(f"  mAP50: {float(mAP50):.3f}" if mAP50 is not None else "  mAP50: N/A")
    print()
    print("Next steps:")
    print("  1. Export model:         python export.py")
    print("  2. Start inference:      uvicorn server:app --port 3002")


if __name__ == "__main__":
    main()
