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
        
        document.getElementById(ELEMENT_IDS.STAT_PROCESSED).textContent = status.session_processed || 0;
        document.getElementById(ELEMENT_IDS.STAT_SKIPPED).textContent = status.session_skipped || 0;
        document.getElementById(ELEMENT_IDS.STAT_REQUESTS).textContent = status.requests_this_minute;
        document.getElementById(ELEMENT_IDS.STAT_PAGE).textContent = status.current_page;

        // Update current search tags
        const currentTagsEl = document.getElementById('currentSearchTags');
        if (currentTagsEl) {
            if (status.current_mode === 'newest') {
                currentTagsEl.textContent = '(newest posts - all tags)';
                currentTagsEl.style.color = '#f59e0b';
            } else if (status.current_tags) {
                currentTagsEl.textContent = status.current_tags;
                currentTagsEl.style.color = 'var(--txt-main)';
            } else {
                currentTagsEl.textContent = '-';
                currentTagsEl.style.color = 'var(--txt-muted)';
            }
        }

        // Update posts remaining and progress bar
        const postsRemainingEl = document.getElementById('postsRemaining');
        const progressBar = document.getElementById('progressBar');
        
        if (postsRemainingEl && progressBar) {
            const remaining = status.posts_remaining || 0;
            postsRemainingEl.textContent = remaining;
            
            // Assume batch size of 100 (standard API response)
            const batchSize = 100;
            const processed = batchSize - remaining;
            const percentage = batchSize > 0 ? Math.round((processed / batchSize) * 100) : 0;
            
            progressBar.style.width = percentage + '%';
            
            if (remaining === 0 && !status.active) {
                progressBar.style.width = '0%';
            }
        }

        if (status.current_mode === 'newest' && !document.getElementById(ELEMENT_IDS.MODE_ALERT).classList.contains(CSS_CLASSES.SHOW)) {
            const alert = document.getElementById(ELEMENT_IDS.MODE_ALERT);
            alert.textContent = '🔄 Search exhausted. Now scraping newest posts with blacklist filtering...';
            alert.classList.add(CSS_CLASSES.SHOW);
            setTimeout(() => alert.classList.remove(CSS_CLASSES.SHOW), 5000);
        }

        if (status.storage_warning) {
            const alert = document.getElementById(ELEMENT_IDS.STORAGE_ALERT);
            alert.textContent = '⚠️ Low disk space! Scraper stopped.';
            alert.classList.add(CSS_CLASSES.SHOW);
        }

        // Update activity log
        const logContainer = document.getElementById('scraperLog');
        if (logContainer && status.log && status.log.length > 0) {
            const logHTML = status.log.map(entry => {
                let color = 'var(--txt-main)';
                let icon = '•';
                
                if (entry.level === 'warning') {
                    color = '#f59e0b';
                    icon = '⚠';
                } else if (entry.level === 'error') {
                    color = '#ef4444';
                    icon = '✖';
                } else if (entry.level === 'success') {
                    color = '#10b981';
                    icon = '✓';
                }
                
                return `<div style="color: ${color}; margin-bottom: 4px;">
                    <span style="color: var(--txt-muted);">[${entry.timestamp}]</span> ${icon} ${entry.message}
                </div>`;
            }).join('');
            
            logContainer.innerHTML = logHTML;
            
            // Auto-scroll to bottom
            logContainer.scrollTop = logContainer.scrollHeight;
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

function clearScraperLog() {
    const logContainer = document.getElementById('scraperLog');
    if (logContainer) {
        logContainer.innerHTML = '<div style="color: var(--txt-muted); font-style: italic;">Log cleared.</div>';
    }
}

export {
    startScraper,
    stopScraper,
    updateStatus,
    loadTagHistory,
    clearScraperLog
};