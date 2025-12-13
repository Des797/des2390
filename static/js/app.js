// Global State
const state = {
    currentTab: 'scraper',
    blacklist: [],
    searchHistory: [],
    pendingPosts: [],
    savedPosts: [],
    pendingPage: 1,
    savedPage: 1,
    tagHistoryPage: 1,
    pendingFilter: null,
    savedFilter: null,
    pendingSearch: '',
    savedSearch: '',
    currentModalIndex: -1,
    currentModalSource: 'pending',
    selectedPending: new Set(),
    selectedSaved: new Set(),
    bulkOperationActive: false,
    postSizes: {},
    isOnline: true
};

// Make state globally accessible
window.appState = state;

// Utility Functions
function showNotification(message, type = 'success') {
    if (window.utils && window.utils.showNotification) {
        window.utils.showNotification(message, type);
    } else {
        const notification = document.getElementById('notification');
        const text = document.getElementById('notificationText');
        
        notification.className = 'notification show';
        if (type === 'error') notification.classList.add('error');
        if (type === 'warning') notification.classList.add('warning');
        
        text.textContent = message;
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(timestamp) {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// API Calls
async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(endpoint, options);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`API call failed: ${endpoint}`, error);
        throw error;
    }
}

// Config Management
async function loadConfig() {
    try {
        const config = await apiCall('/api/config');
        document.getElementById('userId').value = config.api_user_id || '';
        document.getElementById('apiKey').value = config.api_key || '';
        document.getElementById('tempPath').value = config.temp_path || '';
        document.getElementById('savePath').value = config.save_path || '';
        state.blacklist = config.blacklist || [];
        updateBlacklistDisplay();
    } catch (error) {
        showNotification('Failed to load config', 'error');
    }
}

async function saveConfig() {
    const config = {
        api_user_id: document.getElementById('userId').value,
        api_key: document.getElementById('apiKey').value,
        temp_path: document.getElementById('tempPath').value,
        save_path: document.getElementById('savePath').value,
        blacklist: state.blacklist
    };

    try {
        await apiCall('/api/config', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(config)
        });
        showNotification('Configuration saved');
    } catch (error) {
        showNotification('Failed to save config', 'error');
    }
}

// Search History
async function loadSearchHistory() {
    try {
        state.searchHistory = await apiCall('/api/search_history');
    } catch (error) {
        console.error('Failed to load search history:', error);
    }
}

function showSearchDropdown() {
    if (state.searchHistory.length === 0) return;
    const dropdown = document.getElementById('searchDropdown');
    dropdown.innerHTML = state.searchHistory.slice(0, 10).map(h => 
        `<div class="search-dropdown-item">${h.tags}</div>`
    ).join('');
    dropdown.classList.add('show');
    
    dropdown.querySelectorAll('.search-dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            document.getElementById('searchTags').value = item.textContent;
            dropdown.classList.remove('show');
        });
    });
}

function hideSearchDropdown() {
    setTimeout(() => {
        document.getElementById('searchDropdown').classList.remove('show');
    }, 200);
}

// Blacklist Management
function updateBlacklistDisplay() {
    const container = document.getElementById('blacklistTags');
    if (state.blacklist.length === 0) {
        container.innerHTML = '<span style="color: #64748b; font-size: 12px;">No blacklisted tags</span>';
        return;
    }
    container.innerHTML = state.blacklist.map(tag => `
        <div class="blacklist-tag">
            ${tag}
            <span data-tag="${tag}">×</span>
        </div>
    `).join('');
    
    container.querySelectorAll('span[data-tag]').forEach(span => {
        span.addEventListener('click', () => removeBlacklistTag(span.dataset.tag));
    });
}

function addBlacklistTags() {
    const input = document.getElementById('blacklistInput');
    const text = input.value.trim();
    if (!text) return;
    
    const tags = text.split(/[\s,]+/).filter(t => t.trim());
    let added = 0;
    
    tags.forEach(tag => {
        tag = tag.trim();
        if (tag && !state.blacklist.includes(tag)) {
            state.blacklist.push(tag);
            added++;
        }
    });
    
    if (added > 0) {
        input.value = '';
        updateBlacklistDisplay();
        saveConfig();
        showNotification(`Added ${added} tag(s) to blacklist`);
    }
}

