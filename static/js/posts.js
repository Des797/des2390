// Post Rendering
function renderPost(post) {
    const isVideo = ['.mp4', '.webm'].includes(post.file_type);
    const mediaUrl = post.status === 'pending' ? 
        `/temp/${post.id}${post.file_type}` : 
        `/saved/${post.date_folder}/${post.id}${post.file_type}`;
    
    const isSelected = state.selectedPosts.has(post.id);
    
    const mediaHtml = isVideo ? 
        `<video src="${mediaUrl}"></video><div class="video-overlay"></div>` :
        `<img src="${mediaUrl}" alt="Post ${post.id}" loading="lazy">`;
    
    const titleHtml = post.title ? `<div class="gallery-item-title">${post.title}</div>` : '';
    const ownerHtml = `<div class="gallery-item-owner" data-owner="${post.owner}">${post.owner}</div>`;
    
    // Tags with counts
    const tagsPreview = post.tags.slice(0, 5).map(t => {
        const tagWithCount = getTagWithCount(t, state.tagCounts);
        return `<span class="tag" data-tag="${t}">${tagWithCount}</span>`;
    }).join('');
    const expandBtn = post.tags.length > 5 ? 
        `<span style="cursor:pointer;color:#10b981" class="expand-tags">+${post.tags.length - 5} more</span>` : '';
    
    // Status badge
    const statusBadge = post.status === 'pending' ? 
        '<span style="background:#f59e0b;color:white;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:600;">PENDING</span>' :
        '<span style="background:#10b981;color:white;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:600;">SAVED</span>';
    
    const actions = post.status === 'pending' ? 
        `<button class="btn-success save-btn" data-id="${post.id}">💾 Save</button>
         <button class="btn-secondary discard-btn" data-id="${post.id}">🗑️ Discard</button>
         <button class="btn-primary view-r34-btn" data-id="${post.id}">🔗 View</button>` :
        `<button class="btn-primary view-btn" data-id="${post.id}">👁️ View</button>
         <button class="btn-primary view-r34-btn" data-id="${post.id}">🔗 R34</button>
         <button class="btn-danger delete-btn" data-id="${post.id}" data-folder="${post.date_folder}">🗑️ Delete</button>`;
    
    return `
        <div class="gallery-item ${isSelected ? 'selected' : ''}" data-post-id="${post.id}" data-status="${post.status}">
            <div class="gallery-item-media">
                <div class="select-checkbox ${isSelected ? 'checked' : ''}" data-id="${post.id}"></div>
                <div class="media-wrapper" data-id="${post.id}">${mediaHtml}</div>
            </div>
            <div class="gallery-item-info">
                ${titleHtml}${ownerHtml}
                <div class="gallery-item-id">ID: ${post.id} • ${post.width}×${post.height} • Score: ${post.score} • ${statusBadge}</div>
                <div class="gallery-item-tags" data-all-tags='${JSON.stringify(post.tags)}'>${tagsPreview}${expandBtn}</div>
                <div class="gallery-item-actions">${actions}</div>
            </div>
        </div>`;
}// Posts Management
import { state, updateURLState } from './state.js';
import { showNotification, getTagWithCount, applySearchFilter } from './utils.js';
import { loadPosts as apiLoadPosts, savePost as apiSavePost, discardPost as apiDiscardPost, deletePost as apiDeletePost, getPostSize, loadTagCounts } from './api.js';
import { renderPost, renderPagination, renderEmptyState } from './posts_renderer.js';
import { attachPostEventListeners } from './event_handlers.js';

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
        
        const sortBy = document.getElementById('postsSort').value;
        const perPage = parseInt(document.getElementById('postsPerPage').value);
        const searchQuery = state.postsSearch;
        
        posts = applySearchFilter(posts, searchQuery);
        posts = await sortPosts(posts, sortBy);
        state.allPosts = posts;
        
        const start = (state.postsPage - 1) * perPage;
        const end = start + perPage;
        const pagePosts = posts.slice(start, end);
        
        const grid = document.getElementById('postsGrid');
        if (pagePosts.length === 0) {
            grid.innerHTML = renderEmptyState('No posts');
        } else {
            grid.innerHTML = pagePosts.map(p => renderPost(p)).join('');
            attachPostEventListeners();
        }
        
        document.getElementById('postsTotalResults').textContent = `Total: ${posts.length} posts`;
        const paginationHtml = renderPagination(posts.length, perPage, state.postsPage);
        const container = document.getElementById('postsPagination');
        container.innerHTML = paginationHtml;
        
        // Attach pagination listeners
        container.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                state.postsPage = parseInt(btn.dataset.page);
                loadPosts();
            });
        });
        
        updateBulkControls();
        
        // Update URL with current state
        if (updateURL) {
            updateURLState({
                tab: 'posts',
                page: state.postsPage,
                filter: state.postsStatusFilter,
                search: searchQuery,
                sort: sortBy
            });
        }
    } catch (error) {
        showNotification('Failed to load posts', 'error');
    }
}

// Event Listeners are now in event_handlers.js

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
function toggleSelection(postId) {
    if (state.selectedPosts.has(postId)) {
        state.selectedPosts.delete(postId);
    } else {
        state.selectedPosts.add(postId);
    }
    
    const item = document.querySelector(`.gallery-item[data-post-id="${postId}"]`);
    const checkbox = item.querySelector('.select-checkbox');
    
    if (state.selectedPosts.has(postId)) {
        item.classList.add('selected');
        checkbox.classList.add('checked');
    } else {
        item.classList.remove('selected');
        checkbox.classList.remove('checked');
    }
    
    updateBulkControls();
}

function clearSelection() {
    state.selectedPosts.clear();
    
    document.querySelectorAll('.gallery-item.selected').forEach(item => {
        item.classList.remove('selected');
        item.querySelector('.select-checkbox').classList.remove('checked');
    });
    
    updateBulkControls();
}

function updateBulkControls() {
    const count = state.selectedPosts.size;
    const controls = document.getElementById('postsBulkControls');
    const countSpan = document.getElementById('postsSelectionCount');
    
    // Show/hide action buttons based on selection
    const saveBtn = document.getElementById('bulkSavePosts');
    const discardBtn = document.getElementById('bulkDiscardPosts');
    const deleteBtn = document.getElementById('bulkDeletePosts');
    
    if (count > 0) {
        controls.style.display = 'block';
        countSpan.textContent = `${count} selected`;
        
        // Check if any selected posts are pending or saved
        const selectedPosts = Array.from(state.selectedPosts).map(id => {
            return state.allPosts.find(p => p.id === id);
        }).filter(p => p);
        
        const hasPending = selectedPosts.some(p => p.status === 'pending');
        const hasSaved = selectedPosts.some(p => p.status === 'saved');
        
        saveBtn.style.display = hasPending ? 'inline-block' : 'none';
        discardBtn.style.display = hasPending ? 'inline-block' : 'none';
        deleteBtn.style.display = hasSaved ? 'inline-block' : 'none';
    } else {
        controls.style.display = 'none';
    }
}

// Filter Management
function filterByTag(tag) {
    const input = document.getElementById('postsSearchInput');
    input.value = tag;
    state.postsSearch = tag;
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

// Pagination is now handled in renderPagination() from posts_renderer.js

export {
    loadPosts,
    clearSelection,
    filterByTag,
    filterByOwner,
    savePostAction,
    discardPostAction,
    deletePostAction,
    toggleSelection
};