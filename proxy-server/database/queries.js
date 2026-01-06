// Database query functions for Web2PG
import crypto from 'crypto';

// Helper function to generate content hash
function generateContentHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// ============================================================================
// PAGE QUERIES
// ============================================================================

export async function insertPage(db, pageData) {
  const query = `
    INSERT INTO web_pages (
      url, normalized_url, title, domain, content_hash,
      first_seen_at, last_updated_at, metadata
    ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6)
    ON CONFLICT (url)
    DO UPDATE SET
      last_updated_at = NOW(),
      fetch_count = web_pages.fetch_count + 1,
      title = COALESCE(EXCLUDED.title, web_pages.title),
      metadata = COALESCE(EXCLUDED.metadata, web_pages.metadata)
    RETURNING id, fetch_count
  `;

  const values = [
    pageData.url,
    pageData.normalizedUrl || pageData.url,
    pageData.title || 'Untitled',
    pageData.domain || new URL(pageData.url).hostname,
    pageData.contentHash || null,
    JSON.stringify(pageData.metadata || {}),
  ];

  const result = await db.query(query, values);
  return result.rows[0];
}

export async function getPageById(db, pageId) {
  const query = `
    SELECT wp.*, pc.cleaned_content, pc.text_content, pc.excerpt,
           array_agg(DISTINCT t.name) AS tags
    FROM web_pages wp
    LEFT JOIN page_content pc ON wp.id = pc.page_id
    LEFT JOIN page_tags pt ON wp.id = pt.page_id
    LEFT JOIN tags t ON pt.tag_id = t.id
    WHERE wp.id = $1
    GROUP BY wp.id, pc.id
  `;

  const result = await db.query(query, [pageId]);
  return result.rows[0] || null;
}

export async function getPageByUrl(db, url) {
  const query = 'SELECT * FROM web_pages WHERE url = $1';
  const result = await db.query(query, [url]);
  return result.rows[0] || null;
}

export async function listPages(db, options = {}) {
  const {
    limit = 20,
    offset = 0,
    domain,
    startDate,
    endDate,
    orderBy = 'first_seen_at',
    order = 'DESC',
  } = options;

  let query = 'SELECT * FROM web_pages WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (domain) {
    query += ` AND domain = $${paramIndex}`;
    params.push(domain);
    paramIndex++;
  }

  if (startDate) {
    query += ` AND first_seen_at >= $${paramIndex}`;
    params.push(startDate);
    paramIndex++;
  }

  if (endDate) {
    query += ` AND first_seen_at <= $${paramIndex}`;
    params.push(endDate);
    paramIndex++;
  }

  query += ` ORDER BY ${orderBy} ${order} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await db.query(query, params);
  return result.rows;
}

export async function deletePage(db, pageId) {
  const query = 'DELETE FROM web_pages WHERE id = $1 RETURNING id';
  const result = await db.query(query, [pageId]);
  return result.rows[0] || null;
}

// ============================================================================
// PAGE CONTENT QUERIES
// ============================================================================

export async function insertPageContent(db, contentData) {
  const query = `
    INSERT INTO page_content (
      page_id, raw_content, cleaned_content, text_content,
      excerpt, word_count, reading_time_minutes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (page_id)
    DO UPDATE SET
      raw_content = EXCLUDED.raw_content,
      cleaned_content = EXCLUDED.cleaned_content,
      text_content = EXCLUDED.text_content,
      excerpt = EXCLUDED.excerpt,
      word_count = EXCLUDED.word_count,
      reading_time_minutes = EXCLUDED.reading_time_minutes,
      created_at = NOW()
    RETURNING id
  `;

  const values = [
    contentData.pageId,
    contentData.rawContent || null,
    contentData.cleanedContent || null,
    contentData.textContent || null,
    contentData.excerpt || null,
    contentData.wordCount || 0,
    contentData.readingTimeMinutes || 0,
  ];

  const result = await db.query(query, values);
  return result.rows[0];
}

export async function updatePageContent(db, pageId, contentData) {
  const query = `
    UPDATE page_content
    SET
      raw_content = COALESCE($2, raw_content),
      cleaned_content = COALESCE($3, cleaned_content),
      text_content = COALESCE($4, text_content),
      excerpt = COALESCE($5, excerpt),
      word_count = COALESCE($6, word_count),
      reading_time_minutes = COALESCE($7, reading_time_minutes)
    WHERE page_id = $1
    RETURNING id
  `;

  const values = [
    pageId,
    contentData.rawContent,
    contentData.cleanedContent,
    contentData.textContent,
    contentData.excerpt,
    contentData.wordCount,
    contentData.readingTimeMinutes,
  ];

  const result = await db.query(query, values);
  return result.rows[0];
}

// ============================================================================
// IMAGE QUERIES
// ============================================================================

export async function insertImages(db, pageId, images) {
  if (!images || images.length === 0) return [];

  const client = await db.getClient();
  try {
    const query = `
      INSERT INTO images (
        page_id, original_url, stored_filename, is_downloaded,
        file_size_bytes, mime_type, width, height, alt_text, caption
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;

    const insertedIds = [];

    for (const image of images) {
      const values = [
        pageId,
        image.originalUrl,
        image.storedFilename || null,
        image.isDownloaded || false,
        image.fileSizeBytes || null,
        image.mimeType || null,
        image.width || null,
        image.height || null,
        image.altText || null,
        image.caption || null,
      ];

      const result = await client.query(query, values);
      insertedIds.push(result.rows[0].id);
    }

    return insertedIds;
  } finally {
    client.release();
  }
}

