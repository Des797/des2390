"""
Advanced Query Parser: Frontend Syntax → SQL Translator
Supports all frontend query_parser.js functionality on the backend
"""
import re
import logging
from typing import List, Dict, Any, Tuple, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class FilterNode:
    """Represents a filter in the query tree"""
    type: str  # 'FILTER', 'AND', 'OR'
    key: Optional[str] = None
    value: Optional[Any] = None
    operator: Optional[str] = None
    is_negated: bool = False
    children: Optional[List['FilterNode']] = None
    
    def __post_init__(self):
        if self.children is None:
            self.children = []


class QueryTranslator:
    """Translates frontend query syntax to SQL"""
    
    # Field mappings
    FIELD_ALIASES = {
        'type': 'file_type',
        'ext': 'file_type',
        'extension': 'file_type',
        'filetype': 'file_type',
        'user': 'owner',
        'creator': 'owner',
        'author': 'owner',
        'id': 'post_id'
    }
    
    NUMERIC_FIELDS = {'score', 'width', 'height', 'post_id'}
    TEXT_FIELDS = {'owner', 'title', 'rating', 'file_type'}
    
    def __init__(self):
        self.exclusion_prefixes = ['-', '!', 'exclude:', 'remove:', 'negate:', 'not:']
        logger.info("QueryTranslator initialized")
    
    def translate(self, query: str, status: Optional[str] = None) -> Tuple[str, List[Any]]:
        logger.info(f"[QueryTranslator] Translating query: '{query}' with status='{status}'")
        """
        Translate frontend query to SQL WHERE clause
        
        Args:
            query: Frontend query string
            status: Optional status filter (pending/saved/all)
        
        Returns:
            (sql_where_clause, params_list)
        """
        if not query or not query.strip():
            # No query - just status filter
            if status:
                return "status = ?", [status]
            return "1=1", []
        
        try:
            # Parse query into AST
            ast = self._parse_query(query)
            
            # Convert AST to SQL
            sql, params = self._ast_to_sql(ast)
            
            # Add status filter
            if status:
                sql = f"({sql}) AND status = ?"
                params.append(status)
            
            logger.debug(f"Translated query '{query}' to SQL: {sql}")
            logger.debug(f"Params: {params}")
            
            return sql, params
            
        except Exception as e:
            logger.error(f"Query translation failed for '{query}': {e}", exc_info=True)
            # Fallback: treat as simple text search
            if status:
                return "status = ?", [status]
            return "1=1", []
    
    def _parse_query(self, query: str) -> FilterNode:
        """Parse query string into AST"""
        logger.debug(f"[Translator] Starting parse of query: '{query}'")
        tokens = self._tokenize(query)
        logger.debug(f"[Translator] Tokens: {tokens}")
        ast, _ = self._parse_tokens(tokens, 0, 0)
        logger.debug(f"[Translator] AST: {ast}")
        return ast
    
    def _tokenize(self, query: str) -> List[str]:
        """Tokenize query string"""
        tokens = []
        buffer = ''
        paren_depth = 0
        
        for i, char in enumerate(query):
            if char == '(':
                if buffer.strip() and paren_depth == 0:
                    tokens.append(buffer.strip())
                    buffer = ''
                paren_depth += 1
                tokens.append('(')
            elif char == ')':
                if buffer.strip():
                    tokens.append(buffer.strip())
                    buffer = ''
                paren_depth -= 1
                tokens.append(')')
            elif (char in ['|', '~', ',']) and paren_depth > 0:
                if buffer.strip():
                    tokens.append(buffer.strip())
                    buffer = ''
                tokens.append('|')
            elif char == ' ':
                if paren_depth == 0:
                    if buffer.strip():
                        tokens.append(buffer.strip())
                        buffer = ''
                else:
                    # Inside parens, check if space should be kept
                    if buffer.strip():
                        # Look ahead for operators
                        next_idx = i + 1
                        while next_idx < len(query) and query[next_idx] == ' ':
                            next_idx += 1
                        
                        if next_idx < len(query) and query[next_idx] in ['|', '~', ',', ')', '(']:
                            tokens.append(buffer.strip())
                            buffer = ''
                        else:
                            buffer += char
            else:
                buffer += char
        
        if buffer.strip():
            tokens.append(buffer.strip())
        
        return [t for t in tokens if t]
    
    def _parse_tokens(self, tokens: List[str], start_idx: int = 0, depth: int = 0) -> Tuple[FilterNode, int]:
        """Parse tokens into AST"""
        and_group = []
        i = start_idx
        
        while i < len(tokens):
            token = tokens[i]
            
            if token == '(':
                # Parse nested group
                node, new_idx = self._parse_tokens(tokens, i + 1, depth + 1)
                and_group.append(node)
                i = new_idx
            elif token == ')':
                # End of group
                i += 1
                break
            elif token == '|':
                # Skip standalone OR
                i += 1
            else:
                # Parse filter token
                filter_node = self._parse_filter_token(token)
                
                # Check if this starts an OR group
                if i + 1 < len(tokens) and tokens[i + 1] == '|':
                    or_group = [filter_node]
                    i += 1
                    
                    # Collect all OR items
                    while i < len(tokens):
                        if tokens[i] == '|':
                            i += 1
                            continue
                        
                        if tokens[i] == ')' and depth > 0:
                            break
                        
                        if tokens[i] == '(':
                            node, new_idx = self._parse_tokens(tokens, i + 1, depth + 1)
                            or_group.append(node)
                            i = new_idx
                        else:
                            next_token = tokens[i]
                            
                            if i + 1 < len(tokens) and tokens[i + 1] == '|':
                                or_group.append(self._parse_filter_token(next_token))
                                i += 1
                            else:
                                or_group.append(self._parse_filter_token(next_token))
                                i += 1
                                break
                    
                    and_group.append(FilterNode(type='OR', children=or_group))
                else:
                    and_group.append(filter_node)
                    i += 1
        
        # Build result node
        if len(and_group) == 0:
            result = FilterNode(type='AND')
        elif len(and_group) == 1:
            result = and_group[0]
        else:
            result = FilterNode(type='AND', children=and_group)
        
        return result, i
    
    def _parse_filter_token(self, token: str) -> FilterNode:
        """Parse a single filter token"""
        # Extract negation
        is_negated = False
        core = token
        for prefix in self.exclusion_prefixes:
            if token.startswith(prefix):
                is_negated = True
                core = token[len(prefix):]
                break
        
        # Check for field:value syntax
        colon_match = re.match(r'^([a-zA-Z_]+):(.+)$', core)
        
        if not colon_match:
            # Plain tag search
            return FilterNode(
                type='FILTER',
                key='tag',
                value=core,
                operator='=',
                is_negated=is_negated
            )
        
        field = colon_match.group(1).lower()
        value = colon_match.group(2)
        
        # Normalize field name
        field = self.FIELD_ALIASES.get(field, field)
        
        # Parse numeric fields
        if field in self.NUMERIC_FIELDS:
            return self._parse_numeric_filter(field, value, is_negated)
        
        # Text field
        return FilterNode(
            type='FILTER',
            key=field,
            value=value,
            operator='=',
            is_negated=is_negated
        )
    
    def _parse_numeric_filter(self, field: str, value: str, is_negated: bool) -> FilterNode:
        """Parse numeric filter with operators"""
        # Check for wildcard pattern
        if '*' in value:
            return FilterNode(
                type='FILTER',
                key=field,
                value=value,
                operator='pattern',
                is_negated=is_negated
            )
        
        # Parse operator
        op_match = re.match(r'^([<>]=?|=)?(.+)$', value)
        if not op_match:
            raise ValueError(f"Invalid numeric filter: {field}:{value}")
        
        operator = op_match.group(1) or '='
        num_str = op_match.group(2)
        
        try:
            num_value = int(num_str)
        except ValueError:
            raise ValueError(f"Invalid number in {field} filter: {num_str}")
        
        return FilterNode(
            type='FILTER',
            key=field,
            value=num_value,
            operator=operator,
            is_negated=is_negated
        )
    
    def _ast_to_sql(self, node: FilterNode) -> Tuple[str, List[Any]]:
        """Convert AST to SQL WHERE clause"""
        logger.debug(f"[Translator] Converting AST node to SQL: {node}")
        if node.type == 'FILTER':
            return self._filter_to_sql(node)
        elif node.type == 'AND':
            return self._and_to_sql(node)
        elif node.type == 'OR':
            return self._or_to_sql(node)
        else:
            return "1=1", []
        logger.debug(f"[Translator] SQL fragment: {sql}, params: {params}")
        return sql, params
    
    def _filter_to_sql(self, node: FilterNode) -> Tuple[str, List[Any]]:
        """Convert single filter to SQL"""
        key = node.key
        value = node.value
        operator = node.operator
        is_negated = node.is_negated
        
        # Tag search - uses FTS5
        if key == 'tag':
            if '*' in value:
                # Wildcard - use FTS5 prefix search
                fts_term = value.replace('*', '*')  # FTS5 uses * for prefix
            else:
                fts_term = value
            
            if is_negated:
                sql = "post_id NOT IN (SELECT post_id FROM post_search_fts WHERE post_search_fts MATCH ?)"
            else:
                sql = "post_id IN (SELECT post_id FROM post_search_fts WHERE post_search_fts MATCH ?)"
            
            return sql, [fts_term]
        
        # Numeric fields
        if key in self.NUMERIC_FIELDS:
            if operator == 'pattern':
                # Wildcard pattern on numeric field
                pattern = value.replace('*', '%')
                if is_negated:
                    return f"CAST({key} AS TEXT) NOT LIKE ?", [pattern]
                else:
                    return f"CAST({key} AS TEXT) LIKE ?", [pattern]
            else:
                # Numeric comparison
                sql_op = operator
                if is_negated:
                    # Invert operator for negation
                    op_inverse = {'=': '!=', '>': '<=', '>=': '<', '<': '>=', '<=': '>'}
                    sql_op = op_inverse.get(operator, '!=')
                
                return f"{key} {sql_op} ?", [value]
        
        # Text fields (owner, title, rating, file_type)
        if key in self.TEXT_FIELDS:
            if '*' in value:
                # Wildcard - convert to LIKE
                pattern = value.replace('*', '%')
                if is_negated:
                    return f"{key} NOT LIKE ?", [pattern]
                else:
                    return f"{key} LIKE ?", [pattern]
            else:
                # Exact match (case-insensitive)
                if is_negated:
                    return f"LOWER({key}) != LOWER(?)", [value]
                else:
                    return f"LOWER({key}) = LOWER(?)", [value]
        
        # Fallback
        return "1=1", []
    
    def _and_to_sql(self, node: FilterNode) -> Tuple[str, List[Any]]:
        """Convert AND node to SQL"""
        if not node.children:
            return "1=1", []
        
        clauses = []
        params = []
        
        for child in node.children:
            sql, child_params = self._ast_to_sql(child)
            clauses.append(f"({sql})")
            params.extend(child_params)
        
        return " AND ".join(clauses), params
    
    def _or_to_sql(self, node: FilterNode) -> Tuple[str, List[Any]]:
        """Convert OR node to SQL"""
        if not node.children:
            return "1=1", []
        
        clauses = []
        params = []
        
        for child in node.children:
            sql, child_params = self._ast_to_sql(child)
            clauses.append(f"({sql})")
            params.extend(child_params)
        
        return " OR ".join(clauses), params


# Global instance
_query_translator = None

def get_query_translator() -> QueryTranslator:
    """Get singleton QueryTranslator instance"""
    global _query_translator
    if _query_translator is None:
        _query_translator = QueryTranslator()
    return _query_translator