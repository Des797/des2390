// Modal Functions
import { state } from './state.js';
import { getTagWithCount } from './utils.js';
import { savePostAction, discardPostAction, filterByTag, filterByOwner } from './posts.js';

function showFullMedia(postId) {
    const posts = state.allPosts;
    const index = posts.findIndex(p => p.id === postId);
    if (index === -1) return;
    
    state.currentModalIndex = index;
    displayModalPost(posts[index]);
    document.getElementById('imageModal').classList.add('show');
}

function displayModalPost(post) {
    const isVideo = ['.mp4', '.webm'].includes(post.file_type);
    const mediaUrl = post.status === 'pending' ? 
        `/temp/${post.id}${post.file_type}` : 
        `/saved/${post.date_folder}/${post.id}${post.file_type}`;
    
    const img = document.getElementById('modalImage');
    const video = document.getElementById('modalVideo');
    
    if (isVideo) {
        img.style.display = 'none';
        video.style.display = 'block';
        video.src = mediaUrl;
    } else {
        video.style.display = 'none';
        img.style.display = 'block';
        img.src = mediaUrl;
    }
    
    // Tags with counts
    const tagsHtml = post.tags.map(t => {
        const tagWithCount = getTagWithCount(t, state.tagCounts);
        return `<span class="tag" data-tag="${t}">${tagWithCount}</span>`;
    }).join('');
    
    // Status badge
    const statusBadge = post.status === 'pending' ? 
        '<span style="background:#f59e0b;color:white;padding:4px 12px;border-radius:4px;font-size:12px;font-weight:600;">PENDING</span>' :
        '<span style="background:#10b981;color:white;padding:4px 12px;border-radius:4px;font-size:12px;font-weight:600;">SAVED</span>';
    
    const actions = post.status === 'pending' ? 
        `<button class="btn-success" onclick="window.modalSavePost(${post.id})">💾 Save</button>
         <button class="btn-secondary" onclick="window.modalDiscardPost(${post.id})">🗑️ Discard</button>
         <button class="btn-primary" onclick="window.open('https://rule34.xxx/index.php?page=post&s=view&id=${post.id}', '_blank')">🔗 View on R34</button>
         <button class="btn-warning greyed-out" disabled title="API not supported">❤️ Like</button>
         <button class="btn-primary greyed-out" disabled title="API not supported">✏️ Edit Tags</button>` :
        `<button class="btn-primary" onclick="window.open('https://rule34.xxx/index.php?page=post&s=view&id=${post.id}', '_blank')">🔗 View on R34</button>
         <button class="btn-warning greyed-out" disabled title="API not supported">❤️ Like</button>
         <button class="btn-primary greyed-out" disabled title="API not supported">✏️ Edit Tags</button>`;
    
    document.getElementById('modalInfo').innerHTML = `
        <h3>${post.title || `Post ${post.id}`}</h3>
        <div style="margin-bottom: 15px;">${statusBadge}</div>
        <div class="modal-info-grid">
            <div class="modal-info-item"><strong>ID:</strong> ${post.id}</div>
            <div class="modal-info-item"><strong>Owner:</strong> <span style="cursor:pointer;color:#10b981" onclick="window.modalFilterByOwner('${post.owner}')">${post.owner}</span></div>
            <div class="modal-info-item"><strong>Dimensions:</strong> ${post.width}×${post.height}</div>
            <div class="modal-info-item"><strong>Rating:</strong> ${post.rating}</div>
            <div class="modal-info-item"><strong>Score:</strong> ${post.score}</div>
            <div class="modal-info-item"><strong>Tags:</strong> ${post.tags.length}</div>
        </div>
        <h4 style="color:#94a3b8;margin-bottom:10px">Tags:</h4>
        <div class="modal-tags">${tagsHtml}</div>
        <div class="modal-actions">${actions}</div>
    `;
    
    // Attach tag click listeners
    document.querySelectorAll('.modal-tags .tag').forEach(tag => {
        tag.addEventListener('click', () => {
            closeModal();
            filterByTag(tag.dataset.tag);
        });
    });
}

function navigateModal(direction) {
    const posts = state.allPosts;
    state.currentModalIndex = (state.currentModalIndex + direction + posts.length) % posts.length;
    displayModalPost(posts[state.currentModalIndex]);
}

function closeModal() {
    document.getElementById('imageModal').classList.remove('show');
    const video = document.getElementById('modalVideo');
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