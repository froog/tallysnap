#!/usr/bin/env python3
"""
test_pipeline.py — End-to-end validation for Quiddler OCR pipeline

Run this on your Mac Mini after setup to verify every stage works before
you start collecting training data or training the model.

Usage:
    python test_pipeline.py           # Run all tests
    python test_pipeline.py --verbose # Show extra detail on failures
"""

import argparse
import importlib
import json
import sys
import traceback
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent
TEST_IMAGES_DIR = REPO_ROOT / "public" / "test-images"
DATASET_YAML = SCRIPT_DIR / "dataset.yaml"

PASS = "\033[32mPASS\033[0m"
FAIL = "\033[31mFAIL\033[0m"
SKIP = "\033[33mSKIP\033[0m"

results: list[tuple[str, bool, str]] = []  # (name, passed, detail)
verbose = False


def test(name: str):
    """Decorator that catches exceptions and records pass/fail."""
    def decorator(fn):
        def wrapper():
            try:
                detail = fn() or ""
                results.append((name, True, detail))
                print(f"  {PASS}  {name}" + (f" — {detail}" if detail else ""))
            except Exception as e:
                detail = traceback.format_exc() if verbose else str(e)
                results.append((name, False, detail))
                print(f"  {FAIL}  {name}")
                print(f"        {str(e)}")
                if verbose:
                    print(detail)
        return wrapper
    return decorator


# ---------------------------------------------------------------------------
# Test 1: Core Python imports
# ---------------------------------------------------------------------------

@test("Core imports (torch, fastapi, PIL, cv2)")
def test_imports():
    missing = []
    for pkg, import_name in [
        ("torch", "torch"),
        ("fastapi", "fastapi"),
        ("PIL", "PIL"),
        ("cv2", "cv2"),
        ("numpy", "numpy"),
        ("uvicorn", "uvicorn"),
        ("yaml", "yaml"),
    ]:
        try:
            importlib.import_module(import_name)
        except ImportError:
            missing.append(pkg)
    if missing:
        raise ImportError(f"Missing packages: {', '.join(missing)}. Run: pip install -r requirements.txt")
    return f"all packages present"


@test("ultralytics (YOLOv8)")
def test_ultralytics():
    from ultralytics import YOLO  # noqa: F401
    import ultralytics
    return f"v{ultralytics.__version__}"


@test("anthropic SDK")
def test_anthropic():
    import anthropic
    return f"v{anthropic.__version__}"


# ---------------------------------------------------------------------------
# Test 2: Apple Silicon MPS
# ---------------------------------------------------------------------------

@test("Apple Silicon MPS (M4 GPU)")
def test_mps():
    import torch
    if not torch.backends.mps.is_available():
        raise RuntimeError(
            "MPS not available. Training will use CPU (much slower).\n"
            "  Requires: macOS 12.3+, Apple Silicon chip, PyTorch 1.12+"
        )
    # Quick tensor op on MPS to confirm it actually works
    t = torch.tensor([1.0, 2.0, 3.0], device="mps")
    result = (t * 2).sum().item()
    assert result == 12.0, f"MPS computation gave wrong result: {result}"
    return "MPS tensor ops working"


# ---------------------------------------------------------------------------
# Test 3: Dataset config
# ---------------------------------------------------------------------------

@test("dataset.yaml — structure and class count")
def test_dataset_yaml():
    import yaml
    if not DATASET_YAML.exists():
        raise FileNotFoundError(f"Not found: {DATASET_YAML}")
    with open(DATASET_YAML) as f:
        cfg = yaml.safe_load(f)
    nc = cfg.get("nc")
    names = cfg.get("names", {})
    if nc != 31:
        raise ValueError(f"Expected nc=31, got nc={nc}")
    if len(names) != 31:
        raise ValueError(f"Expected 31 class names, got {len(names)}")
    # Verify all expected cards are present
    expected = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ") | {"TH", "QU", "IN", "ER", "CL"}
    actual = set(names.values()) if isinstance(names, dict) else set(names)
    missing = expected - actual
    if missing:
        raise ValueError(f"Missing cards in dataset.yaml: {missing}")
    return "31 classes, all card types present"


