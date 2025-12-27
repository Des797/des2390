// Complete Query Parser - FIXED for tags with parentheses
// ADDED: Tag-Count:, Duration:, Size:, Matching-Tags: operators

// Size units for conversion to bytes
const SIZE_UNITS = {
    'b': 1,
    'byte': 1, 'bytes': 1,
    'kb': 1024, 'kilobyte': 1024, 'kilobytes': 1024,
    'mb': 1024**2, 'megabyte': 1024**2, 'megabytes': 1024**2,
    'gb': 1024**3, 'gigabyte': 1024**3, 'gigabytes': 1024**3,
    'tb': 1024**4, 'terabyte': 1024**4, 'terabytes': 1024**4
};

function isFieldPrefix(text, pos) {
    if (pos === 0) return false;
    
    const checkStart = Math.max(0, pos - 50);
    const substring = text.substring(checkStart, pos);
    
    // Check if we have field: pattern right before this position
    const fieldPattern = /(\w+):([^\s]*?)$/;
    const match = substring.match(fieldPattern);
    
    return match !== null;
}

function tokenize(query) {
    const tokens = [];
    let buffer = '';
    let parenDepth = 0;
    let inFieldValue = false;
    const len = query.length;
    
    for (let i = 0; i < len; i++) {
        const char = query[i];
        
        // Check if we're starting a field value
        if (char === ':' && buffer && /\w$/.test(buffer)) {
            buffer += char;
            inFieldValue = true;
            continue;
        }
        
        // Reset field value flag on whitespace at depth 0
        if (char === ' ' && parenDepth === 0) {
            inFieldValue = false;
        }
        
        if (char === '(') {
            let isTagParen = false;
            
            // Check if we're inside a field value
            if (inFieldValue || isFieldPrefix(query, i)) {
                isTagParen = true;
            }
            // Check if preceded by alphanumeric or underscore
            else if (buffer && /[\w_]$/.test(buffer)) {
                isTagParen = true;
            }
            
            if (isTagParen) {
                buffer += char;
            } else {
                // Grouping paren
                if (buffer.trim() && parenDepth === 0) {
                    tokens.push(buffer.trim());
                    buffer = '';
                }
                parenDepth++;
                tokens.push('(');
            }
        } else if (char === ')') {
            let isTagParen = false;
            
            // Check if we're inside a field value
            if (inFieldValue || isFieldPrefix(query, i + 1)) {
                isTagParen = true;
            }
            // Check if followed by alphanumeric or underscore
            else if (i + 1 < len && /[\w_]/.test(query[i + 1])) {
                isTagParen = true;
            }
            // Check if we're not at grouping depth
            else if (parenDepth === 0) {
                isTagParen = true;
            }
            
            if (isTagParen) {
                buffer += char;
            } else {
                // Grouping paren
                if (buffer.trim()) {
                    tokens.push(buffer.trim());
                    buffer = '';
                }
                parenDepth--;
                tokens.push(')');
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
    if (['tag-count', 'tagcount', 'tags'].includes(normalized)) {
        return 'tag_count';
    }
    if (['size', 'filesize', 'file_size'].includes(normalized)) {
        return 'file_size';
    }
    if (['matching-tags', 'matchingtags', 'matches'].includes(normalized)) {
        return 'matching_tags';
    }
    
    return normalized;
}

function createWildcardRegex(pattern) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    const regexPattern = escaped.replace(/\*/g, '.*');
    return new RegExp(`^${regexPattern}$`, 'i');
}

function parseSizeValue(valueStr) {
    // Match number with optional decimal and unit
    const match = valueStr.trim().match(/^([\d.]+)\s*([a-zA-Z]*)$/);
    if (!match) {
        throw new Error(`Invalid size format: ${valueStr}`);
    }
    
    const [, numberStr, unitStr] = match;
    const number = parseFloat(numberStr);
    
    if (isNaN(number)) {
        throw new Error(`Invalid number in size: ${numberStr}`);
    }
    
    // Default to bytes if no unit
    const unit = unitStr ? unitStr.toLowerCase() : 'b';
    
    const multiplier = SIZE_UNITS[unit];
    if (multiplier === undefined) {
        throw new Error(`Unknown size unit: ${unitStr}`);
    }
    
    return Math.floor(number * multiplier);
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
    
    let numValue;
    
    // Special handling for size (with units)
    if (field === 'file_size') {
        numValue = parseSizeValue(numPart);
    } else {
        numValue = parseFloat(numPart);
        if (isNaN(numValue)) {
            throw new Error(`Invalid number in ${field} filter: ${numPart}`);
        }
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
    
    const colonMatch = core.match(/^([a-zA-Z_-]+):(.+)$/);
    
    if (!colonMatch) {
        return createFilter('tag', core, isNeg);
    }
    
    const field = normalizeFieldName(colonMatch[1]);
    const value = colonMatch[2];
    
    // Numeric fields (including new ones)
    if (['score', 'width', 'height', 'tag_count', 'file_size', 'duration', 'matching_tags'].includes(field)) {
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

function matchFilter(post, filter, searchQuery = '') {
    const { key, value, isNeg, operator, regex } = filter;
    let match = false;
    
    try {
        // Tag count
        if (key === 'tag_count') {
            const tagCount = post.tags ? post.tags.length : 0;
            
            if (operator === 'pattern') {
                match = regex.test(String(tagCount));
            } else {
                switch (operator) {
                    case '>': match = tagCount > value; break;
                    case '>=': match = tagCount >= value; break;
                    case '<': match = tagCount < value; break;
                    case '<=': match = tagCount <= value; break;
                    case '=': match = tagCount === value; break;
                }
            }
        }
        // Matching tags (requires search context)
        else if (key === 'matching_tags') {
            // Count how many search tags this post matches
            const matchCount = post.matchingTags ? post.matchingTags.length : 0;
            
            if (operator === 'pattern') {
                match = regex.test(String(matchCount));
            } else {
                switch (operator) {
                    case '>': match = matchCount > value; break;
                    case '>=': match = matchCount >= value; break;
                    case '<': match = matchCount < value; break;
                    case '<=': match = matchCount <= value; break;
                    case '=': match = matchCount === value; break;
                }
            }
        }
        // File size
        else if (key === 'file_size') {
            const fileSize = post.file_size || 0;
            
            if (operator === 'pattern') {
                match = regex.test(String(fileSize));
            } else {
                switch (operator) {
                    case '>': match = fileSize > value; break;
                    case '>=': match = fileSize >= value; break;
                    case '<': match = fileSize < value; break;
                    case '<=': match = fileSize <= value; break;
                    case '=': match = fileSize === value; break;
                }
            }
        }
        // Duration (only match posts with duration)
        else if (key === 'duration') {
            if (!post.duration) {
                match = false;  // Exclude posts without duration when duration filter is active
            } else {
                const duration = parseFloat(post.duration);
                
                if (operator === 'pattern') {
                    match = regex.test(String(duration));
                } else {
                    switch (operator) {
                        case '>': match = duration > value; break;
                        case '>=': match = duration >= value; break;
                        case '<': match = duration < value; break;
                        case '<=': match = duration <= value; break;
                        case '=': match = duration === value; break;
                    }
                }
            }
        }
        // Other numeric fields
        else if (['score', 'width', 'height'].includes(key)) {
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