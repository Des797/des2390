// Main Entry Point
import { state, initHistoryManagement } from './state.js';
import { loadConfig, loadSearchHistory } from './config.js';
import { updateStatus } from './scraper_ui.js';
import { initializeEventListeners } from './event_handlers.js';
import { switchTab } from './navigation.js';
import { loadTagCounts } from './api.js';
import { UI_CONSTANTS } from './constants.js';

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
    setInterval(updateStatus, UI_CONSTANTS.STATUS_UPDATE_INTERVAL);
    
    // Initialize all event listeners
    initializeEventListeners();
    
    // Load initial tab based on URL
    switchTab(state.currentTab, false);
});