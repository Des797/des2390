// Event Handlers - All DOM event binding logic
import { state } from './state.js';
import { getTagWithCount } from './utils.js';
import { 
    toggleSelection, 
    filterByTag, 
    filterByOwner,
    savePostAction,
    discardPostAction,
    deletePostAction
} from './posts.js';
import { showFullMedia } from './modal.js';

function attachPostEventListeners() {
    attachSelectionListeners();
    attachMediaListeners();
    attachOwnerListeners();
    attachTagListeners();
    attachExpandTagsListeners();
    attachActionButtonListeners();
}

function attachSelectionListeners() {
    document.querySelectorAll('.select-checkbox').forEach(checkbox => {
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            const postId = parseInt(checkbox.dataset.id);
            toggleSelection(postId);
        });
    });
}

function attachMediaListeners() {
    document.querySelectorAll('.media-wrapper').forEach(wrapper => {
        wrapper.addEventListener('click', () => {
            const postId = parseInt(wrapper.dataset.id);
            showFullMedia(postId);
        });
    });
}

function attachOwnerListeners() {
    document.querySelectorAll('.gallery-item-owner').forEach(owner => {
        owner.addEventListener('click', () => {
            filterByOwner(owner.dataset.owner);
        });
    });
}

function attachTagListeners() {
    document.querySelectorAll('.gallery-item-tags .tag').forEach(tag => {
        tag.addEventListener('click', () => {
            filterByTag(tag.dataset.tag);
        });
    });
}

function attachExpandTagsListeners() {
    document.querySelectorAll('.expand-tags').forEach(btn => {
        btn.addEventListener('click', function() {
            const container = this.parentElement;
            const allTags = JSON.parse(container.dataset.allTags);
            container.innerHTML = allTags.map(t => {
                const tagWithCount = getTagWithCount(t, state.tagCounts);
                return `<span class="tag" data-tag="${t}">${tagWithCount}</span>`;
            }).join('');
            // Re-attach tag listeners
            container.querySelectorAll('.tag').forEach(tag => {
                tag.addEventListener('click', () => filterByTag(tag.dataset.tag));
            });
        });
    });
}

function attachActionButtonListeners() {
    // Save buttons
    document.querySelectorAll('.save-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            await savePostAction(parseInt(btn.dataset.id));
        });
    });
    
    // Discard buttons
    document.querySelectorAll('.discard-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            await discardPostAction(parseInt(btn.dataset.id));
        });
    });
    
    // View buttons
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => showFullMedia(parseInt(btn.dataset.id)));
    });
    
    // View on R34 buttons
    document.querySelectorAll('.view-r34-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            window.open(`https://rule34.xxx/index.php?page=post&s=view&id=${btn.dataset.id}`, '_blank');
        });
    });
    
    // Delete buttons
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('Delete this post permanently?')) {
                await deletePostAction(parseInt(btn.dataset.id), btn.dataset.folder);
            }
        });
    });
}

export { attachPostEventListeners };