function removeBlacklistTag(tag) {
    state.blacklist = state.blacklist.filter(t => t !== tag);
    updateBlacklistDisplay();
    saveConfig();
    showNotification(`Removed "${tag}" from blacklist`);
}

// Scraper Controls
async function startScraper() {
    const tags = document.getElementById('searchTags').value;
    try {
        await apiCall('/api/start', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({tags})
        });
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;
        showNotification('Scraper started');
        await loadSearchHistory();
    } catch (error) {
        showNotification(error.message || 'Failed to start scraper', 'error');
    }
}

async function stopScraper() {
    try {
        await apiCall('/api/stop', {method: 'POST'});
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
        showNotification('Scraper stopped');
    } catch (error) {
        showNotification('Failed to stop scraper', 'error');
    }
}

async function updateStatus() {
    try {
        const status = await apiCall('/api/status');
        
        document.getElementById('statProcessed').textContent = status.total_processed;
        document.getElementById('statSaved').textContent = status.total_saved;
        document.getElementById('statDiscarded').textContent = status.total_discarded;
        document.getElementById('statSkipped').textContent = status.total_skipped;
        document.getElementById('statRequests').textContent = status.requests_this_minute;
        document.getElementById('statPage').textContent = status.current_page;

        if (status.current_mode === 'newest' && !document.getElementById('modeAlert').classList.contains('show')) {
            const alert = document.getElementById('modeAlert');
            alert.textContent = '🔄 Search exhausted. Now scraping newest posts...';
            alert.classList.add('show');
            setTimeout(() => alert.classList.remove('show'), 5000);
        }

        if (status.storage_warning) {
            const alert = document.getElementById('storageAlert');
            alert.textContent = '⚠️ Low disk space! Scraper stopped.';
            alert.classList.add('show');
        }

        document.getElementById('startBtn').disabled = status.active;
        document.getElementById('stopBtn').disabled = !status.active;
    } catch (error) {
        console.error('Failed to update status:', error);
    }
}

// Advanced Search/Filter Parser
function parseSearchQuery(query) {
    const filters = {
        tags: [],
        owner: null,
        score_min: null,
        score_max: null,
        rating: null
    };
    
    const parts = query.split(/\s+/);
    
    for (const part of parts) {
        if (part.startsWith('owner:')) {
            filters.owner = part.substring(6);
        } else if (part.startsWith('score:')) {
            const scoreQuery = part.substring(6);
            const match = scoreQuery.match(/([<>=]+)?(\d+)/);
            if (match) {
                const operator = match[1] || '=';
                const value = parseInt(match[2]);
                if (operator.includes('>')) filters.score_min = value;
                if (operator.includes('<')) filters.score_max = value;
                if (operator === '=') {
                    filters.score_min = value;
                    filters.score_max = value;
                }
            }
        } else if (part.startsWith('rating:')) {
            filters.rating = part.substring(7);
        } else if (part) {
            filters.tags.push(part);
        }
    }
    
    return filters;
}

function applySearchFilter(posts, query) {
    if (!query.trim()) return posts;
    
    const filters = parseSearchQuery(query);
    
    return posts.filter(post => {
        // Tag filter
        if (filters.tags.length > 0) {
            const hasAllTags = filters.tags.every(tag => {
                if (tag.startsWith('-')) {
                    return !post.tags.some(t => t.includes(tag.substring(1)));
                }
                if (tag.includes('*')) {
                    const regex = new RegExp(tag.replace(/\*/g, '.*'));
                    return post.tags.some(t => regex.test(t));
                }
                return post.tags.includes(tag);
            });
            if (!hasAllTags) return false;
        }
        
        // Owner filter
        if (filters.owner && post.owner !== filters.owner) {
            return false;
        }
        
        // Score filter
        if (filters.score_min !== null && post.score < filters.score_min) {
            return false;
        }
        if (filters.score_max !== null && post.score > filters.score_max) {
            return false;
        }
        
        // Rating filter
        if (filters.rating && post.rating !== filters.rating) {
            return false;
        }
        
        return true;
    });
}

