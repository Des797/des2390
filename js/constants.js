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
    PENDING: '/api/pending',
    SAVED: '/api/saved',
    SAVE_POST: '/api/save',
    DISCARD_POST: '/api/discard',
    DELETE_POST: '/api/delete',
    POST_SIZE: '/api/post/SIZE/size',
    AUTOCOMPLETE: '/api/autocomplete'
};

// UI Constants
export const UI_CONSTANTS = {
    NOTIFICATION_DURATION: 3000,
    STATUS_UPDATE_INTERVAL: 2000,
    SEARCH_DROPDOWN_DELAY: 200,
    TAGS_PREVIEW_LIMIT: 3,
    SEARCH_HISTORY_LIMIT: 10,
    CARD_BASE_WIDTH: 180,
    CARD_ROW_HEIGHT: 10
};

// File Type Constants
export const FILE_TYPES = {
    VIDEO: ['.mp4', '.webm'],
    IMAGE: ['.jpg', '.jpeg', '.png', '.gif', '.webp']
};

// Sort Options (simplified)
export const SORT_OPTIONS = {
    DOWNLOAD: 'download',
    UPLOAD: 'upload',
    ID: 'id',
    SCORE: 'score',
    TAGS: 'tags',
    SIZE: 'size'
};

// Sort Order
export const SORT_ORDER = {
    ASC: 'asc',
    DESC: 'desc'
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

// Notification Types
export const NOTIFICATION_TYPES = {
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning'
};

// Tab Names
export const TAB_NAMES = {
    SCRAPER: 'scraper',
    POSTS: 'posts',
    BLACKLIST: 'blacklist',
    TAG_HISTORY: 'taghistory'
};

// Pagination
export const PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_PER_PAGE: 42,
    MIN_PER_PAGE: 1,
    MAX_PER_PAGE: 200,
    PER_PAGE_OPTIONS: [12, 24, 42, 60, 96, 120]
};

// Bulk Operations
export const BULK_OPERATIONS = {
    SAVE: 'save',
    DISCARD: 'discard',
    DELETE: 'delete'
};

// Rate Limiting
export const RATE_LIMIT = {
    REQUESTS_PER_MINUTE: 60,
    DELAY_AFTER_BATCH: 1000
};

// URL Parameters
export const URL_PARAMS = {
    TAB: 'tab',
    PAGE: 'page',
    FILTER: 'filter',
    SEARCH: 'search',
    SORT: 'sort',
    ORDER: 'order'
};

// Element IDs
export const ELEMENT_IDS = {
    // Config
    USER_ID: 'userId',
    API_KEY: 'apiKey',
    TEMP_PATH: 'tempPath',
    SAVE_PATH: 'savePath',
    
    // Buttons
    SAVE_CONFIG_BTN: 'saveConfigBtn',
    START_BTN: 'startBtn',
    STOP_BTN: 'stopBtn',
    ADD_BLACKLIST_BTN: 'addBlacklistBtn',
    
    // Inputs
    SEARCH_TAGS: 'searchTags',
    BLACKLIST_INPUT: 'blacklistInput',
    POSTS_SEARCH_INPUT: 'postsSearchInput',
    POSTS_SEARCH_BUTTON: 'postsSearchButton',
    
    // Dropdowns
    SEARCH_DROPDOWN: 'searchDropdown',
    POSTS_STATUS_FILTER: 'postsStatusFilter',
    POSTS_SORT: 'postsSort',
    POSTS_SORT_ORDER: 'postsSortOrder',
    POSTS_PER_PAGE: 'postsPerPage',
    TAG_HISTORY_PER_PAGE: 'tagHistoryPerPage',
    
    // Display areas
    BLACKLIST_TAGS: 'blacklistTags',
    POSTS_GRID: 'postsGrid',
    POSTS_TOTAL_RESULTS: 'postsTotalResults',
    POSTS_PAGINATION: 'postsPagination',
    TAG_HISTORY_LIST: 'tagHistoryList',
    TAG_HISTORY_TOTAL: 'tagHistoryTotal',
    TAG_HISTORY_PAGINATION: 'tagHistoryPagination',
    
    // Stats
    STAT_PROCESSED: 'statProcessed',
    STAT_SAVED: 'statSaved',
    STAT_DISCARDED: 'statDiscarded',
    STAT_SKIPPED: 'statSkipped',
    STAT_REQUESTS: 'statRequests',
    STAT_PAGE: 'statPage',
    
    // Alerts
    MODE_ALERT: 'modeAlert',
    STORAGE_ALERT: 'storageAlert',
    
    // Bulk controls
    POSTS_BULK_CONTROLS: 'postsBulkControls',
    POSTS_SELECTION_COUNT: 'postsSelectionCount',
    SELECT_ALL_POSTS: 'selectAllPosts',
    SELECT_ALL_POSTS_GLOBAL: 'selectAllPostsGlobal',
    INVERT_SELECTION_POSTS: 'invertSelectionPosts',
    BULK_SAVE_POSTS: 'bulkSavePosts',
    BULK_DISCARD_POSTS: 'bulkDiscardPosts',
    BULK_DELETE_POSTS: 'bulkDeletePosts',
    CLEAR_SELECTION_POSTS: 'clearSelectionPosts',
    POSTS_BULK_PROGRESS: 'postsBulkProgress',
    POSTS_PROGRESS_BAR: 'postsProgressBar',
    POSTS_PROGRESS_TEXT: 'postsProgressText',
    CANCEL_BULK_POSTS: 'cancelBulkPosts',
    
    // Modal
    IMAGE_MODAL: 'imageModal',
    MODAL_CLOSE: 'modalClose',
    MODAL_PREV: 'modalPrev',
    MODAL_NEXT: 'modalNext',
    MODAL_IMAGE: 'modalImage',
    MODAL_VIDEO: 'modalVideo',
    MODAL_INFO: 'modalInfo',
    
    // Notification
    NOTIFICATION: 'notification',
    NOTIFICATION_TEXT: 'notificationText'
};

