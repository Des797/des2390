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
 * Check if file type is a GIF
 */
function isGifFile(fileType) {
    return fileType === '.gif';
}

/**
 * Generate media URL based on post status
 */
function getMediaUrl(post) {
    // Ensure file_type is defined
    const fileType = post.file_type || '.jpg';
    
    if (post.status === POST_STATUS.PENDING) {
        return `/temp/${post.id}${fileType}`;
    }
    return `/saved/${post.date_folder}/${post.id}${fileType}`;
}

/**
 * Format video duration in MM:SS format
 */
function formatVideoDuration(seconds) {
    if (!seconds || seconds <= 0) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Calculate grid row span based on image aspect ratio
 */
function calculateRowSpan(width, height) {
    const aspectRatio = height / width;
    const cardWidth = UI_CONSTANTS.CARD_BASE_WIDTH;
    const cardHeight = cardWidth * aspectRatio;
    const rowSpan = Math.ceil(cardHeight / UI_CONSTANTS.CARD_ROW_HEIGHT);
    
    // Add extra rows for info section (approximately 8 rows for compact info)
    return rowSpan + 8;
}

/**
 * Render media HTML (video or image) with loading/error states
 */
function renderMedia(post) {
    const mediaUrl = getMediaUrl(post);
    const isVideo = isVideoFile(post.file_type);
    const isGif = isGifFile(post.file_type);
    const duration = post.duration ? formatVideoDuration(post.duration) : '';
    
    // Determine media class for border styling
    let mediaClass = '';
    if (isVideo) mediaClass = 'media-video';
    else if (isGif) mediaClass = 'media-gif';
    
    const loadingOverlay = `<div class="media-loading">Loading...</div>`;
    const errorOverlay = `<div class="media-error">No Thumbnail Found</div>`;
    const durationBadge = duration ? `<div class="video-duration">${duration}</div>` : '';
    
    if (isVideo) {
        return `
            <div class="${mediaClass}">
                ${loadingOverlay}
                <img src="${mediaUrl}" 
                     alt="Post ${post.id}" 
                     loading="lazy" 
                     data-post-id="${post.id}"
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"
                     onload="this.previousElementSibling.style.display='none';">
                ${errorOverlay}
                <video src="${mediaUrl}" 
                       muted 
                       loop 
                       style="display:none;" 
                       data-video-src="${mediaUrl}"
                       data-post-id="${post.id}"></video>
                <div class="video-overlay"></div>
                ${durationBadge}
            </div>
        `;
    }
    
    return `
        <div class="${mediaClass}">
            ${loadingOverlay}
            <img src="${mediaUrl}" 
                 alt="Post ${post.id}" 
                 loading="lazy"
                 data-post-id="${post.id}"
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"
                 onload="this.previousElementSibling.style.display='none';">
            ${errorOverlay}
        </div>
    `;
}

/**
 * Render post title
 */
function renderTitle(post) {
    if (!post.title) return '';
    return `<div class="gallery-item-title" title="${post.title}">${post.title}</div>`;
}

/**
 * Render post owner
 */
function renderOwner(post) {
    return `<div class="${CSS_CLASSES.GALLERY_ITEM_OWNER}" data-owner="${post.owner}" title="${post.owner}">${post.owner}</div>`;
}

/**
 * Render tags preview (first 3 tags with counts)
 */
function renderTagsPreview(post) {
    const tagsPreview = post.tags.slice(0, UI_CONSTANTS.TAGS_PREVIEW_LIMIT).map(t => {
        const tagWithCount = getTagWithCount(t, state.tagCounts);
        return `<span class="${CSS_CLASSES.TAG}" data-tag="${t}" title="${tagWithCount}">${t}</span>`;
    }).join('');
    
    const expandBtn = post.tags.length > UI_CONSTANTS.TAGS_PREVIEW_LIMIT ? 
        `<span style="cursor:pointer;color:#10b981" class="${CSS_CLASSES.EXPAND_TAGS}">+${post.tags.length - UI_CONSTANTS.TAGS_PREVIEW_LIMIT}</span>` : '';
    
    return { tagsPreview, expandBtn };
}

/**
 * Render card info line with conditional display based on active filters/sorting
 */
function renderCardInfo(post, activeSort, activeSearch) {
    const parts = [];
    
    // Always show if sorting by or searching by ID
    if (activeSort === 'id' || activeSearch.includes('id:')) {
        parts.push(`#${post.id}`);
    }
    
    // Show dimensions if sorting by size or searching by dimensions
    if (activeSort === 'size' || activeSearch.includes('width:') || activeSearch.includes('height:')) {
        parts.push(`${post.width}×${post.height}`);
    }
    
    // Show score if sorting by or filtering by score
    if (activeSort === 'score' || activeSearch.includes('score:')) {
        parts.push(`⭐${post.score}`);
    }
    
    // Always show status badge
    const statusBadge = renderStatusBadge(post.status);
    
    if (parts.length > 0) {
        return `<div class="gallery-item-id">${parts.join(' • ')} • ${statusBadge}</div>`;
    }
    
    return `<div class="gallery-item-id">${statusBadge}</div>`;
}

/**
 * Render status badge
 */
function renderStatusBadge(status) {
    const isPending = status === POST_STATUS.PENDING;
    const badgeColor = isPending ? '#f59e0b' : '#10b981';
    const badgeText = isPending ? 'P' : 'S';
    
    return `<span style="background:${badgeColor};color:white;padding:2px 6px;border-radius:3px;font-size:9px;font-weight:600;" title="${isPending ? 'Pending' : 'Saved'}">${badgeText}</span>`;
}

/**
 * Render action buttons based on post status
 */
function renderActions(post) {
    if (post.status === POST_STATUS.PENDING) {
        return `
            <button class="btn-success ${CSS_CLASSES.SAVE_BTN}" data-id="${post.id}" title="Save">💾</button>
            <button class="btn-secondary ${CSS_CLASSES.DISCARD_BTN}" data-id="${post.id}" title="Discard">🗑️</button>
            <button class="btn-primary ${CSS_CLASSES.VIEW_R34_BTN}" data-id="${post.id}" title="View on R34">🔗</button>
        `;
    }
    
    return `
        <button class="btn-primary ${CSS_CLASSES.VIEW_BTN}" data-id="${post.id}" title="View Full">👁️</button>
        <button class="btn-primary ${CSS_CLASSES.VIEW_R34_BTN}" data-id="${post.id}" title="View on R34">🔗</button>
        <button class="btn-danger ${CSS_CLASSES.DELETE_BTN}" data-id="${post.id}" data-folder="${post.date_folder}" title="Delete">🗑️</button>
    `;
}

/**
 * Render a single post card with dynamic sizing
 */
function renderPost(post, activeSort = '', activeSearch = '') {
    const isSelected = state.selectedPosts.has(post.id);
    const mediaHtml = renderMedia(post);
    const titleHtml = renderTitle(post);
    const ownerHtml = renderOwner(post);
    const { tagsPreview, expandBtn } = renderTagsPreview(post);
    const cardInfo = renderCardInfo(post, activeSort, activeSearch);
    const actions = renderActions(post);
    const rowSpan = calculateRowSpan(post.width, post.height);
    
    // Determine media container class for border styling
    const isVideo = isVideoFile(post.file_type);
    const isGif = isGifFile(post.file_type);
    let mediaClass = 'gallery-item-media';
    if (isVideo) mediaClass += ' media-video';
    else if (isGif) mediaClass += ' media-gif';
    
    return `
        <div class="${CSS_CLASSES.GALLERY_ITEM} ${isSelected ? CSS_CLASSES.SELECTED : ''}" 
             data-post-id="${post.id}" 
             data-status="${post.status}"
             style="grid-row: span ${rowSpan};">
            <div class="${mediaClass}">
                <div class="${CSS_CLASSES.SELECT_CHECKBOX} ${isSelected ? CSS_CLASSES.CHECKED : ''}" data-id="${post.id}"></div>
                <div class="${CSS_CLASSES.MEDIA_WRAPPER}" data-id="${post.id}">${mediaHtml}</div>
            </div>
            <div class="gallery-item-info">
                ${titleHtml}${ownerHtml}
                ${cardInfo}
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
 * Render pagination buttons with go-to-page input
 */
function renderPaginationButtons(currentPage, totalPages) {
    const buttons = [];
    
    buttons.push(`<button data-page="1" ${currentPage === 1 ? 'disabled' : ''}>⏮️ First</button>`);
    buttons.push(`<button data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>‹ Prev</button>`);
    
    // Go to page input
    buttons.push(`
        <div class="go-to-page">
            <span>Page</span>
            <input type="number" id="gotoPageInput" value="${currentPage}" min="1" max="${totalPages}">
            <span>of ${totalPages}</span>
            <button id="gotoPageBtn">Go</button>
        </div>
    `);
    
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
        return `<span class="${CSS_CLASSES.TAG}" data-tag="${t}" title="${tagWithCount}">${t}</span>`;
    }).join('');
}

export {
    renderPost,
    renderModalContent,
    renderPaginationButtons,
    renderTagHistoryItem,
    renderExpandedTags,
    getMediaUrl,
    isVideoFile,
    isGifFile
};