// Sorting Functions
async function getPostSize(postId) {
    if (state.postSizes[postId]) {
        return state.postSizes[postId];
    }
    
    try {
        const result = await apiCall(`/api/post/${postId}/size`);
        state.postSizes[postId] = result.size;
        return result.size;
    } catch {
        return 0;
    }
}

async function sortPosts(posts, sortBy) {
    const [field, order] = sortBy.split('-');
    
    // For size sorting, fetch sizes first
    if (field === 'size') {
        await Promise.all(posts.map(p => getPostSize(p.id)));
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

// Post Rendering
function renderPost(post, source) {
    const isVideo = ['.mp4', '.webm'].includes(post.file_type);
    const mediaUrl = source === 'pending' ? 
        `/temp/${post.id}${post.file_type}` : 
        `/saved/${post.date_folder}/${post.id}${post.file_type}`;
    
    const isSelected = source === 'pending' ? 
        state.selectedPending.has(post.id) : 
        state.selectedSaved.has(post.id);
    
    const mediaHtml = isVideo ? 
        `<video src="${mediaUrl}"></video><div class="video-overlay"></div>` :
        `<img src="${mediaUrl}" alt="Post ${post.id}" loading="lazy">`;
    
    const titleHtml = post.title ? `<div class="gallery-item-title">${post.title}</div>` : '';
    const ownerHtml = `<div class="gallery-item-owner" data-owner="${post.owner}">${post.owner}</div>`;
    
    const tagsPreview = post.tags.slice(0, 5).map(t => 
        `<span class="tag" data-tag="${t}">${t}</span>`
    ).join('');
    const expandBtn = post.tags.length > 5 ? 
        `<span style="cursor:pointer;color:#10b981" class="expand-tags">+${post.tags.length - 5} more</span>` : '';
    
    const actions = source === 'pending' ? 
        `<button class="btn-success save-btn" data-id="${post.id}">💾 Save</button>
         <button class="btn-secondary discard-btn" data-id="${post.id}">🗑️ Discard</button>
         <button class="btn-primary view-r34-btn" data-id="${post.id}">🔗 View</button>` :
        `<button class="btn-primary view-btn" data-id="${post.id}">👁️ View</button>
         <button class="btn-primary view-r34-btn" data-id="${post.id}">🔗 R34</button>
         <button class="btn-danger delete-btn" data-id="${post.id}">🗑️ Delete</button>`;
    
    return `
        <div class="gallery-item ${isSelected ? 'selected' : ''}" data-post-id="${post.id}">
            <div class="gallery-item-media">
                <div class="select-checkbox ${isSelected ? 'checked' : ''}" data-id="${post.id}"></div>
                <div class="media-wrapper" data-id="${post.id}">${mediaHtml}</div>
            </div>
            <div class="gallery-item-info">
                ${titleHtml}${ownerHtml}
                <div class="gallery-item-id">ID: ${post.id} • ${post.width}×${post.height} • Score: ${post.score}</div>
                <div class="gallery-item-tags" data-all-tags='${JSON.stringify(post.tags)}'>${tagsPreview}${expandBtn}</div>
                <div class="gallery-item-actions">${actions}</div>
            </div>
        </div>`;
}

// Load Posts
async function loadPending() {
    try {
        let posts = await apiCall('/api/pending');
        
        const sortBy = document.getElementById('pendingSort').value;
        const perPage = parseInt(document.getElementById('pendingPerPage').value);
        const searchQuery = document.getElementById('pendingSearchInput').value;
        
        posts = applySearchFilter(posts, searchQuery);
        posts = await sortPosts(posts, sortBy);
        state.pendingPosts = posts;
        
        const start = (state.pendingPage - 1) * perPage;
        const end = start + perPage;
        const pagePosts = posts.slice(start, end);
        
        const grid = document.getElementById('pendingGrid');
        if (pagePosts.length === 0) {
            grid.innerHTML = '<p style="color: #64748b; text-align: center; grid-column: 1/-1;">No pending posts</p>';
        } else {
            grid.innerHTML = pagePosts.map(p => renderPost(p, 'pending')).join('');
            attachPostEventListeners('pending');
        }
        
        document.getElementById('pendingTotalResults').textContent = `Total: ${posts.length} posts`;
        renderPagination(posts.length, perPage, state.pendingPage, 'pending');
        updateBulkControls('pending');
    } catch (error) {
        showNotification('Failed to load pending posts', 'error');
    }
}

async function loadSaved() {
    try {
        let posts = await apiCall('/api/saved');
        
        const sortBy = document.getElementById('savedSort').value;
        const perPage = parseInt(document.getElementById('savedPerPage').value);
        const searchQuery = document.getElementById('savedSearchInput').value;
        
        posts = applySearchFilter(posts, searchQuery);
        posts = await sortPosts(posts, sortBy);
        state.savedPosts = posts;
        
        const start = (state.savedPage - 1) * perPage;
        const end = start + perPage;
        const pagePosts = posts.slice(start, end);
        
        const grid = document.getElementById('savedGrid');
        if (pagePosts.length === 0) {
            grid.innerHTML = '<p style="color: #64748b; text-align: center; grid-column: 1/-1;">No saved posts</p>';
        } else {
            grid.innerHTML = pagePosts.map(p => renderPost(p, 'saved')).join('');
            attachPostEventListeners('saved');
        }
        
        document.getElementById('savedTotalResults').textContent = `Total: ${posts.length} posts`;
        renderPagination(posts.length, perPage, state.savedPage, 'saved');
        updateBulkControls('saved');
    } catch (error) {
        showNotification('Failed to load saved posts', 'error');
    }
}

// Make functions globally accessible
window.loadPending = loadPending;
window.loadSaved = loadSaved;
// Event Listeners for Posts
function attachPostEventListeners(source) {
    // Select checkboxes
    document.querySelectorAll('.select-checkbox').forEach(checkbox => {
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            const postId = parseInt(checkbox.dataset.id);
            toggleSelection(postId, source);
        });
    });
    
    // Media click to view
    document.querySelectorAll('.media-wrapper').forEach(wrapper => {
        wrapper.addEventListener('click', () => {
            const postId = parseInt(wrapper.dataset.id);
            showFullMedia(postId, source);
        });
    });
    
    // Owner filter
    document.querySelectorAll('.gallery-item-owner').forEach(owner => {
        owner.addEventListener('click', () => {
            filterByOwner(owner.dataset.owner, source);
        });
    });
    
    // Tag filter
    document.querySelectorAll('.gallery-item-tags .tag').forEach(tag => {
        tag.addEventListener('click', () => {
            filterByTag(tag.dataset.tag, source);
        });
    });
    
    // Expand tags
    document.querySelectorAll('.expand-tags').forEach(btn => {
        btn.addEventListener('click', function() {
            const container = this.parentElement;
            const allTags = JSON.parse(container.dataset.allTags);
            container.innerHTML = allTags.map(t => 
                `<span class="tag" data-tag="${t}">${t}</span>`
            ).join('');
            // Re-attach tag listeners
            container.querySelectorAll('.tag').forEach(tag => {
                tag.addEventListener('click', () => filterByTag(tag.dataset.tag, source));
            });
        });
    });
    
    // Action buttons
    document.querySelectorAll('.save-btn').forEach(btn => {
        btn.addEventListener('click', () => savePost(parseInt(btn.dataset.id)));
    });
    
    document.querySelectorAll('.discard-btn').forEach(btn => {
        btn.addEventListener('click', () => discardPost(parseInt(btn.dataset.id)));
    });
    
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => showFullMedia(parseInt(btn.dataset.id), source));
    });
    
    document.querySelectorAll('.view-r34-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            window.open(`https://rule34.xxx/index.php?page=post&s=view&id=${btn.dataset.id}`, '_blank');
        });
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('Delete this post permanently?')) {
                await deleteSavedPost(parseInt(btn.dataset.id));
            }
        });
    });
}

