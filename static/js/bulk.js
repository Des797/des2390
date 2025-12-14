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
    let cancelled = false;
    
    const cancelBtn = document.getElementById(ELEMENT_IDS.CANCEL_BULK_POSTS);
    cancelBtn.onclick = () => { cancelled = true; };
    
    const estimatedTime = Math.ceil(posts.length / RATE_LIMIT.REQUESTS_PER_MINUTE) * 60;
    progressText.textContent = `Processing ${posts.length} posts... Est. ${Math.ceil(estimatedTime / 60)} min`;
    
    for (const post of posts) {
        if (cancelled) {
            showNotification('Operation cancelled', 'warning');
            break;
        }
        
        try {
            const postId = typeof post === 'number' ? post : post.id;
            
            if (operation === BULK_OPERATIONS.SAVE) {
                await savePost(postId);
            } else if (operation === BULK_OPERATIONS.DISCARD) {
                await discardPost(postId);
            } else if (operation === BULK_OPERATIONS.DELETE) {
                await deletePost(post.id, post.date_folder);
            }
            
            processed++;
            const percent = Math.round((processed / posts.length) * 100);
            progressBar.style.width = percent + '%';
            progressBar.textContent = percent + '%';
            progressText.textContent = `${processed} / ${posts.length} completed`;
            
            // Rate limiting delay
            if (processed % RATE_LIMIT.REQUESTS_PER_MINUTE === 0) {
                await new Promise(resolve => setTimeout(resolve, RATE_LIMIT.DELAY_AFTER_BATCH));
            }
        } catch (error) {
            console.error(`Failed to ${operation} post:`, error);
        }
    }
    
    progressContainer.classList.remove(CSS_CLASSES.SHOW);
    state.bulkOperationActive = false;
    clearSelection();
    
    await loadPosts();
    
    showNotification(`Bulk ${operation} completed: ${processed} posts`);
}

export { bulkSavePosts, bulkDiscardPosts, bulkDeletePosts };