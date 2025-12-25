// Utility Functions
import { ELEMENT_IDS, CSS_CLASSES, NOTIFICATION_TYPES, UI_CONSTANTS } from './constants.js';

function showNotification(message, type = NOTIFICATION_TYPES.SUCCESS) {
    const notification = document.getElementById(ELEMENT_IDS.NOTIFICATION);
    const text = document.getElementById(ELEMENT_IDS.NOTIFICATION_TEXT);
    
    notification.className = `${CSS_CLASSES.NOTIFICATION} ${CSS_CLASSES.SHOW}`;
    if (type === NOTIFICATION_TYPES.ERROR) notification.classList.add(CSS_CLASSES.ERROR);
    if (type === NOTIFICATION_TYPES.WARNING) notification.classList.add(CSS_CLASSES.WARNING);
    
    text.textContent = message;
    
    // Check if mobile
    const isMobile = window.innerWidth <= 768;
    
    // Auto-dismiss timer
    const dismissTimeout = setTimeout(() => {
        notification.classList.remove(CSS_CLASSES.SHOW);
    }, UI_CONSTANTS.NOTIFICATION_DURATION);
    
    // Click to dismiss (especially for mobile)
    const clickHandler = () => {
        clearTimeout(dismissTimeout);
        notification.classList.remove(CSS_CLASSES.SHOW);
        notification.removeEventListener('click', clickHandler);
    };
    
    notification.addEventListener('click', clickHandler);
    
    // On mobile, also dismiss on any touch outside the notification
    if (isMobile) {
        const touchHandler = (e) => {
            if (!notification.contains(e.target)) {
                clearTimeout(dismissTimeout);
                notification.classList.remove(CSS_CLASSES.SHOW);
                notification.removeEventListener('click', clickHandler);
                document.removeEventListener('touchstart', touchHandler);
            }
        };
        
        // Add slight delay before enabling touch-outside-to-dismiss
        setTimeout(() => {
            document.addEventListener('touchstart', touchHandler, { once: true });
        }, 100);
    }
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

// ================= ADVANCED SEARCH SYSTEM =================

/**
 * Tokenizer with proper parenthesis handling and space ignoring
 * Handles nested parentheses and ignores spaces around operators inside parens
 */
/**
 * Optimized tokenizer - O(n) instead of O(n²)
 * Single-pass algorithm with minimal allocations
 */
function tokenize(query) {
    const tokens = [];
    let buffer = '';
    let parenDepth = 0;
    const len = query.length;
    
    for (let i = 0; i < len; i++) {
        const char = query[i];
        
        if (char === '(') {
            if (buffer.trim() && parenDepth === 0) {
                tokens.push(buffer.trim());
                buffer = '';
            }
            parenDepth++;
            tokens.push('(');
        } else if (char === ')') {
            if (buffer.trim()) {
                tokens.push(buffer.trim());
                buffer = '';
            }
            parenDepth--;
            tokens.push(')');
            
            if (parenDepth < 0) {
                throw new Error('Unmatched closing parenthesis');
            }
        } else if ((char === '|' || char === '~' || char === ',') && parenDepth > 0) {
            if (buffer.trim()) {
                tokens.push(buffer.trim());
                buffer = '';
            }
            tokens.push('|');
        } else if (char === ' ') {
            if (parenDepth === 0) {
                if (buffer.trim()) {
                    tokens.push(buffer.trim());
                    buffer = '';
                }
            } else if (buffer.trim()) {
                // Peek ahead efficiently (without substring)
                let nextIdx = i + 1;
                while (nextIdx < len && query[nextIdx] === ' ') nextIdx++;
                
                if (nextIdx < len) {
                    const nextChar = query[nextIdx];
                    if (['|', '~', ',', ')', '('].includes(nextChar)) {
                        tokens.push(buffer.trim());
                        buffer = '';
                    } else {
                        buffer += char;
                    }
                } else {
                    buffer += char;
                }
            }
        } else {
            buffer += char;
        }
    }
    
    if (buffer.trim()) {
        tokens.push(buffer.trim());
    }
    
    if (parenDepth > 0) {
        throw new Error(`Unclosed parenthesis (missing ${parenDepth} closing parenthesis)`);
    }
    
    return tokens;
}

/**
 * Extract negation prefix from a token
 * Supports: -, !, exclude:, remove:, negate:, not:
 */
function extractNegation(token) {
    const exclusionPrefixes = ['-', '!', 'exclude:', 'remove:', 'negate:', 'not:'];
    
    for (const prefix of exclusionPrefixes) {
        if (token.startsWith(prefix)) {
            return {
                isNeg: true,
                core: token.substring(prefix.length)
            };
        }
    }
    
    return { isNeg: false, core: token };
}

/**
 * Normalize field names (type/ext/extension -> file_type, user -> owner, etc.)
 */
function normalizeFieldName(field) {
    const normalized = field.toLowerCase();
    
    if (['type', 'file_type', 'ext', 'extension', 'filetype'].includes(normalized)) {
        return 'file_type';
    }
    if (['user', 'creator', 'author'].includes(normalized)) {
        return 'owner';
    }
    
    return normalized;
}

/**
 * Parse a single filter token into a structured filter object
 * Handles: tags, owner:, type:, score:, rating:, title:, width:, height:
 * Supports wildcards in all fields
 */
function parseFilterToken(token) {
    const { isNeg, core } = extractNegation(token);
    
    // Check for field:value syntax
    const colonMatch = core.match(/^([a-zA-Z_]+):(.+)$/);
    
    if (!colonMatch) {
        // Plain tag
        return createFilter('tag', core, isNeg);
    }
    
    const field = normalizeFieldName(colonMatch[1]);
    const value = colonMatch[2];
    
    // Handle numeric fields with operators
    if (['score', 'width', 'height'].includes(field)) {
        return parseNumericFilter(field, value, isNeg);
    }
    
    // Handle other fields
    return createFilter(field, value, isNeg);
}

/**
 * Parse numeric filter with operators (>, >=, <, <=, =) and wildcards
 */
function parseNumericFilter(field, value, isNeg) {
    // Try to match operator + number or wildcard pattern
    const operatorMatch = value.match(/^([<>]=?|=)?(.+)$/);
    
    if (!operatorMatch) {
        throw new Error(`Invalid ${field} filter: ${value}`);
    }
    
    const operator = operatorMatch[1] || '=';
    const numPart = operatorMatch[2];
    
    // Check if it's a wildcard pattern
    if (numPart.includes('*')) {
        // Wildcard in numeric field - treat as pattern match
        return {
            type: 'FILTER',
            key: field,
            value: numPart,
            isNeg,
            operator: 'pattern',
            regex: createWildcardRegex(numPart)
        };
    }
    
    // Parse as number
    const numValue = parseFloat(numPart);
    if (isNaN(numValue)) {
        throw new Error(`Invalid number in ${field} filter: ${numPart}`);
    }
    
    return {
        type: 'FILTER',
        key: field,
        value: numValue,
        isNeg,
        operator,
        regex: null
    };
}

/**
 * Create a filter object for string fields
 */
function createFilter(key, value, isNeg) {
    const hasWildcard = value.includes('*');
    
    return {
        type: 'FILTER',
        key,
        value,
        isNeg,
        operator: '=',
        regex: hasWildcard ? createWildcardRegex(value) : null
    };
}

/**
 * Create regex from wildcard pattern
 * * at start = ends with
 * * at end = starts with
 * * in middle = contains
 * * at both ends = contains
 */
function createWildcardRegex(pattern) {
    // Escape special regex characters except *
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    // Replace * with .*
    const regexPattern = escaped.replace(/\*/g, '.*');
    return new RegExp(`^${regexPattern}$`, 'i');
}

/**
 * Match wildcard pattern against text
 */
function matchesWildcard(text, pattern, regex) {
    if (!text) return false;
    if (regex) return regex.test(String(text));
    return String(text).toLowerCase() === pattern.toLowerCase();
}

/**
 * Recursive descent parser - FIXED for 3+ OR items and exclusions
 */
function parseTokens(tokens, startIndex = 0, depth = 0) {
    const andGroup = [];
    let i = startIndex;
    
    while (i < tokens.length) {
        const token = tokens[i];
        
        if (token === '(') {
            // Parse nested group
            const { node, newIndex } = parseTokens(tokens, i + 1, depth + 1);
            andGroup.push(node);
            i = newIndex;
        } else if (token === ')') {
            // End of group
            if (depth === 0) {
                throw new Error('Unexpected closing parenthesis');
            }
            i++;
            break;
        } else if (token === '|') {
            // Skip standalone OR (handled in OR collection)
            i++;
        } else {
            // Regular filter token
            try {
                const filter = parseFilterToken(token);
                
                // Check if this starts an OR group
                if (i + 1 < tokens.length && tokens[i + 1] === '|') {
                    // Collect entire OR group
                    const orGroup = [filter];
                    i++; // Move past current token
                    
                    // Keep collecting until we hit something that's not part of OR
                    while (i < tokens.length) {
                        if (tokens[i] === '|') {
                            i++; // Skip the OR operator
                            continue;
                        }
                        
                        if (tokens[i] === ')' && depth > 0) {
                            // End of parenthetical group
                            break;
                        }
                        
                        if (tokens[i] === '(') {
                            // Nested group in OR
                            const { node, newIndex } = parseTokens(tokens, i + 1, depth + 1);
                            orGroup.push(node);
                            i = newIndex;
                        } else {
                            // Regular token
                            const nextToken = tokens[i];
                            
                            // Check if next is OR or end
                            if (i + 1 < tokens.length && tokens[i + 1] === '|') {
                                // More OR items coming
                                orGroup.push(parseFilterToken(nextToken));
                                i++;
                            } else {
                                // Last item in OR group
                                orGroup.push(parseFilterToken(nextToken));
                                i++;
                                break;
                            }
                        }
                    }
                    
                    andGroup.push({ type: 'OR', children: orGroup });
                } else {
                    // Single filter, not part of OR
                    andGroup.push(filter);
                    i++;
                }
            } catch (e) {
                console.warn(`Skipping invalid filter: ${token} - ${e.message}`);
                i++;
            }
        }
    }
    
    // Build result
    let result;
    if (andGroup.length === 0) {
        result = { type: 'AND', children: [] };
    } else if (andGroup.length === 1) {
        result = andGroup[0];
    } else {
        result = { type: 'AND', children: andGroup };
    }
    
    return { node: result, newIndex: i };
}

/**
 * Main parse function with error handling
 */
function parseQueryTree(query) {
    if (!query || !query.trim()) {
        return { type: 'AND', children: [], errors: [] };
    }
    
    try {
        const tokens = tokenize(query);
        const { node } = parseTokens(tokens, 0, 0);
        return { ...node, errors: [] };
    } catch (e) {
        console.error('Parse error:', e);
        return {
            type: 'AND',
            children: [],
            errors: [e.message]
        };
    }
}

/**
 * Match a single filter against a post
 */
function matchFilter(post, filter) {
    const { key, value, isNeg, operator, regex } = filter;
    let match = false;
    
    try {
        if (['score', 'width', 'height'].includes(key)) {
            const postValue = parseInt(post[key]) || 0;
            
            if (operator === 'pattern') {
                // Wildcard pattern on numeric field
                match = regex.test(String(postValue));
            } else {
                const filterValue = parseInt(value);
                switch (operator) {
                    case '>': match = postValue > filterValue; break;
                    case '>=': match = postValue >= filterValue; break;
                    case '<': match = postValue < filterValue; break;
                    case '<=': match = postValue <= filterValue; break;
                    case '=': match = postValue === filterValue; break;
                }
            }
        } else if (key === 'tag') {
            match = post.tags && post.tags.some(t => matchesWildcard(t, value, regex));
        } else if (key === 'owner') {
            match = matchesWildcard(post.owner, value, regex);
        } else if (key === 'file_type') {
            const postType = (post.file_type || '').replace('.', '').toLowerCase();
            const searchType = value.replace('.', '').toLowerCase();
            match = matchesWildcard(postType, searchType, regex);
        } else if (key === 'title') {
            match = matchesWildcard(post.title || '', value, regex);
        } else if (key === 'rating') {
            match = matchesWildcard(post.rating || '', value, regex);
        }
    } catch (e) {
        console.warn(`Filter match error:`, e);
        match = false;
    }
    
    return isNeg ? !match : match;
}

/**
 * Match OR node with proper exclusion handling
 */
function matchNode(post, node) {
    if (!node) return true;
    
    switch (node.type) {
        case 'FILTER':
            return matchFilter(post, node);
        case 'AND':
            return node.children.every(child => matchNode(post, child));
        case 'OR':
            // OR matches if ANY child matches
            const matches = node.children.some(child => matchNode(post, child));
            return matches;
        default:
            return true;
    }
}

/**
 * Apply search filter to posts array
 * Returns filtered posts and any errors
 */
function applySearchFilter(posts, query) {
    if (!query || !query.trim()) {
        return posts;
    }
    
    const tree = parseQueryTree(query);
    
    // Show errors if any
    if (tree.errors && tree.errors.length > 0) {
        showNotification(`Search errors: ${tree.errors.join(', ')}`, NOTIFICATION_TYPES.WARNING);
    }
    
    return posts.filter(post => matchNode(post, tree));
}

export { 
    showNotification, 
    formatBytes, 
    formatDate, 
    apiCall, 
    getTagWithCount,
    parseQueryTree,
    applySearchFilter
};
