#!/usr/bin/env python3
"""
server.py — Local Quiddler OCR Inference Server

FastAPI server that runs YOLOv8 inference locally on the Mac M4.
Responds in the same format as the Anthropic Messages API so proxy.js
can route to it transparently — zero frontend changes needed.

Start:
    uvicorn server:app --port 3002

Or with auto-reload during development:
    uvicorn server:app --port 3002 --reload

Endpoints:
    POST /v1/messages  — Anthropic-compatible card recognition
    GET  /health       — Health check + model info
    POST /test         — Test with a local image file path
"""

import base64
import io
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

# Class names must match dataset.yaml exactly
CLASS_NAMES = [
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
    "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
    "TH", "QU", "IN", "ER", "CL"
]

app = FastAPI(title="Quiddler OCR Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------

_model = None
_model_path = None


def get_model():
    """Load YOLO model on first use (lazy loading)."""
    global _model, _model_path

    if _model is not None:
        return _model

    try:
        from ultralytics import YOLO
    except ImportError:
        raise RuntimeError("ultralytics not installed. Run: pip install ultralytics")

    # Search for best trained model
    script_dir = Path(__file__).parent
    candidates = [
        script_dir / "models" / "quiddler-v1" / "weights" / "best.pt",
        script_dir / "models" / "quiddler.onnx",
    ]
    # Also find any best.pt in models/
    candidates += sorted(script_dir.glob("models/**/best.pt"),
                         key=lambda p: p.stat().st_mtime, reverse=True)

    for candidate in candidates:
        if candidate.exists():
            print(f"Loading model: {candidate}")
            t0 = time.perf_counter()
            _model = YOLO(str(candidate))
            elapsed = (time.perf_counter() - t0) * 1000
            _model_path = candidate
            print(f"Model loaded in {elapsed:.0f}ms")

            # Warm up with a dummy inference
            dummy = np.zeros((640, 640, 3), dtype=np.uint8)
            _model.predict(source=dummy, verbose=False)
            print("Model warm-up complete")
            return _model

    raise RuntimeError(
        "No trained model found. Run:\n"
        "  python train.py\n"
        "  python export.py"
    )


# ---------------------------------------------------------------------------
# Card grouping logic
# ---------------------------------------------------------------------------

def group_cards_by_proximity(detections: list[dict], img_width: int, img_height: int) -> list[list[str]]:
    """
    Group detected cards into player hands based on spatial proximity.

    Cards in the same hand are typically arranged in a fan/row within a
    horizontal band. We cluster by y-position bands and x-position gaps.

    Args:
        detections: List of {letter, x, y, w, h, conf} dicts (pixel coords)
        img_width: Image width in pixels
        img_height: Image height in pixels

    Returns:
        List of groups, each group is a list of card letter strings.
        e.g. [["QU", "E", "ER"], ["CL", "O", "Y"], ["A"]]
    """
    if not detections:
        return []

    # Sort by x position (left to right)
    sorted_dets = sorted(detections, key=lambda d: d["x"])

    # Cluster into groups using gap-based separation
    # A gap of >15% of image width between consecutive cards = new group
    gap_threshold = img_width * 0.15

    groups: list[list[dict]] = [[sorted_dets[0]]]
    for det in sorted_dets[1:]:
        prev = groups[-1][-1]
        gap = det["x"] - prev["x"]
        if gap > gap_threshold:
            groups.append([det])
        else:
            groups[-1].append(det)

    # Within each group, sort cards left-to-right and extract letters
    result = []
    for group in groups:
        letters = [d["letter"] for d in sorted(group, key=lambda d: d["x"])]
        result.append(letters)

    return result


# ---------------------------------------------------------------------------
# Image decoding
# ---------------------------------------------------------------------------

def decode_base64_image(b64_data: str) -> np.ndarray:
    """Decode base64 image to numpy array for YOLO inference."""
    # Strip data URL prefix if present
    if "," in b64_data:
        b64_data = b64_data.split(",", 1)[1]

    img_bytes = base64.b64decode(b64_data)
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    return np.array(img)


# ---------------------------------------------------------------------------
# Anthropic-format response builder
# ---------------------------------------------------------------------------

def build_anthropic_response(words: list[list[str]]) -> dict:
    """
    Build a response that exactly matches the Anthropic Messages API format.
    proxy.js and visionApi.ts expect this structure.
    """
    result_json = json.dumps({"words": words})
    text = f"<result>{result_json}</result>"

    return {
        "id": f"local-{int(time.time() * 1000)}",
        "type": "message",
        "role": "assistant",
        "model": "local-quiddler-ocr",
        "content": [{"type": "text", "text": text}],
        "stop_reason": "end_turn",
        "stop_sequence": None,
        "usage": {"input_tokens": 0, "output_tokens": len(text)}
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health() -> dict:
    """Health check. proxy.js calls this before routing requests here."""
    model_loaded = _model is not None
    return {
        "status": "ok",
        "model": "local-quiddler-ocr",
        "model_path": str(_model_path) if _model_path else None,
        "model_loaded": model_loaded,
        "classes": len(CLASS_NAMES),
    }


@app.post("/v1/messages")
async def analyze_cards(request: dict[str, Any]) -> dict:
    """
    Anthropic-compatible card recognition endpoint.

    Accepts the same request body as the Anthropic Messages API.
    Extracts the base64 image, runs YOLOv8 inference, and returns
    a response in the same format so proxy.js needs no changes.
    """
    t_start = time.perf_counter()

    # Extract base64 image from Anthropic-format request
    messages = request.get("messages", [])
    b64_image = None
    for msg in messages:
        for content in msg.get("content", []):
            if content.get("type") == "image":
                source = content.get("source", {})
                if source.get("type") == "base64":
                    b64_image = source.get("data")
                    break
        if b64_image:
            break

    if not b64_image:
        raise HTTPException(status_code=400, detail="No base64 image found in request")

    # Decode image
    try:
        img_array = decode_base64_image(b64_image)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to decode image: {e}")

    img_height, img_width = img_array.shape[:2]

    # Run inference
    try:
        model = get_model()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    t_infer = time.perf_counter()
    results = model.predict(
        source=img_array,
        conf=0.3,       # Confidence threshold (lower = detect more, but more false positives)
        iou=0.5,        # NMS IoU threshold
        verbose=False,
        max_det=50,     # Max detections (Quiddler max ~10 cards per hand)
    )
    infer_ms = (time.perf_counter() - t_infer) * 1000

    # Parse detections
    detections = []
    for result in results:
        boxes = result.boxes
        if boxes is None:
            continue
        for box in boxes:
            cls_id = int(box.cls[0].item())
            conf = float(box.conf[0].item())
            if cls_id >= len(CLASS_NAMES):
                continue
            letter = CLASS_NAMES[cls_id]

            # Box center in pixel coords
            x_center = float(box.xywh[0][0].item())
            y_center = float(box.xywh[0][1].item())

            detections.append({
                "letter": letter,
                "x": x_center,
                "y": y_center,
                "conf": conf,
            })

    # Group into player hands
    words = group_cards_by_proximity(detections, img_width, img_height)

    total_ms = (time.perf_counter() - t_start) * 1000
    print(f"Inference: {infer_ms:.1f}ms | Total: {total_ms:.1f}ms | "
          f"Detected: {len(detections)} cards → {len(words)} groups: {words}")

    return build_anthropic_response(words)


@app.post("/test")
async def test_image(request: dict[str, Any]) -> dict:
    """
    Test endpoint: accepts a local file path for quick testing.
    Usage: curl -X POST http://localhost:3002/test -d '{"path": "/path/to/image.jpg"}'
    """
    path = Path(request.get("path", ""))
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")

    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()

    anthropic_request = {
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}},
                {"type": "text", "text": "Analyze this Quiddler hand."}
            ]
        }]
    }
    return await analyze_cards(anthropic_request)


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup_event():
    """Pre-load the model at startup so first request isn't slow."""
    print("Quiddler OCR Server starting up...")
    try:
        get_model()
        print(f"Ready on http://0.0.0.0:3002")
        print(f"  POST /v1/messages  — card recognition (Anthropic-compatible)")
        print(f"  GET  /health       — health check")
        print(f"  POST /test         — test with local file path")
    except RuntimeError as e:
        print(f"\nWARNING: Model not loaded: {e}")
        print("Server is running but will return 503 until model is trained.")
        print("Run: python train.py && python export.py")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3002)
