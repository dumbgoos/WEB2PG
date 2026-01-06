#!/usr/bin/env python3
"""
DeepSeek OCR Service
Processes screenshots using DeepSeek-OCR model

Author: Ling Luo
"""

import os
import sys
import base64
import json
import requests
import io
from typing import Dict, Any, Optional, List
from dotenv import load_dotenv
from pathlib import Path

# Configure UTF-8 encoding for stdout/stderr (critical for Windows)
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Load environment variables from project root
# Get the project root directory (3 levels up from this script)
project_root = Path(__file__).parent.parent.parent
env_path = project_root / '.env'
load_dotenv(env_path)

# Comment out debug output to ensure only JSON is printed
# print(f"[ENV] Loading .env from: {env_path}")
# print(f"[ENV] .env exists: {env_path.exists()}")

class OCRService:
    def __init__(self):
        self.ocr_api_url = os.getenv('DEEPSEEK_OCR_URL', 'http://localhost:8000/ocr')

        # Support both OPENAI_API_BASE and OPENAI_BASE_URL
        base_url = os.getenv('OPENAI_API_BASE') or os.getenv('OPENAI_BASE_URL')
        self.llm_api_key = os.getenv('OPENAI_API_KEY')
        self.llm_model = os.getenv('OPENAI_MODEL', 'gpt-4o-mini')

        # Build full LLM API URL
        if base_url:
            # Remove trailing slash and append /chat/completions
            base_url = base_url.rstrip('/')
            if not base_url.endswith('/chat/completions'):
                self.llm_api_url = f"{base_url}/chat/completions"
            else:
                self.llm_api_url = base_url
        else:
            self.llm_api_url = 'https://api.openai.com/v1/chat/completions'

        # Debug output to stderr
        print(f"[CONFIG] OCR URL: {self.ocr_api_url}", file=sys.stderr)
        print(f"[CONFIG] LLM URL: {self.llm_api_url}", file=sys.stderr)
        print(f"[CONFIG] LLM Model: {self.llm_model}", file=sys.stderr)
        print(f"[CONFIG] API Key: {'Found' if self.llm_api_key else 'Not found'}", file=sys.stderr)

        if not self.llm_api_key:
            print("[WARNING] OPENAI_API_KEY not found in environment", file=sys.stderr)

    def process_screenshot(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process a screenshot using OCR and LLM analysis with full context

        Args:
            request_data: Dict containing image, url, title, content, existingTags

        Returns:
            Dict with ocr_text and analysis results
        """
        try:
            image_base64 = request_data.get('image', '')
            url = request_data.get('url', '')
            title = request_data.get('title', '')
            content = request_data.get('content', {})
            existing_tags = request_data.get('existingTags', [])

            # Clean base64 string
            if ',' in image_base64:
                image_base64 = image_base64.split(',', 1)[1]

            # Step 1: OCR using DeepSeek-OCR
            ocr_result = self._run_ocr(image_base64)

            if not ocr_result or 'text' not in ocr_result:
                return {
                    'success': False,
                    'error': 'OCR processing failed'
                }

            ocr_text = ocr_result['text']
            print(f"[OCR] Completed, extracted {len(ocr_text)} characters", file=sys.stderr)

            # Step 2: LLM Analysis with full context
            analysis = self._run_llm_analysis(
                ocr_text,
                url,
                title,
                content,
                existing_tags
            )

            return {
                'success': True,
                'ocr_text': ocr_text,
                'analysis': analysis
            }

        except Exception as e:
            print(f"[ERROR] Error processing screenshot: {e}", file=sys.stderr)
            import traceback
            print(f"[ERROR] Traceback: {traceback.format_exc()}", file=sys.stderr)
            return {
                'success': False,
                'error': str(e)
            }

    def _run_ocr(self, image_base64: str) -> Optional[Dict]:
        """
        Call local DeepSeek-OCR server at http://localhost:8000/ocr
        """
        try:
            # print(f"[OCR] Calling local OCR server at {self.ocr_api_url}")

            payload = {
                'image': image_base64,
                'prompt': '<image>\nFree OCR. Extract all text content.'
            }

            response = requests.post(
                self.ocr_api_url,
                json=payload
                # No timeout - let OCR complete naturally
            )

            response.raise_for_status()
            result = response.json()

            if result.get('success'):
                # print(f"[OCR] Completed successfully")
                return {'text': result.get('text', '')}
            else:
                # print(f"[OCR] Processing failed: {result.get('error', 'Unknown error')}")
                return None

        except requests.exceptions.ConnectionError:
            print(f"[ERROR] Cannot connect to OCR server at {self.ocr_api_url}", file=sys.stderr)
            print(f"   Please ensure the DeepSeek-OCR server is running", file=sys.stderr)
            return None
        except requests.exceptions.Timeout:
            print(f"[ERROR] OCR request timed out (120s)", file=sys.stderr)
            return None
        except Exception as e:
            print(f"[ERROR] OCR API error: {e}", file=sys.stderr)
            return None

    def _run_llm_analysis(self, ocr_text: str, url: str, title: str,
                          content: Dict[str, Any], existing_tags: List[str]) -> Dict[str, Any]:
        """
        Analyze page content using LLM to extract entity information

        Args:
            ocr_text: OCR extracted text from screenshot
            url: Page URL
            title: Page title
            content: Page content (text, excerpt, etc.)
            existing_tags: Tags already extracted from page

        Returns:
            Dict with extracted entity information
        """
        if not self.llm_api_key:
            print("[WARNING] No LLM API key, skipping analysis", file=sys.stderr)
            return {}

        try:
            print(f"[LLM] Starting LLM analysis with context...", file=sys.stderr)
            print(f"[LLM] - OCR text: {len(ocr_text)} chars", file=sys.stderr)
            print(f"[LLM] - Content text: {content.get('wordCount', 0)} words", file=sys.stderr)
            print(f"[LLM] - Existing tags: {len(existing_tags)}", file=sys.stderr)

            prompt = self._build_analysis_prompt(ocr_text, url, title, content, existing_tags)

            payload = {
                'model': self.llm_model,
                'messages': [
                    {
                        'role': 'system',
                        'content': '你是一位分析网页并提取主要实体（电影、视频、文章、产品等）结构化信息的专家。专注于实体本身，而不是网站。请用中文回答。注意：只提取合法、通用的内容类型。'
                    },
                    {
                        'role': 'user',
                        'content': prompt
                    }
                ],
                'temperature': 0.3,
                'max_tokens': 3000
            }

            headers = {
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {self.llm_api_key}'
            }

            print(f"[LLM] Sending request to: {self.llm_api_url}", file=sys.stderr)
            print(f"[LLM] Using model: {self.llm_model}", file=sys.stderr)

            response = requests.post(
                self.llm_api_url,
                json=payload,
                headers=headers,
                timeout=30
            )

            print(f"[LLM] Response status: {response.status_code}", file=sys.stderr)
            response.raise_for_status()

            result = response.json()

            # Debug: print raw response structure
            print(f"[LLM] Response keys: {list(result.keys())}", file=sys.stderr)

            # Handle different response formats
            if 'choices' in result and len(result['choices']) > 0:
                content_response = result['choices'][0]['message']['content']
            elif 'message' in result:
                content_response = result['message']['content']
            elif 'content' in result:
                content_response = result['content']
            else:
                print(f"[ERROR] Unexpected response format: {result}", file=sys.stderr)
                return {}

            print(f"[LLM] Content length: {len(content_response)} characters", file=sys.stderr)

            # Parse the structured response
            analysis = self._parse_llm_response(content_response)

            print(f"[LLM] Analysis completed:", file=sys.stderr)
            print(f"[LLM] - Entity type: {analysis.get('entity_type', 'unknown')}", file=sys.stderr)
            print(f"[LLM] - Tags: {len(analysis.get('tags', []))}", file=sys.stderr)
            print(f"[LLM] - Actors/Cast: {len(analysis.get('actors', []))}", file=sys.stderr)
            print(f"[LLM] - Categories: {len(analysis.get('categories', []))}", file=sys.stderr)

            return analysis

        except requests.exceptions.HTTPError as e:
            print(f"[ERROR] LLM HTTP error: {e}", file=sys.stderr)
            print(f"[ERROR] Response body: {e.response.text[:500] if hasattr(e, 'response') else 'N/A'}", file=sys.stderr)
            return {}
        except Exception as e:
            print(f"[ERROR] LLM analysis error: {e}", file=sys.stderr)
            import traceback
            print(f"[ERROR] Traceback: {traceback.format_exc()}", file=sys.stderr)
            return {}

    def _build_analysis_prompt(self, ocr_text: str, url: str, title: str,
                            content: Dict[str, Any], existing_tags: List[str]) -> str:
        """Build the analysis prompt for the LLM with full context"""

        # Build context sections
        context_parts = []

        # 1. Title (most important)
        if title:
            context_parts.append(f"**Title:** {title}")

        # 2. URL (for domain/pattern clues)
        if url:
            context_parts.append(f"**URL:** {url}")

        # 3. Content excerpt
        if content and content.get('excerpt'):
            context_parts.append(f"**Excerpt:** {content['excerpt'][:500]}")

        # 4. Existing tags (as hints)
        if existing_tags and len(existing_tags) > 0:
            context_parts.append(f"**Existing Tags:** {', '.join(existing_tags[:10])}")

        # 5. OCR text
        # Truncate if too long (max 3000 chars for OCR)
        ocr_excerpt = ocr_text[:3000]
        if len(ocr_text) > 3000:
            ocr_excerpt += '\n...(OCR text truncated)'

        context_parts.append(f"**OCR Text (from screenshot):**\n{ocr_excerpt}")

        # Combine all context
        full_context = '\n\n'.join(context_parts)

        prompt = f"""你正在分析一个网页，以提取关于**主要实体**的结构化信息（电影、视频、文章、产品等）。

## 页面上下文：
{full_context}

## 你的任务：

首先，识别**实体类型**（从以下类别中选择）：
- **video**: 视频/电影
- **article**: 博客文章、新闻报道
- **product**: 电商产品
- **profile**: 人物/演员资料页
- **other**: 其他类型

然后提取实体特定的信息：

### 视频/电影 (video):
```json
{{
  "entity_type": "video",
  "title": "电影/视频标题",
  "cast": ["主要演员"],
  "director": "导演名字",
  "genre": ["类型"],
  "year": "发行年份",
  "tags": ["相关标签"],
  "categories": ["分类"],
  "description": "简短摘要"
}}
```

### 文章 (article):
```json
{{
  "entity_type": "article",
  "title": "文章标题",
  "author": "作者名字",
  "tags": ["主题标签"],
  "categories": ["分类"],
  "summary": "文章摘要",
  "language": "内容语言"
}}
```

### 产品 (product):
```json
{{
  "entity_type": "product",
  "title": "产品名称",
  "brand": "品牌/制造商",
  "price": "价格（如果可用）",
  "tags": ["产品特性/标签"],
  "categories": ["产品分类"],
  "description": "产品描述"
}}
```

### 其他类型 (other):
```json
{{
  "entity_type": "other",
  "title": "主要标题/标题",
  "tags": ["相关标签"],
  "categories": ["分类"],
  "description": "简短描述"
}}
```

## 重要规则：

1. **专注于实体本身**，而不是网站
2. 仅当上下文中存在信息时才提取
3. 使用**标题**作为主要依据
4. 标签和描述尽量使用中文，但保留人名的原始写法
5. 如果字段没有数据，返回空数组或 null
6. **只返回有效的 JSON**，不要包含任何额外文本
7. **所有描述性文本必须使用中文**

基于以上上下文，提取实体信息：

JSON:"""

        return prompt

    def _parse_llm_response(self, response: str) -> Dict[str, Any]:
        """Parse LLM response and extract JSON"""
        try:
            # Try to extract JSON from response
            import re

            # Find JSON object in response
            json_match = re.search(r'\{[\s\S]*\}', response)

            if json_match:
                json_str = json_match.group(0)
                data = json.loads(json_str)

                # Ensure all required fields exist
                return {
                    'tags': data.get('tags', []),
                    'actors': data.get('actors', []),
                    'categories': data.get('categories', []),
                    'keywords': data.get('keywords', []),
                    'summary': data.get('summary', ''),
                    'language': data.get('language', 'unknown'),
                    'content_type': data.get('content_type', 'unknown'),
                    'entities': data.get('entities', {})
                }
            else:
                print("[WARNING] No JSON found in LLM response")
                return {}

        except json.JSONDecodeError as e:
            print(f"[WARNING] Failed to parse LLM JSON response: {e}")
            return {}
        except Exception as e:
            print(f"[WARNING] Error parsing LLM response: {e}")
            return {}


def main():
    """Test the OCR service"""
    import sys

    # Debug: indicate script started
    print("[DEBUG] OCR service script started", file=sys.stderr)
    sys.stderr.flush()

    try:
        # Read JSON request from stdin (to avoid ENAMETOOLONG error)
        print("[DEBUG] Reading from stdin...", file=sys.stderr)
        sys.stderr.flush()

        # Use a timeout for stdin read
        import signal

        def timeout_handler(signum, frame):
            raise TimeoutError("stdin read timeout")

        # Set alarm for 10 seconds (only works on Unix)
        if hasattr(signal, 'SIGALRM'):
            signal.signal(signal.SIGALRM, timeout_handler)
            signal.alarm(10)  # 10 second timeout

        try:
            input_data = sys.stdin.read().strip()

            if hasattr(signal, 'SIGALRM'):
                signal.alarm(0)  # Cancel alarm
        except TimeoutError:
            print("[ERROR] stdin read timeout after 10 seconds", file=sys.stderr)
            print(json.dumps({
                'success': False,
                'error': 'stdin read timeout'
            }, indent=2, ensure_ascii=False))
            sys.exit(1)

        print(f"[DEBUG] Read {len(input_data)} characters from stdin", file=sys.stderr)

        if not input_data:
            print("[ERROR] No data received from stdin", file=sys.stderr)
            print(json.dumps({
                'success': False,
                'error': 'No data provided via stdin'
            }, indent=2, ensure_ascii=False))
            sys.exit(1)

        # Parse JSON
        print("[DEBUG] Parsing JSON...", file=sys.stderr)
        try:
            request_data = json.loads(input_data)
            print(f"[DEBUG] JSON parsed successfully", file=sys.stderr)
        except json.JSONDecodeError as e:
            print(f"[ERROR] JSON decode error: {e}", file=sys.stderr)
            print(f"[ERROR] First 200 chars of input: {input_data[:200]}", file=sys.stderr)
            print(json.dumps({
                'success': False,
                'error': f'Invalid JSON input: {e}'
            }, indent=2, ensure_ascii=False))
            sys.exit(1)

        # Validate required fields
        if 'image' not in request_data:
            print("[ERROR] Missing required field: image", file=sys.stderr)
            print(json.dumps({
                'success': False,
                'error': 'Missing required field: image'
            }, indent=2, ensure_ascii=False))
            sys.exit(1)

        print(f"[DEBUG] Request data keys: {list(request_data.keys())}", file=sys.stderr)

        # Process screenshot
        print("[DEBUG] Creating OCRService instance...", file=sys.stderr)
        service = OCRService()
        print("[DEBUG] Starting screenshot processing...", file=sys.stderr)

        result = service.process_screenshot(request_data)

        print(f"[DEBUG] Processing completed. Success: {result.get('success')}", file=sys.stderr)

        # Output result
        print(json.dumps(result, indent=2, ensure_ascii=False))

    except Exception as e:
        print(f"[ERROR] Unexpected error in main: {e}", file=sys.stderr)
        import traceback
        print(f"[ERROR] Traceback:\n{traceback.format_exc()}", file=sys.stderr)

        print(json.dumps({
            'success': False,
            'error': f'Unexpected error: {e}'
        }, indent=2, ensure_ascii=False))
        sys.exit(1)


if __name__ == '__main__':
    main()
