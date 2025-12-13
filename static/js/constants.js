// Constants and Configuration

// API Endpoints
export const API_ENDPOINTS = {
    CONFIG: '/api/config',
    TAG_COUNTS: '/api/tag_counts',
    REBUILD_TAG_COUNTS: '/api/rebuild_tag_counts',
    SEARCH_HISTORY: '/api/search_history',
    TAG_HISTORY: '/api/tag_history',
    START_SCRAPER: '/api/start',
    STOP_SCRAPER: '/api/stop',
    STATUS: '/api/status',
    POSTS: '/api/posts',
    SAVE_POST: '/api/save',
    DISCARD_POST: '/api/discard',
    DELETE_POST: '/api/delete',
    POST_SIZE: '/api/post',
    AUTOCOMPLETE: '/api/autocomplete'
};

// UI Configuration
export const UI_CONFIG = {
    NOTIFICATION_DURATION: 3000,
    STATUS_UPDATE_INTERVAL: 2000,
    SEARCH_DROPDOWN_DELAY: 200,
    DEFAULT_POSTS_PER_PAGE: 24,
    MAX_TAG_PREVIEW: 5,
    MODAL_NAV_KEYS: {
        CLOSE: 'Escape',
        PREV: 'ArrowLeft',
        NEXT: 'ArrowRight'
    }
};

// Sorting Options
export const SORT_OPTIONS = {
    DOWNLOAD_DESC: 'download-desc',
    DOWNLOAD_ASC: 'download-asc',
    UPLOAD_DESC: 'upload-desc',
    UPLOAD_ASC: 'upload-asc',
    ID_DESC: 'id-desc',
    ID_ASC: 'id-asc',
    SCORE_DESC: 'score-desc',
    SCORE_ASC: 'score-asc',
    TAGS_DESC: 'tags-desc',
    TAGS_ASC: 'tags-asc',
    SIZE_DESC: 'size-desc',
    SIZE_ASC: 'size-asc'
};

// Filter Options
export const FILTER_OPTIONS = {
    ALL: 'all',
    PENDING: 'pending',
    SAVED: 'saved'
};

// Post Status
export const POST_STATUS = {
    PENDING: 'pending',
    SAVED: 'saved',
    DISCARDED: 'discarded'
};

// File Types
export const VIDEO_EXTENSIONS = ['.mp4', '.webm'];
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif'];

// Bulk Operation Limits
export const BULK_CONFIG = {
    RATE_LIMIT_REQUESTS: 60,
    RATE_LIMIT_DELAY: 1000,
    PROGRESS_UPDATE_INTERVAL: 100
};

// External URLs
export const EXTERNAL_URLS = {
    RULE34_POST: 'https://rule34.xxx/index.php?page=post&s=view&id='
};

// Tab Names
export const TABS = {
    SCRAPER: 'scraper',
    POSTS: 'posts',
    BLACKLIST: 'blacklist',
    TAG_HISTORY: 'taghistory'
};

// URL Parameter Names
export const URL_PARAMS = {
    TAB: 'tab',
    PAGE: 'page',
    FILTER: 'filter',
    SEARCH: 'search',
    SORT: 'sort'
};

// Notification Types
export const NOTIFICATION_TYPES = {
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info'
};

// CSS Classes
export const CSS_CLASSES = {
    ACTIVE: 'active',
    SHOW: 'show',
    SELECTED: 'selected',
    CHECKED: 'checked',
    DISABLED: 'disabled',
    HIDDEN: 'hidden'
};