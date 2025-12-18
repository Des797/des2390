export function parseQueryTree(query) {
    const tokens = tokenize(query);
    const { node } = parseTokens(tokens);
    return node;
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
