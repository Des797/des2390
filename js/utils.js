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

// ------------------- Advanced Search/Filter System -------------------

// Wildcard matcher (uses precompiled regex if provided)
function matchesWildcard(text, pattern, regex) {
    if (regex) return regex.test(text);
    if (!pattern) return false;
    const regexStr = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
    return new RegExp(`^${regexStr}$`, 'i').test(text);
}

// Extract negation prefixes
function extractNegation(part) {
    const exclusionPrefixes = ['-', '!', 'exclude:', 'remove:', 'negate:'];
    let isNeg = false;
    let core = part;
    for (const prefix of exclusionPrefixes) {
        if (core.startsWith(prefix)) {
            isNeg = true;
            core = core.substring(prefix.length);
            break;
        }
    }
    return { isNeg, core };
}

// Tokenizer: splits query into words and special characters, ignoring spaces
function tokenize(query) {
    const tokens = [];
    let buffer = '';
    for (let i = 0; i < query.length; i++) {
        const char = query[i];
        if (['(', ')', '|', '~'].includes(char)) {
            if (buffer.trim()) tokens.push(buffer.trim());
            tokens.push(char);
            buffer = '';
        } else {
            buffer += char;
        }
    }
    if (buffer.trim()) tokens.push(buffer.trim());
    return tokens.map(t => t.trim()).filter(Boolean);
}

// Parse single token into a filter with optional precompiled regex
function parseFilterToken(token) {
    const { isNeg, core } = extractNegation(token);
    let key = 'tag';
    let value = core;
    let operator = '=';

    const kvMatch = core.match(/^(\w+):(.+)$/);
    if (kvMatch) {
        key = kvMatch[1].toLowerCase();
        value = kvMatch[2];
        if (['type', 'file_type', 'ext', 'extension'].includes(key)) key = 'file_type';
        if (key === 'owner') key = 'owner';
        if (key === 'title') key = 'title';
        if (key === 'rating') key = 'rating';
        if (['score', 'width', 'height'].includes(key)) {
            const numMatch = value.match(/^([<>]=?|=)?(\d+)$/);
            if (numMatch) {
                operator = numMatch[1] || '=';
                value = parseInt(numMatch[2]);
            } else value = parseInt(value);
        }
    }

    // Precompile regex for wildcard values
    let regex = null;
    if (typeof value === 'string' && value.includes('*')) {
        regex = new RegExp('^' + value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$', 'i');
    }

    return { type: 'FILTER', key, value, isNeg, operator, regex };
}

// Recursive parser to build tree supporting nested ORs (index-based)
function parseTokens(tokens, startIndex = 0) {
    const children = [];
    let current = [];
    let i = startIndex;

    while (i < tokens.length) {
        const token = tokens[i++];
        if (token === '(') {
            const { node: subNode, newIndex } = parseTokens(tokens, i);
            current.push(subNode);
            i = newIndex;
        } else if (token === ')') {
            if (current.length === 1) children.push(current[0]);
            else children.push({ type: 'AND', children: current });
            return { node: children[0] ?? { type: 'AND', children: [] }, newIndex: i };
        } else if (token === '|' || token === '~') {
            if (children.length === 0) {
                children.push({ type: 'OR', children: current });
            } else if (children[children.length - 1].type === 'OR') {
                children[children.length - 1].children.push(...current);
            } else {
                children.push({ type: 'OR', children: current });
            }
            current = [];
        } else {
            current.push(parseFilterToken(token));
        }
    }

    if (current.length === 1) children.push(current[0]);
    else if (current.length > 1) children.push({ type: 'AND', children: current });

    return { node: children[0] ?? { type: 'AND', children: [] }, newIndex: i };
}

// Parse query into a tree
function parseQueryTree(query) {
    const tokens = tokenize(query);
    const { node } = parseTokens(tokens);
    return node;
}

// Match a single filter against a post
function matchFilter(post, filter) {
    const { key, value, isNeg, operator, regex } = filter;
    let match = false;

    if (['score', 'width', 'height'].includes(key)) {
        const postValue = parseInt(post[key]);
        switch (operator) {
            case '>': match = postValue > value; break;
            case '>=': match = postValue >= value; break;
            case '<': match = postValue < value; break;
            case '<=': match = postValue <= value; break;
            case '=': match = postValue === value; break;
        }
    } else {
        switch (key) {
            case 'tag': match = post.tags.some(t => matchesWildcard(t, value, regex)); break;
            case 'owner': match = matchesWildcard(post.owner, value, regex); break;
            case 'file_type': match = matchesWildcard((post.file_type || '').replace('.', '').toLowerCase(), value.replace('.', '').toLowerCase(), regex); break;
            case 'title': match = matchesWildcard(post.title || '', value, regex); break;
            case 'rating': match = matchesWildcard(post.rating, value, regex); break;
        }
    }

    return isNeg ? !match : match;
}

// Recursive matcher for the query tree
function matchNode(post, node) {
    switch (node.type) {
        case 'FILTER': return matchFilter(post, node);
        case 'AND': return node.children.every(child => matchNode(post, child));
        case 'OR': return node.children.some(child => matchNode(post, child));
        default: return false;
    }
}

// Apply search filter to a list of posts
function applySearchFilter(posts, query) {
    if (!query.trim()) return posts;
    
    const tree = parseQueryTree(query);
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
