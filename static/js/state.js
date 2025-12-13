// Global State Management
const state = {
    currentTab: 'scraper',
    blacklist: [],
    searchHistory: [],
    allPosts: [],
    postsPage: 1,
    tagHistoryPage: 1,
    postsStatusFilter: 'all',
    postsSearch: '',
    currentModalIndex: -1,
    selectedPosts: new Set(),
    bulkOperationActive: false,
    postSizes: {},
    tagCounts: window.tagCounts || {}
};

// History state management for browser back/forward
const historyState = {
    suppressNextPopState: false
};

function updateURLState(params) {
    const url = new URL(window.location);
    
    Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
            url.searchParams.set(key, value);
        } else {
            url.searchParams.delete(key);
        }
    });
    
    historyState.suppressNextPopState = true;
    history.pushState(params, '', url);
}

function loadURLState() {
    const url = new URL(window.location);
    return {
        tab: url.searchParams.get('tab') || 'scraper',
        page: parseInt(url.searchParams.get('page')) || 1,
        filter: url.searchParams.get('filter') || 'all',
        search: url.searchParams.get('search') || '',
        sort: url.searchParams.get('sort') || 'download-desc'
    };
}

function initHistoryManagement() {
    // Load initial state from URL
    const urlState = loadURLState();
    
    if (urlState.tab) {
        state.currentTab = urlState.tab;
    }
    if (urlState.page) {
        state.postsPage = urlState.page;
    }
    if (urlState.filter) {
        state.postsStatusFilter = urlState.filter;
    }
    if (urlState.search) {
        state.postsSearch = urlState.search;
    }
    
    // Handle browser back/forward
    window.addEventListener('popstate', (event) => {
        if (historyState.suppressNextPopState) {
            historyState.suppressNextPopState = false;
            return;
        }
        
        const urlState = loadURLState();
        
        // Switch to appropriate tab
        if (urlState.tab !== state.currentTab) {
            switchTab(urlState.tab, false); // false = don't update URL
        }
        
        // Update posts state if on posts tab
        if (urlState.tab === 'posts') {
            state.postsPage = urlState.page;
            state.postsStatusFilter = urlState.filter;
            state.postsSearch = urlState.search;
            
            // Update UI elements
            const filterSelect = document.getElementById('postsStatusFilter');
            if (filterSelect) filterSelect.value = urlState.filter;
            
            const searchInput = document.getElementById('postsSearchInput');
            if (searchInput) searchInput.value = urlState.search;
            
            const sortSelect = document.getElementById('postsSort');
            if (sortSelect && urlState.sort) sortSelect.value = urlState.sort;
            
            // Reload posts
            loadPosts(false); // false = don't update URL
        }
    });
}

export { state, updateURLState, loadURLState, initHistoryManagement };