# ---------------------------------------------------------------------------
# Test 4: Test images readable
# ---------------------------------------------------------------------------

@test("Test images — all 4 decode correctly")
def test_images():
    from PIL import Image as PILImage
    if not TEST_IMAGES_DIR.exists():
        raise FileNotFoundError(f"Not found: {TEST_IMAGES_DIR}")
    jpegs = list(TEST_IMAGES_DIR.glob("*.jpeg")) + list(TEST_IMAGES_DIR.glob("*.jpg"))
    if len(jpegs) < 4:
        raise FileNotFoundError(f"Expected 4 test images, found {len(jpegs)} in {TEST_IMAGES_DIR}")
    sizes = []
    for p in sorted(jpegs):
        img = PILImage.open(p)
        img.verify()
        sizes.append(f"{p.name} ({img.size[0]}x{img.size[1]})" if hasattr(img, 'size') else p.name)
    # Re-open after verify (verify closes the file)
    for p in sorted(jpegs):
        img = PILImage.open(p)
        w, h = img.size
        assert w > 0 and h > 0, f"Empty image: {p.name}"
    return f"{len(jpegs)} images OK"


# ---------------------------------------------------------------------------
# Test 5: collect.py image discovery
# ---------------------------------------------------------------------------

@test("collect.py — image discovery finds 4 test images")
def test_collect_discovery():
    sys.path.insert(0, str(SCRIPT_DIR))
    import collect
    found = collect.collect_images(TEST_IMAGES_DIR)
    if len(found) != 4:
        raise AssertionError(f"Expected 4 images, found {len(found)}: {[p.name for p in found]}")
    return f"found {len(found)} images"


@test("collect.py — CLASS_INDEX covers all 31 card types")
def test_collect_classes():
    import collect
    expected = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ") | {"TH", "QU", "IN", "ER", "CL"}
    actual = set(collect.CLASS_INDEX.keys())
    missing = expected - actual
    if missing:
        raise ValueError(f"Missing from CLASS_INDEX: {missing}")
    if len(collect.CLASS_NAMES) != 31:
        raise ValueError(f"Expected 31 CLASS_NAMES, got {len(collect.CLASS_NAMES)}")
    return "all 31 card types indexed"


# ---------------------------------------------------------------------------
# Test 6: server.py — module imports cleanly, get_model raises expected error
# ---------------------------------------------------------------------------

