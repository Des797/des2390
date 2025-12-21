// Posts Management - FULLY OPTIMIZED
import { state, updateURLState } from './state.js';
import { showNotification, applySearchFilter } from './utils.js';
import {
    loadPostsPaginated,
    getTotalCount,
    loadTagCounts,
    savePost as apiSavePost,
    discardPost as apiDiscardPost,
    deletePost as apiDeletePost,
    getPostSize
} from './api.js';
import { renderPost, renderPaginationButtons, setupVideoPreviewListeners } from './posts_renderer.js';
import { attachPostEventListeners, setupPaginationListeners, setupMediaErrorHandlers } from './event_handlers.js';
import { useVirtualScroll, destroyVirtualScroll } from './virtual_scroll.js';
import { ELEMENT_IDS, URL_PARAMS, POST_STATUS, CSS_CLASSES, PAGINATION, SORT_ORDER } from './constants.js';
import { parseQueryTree, matchNode } from './query_parser.js';

window.setupVideoPreviewListeners = setupVideoPreviewListeners;

// Search query cache for parsed ASTs
const searchCache = new Map();
const MAX_CACHE_SIZE = 50;

// Debounce helper
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Modal index cache (ID -> index mapping)
let modalIndexCache = new Map();

function rebuildModalIndexCache() {
    modalIndexCache.clear();
    state.allPosts.forEach((post, index) => {
        modalIndexCache.set(post.id, index);
    });
}

// Export for modal.js to use
window.getModalIndex = (postId) => modalIndexCache.get(postId) ?? -1;

