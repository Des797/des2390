// Post Rendering Functions
import { state } from './state.js';
import { getTagWithCount } from './utils.js';
import { FILE_TYPES, POST_STATUS, UI_CONSTANTS, CSS_CLASSES, EXTERNAL_URLS } from './constants.js';

/**
 * Check if file type is a video
 */
function isVideoFile(fileType) {
    return FILE_TYPES.VIDEO.includes(fileType);
}

/**
 * Generate media URL based on post status
 */
function getMediaUrl(post) {
    if (post.status === POST_STATUS.PENDING) {
        return `/temp/${post.id}${post.file_type}`;
    }
    return `/saved/${post.date_folder}/${post.id}${post.file_type}`;
}

/**
 * Render media HTML (video or image)
 */
function renderMedia(post) {
    const mediaUrl = getMediaUrl(post);
    const isVideo = isVideoFile(post.file_type);
    
    if (isVideo) {
        return `<video src="${mediaUrl}"></video><div class="video-overlay"></div>`;
    }
    return `<img src="${mediaUrl}" alt="Post ${post.id}" loading="lazy">`;
}

/**
 * Render post title
 */
function renderTitle(post) {
    if (!post.title) return '';
    return `<div class="gallery-item-title">${post.title}</div>`;
}

/**
 * Render post owner
 */
function renderOwner(post) {
    return `<div class="${CSS_CLASSES.GALLERY_ITEM_OWNER}" data-owner="${post.owner}">${post.owner}</div>`;
}

/**
 * Render tags preview (first 5 tags with counts)
 */
function renderTagsPreview(post) {
    const tagsPreview = post.tags.slice(0, UI_CONSTANTS.TAGS_PREVIEW_LIMIT).map(t => {
        const tagWithCount = getTagWithCount(t, state.tagCounts);
        return `<span class="${CSS_CLASSES.TAG}" data-tag="${t}">${tagWithCount}</span>`;
    }).join('');
    
    const expandBtn = post.tags.length > UI_CONSTANTS.TAGS_PREVIEW_LIMIT ? 
        `<span style="cursor:pointer;color:#10b981" class="${CSS_CLASSES.EXPAND_TAGS}">+${post.tags.length - UI_CONSTANTS.TAGS_PREVIEW_LIMIT} more</span>` : '';
    
    return { tagsPreview, expandBtn };
}

/**
 * Render status badge
 */
function renderStatusBadge(status) {
    const isPending = status === POST_STATUS.PENDING;
    const badgeColor = isPending ? '#f59e0b' : '#10b981';
    const badgeText = isPending ? 'PENDING' : 'SAVED';
    
    return `<span style="background:${badgeColor};color:white;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:600;">${badgeText}</span>`;
}

/**
 * Render action buttons based on post status
 */
function renderActions(post) {
    if (post.status === POST_STATUS.PENDING) {
        return `
            <button class="btn-success ${CSS_CLASSES.SAVE_BTN}" data-id="${post.id}">💾 Save</button>
            <button class="btn-secondary ${CSS_CLASSES.DISCARD_BTN}" data-id="${post.id}">🗑️ Discard</button>
            <button class="btn-primary ${CSS_CLASSES.VIEW_R34_BTN}" data-id="${post.id}">🔗 View</button>
        `;
    }
    
    return `
        <button class="btn-primary ${CSS_CLASSES.VIEW_BTN}" data-id="${post.id}">👁️ View</button>
        <button class="btn-primary ${CSS_CLASSES.VIEW_R34_BTN}" data-id="${post.id}">🔗 R34</button>
        <button class="btn-danger ${CSS_CLASSES.DELETE_BTN}" data-id="${post.id}" data-folder="${post.date_folder}">🗑️ Delete</button>
    `;
}

/**
 * Render a single post card
 */
function renderPost(post) {
    const isSelected = state.selectedPosts.has(post.id);
    const mediaHtml = renderMedia(post);
    const titleHtml = renderTitle(post);
    const ownerHtml = renderOwner(post);
    const { tagsPreview, expandBtn } = renderTagsPreview(post);
    const statusBadge = renderStatusBadge(post.status);
    const actions = renderActions(post);
    
    return `
        <div class="${CSS_CLASSES.GALLERY_ITEM} ${isSelected ? CSS_CLASSES.SELECTED : ''}" data-post-id="${post.id}" data-status="${post.status}">
            <div class="gallery-item-media">
                <div class="${CSS_CLASSES.SELECT_CHECKBOX} ${isSelected ? CSS_CLASSES.CHECKED : ''}" data-id="${post.id}"></div>
                <div class="${CSS_CLASSES.MEDIA_WRAPPER}" data-id="${post.id}">${mediaHtml}</div>
            </div>
            <div class="gallery-item-info">
                ${titleHtml}${ownerHtml}
                <div class="gallery-item-id">ID: ${post.id} • ${post.width}×${post.height} • Score: ${post.score} • ${statusBadge}</div>
                <div class="gallery-item-tags" data-all-tags='${JSON.stringify(post.tags)}'>${tagsPreview}${expandBtn}</div>
                <div class="gallery-item-actions">${actions}</div>
            </div>
        </div>`;
}

