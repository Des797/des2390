// Event Handler Registration
import { state } from './state.js';
import { saveConfig, addBlacklistTags, showSearchDropdown, hideSearchDropdown } from './config.js';
import { startScraper, stopScraper, loadTagHistory } from './scraper_ui.js';
import { loadPosts, clearSelection, selectAllOnPage, selectAllMatching, invertSelection, filterByTag, filterByOwner, savePostAction, discardPostAction, deletePostAction, toggleSortOrder, performSearch } from './posts.js';
import { bulkSavePosts, bulkDiscardPosts, bulkDeletePosts } from './bulk.js';
import { showFullMedia, navigateModal, closeModal } from './modal.js';
import { switchTab } from './navigation.js';
import { renderExpandedTags, setupVideoPreviewListeners } from './posts_renderer.js';
import { ELEMENT_IDS, CSS_CLASSES, KEYS } from './constants.js';

/**
 * Toggle post selection
 */
function toggleSelection(postId) {
    if (state.selectedPosts.has(postId)) {
        state.selectedPosts.delete(postId);
    } else {
        state.selectedPosts.add(postId);
    }
    
    const item = document.querySelector(`.${CSS_CLASSES.GALLERY_ITEM}[data-post-id="${postId}"]`);
    const checkbox = item.querySelector(`.${CSS_CLASSES.SELECT_CHECKBOX}`);
    
    if (state.selectedPosts.has(postId)) {
        item.classList.add(CSS_CLASSES.SELECTED);
        checkbox.classList.add(CSS_CLASSES.CHECKED);
    } else {
        item.classList.remove(CSS_CLASSES.SELECTED);
        checkbox.classList.remove(CSS_CLASSES.CHECKED);
    }
    
    // Import and call updateBulkControls from posts.js
    import('./posts.js').then(module => module.updateBulkControls());
}

/**
 * Attach event listeners to post elements
 */
function attachPostEventListeners() {
    // Select checkboxes
    document.querySelectorAll(`.${CSS_CLASSES.SELECT_CHECKBOX}`).forEach(checkbox => {
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            const postId = parseInt(checkbox.dataset.id);
            toggleSelection(postId);
        });
    });
    
    // Media click to view
    document.querySelectorAll(`.${CSS_CLASSES.MEDIA_WRAPPER}`).forEach(wrapper => {
        wrapper.addEventListener('click', () => {
            const postId = parseInt(wrapper.dataset.id);
            showFullMedia(postId);
        });
    });
    
    // Owner filter
    document.querySelectorAll(`.${CSS_CLASSES.GALLERY_ITEM_OWNER}`).forEach(owner => {
        owner.addEventListener('click', () => {
            filterByOwner(owner.dataset.owner);
        });
    });
    
    // Tag filter
    document.querySelectorAll(`.gallery-item-tags .${CSS_CLASSES.TAG}`).forEach(tag => {
        tag.addEventListener('click', () => {
            filterByTag(tag.dataset.tag);
        });
    });
    
// Expand tags with dropdown (no card resize)
    document.querySelectorAll(`.${CSS_CLASSES.EXPAND_TAGS}`).forEach(btn => {
        btn.addEventListener('click', async function(e) {
            e.stopPropagation();
            
            const allTags = JSON.parse(this.dataset.allTags);
            const matchingTags = JSON.parse(this.dataset.matching || '[]');
            
            // Try to use dropdown if enhancements available, otherwise fallback to inline
            try {
                const module = await import('./posts_enhancements.js');
                const tagsWithMatch = allTags.map(tag => ({
                    name: tag,
                    display: getTagWithCount(tag, state.tagCounts),
                    isMatching: matchingTags.includes(tag)
                }));
                
                module.showTagDropdown(this, tagsWithMatch);
            } catch (err) {
                // Fallback: expand inline
                const container = this.parentElement;
                container.innerHTML = renderExpandedTags(allTags);
                
                // Re-attach tag listeners
                container.querySelectorAll(`.${CSS_CLASSES.TAG}`).forEach(tag => {
                    tag.addEventListener('click', () => filterByTag(tag.dataset.tag));
                });
            }
        });
    });
    
    // Action buttons
    document.querySelectorAll(`.${CSS_CLASSES.SAVE_BTN}`).forEach(btn => {
        btn.addEventListener('click', async () => {
            await savePostAction(parseInt(btn.dataset.id));
        });
    });
    
    document.querySelectorAll(`.${CSS_CLASSES.DISCARD_BTN}`).forEach(btn => {
        btn.addEventListener('click', async () => {
            await discardPostAction(parseInt(btn.dataset.id));
        });
    });
    
    document.querySelectorAll(`.${CSS_CLASSES.VIEW_BTN}`).forEach(btn => {
        btn.addEventListener('click', () => showFullMedia(parseInt(btn.dataset.id)));
    });
    
    document.querySelectorAll(`.${CSS_CLASSES.VIEW_R34_BTN}`).forEach(btn => {
        btn.addEventListener('click', () => {
            window.open(`https://rule34.xxx/index.php?page=post&s=view&id=${btn.dataset.id}`, '_blank');
        });
    });
    
    document.querySelectorAll(`.${CSS_CLASSES.DELETE_BTN}`).forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('Delete this post permanently?')) {
                await deletePostAction(parseInt(btn.dataset.id), btn.dataset.folder);
            }
        });
    });
}

