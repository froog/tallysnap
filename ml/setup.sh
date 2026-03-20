#!/bin/bash
# Setup script for Quiddler OCR training environment on Mac Mini M4
set -e

echo "=== Quiddler OCR Model Setup ==="
echo ""

# Check Python version
python3 --version || { echo "ERROR: Python 3 not found. Install from https://python.org"; exit 1; }

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate venv
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo ""
echo "=== Verifying M4 MPS support ==="
python3 -c "
import torch
mps = torch.backends.mps.is_available()
print(f'MPS (Apple Silicon GPU) available: {mps}')
if not mps:
    print('WARNING: MPS not available. Training will use CPU (slower).')
    print('Make sure you are on macOS 12.3+ with Apple Silicon.')
else:
    print('M4 GPU acceleration is ready for training!')
"

echo ""
echo "=== Creating directory structure ==="
mkdir -p data/images/train data/images/val
mkdir -p data/labels/train data/labels/val
mkdir -p models

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Collect training images:"
echo "     python collect.py --images ../public/test-images/ --out data/"
echo ""
echo "  2. Train the model (~30-60 min on M4):"
echo "     python train.py"
echo ""
echo "  3. Export the model:"
echo "     python export.py"
echo ""
echo "  4. Start inference server:"
echo "     uvicorn server:app --port 3002"
echo ""
echo "  5. Run TallySnap normally — proxy auto-detects local server:"
echo "     cd .. && npm start"
