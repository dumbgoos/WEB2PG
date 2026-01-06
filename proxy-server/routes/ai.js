// AI Analysis API routes
import express from 'express';
import * as queries from '../database/queries.js';

const router = express.Router();

// POST /api/ai/analysis - Save AI analysis for a page
router.post('/analysis', async (req, res) => {
  const db = req.app.locals.db;

  try {
    const { pageId, summary, extractedTags, keywords, categories, sentimentScore, language, modelUsed, tokensUsed, costEstimate } = req.body;

    if (!pageId) {
      return res.status(400).json({ success: false, error: 'Page ID is required' });
    }

    const analysis = await queries.insertAIAnalysis(db, {
      pageId,
      summary,
      extractedTags,
      keywords,
      categories,
      sentimentScore,
      language,
      modelUsed,
      tokensUsed,
      costEstimate,
    });

    // Auto-create tags from AI analysis
    if (extractedTags && extractedTags.length > 0) {
      for (const tag of extractedTags) {
        await queries.addTagToPage(db, pageId, tag, true, 0.9);
      }
    }

    res.json({ success: true, analysisId: analysis.id });
  } catch (error) {
    console.error('Error saving AI analysis:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ai/stats - Get AI usage statistics
router.get('/stats', async (req, res) => {
  const db = req.app.locals.db;

  try {
    const query = `
      SELECT
        COUNT(*) AS total_analyzed,
        SUM(tokens_used) AS total_tokens,
        SUM(cost_estimate) AS total_cost,
        AVG(tokens_used) AS avg_tokens_per_page,
        AVG(sentiment_score) AS avg_sentiment,
        model_used,
        COUNT(*) FILTER (WHERE needs_refresh = TRUE) AS pending_refresh
      FROM ai_analysis
      GROUP BY model_used
    `;

    const result = await db.query(query);
    res.json({ success: true, stats: result.rows });
  } catch (error) {
    console.error('Error getting AI stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ai/pending - Get pages pending AI analysis
router.get('/pending', async (req, res) => {
  const db = req.app.locals.db;

  try {
    const { limit = 20 } = req.query;

    const query = `
      SELECT wp.id, wp.url, wp.title, wp.first_seen_at
      FROM web_pages wp
      LEFT JOIN ai_analysis aa ON wp.id = aa.page_id
      WHERE aa.id IS NULL
      ORDER BY wp.first_seen_at DESC
      LIMIT $1
    `;

    const result = await db.query(query, [parseInt(limit)]);
    res.json({ success: true, pending: result.rows });
  } catch (error) {
    console.error('Error getting pending pages:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/ai/refresh - Flag pages for AI re-analysis
router.post('/refresh', async (req, res) => {
  const db = req.app.locals.db;

  try {
    const { pageIds } = req.body;

    if (!pageIds || !Array.isArray(pageIds) || pageIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Page IDs array is required' });
    }

    let updatedCount = 0;
    for (const pageId of pageIds) {
      await queries.updateAIAnalysisRefreshFlag(db, pageId, true);
      updatedCount++;
    }

    res.json({ success: true, updatedCount });
  } catch (error) {
    console.error('Error flagging for refresh:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