// Selection Management
function toggleSelection(postId, source) {
    const selectedSet = source === 'pending' ? state.selectedPending : state.selectedSaved;
    
    if (selectedSet.has(postId)) {
        selectedSet.delete(postId);
    } else {
        selectedSet.add(postId);
    }
    
    const item = document.querySelector(`.gallery-item[data-post-id="${postId}"]`);
    const checkbox = item.querySelector('.select-checkbox');
    
    if (selectedSet.has(postId)) {
        item.classList.add('selected');
        checkbox.classList.add('checked');
    } else {
        item.classList.remove('selected');
        checkbox.classList.remove('checked');
    }
    
    updateBulkControls(source);
}

function clearSelection(source) {
    const selectedSet = source === 'pending' ? state.selectedPending : state.selectedSaved;
    selectedSet.clear();
    
    document.querySelectorAll('.gallery-item.selected').forEach(item => {
        item.classList.remove('selected');
        item.querySelector('.select-checkbox').classList.remove('checked');
    });
    
    updateBulkControls(source);
}

function updateBulkControls(source) {
    const selectedSet = source === 'pending' ? state.selectedPending : state.selectedSaved;
    const count = selectedSet.size;
    
    const controls = document.getElementById(`${source}BulkControls`);
    const countSpan = document.getElementById(`${source}SelectionCount`);
    
    if (count > 0) {
        controls.style.display = 'block';
        countSpan.textContent = `${count} selected`;
    } else {
        controls.style.display = 'none';
    }
}

