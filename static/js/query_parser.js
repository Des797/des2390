// Complete Query Parser - exports all functions needed by posts.js
// This file contains the full implementation from utils.js

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

function createWildcardRegex(pattern) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    const regexPattern = escaped.replace(/\*/g, '.*');
    return new RegExp(`^${regexPattern}$`, 'i');
}

function parseNumericFilter(field, value, isNeg) {
    const operatorMatch = value.match(/^([<>]=?|=)?(.+)$/);
    
    if (!operatorMatch) {
        throw new Error(`Invalid ${field} filter: ${value}`);
    }
    
    const operator = operatorMatch[1] || '=';
    const numPart = operatorMatch[2];
    
    if (numPart.includes('*')) {
        return {
            type: 'FILTER',
            key: field,
            value: numPart,
            isNeg,
            operator: 'pattern',
            regex: createWildcardRegex(numPart)
        };
    }
    
    const numValue = parseInt(numPart);
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

function parseFilterToken(token) {
    const { isNeg, core } = extractNegation(token);
    
    const colonMatch = core.match(/^([a-zA-Z_]+):(.+)$/);
    
    if (!colonMatch) {
        return createFilter('tag', core, isNeg);
    }
    
    const field = normalizeFieldName(colonMatch[1]);
    const value = colonMatch[2];
    
    if (['score', 'width', 'height'].includes(field)) {
        return parseNumericFilter(field, value, isNeg);
    }
    
    return createFilter(field, value, isNeg);
}

function parseTokens(tokens, startIndex = 0, depth = 0) {
    const andGroup = [];
    let i = startIndex;
    
    while (i < tokens.length) {
        const token = tokens[i];
        
        if (token === '(') {
            const { node, newIndex } = parseTokens(tokens, i + 1, depth + 1);
            andGroup.push(node);
            i = newIndex;
        } else if (token === ')') {
            if (depth === 0) {
                throw new Error('Unexpected closing parenthesis');
            }
            i++;
            break;
        } else if (token === '|') {
            i++;
        } else {
            try {
                const filter = parseFilterToken(token);
                
                if (i + 1 < tokens.length && tokens[i + 1] === '|') {
                    const orGroup = [filter];
                    i++;
                    
                    while (i < tokens.length) {
                        if (tokens[i] === '|') {
                            i++;
                            continue;
                        }
                        
                        if (tokens[i] === ')' && depth > 0) {
                            break;
                        }
                        
                        if (tokens[i] === '(') {
                            const { node, newIndex } = parseTokens(tokens, i + 1, depth + 1);
                            orGroup.push(node);
                            i = newIndex;
                        } else {
                            const nextToken = tokens[i];
                            
                            if (i + 1 < tokens.length && tokens[i + 1] === '|') {
                                orGroup.push(parseFilterToken(nextToken));
                                i++;
                            } else {
                                orGroup.push(parseFilterToken(nextToken));
                                i++;
                                break;
                            }
                        }
                    }
                    
                    andGroup.push({ type: 'OR', children: orGroup });
                } else {
                    andGroup.push(filter);
                    i++;
                }
            } catch (e) {
                console.warn(`Skipping invalid filter: ${token} - ${e.message}`);
                i++;
            }
        }
    }
    
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

function matchesWildcard(text, pattern, regex) {
    if (!text) return false;
    if (regex) return regex.test(String(text));
    return String(text).toLowerCase() === pattern.toLowerCase();
}

function matchFilter(post, filter) {
    const { key, value, isNeg, operator, regex } = filter;
    let match = false;
    
    try {
        if (['score', 'width', 'height'].includes(key)) {
            const postValue = parseInt(post[key]) || 0;
            
            if (operator === 'pattern') {
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

export function matchNode(post, node) {
    if (!node) return true;
    
    switch (node.type) {
        case 'FILTER':
            return matchFilter(post, node);
        case 'AND':
            return node.children.every(child => matchNode(post, child));
        case 'OR':
            return node.children.some(child => matchNode(post, child));
        default:
            return true;
    }
}

export function parseQueryTree(query) {
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