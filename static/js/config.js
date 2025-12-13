// Configuration Management
import { state } from './state.js';
import { showNotification } from './utils.js';
import { loadConfig as apiLoadConfig, saveConfigData, loadSearchHistory as apiLoadSearchHistory } from './api.js';

async function loadConfig() {
    try {
        const config = await apiLoadConfig();
        document.getElementById('userId').value = config.api_user_id || '';
        document.getElementById('apiKey').value = config.api_key || '';
        document.getElementById('tempPath').value = config.temp_path || '';
        document.getElementById('savePath').value = config.save_path || '';
        state.blacklist = config.blacklist || [];
        updateBlacklistDisplay();
    } catch (error) {
        showNotification('Failed to load config', 'error');
    }
}

async function saveConfig() {
    const config = {
        api_user_id: document.getElementById('userId').value,
        api_key: document.getElementById('apiKey').value,
        temp_path: document.getElementById('tempPath').value,
        save_path: document.getElementById('savePath').value,
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
    const dropdown = document.getElementById('searchDropdown');
    dropdown.innerHTML = state.searchHistory.slice(0, 10).map(h => 
        `<div class="search-dropdown-item">${h.tags}</div>`
    ).join('');
    dropdown.classList.add('show');
    
    dropdown.querySelectorAll('.search-dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            document.getElementById('searchTags').value = item.textContent;
            dropdown.classList.remove('show');
        });
    });
}

function hideSearchDropdown() {
    setTimeout(() => {
        document.getElementById('searchDropdown').classList.remove('show');
    }, 200);
}

// Blacklist Management
function updateBlacklistDisplay() {
    const container = document.getElementById('blacklistTags');
    if (state.blacklist.length === 0) {
        container.innerHTML = '<span style="color: #64748b; font-size: 12px;">No blacklisted tags</span>';
        return;
    }
    container.innerHTML = state.blacklist.map(tag => `
        <div class="blacklist-tag">
            ${tag}
            <span data-tag="${tag}">×</span>
        </div>
    `).join('');
    
    container.querySelectorAll('span[data-tag]').forEach(span => {
        span.addEventListener('click', () => removeBlacklistTag(span.dataset.tag));
    });
}

function addBlacklistTags() {
    const input = document.getElementById('blacklistInput');
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