-- Web2PG Database Indexes
-- Performance optimization indexes for Web2PG

-- ============================================================================
-- FULL-TEXT SEARCH INDEXES
-- ============================================================================

-- GIN index on content_vector for full-text search (CRITICAL)
CREATE INDEX IF NOT EXISTS idx_page_content_vector
ON page_content USING GIN (content_vector);

-- GIN index on tags array for array searches
CREATE INDEX IF NOT EXISTS idx_ai_analysis_tags
ON ai_analysis USING GIN (extracted_tags);

CREATE INDEX IF NOT EXISTS idx_ai_analysis_keywords
ON ai_analysis USING GIN (keywords);

CREATE INDEX IF NOT EXISTS idx_ai_analysis_categories
ON ai_analysis USING GIN (categories);

-- ============================================================================
-- URL AND DOMAIN INDEXES
-- ============================================================================

-- B-tree index for exact URL lookups
CREATE INDEX IF NOT EXISTS idx_web_pages_url
ON web_pages (url);

-- Index on normalized URL for finding duplicates with different tracking params
CREATE INDEX IF NOT EXISTS idx_web_pages_normalized_url
ON web_pages (normalized_url);

-- Domain index for filtering by website
CREATE INDEX IF NOT EXISTS idx_web_pages_domain
ON web_pages (domain);

-- ============================================================================
-- CONTENT HASH INDEX (FOR DEDUPLICATION)
-- ============================================================================

-- Unique index already exists on content_hash, but ensure it's optimized
CREATE INDEX IF NOT EXISTS idx_web_pages_content_hash
ON web_pages (content_hash);

-- ============================================================================
-- DATE AND TIMESTAMP INDEXES
-- ============================================================================

-- Index on first_seen for chronological queries
CREATE INDEX IF NOT EXISTS idx_web_pages_first_seen
ON web_pages (first_seen_at DESC);

-- Index on last_updated for finding recently updated pages
CREATE INDEX IF NOT EXISTS idx_web_pages_last_updated
ON web_pages (last_updated_at DESC);

-- Index on ai_analysis created_at for sorting by analysis date
CREATE INDEX IF NOT EXISTS idx_ai_analysis_created
ON ai_analysis (created_at DESC);

-- Index on search_history for search analytics
CREATE INDEX IF NOT EXISTS idx_search_history_timestamp
ON search_history (search_timestamp DESC);

-- ============================================================================
-- TAG INDEXES
-- ============================================================================

-- Junction table indexes for fast tag lookups
CREATE INDEX IF NOT EXISTS idx_page_tags_tag_id
ON page_tags (tag_id);

CREATE INDEX IF NOT EXISTS idx_page_tags_page_id
ON page_tags (page_id);

-- GIN trigram index on tag names for fuzzy matching
CREATE INDEX IF NOT EXISTS idx_tags_name_trigram
ON tags USING GIN (name gin_trgm_ops);

-- ============================================================================
-- SIMILARITY SEARCH INDEXES (pg_trgm)
-- ============================================================================

-- Trigram index on text content for similarity searches
CREATE INDEX IF NOT EXISTS idx_page_content_trigram
ON page_content USING GIN (text_content gin_trgm_ops);

-- Trigram index on cleaned HTML content
CREATE INDEX IF NOT EXISTS idx_page_content_cleaned_trigram
ON page_content USING GIN (cleaned_content gin_trgm_ops);

-- Trigram index on titles for title similarity
CREATE INDEX IF NOT EXISTS idx_web_pages_title_trigram
ON web_pages USING GIN (title gin_trgm_ops);

-- ============================================================================
-- RELATIONSHIP INDEXES
-- ============================================================================

-- Index for finding relationships between pages
CREATE INDEX IF NOT EXISTS idx_page_relationships_source
ON page_relationships (source_page_id);

CREATE INDEX IF NOT EXISTS idx_page_relationships_target
ON page_relationships (target_page_id);

-- Composite index for relationship type queries
CREATE INDEX IF NOT EXISTS idx_page_relationships_type
ON page_relationships (relationship_type, confidence_score DESC);

-- ============================================================================
-- IMAGE INDEXES
-- ============================================================================

-- Index for finding images by page
CREATE INDEX IF NOT EXISTS idx_images_page_id
ON images (page_id);

-- Index for finding downloaded vs URL-only images
CREATE INDEX IF NOT EXISTS idx_images_is_downloaded
ON images (is_downloaded);

