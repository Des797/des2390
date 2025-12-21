// API Functions - OPTIMIZED
import { apiCall } from './utils.js';
import { API_ENDPOINTS } from './constants.js';

// Add missing constant
if (!API_ENDPOINTS.POST_COUNT) {
    API_ENDPOINTS.POST_COUNT = '/api/posts/count';
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

/**
 * OPTIMIZED: Get total count first (fast), then stream if needed
 */
async function loadPostsOptimized(filter, onProgress) {
    try {
        // Step 1: Get total count (instant)
        if (onProgress) {
            onProgress({ type: 'status', message: 'Counting posts...' });
        }
        
        const countResponse = await fetch(`/api/posts/count?filter=${filter}`);
        const countData = await countResponse.json();
        const total = countData.total;
        
        if (onProgress) {
            onProgress({ 
                type: 'count', 
                total: total,
                message: `Found ${total} posts`
            });
        }
        
        // Step 2: If small dataset, fetch all at once
        if (total <= 1000) {
            if (onProgress) {
                onProgress({ type: 'status', message: `Loading ${total} posts...` });
            }
            
            const response = await fetch(`/api/posts?filter=${filter}`);
            const data = await response.json();
            
            if (onProgress) {
                onProgress({ type: 'complete', total: data.posts.length });
            }
            
            return data.posts;
        }
        
        // Step 3: Large dataset - use streaming
        return await loadPostsStreaming(filter, onProgress, total);
        
    } catch (error) {
        console.error('Optimized load failed:', error);
        throw error;
    }
}

/**
 * Load posts with streaming progress updates - OPTIMIZED
 */
async function loadPostsStreaming(filter, onProgress, knownTotal = null) {
    return new Promise((resolve, reject) => {
        const eventSource = new EventSource(`/api/posts/stream?filter=${filter}`);
        const posts = [];
        let total = knownTotal;
        
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            switch(data.type) {
                case 'status':
                    if (onProgress) onProgress({ type: 'status', message: data.message });
                    break;
                    
                case 'chunk':
                    // Received a chunk of posts
                    posts.push(...data.posts);
                    total = data.total;
                    
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
                    if (onProgress) {
                        onProgress({ 
                            type: 'complete', 
                            total: data.total,
                            time: data.time 
                        });
                    }
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
 * Smart loader with automatic optimization
 */
async function loadPostsSmart(filter, onProgress) {
    try {
        // Always use optimized loader
        return await loadPostsOptimized(filter, onProgress);
        
    } catch (error) {
        console.warn('Optimized load failed, falling back:', error);
        
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

// Posts - LEGACY (kept for compatibility)
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

async function getVideoDuration(postId) {
    const endpoint = `/api/post/${postId}/duration`;
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
    loadPostsSmart,
    getVideoDuration
};