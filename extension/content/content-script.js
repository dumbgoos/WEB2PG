// Web2PG Content Script
// Extracts page data from the current webpage
// Author: Ling Luo

// Prevent multiple initializations
if (window.web2pgInitialized) {
  console.log('Web2PG content script already loaded');
} else {
  window.web2pgInitialized = true;
  console.log('Web2PG content script loaded');

// ============================================================================
// SMART TAG EXTRACTOR
// ============================================================================
class SmartTagExtractor {
  constructor() {
    // Multi-language keywords for tags/categories/types
    this.tagKeywords = {
      // English
      english: ['tag', 'tags', 'category', 'categories', 'type', 'types', 'genre', 'genres',
                'classification', 'classifications', 'label', 'labels', 'keyword', 'keywords'],

      // Chinese (Simplified)
      chinese: ['标签', '类型', '分类', '类别', '题材', '流派', '关键词', '标记'],

      // Chinese (Traditional)
      chineseTraditional: ['標籤', '類型', '分類', '類別', '題材', '流派', '關鍵詞', '標記'],

      // Japanese
      japanese: ['タグ', 'カテゴリ', 'ジャンル', 'タイプ', 'レーベル', 'キーワード'],

      // Korean
      korean: ['태그', '카테고리', '장르', '유형', '분류', '라벨', '키워드'],

      // Spanish
      spanish: ['etiqueta', 'etiquetas', 'categoría', 'categorías', 'tipo', 'tipos',
                'género', 'géneros', 'clase', 'clases'],

      // French
      french: ['étiquette', 'étiquettes', 'catégorie', 'catégories', 'type', 'types',
               'genre', 'genres', 'classe', 'classes'],

      // German
      german: ['tag', 'tags', 'kategorie', 'kategorien', 'typ', 'typen',
               'genre', 'genres', 'klasse', 'klassen', 'stichwort', 'stichwörter'],

      // Russian
      russian: ['тег', 'теги', 'категория', 'категории', 'тип', 'типы',
                'жанр', 'жанры', 'метка', 'метки'],

      // Portuguese
      portuguese: ['tag', 'tags', 'categoria', 'categorias', 'tipo', 'tipos',
                   'gênero', 'gêneros', 'classe', 'classes'],

      // Italian
      italian: ['tag', 'categoria', 'categorie', 'tipo', 'tipi',
                'genere', 'generi', 'classe', 'classi', 'etichetta', 'etichette'],

      // Arabic
      arabic: ['علامة', 'فئة', 'نوع', 'تصنيف', 'صنف', 'وسم'],

      // Hindi
      hindi: ['टैग', 'श्रेणी', 'प्रकार', 'वर्ग', 'लेबल'],

      // Thai
      thai: ['แท็ก', 'หมวดหมู่', 'ประเภท', 'จัดหมวดหมู่', 'ป้ายกำกับ'],

      // Vietnamese
      vietnamese: ['thẻ', 'thể loại', 'loại', 'phân loại', 'nhãn'],
    };

    // Keywords for person names (actors, authors, etc.)
    this.personKeywords = {
      // English
      english: ['actor', 'actors', 'actress', 'actresses', 'cast', 'starring', 'star',
                'author', 'writer', 'director', 'creator', 'artist', 'performer',
                'producer', 'screenwriter', 'composer', 'contributor', 'featured'],

      // Chinese
      chinese: ['演员', '主演', '导演', '作者', '作家', '艺人', '明星', '阵容',
                '女演员', '男演员', '演员表', '出演',
                '制作人', '编剧', '作曲', '艺术家', '表演者', '女优'],

      // Japanese
      japanese: ['出演者', '俳優', '女優', '監督', '作者', '作家', 'キャスト',
                'アーティスト', 'パフォーマー', 'プロデューサー', '脚本家'],

      // Korean
      korean: ['출연', '배우', '감독', '작가', '저자', '아티스트', '출연진'],

      // Additional languages
      spanish: ['actor', 'actriz', 'reparto', 'director', 'autor', 'artista'],
      french: ['acteur', 'actrice', 'distribution', 'réalisateur', 'auteur', 'artiste'],
      german: ['schauspieler', 'schauspielerin', 'besetzung', 'regisseur', 'autor', 'künstler'],
    };

    // Common patterns for tag containers
    this.tagSelectors = [
      // Meta tags
      'meta[name="keywords"]',
      'meta[property="article:tag"]',
      'meta[property="og:type"]',

      // JSON-LD structured data
      'script[type="application/ld+json"]',

      // Common class names for tags
      '[class*="tag"]',
      '[class*="category"]',
      '[class*="label"]',
      '[id*="tag"]',
      '[id*="category"]',

      // List elements that might contain tags
      'ul.tags',
      'ul.tag-list',
      'div.tags',
      'div.tag-list',
      '.post-tags',
      '.entry-tags',
      '.article-tags',
    ];
  }

  extractAll() {
    const startTime = Date.now();
    const MAX_EXTRACTION_TIME = 500; // 500ms max (reduced from 1000ms)

    const tags = new Set();

    try {
      // 1. Extract from meta tags (very fast)
      this.extractFromMetaTags(tags);

      // Check timeout
      if (Date.now() - startTime > MAX_EXTRACTION_TIME) {
        console.warn('Tag extraction timeout after meta tags');
        return this.cleanTags(tags);
      }

      // 2. Extract from JSON-LD structured data (fast)
      this.extractFromStructuredData(tags);

      // Check timeout
      if (Date.now() - startTime > MAX_EXTRACTION_TIME) {
        console.warn('Tag extraction timeout after structured data');
        return this.cleanTags(tags);
      }

      // 3. SKIP page content extraction - TOO SLOW
      // this.extractFromPageContent(tags);

      // 4. Extract person names (fast)
      this.extractPersonNames(tags);

    } catch (error) {
      console.error('Error during tag extraction:', error);
    }

    const result = this.cleanTags(tags);
    const duration = Date.now() - startTime;
    console.log(`Tag extraction completed in ${duration}ms, found ${result.length} tags`);

    return result;
  }

  cleanTags(tags) {
    // Convert to array and clean up
    return Array.from(tags)
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0 && tag.length < 100)
      .filter(tag => !this.isCommonNoise(tag));
  }

  extractFromMetaTags(tags) {
    // Keywords meta tag
    const keywordsMeta = document.querySelector('meta[name="keywords"]');
    if (keywordsMeta && keywordsMeta.content) {
      const keywords = keywordsMeta.content.split(/[,，、;；]/);
      keywords.forEach(k => {
        if (k.trim()) tags.add(k.trim());
      });
    }

    // Article tags
    const articleTags = document.querySelectorAll('meta[property="article:tag"]');
    articleTags.forEach(tag => {
      if (tag.content) tags.add(tag.content);
    });

    // Type/category meta tags
    const ogType = document.querySelector('meta[property="og:type"]');
    if (ogType && ogType.content) tags.add(ogType.content);

    // Check for multi-language meta tags
    const allMetas = document.querySelectorAll('meta[name], meta[property]');
    allMetas.forEach(meta => {
      const name = meta.name || meta.property || '';
      const content = meta.content;

      if (!content) return;

      // Check if name contains tag-related keywords in any language
      const lowerName = name.toLowerCase();
      const allTagKeywords = Object.values(this.tagKeywords).flat();

      for (const keyword of allTagKeywords) {
        if (lowerName.includes(keyword) || lowerName.includes(keyword.replace(/s$/, ''))) {
          // Split by common separators
          const values = content.split(/[,，、;；|\/]/);
          values.forEach(v => {
            if (v.trim()) tags.add(v.trim());
          });
          break;
        }
      }
    });
  }

  extractFromStructuredData(tags) {
    // OPTIMIZED: Only check first 3 JSON-LD scripts
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    const limit = Math.min(scripts.length, 3);

    for (let i = 0; i < limit; i++) {
      const script = scripts[i];
      try {
        const data = JSON.parse(script.textContent);

        // Handle both single object and array
        const items = Array.isArray(data) ? data : [data];
        const itemLimit = Math.min(items.length, 5); // Max 5 items per script

        for (let j = 0; j < itemLimit; j++) {
          const item = items[j];

          // Extract keywords (limit to 20)
          if (item.keywords) {
            const keywords = Array.isArray(item.keywords) ? item.keywords : [item.keywords];
            const keywordLimit = Math.min(keywords.length, 20);
            for (let k = 0; k < keywordLimit; k++) {
              const keyword = keywords[k];
              if (typeof keyword === 'string' || typeof keyword === 'number') {
                tags.add(String(keyword));
              } else if (keyword && keyword.name) {
                tags.add(keyword.name);
              }
            }
          }

          // Extract from about property (limit to 10)
          if (item.about) {
            const about = Array.isArray(item.about) ? item.about : [item.about];
            const aboutLimit = Math.min(about.length, 10);
            for (let a = 0; a < aboutLimit; a++) {
              const ab = about[a];
              if (ab && ab.name) tags.add(ab.name);
            }
          }

          // Extract genre/category (limit to 10)
          if (item.genre) {
            const genres = Array.isArray(item.genre) ? item.genre : [item.genre];
            const genreLimit = Math.min(genres.length, 10);
            for (let g = 0; g < genreLimit; g++) {
              tags.add(String(genres[g]));
            }
          }

          // Extract from article/creative work specific fields
          if (item.articleSection) {
            const sections = Array.isArray(item.articleSection) ? item.articleSection : [item.articleSection];
            sections.forEach(s => tags.add(String(s)));
          }

          // Extract person names (limit to 10 per role)
          if (item.author) {
            const authors = Array.isArray(item.author) ? item.author : [item.author];
            const authorLimit = Math.min(authors.length, 10);
            for (let a = 0; a < authorLimit; a++) {
              const author = authors[a];
              if (typeof author === 'string') {
                tags.add(author);
              } else if (author && author.name) {
                tags.add(author.name);
              }
            }
          }

          if (item.actor || item.director || item.creator) {
            ['actor', 'director', 'creator'].forEach(role => {
              if (item[role]) {
                const people = Array.isArray(item[role]) ? item[role] : [item[role]];
                const peopleLimit = Math.min(people.length, 10);
                for (let p = 0; p < peopleLimit; p++) {
                  const person = people[p];
                  if (typeof person === 'string') {
                    tags.add(person);
                  } else if (person && person.name) {
                    tags.add(person.name);
                  }
                }
              }
            });
          }
        }
      } catch (error) {
        // Silently skip invalid JSON
      }
    }
  }

  extractFromPageContent(tags) {
    // DISABLED: Too slow for real-time extraction
    // Page content parsing requires too many DOM queries and can cause freezing
    // We rely on meta tags and structured data instead, which is much faster

    // If you really need this, consider:
    // - Only processing when user explicitly requests it
    // - Running in a separate thread/worker
    // - Processing only a very small subset of elements

    // Quick check: only look for obvious tag containers with very specific selectors
    try {
      // Only check the most common, specific selectors
      const quickSelectors = [
        'meta[name="keywords"]',  // Already handled in extractFromMetaTags
        '.post-tags', '.entry-tags', '.article-tags'
      ];

      // Skip generic selectors like [class*="tag"] - too many false positives
      const MAX_TO_CHECK = 10;

      for (const selector of quickSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          const limit = Math.min(elements.length, MAX_TO_CHECK);

          for (let i = 0; i < limit; i++) {
            const element = elements[i];

            // Skip large elements
            const text = (element.textContent || '').trim();
            if (text.length > 200) continue;

            // Extract and split
            const potentialTags = text.split(/[,，、;;\n\r\t|\/]+/).slice(0, 5); // Max 5 tags per element

            for (const tag of potentialTags) {
              const trimmed = tag.trim();
              if (trimmed && trimmed.length >= 2 && trimmed.length <= 30 && !/^\d+$/.test(trimmed)) {
                tags.add(trimmed);
              }
            }

            if (tags.size >= 50) return; // Early exit if we have enough tags
          }
        } catch (e) {
          // Skip invalid selectors
        }
      }
    } catch (e) {
      // Ignore all errors
    }
  }

  extractPersonNames(tags) {
    // OPTIMIZED: Extract person names with minimal performance impact
    const allPersonKeywords = Object.values(this.personKeywords).flat();

    // Only check meta tags (fast)
    try {
      const allMetas = document.querySelectorAll('meta[name], meta[property]');
      const metaLimit = Math.min(allMetas.length, 50); // Limit to 50 metas

      for (let i = 0; i < metaLimit; i++) {
        const meta = allMetas[i];
        const name = (meta.name || meta.property || '').toLowerCase();
        const content = meta.content;

        if (!content) continue;

        // Check if this meta is about people
        const isAboutPeople = allPersonKeywords.some(keyword => name.includes(keyword));

        if (isAboutPeople) {
          const names = content.split(/[,，、;；|\/]/);
          names.forEach(n => {
            const trimmed = n.trim();
            if (trimmed && trimmed.length > 1 && trimmed.length < 100) {
              tags.add(trimmed);
            }
          });
        }
      }
    } catch (e) {
      // Ignore errors
    }

    // Only check first JSON-LD script (most important one)
    try {
      const script = document.querySelector('script[type="application/ld+json"]');
      if (script) {
        const data = JSON.parse(script.textContent);
        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          // Check for @type Person or related
          if (item['@type'] === 'Person' || item['@type'] === 'Actor' || item['@type'] === 'Director') {
            if (item.name) {
              tags.add(item.name);
            }
          }

          // Extract from arrays of people (limit to 5 people per role)
          ['actor', 'actress', 'director', 'author', 'creator', 'writer',
           'artist', 'performer', 'producer', 'screenwriter', 'composer'].forEach(role => {
            if (item[role]) {
              const people = Array.isArray(item[role]) ? item[role] : [item[role]];
              const limit = Math.min(people.length, 5);
              for (let j = 0; j < limit; j++) {
                const p = people[j];
                if (typeof p === 'string') {
                  tags.add(p);
                } else if (p && p.name) {
                  tags.add(p.name);
                }
              }
            }
          });
        }
      }
    } catch (error) {
      // Silently ignore parsing errors
    }

    // SKIP text pattern matching - too slow and error-prone
    // Only use structured data for person names
  }

  isCommonNoise(text) {
    const noisePatterns = [
      /^(home|menu|search|login|register|sign|click|here|more|view|read|continue)$/i,
      /^\d+$/,
      /^[^\w\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]+$/, // Only special chars
      /^(javascript|void|undefined|null)$/i,
    ];

    return noisePatterns.some(pattern => pattern.test(text));
  }
}