/**
 * Attach media error handling with automatic extension fallback
 */
function setupMediaErrorHandlers() {
    // Image elements
    document.querySelectorAll('.gallery-item-media img').forEach(img => {
        img.addEventListener('error', async () => {
            const postId = img.dataset.postId;
            const currentSrc = img.src;

            console.warn(`[Media] Image failed: ${currentSrc} (post ${postId})`);

            const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
            const urlObj = new URL(currentSrc);
            const pathParts = urlObj.pathname.split('.');
            if (pathParts.length < 2) return;

            const currentExt = '.' + pathParts.pop();
            const basePath = pathParts.join('.');

            for (const ext of extensions) {
                if (ext.toLowerCase() === currentExt.toLowerCase()) continue;

                const alternativeUrl = `${urlObj.origin}${basePath}${ext}`;
                try {
                    const res = await fetch(alternativeUrl, { method: 'HEAD' });
                    if (res.ok) {
                        console.log(`[Media] Found alternative: ${alternativeUrl}`);
                        img.src = alternativeUrl;

                        const post = state.allPosts.find(p => p.id === parseInt(postId));
                        if (post) post.file_type = ext;
                        return;
                    }
                } catch (err) { /* ignore */ }
            }

            // All attempts failed
            img.style.opacity = '0.3';
            img.style.filter = 'grayscale(100%)';
            console.error(`[Media] All attempts failed for post ${postId}`);
        });
    });

    // Video elements
    document.querySelectorAll('.gallery-item-media video').forEach(video => {
        video.addEventListener('error', async () => {
            const postId = video.dataset.postId;
            const currentSrc = video.src;

            console.warn(`[Media] Video failed: ${currentSrc} (post ${postId})`);

            const extensions = ['.mp4', '.webm'];
            const urlObj = new URL(currentSrc);
            const pathParts = urlObj.pathname.split('.');
            if (pathParts.length < 2) return;

            const currentExt = '.' + pathParts.pop();
            const basePath = pathParts.join('.');

            for (const ext of extensions) {
                if (ext.toLowerCase() === currentExt.toLowerCase()) continue;

                const alternativeUrl = `${urlObj.origin}${basePath}${ext}`;
                try {
                    const res = await fetch(alternativeUrl, { method: 'HEAD' });
                    if (res.ok) {
                        console.log(`[Media] Found alternative video: ${alternativeUrl}`);
                        video.src = alternativeUrl;

                        const post = state.allPosts.find(p => p.id === parseInt(postId));
                        if (post) post.file_type = ext;
                        return;
                    }
                } catch (err) { /* ignore */ }
            }

            console.error(`[Media] All attempts failed for video post ${postId}`);
        });
    });
}

/**
 * Attach modal tag click listeners
 */
function attachModalTagListeners() {
    document.querySelectorAll(`.modal-tags .${CSS_CLASSES.TAG}`).forEach(tag => {
        tag.addEventListener('click', () => {
            closeModal();
            filterByTag(tag.dataset.tag);
        });
    });
}

/**
 * Setup configuration event listeners
 */
function setupConfigListeners() {
    document.getElementById(ELEMENT_IDS.SAVE_CONFIG_BTN).addEventListener('click', saveConfig);
    document.getElementById(ELEMENT_IDS.START_BTN).addEventListener('click', startScraper);
    document.getElementById(ELEMENT_IDS.STOP_BTN).addEventListener('click', stopScraper);
    
    // Queue buttons
    const addToQueueBtn = document.getElementById('addToQueueBtn');
    if (addToQueueBtn) {
        addToQueueBtn.addEventListener('click', () => {
            import('./scraper_ui.js').then(module => module.addToQueue());
        });
    }
    
    const clearQueueBtn = document.getElementById('clearQueueBtn');
    if (clearQueueBtn) {
        clearQueueBtn.addEventListener('click', () => {
            import('./scraper_ui.js').then(module => module.clearQueue());
        });
    }
    
    // Copy log button
    const copyLogBtn = document.getElementById('copyLogBtn');
    if (copyLogBtn) {
        copyLogBtn.addEventListener('click', () => {
            import('./scraper_ui.js').then(module => module.copyScraperLog());
        });
    }

    // Clear log button
    const clearLogBtn = document.getElementById('clearLogBtn');
    if (clearLogBtn) {
        clearLogBtn.addEventListener('click', () => {
            import('./scraper_ui.js').then(module => module.clearScraperLog());
        });
    }
    
    // Search input
    const searchInput = document.getElementById(ELEMENT_IDS.SEARCH_TAGS);
    searchInput.addEventListener('focus', showSearchDropdown);
    searchInput.addEventListener('blur', hideSearchDropdown);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === KEYS.ENTER) startScraper();
    });
    
    // Blacklist
    document.getElementById(ELEMENT_IDS.ADD_BLACKLIST_BTN).addEventListener('click', addBlacklistTags);
    document.getElementById(ELEMENT_IDS.BLACKLIST_INPUT).addEventListener('keydown', (e) => {
        if (e.key === KEYS.ENTER && !e.shiftKey) {
            e.preventDefault();
            addBlacklistTags();
        }
    });
}