export async function getImagesByPageId(db, pageId) {
  const query = 'SELECT * FROM images WHERE page_id = $1 ORDER BY id';
  const result = await db.query(query, [pageId]);
  return result.rows;
}

export async function getImageById(db, imageId) {
  const query = 'SELECT * FROM images WHERE id = $1';
  const result = await db.query(query, [imageId]);
  return result.rows[0] || null;
}

// ============================================================================
// AI ANALYSIS QUERIES
// ============================================================================

export async function insertAIAnalysis(db, analysisData) {
  const query = `
    INSERT INTO ai_analysis (
      page_id, summary, extracted_tags, keywords, categories,
      sentiment_score, language, model_used, tokens_used, cost_estimate
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (page_id)
    DO UPDATE SET
      summary = EXCLUDED.summary,
      extracted_tags = EXCLUDED.extracted_tags,
      keywords = EXCLUDED.keywords,
      categories = EXCLUDED.categories,
      sentiment_score = EXCLUDED.sentiment_score,
      language = EXCLUDED.language,
      model_used = EXCLUDED.model_used,
      tokens_used = EXCLUDED.tokens_used,
      cost_estimate = EXCLUDED.cost_estimate,
      created_at = NOW(),
      needs_refresh = FALSE
    RETURNING id
  `;

  const values = [
    analysisData.pageId,
    analysisData.summary || null,
    analysisData.extractedTags || [],
    analysisData.keywords || [],
    analysisData.categories || [],
    analysisData.sentimentScore || null,
    analysisData.language || null,
    analysisData.modelUsed || null,
    analysisData.tokensUsed || 0,
    analysisData.costEstimate || 0,
  ];

  const result = await db.query(query, values);
  return result.rows[0];
}

export async function getAIAnalysisByPageId(db, pageId) {
  const query = 'SELECT * FROM ai_analysis WHERE page_id = $1';
  const result = await db.query(query, [pageId]);
  return result.rows[0] || null;
}

export async function updateAIAnalysisRefreshFlag(db, pageId, needsRefresh) {
  const query = `
    UPDATE ai_analysis
    SET needs_refresh = $2
    WHERE page_id = $1
    RETURNING id
  `;

  const result = await db.query(query, [pageId, needsRefresh]);
  return result.rows[0];
}

// ============================================================================
// TAG QUERIES
// ============================================================================

export async function getAllTags(db) {
  const query = 'SELECT * FROM tags ORDER BY usage_count DESC, name';
  const result = await db.query(query);
  return result.rows;
}

export async function getTagById(db, tagId) {
  const query = 'SELECT * FROM tags WHERE id = $1';
  const result = await db.query(query, [tagId]);
  return result.rows[0] || null;
}

