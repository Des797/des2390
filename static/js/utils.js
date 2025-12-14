// Utility Functions
import { ELEMENT_IDS, CSS_CLASSES, NOTIFICATION_TYPES, UI_CONSTANTS } from './constants.js';

function showNotification(message, type = NOTIFICATION_TYPES.SUCCESS) {
    const notification = document.getElementById(ELEMENT_IDS.NOTIFICATION);
    const text = document.getElementById(ELEMENT_IDS.NOTIFICATION_TEXT);
    
    notification.className = `${CSS_CLASSES.NOTIFICATION} ${CSS_CLASSES.SHOW}`;
    if (type === NOTIFICATION_TYPES.ERROR) notification.classList.add(CSS_CLASSES.ERROR);
    if (type === NOTIFICATION_TYPES.WARNING) notification.classList.add(CSS_CLASSES.WARNING);
    
    text.textContent = message;
    
    setTimeout(() => {
        notification.classList.remove(CSS_CLASSES.SHOW);
    }, UI_CONSTANTS.NOTIFICATION_DURATION);
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(timestamp) {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(endpoint, options);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`API call failed: ${endpoint}`, error);
        throw error;
    }
}

function getTagWithCount(tag, tagCounts) {
    const count = tagCounts[tag] || 0;
    return count > 0 ? `${tag} (${count})` : tag;
}

// Advanced Search/Filter Parser
function parseSearchQuery(query) {
    const filters = {
        tags: [],
        owner: null,
        score_min: null,
        score_max: null,
        rating: null
    };
    
    const parts = query.split(/\s+/);
    
    for (const part of parts) {
        if (part.startsWith('owner:')) {
            filters.owner = part.substring(6);
        } else if (part.startsWith('score:')) {
            const scoreQuery = part.substring(6);
            const match = scoreQuery.match(/([<>=]+)?(\d+)/);
            if (match) {
                const operator = match[1] || '=';
                const value = parseInt(match[2]);
                if (operator.includes('>')) filters.score_min = value;
                if (operator.includes('<')) filters.score_max = value;
                if (operator === '=') {
                    filters.score_min = value;
                    filters.score_max = value;
                }
            }
        } else if (part.startsWith('rating:')) {
            filters.rating = part.substring(7);
        } else if (part) {
            filters.tags.push(part);
        }
    }
    
    return filters;
}

function applySearchFilter(posts, query) {
    if (!query.trim()) return posts;
    
    const filters = parseSearchQuery(query);
    
    return posts.filter(post => {
        // Tag filter
        if (filters.tags.length > 0) {
            const hasAllTags = filters.tags.every(tag => {
                if (tag.startsWith('-')) {
                    return !post.tags.some(t => t.includes(tag.substring(1)));
                }
                if (tag.includes('*')) {
                    const regex = new RegExp(tag.replace(/\*/g, '.*'));
                    return post.tags.some(t => regex.test(t));
                }
                return post.tags.includes(tag);
            });
            if (!hasAllTags) return false;
        }
        
        // Owner filter
        if (filters.owner && post.owner !== filters.owner) {
            return false;
        }
        
        // Score filter
        if (filters.score_min !== null && post.score < filters.score_min) {
            return false;
        }
        if (filters.score_max !== null && post.score > filters.score_max) {
            return false;
        }
        
        // Rating filter
        if (filters.rating && post.rating !== filters.rating) {
            return false;
        }
        
        return true;
    });
}

export { 
    showNotification, 
    formatBytes, 
    formatDate, 
    apiCall, 
    getTagWithCount,
    parseSearchQuery,
    applySearchFilter
};