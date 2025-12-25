// Modal Functions - Complete with Pan/Zoom
import { state } from './state.js';
import { renderModalContent, renderModalActions, getMediaUrl, isVideoFile } from './posts_renderer.js';
import { attachModalTagListeners } from './event_handlers.js';
import { savePostAction, discardPostAction, deletePostAction, filterByOwner } from './posts.js';
import { ELEMENT_IDS, CSS_CLASSES } from './constants.js';

// Pan/Zoom state
let modalZoomState = {
    scale: 1,
    translateX: 0,
    translateY: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
    lastTouchDistance: 0
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.5;
const WHEEL_ZOOM_FACTOR = 0.1;

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

    // Wrap DOM lookups
    const img = document.getElementById(ELEMENT_IDS.MODAL_IMAGE);
    const video = document.getElementById(ELEMENT_IDS.MODAL_VIDEO);
    const actionsTop = document.getElementById(ELEMENT_IDS.MODAL_ACTIONS_TOP);
    const zoomControls = document.getElementById('modalZoomControls');
    const modalInfo = document.getElementById(ELEMENT_IDS.MODAL_INFO);

    // Retry if modal elements not yet in DOM
    if (!img || !video || !actionsTop || !zoomControls || !modalInfo) {
        console.warn('Modal elements not found, retrying in 50ms...');
        setTimeout(() => displayModalPost(post), 50);
        return;
    }

    // Render actions at TOP
    actionsTop.innerHTML = renderModalActions(post);

    if (isVideo) {
        img.style.display = 'none';
        video.style.display = 'block';
        video.src = mediaUrl;

        // Hide zoom controls for video
        zoomControls.style.display = 'none';
    } else {
        video.style.display = 'none';
        img.style.display = 'block';
        img.src = mediaUrl;

        // Show zoom controls for images
        zoomControls.style.display = 'flex';

        // Setup pan/zoom
        setupImagePanZoom(img);
    }

    // Render modal info (below media)
    modalInfo.innerHTML = renderModalContent(post);

    // Attach tag click listeners
    attachModalTagListeners();
}


function setupImagePanZoom(img) {
    // Keep existing zoom level when navigating
    // (zoom is only reset when modal is closed)
    applyTransform(img);
    
    const wrapper = document.getElementById('modalMediaWrapper');
    
    // Desktop: Mouse wheel zoom
    const handleWheel = (e) => {
        if (!img || img.style.display === 'none') return;
        
        e.preventDefault();
        
        const delta = -Math.sign(e.deltaY);
        const newZoom = modalZoomState.scale + (delta * WHEEL_ZOOM_FACTOR);
        
        modalZoomState.scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
        
        if (modalZoomState.scale === 1) {
            modalZoomState.translateX = 0;
            modalZoomState.translateY = 0;
        }
        
        applyTransform(img);
    };
    
    wrapper.addEventListener('wheel', handleWheel, { passive: false });
    
    // Desktop: Click and drag
    const handleMouseDown = (e) => {
        if (!img || img.style.display === 'none') return;
        if (modalZoomState.scale <= 1) return; // Only drag when zoomed
        
        modalZoomState.isDragging = true;
        modalZoomState.startX = e.clientX - modalZoomState.translateX;
        modalZoomState.startY = e.clientY - modalZoomState.translateY;
        
        wrapper.classList.add('dragging');
        img.classList.add('dragging');
    };
    
    const handleMouseMove = (e) => {
        if (!modalZoomState.isDragging) return;
        
        e.preventDefault();
        modalZoomState.translateX = e.clientX - modalZoomState.startX;
        modalZoomState.translateY = e.clientY - modalZoomState.startY;
        
        applyTransform(img);
    };
    
    const handleMouseUp = () => {
        modalZoomState.isDragging = false;
        wrapper.classList.remove('dragging');
        img.classList.remove('dragging');
    };
    
    wrapper.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Mobile: Pinch zoom
    const handleTouchStart = (e) => {
        if (!img || img.style.display === 'none') return;
        
        if (e.touches.length === 2) {
            // Pinch zoom
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            modalZoomState.lastTouchDistance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
        } else if (e.touches.length === 1 && modalZoomState.scale > 1) {
            // Single touch drag (when zoomed)
            modalZoomState.isDragging = true;
            modalZoomState.startX = e.touches[0].clientX - modalZoomState.translateX;
            modalZoomState.startY = e.touches[0].clientY - modalZoomState.translateY;
        }
    };
    
    const handleTouchMove = (e) => {
        if (!img || img.style.display === 'none') return;
        
        if (e.touches.length === 2) {
            // Pinch zoom
            e.preventDefault();
            
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const currentDistance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
            
            if (modalZoomState.lastTouchDistance > 0) {
                const scaleFactor = currentDistance / modalZoomState.lastTouchDistance;
                modalZoomState.scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, modalZoomState.scale * scaleFactor));
                
                if (modalZoomState.scale === 1) {
                    modalZoomState.translateX = 0;
                    modalZoomState.translateY = 0;
                }
                
                applyTransform(img);
            }
            
            modalZoomState.lastTouchDistance = currentDistance;
        } else if (e.touches.length === 1 && modalZoomState.isDragging) {
            // Single touch drag
            e.preventDefault();
            
            modalZoomState.translateX = e.touches[0].clientX - modalZoomState.startX;
            modalZoomState.translateY = e.touches[0].clientY - modalZoomState.startY;
            
            applyTransform(img);
        }
    };
    
    const handleTouchEnd = () => {
        modalZoomState.isDragging = false;
        modalZoomState.lastTouchDistance = 0;
    };
    
    wrapper.addEventListener('touchstart', handleTouchStart, { passive: false });
    wrapper.addEventListener('touchmove', handleTouchMove, { passive: false });
    wrapper.addEventListener('touchend', handleTouchEnd);
    
    // Setup zoom buttons
    setupZoomButtons(img);
}

