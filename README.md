# Web2PG: The AI-Powered Web Archiver for PostgreSQL

Transform unstructured web content into a clean, searchable knowledge base for AI training and data analysis. Web2PG is a powerful browser extension that intelligently captures, cleans, and stores web pages directly into your PostgreSQL database. It's the essential tool for developers and researchers building high-quality datasets for LLM training, RAG applications, or long-term web archiving.

## Installation

### 1. Database Setup

First, create the PostgreSQL database and run the schema:

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE web;

# Exit psql
\q

# Run the schema
psql -U postgres -d web -f database/schema.sql

# Run indexes
psql -U postgres -d web -f database/indexes.sql

# (Optional) Load test data
psql -U postgres -d web -f database/seed.sql
```

Create a `.env` file in the project root:

```env
# Database Configuration
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=web
PG_USER=postgres
PG_PASSWORD=your_password

# OCR Service (Optional)
DEEPSEEK_OCR_URL=http://localhost:8000/ocr

# LLM API (Optional - for AI analysis)
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

### 2. Start the Proxy Server

```bash
cd proxy-server
npm install
npm start
```

The proxy server will start on `http://localhost:3000`

You should see:
```
╔════════════════════════════════════════════════════════════╗
║           Web2PG Proxy Server Started                    ║
╠════════════════════════════════════════════════════════════╣
║  Server running on: http://localhost:3000               ║
║  Environment:     development                            ║
║  Database:        web@localhost                         ║
╚════════════════════════════════════════════════════════════╝
```

### 3. (Optional) Setup OCR Service

If you want to use OCR text extraction, follow these steps:

#### Step 1: Create Conda Environment

The easiest way to set up the OCR environment is to use conda:

```bash
# Create a new conda environment named 'ocr' from the environment.yaml file
conda env create -f environment.yaml

# Activate the ocr environment
conda activate ocr
```

The `environment.yaml` file includes all required dependencies:
- Python 3.12
- PyTorch with CUDA support (for GPU acceleration)
- FastAPI & Uvicorn (for the OCR server)
- Transformers & Tokenizers (for the DeepSeek-OCR model)
- PIL/Pillow (for image processing)
- Other required dependencies

#### Step 2: Download the DeepSeek-OCR Model

Download the DeepSeek-OCR model from Hugging Face or the official repository. Place it in a directory of your choice (e.g., `C:/path/to/model/deepseek-ai/DeepSeek-OCR`).

Update the model path in `proxy-server/services/deepseek_ocr_server.py`:
```python
MODEL_PATH = Path(r"C:\path\to\your\model\deepseek-ai\DeepSeek-OCR")
```

#### Step 3: Start the OCR Server

With the `ocr` conda environment activated, start the OCR server:

```bash
cd proxy-server/services
python deepseek_ocr_server.py
```

The OCR server will start on `http://localhost:8000`

You can verify it's running by visiting `http://localhost:8000/health` in your browser or using curl:
```bash
curl http://localhost:8000/health
```

### 4. Load the Browser Extension

1. Open Chrome/Edge and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `extension` folder in this project
5. The Web2PG extension should now appear in your browser

## Usage

### Saving a Page

1. Navigate to any webpage
2. Click the Web2PG extension icon
3. Optionally enable "Enable OCR" to capture full-page screenshots and extract text
4. Click "Save to Archive"
5. The page will be extracted and saved to your database

### Searching Saved Pages

1. Open the Web2PG popup
2. Type your search query in the search box
3. Results appear instantly with highlighted matches
4. Click any result to open it in a new tab

### Settings

Click the gear icon in the popup to access settings:

- **Proxy URL**: Local proxy server address
- **OCR Enable**: Enable/disable OCR text extraction
- **AI Analysis**: Enable/disable AI features
- **OpenAI API Key**: Your API key for AI analysis
- **Image Settings**: Configure image download behavior
- **Deduplication**: How to handle duplicate pages

## OCR + AI Entity Extraction

Web2PG supports advanced OCR and AI-powered entity extraction:

### Workflow

1. **Full-Page Screenshot**: Captures the entire page, including content below the fold
2. **OCR Text Recognition**: Uses DeepSeek-OCR to extract all text from the screenshot
3. **AI Entity Analysis**: Uses LLM to identify the entity type and extract structured information

### Supported Entity Types

- **Video/Movies**: Extracts cast, director, genre, year, tags
- **Articles**: Extracts author, summary, language, categories
- **Products**: Extracts brand, price, specifications
- **Profiles**: Extracts person/actor information
- **Other**: Generic extraction with tags and categories

### Performance

| Step | Average Time |
|------|-------------|
| Full-page screenshot | 7-10 seconds |
| OCR recognition | 10-30 seconds |
| LLM analysis | 5-15 seconds |
| **Total** | **22-55 seconds** |

## API Endpoints

The proxy server provides these REST API endpoints:

