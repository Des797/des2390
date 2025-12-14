// Posts Management
import { state, updateURLState } from './state.js';
import { showNotification, applySearchFilter } from './utils.js';
import { loadPosts as apiLoadPosts, savePost as apiSavePost, discardPost as apiDiscardPost, deletePost as apiDeletePost, getPostSize, loadTagCounts } from './api.js';
import { renderPost, renderPaginationButtons } from './posts_renderer.js';
import { attachPostEventListeners, setupPaginationListeners } from './event_handlers.js';
import { ELEMENT_IDS, URL_PARAMS, POST_STATUS, CSS_CLASSES } from './constants.js';

// Sorting Functions
async function sortPosts(posts, sortBy) {
    const [field, order] = sortBy.split('-');
    
    // For size sorting, fetch sizes first
    if (field === 'size') {
        await Promise.all(posts.map(async p => {
            if (!state.postSizes[p.id]) {
                const result = await getPostSize(p.id);
                state.postSizes[p.id] = result.size;
            }
        }));
    }
    
    return posts.sort((a, b) => {
        let valA, valB;
        
        switch(field) {
            case 'download':
                valA = new Date(a.downloaded_at || a.timestamp);
                valB = new Date(b.downloaded_at || b.timestamp);
                break;
            case 'upload':
                valA = parseInt(a.created_at || a.change || 0);
                valB = parseInt(b.created_at || b.change || 0);
                break;
            case 'id':
                valA = a.id;
                valB = b.id;
                break;
            case 'score':
                valA = a.score || 0;
                valB = b.score || 0;
                break;
            case 'tags':
                valA = a.tags.length;
                valB = b.tags.length;
                break;
            case 'size':
                valA = state.postSizes[a.id] || 0;
                valB = state.postSizes[b.id] || 0;
                break;
            default:
                valA = a.timestamp;
                valB = b.timestamp;
        }
        
        return order === 'asc' ? valA - valB : valB - valA;
    });
}

// Load Posts
async function loadPosts(updateURL = true) {
    try {
        // Reload tag counts
        state.tagCounts = await loadTagCounts();
        
        // Load posts based on filter
        let posts = await apiLoadPosts(state.postsStatusFilter);
        
        const sortBy = document.getElementById(ELEMENT_IDS.POSTS_SORT).value;
        const perPage = parseInt(document.getElementById(ELEMENT_IDS.POSTS_PER_PAGE).value);
        const searchQuery = state.postsSearch;
        
        posts = applySearchFilter(posts, searchQuery);
        posts = await sortPosts(posts, sortBy);
        state.allPosts = posts;
        
        const start = (state.postsPage - 1) * perPage;
        const end = start + perPage;
        const pagePosts = posts.slice(start, end);
        
        const grid = document.getElementById(ELEMENT_IDS.POSTS_GRID);
        if (pagePosts.length === 0) {
            grid.innerHTML = '<p style="color: #64748b; text-align: center; grid-column: 1/-1;">No posts</p>';
        } else {
            grid.innerHTML = pagePosts.map(p => renderPost(p)).join('');
            attachPostEventListeners();
        }
        
        document.getElementById(ELEMENT_IDS.POSTS_TOTAL_RESULTS).textContent = `Total: ${posts.length} posts`;
        renderPagination(posts.length, perPage, state.postsPage);
        updateBulkControls();
        
        // Update URL with current state
        if (updateURL) {
            updateURLState({
                [URL_PARAMS.TAB]: 'posts',
                [URL_PARAMS.PAGE]: state.postsPage,
                [URL_PARAMS.FILTER]: state.postsStatusFilter,
                [URL_PARAMS.SEARCH]: searchQuery,
                [URL_PARAMS.SORT]: sortBy
            });
        }
    } catch (error) {
        showNotification('Failed to load posts', 'error');
    }
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

function updateBulkControls() {
    const count = state.selectedPosts.size;
    const controls = document.getElementById(ELEMENT_IDS.POSTS_BULK_CONTROLS);
    const countSpan = document.getElementById(ELEMENT_IDS.POSTS_SELECTION_COUNT);
    
    // Show/hide action buttons based on selection
    const saveBtn = document.getElementById(ELEMENT_IDS.BULK_SAVE_POSTS);
    const discardBtn = document.getElementById(ELEMENT_IDS.BULK_DISCARD_POSTS);
    const deleteBtn = document.getElementById(ELEMENT_IDS.BULK_DELETE_POSTS);
    
    if (count > 0) {
        controls.style.display = 'block';
        countSpan.textContent = `${count} selected`;
        
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

// Pagination
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
}

export {
    loadPosts,
    clearSelection,
    filterByTag,
    filterByOwner,
    savePostAction,
    discardPostAction,
    deletePostAction,
    updateBulkControls
};