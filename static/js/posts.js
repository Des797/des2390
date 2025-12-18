// Posts Management - FULLY OPTIMIZED
import { state, updateURLState } from './state.js';
import { showNotification, applySearchFilter } from './utils.js';
import { loadPosts as apiLoadPosts, loadPostsStreaming, savePost as apiSavePost, discardPost as apiDiscardPost, deletePost as apiDeletePost, getPostSize, loadTagCounts } from './api.js';
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
    const grid = document.getElementById(ELEMENT_IDS.POSTS_GRID);
    const startTime = Date.now();
    
    try {
        // Load tag counts if needed
        if (!state.tagCounts || Object.keys(state.tagCounts).length === 0) {
            grid.innerHTML = '<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ Loading tag counts...</p>';
            state.tagCounts = await loadTagCounts();
        }
        
        // Check for status: operator in search
        const searchQuery = state.postsSearch;
        const { status: statusFromSearch, cleanedQuery } = extractStatusOperator(searchQuery);
        
        // Apply status from search or use filter
        const effectiveStatus = statusFromSearch || state.postsStatusFilter;
        
        // Disable filter dropdown if status: in search
        const filterDropdown = document.getElementById(ELEMENT_IDS.POSTS_STATUS_FILTER);
        if (statusFromSearch) {
            filterDropdown.disabled = true;
            filterDropdown.style.opacity = '0.5';
            filterDropdown.title = 'Status filter overridden by search query';
        } else {
            filterDropdown.disabled = false;
            filterDropdown.style.opacity = '1';
            filterDropdown.title = '';
        }
        
        // Clear search error display
        hideSearchError();
        
        // Load posts
        grid.innerHTML = '<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ Loading posts...</p>';
        
        let posts;
        try {
            if (window.EventSource) {
                posts = await loadPostsStreaming(effectiveStatus, (progress) => {
                    if (progress.type === 'status') {
                        grid.innerHTML = `<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ ${progress.message}</p>`;
                    } else if (progress.type === 'progress') {
                        grid.innerHTML = `<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ Loading posts...<br><span style="font-size: 14px; color: #94a3b8;">${progress.loaded} / ${progress.total} (${progress.percent}%)</span></p>`;
                    }
                });
            } else {
                posts = await apiLoadPosts(effectiveStatus);
            }
        } catch (streamError) {
            console.warn('Streaming failed:', streamError);
            posts = await apiLoadPosts(effectiveStatus);
        }
        
        const loadTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`Loaded ${posts.length} posts in ${loadTime}s`);
        
        // Fix missing file_type
        posts = posts.map(post => {
            if (!post.file_type) {
                const url = post.file_url || post.file_path || '';
                const match = url.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm)$/i);
                post.file_type = match ? `.${match[1].toLowerCase()}` : '.jpg';
            }
            return post;
        });
        
        const sortBy = state.postsSortBy;
        const order = state.postsSortOrder;
        let perPage = parseInt(document.getElementById(ELEMENT_IDS.POSTS_PER_PAGE).value);
        
        if (isNaN(perPage) || perPage < PAGINATION.MIN_PER_PAGE) {
            perPage = PAGINATION.MIN_PER_PAGE;
            document.getElementById(ELEMENT_IDS.POSTS_PER_PAGE).value = perPage;
        } else if (perPage > PAGINATION.MAX_PER_PAGE) {
            perPage = PAGINATION.MAX_PER_PAGE;
            document.getElementById(ELEMENT_IDS.POSTS_PER_PAGE).value = perPage;
        }
        
        // Apply search filter (using cleaned query without status:)
        if (cleanedQuery) {
            grid.innerHTML = `<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ Filtering ${posts.length} posts...</p>`;
            const filterResult = applySearchFilterWithErrors(posts, cleanedQuery);
            posts = filterResult.posts;
            
            // Show errors if any
            if (filterResult.errors.length > 0) {
                showSearchError(filterResult.errors.join(', '));
            }
        }
        
        // Sort
        if (sortBy === 'size' || posts.length > 100) {
            grid.innerHTML = `<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ Sorting ${posts.length} posts...</p>`;
        }
        
        posts = await sortPosts(posts, sortBy, order);
        state.allPosts = posts;
        
        rebuildModalIndexCache();
        
        const start = (state.postsPage - 1) * perPage;
        const end = start + perPage;
        const pagePosts = posts.slice(start, end);
        
        if (pagePosts.length === 0) {
            destroyVirtualScroll();
            grid.innerHTML = '<p style="color: #64748b; text-align: center; grid-column: 1/-1;">No posts</p>';
        } else {
            const useVirtual = useVirtualScroll(pagePosts, grid, sortBy, cleanedQuery);
            
            if (!useVirtual) {
                grid.innerHTML = `<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ Rendering ${pagePosts.length} posts...</p>`;
                await renderPostsOptimized(grid, pagePosts, sortBy, cleanedQuery);
            }
        }
        
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`Total load time: ${totalTime}s`);
        
        document.getElementById(ELEMENT_IDS.POSTS_TOTAL_RESULTS).textContent = `Total: ${posts.length} posts`;
        renderPagination(posts.length, perPage, state.postsPage);
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
    } catch (error) {
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        showNotification('Failed to load posts', 'error');
        console.error(`Load failed after ${totalTime}s:`, error);
        grid.innerHTML = '<p style="color: #ef4444; text-align: center; grid-column: 1/-1;">Failed to load posts</p>';
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

// Show search error below search bar
function showSearchError(message) {
    let errorDiv = document.getElementById('searchErrorDisplay');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'searchErrorDisplay';
        errorDiv.style.cssText = `
            background: #7f1d1d;
            color: #fecaca;
            padding: 12px;
            border-radius: 6px;
            margin-top: 10px;
            font-size: 13px;
            border: 1px solid #991b1b;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        
        const searchInput = document.getElementById(ELEMENT_IDS.POSTS_SEARCH_INPUT);
        searchInput.parentElement.appendChild(errorDiv);
    }
    
    errorDiv.innerHTML = `<strong>⚠️ Search Error:</strong> ${message}`;
    errorDiv.style.display = 'flex';
}

function hideSearchError() {
    const errorDiv = document.getElementById('searchErrorDisplay');
    if (errorDiv) {
        errorDiv.style.display = 'none';
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
        
        // Remove from display if filtering
        if (state.postsStatusFilter === 'pending') {
            const postEl = document.querySelector(`[data-post-id="${postId}"]`);
            if (postEl) {
                postEl.style.transition = 'opacity 0.3s';
                postEl.style.opacity = '0';
                setTimeout(() => postEl.remove(), 300);
            }
        }
        
        searchCache.clear();
    } catch (error) {
        showNotification('Failed to save post', 'error');
    }
}

async function discardPostAction(postId) {
    try {
        await apiDiscardPost(postId);
        showNotification('Post discarded');
        
        // Remove from state
        state.allPosts = state.allPosts.filter(p => p.id !== postId);
        
        // Remove from display with animation
        const postEl = document.querySelector(`[data-post-id="${postId}"]`);
        if (postEl) {
            postEl.style.transition = 'opacity 0.3s, transform 0.3s';
            postEl.style.opacity = '0';
            postEl.style.transform = 'scale(0.8)';
            setTimeout(() => postEl.remove(), 300);
        }
        
        searchCache.clear();
        rebuildModalIndexCache();
    } catch (error) {
        showNotification('Failed to discard post', 'error');
    }
}

async function deletePostAction(postId, dateFolder) {
    try {
        await apiDeletePost(postId, dateFolder);
        showNotification('Post deleted');
        
        // Remove from state
        state.allPosts = state.allPosts.filter(p => p.id !== postId);
        
        // Remove from display with animation
        const postEl = document.querySelector(`[data-post-id="${postId}"]`);
        if (postEl) {
            postEl.style.transition = 'opacity 0.3s, transform 0.3s';
            postEl.style.opacity = '0';
            postEl.style.transform = 'scale(0.8)';
            setTimeout(() => postEl.remove(), 300);
        }
        
        searchCache.clear();
        rebuildModalIndexCache();
    } catch (error) {
        showNotification('Failed to delete post', 'error');
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
    updateBulkControls,
    toggleSortOrder
};