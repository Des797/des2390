// Simplified Query Parser - Frontend handles UI hints, backend does heavy lifting
// Only essential client-side features: tag highlighting, basic validation

// Size units for UI display
const SIZE_UNITS = {
    'b': 1,
    'byte': 1, 'bytes': 1,
    'kb': 1024, 'kilobyte': 1024, 'kilobytes': 1024,
    'mb': 1024**2, 'megabyte': 1024**2, 'megabytes': 1024**2,
    'gb': 1024**3, 'gigabyte': 1024**3, 'gigabytes': 1024**3,
    'tb': 1024**4, 'terabyte': 1024**4, 'terabytes': 1024**4
};

/**
 * Extract tag filters from query for client-side highlighting
 * Backend does the real parsing
 */
function extractSearchTags(query) {
    if (!query) return [];
    
    const tags = [];
    
    // Remove field: filters
    let clean = query.replace(/\b\w+:[^\s]+/g, '');
    
    // Remove negations
    clean = clean.replace(/[-!]\S+/g, '');
    
    // Remove parens and OR operators
    clean = clean.replace(/[()]/g, ' ').replace(/[|~,]/g, ' ');
    
    // Split and filter
    const tokens = clean.split(/\s+/).filter(t => t && !t.startsWith('-') && !t.startsWith('!'));
    
    return tokens.map(t => t.toLowerCase());
}

/**
 * Check if query has sort: or per-page: operators
 * Used to update UI state
 */
function extractMetadata(query) {
    const metadata = {
        sort: null,
        order: null,
        perPage: null
    };
    
    if (!query) return metadata;
    
    // Extract sort:
    const sortMatch = query.match(/\bsort:([^\s]+)/i);
    if (sortMatch) {
        const sortValue = sortMatch[1];
        
        // Parse sort value
        let field = sortValue;
        let order = null;
        
        // Direction indicators
        if (field.endsWith('>')) {
            field = field.slice(0, -1);
            order = 'asc';
        } else if (field.startsWith('>')) {
            field = field.slice(1);
            order = 'desc';
        } else if (field.endsWith('<')) {
            field = field.slice(0, -1);
            order = 'desc';
        } else if (field.startsWith('<')) {
            field = field.slice(1);
            order = 'asc';
        } else if (field.endsWith('-desc') || field.endsWith('_desc')) {
            field = field.slice(0, -5);
            order = 'desc';
        } else if (field.endsWith('-asc') || field.endsWith('_asc')) {
            field = field.slice(0, -4);
            order = 'asc';
        }
        
        // Remove quotes
        field = field.replace(/["']/g, '');
        
        metadata.sort = field;
        metadata.order = order;
    }
    
    // Extract per-page:
    const perPageMatch = query.match(/\bper-page:(\d+)/i);
    if (perPageMatch) {
        metadata.perPage = parseInt(perPageMatch[1]);
    }
    
    return metadata;
}

/**
 * Simple wildcard matching for client-side tag highlighting
 */
function matchesWildcard(text, pattern) {
    if (!text || !pattern) return false;
    
    if (!pattern.includes('*')) {
        return text.toLowerCase() === pattern.toLowerCase();
    }
    
    const regex = new RegExp(
        '^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$',
        'i'
    );
    
    return regex.test(text);
}

/**
 * Count how many search tags a post matches (for client-side display)
 */
function countMatchingTags(post, searchQuery) {
    if (!searchQuery || !post.tags) return 0;
    
    const searchTags = extractSearchTags(searchQuery);
    if (searchTags.length === 0) return 0;
    
    const postTags = post.tags.map(t => t.toLowerCase());
    let count = 0;
    
    for (const searchTag of searchTags) {
        if (searchTag.includes('*')) {
            if (postTags.some(pt => matchesWildcard(pt, searchTag))) {
                count++;
            }
        } else {
            if (postTags.includes(searchTag)) {
                count++;
            }
        }
    }
    
    return count;
}

/**
 * Highlight matching tags in post for UI
 * Backend filters, frontend just highlights
 */
export function highlightMatchingTags(posts, searchQuery) {
    if (!searchQuery) return posts;
    
    const searchTags = extractSearchTags(searchQuery);
    if (searchTags.length === 0) return posts;
    
    posts.forEach(post => {
        post.matchingTags = [];
        post.matchScore = 0;
        
        if (!post.tags) return;
        
        const postTags = post.tags.map(t => t.toLowerCase());
        
        post.tags.forEach((tag, idx) => {
            for (const searchTag of searchTags) {
                if (matchesWildcard(postTags[idx], searchTag)) {
                    post.matchingTags.push(tag);
                    post.matchScore++;
                    break;
                }
            }
        });
    });
    
    return posts;
}

/**
 * Validate query syntax (basic check)
 * Returns error message or null if valid
 */
export function validateQuery(query) {
    if (!query || !query.trim()) return null;
    
    // Check for unmatched parentheses
    let parenDepth = 0;
    for (const char of query) {
        if (char === '(') parenDepth++;
        if (char === ')') parenDepth--;
        if (parenDepth < 0) {
            return 'Unmatched closing parenthesis';
        }
    }
    if (parenDepth > 0) {
        return `Unclosed parenthesis (missing ${parenDepth} closing)`;
    }
    
    return null;
}

/**
 * Parse size value for display (no validation, backend handles that)
 */
export function parseSizeDisplay(sizeStr) {
    const match = sizeStr.match(/^([\d.]+)\s*([a-zA-Z]*)$/);
    if (!match) return sizeStr;
    
    const [, num, unit] = match;
    const unitLower = unit ? unit.toLowerCase() : 'b';
    const multiplier = SIZE_UNITS[unitLower] || 1;
    
    return `${num} ${unit || 'B'} (${(parseFloat(num) * multiplier).toLocaleString()} bytes)`;
}

/**
 * Format duration for display
 */
export function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Export essential functions only
export {
    extractSearchTags,
    extractMetadata,
    countMatchingTags,
    matchesWildcard,
    validateQuery,
    parseSizeDisplay,
    formatDuration
};