// Bulk Operations
import { state } from './state.js';
import { showNotification } from './utils.js';
import { savePost, discardPost, deletePost } from './api.js';
import { loadPosts, clearSelection } from './posts.js';
import { ELEMENT_IDS, CSS_CLASSES, POST_STATUS, BULK_OPERATIONS, RATE_LIMIT } from './constants.js';

async function bulkSavePosts() {
    const selectedPosts = Array.from(state.selectedPosts).map(id => {
        return state.allPosts.find(p => p.id === id);
    }).filter(p => p && p.status === POST_STATUS.PENDING);
    
    await performBulkOperation(BULK_OPERATIONS.SAVE, selectedPosts.map(p => p.id));
}

async function bulkDiscardPosts() {
    const selectedPosts = Array.from(state.selectedPosts).map(id => {
        return state.allPosts.find(p => p.id === id);
    }).filter(p => p && p.status === POST_STATUS.PENDING);
    
    await performBulkOperation(BULK_OPERATIONS.DISCARD, selectedPosts.map(p => p.id));
}

async function bulkDeletePosts() {
    const selectedPosts = Array.from(state.selectedPosts).map(id => {
        return state.allPosts.find(p => p.id === id);
    }).filter(p => p && p.status === POST_STATUS.SAVED);
    
    if (!confirm(`Delete ${selectedPosts.length} posts permanently?`)) return;
    
    await performBulkOperation(BULK_OPERATIONS.DELETE, selectedPosts);
}

async function performBulkOperation(operation, posts) {
    if (posts.length === 0) return;
    
    state.bulkOperationActive = true;
    const progressContainer = document.getElementById(ELEMENT_IDS.POSTS_BULK_PROGRESS);
    const progressBar = document.getElementById(ELEMENT_IDS.POSTS_PROGRESS_BAR);
    const progressText = document.getElementById(ELEMENT_IDS.POSTS_PROGRESS_TEXT);
    
    progressContainer.classList.add(CSS_CLASSES.SHOW);
    
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let cancelled = false;
    
    const cancelBtn = document.getElementById(ELEMENT_IDS.CANCEL_BULK_POSTS);
    cancelBtn.onclick = () => { cancelled = true; };
    
    // Initialize progress display
    progressText.textContent = `Processing 0 / ${posts.length} posts...`;
    progressBar.style.width = '0%';
    progressBar.textContent = '0%';
    
    for (const post of posts) {
        if (cancelled) {
            showNotification(`Operation cancelled. ${succeeded} succeeded, ${failed} failed.`, 'warning');
            break;
        }
        
        try {
            const postId = typeof post === 'number' ? post : post.id;
            
            if (operation === BULK_OPERATIONS.SAVE) {
                await savePost(postId);
                succeeded++;
            } else if (operation === BULK_OPERATIONS.DISCARD) {
                await discardPost(postId);
                succeeded++;
            } else if (operation === BULK_OPERATIONS.DELETE) {
                await deletePost(post.id, post.date_folder);
                succeeded++;
            }
        } catch (error) {
            console.error(`Failed to ${operation} post:`, error);
            failed++;
        }
        
        processed++;
        const percent = Math.round((processed / posts.length) * 100);
        progressBar.style.width = percent + '%';
        progressBar.textContent = percent + '%';
        progressText.textContent = `${processed} / ${posts.length} completed (${succeeded} succeeded, ${failed} failed)`;
        
        // Rate limiting delay - only after every batch to avoid slowing down too much
        if (processed % RATE_LIMIT.REQUESTS_PER_MINUTE === 0 && processed < posts.length) {
            progressText.textContent = `${processed} / ${posts.length} completed - Rate limit pause...`;
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT.DELAY_AFTER_BATCH));
        }
    }
    
    progressContainer.classList.remove(CSS_CLASSES.SHOW);
    state.bulkOperationActive = false;
    clearSelection();
    
    await loadPosts();
    
    if (!cancelled) {
        showNotification(`Bulk ${operation} completed: ${succeeded} succeeded, ${failed} failed`);
    }
}

export { bulkSavePosts, bulkDiscardPosts, bulkDeletePosts };