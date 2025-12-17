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

// Advanced Search/Filter Parser with OR support and improved wildcards
function parseSearchQuery(query) {
    const filters = {
        tags: [],
        orGroups: [], // [[tag1, tag2], [tag3, tag4]] means (tag1 OR tag2) AND (tag3 OR tag4)
        owner: null,
        ownerWildcard: false,
        score_min: null,
        score_max: null,
        rating: null,
        title: null,
        file_type: null,
        width_min: null,
        width_max: null,
        height_min: null,
        height_max: null
    };
    
    // Handle OR groups with parentheses: (tag1|tag2|tag3)
    const orGroupRegex = /\(([^)]+)\)/g;
    let processedQuery = query;
    let orGroupMatch;
    
    while ((orGroupMatch = orGroupRegex.exec(query)) !== null) {
        const groupContent = orGroupMatch[1];
        const orTags = groupContent.split(/[|~]/).map(t => t.trim()).filter(t => t);
        if (orTags.length > 0) {
            filters.orGroups.push(orTags);
        }
        // Remove the matched group from query for further processing
        processedQuery = processedQuery.replace(orGroupMatch[0], '');
    }
    
    const parts = processedQuery.split(/\s+/);
    
    for (const part of parts) {
        if (!part) continue;
        
        if (part.startsWith('owner:')) {
            const ownerValue = part.substring(6);
            filters.owner = ownerValue;
            filters.ownerWildcard = ownerValue.includes('*');
        } else if (part.startsWith('score:')) {
            const scoreQuery = part.substring(6);
            const match = scoreQuery.match(/([<>=]+)?(\d+)/);
            if (match) {
                const operator = match[1] || '=';
                const value = parseInt(match[2]);
                if (operator.includes('>') || operator === '>=') filters.score_min = value;
                if (operator.includes('<') || operator === '<=') filters.score_max = value;
                if (operator === '=') {
                    filters.score_min = value;
                    filters.score_max = value;
                }
            }
        } else if (part.startsWith('rating:')) {
            filters.rating = part.substring(7);
        } else if (part.startsWith('title:')) {
            filters.title = part.substring(6);
        } else if (part.startsWith('file_type:') || part.startsWith('type:')) {
            const prefix = part.startsWith('file_type:') ? 'file_type:' : 'type:';
            filters.file_type = part.substring(prefix.length);
        } else if (part.startsWith('width:')) {
            const widthQuery = part.substring(6);
            const match = widthQuery.match(/([<>=]+)?(\d+)/);
            if (match) {
                const operator = match[1] || '=';
                const value = parseInt(match[2]);
                if (operator.includes('>') || operator === '>=') filters.width_min = value;
                if (operator.includes('<') || operator === '<=') filters.width_max = value;
                if (operator === '=') {
                    filters.width_min = value;
                    filters.width_max = value;
                }
            }
        } else if (part.startsWith('height:')) {
            const heightQuery = part.substring(7);
            const match = heightQuery.match(/([<>=]+)?(\d+)/);
            if (match) {
                const operator = match[1] || '=';
                const value = parseInt(match[2]);
                if (operator.includes('>') || operator === '>=') filters.height_min = value;
                if (operator.includes('<') || operator === '<=') filters.height_max = value;
                if (operator === '=') {
                    filters.height_min = value;
                    filters.height_max = value;
                }
            }
        } else {
            filters.tags.push(part);
        }
    }
    
    return filters;
}

function matchesWildcard(text, pattern) {
    // Convert wildcard pattern to regex
    // * only applies to the side it's on
    if (pattern.startsWith('*') && pattern.endsWith('*')) {
        // *pattern* - contains
        const innerPattern = pattern.slice(1, -1);
        return text.includes(innerPattern);
    } else if (pattern.startsWith('*')) {
        // *pattern - ends with
        const innerPattern = pattern.slice(1);
        return text.endsWith(innerPattern);
    } else if (pattern.endsWith('*')) {
        // pattern* - starts with
        const innerPattern = pattern.slice(0, -1);
        return text.startsWith(innerPattern);
    } else {
        // No wildcard - exact match
        return text === pattern;
    }
}

function applySearchFilter(posts, query) {
    if (!query.trim()) return posts;
    
    const filters = parseSearchQuery(query);
    
    return posts.filter(post => {
        // OR groups - at least one tag from each group must match
        if (filters.orGroups.length > 0) {
            for (const orGroup of filters.orGroups) {
                let groupMatched = false;
                for (const orTag of orGroup) {
                    if (orTag.startsWith('-')) {
                        // Negative OR doesn't make much sense, but handle it
                        if (!post.tags.some(t => matchesWildcard(t, orTag.substring(1)))) {
                            groupMatched = true;
                            break;
                        }
                    } else if (orTag.includes('*')) {
                        if (post.tags.some(t => matchesWildcard(t, orTag))) {
                            groupMatched = true;
                            break;
                        }
                    } else {
                        if (post.tags.includes(orTag)) {
                            groupMatched = true;
                            break;
                        }
                    }
                }
                if (!groupMatched) return false;
            }
        }
        
        // Regular tag filters (AND logic)
        if (filters.tags.length > 0) {
            const hasAllTags = filters.tags.every(tag => {
                if (tag.startsWith('-')) {
                    const negTag = tag.substring(1);
                    if (negTag.includes('*')) {
                        return !post.tags.some(t => matchesWildcard(t, negTag));
                    }
                    return !post.tags.some(t => t.includes(negTag));
                }
                if (tag.includes('*')) {
                    return post.tags.some(t => matchesWildcard(t, tag));
                }
                return post.tags.includes(tag);
            });
            if (!hasAllTags) return false;
        }
        
        // Owner filter with wildcard support
        if (filters.owner) {
            if (filters.ownerWildcard) {
                if (!matchesWildcard(post.owner, filters.owner)) {
                    return false;
                }
            } else {
                if (post.owner !== filters.owner) {
                    return false;
                }
            }
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
        
        // Title filter (case-insensitive contains)
        if (filters.title) {
            const postTitle = (post.title || '').toLowerCase();
            const searchTitle = filters.title.toLowerCase();
            if (!postTitle.includes(searchTitle)) {
                return false;
            }
        }
        
        // File type filter
        if (filters.file_type) {
            const postType = (post.file_type || '').replace('.', '').toLowerCase();
            const searchType = filters.file_type.replace('.', '').toLowerCase();
            if (postType !== searchType) {
                return false;
            }
        }
        
        // Width filter
        if (filters.width_min !== null && post.width < filters.width_min) {
            return false;
        }
        if (filters.width_max !== null && post.width > filters.width_max) {
            return false;
        }
        
        // Height filter
        if (filters.height_min !== null && post.height < filters.height_min) {
            return false;
        }
        if (filters.height_max !== null && post.height > filters.height_max) {
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