class PageExtractor {
  constructor() {
    this.extractors = {
      title: this.extractTitle.bind(this),
      url: this.extractUrl.bind(this),
      domain: this.extractDomain.bind(this),
      metaDescription: this.extractMetaDescription.bind(this),
      canonicalUrl: this.extractCanonicalUrl.bind(this),
      author: this.extractAuthor.bind(this),
      publishedDate: this.extractPublishedDate.bind(this),
      content: this.extractContent.bind(this),
      images: this.extractImages.bind(this),
      links: this.extractLinks.bind(this),
      tags: this.extractTags.bind(this),
    };

    // Initialize smart tag extractor
    this.tagExtractor = new SmartTagExtractor();
  }

  async extractAll() {
    const TOTAL_TIMEOUT = 3000; // 3 seconds total timeout
    const startTime = Date.now();

    const data = {
      url: '',
      title: '',
      domain: '',
      metadata: {},
      content: {},
      images: [],
      links: [],
      tags: [], // DISABLED for now
    };

    const checkTimeout = (step) => {
      if (Date.now() - startTime > TOTAL_TIMEOUT) {
        console.warn(`Total extraction timeout at ${step}`);
        return true;
      }
      return false;
    };

    try {
      // Extract core data first (fast)
      const coreExtractors = ['url', 'title', 'domain', 'metaDescription', 'canonicalUrl',
                              'author', 'publishedDate', 'content'];
      for (const key of coreExtractors) {
        if (checkTimeout(key)) break;

        try {
          const result = await this.extractors[key]();
          if (key === 'content') {
            data.content = result;
          } else if (result !== undefined) {
            if (key === 'url' || key === 'title' || key === 'domain') {
              data[key] = result;
            } else {
              data.metadata[key] = result;
            }
          }
        } catch (error) {
          console.error(`Error extracting ${key}:`, error);
        }
      }

      if (checkTimeout('before parallel')) return data;

      // Extract images, links in sequence (not parallel) for better control
      // Images
      try {
        data.images = await this.extractors.images();
      } catch (error) {
        console.error('Error extracting images:', error);
        data.images = [];
      }

      if (checkTimeout('after images')) return data;

      // Links
      try {
        data.links = await this.extractors.links();
      } catch (error) {
        console.error('Error extracting links:', error);
        data.links = [];
      }

      // TAGS DISABLED - testing basic functionality
      data.tags = [];

    } catch (error) {
      console.error('Fatal error during extraction:', error);
    }

    const duration = Date.now() - startTime;
    console.log(`Total extraction completed in ${duration}ms`);

    return data;
  }

