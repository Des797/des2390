// API Functions
import { apiCall } from './utils.js';
import { API_ENDPOINTS } from './constants.js';

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

// Posts
async function loadPosts(filter = 'all') {
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

// Autocomplete
async function getAutocompleteTags(query) {
    return await apiCall(`${API_ENDPOINTS.AUTOCOMPLETE}?q=${encodeURIComponent(query)}`);
}

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
    getAutocompleteTags
};