// Optimized sort with batched size fetching
async function sortPosts(posts, sortBy, order) {
    if (sortBy === 'size') {
        const grid = document.getElementById(ELEMENT_IDS.POSTS_GRID);
        const needsFetching = posts.filter(p => !state.postSizes[p.id]);
        
        if (needsFetching.length > 0) {
            console.log(`Fetching sizes for ${needsFetching.length} posts...`);
            
            const BATCH_SIZE = 10;
            let fetched = 0;
            
            for (let i = 0; i < needsFetching.length; i += BATCH_SIZE) {
                const batch = needsFetching.slice(i, i + BATCH_SIZE);
                
                await Promise.all(batch.map(async p => {
                    try {
                        const result = await getPostSize(p.id);
                        state.postSizes[p.id] = result.size;
                        fetched++;
                        
                        if (needsFetching.length > 20) {
                            const percent = Math.round((fetched / needsFetching.length) * 100);
                            grid.innerHTML = `<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ Calculating file sizes: ${fetched}/${needsFetching.length} (${percent}%)</p>`;
                        }
                    } catch (e) {
                        state.postSizes[p.id] = 0;
                    }
                }));
                
                if (i + BATCH_SIZE < needsFetching.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        }
    }
    
    const compareFn = createComparator(sortBy, order);
    return posts.sort(compareFn);
}

// REPLACE the updateVideoDurationBadges function in posts.js with this enhanced version

/**
 * Update duration badges for visible video posts with detailed logging
 */
async function updateVideoDurationBadges() {
    const startTime = Date.now();
    const videoPosts = document.querySelectorAll('.gallery-item-media.media-video');
    
    console.log(`[Duration] Starting update for ${videoPosts.length} video posts`);
    
    // Process in batches to avoid overwhelming the server
    const BATCH_SIZE = 5;
    const posts = Array.from(videoPosts);
    
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    
    for (let i = 0; i < posts.length; i += BATCH_SIZE) {
        const batch = posts.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(posts.length / BATCH_SIZE);
        
        console.log(`[Duration] Processing batch ${batchNum}/${totalBatches} (${batch.length} videos)`);
        
        await Promise.all(batch.map(async (container) => {
            const durationBadge = container.querySelector('.video-duration');
            
            // CRITICAL FIX: Validate post ID from badge, not container
            if (!durationBadge) {
                console.warn(`[Duration] No duration badge found in container`);
                return;
            }
            
            const postIdStr = durationBadge.dataset.postId;
            if (!postIdStr) {
                console.error(`[Duration] No data-post-id attribute on badge`);
                failCount++;
                return;
            }
            
            const postId = parseInt(postIdStr);
            if (isNaN(postId) || postId <= 0) {
                console.error(`[Duration] Invalid post ID: "${postIdStr}" parsed as ${postId}`);
                failCount++;
                if (durationBadge) {
                    durationBadge.textContent = '?';
                    durationBadge.classList.add('error');
                    durationBadge.title = 'Invalid post ID';
                }
                return;
            }
            
            // Skip if already has duration (not placeholder)
            if (durationBadge.textContent && durationBadge.textContent !== '...') {
                console.log(`[Duration] Skipping post ${postId} - already has duration: ${durationBadge.textContent}`);
                skippedCount++;
                return;
            }
            
            console.log(`[Duration] Fetching duration for post ${postId}...`);
            
            try {
                // Fetch duration
                const duration = await fetchVideoDuration(postId);
                
                if (duration && durationBadge) {
                    const mins = Math.floor(duration / 60);
                    const secs = Math.floor(duration % 60);
                    const formatted = `${mins}:${secs.toString().padStart(2, '0')}`;
                    
                    durationBadge.textContent = formatted;
                    durationBadge.style.display = 'block';
                    durationBadge.classList.remove('loading');
                    durationBadge.classList.add('loaded');
                    
                    console.log(`[Duration] ✅ Post ${postId}: ${formatted} (${duration}s)`);
                    successCount++;
                    
                    // Update the post in state
                    const post = state.allPosts.find(p => p.id === postId);
                    if (post) {
                        post.duration = duration;
                    }
                } else {
                    console.warn(`[Duration] ❌ Post ${postId}: Failed (duration=${duration}, badge=${!!durationBadge})`);
                    failCount++;
                    
                    // Show error indicator
                    if (durationBadge) {
                        durationBadge.textContent = '?';
                        durationBadge.classList.add('error');
                        durationBadge.title = 'Failed to load duration';
                    }
                }
            } catch (error) {
                console.error(`[Duration] ❌ Post ${postId}: Exception:`, error);
                failCount++;
                
                // Show error indicator
                if (durationBadge) {
                    durationBadge.textContent = '?';
                    durationBadge.classList.add('error');
                    durationBadge.title = `Error: ${error.message}`;
                }
            }
        }));
        
        // Small delay between batches
        if (i + BATCH_SIZE < posts.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Duration] Complete! ${successCount} succeeded, ${failCount} failed, ${skippedCount} skipped in ${elapsed}s`);
}

/**
 * Enhanced fetchVideoDuration with detailed logging
 */
async function fetchVideoDuration(postId) {
    // Check cache first
    if (durationCache.has(postId)) {
        const cached = durationCache.get(postId);
        console.log(`[Duration] Using cached duration for post ${postId}: ${cached}s`);
        return cached;
    }
    
    console.log(`[Duration] Fetching from API for post ${postId}...`);
    
    try {
        const result = await getVideoDuration(postId);
        
        console.log(`[Duration] API response for post ${postId}:`, result);
        
        if (result && result.duration) {
            durationCache.set(postId, result.duration);
            console.log(`[Duration] Cached duration for post ${postId}: ${result.duration}s`);
            return result.duration;
        } else {
            console.warn(`[Duration] Invalid response for post ${postId}:`, result);
            return null;
        }
    } catch (error) {
        console.error(`[Duration] API error for post ${postId}:`, error);
        return null;
    }
}

/**
 * Enhanced getVideoDuration API call with logging
 */
async function getVideoDuration(postId) {
    const endpoint = `/api/post/${postId}/duration`;
    
    console.log(`[Duration API] GET ${endpoint}`);
    
    try {
        const response = await fetch(endpoint);
        
        console.log(`[Duration API] Response status: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Duration API] Error response body:`, errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        console.log(`[Duration API] Response data:`, data);
        
        return data;
    } catch (error) {
        console.error(`[Duration API] Request failed:`, error);
        throw error;
    }
}

// Cache for video durations
const durationCache = new Map();

// Export the new function
export { fetchVideoDuration, updateVideoDurationBadges };

function createComparator(sortBy, order) {
    const multiplier = order === SORT_ORDER.ASC ? 1 : -1;
    
    switch(sortBy) {
        case 'download':
            return (a, b) => {
                const valA = new Date(a.downloaded_at || a.timestamp).getTime();
                const valB = new Date(b.downloaded_at || b.timestamp).getTime();
                return (valA - valB) * multiplier;
            };
        case 'upload':
            return (a, b) => {
                const valA = parseInt(a.created_at || a.change || 0);
                const valB = parseInt(b.created_at || b.change || 0);
                return (valA - valB) * multiplier;
            };
        case 'id':
            return (a, b) => (a.id - b.id) * multiplier;
        case 'score':
            return (a, b) => ((a.score || 0) - (b.score || 0)) * multiplier;
        case 'tags':
            return (a, b) => (a.tags.length - b.tags.length) * multiplier;
        case 'size':
            return (a, b) => ((state.postSizes[a.id] || 0) - (state.postSizes[b.id] || 0)) * multiplier;
        default:
            return (a, b) => (a.timestamp - b.timestamp) * multiplier;
    }
}

// Single-pass rendering (no batching)
async function renderPostsOptimized(grid, posts, sortBy, searchQuery) {
    const allHtml = posts.map(p => renderPost(p, sortBy, searchQuery)).join('');
    grid.innerHTML = allHtml;
    
    attachPostEventListeners();
    setupMediaErrorHandlers();
    requestAnimationFrame(() => setupVideoPreviewListeners());
}

// Main load function with status operator support
async function loadPosts(updateURL = true) {
    console.log('🎬 loadPosts() called with TRUE PAGINATION');
    
    const grid = document.getElementById(ELEMENT_IDS.POSTS_GRID);
    const startTime = Date.now();
    
    try {
        // Load tag counts if needed
        if (!state.tagCounts || Object.keys(state.tagCounts).length === 0) {
            console.log('📋 Loading tag counts...');
            grid.innerHTML = '<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ Loading tag counts...</p>';
            state.tagCounts = await loadTagCounts();
        }
        
        // Check for status: operator in search
        const searchQuery = state.postsSearch;
        const { status: statusFromSearch, cleanedQuery } = extractStatusOperator(searchQuery);
        const effectiveStatus = statusFromSearch || state.postsStatusFilter;
        
        console.log('🔍 Filter:', effectiveStatus, 'Search:', cleanedQuery);
        
        // Disable filter dropdown if status: in search
        const filterDropdown = document.getElementById(ELEMENT_IDS.POSTS_STATUS_FILTER);
        if (statusFromSearch) {
            filterDropdown.disabled = true;
            filterDropdown.style.opacity = '0.5';
        } else {
            filterDropdown.disabled = false;
            filterDropdown.style.opacity = '1';
        }
        
        hideSearchError();
        
        grid.innerHTML = '<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ Counting posts...</p>';
        
        // Step 1: Get total count (instant!)
        const total = await getTotalCount(effectiveStatus);
        console.log(`✅ Total: ${total} posts`);
        
        document.getElementById(ELEMENT_IDS.POSTS_TOTAL_RESULTS).textContent = `Total: ${total} posts`;
        
        // Step 2: Get posts per page setting
        let perPage = parseInt(document.getElementById(ELEMENT_IDS.POSTS_PER_PAGE).value);
        if (isNaN(perPage) || perPage < 1) perPage = 42;
        if (perPage > 200) perPage = 200;
        
        // Step 3: Calculate offset for current page
        const offset = (state.postsPage - 1) * perPage;
        
        console.log(`📄 Loading page ${state.postsPage}: offset=${offset}, limit=${perPage}`);
        
        grid.innerHTML = `<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ Loading page ${state.postsPage}...</p>`;
        
        // Step 4: Load ONLY the current page from server
        const result = await loadPostsPaginated(effectiveStatus, perPage, offset);
        let posts = result.posts;
        
        const loadTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ Loaded page in ${loadTime}s`);
        
        // Fix missing file_type
        posts = posts.map(post => {
            if (!post.file_type) {
                const url = post.file_url || post.file_path || '';
                const match = url.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm)$/i);
                post.file_type = match ? `.${match[1].toLowerCase()}` : '.jpg';
            }
            return post;
        });
        
        // Apply client-side search filter if needed
        if (cleanedQuery) {
            console.log('🔍 Applying search filter:', cleanedQuery);
            const filterResult = applySearchFilterWithErrors(posts, cleanedQuery);
            posts = filterResult.posts;
            
            if (filterResult.errors.length > 0) {
                showSearchError(filterResult.errors.join(', '));
            }
        }
        
        // Sort client-side (only current page)
        const sortBy = state.postsSortBy;
        const order = state.postsSortOrder;
        
        if (sortBy !== 'download') {  // download is default sort from server
            console.log('🔃 Sorting by', sortBy);
            posts = await sortPosts(posts, sortBy, order);
        }
        
        // Store posts for modal navigation
        state.allPosts = posts;
        rebuildModalIndexCache();
        
        if (posts.length === 0) {
            console.log('⚠️ No posts to display');
            destroyVirtualScroll();
            grid.innerHTML = '<p style="color: #64748b; text-align: center; grid-column: 1/-1;">No posts</p>';
        } else {
            console.log('🎨 Rendering', posts.length, 'posts...');
            
            grid.innerHTML = `<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ Rendering ${posts.length} posts...</p>`;
            await renderPostsOptimized(grid, posts, sortBy, cleanedQuery);
            
            console.log('✅ Rendering complete');
        }
        
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ Total time: ${totalTime}s`);
        
        // Update pagination (use actual total, not filtered count)
        renderPagination(total, perPage, state.postsPage);
        updateBulkControls();
        updateSortOrderButton();
        
        if (updateURL) {
            updateURLState({
                [URL_PARAMS.TAB]: 'posts',
                [URL_PARAMS.PAGE]: state.postsPage,
                [URL_PARAMS.FILTER]: effectiveStatus,
                [URL_PARAMS.SEARCH]: searchQuery,
                [URL_PARAMS.SORT]: sortBy,
                [URL_PARAMS.ORDER]: order
            });
        }
        
        if (posts.length > 0) {
            requestAnimationFrame(() => {
                updateVideoDurationBadges();
            });
        }
    } catch (error) {
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.error(`❌ loadPosts failed after ${totalTime}s:`, error);
        
        showNotification('Failed to load posts', 'error');
        grid.innerHTML = '<p style="color: #ef4444; text-align: center; grid-column: 1/-1;">Failed to load posts. Check console for details.</p>';
    }
}

// Apply search filter and return errors
function applySearchFilterWithErrors(posts, query) {
    if (!query || !query.trim()) {
        return { posts, errors: [] };
    }
    
    // Check cache first
    const cacheKey = `${query}|${posts.length}`;
    if (searchCache.has(cacheKey)) {
        return searchCache.get(cacheKey);
    }
    
    const tree = parseQueryTree(query);
    const filtered = posts.filter(post => matchNode(post, tree));
    
    const result = {
        posts: filtered,
        errors: tree.errors || []
    };
    
    // LRU cache
    if (searchCache.size >= MAX_CACHE_SIZE) {
        const firstKey = searchCache.keys().next().value;
        searchCache.delete(firstKey);
    }
    searchCache.set(cacheKey, result);
    
    return result;
}

// Cached search filter
function applySearchFilterCached(posts, query) {
    if (!query || !query.trim()) return posts;
    
    // Check cache
    if (!searchCache.has(query)) {
        // Apply filter and cache result
        const filtered = applySearchFilter(posts, query);
        
        // LRU: remove oldest if cache is full
        if (searchCache.size >= MAX_CACHE_SIZE) {
            const firstKey = searchCache.keys().next().value;
            searchCache.delete(firstKey);
        }
        
        searchCache.set(query, filtered);
        return filtered;
    }
    
    return searchCache.get(query);
}

// Debounced search (300ms delay)
const debouncedPerformSearch = debounce(() => {
    const input = document.getElementById(ELEMENT_IDS.POSTS_SEARCH_INPUT);
    state.postsSearch = input.value;
    state.postsPage = 1;
    searchCache.clear(); // Clear cache on new search
    loadPosts();
}, 300);

// Extract status: operator from search query
function extractStatusOperator(query) {
    const statusMatch = query.match(/\bstatus:(pending|saved|all)\b/i);
    if (statusMatch) {
        return {
            status: statusMatch[1].toLowerCase(),
            cleanedQuery: query.replace(/\bstatus:(pending|saved|all)\b/gi, '').trim()
        };
    }
    return { status: null, cleanedQuery: query };
}

// Show search error above gallery grid
function showSearchError(message) {
    let errorDiv = document.getElementById('searchErrorDisplay');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'searchErrorDisplay';
        
        // Insert before the gallery grid
        const gallery = document.querySelector('.gallery');
        const grid = document.getElementById(ELEMENT_IDS.POSTS_GRID);
        gallery.insertBefore(errorDiv, grid);
    }
    
    errorDiv.innerHTML = `<strong>⚠️ Search Error:</strong> ${message}`;
    errorDiv.classList.add('show');
}

function hideSearchError() {
    const errorDiv = document.getElementById('searchErrorDisplay');
    if (errorDiv) {
        errorDiv.classList.remove('show');
    }
}

function updateSortOrderButton() {
    const btn = document.getElementById(ELEMENT_IDS.POSTS_SORT_ORDER);
    if (btn) {
        btn.textContent = state.postsSortOrder === SORT_ORDER.ASC ? '↑' : '↓';
        btn.title = state.postsSortOrder === SORT_ORDER.ASC ? 'Ascending' : 'Descending';
    }
}

function toggleSortOrder() {
    state.postsSortOrder = state.postsSortOrder === SORT_ORDER.ASC ? SORT_ORDER.DESC : SORT_ORDER.ASC;
    state.postsPage = 1;
    loadPosts();
}

// Post actions
async function savePostAction(postId) {
    try {
        await apiSavePost(postId);
        showNotification('Post saved');
        
        // Update post in state without full reload
        const post = state.allPosts.find(p => p.id === postId);
        if (post) {
            post.status = 'saved';
            post.date_folder = new Date().toLocaleDateString('en-US', {
                month: '2-digit',
                day: '2-digit',
                year: 'numeric'
            }).replace(/\//g, '.');
        }
        
        // Remove from display if filtering for pending, preserving transition
        if (state.postsStatusFilter === 'pending') {
            const postEl = document.querySelector(`[data-post-id="${postId}"]`);

            if (postEl) {
                postEl.style.transition = 'opacity 0.3s';
                postEl.style.opacity = '0';

                await new Promise(resolve => {
                    setTimeout(resolve, 300);
                });
            }

            await removePostAndLoadNext(postId);
        }

        searchCache.clear();
    } catch (error) {
        // ERROR HANDLING FIX: Don't remove post if operation failed
        showNotification('Failed to save post - file may be locked. Try again.', 'error');
        logger.error('Save failed:', error);
        
        // Restore post visibility if it was hidden
        const postEl = document.querySelector(`[data-post-id="${postId}"]`);
        if (postEl) {
            postEl.style.opacity = '1';
        }
    }
}


async function discardPostAction(postId) {
    try {
        await apiDiscardPost(postId);
        showNotification('Post discarded');

        const postEl = document.querySelector(`[data-post-id="${postId}"]`);

        // Animate removal
        if (postEl) {
            postEl.style.transition = 'opacity 0.3s, transform 0.3s';
            postEl.style.opacity = '0';
            postEl.style.transform = 'scale(0.8)';

            await new Promise(resolve => {
                setTimeout(resolve, 300);
            });
        }

        // Centralized removal + load next
        await removePostAndLoadNext(postId);

        searchCache.clear();
        rebuildModalIndexCache();
    } catch (error) {
        // ERROR HANDLING FIX: Don't remove post if operation failed
        showNotification('Failed to discard post - file may be locked. Try again.', 'error');
        logger.error('Discard failed:', error);
        
        // Restore post visibility
        const postEl = document.querySelector(`[data-post-id="${postId}"]`);
        if (postEl) {
            postEl.style.opacity = '1';
            postEl.style.transform = 'scale(1)';
        }
    }
}


async function deletePostAction(postId, dateFolder) {
    try {
        await apiDeletePost(postId, dateFolder);
        showNotification('Post deleted');

        const postEl = document.querySelector(`[data-post-id="${postId}"]`);

        // Animate removal (preserve older behavior)
        if (postEl) {
            postEl.style.transition = 'opacity 0.3s, transform 0.3s';
            postEl.style.opacity = '0';
            postEl.style.transform = 'scale(0.8)';

            await new Promise(resolve => {
                setTimeout(resolve, 300);
            });
        }

        // Centralized removal + load next
        await removePostAndLoadNext(postId);

        searchCache.clear();
        rebuildModalIndexCache();
    } catch (error) {
        // ERROR HANDLING FIX: Don't remove post if operation failed
        showNotification('Failed to delete post - file may be locked. Try again.', 'error');
        logger.error('Delete failed:', error);
        
        // Restore post visibility
        const postEl = document.querySelector(`[data-post-id="${postId}"]`);
        if (postEl) {
            postEl.style.opacity = '1';
            postEl.style.transform = 'scale(1)';
        }
    }
}


async function removePostAndLoadNext(postId) {
    // Remove from state
    const postIndex = state.allPosts.findIndex(p => p.id === postId);
    if (postIndex !== -1) {
        state.allPosts.splice(postIndex, 1);
    }
    
    // Remove from display with animation
    const postEl = document.querySelector(`[data-post-id="${postId}"]`);
    if (postEl) {
        postEl.style.transition = 'opacity 0.3s, transform 0.3s';
        postEl.style.opacity = '0';
        postEl.style.transform = 'scale(0.8)';
        
        setTimeout(async () => {
            // Calculate if we need to load next post
            const perPage = parseInt(document.getElementById(ELEMENT_IDS.POSTS_PER_PAGE).value);
            const start = (state.postsPage - 1) * perPage;
            const end = start + perPage;
            const nextPost = state.allPosts[end - 1]; // The post that would be on next page
            
            if (nextPost) {
                // Render the next post in place of removed one
                const sortBy = state.postsSortBy;
                const searchQuery = state.postsSearch;
                const newPostHtml = renderPost(nextPost, sortBy, searchQuery);
                
                postEl.outerHTML = newPostHtml;
                
                // Re-attach event listeners to new post
                attachPostEventListeners();
                setupMediaErrorHandlers();
                requestAnimationFrame(() => setupVideoPreviewListeners());
            } else {
                // No more posts, just remove
                postEl.remove();
            }
            
            // Update total count
            document.getElementById(ELEMENT_IDS.POSTS_TOTAL_RESULTS).textContent = `Total: ${state.allPosts.length} posts`;
            updateBulkControls();
            rebuildModalIndexCache();
        }, 300);
    }
}

// Selection management 
function clearSelection() {
    state.selectedPosts.clear();
    document.querySelectorAll(`.${CSS_CLASSES.GALLERY_ITEM}.${CSS_CLASSES.SELECTED}`).forEach(item => {
        item.classList.remove(CSS_CLASSES.SELECTED);
        item.querySelector(`.${CSS_CLASSES.SELECT_CHECKBOX}`).classList.remove(CSS_CLASSES.CHECKED);
    });
    updateBulkControls();
}

function selectAllOnPage() {
    document.querySelectorAll(`.${CSS_CLASSES.GALLERY_ITEM}`).forEach(item => {
        const postId = parseInt(item.dataset.postId);
        state.selectedPosts.add(postId);
        item.classList.add(CSS_CLASSES.SELECTED);
        item.querySelector(`.${CSS_CLASSES.SELECT_CHECKBOX}`).classList.add(CSS_CLASSES.CHECKED);
    });
    updateBulkControls();
}

function selectAllMatching() {
    state.allPosts.forEach(post => state.selectedPosts.add(post.id));
    document.querySelectorAll(`.${CSS_CLASSES.GALLERY_ITEM}`).forEach(item => {
        const postId = parseInt(item.dataset.postId);
        if (state.selectedPosts.has(postId)) {
            item.classList.add(CSS_CLASSES.SELECTED);
            item.querySelector(`.${CSS_CLASSES.SELECT_CHECKBOX}`).classList.add(CSS_CLASSES.CHECKED);
        }
    });
    updateBulkControls();
}

function invertSelection() {
    const pagePostIds = new Set();
    document.querySelectorAll(`.${CSS_CLASSES.GALLERY_ITEM}`).forEach(item => {
        pagePostIds.add(parseInt(item.dataset.postId));
    });
    
    pagePostIds.forEach(postId => {
        if (state.selectedPosts.has(postId)) {
            state.selectedPosts.delete(postId);
        } else {
            state.selectedPosts.add(postId);
        }
    });
    
    document.querySelectorAll(`.${CSS_CLASSES.GALLERY_ITEM}`).forEach(item => {
        const postId = parseInt(item.dataset.postId);
        const checkbox = item.querySelector(`.${CSS_CLASSES.SELECT_CHECKBOX}`);
        
        if (state.selectedPosts.has(postId)) {
            item.classList.add(CSS_CLASSES.SELECTED);
            checkbox.classList.add(CSS_CLASSES.CHECKED);
        } else {
            item.classList.remove(CSS_CLASSES.SELECTED);
            checkbox.classList.remove(CSS_CLASSES.CHECKED);
        }
    });
    
    updateBulkControls();
}

function updateBulkControls() {
    const count = state.selectedPosts.size;
    const controls = document.getElementById(ELEMENT_IDS.POSTS_BULK_CONTROLS);
    const countSpan = document.getElementById(ELEMENT_IDS.POSTS_SELECTION_COUNT);
    const selectAllGlobalBtn = document.getElementById(ELEMENT_IDS.SELECT_ALL_POSTS_GLOBAL);
    
    const saveBtn = document.getElementById(ELEMENT_IDS.BULK_SAVE_POSTS);
    const discardBtn = document.getElementById(ELEMENT_IDS.BULK_DISCARD_POSTS);
    const deleteBtn = document.getElementById(ELEMENT_IDS.BULK_DELETE_POSTS);
    
    if (count > 0) {
        controls.style.display = 'block';
        countSpan.textContent = `${count} selected`;
        
        const totalMatchingPosts = state.allPosts.length;
        if (count < totalMatchingPosts && count > 0) {
            selectAllGlobalBtn.style.display = 'inline-block';
            selectAllGlobalBtn.textContent = `✓✓ Select All Matching (${totalMatchingPosts} total)`;
        } else {
            selectAllGlobalBtn.style.display = 'none';
        }
        
        const selectedPosts = Array.from(state.selectedPosts).map(id => {
            return state.allPosts.find(p => p.id === id);
        }).filter(p => p);
        
        const hasPending = selectedPosts.some(p => p.status === POST_STATUS.PENDING);
        const hasSaved = selectedPosts.some(p => p.status === POST_STATUS.SAVED);
        
        saveBtn.style.display = hasPending ? 'inline-block' : 'none';
        discardBtn.style.display = hasPending ? 'inline-block' : 'none';
        deleteBtn.style.display = hasSaved ? 'inline-block' : 'none';
    } else {
        controls.style.display = 'none';
        selectAllGlobalBtn.style.display = 'none';
    }
}

function filterByTag(tag) {
    const input = document.getElementById(ELEMENT_IDS.POSTS_SEARCH_INPUT);
    input.value = tag;
    state.postsSearch = tag;
    state.postsPage = 1;
    searchCache.clear();
    loadPosts();
}

function filterByOwner(owner) {
    const input = document.getElementById(ELEMENT_IDS.POSTS_SEARCH_INPUT);
    input.value = `owner:${owner}`;
    state.postsSearch = `owner:${owner}`;
    state.postsPage = 1;
    searchCache.clear();
    loadPosts();
}

function performSearch() {
    debouncedPerformSearch();
}

function renderPagination(total, perPage, currentPage) {
    const totalPages = Math.ceil(total / perPage);
    const container = document.getElementById(ELEMENT_IDS.POSTS_PAGINATION);
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = renderPaginationButtons(currentPage, totalPages);
    
    setupPaginationListeners(ELEMENT_IDS.POSTS_PAGINATION, (page) => {
        state.postsPage = page;
        loadPosts();
    });
    
    const gotoBtn = document.getElementById('gotoPageBtn');
    const gotoInput = document.getElementById('gotoPageInput');
    
    if (gotoBtn && gotoInput) {
        gotoBtn.addEventListener('click', () => {
            let targetPage = parseInt(gotoInput.value);
            
            if (isNaN(targetPage) || targetPage < 1) {
                targetPage = 1;
            } else if (targetPage > totalPages) {
                targetPage = totalPages;
            }
            
            gotoInput.value = targetPage;
            state.postsPage = targetPage;
            loadPosts();
        });
        
        gotoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                gotoBtn.click();
            }
        });
    }
}

// Refresh current page
function refreshCurrentPage() {
    searchCache.clear();
    loadPosts(false); // Don't update URL
}

window.refreshCurrentPage = refreshCurrentPage;

export {
    loadPosts,
    clearSelection,
    selectAllOnPage,
    selectAllMatching,
    invertSelection,
    filterByTag,
    filterByOwner,
    performSearch,
    savePostAction,
    discardPostAction,
    deletePostAction,
    removePostAndLoadNext,
    updateBulkControls,
    toggleSortOrder
};