// Modal Functions - FIXED owner filtering
import { state } from './state.js';
import { renderModalContent, getMediaUrl, isVideoFile } from './posts_renderer.js';
import { attachModalTagListeners } from './event_handlers.js';
import { savePostAction, discardPostAction, filterByTag, filterByOwner } from './posts.js';
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
        
        // Setup zoom functionality
        let zoomed = false;
        img.onclick = () => {
            zoomed = !zoomed;
            if (zoomed) {
                img.classList.add('zoomed');
                img.style.cursor = 'zoom-out';
            } else {
                img.classList.remove('zoomed');
                img.style.cursor = 'zoom-in';
            }
        };
    }
    
    // Render modal content using renderer
    document.getElementById(ELEMENT_IDS.MODAL_INFO).innerHTML = renderModalContent(post);
    
    // Attach tag click listeners
    attachModalTagListeners();
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

// Setup click-outside-to-close
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById(ELEMENT_IDS.IMAGE_MODAL);
    if (modal) {
        modal.addEventListener('click', (e) => {
            // Close if clicking on modal background (not content)
            if (e.target === modal) {
                closeModal();
            }
        });
    }
});

// Global functions for modal buttons (since they use inline onclick)
window.modalSavePost = async (postId) => {
    await savePostAction(postId);
    closeModal();
};

window.modalDiscardPost = async (postId) => {
    await discardPostAction(postId);
    closeModal();
};

// FIXED: Use owner: prefix for proper filtering
window.modalFilterByOwner = (owner) => {
    closeModal();
    filterByOwner(owner);
};

export { showFullMedia, navigateModal, closeModal };