-- ============================================================================
-- DEDUPLICATION INDEXES
-- ============================================================================

-- Index for finding duplicate candidates
CREATE INDEX IF NOT EXISTS idx_deduplication_page1
ON deduplication_candidates (page_id_1);

CREATE INDEX IF NOT EXISTS idx_deduplication_page2
ON deduplication_candidates (page_id_2);

-- Index on similarity score for finding high-confidence duplicates
CREATE INDEX IF NOT EXISTS idx_deduplication_similarity
ON deduplication_candidates (similarity_score DESC)
WHERE is_duplicate IS NULL;

-- ============================================================================
-- COMPOSITE INDEXES (FOR COMMON QUERY PATTERNS)
-- ============================================================================

-- Composite index for domain + date queries (very common)
CREATE INDEX IF NOT EXISTS idx_web_pages_domain_date
ON web_pages (domain, first_seen_at DESC);

-- Composite index for tag + AI-generated filter
CREATE INDEX IF NOT EXISTS idx_page_tags_ai_generated
ON page_tags (tag_id, is_ai_generated);

-- Composite index for AI analysis by category and date
CREATE INDEX IF NOT EXISTS idx_ai_analysis_category_date
ON ai_analysis (categories, created_at DESC);

-- ============================================================================
-- PARTIAL INDEXES (FOR SPECIFIC USE CASES)
-- ============================================================================

-- Index only archived pages
CREATE INDEX IF NOT EXISTS idx_web_pages_archived
ON web_pages (first_seen_at DESC)
WHERE is_archived = TRUE;

-- Index only pages with AI analysis
CREATE INDEX IF NOT EXISTS idx_ai_analysis_pages
ON ai_analysis (page_id, created_at DESC)
WHERE summary IS NOT NULL;

-- Index only high-confidence relationships
CREATE INDEX IF NOT EXISTS idx_page_relationships_high_confidence
ON page_relationships (source_page_id, target_page_id)
WHERE confidence_score > 0.8;

-- ============================================================================
-- STATISTICS UPDATE
-- ============================================================================

-- Ensure statistics are collected for query optimization
ANALYZE web_pages;
ANALYZE page_content;
ANALYZE images;
ANALYZE ai_analysis;
ANALYZE page_relationships;
ANALYZE tags;
ANALYZE page_tags;
ANALYZE search_history;
ANALYZE deduplication_candidates;

-- ============================================================================
-- PERFORMANCE CONFIGURATION
-- ============================================================================

-- Set text search configuration for better multi-language support
CREATE TEXT SEARCH CONFIGURATION IF NOT EXISTS web2pg_config (COPY = simple);

-- Add comments for documentation
COMMENT ON INDEX idx_page_content_vector IS 'Primary full-text search index - CRITICAL for performance';
COMMENT ON INDEX idx_page_content_trigram IS 'Similarity search index using pg_trgm';
COMMENT ON INDEX idx_web_pages_content_hash IS 'Deduplication index for content hash matching';
COMMENT ON INDEX idx_tags_name_trigram IS 'Fuzzy tag matching for autocomplete/suggestions';
COMMENT ON INDEX idx_deduplication_similarity IS 'Find high-confidence duplicate candidates';

-- ============================================================================
-- MAINTENANCE FUNCTIONS
-- ============================================================================

-- Function to rebuild statistics (run after large imports)
CREATE OR REPLACE FUNCTION rebuild_statistics()
RETURNS void AS $$
BEGIN
    ANALYZE web_pages;
    ANALYZE page_content;
    ANALYZE images;
    ANALYZE ai_analysis;
    ANALYZE page_relationships;
    ANALYZE tags;
    ANALYZE page_tags;
    ANALYZE search_history;
    ANALYZE deduplication_candidates;
    RAISE NOTICE 'Statistics rebuilt successfully';
END;
$$ LANGUAGE plpgsql;

-- Function to vacuum and reindex (run periodically for maintenance)
CREATE OR REPLACE FUNCTION vacuum_and_reindex()
RETURNS void AS $$
BEGIN
    VACUUM ANALYZE web_pages;
    VACUUM ANALYZE page_content;
    VACUUM ANALYZE images;
    VACUUM ANALYZE ai_analysis;
    VACUUM ANALYZE page_relationships;
    VACUUM ANALYZE tags;
    VACUUM ANALYZE page_tags;
    VACUUM ANALYZE search_history;
    VACUUM ANALYZE deduplication_candidates;
    REINDEX DATABASE CONCURRENTLY web;
    RAISE NOTICE 'Vacuum and reindex completed';
