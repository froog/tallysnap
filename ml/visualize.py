#!/usr/bin/env python3
"""
Visualize YOLO bounding box labels overlaid on card images.

Usage:
    python visualize.py                          # all train+val images → data/visualized/
    python visualize.py --split train            # train split only
    python visualize.py --image data/images/train/photo.jpg
    python visualize.py --show                   # interactive display instead of saving
    python visualize.py --out path/to/dir/       # custom output directory
"""

import argparse
import sys
from collections import Counter
from pathlib import Path

import cv2
import numpy as np

CLASS_NAMES = [
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
    "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
    "TH", "QU", "IN", "ER", "CL",
]

# One visually distinct BGR colour per class (hue-spaced HSV palette)
def _make_palette(n: int) -> list[tuple[int, int, int]]:
    palette = []
    for i in range(n):
        hue = int(180 * i / n)
        hsv = np.array([[[hue, 220, 220]]], dtype=np.uint8)
        bgr = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)[0][0]
        palette.append((int(bgr[0]), int(bgr[1]), int(bgr[2])))
    return palette

PALETTE = _make_palette(len(CLASS_NAMES))


def find_label_path(image_path: Path, data_root: Path) -> Path | None:
    """Return the .txt label file corresponding to an image path."""
    rel = image_path.relative_to(data_root / "images")   # e.g. train/photo.jpg
    label = data_root / "labels" / rel.with_suffix(".txt")
    return label if label.exists() else None


def draw_boxes(image: np.ndarray, label_path: Path) -> tuple[np.ndarray, Counter]:
    """Draw YOLO bounding boxes on image. Returns annotated image and label counts."""
    h, w = image.shape[:2]
    counts: Counter = Counter()

    lines = label_path.read_text().strip().splitlines()
    for line in lines:
        parts = line.strip().split()
        if len(parts) != 5:
            continue
        cls_id, cx, cy, bw, bh = int(parts[0]), float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])
        if cls_id >= len(CLASS_NAMES):
            continue

        name = CLASS_NAMES[cls_id]
        colour = PALETTE[cls_id]
        counts[name] += 1

        x1 = max(0, int((cx - bw / 2) * w))
        y1 = max(0, int((cy - bh / 2) * h))
        x2 = min(w - 1, int((cx + bw / 2) * w))
        y2 = min(h - 1, int((cy + bh / 2) * h))

        cv2.rectangle(image, (x1, y1), (x2, y2), colour, 2)

        # Label chip
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = max(0.5, min(1.2, w / 1200))
        thickness = max(1, int(font_scale * 2))
        (tw, th), baseline = cv2.getTextSize(name, font, font_scale, thickness)
        chip_y1 = max(0, y1 - th - baseline - 4)
        chip_y2 = max(th + baseline + 4, y1)
        cv2.rectangle(image, (x1, chip_y1), (x1 + tw + 4, chip_y2), colour, -1)
        cv2.putText(image, name, (x1 + 2, chip_y2 - baseline - 2), font, font_scale, (255, 255, 255), thickness, cv2.LINE_AA)

    return image, counts


def collect_pairs(data_root: Path, splits: list[str]) -> list[tuple[Path, Path, str]]:
    """Return list of (image_path, label_path, split) tuples."""
    pairs = []
    for split in splits:
        img_dir = data_root / "images" / split
        if not img_dir.exists():
            continue
        for ext in ("*.jpg", "*.jpeg", "*.png", "*.webp"):
            for img_path in sorted(img_dir.glob(ext)):
                lbl = find_label_path(img_path, data_root)
                if lbl:
                    pairs.append((img_path, lbl, split))
                else:
                    print(f"  [skip] no label for {img_path.name}")
    return pairs


def process_image(
    img_path: Path,
    lbl_path: Path,
    split: str,
    out_root: Path | None,
    show: bool,
) -> bool:
    image = cv2.imread(str(img_path))
    if image is None:
        print(f"  [error] could not read {img_path}")
        return False

    annotated, counts = draw_boxes(image, lbl_path)

    summary = "  ".join(f"{k}×{v}" for k, v in sorted(counts.items()))
    total = sum(counts.values())
    print(f"{img_path.name} → {total} box{'es' if total != 1 else ''}:  {summary or '(none)'}")

    if show:
        cv2.imshow(img_path.name, annotated)
        key = cv2.waitKey(0) & 0xFF
        cv2.destroyAllWindows()
        if key == ord("q"):
            return False  # signal to stop

    if out_root:
        out_dir = out_root / split
        out_dir.mkdir(parents=True, exist_ok=True)
        stem = img_path.stem + "_annotated.jpg"
        out_path = out_dir / stem
        cv2.imwrite(str(out_path), annotated, [cv2.IMWRITE_JPEG_QUALITY, 92])
        print(f"  → saved {out_path}")

    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Visualize YOLO labels on card images")
    parser.add_argument("--data", default="data", help="Data root directory (default: data/)")
    parser.add_argument("--split", choices=["train", "val", "both"], default="both")
    parser.add_argument("--image", help="Visualize a single image file")
    parser.add_argument("--show", action="store_true", help="Display images interactively (press any key to advance, q to quit)")
    parser.add_argument("--out", default=None, help="Output directory for annotated images (default: data/visualized/)")
    args = parser.parse_args()

    data_root = Path(args.data)
    save = not args.show  # default to saving unless --show
    out_root = Path(args.out) if args.out else (data_root / "visualized") if save else None

    if args.image:
        img_path = Path(args.image)
        if not img_path.exists():
            print(f"Error: image not found: {img_path}", file=sys.stderr)
            sys.exit(1)
        lbl_path = find_label_path(img_path, data_root)
        if lbl_path is None:
            print(f"Error: no label file found for {img_path}", file=sys.stderr)
            sys.exit(1)
        split = img_path.parent.name  # "train" or "val"
        process_image(img_path, lbl_path, split, out_root, args.show)
        return

    splits = ["train", "val"] if args.split == "both" else [args.split]
    pairs = collect_pairs(data_root, splits)

    if not pairs:
        print(f"No labeled images found in {data_root}/images/{{{','.join(splits)}}}/ — run collect.py first.")
        sys.exit(1)

    print(f"Found {len(pairs)} labeled image(s)\n")
    for img_path, lbl_path, split in pairs:
        ok = process_image(img_path, lbl_path, split, out_root, args.show)
        if not ok:
            break

    if out_root and out_root.exists():
        print(f"\nAnnotated images saved to: {out_root}/")


if __name__ == "__main__":
    main()
