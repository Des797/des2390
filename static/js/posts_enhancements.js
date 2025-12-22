// New UI features for posts

import { state } from './state.js';
import { filterByTag } from './posts.js';

// Tag matching and highlighting
export function highlightMatchingTags(posts, searchQuery) {
    if (!searchQuery) return posts;
    
    // Parse search query to extract tag filters
    const tagFilters = extractTagFilters(searchQuery);
    
    posts.forEach(post => {
        post.matchingTags = [];
        post.matchScore = 0;
        
        post.tags.forEach(tag => {
            if (tagFilters.some(filter => matchesFilter(tag, filter))) {
                post.matchingTags.push(tag);
                post.matchScore++;
            }
        });
    });
    
    return posts;
}

function extractTagFilters(query) {
    // Extract tag patterns from query (handle OR, wildcards, etc)
    const filters = [];
    const tokens = query.split(/\s+/);
    
    tokens.forEach(token => {
        // Skip non-tag filters
        if (token.includes(':') && !token.startsWith('tag:')) return;
        
        // Remove tag: prefix if present
        const cleanToken = token.replace(/^tag:/, '');
        
        // Handle OR groups: (red | blue)
        if (cleanToken.includes('|')) {
            const orParts = cleanToken.replace(/[()]/g, '').split('|').map(t => t.trim());
            filters.push(...orParts);
        } else {
            filters.push(cleanToken);
        }
    });
    
    return filters.filter(f => f && !f.startsWith('-') && !f.startsWith('!'));
}

function matchesFilter(tag, filter) {
    // Wildcard matching
    if (filter.includes('*')) {
        const regex = new RegExp('^' + filter.replace(/\*/g, '.*') + '$', 'i');
        return regex.test(tag);
    }
    
    return tag.toLowerCase() === filter.toLowerCase();
}

// Calculate most common tags from backend
export async function calculateTopTags(filter, search, limit = 50) {
    try {
        const params = new URLSearchParams({
            filter: filter || 'all',
            limit: limit.toString()
        });
        
        if (search) {
            params.append('search', search);
        }
        
        const response = await fetch(`/api/posts/top-tags?${params}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        return data.tags;
        
    } catch (error) {
        console.error('Failed to calculate top tags:', error);
        return [];
    }
}

// Sort by matching tags
export function sortByTagMatching(posts, searchQuery, blacklist = []) {
    if (!searchQuery && !blacklist.length) return posts;
    
    return posts.sort((a, b) => {
        // Calculate blacklist penalty
        const aBlacklist = a.tags.filter(t => blacklist.some(bl => matchesFilter(t, bl))).length;
        const bBlacklist = b.tags.filter(t => blacklist.some(bl => matchesFilter(t, bl))).length;
        
        // Blacklisted posts go to bottom
        if (aBlacklist !== bBlacklist) {
            return bBlacklist - aBlacklist;
        }
        
        // Then sort by matching score
        return (b.matchScore || 0) - (a.matchScore || 0);
    });
}

// Card size scaling
let cardSizeScale = 1.0;

export function setCardSize(scale) {
    cardSizeScale = Math.max(0.5, Math.min(2.0, scale));
    
    const grid = document.getElementById('postsGrid');
    if (grid) {
        grid.style.gridTemplateColumns = `repeat(auto-fill, ${180 * cardSizeScale}px)`;
    }
    
    // Update all cards
    document.querySelectorAll('.gallery-item').forEach(card => {
        card.style.transform = `scale(${cardSizeScale})`;
        card.style.transformOrigin = 'top left';
    });
}

export function getCardSize() {
    return cardSizeScale;
}

// Tag dropdown (non-moving)
export function showTagDropdown(button, allTags) {
    const existingDropdown = document.querySelector('.tag-dropdown');
    if (existingDropdown) {
        existingDropdown.remove();
    }
    
    const dropdown = document.createElement('div');
    dropdown.className = 'tag-dropdown show';
    dropdown.innerHTML = allTags.map(tag => {
        const matchClass = tag.isMatching ? 'matching' : '';
        return `<span class="tag ${matchClass}" data-tag="${tag.name}">${tag.display}</span>`;
    }).join('');
    
    // Position relative to button
    const rect = button.getBoundingClientRect();
    dropdown.style.top = (rect.bottom + window.scrollY) + 'px';
    dropdown.style.left = rect.left + 'px';
    
    document.body.appendChild(dropdown);
    
    // Attach tag click handlers
    dropdown.querySelectorAll('.tag').forEach(el => {
        el.addEventListener('click', () => {
            filterByTag(el.dataset.tag);
            dropdown.remove();
        });
    });
    
    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', function closeDropdown(e) {
            if (!dropdown.contains(e.target) && e.target !== button) {
                dropdown.remove();
                document.removeEventListener('click', closeDropdown);
            }
        });
    }, 0);
    
    return dropdown;
}

// Initialize new UI features
export function initPostsUI() {
    // Add card size control
    const controls = document.querySelector('.gallery-controls');
    if (controls && !document.getElementById('cardSizeControl')) {
        const sizeControl = document.createElement('div');
        sizeControl.className = 'card-size-control';
        sizeControl.innerHTML = `
            <label style="color: var(--txt-muted); font-size: 12px;">Card Size:</label>
            <input type="range" id="cardSizeControl" min="50" max="200" value="100" step="10">
            <span id="cardSizeValue" style="color: var(--txt-muted); font-size: 12px;">100%</span>
        `;
        controls.appendChild(sizeControl);
        
        const slider = document.getElementById('cardSizeControl');
        const valueDisplay = document.getElementById('cardSizeValue');
        
        slider.addEventListener('input', (e) => {
            const scale = parseInt(e.target.value) / 100;
            setCardSize(scale);
            valueDisplay.textContent = e.target.value + '%';
        });
    }
    
    // Add tag sidebar if not exists
    if (!document.getElementById('tagSidebar')) {
        const sidebar = document.createElement('div');
        sidebar.id = 'tagSidebar';
        sidebar.className = 'tag-sidebar collapsed'; 
        
        // We create a permanent structure
        sidebar.innerHTML = `
            <div class="sidebar-header">
                <h4>Common Tags</h4>
            </div>
            <div class="sidebar-content"></div>
        `;
        
        document.body.appendChild(sidebar);
        
        // Click the header to toggle
        const header = sidebar.querySelector('.sidebar-header');
        header.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }
    const postsTab = document.getElementById('postsTab');
    if (postsTab) postsTab.classList.add('posts-with-sidebar');
}

// Export for global access
window.highlightMatchingTags = highlightMatchingTags;
window.renderTagSidebar = renderTagSidebar;
window.sortByTagMatching = sortByTagMatching;
window.showTagDropdown = showTagDropdown;
window.setCardSize = setCardSize;