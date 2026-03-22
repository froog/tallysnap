# How TallySnap Works

TallySnap scans a Quiddler card hand with your camera and automatically scores it. It uses a local YOLOv8 model for fast offline recognition, falling back to the Claude Vision API when the local model isn't running.

---

## Runtime Flow

```mermaid
flowchart TD
    A[User captures image] --> B["React App
    src/App.tsx"]
    B --> C["Compress to ≤4.9MB
    imageCompression.ts"]
    C --> D["Proxy Server :3001
    proxy.js"]

    D --> E{"Local OCR server
    available?
    localhost:3002"}

    E -->|"Yes — fast path"| F["FastAPI OCR Server :3002
    ml/server.py"]
    F --> G["YOLOv8 inference
    conf=0.3  IoU=0.5  max_det=50"]
    G --> H["Group cards by proximity
    sort left → right"]

    E -->|"No — fallback"| I["Anthropic Cloud API
    Claude Vision"]
    I --> J["Claude reads corner
    letter on each card"]

    H --> K["Card groups detected
    e.g. QU-E-ER / CL-O"]
    J --> K

    K --> L["QuiddlerPlugin.ts
    score each word group"]
    L --> M["Dictionary check
    SOWPODS word list"]
    M --> N["Score Screen
    total · word breakdown · valid/invalid"]

    N --> O{"Game mode?"}
    O -->|Yes| P["Save to gameState
    localStorage"]
    O -->|"Quick scan"| Q[Done]
    P --> R[Next player / next round]
```

---

## ML Training Pipeline

The local YOLOv8 model is trained on photos of real Quiddler cards. Claude Vision auto-generates the bounding-box labels so no manual annotation is needed.

```mermaid
flowchart LR
    A["Photos of cards"] --> B["ml/collect.py
    auto-label with Claude Vision API
    → YOLO format annotations"]
    B --> C["ml/data/
    images/ + labels/
    train/ & val/ splits"]
    C --> D["ml/train.py
    YOLOv8-nano fine-tune
    150 epochs · MPS/CUDA/CPU"]
    D --> E["ml/models/quiddler-v1/
    weights/best.pt"]
    E --> F["ml/export.py
    → quiddler.onnx
    → quiddler.mlpackage"]
    F --> G["ml/server.py
    FastAPI inference server :3002"]
```

**31 card classes:** A–Z plus the double-letter cards TH · QU · IN · ER · CL

---

## Key Files

| File | Role |
|---|---|
| `src/App.tsx` | React UI, game state, round/player flow |
| `src/services/visionApi.ts` | Sends image to proxy, parses card groups |
| `src/services/imageCompression.ts` | Reduces image to ≤4.9MB before upload |
| `src/plugins/QuiddlerPlugin.ts` | Card point values, word scoring rules |
| `proxy.js` | Routes to local OCR server or Anthropic API |
| `ml/collect.py` | Auto-labels card photos using Claude Vision |
| `ml/train.py` | Fine-tunes YOLOv8 on labeled card images |
| `ml/export.py` | Exports model to ONNX / CoreML |
| `ml/server.py` | FastAPI server wrapping YOLOv8 inference |
| `ml/dataset.yaml` | YOLO dataset config — 31 class names & paths |
