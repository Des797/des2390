// Bulk Operations
import { state } from './state.js';
import { showNotification } from './utils.js';
import { savePost, discardPost, deletePost } from './api.js';
import { loadPosts, clearSelection } from './posts.js';

async function bulkSavePosts() {
    const selectedPosts = Array.from(state.selectedPosts).map(id => {
        return state.allPosts.find(p => p.id === id);
    }).filter(p => p && p.status === 'pending');
    
    await performBulkOperation('save', selectedPosts.map(p => p.id));
}

async function bulkDiscardPosts() {
    const selectedPosts = Array.from(state.selectedPosts).map(id => {
        return state.allPosts.find(p => p.id === id);
    }).filter(p => p && p.status === 'pending');
    
    await performBulkOperation('discard', selectedPosts.map(p => p.id));
}

async function bulkDeletePosts() {
    const selectedPosts = Array.from(state.selectedPosts).map(id => {
        return state.allPosts.find(p => p.id === id);
    }).filter(p => p && p.status === 'saved');
    
    if (!confirm(`Delete ${selectedPosts.length} posts permanently?`)) return;
    
    await performBulkOperation('delete', selectedPosts);
}

async function performBulkOperation(operation, posts) {
    if (posts.length === 0) return;
    
    state.bulkOperationActive = true;
    const progressContainer = document.getElementById('postsBulkProgress');
    const progressBar = document.getElementById('postsProgressBar');
    const progressText = document.getElementById('postsProgressText');
    
    progressContainer.classList.add('show');
    
    let processed = 0;
    let cancelled = false;
    
    const cancelBtn = document.getElementById('cancelBulkPosts');
    cancelBtn.onclick = () => { cancelled = true; };
    
    const estimatedTime = Math.ceil(posts.length / 60) * 60; // Rate limit consideration
    progressText.textContent = `Processing ${posts.length} posts... Est. ${Math.ceil(estimatedTime / 60)} min`;
    
    for (const post of posts) {
        if (cancelled) {
            showNotification('Operation cancelled', 'warning');
            break;
        }
        
        try {
            const postId = typeof post === 'number' ? post : post.id;
            
            if (operation === 'save') {
                await savePost(postId);
            } else if (operation === 'discard') {
                await discardPost(postId);
            } else if (operation === 'delete') {
                await deletePost(post.id, post.date_folder);
            }
            
            processed++;
            const percent = Math.round((processed / posts.length) * 100);
            progressBar.style.width = percent + '%';
            progressBar.textContent = percent + '%';
            progressText.textContent = `${processed} / ${posts.length} completed`;
            
            // Rate limiting delay
            if (processed % 60 === 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error(`Failed to ${operation} post:`, error);
        }
    }
    
    progressContainer.classList.remove('show');
    state.bulkOperationActive = false;
    clearSelection();
    
    await loadPosts();
    
    showNotification(`Bulk ${operation} completed: ${processed} posts`);
}

export { bulkSavePosts, bulkDiscardPosts, bulkDeletePosts };