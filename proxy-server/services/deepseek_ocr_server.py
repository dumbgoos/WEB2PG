#!/usr/bin/env python3
"""
DeepSeek-OCR Server
Local FastAPI server for DeepSeek-OCR model

Author: Ling Luo
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from PIL import Image
import io
import base64
import torch
import os
import sys
from pathlib import Path
import logging

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="DeepSeek-OCR Server")

# Model configuration
MODEL_PATH = Path(r"C:\\Ling Luo\\softwares\\Web2PG\\model\\deepseek-ai\\DeepSeek-OCR")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Global model variable
model = None
tokenizer = None

class OCRRequest(BaseModel):
    image: str  # Base64 encoded image
    prompt: str = "<image>\nFree OCR."

class OCRResponse(BaseModel):
    success: bool
    text: str = ""
    error: str = ""

def load_model():
    """Load DeepSeek-OCR model"""
    global model, tokenizer

    try:
        logger.info(f"Loading DeepSeek-OCR model from {MODEL_PATH}")
        logger.info(f"Using device: {DEVICE}")

        from transformers import AutoModel, AutoTokenizer

        # Load tokenizer
        logger.info("Loading tokenizer...")
        tokenizer = AutoTokenizer.from_pretrained(
            str(MODEL_PATH),
            trust_remote_code=True
        )

        # Load model
        logger.info("Loading model...")
        model = AutoModel.from_pretrained(
            str(MODEL_PATH),
            trust_remote_code=True,
            use_safetensors=True
        )

        # Move to device and set to evaluation mode
        model = model.to(DEVICE)
        model = model.eval()

        # Use bfloat16 for GPU if available
        if DEVICE == "cuda":
            try:
                model = model.to(torch.bfloat16)
                logger.info("Using bfloat16 precision")
            except:
                logger.info("bfloat16 not available, using default precision")

        logger.info("✅ Model loaded successfully!")
        return True

    except Exception as e:
        logger.error(f"❌ Failed to load model: {e}")
        return False

@app.on_event("startup")
async def startup_event():
    """Load model on startup"""
    success = load_model()
    if not success:
        logger.error("Failed to start server - model loading failed")
        sys.exit(1)

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "DeepSeek-OCR Server",
        "status": "running",
        "model_path": str(MODEL_PATH),
        "device": DEVICE
    }

@app.post("/ocr", response_model=OCRResponse)
async def ocr_endpoint(request: OCRRequest):
    """
    Perform OCR on an image

    Args:
        request: OCRRequest with base64 image and optional prompt
    """
    if model is None or tokenizer is None:
        raise HTTPException(status_code=500, detail="Model not loaded")

    try:
        # Decode base64 image
        logger.info("Received OCR request")

        # Remove data URL prefix if present
        image_data = request.image
        if ',' in image_data:
            image_data = image_data.split(',', 1)[1]

        # Decode base64
        image_bytes = base64.b64decode(image_data)

        # Convert to PIL Image
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        logger.info(f"Image size: {image.size}")

        # Prepare prompt
        prompt = request.prompt

        # Run inference
        logger.info("Running OCR inference...")

        # Create a temporary directory in current directory for output
        import os
        current_dir = Path.cwd()
        temp_dir = current_dir / "tmp"
        temp_dir.mkdir(exist_ok=True)

        logger.info(f"Using temp directory: {temp_dir}")

        # Generate unique filename for the image
        import uuid
        temp_image_path = temp_dir / f"{uuid.uuid4()}.png"

        # Save image to file
        image.save(temp_image_path, format='PNG')

        logger.info(f"Saved temporary image to: {temp_image_path}")

        try:
            # Call model infer method
            # Note: We're using the Gundam settings from README:
            # base_size = 1024, image_size = 640, crop_mode = True
            # eval_mode=True to get the return value instead of saving to file
            output = model.infer(
                tokenizer,
                prompt=prompt,
                image_file=str(temp_image_path),  # Pass file path, not PIL Image
                output_path=str(temp_dir),  # Use temp directory for output
                base_size=1024,
                image_size=640,
                crop_mode=True,
                save_results=False,
                test_compress=False,
                eval_mode=True  # Set to True to get return value
            )

            logger.info(f"OCR inference completed, output type: {type(output)}")

            # Check if output is valid
            if output is None:
                logger.warning("OCR returned None, checking for output files...")
                # Check if there are any output files in temp_dir
                output_files = list(temp_dir.glob("*.mmd"))
                if output_files:
                    logger.info(f"Found {len(output_files)} output files")
                    with open(output_files[0], 'r', encoding='utf-8') as f:
                        output = f.read()
                else:
                    output = ""

        finally:
            # Clean up temporary image file (keep the tmp directory for debugging)
            try:
                os.unlink(temp_image_path)
                logger.info(f"Cleaned up temporary file: {temp_image_path}")
            except:
                pass

        if output is None:
            output = ""

        logger.info(f"✅ OCR completed, output length: {len(output)}")

        return OCRResponse(
            success=True,
            text=output
        )

    except Exception as e:
        logger.error(f"OCR error: {e}", exc_info=True)
        return OCRResponse(
            success=False,
            error=str(e)
        )

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "model_loaded": model is not None,
        "device": DEVICE
    }

if __name__ == "__main__":
    import uvicorn

    # Check if model path exists
    if not MODEL_PATH.exists():
        logger.error(f"❌ Model path not found: {MODEL_PATH}")
        logger.error("Please download the model to the specified path")
        sys.exit(1)

    # Start server
    logger.info("🚀 Starting DeepSeek-OCR Server...")
    logger.info(f"Model path: {MODEL_PATH}")
    logger.info(f"Device: {DEVICE}")

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        log_level="info"
    )