export async function getTagByName(db, name) {
  const query = 'SELECT * FROM tags WHERE name = $1';
  const result = await db.query(query, [name]);
  return result.rows[0] || null;
}

export async function createTag(db, tagData) {
  const query = `
    INSERT INTO tags (name, color, description)
    VALUES ($1, $2, $3)
    ON CONFLICT (name)
    DO UPDATE SET
      color = COALESCE(EXCLUDED.color, tags.color),
      description = COALESCE(EXCLUDED.description, tags.description)
    RETURNING id
  `;

  const values = [
    tagData.name,
    tagData.color || null,
    tagData.description || null,
  ];

  const result = await db.query(query, values);
  return result.rows[0];
}

export async function addTagToPage(db, pageId, tagName, isAIGenerated = false, confidenceScore = null) {
  // First, get or create the tag
  let tag = await getTagByName(db, tagName);
  if (!tag) {
    tag = await createTag(db, { name: tagName });
  }

  // Then, add the relationship
  const query = `
    INSERT INTO page_tags (page_id, tag_id, is_ai_generated, confidence_score)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (page_id, tag_id)
    DO UPDATE SET
      is_ai_generated = EXCLUDED.is_ai_generated,
      confidence_score = EXCLUDED.confidence_score
    RETURNING id
  `;

  const values = [pageId, tag.id, isAIGenerated, confidenceScore];
  const result = await db.query(query, values);
  return result.rows[0];
}

export async function removeTagFromPage(db, pageId, tagId) {
  const query = 'DELETE FROM page_tags WHERE page_id = $1 AND tag_id = $2 RETURNING id';
  const result = await db.query(query, [pageId, tagId]);
  return result.rows[0];
}

export async function getPagesByTag(db, tagId, limit = 20, offset = 0) {
  const query = `
    SELECT DISTINCT wp.*
    FROM web_pages wp
    JOIN page_tags pt ON wp.id = pt.page_id
    WHERE pt.tag_id = $1
    ORDER BY wp.first_seen_at DESC
    LIMIT $2 OFFSET $3
  `;

  const result = await db.query(query, [tagId, limit, offset]);
  return result.rows;
}

// ============================================================================
// RELATIONSHIP QUERIES
// ============================================================================

export async function createRelationship(
  db,
  sourcePageId,
  targetPageId,
  relationshipType,
  confidenceScore = null,
  metadata = {}
) {
  const query = `
    INSERT INTO page_relationships (source_page_id, target_page_id, relationship_type, confidence_score, metadata)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (source_page_id, target_page_id, relationship_type)
    DO UPDATE SET
      confidence_score = EXCLUDED.confidence_score,
      metadata = EXCLUDED.metadata
    RETURNING id
  `;

  const values = [sourcePageId, targetPageId, relationshipType, confidenceScore, JSON.stringify(metadata)];
  const result = await db.query(query, values);
  return result.rows[0];
}

export async function getRelationshipsByPage(db, pageId) {
  const query = `
    SELECT pr.*, source.url AS source_url, target.url AS target_url,
           source.title AS source_title, target.title AS target_title
    FROM page_relationships pr
    JOIN web_pages source ON pr.source_page_id = source.id
    JOIN web_pages target ON pr.target_page_id = target.id
    WHERE pr.source_page_id = $1 OR pr.target_page_id = $1
    ORDER BY pr.confidence_score DESC, pr.created_at DESC
  `;

  const result = await db.query(query, [pageId]);
  return result.rows;
}

// ============================================================================
// DEDUPLICATION QUERIES
// ============================================================================

export async function findDuplicateByUrl(db, url, normalizedUrl) {
  const query = `
    SELECT * FROM web_pages
    WHERE url = $1 OR normalized_url = $2
    LIMIT 1
  `;

  const result = await db.query(query, [url, normalizedUrl || url]);
  return result.rows[0] || null;
}

export async function findDuplicateByContentHash(db, contentHash) {
  const query = 'SELECT * FROM web_pages WHERE content_hash = $1 LIMIT 1';
  const result = await db.query(query, [contentHash]);
  return result.rows[0] || null;
}

