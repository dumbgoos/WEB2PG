// Search API routes
import express from 'express';
import * as queries from '../database/queries.js';

const router = express.Router();

// POST /api/search - Full-text search
router.post('/', async (req, res) => {
  const db = req.app.locals.db;

  try {
    const { query, filters = {}, limit = 20, offset = 0 } = req.body;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Query must be at least 2 characters' });
    }

    const results = await queries.fullTextSearch(db, {
      query: query.trim(),
      filters,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({
      success: true,
      results,
      count: results.length,
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/search/advanced - Advanced search with multiple filters
router.post('/advanced', async (req, res) => {
  const db = req.app.locals.db;

  try {
    const {
      query,
      tags,
      domains,
      dateRange,
      hasImages,
      minWordCount,
      sentiment,
      limit = 50,
    } = req.body;

    const results = await queries.advancedSearch(db, {
      query,
      tags,
      domains,
      dateRange,
      hasImages,
      minWordCount,
      sentiment,
      limit,
    });

    res.json({
      success: true,
      results,
      count: results.length,
    });
  } catch (error) {
    console.error('Advanced search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/search/suggestions - Get search suggestions (autocomplete)
router.get('/suggestions', async (req, res) => {
  const db = req.app.locals.db;

  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.length < 2) {
      return res.json({ success: true, suggestions: [] });
    }

    // Suggest based on titles and domains
    const query = `
      SELECT DISTINCT title, domain
      FROM web_pages
      WHERE title % $1
      ORDER BY SIMILARITY(title, $1) DESC
      LIMIT $2
    `;

    const result = await db.query(query, [q, parseInt(limit)]);

    const suggestions = result.rows.map((row) => ({
      title: row.title,
      domain: row.domain,
    }));

    res.json({ success: true, suggestions });
  } catch (error) {
    console.error('Search suggestions error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/search/history - Get search history
router.get('/history', async (req, res) => {
  const db = req.app.locals.db;

  try {
    const { limit = 100 } = req.query;
    const history = await queries.getSearchHistory(db, parseInt(limit));
    res.json({ success: true, history });
  } catch (error) {
    console.error('Search history error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/search/similar - Find similar pages
router.post('/similar', async (req, res) => {
  const db = req.app.locals.db;

  try {
    const { pageId, threshold = 0.8, limit = 10 } = req.body;

    if (!pageId) {
      return res.status(400).json({ success: false, error: 'Page ID is required' });
    }

    // Get the page's text content
    const contentQuery = 'SELECT text_content FROM page_content WHERE page_id = $1';
    const contentResult = await db.query(contentQuery, [pageId]);

    if (contentResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Page content not found' });
    }

    const textContent = contentResult.rows[0].text_content;

    // Find similar pages
    const similarPages = await queries.findSimilarContent(db, textContent, threshold, limit);

    res.json({
      success: true,
      similarPages,
      count: similarPages.length,
    });
  } catch (error) {
    console.error('Similar pages error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/search/filters - Get available filter values
router.get('/filters', async (req, res) => {
  const db = req.app.locals.db;

  try {
    // Get all unique domains
    const domainsQuery = `
      SELECT domain, COUNT(*) AS page_count
      FROM web_pages
      GROUP BY domain
      ORDER BY page_count DESC
    `;
    const domainsResult = await db.query(domainsQuery);

    // Get all tags
    const tagsQuery = `
      SELECT t.name, t.color, COUNT(pt.page_id) AS usage_count
      FROM tags t
      LEFT JOIN page_tags pt ON t.id = pt.tag_id
      GROUP BY t.id, t.name, t.color
      ORDER BY usage_count DESC
    `;
    const tagsResult = await db.query(tagsQuery);

    // Get date range
    const dateRangeQuery = `
      SELECT
        MIN(first_seen_at) AS earliest_date,
        MAX(first_seen_at) AS latest_date
      FROM web_pages
    `;
    const dateRangeResult = await db.query(dateRangeQuery);

    res.json({
      success: true,
      filters: {
        domains: domainsResult.rows,
        tags: tagsResult.rows,
        dateRange: {
          earliest: dateRangeResult.rows[0].earliest_date,
          latest: dateRangeResult.rows[0].latest_date,
        },
      },
    });
  } catch (error) {
    console.error('Get filters error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