// Post Actions
async function savePost(postId) {
    try {
        await apiCall(`/api/save/${postId}`, {method: 'POST'});
        showNotification('Post saved');
        await loadPending();
    } catch (error) {
        showNotification('Failed to save post', 'error');
    }
}

async function discardPost(postId) {
    try {
        await apiCall(`/api/discard/${postId}`, {method: 'POST'});
        showNotification('Post discarded');
        await loadPending();
    } catch (error) {
        showNotification('Failed to discard post', 'error');
    }
}

async function deleteSavedPost(postId) {
    // This would need a new backend endpoint to delete saved posts
    showNotification('Delete functionality not yet implemented', 'warning');
}

// Filter Management
function filterByTag(tag, source) {
    const input = source === 'pending' ? 
        document.getElementById('pendingSearchInput') : 
        document.getElementById('savedSearchInput');
    
    input.value = tag;
    
    if (source === 'pending') {
        state.pendingPage = 1;
        loadPending();
    } else {
        state.savedPage = 1;
        loadSaved();
    }
}

function filterByOwner(owner, source) {
    const input = source === 'pending' ? 
        document.getElementById('pendingSearchInput') : 
        document.getElementById('savedSearchInput');
    
    input.value = `owner:${owner}`;
    
    if (source === 'pending') {
        state.pendingPage = 1;
        loadPending();
    } else {
        state.savedPage = 1;
        loadSaved();
    }
}

// Pagination
function renderPagination(total, perPage, currentPage, source) {
    const totalPages = Math.ceil(total / perPage);
    const container = document.getElementById(`${source}Pagination`);
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    const buttons = [];
    
    // First page
    buttons.push(`<button data-page="1" ${currentPage === 1 ? 'disabled' : ''}>⏮️ First</button>`);
    
    // Previous
    buttons.push(`<button data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>‹ Prev</button>`);
    
    // Page info
    buttons.push(`<span>Page ${currentPage} of ${totalPages}</span>`);
    
    // Next
    buttons.push(`<button data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Next ›</button>`);
    
    // Last page
    buttons.push(`<button data-page="${totalPages}" ${currentPage === totalPages ? 'disabled' : ''}>Last ⏭️</button>`);
    
    container.innerHTML = buttons.join('');
    
    container.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = parseInt(btn.dataset.page);
            if (source === 'pending') {
                state.pendingPage = page;
                loadPending();
            } else if (source === 'saved') {
                state.savedPage = page;
                loadSaved();
            } else if (source === 'taghistory') {
                state.tagHistoryPage = page;
                loadTagHistory();
            }
        });
    });
}

