// Navigation and Tab Management
import { state, updateURLState } from './state.js';
import { loadPosts } from './posts.js';
import { loadTagHistory } from './scraper_ui.js';

function switchTab(tabName, updateURL = true) {
    state.currentTab = tabName;
    
    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector(`.nav-tab[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}Tab`).classList.add('active');
    
    // Update URL
    if (updateURL) {
        updateURLState({ tab: tabName });
    }
    
    // Load data for the tab
    if (tabName === 'posts') {
        loadPosts(updateURL);
    } else if (tabName === 'taghistory') {
        loadTagHistory();
    }
}

export { switchTab };