function setupZoomButtons(img) {
    const zoomIn = document.querySelector('.zoom-in');
    const zoomOut = document.querySelector('.zoom-out');
    const zoomReset = document.querySelector('.zoom-reset');
    
    if (zoomIn) {
        zoomIn.onclick = () => {
            modalZoomState.scale = Math.min(MAX_ZOOM, modalZoomState.scale + ZOOM_STEP);
            applyTransform(img);
        };
    }
    
    if (zoomOut) {
        zoomOut.onclick = () => {
            modalZoomState.scale = Math.max(MIN_ZOOM, modalZoomState.scale - ZOOM_STEP);
            
            if (modalZoomState.scale === 1) {
                modalZoomState.translateX = 0;
                modalZoomState.translateY = 0;
            }
            
            applyTransform(img);
        };
    }
    
    if (zoomReset) {
        zoomReset.onclick = () => {
            modalZoomState.scale = 1;
            modalZoomState.translateX = 0;
            modalZoomState.translateY = 0;
            applyTransform(img);
        };
    }
}

function applyTransform(img) {
    if (!img) return;
    
    const transform = `scale(${modalZoomState.scale}) translate(${modalZoomState.translateX / modalZoomState.scale}px, ${modalZoomState.translateY / modalZoomState.scale}px)`;
    img.style.transform = transform;
    
    if (modalZoomState.scale > 1) {
        img.classList.add('zoomed');
    } else {
        img.classList.remove('zoomed');
    }
}

function navigateModal(direction) {
    const posts = state.allPosts;
    state.currentModalIndex = (state.currentModalIndex + direction + posts.length) % posts.length;
    
    // Keep zoom level when navigating
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
    
    // Reset zoom state when closing
    modalZoomState = {
        scale: 1,
        translateX: 0,
        translateY: 0,
        isDragging: false,
        startX: 0,
        startY: 0,
        lastTouchDistance: 0
    };
    
    const img = document.getElementById(ELEMENT_IDS.MODAL_IMAGE);
    img.classList.remove('zoomed');
    img.style.transform = '';
}

// Setup click-outside-to-close - only on modal background
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById(ELEMENT_IDS.IMAGE_MODAL);
    if (modal) {
        modal.addEventListener('click', (e) => {
            // Close if clicking on modal background OR media container background
            if (e.target === modal || e.target.id === 'modalMediaContainer') {
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