// Navigation and Tab Management
import { state, updateURLState } from './state.js';
import { loadPosts } from './posts.js';
import { loadTagHistory } from './scraper_ui.js';
import { CSS_CLASSES, TAB_NAMES, URL_PARAMS } from './constants.js';

function switchTab(tabName, updateURL = true) {
    state.currentTab = tabName;
    
    document.querySelectorAll(`.${CSS_CLASSES.NAV_TAB}`).forEach(tab => tab.classList.remove(CSS_CLASSES.ACTIVE));
    document.querySelectorAll(`.${CSS_CLASSES.TAB_CONTENT}`).forEach(content => content.classList.remove(CSS_CLASSES.ACTIVE));
    
    document.querySelector(`.${CSS_CLASSES.NAV_TAB}[data-tab="${tabName}"]`).classList.add(CSS_CLASSES.ACTIVE);
    document.getElementById(`${tabName}Tab`).classList.add(CSS_CLASSES.ACTIVE);
    
    // Hide tag sidebar when leaving posts tab
    if (tabName !== TAB_NAMES.POSTS) {
        const sidebar = document.getElementById('tagSidebar');
        if (sidebar) {
            sidebar.style.display = 'none';
        }
    }
    
    // Update URL
    if (updateURL) {
        updateURLState({ [URL_PARAMS.TAB]: tabName });
    }
    
    // Load data for the tab
    if (tabName === TAB_NAMES.POSTS) {
        loadPosts(updateURL);
    } else if (tabName === TAB_NAMES.TAG_HISTORY) {
        loadTagHistory();
    }
}

export { switchTab };