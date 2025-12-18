// Posts Management
import { state, updateURLState } from './state.js';
import { showNotification, applySearchFilter } from './utils.js';
import { loadPosts as apiLoadPosts, loadPostsStreaming, savePost as apiSavePost, discardPost as apiDiscardPost, deletePost as apiDeletePost, getPostSize, loadTagCounts } from './api.js';
import { renderPost, renderPaginationButtons, setupVideoPreviewListeners } from './posts_renderer.js';
import { attachPostEventListeners, setupPaginationListeners, setupMediaErrorHandlers } from './event_handlers.js';
import { ELEMENT_IDS, URL_PARAMS, POST_STATUS, CSS_CLASSES, PAGINATION, SORT_ORDER } from './constants.js';

window.setupVideoPreviewListeners = setupVideoPreviewListeners; 

// Sorting Functions
// Sorting Functions with optimized size fetching
async function sortPosts(posts, sortBy, order) {
    // For size sorting, fetch sizes in batches with rate limiting
    if (sortBy === 'size') {
        const grid = document.getElementById(ELEMENT_IDS.POSTS_GRID);
        const needsFetching = posts.filter(p => !state.postSizes[p.id]);
        
        if (needsFetching.length > 0) {
            console.log(`Fetching sizes for ${needsFetching.length} posts...`);
            
            // Batch requests: 10 at a time to avoid overwhelming server
            const BATCH_SIZE = 10;
            let fetched = 0;
            
            for (let i = 0; i < needsFetching.length; i += BATCH_SIZE) {
                const batch = needsFetching.slice(i, i + BATCH_SIZE);
                
                await Promise.all(batch.map(async p => {
                    try {
                        const result = await getPostSize(p.id);
                        state.postSizes[p.id] = result.size;
                        fetched++;
                        
                        // Update progress every batch
                        if (needsFetching.length > 20) {
                            const percent = Math.round((fetched / needsFetching.length) * 100);
                            grid.innerHTML = `<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ Calculating file sizes: ${fetched}/${needsFetching.length} (${percent}%)<br><span style="font-size: 14px; color: #94a3b8;">This may take a while</span></p>`;
                        }
                    } catch (e) {
                        state.postSizes[p.id] = 0;
                    }
                }));
                
                // Small delay between batches
                if (i + BATCH_SIZE < needsFetching.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            console.log(`Finished fetching ${fetched} file sizes`);
        }
    }
    
    // Use cached comparison function for better performance
    const compareFn = createComparator(sortBy, order);
    return posts.sort(compareFn);
}

// Create optimized comparator function
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

// Optimized rendering: single DOM update instead of batches
async function renderPostsOptimized(grid, posts, sortBy, searchQuery) {
    grid.innerHTML = ''; // Clear
    
    // Build all HTML at once (faster than insertAdjacentHTML in loop)
    const allHtml = posts.map(p => renderPost(p, sortBy, searchQuery)).join('');
    grid.innerHTML = allHtml;
    
    // Attach event listeners in one pass
    attachPostEventListeners();
    setupMediaErrorHandlers();
    
    // Setup videos on next frame to avoid blocking
    requestAnimationFrame(() => {
        setupVideoPreviewListeners();
    });
}

// Load Posts
async function loadPosts(updateURL = true) {
    const grid = document.getElementById(ELEMENT_IDS.POSTS_GRID);
    const startTime = Date.now();
    
    try {
        // Stage 1: Loading tag counts
        grid.innerHTML = '<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ Loading tag counts...</p>';
        state.tagCounts = await loadTagCounts();
        
        // Stage 2: Loading posts from server WITH PROGRESS
        grid.innerHTML = '<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ Loading posts from database...<br><span style="font-size: 14px; color: #94a3b8;">0 posts loaded</span></p>';
        
        let posts;
        
        // Try to use streaming API if available
        try {
            if (window.EventSource) {
                posts = await loadPostsStreaming(state.postsStatusFilter, (progress) => {
                    if (progress.type === 'status') {
                        grid.innerHTML = `<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ ${progress.message}</p>`;
                    } else if (progress.type === 'progress') {
                        grid.innerHTML = `<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ Loading posts from database...<br><span style="font-size: 14px; color: #94a3b8;">${progress.loaded} / ${progress.total} posts loaded (${progress.percent}%)</span></p>`;
                    }
                });
            } else {
                // Browser doesn't support EventSource, use regular API
                console.log('EventSource not supported, using regular API');
                posts = await apiLoadPosts(state.postsStatusFilter);
            }
        } catch (streamError) {
            // Streaming failed, fallback to regular API
            console.warn('Streaming failed, falling back to regular API:', streamError);
            posts = await apiLoadPosts(state.postsStatusFilter);
        }
        
        const loadTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`Loaded ${posts.length} posts in ${loadTime}s`);
        
        // Stage 3: Processing posts
        grid.innerHTML = '<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ Processing posts...</p>';
        
        // Fix missing file_type in older posts
        posts = posts.map(post => {
            if (!post.file_type) {
                // Try to infer from file_url or file_path
                const url = post.file_url || post.file_path || '';
                const match = url.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm)$/i);
                post.file_type = match ? `.${match[1].toLowerCase()}` : '.jpg';
            }
            return post;
        });
        
        const sortBy = state.postsSortBy;
        const order = state.postsSortOrder;
        let perPage = parseInt(document.getElementById(ELEMENT_IDS.POSTS_PER_PAGE).value);
        
        // Validate perPage
        if (isNaN(perPage) || perPage < PAGINATION.MIN_PER_PAGE) {
            perPage = PAGINATION.MIN_PER_PAGE;
            document.getElementById(ELEMENT_IDS.POSTS_PER_PAGE).value = perPage;
        } else if (perPage > PAGINATION.MAX_PER_PAGE) {
            perPage = PAGINATION.MAX_PER_PAGE;
            document.getElementById(ELEMENT_IDS.POSTS_PER_PAGE).value = perPage;
        }
        
        const searchQuery = state.postsSearch;
        
        // Stage 4: Filtering
        if (searchQuery) {
            grid.innerHTML = `<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ Filtering ${posts.length} posts...</p>`;
        }
        posts = applySearchFilter(posts, searchQuery);
        
        // Stage 5: Sorting (with special message for size sorting)
        if (sortBy === 'size') {
            grid.innerHTML = `<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ Calculating file sizes for ${posts.length} posts...<br><span style="font-size: 14px; color: #94a3b8;">This may take a while</span></p>`;
        } else if (posts.length > 100) {
            grid.innerHTML = `<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ Sorting ${posts.length} posts...</p>`;
        }
        
        posts = await sortPosts(posts, sortBy, order);
        state.allPosts = posts;
        
        const start = (state.postsPage - 1) * perPage;
        const end = start + perPage;
        const pagePosts = posts.slice(start, end);
        
        if (pagePosts.length === 0) {
            grid.innerHTML = '<p style="color: #64748b; text-align: center; grid-column: 1/-1;">No posts</p>';
        } else {
            // Stage 6: Rendering
            grid.innerHTML = `<p style="color: #10b981; text-align: center; grid-column: 1/-1; font-size: 18px;">⏳ Rendering ${pagePosts.length} posts...</p>`;
            await renderPostsProgressively(grid, pagePosts, sortBy, searchQuery);
        }
        
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`Total load time: ${totalTime}s`);
        
        document.getElementById(ELEMENT_IDS.POSTS_TOTAL_RESULTS).textContent = `Total: ${posts.length} posts`;
        renderPagination(posts.length, perPage, state.postsPage);
        updateBulkControls();
        updateSortOrderButton();
        
        // Update URL with current state
        if (updateURL) {
            updateURLState({
                [URL_PARAMS.TAB]: 'posts',
                [URL_PARAMS.PAGE]: state.postsPage,
                [URL_PARAMS.FILTER]: state.postsStatusFilter,
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

// Update sort order button appearance
function updateSortOrderButton() {
    const btn = document.getElementById(ELEMENT_IDS.POSTS_SORT_ORDER);
    if (btn) {
        btn.textContent = state.postsSortOrder === SORT_ORDER.ASC ? '↑' : '↓';
        btn.title = state.postsSortOrder === SORT_ORDER.ASC ? 'Ascending (click for descending)' : 'Descending (click for ascending)';
    }
}

// Toggle sort order
function toggleSortOrder() {
    state.postsSortOrder = state.postsSortOrder === SORT_ORDER.ASC ? SORT_ORDER.DESC : SORT_ORDER.ASC;
    state.postsPage = 1; // Reset to first page when changing sort
    loadPosts();
}

// Post Actions
async function savePostAction(postId) {
    try {
        await apiSavePost(postId);
        showNotification('Post saved');
        await loadPosts();
    } catch (error) {
        showNotification('Failed to save post', 'error');
    }
}

async function discardPostAction(postId) {
    try {
        await apiDiscardPost(postId);
        showNotification('Post discarded');
        await loadPosts();
    } catch (error) {
        showNotification('Failed to discard post', 'error');
    }
}

async function deletePostAction(postId, dateFolder) {
    try {
        await apiDeletePost(postId, dateFolder);
        showNotification('Post deleted');
        await loadPosts();
    } catch (error) {
        showNotification('Failed to delete post', 'error');
    }
}

// Selection Management
function clearSelection() {
    state.selectedPosts.clear();
    
    document.querySelectorAll(`.${CSS_CLASSES.GALLERY_ITEM}.${CSS_CLASSES.SELECTED}`).forEach(item => {
        item.classList.remove(CSS_CLASSES.SELECTED);
        item.querySelector(`.${CSS_CLASSES.SELECT_CHECKBOX}`).classList.remove(CSS_CLASSES.CHECKED);
    });
    
    updateBulkControls();
}

function selectAllOnPage() {
    // Select all posts currently visible on the page
    document.querySelectorAll(`.${CSS_CLASSES.GALLERY_ITEM}`).forEach(item => {
        const postId = parseInt(item.dataset.postId);
        state.selectedPosts.add(postId);
        item.classList.add(CSS_CLASSES.SELECTED);
        item.querySelector(`.${CSS_CLASSES.SELECT_CHECKBOX}`).classList.add(CSS_CLASSES.CHECKED);
    });
    
    updateBulkControls();
}

function selectAllMatching() {
    // Select all posts that match current filters across all pages
    state.allPosts.forEach(post => {
        state.selectedPosts.add(post.id);
    });
    
    // Update UI for currently visible posts
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
    // Get all posts currently on the page
    const pagePostIds = new Set();
    document.querySelectorAll(`.${CSS_CLASSES.GALLERY_ITEM}`).forEach(item => {
        pagePostIds.add(parseInt(item.dataset.postId));
    });
    
    // Invert selection
    pagePostIds.forEach(postId => {
        if (state.selectedPosts.has(postId)) {
            state.selectedPosts.delete(postId);
        } else {
            state.selectedPosts.add(postId);
        }
    });
    
    // Update UI
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
    
    // Show/hide action buttons based on selection
    const saveBtn = document.getElementById(ELEMENT_IDS.BULK_SAVE_POSTS);
    const discardBtn = document.getElementById(ELEMENT_IDS.BULK_DISCARD_POSTS);
    const deleteBtn = document.getElementById(ELEMENT_IDS.BULK_DELETE_POSTS);
    
    if (count > 0) {
        controls.style.display = 'block';
        countSpan.textContent = `${count} selected`;
        
        // Show "Select All Matching" button if not all are selected
        const totalMatchingPosts = state.allPosts.length;
        if (count < totalMatchingPosts && count > 0) {
            selectAllGlobalBtn.style.display = 'inline-block';
            selectAllGlobalBtn.textContent = `✓✓ Select All Matching (${totalMatchingPosts} total)`;
        } else {
            selectAllGlobalBtn.style.display = 'none';
        }
        
        // Check if any selected posts are pending or saved
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

// Filter Management
function filterByTag(tag) {
    const input = document.getElementById(ELEMENT_IDS.POSTS_SEARCH_INPUT);
    input.value = tag;
    state.postsSearch = tag;
    state.postsPage = 1;
    loadPosts();
}

function filterByOwner(owner) {
    const input = document.getElementById(ELEMENT_IDS.POSTS_SEARCH_INPUT);
    input.value = `owner:${owner}`;
    state.postsSearch = `owner:${owner}`;
    state.postsPage = 1;
    loadPosts();
}

function performSearch() {
    const input = document.getElementById(ELEMENT_IDS.POSTS_SEARCH_INPUT);
    state.postsSearch = input.value;
    state.postsPage = 1;
    loadPosts();
}

// Pagination
function renderPagination(total, perPage, currentPage) {
    const totalPages = Math.ceil(total / perPage);
    const container = document.getElementById(ELEMENT_IDS.POSTS_PAGINATION);
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = renderPaginationButtons(currentPage, totalPages);
    
    // Setup regular pagination buttons
    setupPaginationListeners(ELEMENT_IDS.POSTS_PAGINATION, (page) => {
        state.postsPage = page;
        loadPosts();
    });
    
    // Setup go-to-page button
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
        
        // Also allow Enter key
        gotoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                gotoBtn.click();
            }
        });
    }
}

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