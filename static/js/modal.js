// Modal Functions - FIXED with mobile zoom removal
import { state } from './state.js';
import { renderModalContent, getMediaUrl, isVideoFile } from './posts_renderer.js';
import { attachModalTagListeners } from './event_handlers.js';
import { savePostAction, discardPostAction, deletePostAction, filterByOwner } from './posts.js';
import { ELEMENT_IDS, CSS_CLASSES } from './constants.js';

function showFullMedia(postId) {
    const posts = state.allPosts;
    const index = posts.findIndex(p => p.id === postId);
    if (index === -1) return;
    
    state.currentModalIndex = index;
    const post = posts[index];
    
    displayModalPost(post);
    
    const modal = document.getElementById(ELEMENT_IDS.IMAGE_MODAL);
    modal.classList.add(CSS_CLASSES.SHOW);
    
    // Prevent body scroll
    document.body.classList.add('modal-open');
    
    // Add tint for pending posts
    const modalContent = modal.querySelector('.modal-content');
    if (post.status === 'pending') {
        modalContent.classList.add('pending-post');
    } else {
        modalContent.classList.remove('pending-post');
    }
}

function displayModalPost(post) {
    const isVideo = isVideoFile(post.file_type);
    const mediaUrl = getMediaUrl(post);
    
    const img = document.getElementById(ELEMENT_IDS.MODAL_IMAGE);
    const video = document.getElementById(ELEMENT_IDS.MODAL_VIDEO);
    
    if (isVideo) {
        img.style.display = 'none';
        video.style.display = 'block';
        video.src = mediaUrl;
    } else {
        video.style.display = 'none';
        img.style.display = 'block';
        img.src = mediaUrl;
        setupImageZoom(img);
    }
    
    // Render modal content using renderer
    document.getElementById(ELEMENT_IDS.MODAL_INFO).innerHTML = renderModalContent(post);
    
    // Attach tag click listeners
    attachModalTagListeners();
    injectZoomControls();
}

let zoomLevel = 1;

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.5;

function setupImageZoom(img) {
    resetZoom(img);

    // Prevent native drag behavior
    img.draggable = false;

    const isDesktop = window.innerWidth > 768;
    if (!isDesktop) return;
}

function applyTransform(img) {
    img.style.transform = `scale(${zoomLevel})`;
}

function zoomIn(img) {
    zoomLevel = Math.min(MAX_ZOOM, zoomLevel + ZOOM_STEP);
    img.classList.add('zoomed');
    applyTransform(img);
}

function zoomOut(img) {
    zoomLevel = Math.max(MIN_ZOOM, zoomLevel - ZOOM_STEP);

    if (zoomLevel === 1) {
        resetZoom(img);
    } else {
        applyTransform(img);
    }
}

function resetZoom(img) {
    zoomLevel = 1;

    img.classList.remove('zoomed');
    img.style.transform = 'scale(1)';
}

function injectZoomControls() {
    const actions = document.querySelector('.modal-actions');
    if (!actions || actions.querySelector('.zoom-controls')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'zoom-controls';
    wrapper.style.display = 'flex';
    wrapper.style.gap = '8px';

    wrapper.innerHTML = `
        <button class="btn zoom-in">+</button>
        <button class="btn zoom-out">−</button>
        <button class="btn zoom-reset">Reset</button>
    `;

    actions.appendChild(wrapper);

    const img = document.getElementById(ELEMENT_IDS.MODAL_IMAGE);

    wrapper.querySelector('.zoom-in').onclick = () => zoomIn(img);
    wrapper.querySelector('.zoom-out').onclick = () => zoomOut(img);
    wrapper.querySelector('.zoom-reset').onclick = () => resetZoom(img);
}

function navigateModal(direction) {
    const posts = state.allPosts;
    state.currentModalIndex = (state.currentModalIndex + direction + posts.length) % posts.length;
    displayModalPost(posts[state.currentModalIndex]);
}

function closeModal() {
    const modal = document.getElementById(ELEMENT_IDS.IMAGE_MODAL);
    modal.classList.remove(CSS_CLASSES.SHOW);
    
    // Restore body scroll
    document.body.classList.remove('modal-open');
    
    const video = document.getElementById(ELEMENT_IDS.MODAL_VIDEO);
    video.pause();
    video.src = '';
    
    // Reset image zoom
    const img = document.getElementById(ELEMENT_IDS.MODAL_IMAGE);
    img.classList.remove('zoomed');
    img.onclick = null;
}

// Setup click-outside-to-close - only on modal background
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById(ELEMENT_IDS.IMAGE_MODAL);
    if (modal) {
        modal.addEventListener('click', (e) => {
            // Only close if clicking directly on modal background (not content)
            if (e.target === modal) {
                closeModal();
            }
        });
    }
});

// Global functions for modal buttons
window.modalSavePost = async (postId) => {
    await savePostAction(postId);
    closeModal();
};

window.modalDiscardPost = async (postId) => {
    await discardPostAction(postId);
    closeModal();
};

window.modalDeletePost = async (postId, dateFolder) => {
    await deletePostAction(postId, dateFolder);
    closeModal();
};

window.modalFilterByOwner = (owner) => {
    closeModal();
    filterByOwner(owner);
};

export { showFullMedia, navigateModal, closeModal };