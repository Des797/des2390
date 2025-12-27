// Posts Management - FULLY OPTIMIZED with SERVER-SIDE sorting/searching
import { state, updateURLState } from './state.js';
import { showNotification } from './utils.js';
import {
    loadPostsPaginated,
    getTotalCount,
    loadTagCounts,
    savePost as apiSavePost,
    discardPost as apiDiscardPost,
    deletePost as apiDeletePost,
    getPostSize,
    getVideoDuration
} from './api.js';
import { renderPost, renderPaginationButtons, setupVideoPreviewListeners } from './posts_renderer.js';
import { attachPostEventListeners, setupPaginationListeners, setupMediaErrorHandlers } from './event_handlers.js';
import { ELEMENT_IDS, URL_PARAMS, POST_STATUS, CSS_CLASSES, SORT_ORDER } from './constants.js';
import { extractMetadata, validateQuery } from './query_parser.js';

window.setupVideoPreviewListeners = setupVideoPreviewListeners;

/**
 * Handle query metadata (sort:, per-page:) before loading posts
 * Call this at the start of loadPosts()
 */
export function handleQueryMetadata(searchQuery) {
    if (!searchQuery) return;
    
    // Validate query syntax first
    const error = validateQuery(searchQuery);
    if (error) {
        showNotification(`Query error: ${error}`, 'error');
        return;
    }
    
    // Extract metadata
    const metadata = extractMetadata(searchQuery);
    
    // Update sort dropdown if sort: was used
    if (metadata.sort) {
        const sortDropdown = document.getElementById('postsSort');
        if (sortDropdown) {
            // Map sort fields to dropdown values
            const sortMapping = {
                'download': 'download',
                'download-date': 'download',
                'downloaded': 'download',
                'upload': 'upload',
                'upload-date': 'upload',
                'uploaded': 'upload',
                'created': 'upload',
                'id': 'id',
                'post-id': 'id',
                'score': 'score',
                'tags': 'tags',
                'tag-count': 'tags',
                'size': 'size',
                'file-size': 'size',
                'width': 'size',
                'height': 'size',
                'duration': 'size',
                'random': 'random'
            };
            
            const mappedSort = sortMapping[metadata.sort.toLowerCase()] || metadata.sort;
            
            // Update dropdown if value exists
            const option = Array.from(sortDropdown.options).find(
                opt => opt.value === mappedSort
            );
            
            if (option) {
                sortDropdown.value = mappedSort;
                console.log(`[Metadata] Updated sort dropdown to: ${mappedSort}`);
            }
        }
    }
    
    // Update sort order if specified
    if (metadata.order) {
        const orderBtn = document.getElementById('postsSortOrder');
        if (orderBtn) {
            const newOrder = metadata.order.toUpperCase();
            if (state.postsSortOrder !== newOrder) {
                state.postsSortOrder = newOrder;
                orderBtn.textContent = newOrder === 'ASC' ? '↑' : '↓';
                orderBtn.title = newOrder === 'ASC' ? 'Ascending' : 'Descending';
                console.log(`[Metadata] Updated sort order to: ${newOrder}`);
            }
        }
    }
    
    // Update per-page if specified
    if (metadata.perPage) {
        const perPageInput = document.getElementById('postsPerPage');
        if (perPageInput) {
            const clamped = Math.max(1, Math.min(metadata.perPage, 200));
            if (parseInt(perPageInput.value) !== clamped) {
                perPageInput.value = clamped;
                console.log(`[Metadata] Updated per-page to: ${clamped}`);
            }
        }
    }
}

// Modal index cache
let modalIndexCache = new Map();

function rebuildModalIndexCache() {
    modalIndexCache.clear();
    state.allPosts.forEach((post, index) => {
        modalIndexCache.set(post.id, index);
    });
}

window.getModalIndex = (postId) => modalIndexCache.get(postId) ?? -1;

// Cache for video durations
const durationCache = new Map();

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

/**
 * Update duration badges for visible video posts
 */
