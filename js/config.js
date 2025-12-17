// Configuration Management
import { state } from './state.js';
import { showNotification } from './utils.js';
import { loadConfig as apiLoadConfig, saveConfigData, loadSearchHistory as apiLoadSearchHistory } from './api.js';
import { ELEMENT_IDS, CSS_CLASSES, UI_CONSTANTS } from './constants.js';

async function loadConfig() {
    try {
        const config = await apiLoadConfig();
        document.getElementById(ELEMENT_IDS.USER_ID).value = config.api_user_id || '';
        document.getElementById(ELEMENT_IDS.API_KEY).value = config.api_key || '';
        document.getElementById(ELEMENT_IDS.TEMP_PATH).value = config.temp_path || '';
        document.getElementById(ELEMENT_IDS.SAVE_PATH).value = config.save_path || '';
        state.blacklist = config.blacklist || [];
        updateBlacklistDisplay();
    } catch (error) {
        showNotification('Failed to load config', 'error');
    }
}

async function saveConfig() {
    const config = {
        api_user_id: document.getElementById(ELEMENT_IDS.USER_ID).value,
        api_key: document.getElementById(ELEMENT_IDS.API_KEY).value,
        temp_path: document.getElementById(ELEMENT_IDS.TEMP_PATH).value,
        save_path: document.getElementById(ELEMENT_IDS.SAVE_PATH).value,
        blacklist: state.blacklist
    };

    try {
        await saveConfigData(config);
        showNotification('Configuration saved');
    } catch (error) {
        showNotification('Failed to save config', 'error');
    }
}

// Search History
async function loadSearchHistory() {
    try {
        state.searchHistory = await apiLoadSearchHistory();
    } catch (error) {
        console.error('Failed to load search history:', error);
    }
}

function showSearchDropdown() {
    if (state.searchHistory.length === 0) return;
    const dropdown = document.getElementById(ELEMENT_IDS.SEARCH_DROPDOWN);
    dropdown.innerHTML = state.searchHistory.slice(0, UI_CONSTANTS.SEARCH_HISTORY_LIMIT).map(h => 
        `<div class="${CSS_CLASSES.SEARCH_DROPDOWN_ITEM}">${h.tags}</div>`
    ).join('');
    dropdown.classList.add(CSS_CLASSES.SHOW);
    
    dropdown.querySelectorAll(`.${CSS_CLASSES.SEARCH_DROPDOWN_ITEM}`).forEach(item => {
        item.addEventListener('click', () => {
            document.getElementById(ELEMENT_IDS.SEARCH_TAGS).value = item.textContent;
            dropdown.classList.remove(CSS_CLASSES.SHOW);
        });
    });
}

function hideSearchDropdown() {
    setTimeout(() => {
        document.getElementById(ELEMENT_IDS.SEARCH_DROPDOWN).classList.remove(CSS_CLASSES.SHOW);
    }, UI_CONSTANTS.SEARCH_DROPDOWN_DELAY);
}

// Blacklist Management
function updateBlacklistDisplay() {
    const container = document.getElementById(ELEMENT_IDS.BLACKLIST_TAGS);
    if (state.blacklist.length === 0) {
        container.innerHTML = '<span style="color: #64748b; font-size: 12px;">No blacklisted tags</span>';
        return;
    }
    container.innerHTML = state.blacklist.map(tag => `
        <div class="${CSS_CLASSES.BLACKLIST_TAG}">
            ${tag}
            <span data-tag="${tag}">×</span>
        </div>
    `).join('');
    
    container.querySelectorAll('span[data-tag]').forEach(span => {
        span.addEventListener('click', () => removeBlacklistTag(span.dataset.tag));
    });
}

function addBlacklistTags() {
    const input = document.getElementById(ELEMENT_IDS.BLACKLIST_INPUT);
    const text = input.value.trim();
    if (!text) return;
    
    const tags = text.split(/[\s,]+/).filter(t => t.trim());
    let added = 0;
    
    tags.forEach(tag => {
        tag = tag.trim();
        if (tag && !state.blacklist.includes(tag)) {
            state.blacklist.push(tag);
            added++;
        }
    });
    
    if (added > 0) {
        input.value = '';
        updateBlacklistDisplay();
        saveConfig();
        showNotification(`Added ${added} tag(s) to blacklist`);
    }
}

function removeBlacklistTag(tag) {
    state.blacklist = state.blacklist.filter(t => t !== tag);
    updateBlacklistDisplay();
    saveConfig();
    showNotification(`Removed "${tag}" from blacklist`);
}

export {
    loadConfig,
    saveConfig,
    loadSearchHistory,
    showSearchDropdown,
    hideSearchDropdown,
    addBlacklistTags,
    removeBlacklistTag
};