/**
 * Render modal status badge
 */
function renderModalStatusBadge(status) {
    const isPending = status === POST_STATUS.PENDING;
    const badgeColor = isPending ? '#f59e0b' : '#10b981';
    const badgeText = isPending ? 'PENDING' : 'SAVED';
    
    return `<span style="background:${badgeColor};color:white;padding:4px 12px;border-radius:4px;font-size:12px;font-weight:600;">${badgeText}</span>`;
}

/**
 * Render modal tags with counts
 */
function renderModalTags(tags) {
    return tags.map(t => {
        const tagWithCount = getTagWithCount(t, state.tagCounts);
        return `<span class="${CSS_CLASSES.TAG}" data-tag="${t}">${tagWithCount}</span>`;
    }).join('');
}

/**
 * Render modal actions based on post status
 */
function renderModalActions(post) {
    const viewR34Btn = `<button class="btn-primary" onclick="window.open('${EXTERNAL_URLS.RULE34_POST_VIEW}${post.id}', '_blank')">🔗 View on R34</button>`;
    const disabledBtns = `
        <button class="btn-warning ${CSS_CLASSES.GREYED_OUT}" disabled title="API not supported">❤️ Like</button>
        <button class="btn-primary ${CSS_CLASSES.GREYED_OUT}" disabled title="API not supported">✏️ Edit Tags</button>
    `;
    
    if (post.status === POST_STATUS.PENDING) {
        return `
            <button class="btn-success" onclick="window.modalSavePost(${post.id})">💾 Save</button>
            <button class="btn-secondary" onclick="window.modalDiscardPost(${post.id})">🗑️ Discard</button>
            ${viewR34Btn}
            ${disabledBtns}
        `;
    }
    
    return `${viewR34Btn}${disabledBtns}`;
}

/**
 * Render modal info grid
 */
function renderModalInfoGrid(post) {
    return `
        <div class="modal-info-grid">
            <div class="modal-info-item"><strong>ID:</strong> ${post.id}</div>
            <div class="modal-info-item"><strong>Owner:</strong> <span style="cursor:pointer;color:#10b981" onclick="window.modalFilterByOwner('${post.owner}')">${post.owner}</span></div>
            <div class="modal-info-item"><strong>Dimensions:</strong> ${post.width}×${post.height}</div>
            <div class="modal-info-item"><strong>Rating:</strong> ${post.rating}</div>
            <div class="modal-info-item"><strong>Score:</strong> ${post.score}</div>
            <div class="modal-info-item"><strong>Tags:</strong> ${post.tags.length}</div>
        </div>
    `;
}

/**
 * Render complete modal content for a post
 */
function renderModalContent(post) {
    const statusBadge = renderModalStatusBadge(post.status);
    const tagsHtml = renderModalTags(post.tags);
    const infoGrid = renderModalInfoGrid(post);
    const actions = renderModalActions(post);
    
    return `
        <h3>${post.title || `Post ${post.id}`}</h3>
        <div style="margin-bottom: 15px;">${statusBadge}</div>
        ${infoGrid}
        <h4 style="color:#94a3b8;margin-bottom:10px">Tags:</h4>
        <div class="modal-tags">${tagsHtml}</div>
        <div class="modal-actions">${actions}</div>
    `;
}

/**
 * Render pagination buttons
 */
function renderPaginationButtons(currentPage, totalPages) {
    const buttons = [];
    
    buttons.push(`<button data-page="1" ${currentPage === 1 ? 'disabled' : ''}>⏮️ First</button>`);
    buttons.push(`<button data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>‹ Prev</button>`);
    buttons.push(`<span>Page ${currentPage} of ${totalPages}</span>`);
    buttons.push(`<button data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Next ›</button>`);
    buttons.push(`<button data-page="${totalPages}" ${currentPage === totalPages ? 'disabled' : ''}>Last ⏭️</button>`);
    
    return buttons.join('');
}

/**
 * Render tag history item
 */
function renderTagHistoryItem(item) {
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
                    ${removed.map(t => `<span class="${CSS_CLASSES.TAG}">${t}</span>`).join('')}
                </div>
                <div class="tag-arrow">→</div>
                <div class="tag-list added">
                    <div class="tag-list-label">Added (${added.length})</div>
                    ${added.map(t => `<span class="${CSS_CLASSES.TAG}">${t}</span>`).join('')}
                </div>
            </div>
        </div>
    `;
}

/**
 * Render expanded tags (when user clicks "show more")
 */
function renderExpandedTags(tags) {
    return tags.map(t => {
        const tagWithCount = getTagWithCount(t, state.tagCounts);
        return `<span class="${CSS_CLASSES.TAG}" data-tag="${t}">${tagWithCount}</span>`;
    }).join('');
}

export {
    renderPost,
    renderModalContent,
    renderPaginationButtons,
    renderTagHistoryItem,
    renderExpandedTags,
    getMediaUrl,
    isVideoFile
};