### Pages
- `POST /api/pages` - Save a new page
- `GET /api/pages` - List all pages (with pagination)
- `GET /api/pages/:id` - Get a specific page
- `DELETE /api/pages/:id` - Delete a page
- `GET /api/pages/:id/images` - Get page images
- `GET /api/pages/:id/tags` - Get page tags
- `POST /api/pages/:id/tags` - Add tag to page
- `GET /api/pages/:id/relationships` - Get page relationships

### Search
- `POST /api/search` - Full-text search
- `POST /api/search/advanced` - Advanced search with filters
- `GET /api/search/suggestions` - Get search suggestions
- `GET /api/search/history` - Get search history
- `POST /api/search/similar` - Find similar pages

### AI Analysis
- `POST /api/ai/analysis` - Save AI analysis for a page
- `GET /api/ai/stats` - Get AI usage statistics
- `GET /api/ai/pending` - Get pages pending AI analysis
- `POST /api/ai/refresh` - Flag pages for re-analysis

### Statistics
- `GET /api/stats` - Get database statistics
- `GET /health` - Health check

## Database Schema

### Core Tables

- **web_pages**: URL, title, domain, metadata
- **page_content**: Raw HTML, cleaned content, text, excerpt
- **images**: Image metadata with hybrid storage
- **ai_analysis**: AI summaries, tags, keywords
- **page_relationships**: Links between pages
- **tags** & **page_tags**: Tag management
- **search_history**: Search analytics
- **deduplication_candidates**: Duplicate detection queue

### Features

- **Full-text search** using PostgreSQL `tsvector`
- **Similarity search** using `pg_trgm`
- **Automatic content vector updates** via triggers
- **Content hash-based deduplication**
- **Relationship tracking** between pages

## Development

### Project Structure

```
Web2PG/
├── database/           # Database schema and indexes
│   ├── schema.sql
│   ├── indexes.sql
│   └── seed.sql
├── proxy-server/       # Node.js proxy server
│   ├── server.js
│   ├── database/
│   ├── routes/
│   ├── middleware/
│   └── services/       # Python OCR service
├── extension/          # Browser extension
│   ├── manifest.json
│   ├── background/
│   ├── content/
│   ├── popup/
│   ├── options/
│   └── shared/
├── .env               # Configuration (create this file)
└── README.md
```

### Running in Development

**Proxy Server:**
```bash
cd proxy-server
npm run dev  # Uses --watch for auto-reload
```

**OCR Service (Optional):**
```bash
cd proxy-server/services
python deepseek_ocr_server.py
```

**Extension:**
1. Load unpacked in Chrome
2. Make changes
3. Go to `chrome://extensions/` and click the reload icon

### Testing the API

Use curl or Postman to test endpoints:

```bash
# Health check
curl http://localhost:3000/health

# Get statistics
curl http://localhost:3000/api/stats

# Save a page
curl -X POST http://localhost:3000/api/pages \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "title": "Example Page",
    "content": {
      "text": "Page content here",
      "wordCount": 100
    }
  }'
```

## Security Considerations

- **Localhost Only**: The proxy server only accepts local connections
- **CORS Protection**: Configured for extension-only access
- **Rate Limiting**: 100 requests per 15 minutes
- **SQL Injection**: All queries use parameterized statements
- **No External Data**: Everything stays on your local machine

## Troubleshooting

### Proxy Server Won't Start

Check if port 3000 is already in use:
```bash
# Linux/Mac
lsof -i :3000

# Windows
netstat -ano | findstr :3000
```

### Extension Can't Connect to Proxy

1. Ensure proxy server is running on localhost:3000
2. Check browser console for errors
3. Verify CORS settings in proxy server

### Database Connection Errors

1. Verify PostgreSQL is running
2. Check credentials in `.env`
3. Test connection: `psql -U postgres -d web`

### OCR Service Not Working

1. Ensure DeepSeek-OCR server is running on localhost:8000
2. Test OCR health: `curl http://localhost:8000/health`
3. Check Python dependencies are installed
4. Verify model is downloaded and path is correct in `deepseek_ocr_server.py`

### AI Features Not Working

1. Verify OpenAI API key is set in extension settings or `.env`
2. Check API key has credits
3. View proxy server logs for errors

## Future Enhancements

Potential features for future versions:

- [x] PDF and document support
- [x] Screenshot capture
- [x] OCR for images
- [ ] Export to markdown
- [ ] Knowledge graph visualization
- [ ] Mobile browser support
- [ ] Cloud backup options
- [ ] Advanced filters and facets
- [ ] Integration with note-taking apps

## Contributing

Contributions welcome! Areas for improvement:

- Enhanced content extraction (better Readability integration)
- More AI providers (Anthropic, local models)
- Advanced deduplication algorithms
- UI/UX improvements
- Additional export formats

## License

MIT License

## Credits

Built with:
- [Express](https://expressjs.com/) - Web server
- [pg](https://node-postgres.com/) - PostgreSQL client
- [PostgreSQL](https://www.postgresql.org/) - Database
- [Chrome Extension APIs](https://developer.chrome.com/docs/extensions/)
- [DeepSeek-OCR](https://github.com/deepseek-ai/DeepSeek-OCR) - OCR model
- [FastAPI](https://fastapi.tiangolo.com/) - OCR server framework

---
