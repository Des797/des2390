// Post Rendering Functions - CLEANED & FIXED
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
 * Setup video hover-to-play using EVENT DELEGATION
 * Prevents multiple listener accumulation
 */
function setupVideoPreviewListeners() {
    // Remove any existing delegated listeners
    const grid = document.getElementById('postsGrid');
    if (!grid) return;
    
    // Use single delegated listener for all video containers
    grid.removeEventListener('mouseenter', handleVideoMouseEnter, true);
    grid.removeEventListener('mouseleave', handleVideoMouseLeave, true);
    
    grid.addEventListener('mouseenter', handleVideoMouseEnter, true);
    grid.addEventListener('mouseleave', handleVideoMouseLeave, true);
    
    // Generate missing thumbnails
    generateMissingThumbnails();
}

function handleVideoMouseEnter(e) {
    const container = e.target.closest('.gallery-item-media.media-video');
    if (!container) return;
    
    const video = container.querySelector('video');
    if (!video) return;
    
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    
    // Set poster if needed
    const thumbUrl = video.dataset.thumbUrl;
    if (thumbUrl && !video.poster) {
        video.setAttribute('poster', thumbUrl);
    }
    
    // Start playback after delay
    const playTimeout = setTimeout(() => {
        if (video.dataset.preload !== 'done') {
            video.preload = 'auto';
            video.dataset.preload = 'done';
        }
        
        const playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    video.setAttribute('data-playing', 'true');
                    const posterImg = container.querySelector('.video-poster');
                    if (posterImg) posterImg.style.opacity = '0';
                })
                .catch(err => {
                    console.warn('Video play failed:', err);
                });
        }
    }, 200);
    
    video.dataset.playTimeout = playTimeout;
}

function handleVideoMouseLeave(e) {
    const container = e.target.closest('.gallery-item-media.media-video');
    if (!container) return;
    
    const video = container.querySelector('video');
    if (!video) return;
    
    // Clear timeout
    if (video.dataset.playTimeout) {
        clearTimeout(parseInt(video.dataset.playTimeout));
        delete video.dataset.playTimeout;
    }
    
    video.pause();
    video.currentTime = 0;
    video.removeAttribute('data-playing');
    
    const posterImg = container.querySelector('.video-poster');
    if (posterImg) posterImg.style.opacity = '1';
    
    video.load();
}

/**
 * Generate missing video thumbnails - SEQUENTIAL with await
 */
async function generateMissingThumbnails() {
    if (window.__thumbnailsInitialized) return;
    window.__thumbnailsInitialized = true;

    const videos = document.querySelectorAll('.media-video video[data-thumb-url]');
    
    // Process sequentially to avoid overwhelming the server
    for (const video of videos) {
        const thumbUrl = video.dataset.thumbUrl;
        const postId = video.dataset.postId;
        
        try {
            // Check if thumbnail exists (without heavy cache-buster)
            const checkImg = new Image();
            const thumbExists = await new Promise((resolve) => {
                checkImg.onload = () => resolve(true);
                checkImg.onerror = () => resolve(false);
                checkImg.src = thumbUrl;
            });
            
            if (thumbExists) {
                // Thumbnail exists, set it
                video.poster = thumbUrl;
                video.setAttribute('poster', thumbUrl);
                video.setAttribute('data-thumb-loaded', 'true');
                
                const container = video.closest('.gallery-item-media');
                if (container) {
                    const posterImg = container.querySelector('.video-poster');
                    if (posterImg) posterImg.src = thumbUrl;
                }
            } else {
                // Generate thumbnail
                console.log(`Generating thumbnail for post ${postId}...`);
                
                const response = await fetch(`/api/post/${postId}/generate-thumbnail`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    const result = await response.json();
                    if (result.thumbnail_url) {
                        // Use minimal cache-buster (timestamp only once)
                        const newThumbUrl = `${result.thumbnail_url}?v=${Date.now()}`;
                        
                        video.poster = newThumbUrl;
                        video.setAttribute('poster', newThumbUrl);
                        video.setAttribute('data-thumb-loaded', 'true');
                        
                        const container = video.closest('.gallery-item-media');
                        if (container) {
                            const posterImg = container.querySelector('.video-poster');
                            if (posterImg) {
                                posterImg.src = newThumbUrl;
                                posterImg.style.display = 'block';
                            }
                        }
                        
                        video.load();
                        console.log(`Generated thumbnail for post ${postId}`);
                    }
                }
            }
        } catch (error) {
            console.warn(`Thumbnail handling failed for post ${postId}:`, error);
        }
    }
}

