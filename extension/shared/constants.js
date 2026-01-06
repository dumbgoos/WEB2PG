// Shared constants for Web2PG extension

export const API_BASE_URL = 'http://localhost:3000/api';

export const IMAGE_SIZE_THRESHOLD = 500 * 1024; // 500KB - download threshold

export const SETTINGS_KEYS = {
  PROXY_URL: 'proxyUrl',
  OPENAI_API_KEY: 'openaiApiKey',
  ENABLE_AI_ANALYSIS: 'enableAiAnalysis',
  AUTO_SAVE_IMAGES: 'autoSaveImages',
  IMAGE_THRESHOLD: 'imageThreshold',
  DAILY_TOKEN_LIMIT: 'dailyTokenLimit',
  DEDUPLICATION_STRATEGY: 'deduplicationStrategy',
};

export const DEDUPLICATION_STRATEGIES = {
  SKIP: 'skip', // Skip duplicates
  MERGE: 'merge', // Merge metadata
  ASK: 'ask', // Ask user what to do
};

export const AI_MODELS = {
  GPT_4O_MINI: 'gpt-4o-mini',
  GPT_4O: 'gpt-4o',
  GPT_3_5_TURBO: 'gpt-3.5-turbo',
};

export const DEFAULT_SETTINGS = {
  [SETTINGS_KEYS.PROXY_URL]: API_BASE_URL,
  [SETTINGS_KEYS.ENABLE_AI_ANALYSIS]: false,
  [SETTINGS_KEYS.AUTO_SAVE_IMAGES]: true,
  [SETTINGS_KEYS.IMAGE_THRESHOLD]: IMAGE_SIZE_THRESHOLD,
  [SETTINGS_KEYS.DAILY_TOKEN_LIMIT]: 100000,
  [SETTINGS_KEYS.DEDUPLICATION_STRATEGY]: DEDUPLICATION_STRATEGIES.ASK,
};

export const MESSAGES = {
  PAGE_DATA_READY: 'pageDataReady',
  SAVE_PAGE: 'savePage',
  PAGE_SAVED: 'pageSaved',
  SAVE_ERROR: 'saveError',
  GET_PAGE_INFO: 'getPageInfo',
  PERFORM_SEARCH: 'performSearch',
  SEARCH_RESULTS: 'searchResults',
  OPEN_OPTIONS: 'openOptions',
};

export const STATUS = {
  IDLE: 'idle',
  EXTRACTING: 'extracting',
  SAVING: 'saving',
  ANALYZING: 'analyzing',
  SUCCESS: 'success',
  ERROR: 'error',
};

export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
};
