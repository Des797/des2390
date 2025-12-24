// Posts UI Features Module
// Provides tag highlighting, sidebar, and other UI enhancements

import { state } from './state.js';
import { filterByTag } from './posts.js';

console.log('✅ posts_ui_features.js loaded');

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

// Render tag sidebar with backend data
export async function renderTagSidebar(filter, search) {
    // Only show on Posts tab - check both tab element and current state
    const currentTab = document.querySelector('.nav-tab.active');
    const isPostsTab = currentTab && currentTab.dataset.tab === 'posts';
    
    const existingSidebar = document.getElementById('tagSidebar');
    
    if (!isPostsTab) {
        // Hide sidebar if not on posts tab
        if (existingSidebar) {
            existingSidebar.style.display = 'none';
        }
        return;
    }
    
    const postsTab = document.getElementById('postsTab');
    if (!postsTab || !postsTab.classList.contains('active')) {
        if (existingSidebar) existingSidebar.style.display = 'none';
        return;
    }
    
    let sidebar = document.getElementById('tagSidebar');
    if (!sidebar) {
        sidebar = document.createElement('div');
        sidebar.id = 'tagSidebar';
        sidebar.className = 'tag-sidebar';
        document.body.appendChild(sidebar);
    }
    
    sidebar.style.display = 'block';
    
    // Check if collapsed
    const isCollapsed = sidebar.classList.contains('collapsed');
    
    // Parse current search for highlighting
    const searchedTags = extractSearchedTags(search);
    
    // Sidebar HTML WITHOUT the toggle button
    sidebar.innerHTML = `
        <div class="sidebar-header">
            <h4>Common Tags</h4>
        </div>
        <div class="sidebar-content ${isCollapsed ? 'hidden' : ''}">
            <div style="color: var(--txt-muted); font-style: italic; padding: 10px;">Loading...</div>
        </div>
    `;
    
    const header = sidebar.querySelector('.sidebar-header');
    const content = sidebar.querySelector('.sidebar-content');

    // Click header to collapse/expand
    header.addEventListener('click', async () => {
        const nowCollapsed = sidebar.classList.toggle('collapsed');
        content.classList.toggle('hidden');
        localStorage.setItem('tagSidebarCollapsed', nowCollapsed);
        
        // Load tags when expanding if not already loaded
        if (!nowCollapsed && content.querySelector('.sidebar-tag') === null) {
            content.innerHTML = '<div style="color: var(--txt-muted); font-style: italic; padding: 10px;">Loading...</div>';
            await loadTagsIntoSidebar(content, filter, search, searchedTags);
        }
    });
    
    // Restore collapsed state
    const savedCollapsed = localStorage.getItem('tagSidebarCollapsed') === 'true';
    if (savedCollapsed) {
        sidebar.classList.add('collapsed');
        content.classList.add('hidden');
    }
    
    // Only load tags if not collapsed
    if (isCollapsed || savedCollapsed) {
        return; // Don't load tags yet - will load on expand
    }
    
    // Load tags into sidebar
    await loadTagsIntoSidebar(content, filter, search, searchedTags);
}