/**
 * Setup tab navigation listeners
 */
function setupTabListeners() {
    document.querySelectorAll(`.${CSS_CLASSES.NAV_TAB}`).forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
}

/**
 * Setup posts control listeners
 */
function setupPostsControlListeners() {
    document.getElementById(ELEMENT_IDS.POSTS_STATUS_FILTER).addEventListener('change', (e) => {
        state.postsStatusFilter = e.target.value;
        state.postsPage = 1;
        loadPosts();
    });
    
    document.getElementById(ELEMENT_IDS.POSTS_SORT).addEventListener('change', (e) => {
        state.postsSortBy = e.target.value;
        state.postsPage = 1;
        loadPosts();
    });
    
    // Sort order toggle button
    document.getElementById(ELEMENT_IDS.POSTS_SORT_ORDER).addEventListener('click', () => {
        toggleSortOrder();
    });
    
    // Per page input with validation
    const perPageInput = document.getElementById(ELEMENT_IDS.POSTS_PER_PAGE);
    perPageInput.addEventListener('change', () => {
        state.postsPage = 1;
        loadPosts();
    });
    
    // Also trigger on Enter key
    perPageInput.addEventListener('keypress', (e) => {
        if (e.key === KEYS.ENTER) {
            state.postsPage = 1;
            loadPosts();
        }
    });
    
    // Search input - only update on Enter or button click, not on input
    const searchInput = document.getElementById(ELEMENT_IDS.POSTS_SEARCH_INPUT);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === KEYS.ENTER) {
            performSearch();
        }
    });
    
    // Search button
    const searchButton = document.getElementById(ELEMENT_IDS.POSTS_SEARCH_BUTTON);
    if (searchButton) {
        searchButton.addEventListener('click', () => {
            performSearch();
        });
    }
}

/**
 * Setup tag history control listeners
 */
function setupTagHistoryListeners() {
    document.getElementById(ELEMENT_IDS.TAG_HISTORY_PER_PAGE).addEventListener('change', () => {
        state.tagHistoryPage = 1;
        loadTagHistory();
    });
}

/**
 * Setup bulk action listeners
 */
function setupBulkActionListeners() {
    document.getElementById(ELEMENT_IDS.SELECT_ALL_POSTS).addEventListener('click', selectAllOnPage);
    document.getElementById(ELEMENT_IDS.SELECT_ALL_POSTS_GLOBAL).addEventListener('click', selectAllMatching);
    document.getElementById(ELEMENT_IDS.INVERT_SELECTION_POSTS).addEventListener('click', invertSelection);
    document.getElementById(ELEMENT_IDS.CLEAR_SELECTION_POSTS).addEventListener('click', clearSelection);
    document.getElementById(ELEMENT_IDS.BULK_SAVE_POSTS).addEventListener('click', bulkSavePosts);
    document.getElementById(ELEMENT_IDS.BULK_DISCARD_POSTS).addEventListener('click', bulkDiscardPosts);
    document.getElementById(ELEMENT_IDS.BULK_DELETE_POSTS).addEventListener('click', bulkDeletePosts);
}

/**
 * Setup modal control listeners
 */
function setupModalListeners() {
    document.getElementById(ELEMENT_IDS.MODAL_CLOSE).addEventListener('click', closeModal);
    document.getElementById(ELEMENT_IDS.MODAL_PREV).addEventListener('click', () => navigateModal(-1));
    document.getElementById(ELEMENT_IDS.MODAL_NEXT).addEventListener('click', () => navigateModal(1));
    
    // Click outside modal to close
    document.getElementById(ELEMENT_IDS.IMAGE_MODAL).addEventListener('click', (e) => {
        if (e.target.id === ELEMENT_IDS.IMAGE_MODAL) closeModal();
    });
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.key === KEYS.ESCAPE) closeModal();
        
        const modalElement = document.getElementById(ELEMENT_IDS.IMAGE_MODAL);
        if (modalElement.classList.contains(CSS_CLASSES.SHOW)) {
            if (e.key === KEYS.ARROW_LEFT) navigateModal(-1);
            if (e.key === KEYS.ARROW_RIGHT) navigateModal(1);
        }
    });
}

/**
 * Setup pagination event listeners
 */
function setupPaginationListeners(containerId, callback) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.querySelectorAll('button[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = parseInt(btn.dataset.page);
            callback(page);
        });
    });
}

/**
 * Initialize all event listeners
 */
function initializeEventListeners() {
    setupConfigListeners();
    setupTabListeners();
    setupPostsControlListeners();
    setupTagHistoryListeners();
    setupBulkActionListeners();
    setupModalListeners();
    setupKeyboardShortcuts();
}

export {
    attachPostEventListeners,
    attachModalTagListeners,
    setupPaginationListeners,
    initializeEventListeners,
    setupMediaErrorHandlers,
    toggleSelection
};