@test("server.py — module imports without errors")
def test_server_import():
    # Import without starting the server
    import importlib.util
    spec = importlib.util.spec_from_file_location("server", SCRIPT_DIR / "server.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    # Verify expected attributes
    assert hasattr(mod, "app"), "server.py missing 'app' FastAPI instance"
    assert hasattr(mod, "CLASS_NAMES"), "server.py missing CLASS_NAMES"
    assert len(mod.CLASS_NAMES) == 31, f"Expected 31 CLASS_NAMES, got {len(mod.CLASS_NAMES)}"
    return "FastAPI app and CLASS_NAMES present"


@test("server.py — get_model() raises clean error when no model trained yet")
def test_server_no_model():
    import importlib.util
    spec = importlib.util.spec_from_file_location("server_mod", SCRIPT_DIR / "server.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    # Reset cached model to simulate fresh start
    mod._model = None
    mod._model_path = None
    try:
        mod.get_model()
        # If no exception was raised and no model exists, that's unexpected
        if not (SCRIPT_DIR / "models").exists():
            raise AssertionError("get_model() should raise RuntimeError when no model exists")
    except RuntimeError as e:
        msg = str(e)
        assert "train.py" in msg or "model" in msg.lower(), f"Unexpected error message: {msg}"
        return "raises RuntimeError with helpful message"
    return "model already trained (skipped no-model test)"


@test("server.py — response format matches Anthropic API")
def test_server_response_format():
    import importlib.util
    spec = importlib.util.spec_from_file_location("server_fmt", SCRIPT_DIR / "server.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    words = [["QU", "E", "ER"], ["CL", "O"], ["A"]]
    response = mod.build_anthropic_response(words)
    assert "content" in response, "Missing 'content' key"
    assert isinstance(response["content"], list), "'content' should be a list"
    text = response["content"][0]["text"]
    match = __import__("re").search(r"<result>(.*?)</result>", text)
    assert match, f"No <result> tags in response text: {text}"
    parsed = json.loads(match.group(1))
    assert parsed["words"] == words, f"Round-trip mismatch: {parsed['words']} != {words}"
    return "Anthropic-format response round-trips correctly"


# ---------------------------------------------------------------------------
# Test 7: Trained model inference (optional — skipped if no model found)
# ---------------------------------------------------------------------------

@test("Trained model — inference on test image (skipped if not trained)")
def test_model_inference():
    import importlib.util
    import base64

    # Find a trained model
    candidates = sorted(SCRIPT_DIR.glob("models/**/best.pt"),
                        key=lambda p: p.stat().st_mtime, reverse=True)
    if not candidates:
        # Not an error — user hasn't trained yet
        print(f"        (no trained model found — run: python train.py)")
        results[-1] = (results[-1][0], True, "skipped — no model trained yet")
        return

    model_path = candidates[0]

    # Load server module for inference
    spec = importlib.util.spec_from_file_location("server_infer", SCRIPT_DIR / "server.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod._model = None
    mod._model_path = None

    # Load model
    from ultralytics import YOLO
    mod._model = YOLO(str(model_path))
    mod._model_path = model_path

    # Run on first test image
    test_img = sorted(TEST_IMAGES_DIR.glob("*.jpeg"))[0]
    with open(test_img, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()

    import asyncio
    request = {
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}},
                {"type": "text", "text": "Analyze this Quiddler hand."}
            ]
        }]
    }
    response = asyncio.run(mod.analyze_cards(request))

    assert "content" in response
    text = response["content"][0]["text"]
    match = __import__("re").search(r"<result>(.*?)</result>", text)
    assert match, f"No <result> in response: {text}"
    parsed = json.loads(match.group(1))
    assert "words" in parsed, f"No 'words' key in parsed response: {parsed}"
    assert isinstance(parsed["words"], list), "'words' should be a list"

    card_count = sum(len(g) for g in parsed["words"])
    return f"model={model_path.parent.parent.name}, detected {card_count} cards in {test_img.name}"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    global verbose
    parser = argparse.ArgumentParser(description="Validate Quiddler OCR pipeline")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show full tracebacks on failure")
    args = parser.parse_args()
    verbose = args.verbose

    print(f"\n{'='*55}")
    print("  Quiddler OCR Pipeline — Validation")
    print(f"{'='*55}\n")

    # Run all tests
    test_imports()
    test_ultralytics()
    test_anthropic()
    test_mps()
    test_dataset_yaml()
    test_images()
    test_collect_discovery()
    test_collect_classes()
    test_server_import()
    test_server_no_model()
    test_server_response_format()
    test_model_inference()

    # Summary
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    failed = [(name, detail) for name, ok, detail in results if not ok]

    print(f"\n{'='*55}")
    print(f"  Results: {passed}/{total} passed")
    print(f"{'='*55}")

    if failed:
        print("\nFailed tests:")
        for name, detail in failed:
            print(f"  ✗ {name}")
            if verbose and detail:
                for line in detail.splitlines():
                    print(f"    {line}")
        print()
        sys.exit(1)
    else:
        print("\nAll tests passed! Ready to proceed.\n")
        has_model = any(SCRIPT_DIR.glob("models/**/best.pt"))
        if not has_model:
            print("Next steps:")
            print("  1. Label training images:")
            print("     python collect.py --images ../public/test-images/ --out data/")
            print("  2. Train the model (~30-60 min on M4):")
            print("     python train.py")
            print("  3. Re-run this script to test model inference:")
            print("     python test_pipeline.py")
        else:
            print("Model is trained. Start the inference server:")
            print("  uvicorn server:app --port 3002")
            print("Then run the app:")
            print("  cd .. && npm start")
        print()


if __name__ == "__main__":
    main()