  extractTitle() {
    // Try multiple sources for title
    const selectors = [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
      'h1',
      'title',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const content = element.content || element.textContent;
        if (content && content.trim()) {
          return content.trim();
        }
      }
    }

    return document.title || '';
  }

  extractUrl() {
    return window.location.href;
  }

  extractDomain() {
    return window.location.hostname;
  }

  extractMetaDescription() {
    const selectors = ['meta[name="description"]', 'meta[property="og:description"]'];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.content) {
        return element.content.trim();
      }
    }

    return '';
  }

  extractCanonicalUrl() {
    const link = document.querySelector('link[rel="canonical"]');
    return link ? link.href : window.location.href;
  }

  extractAuthor() {
    const selectors = ['meta[name="author"]', 'meta[property="article:author"]', '[rel="author"]'];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const content = element.content || element.textContent;
        if (content && content.trim()) {
          return content.trim();
        }
      }
    }

    return null;
  }

  extractPublishedDate() {
    const selectors = [
      'meta[property="article:published_time"]',
      'meta[name="article:published_time"]',
      'meta[name="date"]',
      'meta[property="article:modified_time"]',
      'time[datetime]',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const date = element.content || element.getAttribute('datetime') || element.textContent;
        if (date && date.trim()) {
          return date.trim();
        }
      }
    }

    return null;
  }

  extractContent() {
    // OPTIMIZED: Limit content size to prevent slowdown
    const MAX_CONTENT_LENGTH = 50000; // 50KB limit
    const MAX_TEXT_LENGTH = 10000; // 10KB limit for text

    try {
      const content = this.extractMainContent();

      if (!content) {
        // Use body but truncate to prevent slowdown
        const bodyHTML = document.body?.innerHTML || '';
        const bodyText = document.body?.textContent || '';

        return {
          raw: bodyHTML.substring(0, MAX_CONTENT_LENGTH),
          cleaned: bodyHTML.substring(0, MAX_CONTENT_LENGTH),
          text: bodyText.substring(0, MAX_TEXT_LENGTH),
          excerpt: this.extractExcerpt(bodyText.substring(0, 1000)),
          wordCount: Math.min(bodyText.split(/\s+/).length, 5000), // Cap at 5000
        };
      }

      // Truncate content to prevent slowdown
      const textContent = (content.textContent || '').substring(0, MAX_TEXT_LENGTH);
      const contentHTML = (content.innerHTML || '').substring(0, MAX_CONTENT_LENGTH);

      const wordCount = textContent.split(/\s+/).filter((w) => w.length > 0).length;

      return {
        raw: contentHTML,
        cleaned: contentHTML,
        text: textContent,
        excerpt: this.extractExcerpt(textContent),
        wordCount,
      };
    } catch (error) {
      console.error('Error extracting content:', error);
      // Fallback to minimal data
      return {
        raw: '',
        cleaned: '',
        text: document.title || '',
        excerpt: document.title || '',
        wordCount: 0,
      };
    }
  }

  extractMainContent() {
    // Try to find main content using common patterns
    const contentSelectors = [
      'article',
      '[role="main"]',
      'main',
      '#content',
      '.content',
      '.post-content',
      '.article-content',
      '.entry-content',
      '.post-body',
      '.article-body',
    ];

    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.length > 200) {
        return element;
      }
    }

    // Fallback to body
    return document.body;
  }

  extractExcerpt(textContent) {
    // Try meta description first
    const metaDesc = this.extractMetaDescription();
    if (metaDesc) {
      return metaDesc;
    }

    // Extract from first paragraph
    const firstP = document.querySelector('p');
    if (firstP && firstP.textContent) {
      return firstP.textContent.trim().substring(0, 300);
    }

    // Generate from text content
    const text = textContent || document.body.textContent || '';
    return text.trim().substring(0, 300) + (text.length > 300 ? '...' : '');
  }

  extractImages() {
    const startTime = Date.now();
    const MAX_EXTRACTION_TIME = 500; // 500ms max for image extraction

    const images = [];
    const seenUrls = new Set();
    const MAX_IMAGES = 100; // Limit total images to prevent performance issues
    let imageCount = 0;

    // Helper function to check timeout
    const isTimeout = () => Date.now() - startTime > MAX_EXTRACTION_TIME;

    try {
      // 1. Extract all img elements (limit to 100 to prevent slowdown)
      const imgElements = document.querySelectorAll('img');
      const imgLimit = Math.min(imgElements.length, 200); // Max 200 img elements

      for (let i = 0; i < imgLimit; i++) {
        if (isTimeout()) {
          console.warn(`Image extraction timeout after ${imageCount} images`);
          break;
        }

        if (imageCount >= MAX_IMAGES) break;

        const img = imgElements[i];
        if (!img.src || seenUrls.has(img.src)) continue;

        const width = img.naturalWidth || img.width || 0;
        const height = img.naturalHeight || img.height || 0;

        // Check if image is visible
        const rect = img.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0;

        seenUrls.add(img.src);
        images.push({
          originalUrl: img.src,
          width,
          height,
          altText: img.alt || '',
          caption: this.getImageCaption(img),
          type: 'img',
          visible: isVisible,
          position: { top: rect.top, left: rect.left }
        });
        imageCount++;
      }

      if (isTimeout()) {
        console.log(`Extracted ${images.length} images (timeout)`);
        return images;
      }

      // 2. Extract picture elements with source elements
      if (imageCount < MAX_IMAGES) {
        const pictureElements = document.querySelectorAll('picture');
        const pictureLimit = Math.min(pictureElements.length, 20);

        for (let j = 0; j < pictureLimit; j++) {
          if (isTimeout()) break;
          if (imageCount >= MAX_IMAGES) break;

          const picture = pictureElements[j];
          const sources = picture.querySelectorAll('source');
          for (const source of sources) {
            if (imageCount >= MAX_IMAGES) break;

            const srcset = source.getAttribute('srcset');
            if (srcset) {
              const urls = srcset.split(',').map(s => s.trim().split(' ')[0]);
              for (const url of urls) {
                if (imageCount >= MAX_IMAGES) break;
                if (url && !seenUrls.has(url)) {
                  seenUrls.add(url);
                  images.push({
                    originalUrl: url,
                    width: 0,
                    height: 0,
                    altText: source.getAttribute('alt') || '',
                    caption: '',
                    type: 'picture-source',
                    visible: true,
                    media: source.getAttribute('media') || ''
                  });
                  imageCount++;
                }
              }
            }
          }
        }
      }

      if (isTimeout()) {
        console.log(`Extracted ${images.length} images (timeout after picture)`);
        return images;
      }

    // 3. Extract CSS background images - DISABLED due to performance
    // window.getComputedStyle() is too slow and causes UI freezing
    // Most CSS backgrounds are decorative anyway. We rely on:
    // - <img> elements
    // - <picture> elements
    // - Meta tag images
    // - Video posters
    // Which cover the vast majority of meaningful images
    //
    // If you really need CSS backgrounds, consider:
    // - Running in a Web Worker
    // - Processing only specific elements
    // - Adding a timeout and early exit

      // 4. Extract SVG images (quick, max 10)
      if (imageCount < MAX_IMAGES && !isTimeout()) {
        try {
          const svgElements = document.querySelectorAll('svg[src], img[src$=".svg"]');
          const svgLimit = Math.min(svgElements.length, 10);

          for (let k = 0; k < svgLimit; k++) {
            if (isTimeout() || imageCount >= MAX_IMAGES) break;

            const svg = svgElements[k];
            const url = svg.src || svg.getAttribute('data');
            if (url && !seenUrls.has(url)) {
              const rect = svg.getBoundingClientRect();
              seenUrls.add(url);
              images.push({
                originalUrl: url,
                width: rect.width,
                height: rect.height,
                altText: svg.getAttribute('aria-label') || '',
                caption: '',
                type: 'svg',
                visible: rect.width > 0 && rect.height > 0
              });
              imageCount++;
            }
          }
        } catch (e) {
          // Ignore errors
        }
      }

      if (isTimeout()) {
        console.log(`Extracted ${images.length} images (timeout after SVG)`);
        return images;
      }

      // 5. Extract images from video posters (quick, max 10)
      if (imageCount < MAX_IMAGES && !isTimeout()) {
        try {
          const videoElements = document.querySelectorAll('video[poster]');
          const videoLimit = Math.min(videoElements.length, 10);

          for (let l = 0; l < videoLimit; l++) {
            if (isTimeout() || imageCount >= MAX_IMAGES) break;

            const video = videoElements[l];
            const poster = video.getAttribute('poster');
            if (poster && !seenUrls.has(poster)) {
              const rect = video.getBoundingClientRect();
              seenUrls.add(poster);
              images.push({
                originalUrl: poster,
                width: rect.width,
                height: rect.height,
                altText: video.getAttribute('aria-label') || '',
                caption: '',
                type: 'video-poster',
                visible: rect.width > 0 && rect.height > 0
              });
              imageCount++;
            }
          }
        } catch (e) {
          // Ignore errors
        }
      }

      if (isTimeout()) {
        console.log(`Extracted ${images.length} images (timeout after video)`);
        return images;
      }

      // 6. Extract Open Graph and Twitter Card images (very fast)
      if (imageCount < MAX_IMAGES && !isTimeout()) {
        try {
          const ogImage = document.querySelector('meta[property="og:image"]');
          if (ogImage && ogImage.content && !seenUrls.has(ogImage.content)) {
            seenUrls.add(ogImage.content);
            images.push({
              originalUrl: ogImage.content,
              width: 0,
              height: 0,
              altText: document.querySelector('meta[property="og:title"]')?.content || '',
              caption: 'Open Graph image',
              type: 'og-image',
              visible: false
            });
            imageCount++;
          }
        } catch (e) {
          // Ignore
        }
      }

      if (imageCount < MAX_IMAGES && !isTimeout()) {
        try {
          const twitterImage = document.querySelector('meta[name="twitter:image"]');
          if (twitterImage && twitterImage.content && !seenUrls.has(twitterImage.content)) {
            seenUrls.add(twitterImage.content);
            images.push({
              originalUrl: twitterImage.content,
              width: 0,
              height: 0,
              altText: document.querySelector('meta[name="twitter:title"]')?.content || '',
              caption: 'Twitter Card image',
              type: 'twitter-image',
              visible: false
            });
            imageCount++;
          }
        } catch (e) {
          // Ignore
        }
      }

    } catch (error) {
      console.error('Error during image extraction:', error);
    }

    const duration = Date.now() - startTime;
    console.log(`Extracted ${images.length} images in ${duration}ms (limited to ${MAX_IMAGES})`);

    // Sort images: visible images first, then by position
    images.sort((a, b) => {
      if (a.visible && !b.visible) return -1;
      if (!a.visible && b.visible) return 1;
      if (a.position && b.position) {
        return a.position.top - b.position.top;
      }
      return 0;
    });

    return images;
  }

  getImageCaption(img) {
    // Check for caption in figure element
    const figure = img.closest('figure');
    if (figure) {
      const caption = figure.querySelector('figcaption');
      if (caption) {
        return caption.textContent.trim();
      }
    }

    // Check for title attribute
    if (img.title) {
      return img.title.trim();
    }

    return '';
  }

  extractLinks() {
    // OPTIMIZED: Limit link extraction to prevent slowdown
    const MAX_LINKS = 100; // Only extract first 100 links

    const links = [];
    const linkElements = document.querySelectorAll('a[href]');
    const limit = Math.min(linkElements.length, MAX_LINKS);

    for (let i = 0; i < limit; i++) {
      const link = linkElements[i];
      try {
        const url = new URL(link.href, window.location.href).href;

        // Only include http/https links
        if (!url.startsWith('http://') && !url.startsWith('https://')) continue;

        links.push({
          url,
          text: link.textContent.trim().substring(0, 200),
          title: link.title || '',
        });
      } catch (e) {
        // Skip invalid URLs
      }
    }

    console.log(`Extracted ${links.length} links (limited to ${MAX_LINKS})`);
    return links;
  }

  extractTags() {
    // Use smart tag extractor
    const tags = this.tagExtractor.extractAll();

    // Log extracted tags for debugging
    console.log(`Extracted ${tags.length} tags:`, tags);

    return tags;
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', request);

  if (request.action === 'extractPageData') {
    const extractor = new PageExtractor();

    // Extract data first
    extractor
      .extractAll()
      .then((data) => {
        console.log('Extracted page data:', data);

        // Try to capture screenshot with timeout, but don't block
        // Send response immediately with data
        sendResponse({ success: true, data });

        // Capture screenshot asynchronously in background
        if (request.tabId) {
          chrome.runtime.sendMessage({
            action: 'captureScreenshot',
            tabId: request.tabId
          }).then((screenshotResponse) => {
            if (screenshotResponse && screenshotResponse.success) {
              console.log('Screenshot captured successfully');
              // Screenshot is captured but won't be in initial response
              // Could save it separately if needed
            }
          }).catch((error) => {
            console.log('Screenshot capture failed (non-critical):', error.message);
          });
        }
      })
      .catch((error) => {
        console.error('Extraction error:', error);
        sendResponse({ success: false, error: error.message });
      });

    // Return true to indicate async response
    return true;
  }

  if (request.action === 'getFullHeight') {
    // Calculate full page height for screenshot
    const body = document.body;
    const html = document.documentElement;

    const fullHeight = Math.max(
      body.scrollHeight,
      body.offsetHeight,
      html.clientHeight,
      html.scrollHeight,
      html.offsetHeight
    );

    sendResponse({
      success: true,
      height: fullHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    });
    return true;
  }
});

// Notify background script that content script is loaded
chrome.runtime.sendMessage({ action: 'contentScriptLoaded' });

} // End of window.web2pgInitialized check