export async function findSimilarContent(db, textContent, threshold = 0.8, limit = 5) {
  const query = `
    SELECT
      wp.id, wp.url, wp.title,
      SIMILARITY(pc.text_content, $1) AS similarity_score
    FROM web_pages wp
    JOIN page_content pc ON wp.id = pc.page_id
    WHERE pc.text_content % $1
      AND SIMILARITY(pc.text_content, $1) > $2
    ORDER BY similarity_score DESC
    LIMIT $3
  `;

  const result = await db.query(query, [textContent, threshold, limit]);
  return result.rows;
}

export async function findSimilarTitle(db, title, threshold = 0.85, limit = 5) {
  const query = `
    SELECT
      id, url, title,
      SIMILARITY(title, $1) AS similarity_score
    FROM web_pages
    WHERE title % $1
      AND SIMILARITY(title, $1) > $2
    ORDER BY similarity_score DESC
    LIMIT $3
  `;

  const result = await db.query(query, [title, threshold, limit]);
  return result.rows;
}

export async function createDeduplicationCandidate(db, pageId1, pageId2, similarityScore, comparisonMethod) {
  const query = `
    INSERT INTO deduplication_candidates (page_id_1, page_id_2, similarity_score, comparison_method)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (page_id_1, page_id_2)
    DO UPDATE SET
      similarity_score = EXCLUDED.similarity_score,
      comparison_method = EXCLUDED.comparison_method
    RETURNING id
  `;

  const values = [
    Math.min(pageId1, pageId2),
    Math.max(pageId1, pageId2),
    similarityScore,
    comparisonMethod,
  ];

  const result = await db.query(query, values);
  return result.rows[0];
}

export async function getPendingDeduplicationCandidates(db, limit = 50) {
  const query = `
    SELECT dc.*,
           p1.url AS url_1, p1.title AS title_1,
           p2.url AS url_2, p2.title AS title_2
    FROM deduplication_candidates dc
    JOIN web_pages p1 ON dc.page_id_1 = p1.id
    JOIN web_pages p2 ON dc.page_id_2 = p2.id
    WHERE dc.is_duplicate IS NULL
    ORDER BY dc.similarity_score DESC
    LIMIT $1
  `;

  const result = await db.query(query, [limit]);
  return result.rows;
}

// ============================================================================
// SEARCH QUERIES
// ============================================================================