async function updateVideoDurationBadges() {
    const startTime = Date.now();
    const videoPosts = document.querySelectorAll('.gallery-item-media.media-video');
    
    console.log(`[Duration] Starting update for ${videoPosts.length} video posts`);
    
    const BATCH_SIZE = 5;
    const posts = Array.from(videoPosts);
    
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    
    for (let i = 0; i < posts.length; i += BATCH_SIZE) {
        const batch = posts.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (container) => {
            const durationBadge = container.querySelector('.video-duration');
            
            if (!durationBadge) {
                console.warn(`[Duration] No duration badge found`);
                return;
            }
            
            const postIdStr = durationBadge.dataset.postId;
            if (!postIdStr) {
                console.error(`[Duration] No data-post-id attribute`);
                failCount++;
                return;
            }
            
            const postId = parseInt(postIdStr);
            if (isNaN(postId) || postId <= 0) {
                console.error(`[Duration] Invalid post ID: "${postIdStr}"`);
                failCount++;
                if (durationBadge) {
                    durationBadge.textContent = '?';
                    durationBadge.classList.add('error');
                }
                return;
            }
            
            // Skip if already has duration
            if (durationBadge.textContent && durationBadge.textContent !== '...') {
                skippedCount++;
                return;
            }
            
            try {
                const duration = await fetchVideoDuration(postId);
                
                if (duration && durationBadge) {
                    const mins = Math.floor(duration / 60);
                    const secs = Math.floor(duration % 60);
                    const formatted = `${mins}:${secs.toString().padStart(2, '0')}`;
                    
                    durationBadge.textContent = formatted;
                    durationBadge.classList.remove('loading');
                    durationBadge.classList.add('loaded');
                    
                    successCount++;
                    
                    const post = state.allPosts.find(p => p.id === postId);
                    if (post) post.duration = duration;
                } else {
                    failCount++;
                    if (durationBadge) {
                        durationBadge.textContent = '?';
                        durationBadge.classList.add('error');
                    }
                }
            } catch (error) {
                failCount++;
                if (durationBadge) {
                    durationBadge.textContent = '?';
                    durationBadge.classList.add('error');
                }
            }
        }));
        
        if (i + BATCH_SIZE < posts.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Duration] Complete! ${successCount} succeeded, ${failCount} failed, ${skippedCount} skipped in ${elapsed}s`);
}

async function fetchVideoDuration(postId) {
    if (durationCache.has(postId)) {
        return durationCache.get(postId);
    }
    
    try {
        const result = await getVideoDuration(postId);
        
        if (result && result.duration) {
            durationCache.set(postId, result.duration);
            return result.duration;
        }
        return null;
    } catch (error) {
        console.error(`[Duration] API error for post ${postId}:`, error);
        return null;
    }
}

// Single-pass rendering
async function renderPostsOptimized(grid, posts, sortBy, searchQuery) {
    const allHtml = posts.map(p => renderPost(p, sortBy, searchQuery)).join('');
    grid.innerHTML = allHtml;
    
    attachPostEventListeners();
    setupMediaErrorHandlers();
    requestAnimationFrame(() => setupVideoPreviewListeners());
}

/**
 * MAIN LOAD FUNCTION - Now with SERVER-SIDE sorting and text search
 */
async function loadPosts(updateURL = true) {
    console.log('🎬 loadPosts() - SERVER-SIDE sorting & searching');
    handleQueryMetadata(state.postsSearch);
    
    const grid = document.getElementById(ELEMENT_IDS.POSTS_GRID);
    const startTime = Date.now();
    
    try {
        // Initialize UI features
        import('./posts_ui_features.js').then(module => module.initPostsUI());
        
        // Load tag counts if needed
        if (!state.tagCounts || Object.keys(state.tagCounts).length === 0) {
            console.log('📋 Loading tag counts...');
            grid.innerHTML = '<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ Loading tag counts...</p>';
            state.tagCounts = await loadTagCounts();
        }
        
        const searchQuery = state.postsSearch;
        const effectiveStatus = state.postsStatusFilter;
        const sortBy = state.postsSortBy;
        
        console.log('🔍 Filter:', effectiveStatus, 'Search:', searchQuery, 'Sort:', sortBy);
        
        grid.innerHTML = '<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ Counting posts...</p>';
        
        // Step 1: Get total count WITH search filter
        const total = await getTotalCount(effectiveStatus, searchQuery);
        console.log(`✅ Total: ${total} posts (with filters)`);
        
        // Update total display
        const totalResultsEl = document.getElementById(ELEMENT_IDS.POSTS_TOTAL_RESULTS);
        if (totalResultsEl) {
            totalResultsEl.textContent = `Total: ${total.toLocaleString()} posts`;
        }
        
        // Step 2: Get posts per page
        let perPage = parseInt(document.getElementById(ELEMENT_IDS.POSTS_PER_PAGE).value);
        if (isNaN(perPage) || perPage < 1) perPage = 42;
        if (perPage > 200) perPage = 200;
        
        // Step 3: Calculate offset
        const offset = (state.postsPage - 1) * perPage;
        
        console.log(`📄 Loading page ${state.postsPage}: offset=${offset}, limit=${perPage}`);
        
        grid.innerHTML = `<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ Loading page ${state.postsPage}...</p>`;
        
        // Step 4: Load posts with SERVER-SIDE sort
        const order = state.postsSortOrder;
        
        // For random sort, generate seed on first load or when changing filters
        if (sortBy === 'random') {
            // Generate new seed if:
            // - No seed exists
            // - Sort just changed to random
            // - Filters/search changed
            const filterKey = `${effectiveStatus}|${searchQuery}`;
            if (!state.randomSeed || state.lastRandomFilterKey !== filterKey) {
                state.randomSeed = Math.floor(Math.random() * 2147483647);
                state.lastRandomFilterKey = filterKey;
                console.log(`🎲 Generated new random seed: ${state.randomSeed}`);
            }
        } else {
            // Clear seed when not using random sort
            state.randomSeed = null;
            state.lastRandomFilterKey = null;
        }
        
        const result = await loadPostsPaginated(
            effectiveStatus,
            perPage,
            offset,
            sortBy,
            order,
            searchQuery,
            state.randomSeed  // Pass seed for random sort
        );
        
        let posts = result.posts;
        
        // Update seed from response (server may have generated one)
        if (result.random_seed) {
            state.randomSeed = result.random_seed;
        }
        
        const loadTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ Loaded page in ${loadTime}s (server-side sorted)`);
        
        // Fix missing file_type
        posts = posts.map(post => {
            if (!post.file_type) {
                const url = post.file_url || post.file_path || '';
                const match = url.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm)$/i);
                post.file_type = match ? `.${match[1].toLowerCase()}` : '.jpg';
            }
            return post;
        });
        
        // Apply client-side enhancements
        const { highlightMatchingTags, sortByTagMatching, renderTagSidebar } = await import('./posts_ui_features.js');
        
        // Highlight matching tags
        posts = highlightMatchingTags(posts, searchQuery);
        
        // Render tag sidebar
        renderTagSidebar(effectiveStatus, searchQuery);
        
        // Store posts for modal navigation
        state.allPosts = posts;
        rebuildModalIndexCache();
        
        if (posts.length === 0) {
            grid.innerHTML = '<p style="color: #64748b; text-align: center; grid-column: 1/-1;">No posts match your filters</p>';
        } else {
            grid.innerHTML = `<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ Rendering ${posts.length} posts...</p>`;
            await renderPostsOptimized(grid, posts, sortBy, searchQuery);
        }
        
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ Total time: ${totalTime}s`);
        
        // Update pagination
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
        grid.innerHTML = '<p style="color: #ef4444; text-align: center; grid-column: 1/-1;">Failed to load posts. Check console.</p>';
    }
}

// Debounced search (300ms delay)
const debouncedPerformSearch = debounce(() => {
    const input = document.getElementById(ELEMENT_IDS.POSTS_SEARCH_INPUT);
    state.postsSearch = input.value;
    state.postsPage = 1;
    loadPosts();
}, 300);

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

async function savePostAction(postId) {
    try {
        await apiSavePost(postId);
        showNotification('Post saved');
        
        const post = state.allPosts.find(p => p.id === postId);
        if (post) {
            post.status = 'saved';
            post.date_folder = new Date().toLocaleDateString('en-US', {
                month: '2-digit',
                day: '2-digit',
                year: 'numeric'
            }).replace(/\//g, '.');
        }
        
        // If filtering by pending, remove from view
        if (state.postsStatusFilter === 'pending') {
            const postEl = document.querySelector(`[data-post-id="${postId}"]`);
            if (postEl) {
                postEl.style.transition = 'opacity 0.3s, transform 0.3s';
                postEl.style.opacity = '0';
                postEl.style.transform = 'scale(0.8)';
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            await removePostAndLoadNext(postId);
        } else {
            // If filtering by "all", update the post's visual status in place
            const postEl = document.querySelector(`[data-post-id="${postId}"]`);
            if (postEl) {
                postEl.setAttribute('data-status', 'saved');
                
                // Update status badge
                const statusBadge = postEl.querySelector('.gallery-item-id span[title]');
                if (statusBadge) {
                    statusBadge.style.background = '#10b981';
                    statusBadge.textContent = 'S';
                    statusBadge.title = 'Saved';
                }
                
                // Update action buttons to saved post actions
                const actions = postEl.querySelector('.gallery-item-actions');
                if (actions) {
                    const { renderPost } = await import('./posts_renderer.js');
                    const sortBy = state.postsSortBy;
                    const searchQuery = state.postsSearch;
                    
                    // Re-render just this post
                    const newPostHtml = renderPost(post, sortBy, searchQuery);
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = newPostHtml;
                    postEl.replaceWith(tempDiv.firstElementChild);
                    
                    // Re-attach event listeners
                    attachPostEventListeners();
                    setupMediaErrorHandlers();
                    requestAnimationFrame(() => setupVideoPreviewListeners());
                }
                
                // Visual feedback - flash green
                postEl.style.transition = 'box-shadow 0.3s';
                postEl.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.5)';
                setTimeout(() => {
                    postEl.style.boxShadow = '';
                }, 1000);
            }
        }
    } catch (error) {
        showNotification('Failed to save post - file may be locked', 'error');
        const postEl = document.querySelector(`[data-post-id="${postId}"]`);
        if (postEl) {
            postEl.style.opacity = '1';
            postEl.style.transform = 'scale(1)';
        }
    }
}

async function discardPostAction(postId) {
    try {
        await apiDiscardPost(postId);
        showNotification('Post discarded');

        const postEl = document.querySelector(`[data-post-id="${postId}"]`);
        if (postEl) {
            postEl.style.transition = 'opacity 0.3s, transform 0.3s';
            postEl.style.opacity = '0';
            postEl.style.transform = 'scale(0.8)';
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        await removePostAndLoadNext(postId);
        rebuildModalIndexCache();
    } catch (error) {
        showNotification('Failed to discard post - file may be locked', 'error');
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
        if (postEl) {
            postEl.style.transition = 'opacity 0.3s, transform 0.3s';
            postEl.style.opacity = '0';
            postEl.style.transform = 'scale(0.8)';
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        await removePostAndLoadNext(postId);
        rebuildModalIndexCache();
    } catch (error) {
        showNotification('Failed to delete post - file may be locked', 'error');
        const postEl = document.querySelector(`[data-post-id="${postId}"]`);
        if (postEl) {
            postEl.style.opacity = '1';
            postEl.style.transform = 'scale(1)';
        }
    }
}

async function removePostAndLoadNext(postId) {
    const postIndex = state.allPosts.findIndex(p => p.id === postId);
    if (postIndex !== -1) {
        state.allPosts.splice(postIndex, 1);
    }
    
    const postEl = document.querySelector(`[data-post-id="${postId}"]`);
    if (postEl) {
        postEl.style.transition = 'opacity 0.3s, transform 0.3s';
        postEl.style.opacity = '0';
        postEl.style.transform = 'scale(0.8)';
        
        setTimeout(async () => {
            const perPage = parseInt(document.getElementById(ELEMENT_IDS.POSTS_PER_PAGE).value);
            const start = (state.postsPage - 1) * perPage;
            const end = start + perPage;
            const nextPost = state.allPosts[end - 1];
            
            if (nextPost) {
                const sortBy = state.postsSortBy;
                const searchQuery = state.postsSearch;
                const newPostHtml = renderPost(nextPost, sortBy, searchQuery);
                
                postEl.outerHTML = newPostHtml;
                
                attachPostEventListeners();
                setupMediaErrorHandlers();
                requestAnimationFrame(() => setupVideoPreviewListeners());
            } else {
                postEl.remove();
            }
            
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

async function selectAllMatching() {
    const btn = document.getElementById(ELEMENT_IDS.SELECT_ALL_POSTS_GLOBAL);
    const originalText = btn ? btn.textContent : '✓✓ Select All Matching';
    
    try {
        // Show loading indicator
        if (btn) {
            btn.textContent = '⏳ Loading all matching posts...';
            btn.disabled = true;
        }
        
        // Fetch ALL matching post IDs from backend
        const params = new URLSearchParams({
            filter: state.postsStatusFilter,
            search: state.postsSearch
        });
        
        const response = await fetch(`/api/posts/ids?${params}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        // Add all IDs to selection
        data.ids.forEach(id => state.selectedPosts.add(id));
        
        // Update UI for visible posts
        document.querySelectorAll(`.${CSS_CLASSES.GALLERY_ITEM}`).forEach(item => {
            const postId = parseInt(item.dataset.postId);
            if (state.selectedPosts.has(postId)) {
                item.classList.add(CSS_CLASSES.SELECTED);
                item.querySelector(`.${CSS_CLASSES.SELECT_CHECKBOX}`).classList.add(CSS_CLASSES.CHECKED);
            }
        });
        
        updateBulkControls();
        
        showNotification(`Selected ${data.count} matching posts`);
        
        // Restore button
        if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    } catch (error) {
        console.error('Failed to select all matching:', error);
        showNotification('Failed to select all matching posts', 'error');
        
        // Restore button
        if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
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
        
        // Get total matching posts from the total results display
        const totalResultsEl = document.getElementById(ELEMENT_IDS.POSTS_TOTAL_RESULTS);
        let totalMatchingPosts = state.allPosts.length;
        
        if (totalResultsEl && totalResultsEl.textContent) {
            // Extract number from "Total: 1,234 posts"
            const match = totalResultsEl.textContent.match(/Total:\s*([\d,]+)/);
            if (match) {
                totalMatchingPosts = parseInt(match[1].replace(/,/g, ''));
            }
        }
        
        if (count < totalMatchingPosts && count > 0) {
            selectAllGlobalBtn.style.display = 'inline-block';
            selectAllGlobalBtn.textContent = `✓✓ Select All Matching (${totalMatchingPosts.toLocaleString()} total)`;
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

// Filter helper functions - FIXED to use proper field prefixes

function filterByTag(tag) {
    const input = document.getElementById('postsSearchInput');
    input.value = `tag:${tag}`;
    state.postsSearch = `tag:${tag}`;
    state.postsPage = 1;
    loadPosts();
}

function filterByOwner(owner) {
    const input = document.getElementById('postsSearchInput');
    input.value = `owner:${owner}`;
    state.postsSearch = `owner:${owner}`;
    state.postsPage = 1;
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
    
    const randomBtn = document.getElementById('randomPageBtn');
    if (randomBtn) {
        randomBtn.addEventListener('click', () => {
            let randomPage;
            if (totalPages > 1) {
                do {
                    randomPage = Math.floor(Math.random() * totalPages) + 1;
                } while (randomPage === currentPage && totalPages > 1);
            } else {
                randomPage = 1;
            }
            
            state.postsPage = randomPage;
            loadPosts();
            
            // Visual feedback
            randomBtn.style.transform = 'rotate(720deg)';
            setTimeout(() => {
                randomBtn.style.transform = '';
            }, 500);
        });
    }
}

/**
 * Show metadata indicators in UI (optional enhancement)
 */
export function showMetadataIndicators(searchQuery) {
    const metadata = extractMetadata(searchQuery);
    const searchInput = document.getElementById('postsSearchInput');
    
    if (!searchInput) return;
    
    // Remove existing indicators
    const existingIndicator = document.querySelector('.metadata-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    // Create indicator if metadata present
    if (metadata.sort || metadata.perPage) {
        const indicator = document.createElement('div');
        indicator.className = 'metadata-indicator';
        
        const parts = [];
        if (metadata.sort) {
            const orderIcon = metadata.order === 'asc' ? '↑' : metadata.order === 'desc' ? '↓' : '';
            parts.push(`Sort: ${metadata.sort}${orderIcon}`);
        }
        if (metadata.perPage) {
            parts.push(`${metadata.perPage}/page`);
        }
        
        indicator.innerHTML = `<small>🔧 ${parts.join(' • ')}</small>`;
        indicator.style.cssText = `
            position: absolute;
            bottom: -20px;
            left: 0;
            font-size: 11px;
            color: var(--accent);
            background: var(--bg-main);
            padding: 2px 8px;
            border-radius: 4px;
            border: 1px solid var(--border-main);
        `;
        
        searchInput.parentElement.style.position = 'relative';
        searchInput.parentElement.appendChild(indicator);
    }
}

function refreshCurrentPage() {
    loadPosts(false);
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
    toggleSortOrder,
    fetchVideoDuration,
    updateVideoDurationBadges
};