// CSS Classes
export const CSS_CLASSES = {
    ACTIVE: 'active',
    SHOW: 'show',
    SELECTED: 'selected',
    CHECKED: 'checked',
    ERROR: 'error',
    WARNING: 'warning',
    GREYED_OUT: 'greyed-out',
    NAV_TAB: 'nav-tab',
    TAB_CONTENT: 'tab-content',
    GALLERY_ITEM: 'gallery-item',
    SELECT_CHECKBOX: 'select-checkbox',
    MEDIA_WRAPPER: 'media-wrapper',
    TAG: 'tag',
    EXPAND_TAGS: 'expand-tags',
    GALLERY_ITEM_OWNER: 'gallery-item-owner',
    SAVE_BTN: 'save-btn',
    DISCARD_BTN: 'discard-btn',
    VIEW_BTN: 'view-btn',
    VIEW_R34_BTN: 'view-r34-btn',
    DELETE_BTN: 'delete-btn',
    SEARCH_DROPDOWN_ITEM: 'search-dropdown-item',
    BLACKLIST_TAG: 'blacklist-tag',
    NOTIFICATION: 'notification'
};

// External URLs
export const EXTERNAL_URLS = {
    RULE34_POST_VIEW: 'https://rule34.xxx/index.php?page=post&s=view&id='
};

// Default Values
export const DEFAULTS = {
    TAB: TAB_NAMES.SCRAPER,
    PAGE: PAGINATION.DEFAULT_PAGE,
    FILTER: FILTER_OPTIONS.ALL,
    SEARCH: '',
    SORT: SORT_OPTIONS.DOWNLOAD,
    ORDER: SORT_ORDER.DESC,
    PER_PAGE: PAGINATION.DEFAULT_PER_PAGE
};

// Keyboard Keys
export const KEYS = {
    ESCAPE: 'Escape',
    ENTER: 'Enter',
    ARROW_LEFT: 'ArrowLeft',
    ARROW_RIGHT: 'ArrowRight'
};

// Storage Keys
export const STORAGE_KEYS = {
    TAG_COUNTS: 'tagCounts'
};

export default {
    API_ENDPOINTS,
    UI_CONSTANTS,
    FILE_TYPES,
    SORT_OPTIONS,
    SORT_ORDER,
    FILTER_OPTIONS,
    POST_STATUS,
    NOTIFICATION_TYPES,
    TAB_NAMES,
    PAGINATION,
    BULK_OPERATIONS,
    RATE_LIMIT,
    URL_PARAMS,
    ELEMENT_IDS,
    CSS_CLASSES,
    EXTERNAL_URLS,
    DEFAULTS,
    KEYS,
    STORAGE_KEYS
};