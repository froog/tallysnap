#!/usr/bin/env python3
"""
collect.py — Quiddler OCR Data Collection & Auto-Labeling Tool

Uses Claude API to automatically generate YOLO-format bounding box annotations
for Quiddler card images. Run this on photos of card hands to build the dataset.

Usage:
    python collect.py --images ../public/test-images/ --out data/
    python collect.py --images ~/game_photos/ --out data/
    python collect.py --images photo.jpg --out data/ --val-split 0.2
"""

import argparse
import base64
import io
import json
import os
import random
import re
import shutil
import sys
from pathlib import Path

import anthropic
from PIL import Image

# All valid Quiddler card labels, ordered by class index (must match dataset.yaml)
CLASS_NAMES = [
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
    "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
    "TH", "QU", "IN", "ER", "CL"
]
CLASS_INDEX = {name: i for i, name in enumerate(CLASS_NAMES)}

# Extended prompt: asks Claude to return both card labels AND bounding boxes
LABELING_PROMPT = """You are analyzing a photo of Quiddler card game cards to generate ML training data.

<card_design>
Each Quiddler card has a decorative illustration in the center — IGNORE this.
ONLY read the small serif letter printed in the TOP-LEFT corner (and its upside-down copy in the BOTTOM-RIGHT).
Valid card labels: A B C D E F G H I J K L M N O P Q R S T U V W X Y Z TH QU IN ER CL
Double-letter cards TH, QU, IN, ER, CL appear as a single card with both letters shown together.
</card_design>

<overlapping_cards>
Cards are usually fanned or overlapping. Look carefully at EVERY visible top-left corner.
Count each card corner separately, even if the card body is mostly hidden.
</overlapping_cards>

For EACH card corner you can see:
1. Identify the letter label (e.g. "QU", "E", "TH")
2. Estimate the bounding box of the corner label text as fractions of the full image dimensions:
   - x_center: horizontal center of the corner text region (0.0 = left edge, 1.0 = right edge)
   - y_center: vertical center of the corner text region (0.0 = top, 1.0 = bottom)
   - width: width of the corner text region as fraction of image width (typically 0.03–0.08)
   - height: height of the corner text region as fraction of image height (typically 0.03–0.07)

First describe what you see in <analysis> tags.

Then output ALL detected cards in <labels> tags as a JSON array:
<labels>[
  {"letter": "QU", "x": 0.12, "y": 0.08, "w": 0.05, "h": 0.04},
  {"letter": "E",  "x": 0.28, "y": 0.11, "w": 0.04, "h": 0.04},
  {"letter": "TH", "x": 0.45, "y": 0.09, "w": 0.06, "h": 0.04}
]</labels>

Be precise. Missing cards or wrong letters will degrade model quality."""


def image_to_base64(image_path: Path) -> tuple[str, str]:
    """Convert image to base64 string. Returns (base64_data, media_type)."""
    suffix = image_path.suffix.lower()
    if suffix in (".jpg", ".jpeg"):
        media_type = "image/jpeg"
    elif suffix == ".png":
        media_type = "image/png"
    else:
        # Convert to JPEG for other formats
        img = Image.open(image_path).convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return base64.b64encode(buf.getvalue()).decode(), "image/jpeg"

    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode(), media_type


def label_image(client: anthropic.Anthropic, image_path: Path) -> list[dict]:
    """Call Claude API to get bounding box labels for a card image."""
    print(f"  Labeling: {image_path.name} ... ", end="", flush=True)

    b64, media_type = image_to_base64(image_path)

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": media_type, "data": b64}
                },
                {"type": "text", "text": LABELING_PROMPT}
            ]
        }]
    )

    text = response.content[0].text

    # Extract JSON from <labels> tags
    match = re.search(r"<labels>([\s\S]*?)</labels>", text)
    if not match:
        print(f"WARNING: No <labels> found in response for {image_path.name}")
        print(f"  Response: {text[:500]}")
        return []

    try:
        labels = json.loads(match.group(1).strip())
    except json.JSONDecodeError as e:
        print(f"WARNING: Failed to parse labels JSON: {e}")
        print(f"  Raw: {match.group(1)[:300]}")
        return []

    # Validate labels
    valid = []
    for item in labels:
        letter = item.get("letter", "").upper()
        if letter not in CLASS_INDEX:
            print(f"\n  WARNING: Unknown card label '{letter}' — skipping")
            continue
        x, y, w, h = item.get("x", 0), item.get("y", 0), item.get("w", 0), item.get("h", 0)
        # Clamp to [0, 1]
        x, y, w, h = max(0.0, min(1.0, x)), max(0.0, min(1.0, y)), \
                     max(0.01, min(1.0, w)), max(0.01, min(1.0, h))
        valid.append({"letter": letter, "x": x, "y": y, "w": w, "h": h})

    print(f"found {len(valid)} cards")
    return valid


