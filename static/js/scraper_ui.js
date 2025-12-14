// Scraper UI Controls
import { showNotification } from './utils.js';
import { startScraper as apiStartScraper, stopScraper as apiStopScraper, getStatus, loadTagHistory as apiLoadTagHistory } from './api.js';
import { loadSearchHistory } from './config.js';
import { state } from './state.js';
import { ELEMENT_IDS, CSS_CLASSES } from './constants.js';
import { renderTagHistoryItem, renderPaginationButtons } from './posts_renderer.js';

async function startScraper() {
    const tags = document.getElementById(ELEMENT_IDS.SEARCH_TAGS).value;
    try {
        await apiStartScraper(tags);
        document.getElementById(ELEMENT_IDS.START_BTN).disabled = true;
        document.getElementById(ELEMENT_IDS.STOP_BTN).disabled = false;
        showNotification('Scraper started');
        await loadSearchHistory();
    } catch (error) {
        showNotification(error.message || 'Failed to start scraper', 'error');
    }
}

async function stopScraper() {
    try {
        await apiStopScraper();
        document.getElementById(ELEMENT_IDS.START_BTN).disabled = false;
        document.getElementById(ELEMENT_IDS.STOP_BTN).disabled = true;
        showNotification('Scraper stopped');
    } catch (error) {
        showNotification('Failed to stop scraper', 'error');
    }
}

async function updateStatus() {
    try {
        const status = await getStatus();
        
        document.getElementById(ELEMENT_IDS.STAT_PROCESSED).textContent = status.total_processed;
        document.getElementById(ELEMENT_IDS.STAT_SAVED).textContent = status.total_saved;
        document.getElementById(ELEMENT_IDS.STAT_DISCARDED).textContent = status.total_discarded;
        document.getElementById(ELEMENT_IDS.STAT_SKIPPED).textContent = status.total_skipped;
        document.getElementById(ELEMENT_IDS.STAT_REQUESTS).textContent = status.requests_this_minute;
        document.getElementById(ELEMENT_IDS.STAT_PAGE).textContent = status.current_page;

        if (status.current_mode === 'newest' && !document.getElementById(ELEMENT_IDS.MODE_ALERT).classList.contains(CSS_CLASSES.SHOW)) {
            const alert = document.getElementById(ELEMENT_IDS.MODE_ALERT);
            alert.textContent = '🔄 Search exhausted. Now scraping newest posts...';
            alert.classList.add(CSS_CLASSES.SHOW);
            setTimeout(() => alert.classList.remove(CSS_CLASSES.SHOW), 5000);
        }

        if (status.storage_warning) {
            const alert = document.getElementById(ELEMENT_IDS.STORAGE_ALERT);
            alert.textContent = '⚠️ Low disk space! Scraper stopped.';
            alert.classList.add(CSS_CLASSES.SHOW);
        }

        document.getElementById(ELEMENT_IDS.START_BTN).disabled = status.active;
        document.getElementById(ELEMENT_IDS.STOP_BTN).disabled = !status.active;
    } catch (error) {
        console.error('Failed to update status:', error);
    }
}

// Tag History
async function loadTagHistory() {
    try {
        const perPage = parseInt(document.getElementById(ELEMENT_IDS.TAG_HISTORY_PER_PAGE).value);
        const data = await apiLoadTagHistory(state.tagHistoryPage, perPage);
        
        const list = document.getElementById(ELEMENT_IDS.TAG_HISTORY_LIST);
        document.getElementById(ELEMENT_IDS.TAG_HISTORY_TOTAL).textContent = `Total: ${data.total} edits`;
        
        if (data.items.length === 0) {
            list.innerHTML = '<p style="color: #64748b; text-align: center;">No tag history</p>';
        } else {
            list.innerHTML = data.items.map(item => renderTagHistoryItem(item)).join('');
        }
        
        renderTagHistoryPagination(data.total, perPage, state.tagHistoryPage);
    } catch (error) {
        showNotification('Failed to load tag history', 'error');
    }
}

function renderTagHistoryPagination(total, perPage, currentPage) {
    const totalPages = Math.ceil(total / perPage);
    const container = document.getElementById(ELEMENT_IDS.TAG_HISTORY_PAGINATION);
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = renderPaginationButtons(currentPage, totalPages);
    
    container.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            state.tagHistoryPage = parseInt(btn.dataset.page);
            loadTagHistory();
        });
    });
}

export {
    startScraper,
    stopScraper,
    updateStatus,
    loadTagHistory
};