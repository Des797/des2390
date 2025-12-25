// Global State Management
import { DEFAULTS, URL_PARAMS, STORAGE_KEYS, ELEMENT_IDS } from './constants.js';

const state = {
    currentTab: DEFAULTS.TAB,
    blacklist: [],
    searchHistory: [],
    allPosts: [],
    postsPage: DEFAULTS.PAGE,
    tagHistoryPage: DEFAULTS.PAGE,
    postsStatusFilter: DEFAULTS.FILTER,
    postsSearch: DEFAULTS.SEARCH,
    postsSortBy: DEFAULTS.SORT,
    postsSortOrder: DEFAULTS.ORDER,
    currentModalIndex: -1,
    selectedPosts: new Set(),
    bulkOperationActive: false,
    postSizes: {},
    tagCounts: window[STORAGE_KEYS.TAG_COUNTS] || {},
    randomSeed: null
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
    
    history.pushState(params, '', url);
}

function loadURLState() {
    const url = new URL(window.location);
    return {
        tab: url.searchParams.get(URL_PARAMS.TAB) || DEFAULTS.TAB,
        page: parseInt(url.searchParams.get(URL_PARAMS.PAGE)) || DEFAULTS.PAGE,
        filter: url.searchParams.get(URL_PARAMS.FILTER) || DEFAULTS.FILTER,
        search: url.searchParams.get(URL_PARAMS.SEARCH) || DEFAULTS.SEARCH,
        sort: url.searchParams.get(URL_PARAMS.SORT) || DEFAULTS.SORT,
        order: url.searchParams.get(URL_PARAMS.ORDER) || DEFAULTS.ORDER
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
    if (urlState.sort) {
        state.postsSortBy = urlState.sort;
    }
    if (urlState.order) {
        state.postsSortOrder = urlState.order;
    }
    
    // Handle browser back/forward
    window.addEventListener('popstate', async (event) => {
        if (historyState.suppressNextPopState) {
            historyState.suppressNextPopState = false;
            return;
        }
        
        const urlState = loadURLState();
        
        // Import modules dynamically to avoid circular dependency
        const nav = await import('./navigation.js');
        const posts = await import('./posts.js');
        
        // Switch to appropriate tab
        if (urlState.tab !== state.currentTab) {
            nav.switchTab(urlState.tab, false); // false = don't update URL
        } else if (urlState.tab === 'posts') {
            // Tab is already posts, just update the state and reload
            state.postsPage = urlState.page;
            state.postsStatusFilter = urlState.filter;
            state.postsSearch = urlState.search;
            state.postsSortBy = urlState.sort;
            state.postsSortOrder = urlState.order;
            
            // Update UI elements
            const filterSelect = document.getElementById(ELEMENT_IDS.POSTS_STATUS_FILTER);
            if (filterSelect) filterSelect.value = urlState.filter;
            
            const searchInput = document.getElementById(ELEMENT_IDS.POSTS_SEARCH_INPUT);
            if (searchInput) searchInput.value = urlState.search;
            
            const sortSelect = document.getElementById(ELEMENT_IDS.POSTS_SORT);
            if (sortSelect) sortSelect.value = urlState.sort;
            
            const sortOrderBtn = document.getElementById(ELEMENT_IDS.POSTS_SORT_ORDER);
            if (sortOrderBtn) sortOrderBtn.textContent = urlState.order === 'asc' ? '↑' : '↓';
            
            // Reload posts
            await posts.loadPosts(false); // false = don't update URL
        }
    });
}

export { state, updateURLState, loadURLState, initHistoryManagement };