def save_yolo_label(labels: list[dict], label_path: Path) -> None:
    """Write YOLO format label file: class_id x_center y_center width height."""
    lines = []
    for item in labels:
        class_id = CLASS_INDEX[item["letter"]]
        lines.append(f"{class_id} {item['x']:.6f} {item['y']:.6f} {item['w']:.6f} {item['h']:.6f}")
    label_path.write_text("\n".join(lines) + "\n" if lines else "")


def collect_images(image_source: Path) -> list[Path]:
    """Collect all image files from a path (file or directory)."""
    extensions = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"}
    if image_source.is_file():
        return [image_source] if image_source.suffix.lower() in extensions else []
    return sorted([
        p for p in image_source.rglob("*")
        if p.suffix.lower() in extensions
    ])


def main():
    parser = argparse.ArgumentParser(description="Auto-label Quiddler card images for YOLO training")
    parser.add_argument("--images", required=True, type=Path,
                        help="Image file or directory of images to label")
    parser.add_argument("--out", required=True, type=Path,
                        help="Output data directory (expects data/images/ and data/labels/ subdirs)")
    parser.add_argument("--val-split", type=float, default=0.2,
                        help="Fraction of images for validation (default: 0.2)")
    parser.add_argument("--api-key", type=str, default=None,
                        help="Anthropic API key (defaults to ANTHROPIC_API_KEY env var)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be done without calling the API")
    args = parser.parse_args()

    # Setup API client
    api_key = args.api_key or os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("VITE_VISION_API_KEY")
    if not api_key:
        print("ERROR: No API key found. Set ANTHROPIC_API_KEY or pass --api-key")
        sys.exit(1)
    client = anthropic.Anthropic(api_key=api_key)

    # Find images
    images = collect_images(args.images)
    if not images:
        print(f"ERROR: No images found at {args.images}")
        sys.exit(1)

    print(f"\nFound {len(images)} image(s) to process")

    # Create output directories
    train_img_dir = args.out / "images" / "train"
    val_img_dir = args.out / "images" / "val"
    train_lbl_dir = args.out / "labels" / "train"
    val_lbl_dir = args.out / "labels" / "val"
    for d in [train_img_dir, val_img_dir, train_lbl_dir, val_lbl_dir]:
        d.mkdir(parents=True, exist_ok=True)

    # Shuffle and split
    random.shuffle(images)
    n_val = max(1, int(len(images) * args.val_split)) if len(images) > 1 else 0
    val_images = set(str(p) for p in images[:n_val])

    print(f"Split: {len(images) - n_val} train, {n_val} val\n")

    labeled = 0
    skipped = 0

    for img_path in images:
        is_val = str(img_path) in val_images
        split = "val" if is_val else "train"
        img_out_dir = val_img_dir if is_val else train_img_dir
        lbl_out_dir = val_lbl_dir if is_val else train_lbl_dir

        # Destination paths
        dest_img = img_out_dir / img_path.name
        dest_lbl = lbl_out_dir / (img_path.stem + ".txt")

        # Skip if already labeled
        if dest_lbl.exists() and dest_img.exists():
            print(f"  Skipping (already labeled): {img_path.name}")
            skipped += 1
            continue

        if args.dry_run:
            print(f"  [DRY RUN] Would label: {img_path.name} → {split}/")
            continue

        # Label the image
        labels = label_image(client, img_path)
        if not labels:
            print(f"  WARNING: No labels generated for {img_path.name} — skipping")
            skipped += 1
            continue

        # Copy image and save labels
        shutil.copy2(img_path, dest_img)
        save_yolo_label(labels, dest_lbl)
        labeled += 1

    print(f"\n=== Done ===")
    print(f"  Labeled: {labeled} images")
    print(f"  Skipped: {skipped} images (already done or no labels)")
    print(f"  Output:  {args.out}")
    print(f"\nNext: python train.py")


if __name__ == "__main__":
    main()
