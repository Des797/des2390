"""
Advanced Query Parser: Frontend Syntax → SQL Translator
FIXED: Handles tags with parentheses like luke_(star_wars)
ADDED: Tag-Count:, Duration:, Size:, Matching-Tags: operators
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
        'id': 'post_id',
        'tag-count': 'tag_count',
        'tagcount': 'tag_count',
        'tags': 'tag_count',
        'size': 'file_size',
        'filesize': 'file_size',
        'matching-tags': 'matching_tags',
        'matchingtags': 'matching_tags',
        'matches': 'matching_tags'
    }
    
    NUMERIC_FIELDS = {'score', 'width', 'height', 'post_id', 'tag_count', 'file_size', 'duration', 'matching_tags'}
    TEXT_FIELDS = {'owner', 'title', 'rating', 'file_type'}
    
    # Size unit conversions to bytes
    SIZE_UNITS = {
        'b': 1,
        'byte': 1, 'bytes': 1,
        'kb': 1024, 'kilobyte': 1024, 'kilobytes': 1024,
        'mb': 1024**2, 'megabyte': 1024**2, 'megabytes': 1024**2,
        'gb': 1024**3, 'gigabyte': 1024**3, 'gigabytes': 1024**3,
        'tb': 1024**4, 'terabyte': 1024**4, 'terabytes': 1024**4
    }
    
    def __init__(self):
        self.exclusion_prefixes = ['-', '!', 'exclude:', 'remove:', 'negate:', 'not:']
        logger.info("QueryTranslator initialized with new operators")
    
    def translate(self, query: str, status: Optional[str] = None) -> Tuple[str, List[Any]]:
        """
        Translate frontend query to SQL WHERE clause
        
        Args:
            query: Frontend query string
            status: Optional status filter (pending/saved/all)
        
        Returns:
            (sql_where_clause, params_list)
        """
        if not query or not query.strip():
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
    
    def _is_field_prefix(self, text: str, pos: int) -> bool:
        """
        Check if the character before position is part of a field: prefix
        This helps distinguish between grouping parens and tag parens
        """
        if pos == 0:
            return False
        
        # Look backwards for field: pattern
        check_start = max(0, pos - 50)  # Check up to 50 chars back
        substring = text[check_start:pos]
        
        # Check if we have field: pattern right before this position
        field_pattern = r'(\w+):([^\s]*?)$'
        match = re.search(field_pattern, substring)
        
        if match:
            # We found a field: pattern, now check if we're inside the value part
            value_part = match.group(2)
            return True
        
        return False
    
    def _tokenize(self, query: str) -> List[str]:
        """
        Tokenize query string with SMART parenthesis detection
        
        Strategy:
        1. If ( or ) appears after field: prefix, it's part of the value
        2. If ( or ) is preceded/followed by alphanumeric or underscore, it's part of a tag
        3. Otherwise, it's a grouping operator
        """
        tokens = []
        buffer = ''
        paren_depth = 0
        i = 0
        in_field_value = False
        
        while i < len(query):
            char = query[i]
            
            # Check if we're starting a field value
            if char == ':' and buffer and buffer[-1].isalnum():
                buffer += char
                in_field_value = True
                i += 1
                continue
            
            # Reset field value flag on whitespace at depth 0
            if char == ' ' and paren_depth == 0:
                in_field_value = False
            
            if char == '(':
                # Determine if this is a grouping paren or part of a tag/value
                is_tag_paren = False
                
                # Check if we're inside a field value
                if in_field_value or self._is_field_prefix(query, i):
                    is_tag_paren = True
                # Check if preceded by alphanumeric or underscore
                elif buffer and (buffer[-1].isalnum() or buffer[-1] == '_'):
                    is_tag_paren = True
                
                if is_tag_paren:
                    buffer += char
                else:
                    # Grouping paren
                    if buffer.strip() and paren_depth == 0:
                        tokens.append(buffer.strip())
                        buffer = ''
                    paren_depth += 1
                    tokens.append('(')
                
            elif char == ')':
                # Determine if this is a grouping paren or part of a tag/value
                is_tag_paren = False
                
                # Check if we're inside a field value
                if in_field_value or self._is_field_prefix(query, i + 1):
                    is_tag_paren = True
                # Check if followed by alphanumeric or underscore
                elif i + 1 < len(query) and (query[i + 1].isalnum() or query[i + 1] == '_'):
                    is_tag_paren = True
                # Check if we're not at grouping depth
                elif paren_depth == 0:
                    is_tag_paren = True
                
                if is_tag_paren:
                    buffer += char
                else:
                    # Grouping paren
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
                    # Inside parens - preserve or tokenize based on next char
                    if buffer.strip():
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
            
            i += 1
        
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
    
    def _parse_size_value(self, value_str: str) -> int:
        """Parse size value with units (e.g., '500kb', '1.5mb') into bytes"""
        # Match number with optional decimal and unit
        match = re.match(r'^([\d.]+)\s*([a-zA-Z]*)$', value_str.strip())
        if not match:
            raise ValueError(f"Invalid size format: {value_str}")
        
        number_str, unit_str = match.groups()
        try:
            number = float(number_str)
        except ValueError:
            raise ValueError(f"Invalid number in size: {number_str}")
        
        # Default to bytes if no unit
        unit = unit_str.lower() if unit_str else 'b'
        
        multiplier = self.SIZE_UNITS.get(unit)
        if multiplier is None:
            raise ValueError(f"Unknown size unit: {unit_str}")
        
        return int(number * multiplier)
    
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
        colon_match = re.match(r'^([a-zA-Z_-]+):(.+)$', core)
        
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
        
        # Handle special fields
        if field == 'file_size':
            return self._parse_size_filter(value, is_negated)
        elif field == 'duration':
            return self._parse_duration_filter(value, is_negated)
        elif field == 'tag_count' or field == 'matching_tags':
            return self._parse_numeric_filter(field, value, is_negated)
        elif field in self.NUMERIC_FIELDS:
            return self._parse_numeric_filter(field, value, is_negated)
        
        # Text field
        return FilterNode(
            type='FILTER',
            key=field,
            value=value,
            operator='=',
            is_negated=is_negated
        )
    
    def _parse_size_filter(self, value: str, is_negated: bool) -> FilterNode:
        """Parse size filter with units"""
        # Check for operator
        op_match = re.match(r'^([<>]=?|=)?(.+)$', value)
        if not op_match:
            raise ValueError(f"Invalid size filter: {value}")
        
        operator = op_match.group(1) or '='
        size_str = op_match.group(2)
        
        # Parse size with units
        size_bytes = self._parse_size_value(size_str)
        
        return FilterNode(
            type='FILTER',
            key='file_size',
            value=size_bytes,
            operator=operator,
            is_negated=is_negated
        )
    
    def _parse_duration_filter(self, value: str, is_negated: bool) -> FilterNode:
        """Parse duration filter (in seconds)"""
        # Check for operator
        op_match = re.match(r'^([<>]=?|=)?(.+)$', value)
        if not op_match:
            raise ValueError(f"Invalid duration filter: {value}")
        
        operator = op_match.group(1) or '='
        duration_str = op_match.group(2)
        
        # Parse duration (assume seconds)
        try:
            duration = float(duration_str)
        except ValueError:
            raise ValueError(f"Invalid duration number: {duration_str}")
        
        return FilterNode(
            type='FILTER',
            key='duration',
            value=duration,
            operator=operator,
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
            sql, params = self._filter_to_sql(node)
        elif node.type == 'AND':
            sql, params = self._and_to_sql(node)
        elif node.type == 'OR':
            sql, params = self._or_to_sql(node)
        else:
            sql, params = "1=1", []
        
        logger.debug(f"[Translator] SQL fragment: {sql}, params: {params}")
        return sql, params
    
    def _filter_to_sql(self, node: FilterNode) -> Tuple[str, List[Any]]:
        """Convert single filter to SQL"""
        key = node.key
        value = node.value
        operator = node.operator
        is_negated = node.is_negated
        
        logger.debug(f"Converting filter to SQL: key={key}, value={value}, op={operator}, neg={is_negated}")
        
        # Tag search
        if key == 'tag':
            if '*' in value:
                pattern = value.replace('*', '%')
                search_pattern = f'%"{pattern}"%'
                
                if is_negated:
                    sql = "tags NOT LIKE ?"
                else:
                    sql = "tags LIKE ?"
                
                return sql, [search_pattern]
            else:
                search_pattern = f'%"{value}"%'
                
                if is_negated:
                    sql = "tags NOT LIKE ?"
                else:
                    sql = "tags LIKE ?"
                
                return sql, [search_pattern]
        
        # Tag count (computed from JSON array)
        if key == 'tag_count':
            # Calculate tag count from JSON array length
            if operator == 'pattern':
                pattern = value.replace('*', '%')
                if is_negated:
                    return f"CAST((length(tags) - length(replace(tags, ',', '')) + 1) AS TEXT) NOT LIKE ?", [pattern]
                else:
                    return f"CAST((length(tags) - length(replace(tags, ',', '')) + 1) AS TEXT) LIKE ?", [pattern]
            else:
                sql_op = operator
                if is_negated:
                    op_inverse = {'=': '!=', '>': '<=', '>=': '<', '<': '>=', '<=': '>'}
                    sql_op = op_inverse.get(operator, '!=')
                
                # Count commas + 1 = number of tags (works for ["tag1","tag2"])
                return f"(length(tags) - length(replace(tags, ',', '')) + 1) {sql_op} ?", [value]
        
        # Matching tags (special case - needs to be handled in application layer)
        # This would require knowing the search query, so we'll add a placeholder
        if key == 'matching_tags':
            # This is tricky - we can't compute this in SQL without the search context
            # For now, we'll return a placeholder that always matches
            # The application layer would need to handle this
            logger.warning("matching_tags filter requires application-layer filtering")
            return "1=1", []
        
        # File size
        if key == 'file_size':
            if operator == 'pattern':
                pattern = value.replace('*', '%')
                if is_negated:
                    return f"CAST(file_size AS TEXT) NOT LIKE ?", [pattern]
                else:
                    return f"CAST(file_size AS TEXT) LIKE ?", [pattern]
            else:
                sql_op = operator
                if is_negated:
                    op_inverse = {'=': '!=', '>': '<=', '>=': '<', '<': '>=', '<=': '>'}
                    sql_op = op_inverse.get(operator, '!=')
                
                return f"file_size {sql_op} ?", [value]
        
        # Duration (filter out NULL values when using duration filter)
        if key == 'duration':
            if operator == 'pattern':
                pattern = value.replace('*', '%')
                if is_negated:
                    return f"(duration IS NOT NULL AND CAST(duration AS TEXT) NOT LIKE ?)", [pattern]
                else:
                    return f"(duration IS NOT NULL AND CAST(duration AS TEXT) LIKE ?)", [pattern]
            else:
                sql_op = operator
                if is_negated:
                    op_inverse = {'=': '!=', '>': '<=', '>=': '<', '<': '>=', '<=': '>'}
                    sql_op = op_inverse.get(operator, '!=')
                
                # Only show posts with duration when duration filter is active
                return f"(duration IS NOT NULL AND duration {sql_op} ?)", [value]
        
        # Numeric fields
        if key in self.NUMERIC_FIELDS:
            if operator == 'pattern':
                pattern = value.replace('*', '%')
                if is_negated:
                    return f"CAST({key} AS TEXT) NOT LIKE ?", [pattern]
                else:
                    return f"CAST({key} AS TEXT) LIKE ?", [pattern]
            else:
                sql_op = operator
                if is_negated:
                    op_inverse = {'=': '!=', '>': '<=', '>=': '<', '<': '>=', '<=': '>'}
                    sql_op = op_inverse.get(operator, '!=')
                
                return f"{key} {sql_op} ?", [value]
        
        # Text fields
        if key in self.TEXT_FIELDS:
            if '*' in value:
                pattern = value.replace('*', '%')
                if is_negated:
                    return f"{key} NOT LIKE ?", [pattern]
                else:
                    return f"{key} LIKE ?", [pattern]
            else:
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