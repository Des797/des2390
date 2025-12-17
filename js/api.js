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

/**
 * Load posts with streaming progress updates
 * This is much faster for large datasets
 */
async function loadPostsStreaming(filter, onProgress) {
    return new Promise((resolve, reject) => {
        const eventSource = new EventSource(`/api/posts/stream?filter=${filter}`);
        const posts = [];
        
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            switch(data.type) {
                case 'status':
                    // Progress message
                    if (onProgress) onProgress({ type: 'status', message: data.message });
                    break;
                    
                case 'chunk':
                    // Received a chunk of posts
                    posts.push(...data.posts);
                    if (onProgress) {
                        onProgress({
                            type: 'progress',
                            loaded: data.progress,
                            total: data.total,
                            percent: Math.round((data.progress / data.total) * 100)
                        });
                    }
                    break;
                    
                case 'complete':
                    // All posts loaded
                    eventSource.close();
                    if (onProgress) onProgress({ type: 'complete', total: data.total });
                    resolve(posts);
                    break;
                    
                case 'error':
                    eventSource.close();
                    reject(new Error(data.message));
                    break;
            }
        };
        
        eventSource.onerror = (error) => {
            eventSource.close();
            reject(error);
        };
        
        // Timeout after 5 minutes
        setTimeout(() => {
            eventSource.close();
            reject(new Error('Request timed out'));
        }, 300000);
    });
}

/**
 * Load posts with optimized backend (faster but no streaming)
 */
async function loadPostsOptimized(filter) {
    const response = await fetch(`/api/posts/optimized?filter=${filter}`);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
}

/**
 * Load posts with automatic fallback
 * Tries streaming first, falls back to optimized, then original
 */
async function loadPostsSmart(filter, onProgress) {
    try {
        // Try streaming first if progress callback provided
        if (onProgress && 'EventSource' in window) {
            return await loadPostsStreaming(filter, onProgress);
        }
        
        // Fall back to optimized endpoint
        if (onProgress) {
            onProgress({ type: 'status', message: 'Loading posts...' });
        }
        return await loadPostsOptimized(filter);
        
    } catch (streamError) {
        console.warn('Streaming failed, falling back to standard API:', streamError);
        
        // Final fallback to original endpoint
        return await loadPosts(filter);
    }
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
    getAutocompleteTags,
    loadPostsStreaming,
    loadPostsOptimized,
    loadPostsSmart
};