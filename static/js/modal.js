// Modal Functions - Desktop zoom only, natural layout flow
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
    originalWidth: 0,
    originalHeight: 0
};

let panHandlersAttached = false;

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.5;

const zoomControls = document.getElementById('modalZoomControls');
if (zoomControls) zoomControls.style.pointerEvents = 'none';

function debugZoom(label, img) {
    const rect = img.getBoundingClientRect();

    console.group(`[ZOOM DEBUG] ${label}`);
    console.log('scale:', modalZoomState.scale);
    console.log('translateX:', modalZoomState.translateX);
    console.log('translateY:', modalZoomState.translateY);
    console.log('img rect:', {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
    });
    console.log('transform:', img.style.transform);
    console.groupEnd();
}

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
    
    // Render actions at TOP
    const actionsHtml = renderModalActions(post);
    document.getElementById('modalActionsTop').innerHTML = actionsHtml;
    
    // Check if mobile
    const isMobile = window.innerWidth <= 768;
    
    if (isVideo) {
        img.style.display = 'none';
        video.style.display = 'block';
        video.src = mediaUrl;
        
        // Hide zoom controls for video
        document.getElementById('modalZoomControls').style.display = 'none';
    } else {
        video.style.display = 'none';
        img.style.display = 'block';
        img.src = mediaUrl;
        
        // Show zoom controls only on desktop
        if (!isMobile) {
            document.getElementById('modalZoomControls').style.display = 'flex';
            
            // Setup pan/zoom for desktop only
            setupImagePanZoom(img);
        } else {
            document.getElementById('modalZoomControls').style.display = 'none';
        }
    }
    
    // Render modal info (below media)
    document.getElementById(ELEMENT_IDS.MODAL_INFO).innerHTML = renderModalContent(post);
    
    // Attach tag click listeners
    attachModalTagListeners();
    
    img.onload = () => {
        console.log('[IMAGE LOADED]', {
            width: img.width,
            height: img.height,
            offsetWidth: img.offsetWidth,
            offsetHeight: img.offsetHeight,
            rect: img.getBoundingClientRect()
        });

        modalZoomState.scale = 1;
        modalZoomState.translateX = 0;
        modalZoomState.translateY = 0;

        applyInitialVerticalOffset(img);

        const zoomControls = document.getElementById('modalZoomControls');
        if (zoomControls) zoomControls.style.pointerEvents = 'auto';
    };

}

function setupImagePanZoom(img) {
    if (panHandlersAttached) return;
    panHandlersAttached = true;

    applyTransform(img);

    const handleMouseDown = (e) => {
        if (!img || img.style.display === 'none') return;
        if (modalZoomState.scale <= 1) return;
        if (e.target !== img) return;

        e.preventDefault();
        e.stopPropagation();

        modalZoomState.isDragging = true;
        modalZoomState.startX = e.clientX - modalZoomState.translateX;
        modalZoomState.startY = e.clientY - modalZoomState.translateY;
    };

    const handleMouseMove = (e) => {
        if (!modalZoomState.isDragging) return;

        modalZoomState.translateX = e.clientX - modalZoomState.startX;
        modalZoomState.translateY = e.clientY - modalZoomState.startY;

        applyTransform(img);
    };

    const handleMouseUp = () => {
        modalZoomState.isDragging = false;
    };

    img.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    setupZoomButtons(img);
}

function setupZoomButtons(img) {
    const zoomIn = document.querySelector('.zoom-in');
    const zoomOut = document.querySelector('.zoom-out');
    const zoomReset = document.querySelector('.zoom-reset');
    
    if (zoomIn) {
        zoomIn.onclick = (e) => {
            e.stopPropagation();

            console.log('--- ZOOM IN CLICK ---');

            const prevScale = modalZoomState.scale;
            const nextScale = Math.min(MAX_ZOOM, prevScale + ZOOM_STEP);

            console.log('prevScale:', prevScale);
            console.log('nextScale:', nextScale);
            console.log('before:', {
                x: modalZoomState.translateX,
                y: modalZoomState.translateY
            });

            modalZoomState.scale = nextScale;

            applyTransform(img);

            console.log('after:', {
                x: modalZoomState.translateX,
                y: modalZoomState.translateY
            });
        };
    }
    
    if (zoomOut) {
        zoomOut.onclick = (e) => {
            e.stopPropagation();
            modalZoomState.scale = Math.max(MIN_ZOOM, modalZoomState.scale - ZOOM_STEP);
            
            if (modalZoomState.scale === 1) {
                modalZoomState.translateX = 0;
                modalZoomState.translateY = 0;
                img.style.position = '';
                img.style.top = '';
                img.style.left = '';
            }
            
            applyTransform(img);
        };
    }
    
    if (zoomReset) {
        zoomReset.onclick = (e) => {
            e.stopPropagation();
            modalZoomState.scale = 1;
            modalZoomState.translateX = 0;
            modalZoomState.translateY = 0;
            img.style.position = '';
            img.style.top = '';
            img.style.left = '';
            applyTransform(img);
        };
    }
}

function applyTransform(img) {
    if (!img) return;

    const { scale, translateX, translateY } = modalZoomState;

    if (scale > 1) {
        img.classList.add('zoomed');
        img.style.transform = `translate(calc(-50% + ${translateX}px), calc(-50% + ${translateY}px)) scale(${scale})`;
    } else {
        img.classList.remove('zoomed');
        img.style.transform = '';
        img.style.position = '';
        img.style.top = '';
        img.style.left = '';
    }

    debugZoom('applyTransform', img);
}

function applyInitialVerticalOffset(img) {
    const rect = img.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    const overflow = rect.bottom - viewportHeight;

    console.log('[INIT OFFSET]');
    console.log('img bottom:', rect.bottom);
    console.log('viewport height:', viewportHeight);
    console.log('overflow:', overflow);

    if (overflow > 0) {
        modalZoomState.translateY = -overflow / 2;
        applyTransform(img);
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

    document.body.classList.remove('modal-open');

    const video = document.getElementById(ELEMENT_IDS.MODAL_VIDEO);
    video.pause();
    video.src = '';

    modalZoomState = {
        scale: 1,
        translateX: 0,
        translateY: 0,
        isDragging: false,
        startX: 0,
        startY: 0
    };

    panHandlersAttached = false;

    const img = document.getElementById(ELEMENT_IDS.MODAL_IMAGE);
    img.classList.remove('zoomed');
    img.style.transform = '';
}

// Setup click-outside-to-close
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById(ELEMENT_IDS.IMAGE_MODAL);
    const mediaContainer = document.getElementById('modalMediaContainer');
    
    if (modal && mediaContainer) {
        // Click on modal background closes
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
        
        // Click on media container (around image) closes
        mediaContainer.addEventListener('click', (e) => {
            const clickedElement = e.target;
            const img = document.getElementById(ELEMENT_IDS.MODAL_IMAGE);
            const video = document.getElementById(ELEMENT_IDS.MODAL_VIDEO);
            
            // Don't close if clicking on:
            // - The image/video
            // - Nav buttons
            // - Zoom controls
            if (clickedElement === img || 
                clickedElement === video ||
                clickedElement.closest('.modal-nav') ||
                clickedElement.closest('.modal-zoom-controls') ||
                clickedElement.closest('.video-duration')) {
                return;
            }
            
            // Clicked on empty space - close
            closeModal();
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
    navigateModal(1);
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