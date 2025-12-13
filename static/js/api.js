// API Functions
import { apiCall } from './utils.js';

// Config Management
async function loadConfig() {
    return await apiCall('/api/config');
}

async function saveConfigData(config) {
    return await apiCall('/api/config', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(config)
    });
}

// Tag Counts
async function loadTagCounts() {
    return await apiCall('/api/tag_counts');
}

async function rebuildTagCounts() {
    return await apiCall('/api/rebuild_tag_counts', { method: 'POST' });
}

// Search History
async function loadSearchHistory() {
    return await apiCall('/api/search_history');
}

// Tag History
async function loadTagHistory(page, limit) {
    return await apiCall(`/api/tag_history?page=${page}&limit=${limit}`);
}

// Scraper Control
async function startScraper(tags) {
    return await apiCall('/api/start', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({tags})
    });
}

async function stopScraper() {
    return await apiCall('/api/stop', { method: 'POST' });
}

async function getStatus() {
    return await apiCall('/api/status');
}

// Posts
async function loadPosts(filter = 'all') {
    return await apiCall(`/api/posts?filter=${filter}`);
}

async function savePost(postId) {
    return await apiCall(`/api/save/${postId}`, { method: 'POST' });
}

async function discardPost(postId) {
    return await apiCall(`/api/discard/${postId}`, { method: 'POST' });
}

async function deletePost(postId, dateFolder) {
    return await apiCall(`/api/delete/${postId}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({date_folder: dateFolder})
    });
}

async function getPostSize(postId) {
    return await apiCall(`/api/post/${postId}/size`);
}

// Autocomplete
async function getAutocompleteTags(query) {
    return await apiCall(`/api/autocomplete?q=${encodeURIComponent(query)}`);
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