async function loadTagsIntoSidebar(content, filter, search, searchedTags) {
    const topTags = await calculateTopTags(filter, search, 50);
    
    if (topTags.length === 0) {
        content.innerHTML = '<div style="color: var(--txt-muted); font-style: italic; padding: 10px;">No tags</div>';
        return;
    }
    
    content.innerHTML = topTags.map(item => {
        const isSearched = searchedTags.includes(item.tag.toLowerCase());
        const highlightClass = isSearched ? 'searched-tag' : '';
        
        return `
            <div class="sidebar-tag ${highlightClass}" data-tag="${item.tag}">
                <span class="sidebar-tag-name" title="${item.tag}">${item.tag}</span>
                <div class="sidebar-tag-actions">
                    <button class="tag-action-add" data-tag="${item.tag}" title="Add to search">+</button>
                    <button class="tag-action-negate" data-tag="${item.tag}" title="Exclude from search">−</button>
                    <span class="tag-count">${item.count}</span>
                </div>
            </div>
        `;
    }).join('');
    
    enableTagTextScroll();
    
    // Attach click handlers for tag names (replace search)
    content.querySelectorAll('.sidebar-tag-name').forEach(el => {
        el.addEventListener('click', async () => {
            const tag = el.closest('.sidebar-tag').dataset.tag;
            const { filterByTag } = await import('./posts.js');
            filterByTag(tag);
        });
    });
    
    // Attach handlers for add button
    content.querySelectorAll('.tag-action-add').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const tag = btn.dataset.tag;
            await appendTagToSearch(`tag:${tag}`);
        });
    });
    
    // Attach handlers for negate button
    content.querySelectorAll('.tag-action-negate').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const tag = btn.dataset.tag;
            await appendTagToSearch(`-tag:${tag}`);
        });
    });

    function enableTagTextScroll() {
        document.querySelectorAll('.sidebar-tag').forEach(tagEl => {
            const textEl = tagEl.querySelector('.sidebar-tag-name');
            if (!textEl) return;

            const originalText = textEl.textContent;

            // Reset content
            textEl.innerHTML = '';
            const inner = document.createElement('span');
            inner.className = 'scroll-inner';
            inner.textContent = originalText;
            textEl.appendChild(inner);

            // Container styles
            textEl.style.display = 'flex';
            textEl.style.alignItems = 'center';
            textEl.style.overflow = 'hidden';
            textEl.style.whiteSpace = 'nowrap';
            textEl.style.textOverflow = 'ellipsis';
            textEl.style.position = 'relative';

            inner.style.display = 'inline-block';
            inner.style.whiteSpace = 'nowrap';
            inner.style.willChange = 'transform';

            const containerWidth = textEl.offsetWidth;
            const fullWidth = inner.scrollWidth;

            if (fullWidth <= containerWidth) {
                // Short text: right-align
                textEl.style.justifyContent = 'flex-end';
                textEl.classList.remove('fade-edges');
                return;
            }

            // Long text: left-align and prepare scrolling
            textEl.style.justifyContent = 'flex-start';
            textEl.classList.add('fade-edges');

            // Duplicate inner span for seamless loop
            const inner2 = inner.cloneNode(true);
            inner2.style.marginLeft = '20px'; // optional spacing
            textEl.appendChild(inner2);

            let animationFrame = null;
            const scrollSpeed = 0.5; // pixels per frame
            let offset = 0;
            let hovering = false;

            function step() {
                if (!hovering) return;

                offset += scrollSpeed;
                if (offset >= fullWidth + 20) offset = 0; // wrap around

                inner.style.transform = `translateX(${-offset}px)`;
                inner2.style.transform = `translateX(${-offset}px)`;

                animationFrame = requestAnimationFrame(step);
            }

            tagEl.addEventListener('mouseenter', () => {
                hovering = true;
                if (!animationFrame) animationFrame = requestAnimationFrame(step);
            });

            tagEl.addEventListener('mouseleave', () => {
                hovering = false;
                offset = 0;
                inner.style.transform = 'translateX(0)';
                inner2.style.transform = 'translateX(0)';
                cancelAnimationFrame(animationFrame);
                animationFrame = null;
            });
        });
    }
}

function extractSearchedTags(search) {
    if (!search) return [];
    
    // Extract plain tags and tag: filters
    const tags = [];
    const tokens = search.split(/\s+/);
    
    tokens.forEach(token => {
        // Remove negation prefixes
        let clean = token.replace(/^[-!]/, '').replace(/^(exclude|remove|negate|not):/, '');
        
        // Remove field prefix if present
        clean = clean.replace(/^tag:/, '');
        
        // Remove wildcards for matching
        clean = clean.replace(/\*/g, '');
        
        // Remove OR syntax
        clean = clean.replace(/[()|\~,]/g, '');
        
        if (clean && !clean.includes(':')) {
            tags.push(clean.toLowerCase());
        }
    });
    
    return tags;
}