export async function fullTextSearch(db, searchOptions) {
  const { query, filters = {}, limit = 20, offset = 0 } = searchOptions;

  let sql = `
    SELECT
      wp.id,
      wp.url,
      wp.title,
      wp.domain,
      pc.excerpt,
      ts_rank(pc.content_vector, plainto_tsquery($1)) AS rank,
      wp.first_seen_at,
      array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL) AS tags
    FROM web_pages wp
    JOIN page_content pc ON wp.id = pc.page_id
    LEFT JOIN page_tags pt ON wp.id = pt.page_id
    LEFT JOIN tags t ON pt.tag_id = t.id
    WHERE pc.content_vector @@ plainto_tsquery($1)
  `;

  const params = [query];
  let paramIndex = 2;

  if (filters.domain) {
    sql += ` AND wp.domain = $${paramIndex}`;
    params.push(filters.domain);
    paramIndex++;
  }

  if (filters.startDate) {
    sql += ` AND wp.first_seen_at >= $${paramIndex}`;
    params.push(filters.startDate);
    paramIndex++;
  }

  if (filters.endDate) {
    sql += ` AND wp.first_seen_at <= $${paramIndex}`;
    params.push(filters.endDate);
    paramIndex++;
  }

  if (filters.tags && filters.tags.length > 0) {
    sql += ` AND wp.id IN (
      SELECT page_id FROM page_tags
      JOIN tags ON page_tags.tag_id = tags.id
      WHERE tags.name = ANY($${paramIndex})
    )`;
    params.push(filters.tags);
    paramIndex++;
  }

  sql += `
    GROUP BY wp.id, pc.excerpt, pc.content_vector
    ORDER BY rank DESC, wp.first_seen_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(limit, offset);

  const result = await db.query(sql, params);

  // Log search
  await logSearch(db, query, result.rows.length);

  return result.rows;
}

export async function advancedSearch(db, searchOptions) {
  const {
    query,
    tags,
    domains,
    dateRange,
    hasImages,
    minWordCount,
    sentiment,
    limit = 50,
  } = searchOptions;

  let sql = `
    SELECT DISTINCT ON (wp.id)
      wp.*,
      pc.excerpt,
      ts_rank(pc.content_vector, plainto_tsquery($1)) AS rank,
      array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL) AS tags
    FROM web_pages wp
    JOIN page_content pc ON wp.id = pc.page_id
    LEFT JOIN page_tags pt ON wp.id = pt.page_id
    LEFT JOIN tags t ON pt.tag_id = t.id
    WHERE 1=1
  `;

  const params = [];
  let paramIndex = 1;

  if (query) {
    sql += ` AND pc.content_vector @@ plainto_tsquery($${paramIndex})`;
    params.push(query);
    paramIndex++;
  }

  if (tags && tags.length > 0) {
    sql += ` AND wp.id IN (
      SELECT page_id FROM page_tags
      JOIN tags ON page_tags.tag_id = tags.id
      WHERE tags.name = ANY($${paramIndex})
    )`;
    params.push(tags);
    paramIndex++;
  }

  if (domains && domains.length > 0) {
    sql += ` AND wp.domain = ANY($${paramIndex})`;
    params.push(domains);
    paramIndex++;
  }

  if (hasImages) {
    sql += ` AND EXISTS (
      SELECT 1 FROM images WHERE page_id = wp.id AND is_downloaded = true
    )`;
  }

  if (minWordCount) {
    sql += ` AND pc.word_count >= $${paramIndex}`;
    params.push(minWordCount);
    paramIndex++;
  }

  if (dateRange?.start) {
    sql += ` AND wp.first_seen_at >= $${paramIndex}`;
    params.push(dateRange.start);
    paramIndex++;
  }

  if (dateRange?.end) {
    sql += ` AND wp.first_seen_at <= $${paramIndex}`;
    params.push(dateRange.end);
    paramIndex++;
  }

  sql += ' ORDER BY wp.id, rank DESC, wp.first_seen_at DESC';

  if (limit) {
    sql += ` LIMIT ${parseInt(limit)}`;
  }

  const result = await db.query(sql, params);
  return result.rows;
}

async function logSearch(db, query, resultsCount) {
  const logQuery = `
    INSERT INTO search_history (query, results_count, search_timestamp)
    VALUES ($1, $2, NOW())
  `;

  try {
    await db.query(logQuery, [query, resultsCount]);
  } catch (error) {
    console.error('Failed to log search:', error);
  }
}

export async function getSearchHistory(db, limit = 100) {
  const query = `
    SELECT sh.*, wp.url AS clicked_url, wp.title AS clicked_title
    FROM search_history sh
    LEFT JOIN web_pages wp ON sh.clicked_page_id = wp.id
    ORDER BY sh.search_timestamp DESC
    LIMIT $1
  `;

  const result = await db.query(query, [limit]);
  return result.rows;
}

// ============================================================================
// STATISTICS QUERIES
// ============================================================================

export async function getDatabaseStats(db) {
  const queries = [
    'SELECT COUNT(*) AS count FROM web_pages',
    'SELECT COUNT(*) AS count FROM page_content',
    'SELECT COUNT(*) AS count FROM ai_analysis',
    'SELECT COUNT(*) AS count FROM images WHERE is_downloaded = true',
    'SELECT COUNT(*) AS count FROM page_relationships',
    'SELECT COUNT(DISTINCT tag_id) AS count FROM page_tags',
    'SELECT COUNT(*) AS count FROM deduplication_candidates WHERE is_duplicate IS NULL',
  ];

  const [
    pages,
    content,
    ai,
    images,
    relationships,
    tags,
    pendingDuplicates,
  ] = await Promise.all(queries.map((q) => db.query(q)));

  return {
    total_pages: pages.rows[0].count,
    pages_with_content: content.rows[0].count,
    pages_with_ai_analysis: ai.rows[0].count,
    downloaded_images: images.rows[0].count,
    relationships: relationships.rows[0].count,
    unique_tags: tags.rows[0].count,
    pending_duplicate_reviews: pendingDuplicates.rows[0].count,
  };
}
