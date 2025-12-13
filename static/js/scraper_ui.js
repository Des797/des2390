// Scraper UI Controls
import { showNotification } from './utils.js';
import { startScraper as apiStartScraper, stopScraper as apiStopScraper, getStatus, loadTagHistory as apiLoadTagHistory } from './api.js';
import { loadSearchHistory } from './config.js';
import { state } from './state.js';

async function startScraper() {
    const tags = document.getElementById('searchTags').value;
    try {
        await apiStartScraper(tags);
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;
        showNotification('Scraper started');
        await loadSearchHistory();
    } catch (error) {
        showNotification(error.message || 'Failed to start scraper', 'error');
    }
}

async function stopScraper() {
    try {
        await apiStopScraper();
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
        showNotification('Scraper stopped');
    } catch (error) {
        showNotification('Failed to stop scraper', 'error');
    }
}

async function updateStatus() {
    try {
        const status = await getStatus();
        
        document.getElementById('statProcessed').textContent = status.total_processed;
        document.getElementById('statSaved').textContent = status.total_saved;
        document.getElementById('statDiscarded').textContent = status.total_discarded;
        document.getElementById('statSkipped').textContent = status.total_skipped;
        document.getElementById('statRequests').textContent = status.requests_this_minute;
        document.getElementById('statPage').textContent = status.current_page;

        if (status.current_mode === 'newest' && !document.getElementById('modeAlert').classList.contains('show')) {
            const alert = document.getElementById('modeAlert');
            alert.textContent = '🔄 Search exhausted. Now scraping newest posts...';
            alert.classList.add('show');
            setTimeout(() => alert.classList.remove('show'), 5000);
        }

        if (status.storage_warning) {
            const alert = document.getElementById('storageAlert');
            alert.textContent = '⚠️ Low disk space! Scraper stopped.';
            alert.classList.add('show');
        }

        document.getElementById('startBtn').disabled = status.active;
        document.getElementById('stopBtn').disabled = !status.active;
    } catch (error) {
        console.error('Failed to update status:', error);
    }
}

// Tag History
async function loadTagHistory() {
    try {
        const perPage = parseInt(document.getElementById('tagHistoryPerPage').value);
        const data = await apiLoadTagHistory(state.tagHistoryPage, perPage);
        
        const list = document.getElementById('tagHistoryList');
        document.getElementById('tagHistoryTotal').textContent = `Total: ${data.total} edits`;
        
        if (data.items.length === 0) {
            list.innerHTML = '<p style="color: #64748b; text-align: center;">No tag history</p>';
        } else {
            list.innerHTML = data.items.map(item => {
                const added = item.new_tags.filter(t => !item.old_tags.includes(t));
                const removed = item.old_tags.filter(t => !item.new_tags.includes(t));
                
                return `
                    <div class="tag-history-item">
                        <div class="tag-history-header">
                            <span class="tag-history-post-id">Post #${item.post_id}</span>
                            <span class="tag-history-timestamp">${new Date(item.timestamp).toLocaleString()}</span>
                        </div>
                        <div class="tag-history-changes">
                            <div class="tag-list removed">
                                <div class="tag-list-label">Removed (${removed.length})</div>
                                ${removed.map(t => `<span class="tag">${t}</span>`).join('')}
                            </div>
                            <div class="tag-arrow">→</div>
                            <div class="tag-list added">
                                <div class="tag-list-label">Added (${added.length})</div>
                                ${added.map(t => `<span class="tag">${t}</span>`).join('')}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        renderTagHistoryPagination(data.total, perPage, state.tagHistoryPage);
    } catch (error) {
        showNotification('Failed to load tag history', 'error');
    }
}

function renderTagHistoryPagination(total, perPage, currentPage) {
    const totalPages = Math.ceil(total / perPage);
    const container = document.getElementById('tagHistoryPagination');
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    const buttons = [];
    
    buttons.push(`<button data-page="1" ${currentPage === 1 ? 'disabled' : ''}>⏮️ First</button>`);
    buttons.push(`<button data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>‹ Prev</button>`);
    buttons.push(`<span>Page ${currentPage} of ${totalPages}</span>`);
    buttons.push(`<button data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Next ›</button>`);
    buttons.push(`<button data-page="${totalPages}" ${currentPage === totalPages ? 'disabled' : ''}>Last ⏭️</button>`);
    
    container.innerHTML = buttons.join('');
    
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