END;
$$ LANGUAGE plpgsql;

-- Function to get index usage statistics
CREATE OR REPLACE FUNCTION get_index_usage_stats()
RETURNS TABLE (
    schemaname TEXT,
    tablename TEXT,
    indexname TEXT,
    idx_scan BIGINT,
    idx_tup_read BIGINT,
    idx_tup_fetch BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pg_stat_user_indexes.schemaname,
        pg_stat_user_indexes.relname::TEXT,
        pg_stat_user_indexes.indexrelname::TEXT,
        pg_stat_user_indexes.idx_scan,
        pg_stat_user_indexes.idx_tup_read,
        pg_stat_user_indexes.idx_tup_fetch
    FROM pg_stat_user_indexes
    ORDER BY idx_scan DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PERFORMANCE VIEWS (FOR MONITORING)
-- ============================================================================

-- View for monitoring slow queries (requires pg_stat_statements extension)
-- CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- View for database size statistics
CREATE OR REPLACE VIEW v_database_size AS
SELECT
    pg_database.datname AS database_name,
    pg_size_pretty(pg_database_size(pg_database.datname)) AS size_pretty,
    pg_database_size(pg_database.datname) AS size_bytes
FROM pg_database
WHERE pg_database.datname = current_database();

-- View for table sizes
CREATE OR REPLACE VIEW v_table_sizes AS
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
    pg_total_relation_size(schemaname||'.'||tablename) AS total_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- View for index sizes
CREATE OR REPLACE VIEW v_index_sizes AS
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(schemaname||'.'||indexname)) AS index_size,
    pg_relation_size(schemaname||'.'||indexname) AS index_bytes
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(schemaname||'.'||indexname) DESC;

-- View for deduplication statistics
CREATE OR REPLACE VIEW v_deduplication_stats AS
SELECT
    COUNT(*) AS total_candidates,
    COUNT(*) FILTER (WHERE is_duplicate = TRUE) AS confirmed_duplicates,
    COUNT(*) FILTER (WHERE is_duplicate = FALSE) AS confirmed_unique,
    COUNT(*) FILTER (WHERE is_duplicate IS NULL) AS pending_review,
    AVG(similarity_score) AS avg_similarity_score,
    MAX(similarity_score) AS max_similarity_score
FROM deduplication_candidates;

-- View for AI analysis statistics
CREATE OR REPLACE VIEW v_ai_stats AS
SELECT
    COUNT(*) AS total_analyzed,
    SUM(tokens_used) AS total_tokens,
    SUM(cost_estimate) AS total_cost,
    AVG(tokens_used) AS avg_tokens_per_page,
    AVG(sentiment_score) AS avg_sentiment,
    model_used,
    COUNT(*) FILTER (WHERE needs_refresh = TRUE) AS pending_refresh
FROM ai_analysis
GROUP BY model_used;

COMMENT ON VIEW v_database_size IS 'Current database size';
COMMENT ON VIEW v_table_sizes IS 'Size of all tables in database';
COMMENT ON VIEW v_index_sizes IS 'Size of all indexes in database';
COMMENT ON VIEW v_deduplication_stats IS 'Statistics about duplicate detection';
COMMENT ON VIEW v_ai_stats IS 'AI usage and cost statistics';

-- ============================================================================
-- QUERY PLANNING HINTS
-- ============================================================================

-- Increase statistics target for better query plans
ALTER TABLE web_pages ALTER COLUMN url SET STATISTICS 1000;
ALTER TABLE web_pages ALTER COLUMN title SET STATISTICS 1000;
ALTER TABLE web_pages ALTER COLUMN domain SET STATISTICS 1000;
ALTER TABLE page_content ALTER COLUMN text_content SET STATISTICS 1000;

-- ============================================================================
-- FINAL NOTES
-- ============================================================================

-- Run these maintenance commands periodically:
-- SELECT rebuild_statistics();       -- After large imports
-- SELECT vacuum_and_reindex();        -- Monthly maintenance
-- SELECT * FROM get_index_usage_stats(); -- Check index usage
-- SELECT * FROM v_table_sizes;        -- Monitor table sizes
-- SELECT * FROM v_deduplication_stats; -- Check deduplication status