/**
 * Calculate grid row span based on image aspect ratio
 */
function calculateRowSpan(width, height) {
    const aspectRatio = height / width;
    const cardWidth = UI_CONSTANTS.CARD_BASE_WIDTH;
    const cardHeight = cardWidth * aspectRatio;
    const mediaRowSpan = Math.ceil(cardHeight / UI_CONSTANTS.CARD_ROW_HEIGHT);
    return mediaRowSpan;
}

/**
 * Render media HTML with proper thumbnail support
 */
function renderMedia(post) {
    const mediaUrl = getMediaUrl(post);
    const isVideo = isVideoFile(post.file_type);
    const isGif = isGifFile(post.file_type);
    
    const postId = post.id;
    if (!postId) {
        console.error('Invalid post ID:', post);
        return '<div>Error: Invalid post ID</div>';
    }
    
    const duration = post.duration ? formatVideoDuration(post.duration) : null;
    
    let mediaClass = '';
    if (isVideo) mediaClass = 'media-video';
    else if (isGif) mediaClass = 'media-gif';

    const durationBadge = isVideo 
        ? `<div class="video-duration" data-post-id="${postId}">${duration || '...'}</div>` 
        : '';

    if (isVideo) {
        let thumbUrl = '';
        if (post.status === POST_STATUS.PENDING) {
            thumbUrl = `/temp/.thumbnails/${postId}_thumb.jpg`;
        } else {
            thumbUrl = `/saved/${post.date_folder}/.thumbnails/${postId}_thumb.jpg`;
        }
        
        return `
            <div class="${mediaClass}" data-post-id="${postId}">
                <img class="video-poster" src="${thumbUrl}" alt="Video thumbnail">
                <video src="${mediaUrl}" 
                       poster="${thumbUrl}"
                       muted 
                       loop 
                       preload="none"
                       data-post-id="${postId}"
                       data-thumb-url="${thumbUrl}">
                </video>
                <div class="video-overlay"></div>
                ${durationBadge}
            </div>
        `;
    }

    return `
        <div class="${mediaClass}" data-post-id="${postId}">
            <img src="${mediaUrl}" 
                 alt="Post ${postId}" 
                 loading="lazy" 
                 data-post-id="${postId}">
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
 * Render tags preview
 */
function renderTagsPreview(post, searchQuery = '') {
    const matchingTags = post.matchingTags || [];
    
    const sortedTags = [
        ...post.tags.filter(t => matchingTags.includes(t)),
        ...post.tags.filter(t => !matchingTags.includes(t))
    ];
    
    const visibleTags = sortedTags.slice(0, UI_CONSTANTS.TAGS_PREVIEW_LIMIT + matchingTags.length);
    const remainingCount = post.tags.length - visibleTags.length;
    
    const tagsHtml = visibleTags.map(t => {
        const isMatching = matchingTags.includes(t);
        const matchClass = isMatching ? 'matching' : '';
        const tagWithCount = getTagWithCount(t, state.tagCounts);
        return `<span class="${CSS_CLASSES.TAG} ${matchClass}" data-tag="${t}" title="${tagWithCount}">${t}</span>`;
    }).join('');
    
    const expandBtn = remainingCount > 0 ? 
        `<span class="${CSS_CLASSES.EXPAND_TAGS}" data-all-tags='${JSON.stringify(post.tags)}' data-matching='${JSON.stringify(matchingTags)}'>+${remainingCount}</span>` : '';
    
    return { tagsPreview: tagsHtml, expandBtn };
}

/**
 * Render card info - FIXED null/undefined check
 */
function renderCardInfo(post, activeSort, activeSearch = '') {
    const parts = [];
    
    // Ensure activeSearch is a string
    const search = String(activeSearch || '');
    
    if (activeSort === 'id' || search.includes('id:')) {
        parts.push(`#${post.id}`);
    }
    
    if (activeSort === 'size' || search.includes('width:') || search.includes('height:')) {
        parts.push(`${post.width}×${post.height}`);
    }
    
    if (activeSort === 'score' || search.includes('score:')) {
        parts.push(`⭐${post.score}`);
    }
    
    const statusBadge = `<span class="status-badge status-${post.status}">${post.status === POST_STATUS.PENDING ? 'P' : 'S'}</span>`;
    
    if (parts.length > 0) {
        return `<div class="gallery-item-id">${parts.join(' • ')} • ${statusBadge}</div>`;
    }
    
    return `<div class="gallery-item-id">${statusBadge}</div>`;
}

