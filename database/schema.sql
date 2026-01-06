-- Web2PG Database Schema
-- Intelligent Web Archiver for PostgreSQL

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- For similarity search
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";    -- For UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- For hashing

-- ============================================================================
-- WEB PAGES TABLE
-- ============================================================================
CREATE TABLE web_pages (
    id BIGSERIAL PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    title TEXT,
    domain TEXT,
    content_hash TEXT UNIQUE,        -- SHA-256 hash for deduplication
    normalized_url TEXT,             -- URL without tracking parameters
    first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    http_status_code INTEGER,
    content_type TEXT,
    content_length INTEGER,
    is_archived BOOLEAN DEFAULT FALSE,
    fetch_count INTEGER DEFAULT 1,
    metadata JSONB DEFAULT '{}'      -- Flexible metadata storage
);

-- ============================================================================
-- PAGE CONTENT TABLE
-- ============================================================================
CREATE TABLE page_content (
    id BIGSERIAL PRIMARY KEY,
    page_id BIGINT REFERENCES web_pages(id) ON DELETE CASCADE,
    raw_content TEXT,                -- Original HTML
    cleaned_content TEXT,            -- Readability-extracted content
    text_content TEXT,               -- Plain text (no HTML)
    excerpt TEXT,                    -- Brief summary
    word_count INTEGER,
    reading_time_minutes INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    content_vector tsvector,         -- Full-text search index
    CONSTRAINT unique_page_content UNIQUE (page_id)
);

