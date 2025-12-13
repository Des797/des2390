// Posts Rendering - Pure UI rendering functions
import { state } from './state.js';
import { getTagWithCount } from './utils.js';

function renderPost(post) {
    const isVideo = ['.mp4', '.webm'].includes(post.file_type);
    const mediaUrl = post.status === 'pending' ? 
        `/temp/${post.id}${post.file_type}` : 
        `/saved/${post.date_folder}/${post.id}${post.file_type}`;
    
    const isSelected = state.selectedPosts.has(post.id);
    
    return `
        <div class="gallery-item ${isSelected ? 'selected' : ''}" data-post-id="${post.id}" data-status="${post.status}">
            <div class="gallery-item-media">
                ${renderSelectionCheckbox(post.id, isSelected)}
                ${renderMediaWrapper(post.id, mediaUrl, isVideo)}
            </div>
            <div class="gallery-item-info">
                ${renderPostInfo(post)}
                ${renderPostTags(post)}
                ${renderPostActions(post)}
            </div>
        </div>`;
}

function renderSelectionCheckbox(postId, isSelected) {
    return `<div class="select-checkbox ${isSelected ? 'checked' : ''}" data-id="${postId}"></div>`;
}

function renderMediaWrapper(postId, mediaUrl, isVideo) {
    const mediaHtml = isVideo ? 
        `<video src="${mediaUrl}"></video><div class="video-overlay"></div>` :
        `<img src="${mediaUrl}" alt="Post ${postId}" loading="lazy">`;
    
    return `<div class="media-wrapper" data-id="${postId}">${mediaHtml}</div>`;
}

function renderPostInfo(post) {
    const titleHtml = post.title ? `<div class="gallery-item-title">${post.title}</div>` : '';
    const ownerHtml = `<div class="gallery-item-owner" data-owner="${post.owner}">${post.owner}</div>`;
    const statusBadge = renderStatusBadge(post.status);
    
    return `
        ${titleHtml}
        ${ownerHtml}
        <div class="gallery-item-id">ID: ${post.id} • ${post.width}×${post.height} • Score: ${post.score} • ${statusBadge}</div>
    `;
}

function renderStatusBadge(status) {
    return status === 'pending' ? 
        '<span style="background:#f59e0b;color:white;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:600;">PENDING</span>' :
        '<span style="background:#10b981;color:white;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:600;">SAVED</span>';
}

function renderPostTags(post) {
    const tagsPreview = post.tags.slice(0, 5).map(t => {
        const tagWithCount = getTagWithCount(t, state.tagCounts);
        return `<span class="tag" data-tag="${t}">${tagWithCount}</span>`;
    }).join('');
    
    const expandBtn = post.tags.length > 5 ? 
        `<span style="cursor:pointer;color:#10b981" class="expand-tags">+${post.tags.length - 5} more</span>` : '';
    
    return `<div class="gallery-item-tags" data-all-tags='${JSON.stringify(post.tags)}'>${tagsPreview}${expandBtn}</div>`;
}

function renderPostActions(post) {
    const actions = post.status === 'pending' ? 
        `<button class="btn-success save-btn" data-id="${post.id}">💾 Save</button>
         <button class="btn-secondary discard-btn" data-id="${post.id}">🗑️ Discard</button>
         <button class="btn-primary view-r34-btn" data-id="${post.id}">🔗 View</button>` :
        `<button class="btn-primary view-btn" data-id="${post.id}">👁️ View</button>
         <button class="btn-primary view-r34-btn" data-id="${post.id}">🔗 R34</button>
         <button class="btn-danger delete-btn" data-id="${post.id}" data-folder="${post.date_folder}">🗑️ Delete</button>`;
    
    return `<div class="gallery-item-actions">${actions}</div>`;
}

function renderPagination(total, perPage, currentPage) {
    const totalPages = Math.ceil(total / perPage);
    
    if (totalPages <= 1) {
        return '';
    }
    
    const buttons = [];
    
    buttons.push(`<button data-page="1" ${currentPage === 1 ? 'disabled' : ''}>⏮️ First</button>`);
    buttons.push(`<button data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>‹ Prev</button>`);
    buttons.push(`<span>Page ${currentPage} of ${totalPages}</span>`);
    buttons.push(`<button data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Next ›</button>`);
    buttons.push(`<button data-page="${totalPages}" ${currentPage === totalPages ? 'disabled' : ''}>Last ⏭️</button>`);
    
    return buttons.join('');
}

function renderEmptyState(message = 'No posts') {
    return `<p style="color: #64748b; text-align: center; grid-column: 1/-1;">${message}</p>`;
}

export {
    renderPost,
    renderPagination,
    renderEmptyState
};