/**
 * Render action buttons
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
 * Render hover overlay action buttons
 */
function renderHoverActions(post) {
    if (post.status === POST_STATUS.PENDING) {
        return `
            <div class="hover-buttons">
                <button class="btn-success ${CSS_CLASSES.SAVE_BTN}" data-id="${post.id}">💾</button>
                <button class="btn-secondary ${CSS_CLASSES.DISCARD_BTN}" data-id="${post.id}">🗑️</button>
                <button class="btn-primary ${CSS_CLASSES.VIEW_R34_BTN}" data-id="${post.id}">🔗</button>
            </div>
        `;
    }
    
    return `
        <div class="hover-buttons">
            <button class="btn-primary ${CSS_CLASSES.VIEW_R34_BTN}" data-id="${post.id}">🔗</button>
            <button class="btn-danger ${CSS_CLASSES.DELETE_BTN}" data-id="${post.id}" data-folder="${post.date_folder}">🗑️</button>
        </div>
    `;
}

/**
 * Render a single post card
 */
function renderPost(post, activeSort = '', activeSearch = '') {
    const isSelected = state.selectedPosts.has(post.id);
    const mediaHtml = renderMedia(post);
    const titleHtml = renderTitle(post);
    const ownerHtml = renderOwner(post);
    const { tagsPreview, expandBtn } = renderTagsPreview(post, activeSearch);
    const cardInfo = renderCardInfo(post, activeSort, activeSearch);
    const actions = renderActions(post);
    const hoverActions = renderHoverActions(post);
    const rowSpan = calculateRowSpan(post.width, post.height);
    
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
                ${hoverActions}
            </div>
            <div class="gallery-item-info">
                ${titleHtml}${ownerHtml}
                ${cardInfo}
                <div class="gallery-item-tags">${tagsPreview}${expandBtn}</div>
                <div class="gallery-item-actions">${actions}</div>
            </div>
        </div>`;
}

/**
 * Render modal content - DRY tag rendering
 */
function renderModalTags(tags) {
    return tags.map(t => {
        const tagWithCount = getTagWithCount(t, state.tagCounts);
        return `<span class="${CSS_CLASSES.TAG}" data-tag="${t}">${tagWithCount}</span>`;
    }).join('');
}

function renderModalTagsSection(post) {
    const tagsHtml = renderModalTags(post.tags);
    
    return `
        <div class="modal-tags-section">
            <div class="modal-tags-header">
                <h4>Tags (${post.tags.length})</h4>
                <button class="btn-primary btn-edit-tags ${CSS_CLASSES.GREYED_OUT}" disabled title="API not supported">✏️ Edit Tags</button>
            </div>
            <div class="modal-tags">${tagsHtml}</div>
        </div>
    `;
}

function renderModalActions(post) {
    const viewR34Btn = `<button class="btn-primary" onclick="window.open('${EXTERNAL_URLS.RULE34_POST_VIEW}${post.id}', '_blank')">🔗 View on R34</button>`;
    const likeBtn = `<button class="btn-warning btn-like ${CSS_CLASSES.GREYED_OUT}" disabled title="API not supported">❤️</button>`;
    
    if (post.status === POST_STATUS.PENDING) {
        return `
            <button class="btn-success" onclick="window.modalSavePost(${post.id})">💾 Save</button>
            <button class="btn-secondary" onclick="window.modalDiscardPost(${post.id})">🗑️ Discard</button>
            ${viewR34Btn}
            ${likeBtn}
        `;
    }
    
    return `
        ${viewR34Btn}
        ${likeBtn}
        <button class="btn-danger" onclick="if(confirm('Delete this post permanently?')) window.modalDeletePost(${post.id}, '${post.date_folder}')">🗑️ Delete</button>
    `;
}

function renderModalContent(post) {
    const statusBadge = `<span class="status-badge status-${post.status}">${post.status === POST_STATUS.PENDING ? 'PENDING' : 'SAVED'}</span>`;
    const tagsSection = renderModalTagsSection(post);
    
    const fileSizeDisplay = post.file_size 
        ? `${(post.file_size / 1024 / 1024).toFixed(2)} MB` 
        : 'Unknown';
    
    const uploadDate = post.created_at 
        ? new Date(post.created_at).toLocaleDateString() 
        : 'Unknown';
    const downloadDate = post.downloaded_at 
        ? new Date(post.downloaded_at).toLocaleDateString() 
        : 'Unknown';
    
    return `
        <h3>${post.title || `Post ${post.id}`}</h3>
        
        <div style="margin-bottom: 15px;">${statusBadge}</div>
        
        <div class="modal-info-grid">
            <div class="modal-info-item"><strong>ID</strong><span>${post.id}</span></div>
            <div class="modal-info-item"><strong>Owner</strong><span class="clickable-owner" onclick="window.modalFilterByOwner('${post.owner}')">${post.owner}</span></div>
            <div class="modal-info-item"><strong>Dimensions</strong><span>${post.width}×${post.height}</span></div>
            <div class="modal-info-item"><strong>File Size</strong><span>${fileSizeDisplay}</span></div>
            <div class="modal-info-item"><strong>File Type</strong><span>${post.file_type || 'Unknown'}</span></div>
            <div class="modal-info-item"><strong>Rating</strong><span>${post.rating || 'Unknown'}</span></div>
            <div class="modal-info-item"><strong>Score</strong><span>${post.score}</span></div>
            <div class="modal-info-item"><strong>Tags</strong><span>${post.tags.length}</span></div>
            <div class="modal-info-item"><strong>Uploaded</strong><span>${uploadDate}</span></div>
            <div class="modal-info-item"><strong>Downloaded</strong><span>${downloadDate}</span></div>
            ${post.date_folder ? `<div class="modal-info-item"><strong>Date Folder</strong><span>${post.date_folder}</span></div>` : ''}
            ${post.duration ? `<div class="modal-info-item"><strong>Duration</strong><span>${formatVideoDuration(post.duration)}</span></div>` : ''}
        </div>
        
        ${tagsSection}
    `;
}

/**
 * Render pagination buttons
 */
function renderPaginationButtons(currentPage, totalPages) {
    const buttons = [];
    
    buttons.push(`<button data-page="1" ${currentPage === 1 ? 'disabled' : ''}>⏮️ First</button>`);
    buttons.push(`<button data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>‹ Prev</button>`);
    
    buttons.push(`
        <div class="go-to-page">
            <span>Page</span>
            <input type="number" id="gotoPageInput" value="${currentPage}" min="1" max="${totalPages}">
            <span>of ${totalPages}</span>
            <button id="gotoPageBtn">Go</button>
        </div>
    `);
    
    buttons.push(`<button class="btn-random-page" id="randomPageBtn" title="Random Page" ${totalPages <= 1 ? 'disabled' : ''}>∞</button>`);
    
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
 * Render expanded tags
 */
function renderExpandedTags(tags) {
    return tags.map(t => {
        const tagWithCount = getTagWithCount(t, state.tagCounts);
        return `<span class="${CSS_CLASSES.TAG}" data-tag="${t}" title="${tagWithCount}">${t}</span>`;
    }).join('');
}

window.setupVideoPreviewListeners = setupVideoPreviewListeners;
window.generateMissingThumbnails = generateMissingThumbnails;

export {
    renderPost,
    renderModalContent,
    renderModalActions,
    renderPaginationButtons,
    renderTagHistoryItem,
    renderExpandedTags,
    setupVideoPreviewListeners,
    getMediaUrl,
    isVideoFile,
    isGifFile
};