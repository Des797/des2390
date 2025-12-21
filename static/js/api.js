// API Functions - TRUE PAGINATION (Don't load everything!)
import { apiCall } from './utils.js';
import { API_ENDPOINTS } from './constants.js';

console.log('🚀 api.js loading...');

// Add missing constant
if (!API_ENDPOINTS.POST_COUNT) {
    API_ENDPOINTS.POST_COUNT = '/api/posts/count';
}

/**
 * NEW: Get paginated posts directly from server
 * Only loads what's needed for current page
 */
async function loadPostsPaginated(filter, limit, offset) {
    console.log(`📄 loadPostsPaginated: filter=${filter}, limit=${limit}, offset=${offset}`);
    
    try {
        const url = `/api/posts/paginated?filter=${filter}&limit=${limit}&offset=${offset}`;
        console.log(`🌐 Fetching: ${url}`);
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`✅ Received ${data.posts.length} posts, total: ${data.total}`);
        
        return data;
    } catch (error) {
        console.error('❌ loadPostsPaginated failed:', error);
        throw error;
    }
}

/**
 * NEW: Get total count only (fast)
 */
async function getTotalCount(filter) {
    console.log(`🔢 getTotalCount: filter=${filter}`);
    
    try {
        const response = await fetch(`/api/posts/count?filter=${filter}`);
        const data = await response.json();
        console.log(`✅ Total count: ${data.total}`);
        return data.total;
    } catch (error) {
        console.error('❌ getTotalCount failed:', error);
        throw error;
    }
}

// Config Management
async function loadConfig() {
    return await apiCall(API_ENDPOINTS.CONFIG);
}

async function saveConfigData(config) {
    return await apiCall(API_ENDPOINTS.CONFIG, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(config)
    });
}

// Tag Counts
async function loadTagCounts() {
    return await apiCall(API_ENDPOINTS.TAG_COUNTS);
}

async function rebuildTagCounts() {
    return await apiCall(API_ENDPOINTS.REBUILD_TAG_COUNTS, { method: 'POST' });
}

// Search History
async function loadSearchHistory() {
    return await apiCall(API_ENDPOINTS.SEARCH_HISTORY);
}

// Tag History
async function loadTagHistory(page, limit) {
    return await apiCall(`${API_ENDPOINTS.TAG_HISTORY}?page=${page}&limit=${limit}`);
}

// Scraper Control
async function startScraper(tags) {
    return await apiCall(API_ENDPOINTS.START_SCRAPER, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({tags})
    });
}

async function stopScraper() {
    return await apiCall(API_ENDPOINTS.STOP_SCRAPER, { method: 'POST' });
}

async function getStatus() {
    return await apiCall(API_ENDPOINTS.STATUS);
}

// Posts - LEGACY (kept for compatibility, but DON'T USE for large datasets)
async function loadPosts(filter = 'all') {
    console.warn('⚠️ loadPosts (LEGACY) called - this loads ALL posts and is slow for large datasets');
    return await apiCall(`${API_ENDPOINTS.POSTS}?filter=${filter}`);
}

async function savePost(postId) {
    return await apiCall(`${API_ENDPOINTS.SAVE_POST}/${postId}`, { method: 'POST' });
}

async function discardPost(postId) {
    return await apiCall(`${API_ENDPOINTS.DISCARD_POST}/${postId}`, { method: 'POST' });
}

async function deletePost(postId, dateFolder) {
    return await apiCall(`${API_ENDPOINTS.DELETE_POST}/${postId}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({date_folder: dateFolder})
    });
}

async function getPostSize(postId) {
    const endpoint = API_ENDPOINTS.POST_SIZE.replace('SIZE', postId);
    return await apiCall(endpoint);
}

async function getVideoDuration(postId) {
    const endpoint = `/api/post/${postId}/duration`;
    return await apiCall(endpoint);
}

// Autocomplete
async function getAutocompleteTags(query) {
    return await apiCall(`${API_ENDPOINTS.AUTOCOMPLETE}?q=${encodeURIComponent(query)}`);
}

console.log('✅ api.js loaded successfully');
console.log('📦 Exported functions:', {
    loadPostsPaginated: typeof loadPostsPaginated,
    getTotalCount: typeof getTotalCount,
    loadPosts: typeof loadPosts
});

export {
    loadConfig,
    saveConfigData,
    loadTagCounts,
    rebuildTagCounts,
    loadSearchHistory,
    loadTagHistory,
    startScraper,
    stopScraper,
    getStatus,
    loadPosts,
    savePost,
    discardPost,
    deletePost,
    getPostSize,
    getAutocompleteTags,
    getVideoDuration,
    loadPostsPaginated,  // NEW
    getTotalCount        // NEW
};