// Main Entry Point
import { state, initHistoryManagement } from './state.js';
import { loadConfig, saveConfig, loadSearchHistory, showSearchDropdown, hideSearchDropdown, addBlacklistTags } from './config.js';
import { startScraper, stopScraper, updateStatus, loadTagHistory } from './scraper_ui.js';
import { loadPosts, clearSelection } from './posts.js';
import { bulkSavePosts, bulkDiscardPosts, bulkDeletePosts } from './bulk.js';
import { navigateModal, closeModal } from './modal.js';
import { switchTab } from './navigation.js';
import { loadTagCounts } from './api.js';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize history management for browser back/forward
    initHistoryManagement();
    
    // Load initial data
    await loadConfig();
    await loadSearchHistory();
    state.tagCounts = await loadTagCounts();
    updateStatus();
    
    // Setup intervals
    setInterval(updateStatus, 2000);
    
    // Event listeners - Config
    document.getElementById('saveConfigBtn').addEventListener('click', saveConfig);
    document.getElementById('startBtn').addEventListener('click', startScraper);
    document.getElementById('stopBtn').addEventListener('click', stopScraper);
    
    // Search input
    const searchInput = document.getElementById('searchTags');
    searchInput.addEventListener('focus', showSearchDropdown);
    searchInput.addEventListener('blur', hideSearchDropdown);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') startScraper();
    });
    
    // Blacklist
    document.getElementById('addBlacklistBtn').addEventListener('click', addBlacklistTags);
    document.getElementById('blacklistInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            addBlacklistTags();
        }
    });
    
    // Tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    
    // Posts controls
    document.getElementById('postsStatusFilter').addEventListener('change', (e) => {
        state.postsStatusFilter = e.target.value;
        state.postsPage = 1;
        loadPosts();
    });
    
    document.getElementById('postsSort').addEventListener('change', () => {
        state.postsPage = 1;
        loadPosts();
    });
    
    document.getElementById('postsPerPage').addEventListener('change', () => {
        state.postsPage = 1;
        loadPosts();
    });
    
    document.getElementById('postsSearchInput').addEventListener('input', (e) => {
        state.postsSearch = e.target.value;
        state.postsPage = 1;
        loadPosts();
    });
    
    // Tag history controls
    document.getElementById('tagHistoryPerPage').addEventListener('change', () => {
        state.tagHistoryPage = 1;
        loadTagHistory();
    });
    
    // Bulk actions
    document.getElementById('bulkSavePosts').addEventListener('click', bulkSavePosts);
    document.getElementById('bulkDiscardPosts').addEventListener('click', bulkDiscardPosts);
    document.getElementById('bulkDeletePosts').addEventListener('click', bulkDeletePosts);
    document.getElementById('clearSelectionPosts').addEventListener('click', clearSelection);
    
    // Modal controls
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modalPrev').addEventListener('click', () => navigateModal(-1));
    document.getElementById('modalNext').addEventListener('click', () => navigateModal(1));
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
        
        if (document.getElementById('imageModal').classList.contains('show')) {
            if (e.key === 'ArrowLeft') navigateModal(-1);
            if (e.key === 'ArrowRight') navigateModal(1);
        }
    });
    
    // Click outside modal to close
    document.getElementById('imageModal').addEventListener('click', (e) => {
        if (e.target.id === 'imageModal') closeModal();
    });
    
    // Load initial tab based on URL
    switchTab(state.currentTab, false);
});