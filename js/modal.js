// Modal Functions
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
    displayModalPost(posts[index]);
    document.getElementById(ELEMENT_IDS.IMAGE_MODAL).classList.add(CSS_CLASSES.SHOW);
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
    document.getElementById(ELEMENT_IDS.IMAGE_MODAL).classList.remove(CSS_CLASSES.SHOW);
    const video = document.getElementById(ELEMENT_IDS.MODAL_VIDEO);
    video.pause();
    video.src = '';
}

// Global functions for modal buttons (since they use inline onclick)
window.modalSavePost = async (postId) => {
    await savePostAction(postId);
    closeModal();
};

window.modalDiscardPost = async (postId) => {
    await discardPostAction(postId);
    closeModal();
};

window.modalFilterByOwner = (owner) => {
    closeModal();
    filterByOwner(owner);
};

export { showFullMedia, navigateModal, closeModal };