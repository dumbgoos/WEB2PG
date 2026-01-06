// Web2PG Proxy Server
// Local HTTP server for browser extension to PostgreSQL communication
// Author: Ling Luo
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import db from './database/connection.js';
import pagesRouter from './routes/pages.js';
import searchRouter from './routes/search.js';
import aiRouter from './routes/ai.js';
import ocrRouter from './routes/ocr.js';
import { errorHandler } from './middleware/errorHandler.js';

// Load environment variables
dotenv.config({ path: '../.env' });

const app = express();
const PORT = process.env.PROXY_PORT || 3000;

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Allow extension connections
    crossOriginEmbedderPolicy: false,
  })
);

// CORS - Allow browser extension connections
app.use(
  cors({
    origin: ['chrome-extension://*', 'moz-extension://*'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests - Please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Make database available to routes
app.use((req, res, next) => {
  req.app.locals.db = db;
  next();
});

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// ROUTES
// ============================================================================

// Health check
app.get('/health', (req, res) => {
  const poolStats = db.getPoolStats();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: {
      connected: poolStats.totalCount > 0,
      pool: poolStats,
    },
  });
});

// Database statistics
app.get('/api/stats', async (req, res) => {
  try {
    const statsQuery = `
      SELECT
        (SELECT COUNT(*) FROM web_pages) AS total_pages,
        (SELECT COUNT(*) FROM page_content) AS pages_with_content,
        (SELECT COUNT(*) FROM ai_analysis) AS pages_with_ai,
        (SELECT COUNT(*) FROM images WHERE is_downloaded = true) AS downloaded_images,
        (SELECT COUNT(*) FROM tags) AS total_tags,
        (SELECT COUNT(*) FROM page_relationships) AS relationships
    `;

    const result = await db.query(statsQuery);
    res.json({
      success: true,
      stats: result.rows[0],
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API routes
app.use('/api/pages', pagesRouter);
app.use('/api/search', searchRouter);
app.use('/api/ai', aiRouter);
app.use('/api/ocr', ocrRouter);

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

// Error handler
app.use(errorHandler);

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, 'localhost', () => {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           Web2PG Proxy Server Started                    ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Server running on: http://localhost:${PORT}               ║`);
  console.log(`║  Environment:     ${process.env.NODE_ENV || 'development'}                                  ║`);
  console.log(`║  Database:        ${process.env.PG_DATABASE || 'web'}@${process.env.PG_HOST || 'localhost'}                  ║`);
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  Available endpoints:                                     ║');
  console.log('║    GET  /health                                          ║');
  console.log('║    GET  /api/stats                                        ║');
  console.log('║    POST /api/pages                                        ║');
  console.log('║    GET  /api/pages/:id                                    ║');
  console.log('║    POST /api/search                                       ║');
  console.log('║    POST /api/ai/analysis                                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  await db.close();
  process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});
