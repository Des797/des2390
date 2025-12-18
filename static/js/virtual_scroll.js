// Virtual Scrolling for massive post lists
import { renderPost } from './posts_renderer.js';
import { attachPostEventListeners, setupMediaErrorHandlers } from './event_handlers.js';
import { setupVideoPreviewListeners } from './posts_renderer.js';

class VirtualScroller {
    constructor(container, itemHeight = 350, buffer = 5) {
        this.container = container;
        this.itemHeight = itemHeight;
        this.buffer = buffer;
        this.items = [];
        this.visibleItems = new Set();
        this.scrollTop = 0;
        this.containerHeight = 0;
        this.renderFn = null;
        this.sortBy = '';
        this.searchQuery = '';
        
        // Create virtual scroll elements
        this.scrollContainer = document.createElement('div');
        this.scrollContainer.style.overflowY = 'auto';
        this.scrollContainer.style.height = '100%';
        this.scrollContainer.style.position = 'relative';
        
        this.contentContainer = document.createElement('div');
        this.contentContainer.style.position = 'relative';
        
        this.viewport = document.createElement('div');
        this.viewport.style.position = 'absolute';
        this.viewport.style.top = '0';
        this.viewport.style.left = '0';
        this.viewport.style.right = '0';
        
        this.contentContainer.appendChild(this.viewport);
        this.scrollContainer.appendChild(this.contentContainer);
        
        // Event listeners
        this.scrollContainer.addEventListener('scroll', this.onScroll.bind(this));
        window.addEventListener('resize', this.onResize.bind(this));
    }
    
    setItems(items, sortBy = '', searchQuery = '') {
        this.items = items;
        this.sortBy = sortBy;
        this.searchQuery = searchQuery;
        this.contentContainer.style.height = `${items.length * this.itemHeight}px`;
        this.render();
    }
    
    onScroll() {
        this.scrollTop = this.scrollContainer.scrollTop;
        requestAnimationFrame(() => this.render());
    }
    
    onResize() {
        this.containerHeight = this.scrollContainer.clientHeight;
        this.render();
    }
    
    render() {
        const scrollTop = this.scrollTop;
        const containerHeight = this.containerHeight || this.scrollContainer.clientHeight;
        
        // Calculate visible range with buffer
        const startIndex = Math.max(0, Math.floor(scrollTop / this.itemHeight) - this.buffer);
        const endIndex = Math.min(
            this.items.length,
            Math.ceil((scrollTop + containerHeight) / this.itemHeight) + this.buffer
        );
        
        // Create set of visible indices
        const newVisible = new Set();
        for (let i = startIndex; i < endIndex; i++) {
            newVisible.add(i);
        }
        
        // Remove items that are no longer visible
        for (const idx of this.visibleItems) {
            if (!newVisible.has(idx)) {
                const element = document.querySelector(`[data-virtual-index="${idx}"]`);
                if (element) element.remove();
            }
        }
        
        // Add new visible items
        const fragment = document.createDocumentFragment();
        for (const idx of newVisible) {
            if (!this.visibleItems.has(idx)) {
                const item = this.items[idx];
                const element = this.createItemElement(item, idx);
                fragment.appendChild(element);
            }
        }
        
        if (fragment.children.length > 0) {
            this.viewport.appendChild(fragment);
            
            // Re-attach event listeners for new items
            attachPostEventListeners();
            setupMediaErrorHandlers();
            requestAnimationFrame(() => setupVideoPreviewListeners());
        }
        
        this.visibleItems = newVisible;
        
        // Update viewport position
        this.viewport.style.transform = `translateY(${startIndex * this.itemHeight}px)`;
    }
    
    createItemElement(item, index) {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-virtual-index', index);
        wrapper.style.position = 'absolute';
        wrapper.style.top = `${index * this.itemHeight}px`;
        wrapper.style.left = '0';
        wrapper.style.right = '0';
        wrapper.style.height = `${this.itemHeight}px`;
        wrapper.innerHTML = renderPost(item, this.sortBy, this.searchQuery);
        return wrapper;
    }
    
    mount(container) {
        container.appendChild(this.scrollContainer);
        this.containerHeight = this.scrollContainer.clientHeight;
    }
    
    destroy() {
        this.scrollContainer.removeEventListener('scroll', this.onScroll);
        window.removeEventListener('resize', this.onResize);
        this.scrollContainer.remove();
    }
    
    scrollToTop() {
        this.scrollContainer.scrollTop = 0;
    }
    
    scrollToIndex(index) {
        this.scrollContainer.scrollTop = index * this.itemHeight;
    }
}

// Singleton instance
let virtualScroller = null;

export function initVirtualScroll(container, threshold = 100) {
    if (!virtualScroller) {
        virtualScroller = new VirtualScroller(container);
    }
    return virtualScroller;
}

export function useVirtualScroll(posts, container, sortBy = '', searchQuery = '') {
    // Only use virtual scrolling for large datasets
    const THRESHOLD = 100;
    
    if (posts.length > THRESHOLD) {
        if (!virtualScroller) {
            virtualScroller = new VirtualScroller(container);
            virtualScroller.mount(container);
        }
        virtualScroller.setItems(posts, sortBy, searchQuery);
        return true;
    } else {
        if (virtualScroller) {
            virtualScroller.destroy();
            virtualScroller = null;
        }
        return false;
    }
}

export function destroyVirtualScroll() {
    if (virtualScroller) {
        virtualScroller.destroy();
        virtualScroller = null;
    }
}

export { VirtualScroller };