// Modal Functions
function showFullMedia(postId, source) {
    const posts = source === 'pending' ? state.pendingPosts : state.savedPosts;
    const index = posts.findIndex(p => p.id === postId);
    if (index === -1) return;
    
    state.currentModalIndex = index;
    state.currentModalSource = source;
    displayModalPost(posts[index], source);
    document.getElementById('imageModal').classList.add('show');
}

function displayModalPost(post, source) {
    const isVideo = ['.mp4', '.webm'].includes(post.file_type);
    const mediaUrl = source === 'pending' ? 
        `/temp/${post.id}${post.file_type}` : 
        `/saved/${post.date_folder}/${post.id}${post.file_type}`;
    
    const img = document.getElementById('modalImage');
    const video = document.getElementById('modalVideo');
    
    if (isVideo) {
        img.style.display = 'none';
        video.style.display = 'block';
        video.src = mediaUrl;
    } else {
        video.style.display = 'none';
        img.style.display = 'block';
        img.src = mediaUrl;
    }
    
    // Render tags with proper styling
    const tagsHtml = post.tags.map(tag => {
        if (window.tagManager) {
            return window.tagManager.renderTag(tag, post);
        }
        return `<span class="tag" data-tag="${tag}">${tag}</span>`;
    }).join('');
    
    const actions = source === 'pending' ? 
        `<button class="btn-success" onclick="savePost(${post.id})">💾 Save</button>
         <button class="btn-secondary" onclick="discardPost(${post.id})">🗑️ Discard</button>
         <button class="btn-primary" onclick="window.open('https://rule34.xxx/index.php?page=post&s=view&id=${post.id}', '_blank')">🔗 View on R34</button>
         <button class="btn-warning greyed-out" disabled title="API not supported">❤️ Like</button>` :
        `<button class="btn-primary" onclick="window.open('https://rule34.xxx/index.php?page=post&s=view&id=${post.id}', '_blank')">🔗 View on R34</button>
         <button class="btn-warning greyed-out" disabled title="API not supported">❤️ Like</button>`;
    
    document.getElementById('modalInfo').innerHTML = `
        <h3>${post.title || `Post ${post.id}`}</h3>
        <div class="modal-info-grid">
            <div class="modal-info-item"><strong>ID:</strong> ${post.id}</div>
            <div class="modal-info-item"><strong>Owner:</strong> <span style="cursor:pointer;color:#10b981" onclick="filterByOwner('${post.owner}', '${source}')">${post.owner}</span></div>
            <div class="modal-info-item"><strong>Dimensions:</strong> ${post.width}×${post.height}</div>
            <div class="modal-info-item"><strong>Rating:</strong> ${post.rating}</div>
            <div class="modal-info-item"><strong>Score:</strong> ${post.score}</div>
            <div class="modal-info-item"><strong>Tags:</strong> ${post.tags.length}</div>
        </div>
        <div style="margin: 15px 0; display: flex; gap: 10px; align-items: center;">
            <button class="btn-primary edit-tags-btn" style="font-size: 12px;">✏️ Edit Tags</button>
            <button class="btn-primary internet-required fetch-tags-btn" style="font-size: 12px;">🔄 Fetch from API</button>
        </div>
        <h4 style="color:#94a3b8;margin-bottom:10px">Tags:</h4>
        <div class="modal-tags">${tagsHtml}</div>
        <div class="modal-actions" style="margin-top: 15px;">${actions}</div>
    `;
    
    // Attach tag click listeners
    document.querySelectorAll('.modal-tags .tag').forEach(tag => {
        tag.addEventListener('click', () => {
            closeModal();
            filterByTag(tag.dataset.tag, source);
        });
    });
    
    // Setup tag editing if tagManager is available
    if (window.tagManager) {
        window.tagManager.setupTagEditing(post, source);
        
        // Setup fetch from API button
        const fetchBtn = document.querySelector('.fetch-tags-btn');
        if (fetchBtn) {
            fetchBtn.addEventListener('click', () => {
                window.tagManager.fetchAndMergeTags(post, source);
            });
        }
    }
}

