-- Web2PG Seed Data
-- Test data and examples for development

-- Insert sample web pages (examples)
INSERT INTO web_pages (url, title, domain, normalized_url, metadata) VALUES
('https://example.com/article1', 'Introduction to Web Archiving', 'example.com', 'https://example.com/article1',
 '{"author": "John Doe", "published_date": "2024-01-15", "description": "Learn about web archiving best practices"}'::jsonb),
('https://example.com/article2', 'PostgreSQL Full-Text Search Guide', 'example.com', 'https://example.com/article2',
 '{"author": "Jane Smith", "published_date": "2024-01-20", "description": "Comprehensive guide to PostgreSQL search"}'::jsonb),
('https://techblog.example/python-ai', 'Python for AI Development', 'techblog.example', 'https://techblog.example/python-ai',
 '{"author": "AI Expert", "published_date": "2024-02-01", "description": "Using Python for AI and machine learning"}'::jsonb)
ON CONFLICT (url) DO NOTHING;

-- Get the page IDs for content insertion
DO $$
DECLARE
    page1_id BIGINT;
    page2_id BIGINT;
    page3_id BIGINT;
BEGIN
    SELECT id INTO page1_id FROM web_pages WHERE url = 'https://example.com/article1';
    SELECT id INTO page2_id FROM web_pages WHERE url = 'https://example.com/article2';
    SELECT id INTO page3_id FROM web_pages WHERE url = 'https://techblog.example/python-ai';

    -- Insert sample content
    INSERT INTO page_content (page_id, raw_content, cleaned_content, text_content, excerpt, word_count, reading_time_minutes) VALUES
    (page1_id,
     '<article><h1>Introduction to Web Archiving</h1><p>Web archiving is the process of preserving websites for future use.</p><p>Learn best practices for saving and organizing web content.</p></article>',
     '<article><h1>Introduction to Web Archiving</h1><p>Web archiving is the process of preserving websites for future use.</p><p>Learn best practices for saving and organizing web content.</p></article>',
     'Introduction to Web Archiving

Web archiving is the process of preserving websites for future use.

Learn best practices for saving and organizing web content.',
     'Web archiving is the process of preserving websites for future use.',
     45,
     1
    ),
    (page2_id,
     '<article><h1>PostgreSQL Full-Text Search Guide</h1><p>PostgreSQL offers powerful full-text search capabilities.</p><p>Learn how to use tsvector and tsquery for efficient searching.</p></article>',
     '<article><h1>PostgreSQL Full-Text Search Guide</h1><p>PostgreSQL offers powerful full-text search capabilities.</p><p>Learn how to use tsvector and tsquery for efficient searching.</p></article>',
     'PostgreSQL Full-Text Search Guide

PostgreSQL offers powerful full-text search capabilities.

Learn how to use tsvector and tsquery for efficient searching.',
     'PostgreSQL offers powerful full-text search capabilities.',
     52,
     1
    ),
    (page3_id,
     '<article><h1>Python for AI Development</h1><p>Python is the leading language for AI and machine learning.</p><p>Discover popular libraries like TensorFlow and PyTorch.</p></article>',
     '<article><h1>Python for AI Development</h1><p>Python is the leading language for AI and machine learning.</p><p>Discover popular libraries like TensorFlow and PyTorch.</p></article>',
     'Python for AI Development

Python is the leading language for AI and machine learning.

Discover popular libraries like TensorFlow and PyTorch.',
     'Python is the leading language for AI and machine learning.',
     48,
     1
    )
    ON CONFLICT (page_id) DO NOTHING;

    -- Insert sample AI analysis
    INSERT INTO ai_analysis (page_id, summary, extracted_tags, keywords, categories, sentiment_score, language, model_used, tokens_used, cost_estimate) VALUES
    (page1_id,
     'An introduction to web archiving covering best practices for preserving and organizing web content.',
     ARRAY['Web Archiving', 'Best Practices', 'Digital Preservation'],
     ARRAY['archiving', 'preservation', 'websites', 'organization'],
     ARRAY['Technology', 'Tutorial'],
     0.5,
     'en',
     'gpt-4o-mini',
     250,
     0.00004
    ),
    (page2_id,
     'A comprehensive guide to PostgreSQL full-text search features including tsvector and tsquery.',
     ARRAY['PostgreSQL', 'Full-Text Search', 'Database', 'Tutorial'],
     ARRAY['postgresql', 'search', 'database', 'tsvector', 'tsquery'],
     ARRAY['Technology', 'Database', 'Tutorial'],
     0.7,
     'en',
     'gpt-4o-mini',
     300,
     0.00005
    ),
    (page3_id,
     'Overview of Python programming for AI and machine learning with popular libraries.',
     ARRAY['Python', 'AI', 'Machine Learning', 'TensorFlow', 'PyTorch'],
     ARRAY['python', 'ai', 'machine learning', 'libraries', 'tensorflow', 'pytorch'],
     ARRAY['Technology', 'Programming', 'AI'],
     0.8,
     'en',
     'gpt-4o-mini',
     280,
     0.000045
    )
    ON CONFLICT (page_id) DO NOTHING;

    -- Insert sample images
    INSERT INTO images (page_id, original_url, is_downloaded, file_size_bytes, mime_type, width, height, alt_text) VALUES
    (page1_id, 'https://example.com/images/archive1.jpg', TRUE, 245600, 'image/jpeg', 800, 600, 'Web archiving diagram'),
    (page1_id, 'https://example.com/images/archive2.jpg', FALSE, 1048576, 'image/jpeg', 1920, 1080, 'Archive workflow'),
    (page2_id, 'https://example.com/images/postgres-logo.png', TRUE, 51200, 'image/png', 200, 200, 'PostgreSQL logo'),
    (page3_id, 'https://techblog.example/images/python-ai.jpg', TRUE, 389200, 'image/jpeg', 1200, 800, 'Python AI illustration')
    ON CONFLICT DO NOTHING;

    -- Insert sample page relationships
    INSERT INTO page_relationships (source_page_id, target_page_id, relationship_type, confidence_score) VALUES
    (page1_id, page2_id, 'similar', 0.6),
    (page2_id, page3_id, 'reference', 0.5)
    ON CONFLICT (source_page_id, target_page_id, relationship_type) DO NOTHING;

    -- Add some tags to pages
    INSERT INTO page_tags (page_id, tag_id, is_ai_generated, confidence_score)
    SELECT p.id, t.id, TRUE, 0.9
    FROM web_pages p
    CROSS JOIN tags t
    WHERE p.url = 'https://example.com/article1' AND t.name IN ('Technology', 'Tutorial')
    UNION ALL
    SELECT p.id, t.id, TRUE, 0.95
    FROM web_pages p
    CROSS JOIN tags t
    WHERE p.url = 'https://example.com/article2' AND t.name IN ('Technology', 'Programming')
    UNION ALL
    SELECT p.id, t.id, TRUE, 0.85
    FROM web_pages p
    CROSS JOIN tags t
    WHERE p.url = 'https://techblog.example/python-ai' AND t.name IN ('Technology', 'Programming')
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Seed data inserted successfully';
END $$;

-- Add some search history
INSERT INTO search_history (query, results_count, search_timestamp) VALUES
('web archiving', 3, NOW() - INTERVAL '1 day'),
('postgresql', 5, NOW() - INTERVAL '2 days'),
('python ai', 4, NOW() - INTERVAL '3 days'),
('full-text search', 2, NOW() - INTERVAL '5 hours');

-- Display summary
DO $$
DECLARE
    page_count INTEGER;
    content_count INTEGER;
    ai_count INTEGER;
    image_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO page_count FROM web_pages;
    SELECT COUNT(*) INTO content_count FROM page_content;
    SELECT COUNT(*) INTO ai_count FROM ai_analysis;
    SELECT COUNT(*) INTO image_count FROM images;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Seed Data Summary';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Web Pages: %', page_count;
    RAISE NOTICE 'Page Content: %', content_count;
    RAISE NOTICE 'AI Analyses: %', ai_count;
    RAISE NOTICE 'Images: %', image_count;
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Sample data ready for testing!';
    RAISE NOTICE '========================================';
END $$;
