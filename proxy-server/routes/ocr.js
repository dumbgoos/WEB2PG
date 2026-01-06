// OCR API routes
import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// POST /api/ocr - Process screenshot with OCR and LLM analysis
router.post('/', async (req, res) => {
  console.log('🟢 [OCR-API] POST /api/ocr called');

  try {
    const { image, url, title, content, existingTags } = req.body;

    console.log('📥 [OCR-API] Request data:', {
      hasImage: !!image,
      imageLength: image?.length || 0,
      url,
      title,
      hasContent: !!content,
      contentLength: content?.text?.length || 0,
      existingTagsCount: existingTags?.length || 0
    });

    if (!image) {
      console.error('❌ [OCR-API] Image data is required');
      return res.status(400).json({ success: false, error: 'Image data is required' });
    }

    console.log('📸 [OCR-API] Received OCR request for:', url || title || 'Unknown page');

    // Call Python OCR service
    const ocrScriptPath = path.join(__dirname, '../services/ocr_service.py');

    console.log('🐍 [OCR-API] Starting Python OCR process...');
    console.log(`🐍 [OCR-API] Script path: ${ocrScriptPath}`);
    console.log(`🐍 [OCR-API] Image size: ${image.length} chars`);

    // Prepare data to send to Python (include context)
    const requestData = {
      image,
      url,
      title,
      content,
      existingTags
    };

    // Use stdin to pass image data instead of command line argument
    // to avoid ENAMETOOLONG error on Windows
    const pythonProcess = spawn('python', [ocrScriptPath], {
      cwd: path.join(__dirname, '../services'),
      env: { ...process.env }
    });

    console.log('✅ [OCR-API] Python process started');

    // Write request data as JSON to stdin
    pythonProcess.stdin.write(JSON.stringify(requestData));
    pythonProcess.stdin.end();

    let stdout = '';
    let stderr = '';

    // Configure encoding for Windows - use utf8 explicitly
    pythonProcess.stdout.setEncoding('utf8');
    pythonProcess.stderr.setEncoding('utf8');

    pythonProcess.stdout.on('data', (data) => {
      stdout += data;
      console.log('📤 [OCR-PYTHON] stdout chunk:', data.substring(0, 200) + (data.length > 200 ? '...' : ''));
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data;
      console.error('❌ [OCR-PYTHON] stderr:', data);
    });

    // Wait for process to complete
    console.log('⏳ [OCR-API] Waiting for Python process to complete...');
    const result = await new Promise((resolve, reject) => {
      pythonProcess.on('close', (code) => {
        console.log(`🏁 [OCR-API] Python process closed with code: ${code}`);
        console.log(`📊 [OCR-API] stdout length: ${stdout.length}`);
        console.log(`📊 [OCR-API] stderr length: ${stderr.length}`);

        if (code === 0) {
          try {
            console.log('📝 [OCR-API] Parsing JSON output...');
            const data = JSON.parse(stdout);
            console.log('✅ [OCR-API] JSON parsed successfully');
            resolve(data);
          } catch (parseError) {
            console.error('❌ [OCR-API] JSON parse error:', parseError.message);
            console.error('❌ [OCR-API] stdout:', stdout.substring(0, 500));
            reject(new Error(`Failed to parse OCR output: ${parseError.message}`));
          }
        } else {
          console.error('❌ [OCR-API] Process exited with non-zero code');
          reject(new Error(`OCR process exited with code ${code}: ${stderr}`));
        }
      });

      pythonProcess.on('error', (error) => {
        console.error('❌ [OCR-API] Python process error:', error);
        reject(new Error(`Failed to start OCR process: ${error.message}`));
      });

      // Set timeout (2 minutes)
      setTimeout(() => {
        console.error('❌ [OCR-API] Process timeout (120s), killing...');
        pythonProcess.kill();
        reject(new Error('OCR processing timeout (120s)'));
      }, 120000);
    });

    if (result.success) {
      console.log('✅ [OCR-API] OCR processing completed');
      console.log(`   - OCR text length: ${result.ocr_text?.length || 0}`);
      console.log(`   - Tags: ${result.analysis?.tags?.length || 0}`);
      console.log(`   - Actors: ${result.analysis?.actors?.length || 0}`);
      console.log(`   - Categories: ${result.analysis?.categories?.length || 0}`);

      console.log('📤 [OCR-API] Sending success response');
      res.json({
        success: true,
        ocr_text: result.ocr_text,
        analysis: result.analysis
      });
    } else {
      console.error('❌ [OCR-API] OCR processing failed:', result.error);
      throw new Error(result.error || 'OCR processing failed');
    }

  } catch (error) {
    console.error('❌ [OCR-API] OCR processing error:', error);
    console.error('❌ [OCR-API] Error stack:', error.stack);
    console.log('📤 [OCR-API] Sending error response');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