-- ============================================================================
-- IMAGES TABLE (Hybrid Storage)
-- ============================================================================
CREATE TABLE images (
    id BIGSERIAL PRIMARY KEY,
    page_id BIGINT REFERENCES web_pages(id) ON DELETE CASCADE,
    original_url TEXT NOT NULL,
    stored_filename TEXT,            -- NULL if URL-only (large images)
    is_downloaded BOOLEAN DEFAULT FALSE,
    file_size_bytes INTEGER,
    mime_type TEXT,
    width INTEGER,
    height INTEGER,
    alt_text TEXT,
    caption TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- AI ANALYSIS TABLE
-- ============================================================================
CREATE TABLE ai_analysis (
    id BIGSERIAL PRIMARY KEY,
    page_id BIGINT REFERENCES web_pages(id) ON DELETE CASCADE,
    summary TEXT,
    extracted_tags TEXT[],
    keywords TEXT[],
    categories TEXT[],
    sentiment_score NUMERIC(3, 2),
    language TEXT,
    model_used TEXT,
    tokens_used INTEGER,
    cost_estimate NUMERIC(10, 6),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    needs_refresh BOOLEAN DEFAULT FALSE,
    CONSTRAINT unique_ai_analysis UNIQUE (page_id)
);

-- ============================================================================
-- PAGE RELATIONSHIPS TABLE
-- ============================================================================
CREATE TABLE page_relationships (
    id BIGSERIAL PRIMARY KEY,
    source_page_id BIGINT REFERENCES web_pages(id) ON DELETE CASCADE,
    target_page_id BIGINT REFERENCES web_pages(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL, -- 'link', 'similar', 'duplicate', 'reference'
    confidence_score NUMERIC(3, 2),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_relationship UNIQUE (source_page_id, target_page_id, relationship_type)
);

-- ============================================================================
-- TAGS TABLE
-- ============================================================================
CREATE TABLE tags (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT,                      -- Hex color for UI display
    description TEXT,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- PAGE-TAGS JUNCTION TABLE
-- ============================================================================
CREATE TABLE page_tags (
    page_id BIGINT REFERENCES web_pages(id) ON DELETE CASCADE,
    tag_id BIGINT REFERENCES tags(id) ON DELETE CASCADE,
    is_ai_generated BOOLEAN DEFAULT FALSE,
    confidence_score NUMERIC(3, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (page_id, tag_id)
);

-- ============================================================================
-- SEARCH HISTORY TABLE
-- ============================================================================
CREATE TABLE search_history (
    id BIGSERIAL PRIMARY KEY,
    query TEXT NOT NULL,
    results_count INTEGER,
    clicked_page_id BIGINT REFERENCES web_pages(id),
    search_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- DEDUPLICATION CANDIDATES TABLE
-- ============================================================================
CREATE TABLE deduplication_candidates (
    id BIGSERIAL PRIMARY KEY,
    page_id_1 BIGINT REFERENCES web_pages(id) ON DELETE CASCADE,
    page_id_2 BIGINT REFERENCES web_pages(id) ON DELETE CASCADE,
    similarity_score NUMERIC(3, 2),
    comparison_method TEXT,          -- 'url', 'content', 'title', 'combined'
    is_duplicate BOOLEAN DEFAULT NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT unique_candidate_pair UNIQUE (page_id_1, page_id_2)
);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update content vector for full-text search
CREATE OR REPLACE FUNCTION update_content_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.content_vector :=
        setweight(to_tsvector('simple', COALESCE(NEW.cleaned_content, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(NEW.text_content, '')), 'B') ||
        setweight(to_tsvector('simple', COALESCE(NEW.excerpt, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update search vector
DROP TRIGGER IF EXISTS tsvector_update ON page_content;
CREATE TRIGGER tsvector_update
    BEFORE INSERT OR UPDATE ON page_content
    FOR EACH ROW
    EXECUTE FUNCTION update_content_vector();

-- Function to normalize URLs
CREATE OR REPLACE FUNCTION normalize_url(input_url TEXT)
RETURNS TEXT AS $$
DECLARE
    url_obj TEXT;
BEGIN
    -- Remove tracking parameters
    SELECT regexp_replace(
        input_url,
        '[?&](utm_[^&]*|fbclid|gclid|msclkid)[^&]*',
        '',
        'g'
    ) INTO url_obj;

    -- Remove trailing ? if empty
    url_obj := regexp_replace(url_obj, '\?$', '');

    RETURN url_obj;
END;
$$ LANGUAGE plpgsql;

-- Function to update tag usage count
CREATE OR REPLACE FUNCTION update_tag_usage()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE tags SET usage_count = usage_count + 1 WHERE id = NEW.tag_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE tags SET usage_count = GREATEST(usage_count - 1, 0) WHERE id = OLD.tag_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update tag usage
DROP TRIGGER IF EXISTS tag_usage_update ON page_tags;
CREATE TRIGGER tag_usage_update
    AFTER INSERT OR DELETE ON page_tags
    FOR EACH ROW
    EXECUTE FUNCTION update_tag_usage();

-- Function to update web_pages metadata
CREATE OR REPLACE FUNCTION update_page_metadata()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated_at = NOW();
    NEW.fetch_count = COALESCE(OLD.fetch_count, 0) + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update page metadata on conflict
CREATE TRIGGER page_metadata_update
    BEFORE UPDATE ON web_pages
    FOR EACH ROW
    WHEN (OLD.url = NEW.url)  -- Only on updates, not inserts
    EXECUTE FUNCTION update_page_metadata();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate content hash using SHA-256
CREATE OR REPLACE FUNCTION generate_content_hash(content TEXT)
RETURNS TEXT AS $$
    SELECT encode(digest(content, 'sha256'), 'hex')
$$ LANGUAGE SQL;

-- Function to find similar pages
CREATE OR REPLACE FUNCTION find_similar_pages(
    page_content TEXT,
    similarity_threshold NUMERIC DEFAULT 0.8,
    limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
    page_id BIGINT,
    url TEXT,
    title TEXT,
    similarity_score NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        wp.id,
        wp.url,
        wp.title,
        SIMILARITY(pc.text_content, page_content) as sim_score
    FROM web_pages wp
    JOIN page_content pc ON wp.id = pc.page_id
    WHERE pc.text_content % page_content
      AND SIMILARITY(pc.text_content, page_content) > similarity_threshold
    ORDER BY sim_score DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE web_pages IS 'Core table storing web page metadata and URLs';
COMMENT ON TABLE page_content IS 'Stores extracted and cleaned page content with full-text search';
COMMENT ON TABLE images IS 'Image metadata with hybrid storage (blob or URL)';
COMMENT ON TABLE ai_analysis IS 'AI-generated summaries, tags, and analysis';
COMMENT ON TABLE page_relationships IS 'Relationships between pages (similar, duplicate, etc.)';
COMMENT ON TABLE tags IS 'Tags for categorizing pages (manual and AI-generated)';
COMMENT ON TABLE page_tags IS 'Junction table linking pages to tags';
COMMENT ON TABLE search_history IS 'User search history for analytics';
COMMENT ON TABLE deduplication_candidates IS 'Potential duplicate pages awaiting review';

COMMENT ON COLUMN web_pages.content_hash IS 'SHA-256 hash of content for duplicate detection';
COMMENT ON COLUMN web_pages.normalized_url IS 'URL with tracking parameters removed';
COMMENT ON COLUMN page_content.content_vector IS 'PostgreSQL tsvector for full-text search';
COMMENT ON COLUMN images.is_downloaded IS 'TRUE if stored as blob, FALSE if URL only';
COMMENT ON COLUMN ai_analysis.sentiment_score IS 'Sentiment from -1 (negative) to 1 (positive)';
COMMENT ON COLUMN page_relationships.relationship_type IS 'link, similar, duplicate, or reference';
COMMENT ON COLUMN page_tags.is_ai_generated IS 'TRUE if tag was suggested by AI';

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Insert default tags
INSERT INTO tags (name, color, description) VALUES
('Technology', '#2196F3', 'Tech-related articles and news'),
('Science', '#4CAF50', 'Scientific research and discoveries'),
('Business', '#FF9800', 'Business and finance topics'),
('Programming', '#9C27B0', 'Coding and development articles'),
('Design', '#E91E63', 'Design and UX/UI content'),
('News', '#F44336', 'News and current events'),
('Tutorial', '#00BCD4', 'How-to guides and tutorials'),
('Research', '#3F51B5', 'Academic and research papers'),
('Blog', '#8BC34A', 'Blog posts and opinion pieces'),
('Documentation', '#607D8B', 'Technical documentation')
ON CONFLICT (name) DO NOTHING;
