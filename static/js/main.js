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
    console.log('Main.js: DOMContentLoaded fired');
    
    // Initialize history management for browser back/forward
    initHistoryManagement();
    console.log('Main.js: History management initialized');
    
    // Load initial data
    await loadConfig();
    console.log('Main.js: Config loaded');
    
    await loadSearchHistory();
    console.log('Main.js: Search history loaded');
    
    state.tagCounts = await loadTagCounts();
    console.log('Main.js: Tag counts loaded');
    
    updateStatus();
    console.log('Main.js: Status updated');
    
    // Setup intervals
    setInterval(updateStatus, UI_CONSTANTS.STATUS_UPDATE_INTERVAL);
    
    // Initialize all event listeners
    initializeEventListeners();
    console.log('Main.js: Event listeners initialized');
    
    // Load initial tab based on URL
    switchTab(state.currentTab, false);
    console.log('Main.js: Initial tab switched to', state.currentTab);
    
    console.log('Main.js: Initialization complete!');
});