async function appendTagToSearch(tag) {
    const searchInput = document.getElementById('postsSearchInput');
    if (!searchInput) return;
    
    const current = searchInput.value.trim();
    const newSearch = current ? `${current} ${tag}` : tag;
    
    searchInput.value = newSearch;
    
    // Trigger search
    const { performSearch } = await import('./posts.js');
    performSearch();
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

// Card size scaling - IMPROVED with larger defaults and better text scaling
let cardSizeScale = 1.0;

export function setCardSize(scale) {
    // Better range: 0.3 (30%) to 3.0 (300%)
    cardSizeScale = Math.max(0.3, Math.min(3.0, scale));
    
    const baseWidth = 180;
    const scaledWidth = Math.floor(baseWidth * cardSizeScale);
    
    const grid = document.getElementById('postsGrid');
    if (grid) {
        // Use scaled width for grid columns - prevents overlap
        grid.style.gridTemplateColumns = `repeat(auto-fill, ${scaledWidth}px)`;
        grid.style.gap = `${Math.max(8, 12 * cardSizeScale)}px`; // Scale gap too
    }
    
    // Scale text and buttons with card size - LARGER BASE SIZES
    const textScale = Math.max(0.8, Math.min(1.5, cardSizeScale));
    const buttonScale = Math.max(0.85, Math.min(1.3, cardSizeScale));
    
    document.querySelectorAll('.gallery-item').forEach(card => {
        card.style.width = `${scaledWidth}px`;
        
        // Scale all text elements - using larger base sizes
        const info = card.querySelector('.gallery-item-info');
        if (info) {
            info.style.fontSize = `${13 * textScale}px`; // was 11px
        }
        
        // Scale title
        const title = card.querySelector('.gallery-item-title');
        if (title) {
            title.style.fontSize = `${13 * textScale}px`; // was 11px
        }
        
        // Scale owner
        const owner = card.querySelector('.gallery-item-owner');
        if (owner) {
            owner.style.fontSize = `${12 * textScale}px`; // was 10px
        }
        
        // Scale ID/info
        const idEl = card.querySelector('.gallery-item-id');
        if (idEl) {
            idEl.style.fontSize = `${11 * textScale}px`; // was 10px
        }
        
        // Scale buttons
        const buttons = card.querySelectorAll('button');
        buttons.forEach(btn => {
            btn.style.fontSize = `${11 * buttonScale}px`; // was 10px
            btn.style.padding = `${8 * buttonScale}px`;   // was 6px
        });
        
        // Scale tags
        const tags = card.querySelectorAll('.tag');
        tags.forEach(tag => {
            tag.style.fontSize = `${10 * textScale}px`;   // was 9px
            tag.style.padding = `${3 * textScale}px ${6 * textScale}px`; // was 2px 5px
        });
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
    console.log('📱 Initializing posts UI features...');
    
    // Check if we're on the posts tab
    const currentTab = document.querySelector('.nav-tab.active');
    const isPostsTab = currentTab && currentTab.dataset.tab === 'posts';
    
    if (!isPostsTab) {
        console.log('Not on posts tab, skipping UI initialization');
        return;
    }
    
    // Add card size control with better range
    const controls = document.querySelector('.gallery-controls');
    if (controls && !document.getElementById('cardSizeControl')) {
        const sizeControl = document.createElement('div');
        sizeControl.className = 'card-size-control';
        sizeControl.innerHTML = `
            <label style="color: var(--txt-muted); font-size: 12px;">Card Size:</label>
            <input type="range" id="cardSizeControl" min="30" max="300" value="100" step="10">
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
    
    // Adjust main content for sidebar (right side)
    const postsTab = document.getElementById('postsTab');
    if (postsTab && !postsTab.classList.contains('posts-with-sidebar')) {
        postsTab.classList.add('posts-with-sidebar');
    }
    
    console.log('✅ Posts UI features initialized');
}

// Export for global access
window.highlightMatchingTags = highlightMatchingTags;
window.renderTagSidebar = renderTagSidebar;
window.sortByTagMatching = sortByTagMatching;
window.showTagDropdown = showTagDropdown;
window.setCardSize = setCardSize;
window.initPostsUI = initPostsUI;