function navigateModal(direction) {
    const posts = state.currentModalSource === 'pending' ? state.pendingPosts : state.savedPosts;
    state.currentModalIndex = (state.currentModalIndex + direction + posts.length) % posts.length;
    displayModalPost(posts[state.currentModalIndex], state.currentModalSource);
}

function closeModal() {
    document.getElementById('imageModal').classList.remove('show');
    const video = document.getElementById('modalVideo');
    video.pause();
    video.src = '';
}

// Bulk Operations
async function bulkSavePending() {
    await performBulkOperation('pending', 'save', Array.from(state.selectedPending));
}

async function bulkDiscardPending() {
    await performBulkOperation('pending', 'discard', Array.from(state.selectedPending));
}

async function bulkDeleteSaved() {
    if (!confirm(`Delete ${state.selectedSaved.size} posts permanently?`)) return;
    await performBulkOperation('saved', 'delete', Array.from(state.selectedSaved));
}

async function performBulkOperation(source, operation, postIds) {
    if (postIds.length === 0) return;
    
    state.bulkOperationActive = true;
    const progressContainer = document.getElementById(`${source}BulkProgress`);
    const progressBar = document.getElementById(`${source}ProgressBar`);
    const progressText = document.getElementById(`${source}ProgressText`);
    
    progressContainer.classList.add('show');
    
    let processed = 0;
    let cancelled = false;
    
    const cancelBtn = document.getElementById(`cancelBulk${source.charAt(0).toUpperCase() + source.slice(1)}`);
    cancelBtn.onclick = () => { cancelled = true; };
    
    const estimatedTime = Math.ceil(postIds.length / 60) * 60; // Rate limit consideration
    progressText.textContent = `Processing ${postIds.length} posts... Est. ${Math.ceil(estimatedTime / 60)} min`;
    
    for (const postId of postIds) {
        if (cancelled) {
            showNotification('Operation cancelled', 'warning');
            break;
        }
        
        try {
            if (operation === 'save') {
                await apiCall(`/api/save/${postId}`, {method: 'POST'});
            } else if (operation === 'discard') {
                await apiCall(`/api/discard/${postId}`, {method: 'POST'});
            } else if (operation === 'delete') {
                // Would need backend endpoint
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            processed++;
            const percent = Math.round((processed / postIds.length) * 100);
            progressBar.style.width = percent + '%';
            progressBar.textContent = percent + '%';
            progressText.textContent = `${processed} / ${postIds.length} completed`;
            
            // Rate limiting delay
            if (processed % 60 === 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error(`Failed to ${operation} post ${postId}:`, error);
        }
    }
    
    progressContainer.classList.remove('show');
    state.bulkOperationActive = false;
    clearSelection(source);
    
    if (source === 'pending') {
        await loadPending();
    } else {
        await loadSaved();
    }
    
    showNotification(`Bulk ${operation} completed: ${processed} posts`);
}

// Tag History
async function loadTagHistory() {
    try {
        const perPage = parseInt(document.getElementById('tagHistoryPerPage').value);
        const data = await apiCall(`/api/tag_history?page=${state.tagHistoryPage}&limit=${perPage}`);
        
        const list = document.getElementById('tagHistoryList');
        document.getElementById('tagHistoryTotal').textContent = `Total: ${data.total} edits`;
        
        if (data.items.length === 0) {
            list.innerHTML = '<p style="color: #64748b; text-align: center;">No tag history</p>';
        } else {
            list.innerHTML = data.items.map(item => {
                const added = item.new_tags.filter(t => !item.old_tags.includes(t));
                const removed = item.old_tags.filter(t => !item.new_tags.includes(t));
                
                return `
                    <div class="tag-history-item">
                        <div class="tag-history-header">
                            <span class="tag-history-post-id">Post #${item.post_id}</span>
                            <span class="tag-history-timestamp">${new Date(item.timestamp).toLocaleString()}</span>
                        </div>
                        <div class="tag-history-changes">
                            <div class="tag-list removed">
                                <div class="tag-list-label">Removed (${removed.length})</div>
                                ${removed.map(t => `<span class="tag">${t}</span>`).join('')}
                            </div>
                            <div class="tag-arrow">→</div>
                            <div class="tag-list added">
                                <div class="tag-list-label">Added (${added.length})</div>
                                ${added.map(t => `<span class="tag">${t}</span>`).join('')}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        renderPagination(data.total, perPage, state.tagHistoryPage, 'taghistory');
    } catch (error) {
        showNotification('Failed to load tag history', 'error');
    }
}

// Tab Switching
function switchTab(tabName) {
    state.currentTab = tabName;
    
    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector(`.nav-tab[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}Tab`).classList.add('active');
    
    if (tabName === 'pending') {
        loadPending();
    } else if (tabName === 'saved') {
        loadSaved();
    } else if (tabName === 'taghistory') {
        loadTagHistory();
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Load initial data
    loadConfig();
    loadSearchHistory();
    updateStatus();
    
    // Setup intervals
    setInterval(updateStatus, 2000);
    
    // Event listeners
    document.getElementById('saveConfigBtn').addEventListener('click', saveConfig);
    document.getElementById('startBtn').addEventListener('click', startScraper);
    document.getElementById('stopBtn').addEventListener('click', stopScraper);
    
    // Search input
    const searchInput = document.getElementById('searchTags');
    searchInput.addEventListener('focus', showSearchDropdown);
    searchInput.addEventListener('blur', hideSearchDropdown);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') startScraper();
    });
    
    // Blacklist
    document.getElementById('addBlacklistBtn').addEventListener('click', addBlacklistTags);
    document.getElementById('blacklistInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            addBlacklistTags();
        }
    });
    
    // Tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    
    // Pending controls
    document.getElementById('pendingSort').addEventListener('change', () => {
        state.pendingPage = 1;
        loadPending();
    });
    document.getElementById('pendingPerPage').addEventListener('change', () => {
        state.pendingPage = 1;
        loadPending();
    });
    document.getElementById('pendingSearchInput').addEventListener('input', () => {
        state.pendingPage = 1;
        loadPending();
    });
    
    // Saved controls
    document.getElementById('savedSort').addEventListener('change', () => {
        state.savedPage = 1;
        loadSaved();
    });
    document.getElementById('savedPerPage').addEventListener('change', () => {
        state.savedPage = 1;
        loadSaved();
    });
    document.getElementById('savedSearchInput').addEventListener('input', () => {
        state.savedPage = 1;
        loadSaved();
    });
    
    // Tag history controls
    document.getElementById('tagHistoryPerPage').addEventListener('change', () => {
        state.tagHistoryPage = 1;
        loadTagHistory();
    });
    
    // Bulk actions
    document.getElementById('bulkSavePending').addEventListener('click', bulkSavePending);
    document.getElementById('bulkDiscardPending').addEventListener('click', bulkDiscardPending);
    document.getElementById('clearSelectionPending').addEventListener('click', () => clearSelection('pending'));
    
    document.getElementById('bulkDeleteSaved').addEventListener('click', bulkDeleteSaved);
    document.getElementById('clearSelectionSaved').addEventListener('click', () => clearSelection('saved'));
    
    // Modal controls
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modalPrev').addEventListener('click', () => navigateModal(-1));
    document.getElementById('modalNext').addEventListener('click', () => navigateModal(1));
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
        
        if (document.getElementById('imageModal').classList.contains('show')) {
            if (e.key === 'ArrowLeft') navigateModal(-1);
            if (e.key === 'ArrowRight') navigateModal(1);
        }
    });
    
    // Click outside modal to close
    document.getElementById('imageModal').addEventListener('click', (e) => {
        if (e.target.id === 'imageModal') closeModal();
    });
});