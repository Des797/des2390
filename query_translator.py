"""
Advanced Query Parser: Frontend Syntax → SQL Translator
ENHANCED: Flexible operators, Sort/Per-Page, Date filters, Aspect-Ratio
"""
import re
import logging
from typing import List, Dict, Any, Tuple, Optional
from dataclasses import dataclass
from datetime import datetime

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


@dataclass
class QueryMetadata:
    """Metadata extracted from query (sort, per-page, etc)"""
    sort_by: Optional[str] = None
    sort_order: Optional[str] = None
    per_page: Optional[int] = None


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
        'file-size': 'file_size',
        'matching-tags': 'matching_tags',
        'matchingtags': 'matching_tags',
        'matches': 'matching_tags',
        'date-created': 'created_at',
        'datecreated': 'created_at',
        'upload-date': 'created_at',
        'uploaded': 'created_at',
        'date-downloaded': 'downloaded_at',
        'datedownloaded': 'downloaded_at',
        'download-date': 'downloaded_at',
        'downloaded': 'downloaded_at',
        'aspect-ratio': 'aspect_ratio',
        'aspectratio': 'aspect_ratio',
        'ratio': 'aspect_ratio'
    }
    
    NUMERIC_FIELDS = {
        'score', 'width', 'height', 'post_id', 'tag_count', 
        'file_size', 'duration', 'matching_tags', 'aspect_ratio'
    }
    TEXT_FIELDS = {'owner', 'title', 'rating', 'file_type'}
    DATE_FIELDS = {'created_at', 'downloaded_at'}
    
    # Size unit conversions to bytes
    SIZE_UNITS = {
        'b': 1,
        'byte': 1, 'bytes': 1,
        'kb': 1024, 'kilobyte': 1024, 'kilobytes': 1024,
        'mb': 1024**2, 'megabyte': 1024**2, 'megabytes': 1024**2,
        'gb': 1024**3, 'gigabyte': 1024**3, 'gigabytes': 1024**3,
        'tb': 1024**4, 'terabyte': 1024**4, 'terabytes': 1024**4
    }
    
    # Sort field mappings
    SORT_ALIASES = {
        'download': 'downloaded_at',
        'download-date': 'downloaded_at',
        'download_date': 'downloaded_at',
        'downloaded': 'downloaded_at',
        'upload': 'created_at',
        'upload-date': 'created_at',
        'upload_date': 'created_at',
        'uploaded': 'created_at',
        'created': 'created_at',
        'id': 'post_id',
        'post-id': 'post_id',
        'post_id': 'post_id',
        'tags': 'tag_count',
        'tag-count': 'tag_count',
        'tag_count': 'tag_count',
        'tagcount': 'tag_count',
        'file-size': 'file_size',
        'filesize': 'file_size',
        'file_size': 'file_size',
        'size': 'file_size',
        'score': 'score',
        'width': 'width',
        'height': 'height',
        'owner': 'owner',
        'user': 'owner',
        'creator': 'owner',
        'rating': 'rating',
        'duration': 'duration',
        'time': 'duration',
        'length': 'duration',
        'timestamp': 'timestamp',
        'random': 'random'
    }
    
    def __init__(self):
        self.exclusion_prefixes = ['-', '!', 'exclude:', 'remove:', 'negate:', 'not:']
        logger.info("QueryTranslator initialized with enhanced features")
    
    def translate(self, query: str, status: Optional[str] = None) -> Tuple[str, List[Any], QueryMetadata]:
        """
        Translate frontend query to SQL WHERE clause
        
        Returns:
            (sql_where_clause, params_list, metadata)
        """
        if not query or not query.strip():
            if status:
                return "status = ?", [status], QueryMetadata()
            return "1=1", [], QueryMetadata()
        
        try:
            # Extract metadata (sort:, per-page:, etc)
            clean_query, metadata = self._extract_metadata(query)
            
            # Parse query into AST
            ast = self._parse_query(clean_query)
            
            # Convert AST to SQL
            sql, params = self._ast_to_sql(ast)
            
            # Add status filter
            if status:
                sql = f"({sql}) AND status = ?"
                params.append(status)
            
            logger.debug(f"Translated query '{query}' to SQL: {sql}")
            logger.debug(f"Params: {params}, Metadata: {metadata}")
            
            return sql, params, metadata
            
        except Exception as e:
            logger.error(f"Query translation failed for '{query}': {e}", exc_info=True)
            if status:
                return "status = ?", [status], QueryMetadata()
            return "1=1", [], QueryMetadata()
    
    def _extract_metadata(self, query: str) -> Tuple[str, QueryMetadata]:
        """Extract sort:, per-page:, etc from query"""
        metadata = QueryMetadata()
        clean_parts = []
        
        # Split into tokens
        tokens = query.split()
        i = 0
        
        while i < len(tokens):
            token = tokens[i]
            
            # Check for sort:
            if token.lower().startswith('sort:'):
                sort_value = token[5:]  # Remove 'sort:'
                if sort_value:
                    metadata.sort_by, metadata.sort_order = self._parse_sort_value(sort_value)
                i += 1
                continue
            
            # Check for per-page:
            if token.lower().startswith('per-page:'):
                try:
                    per_page = int(token[9:])  # Remove 'per-page:'
                    metadata.per_page = max(1, min(per_page, 200))  # Clamp 1-200
                except ValueError:
                    logger.warning(f"Invalid per-page value: {token}")
                i += 1
                continue
            
            # Not metadata, keep it
            clean_parts.append(token)
            i += 1
        
        clean_query = ' '.join(clean_parts)
        return clean_query, metadata
    
    def _parse_sort_value(self, value: str) -> Tuple[Optional[str], Optional[str]]:
        """
        Parse sort value with flexible syntax
        
        Examples:
        - download-date → ('downloaded_at', None)
        - download-date-desc → ('downloaded_at', 'DESC')
        - size-ascending → ('file_size', 'ASC')
        - size> → ('file_size', 'ASC')
        - >size → ('file_size', 'DESC')
        - duration;size-asc → ('duration,file_size', 'ASC')
        """
        if not value:
            return None, None
        
        # Handle quoted values
        value = value.strip('"\'')
        
        # Handle direction indicators
        if value.endswith('>'):
            field = value[:-1]
            order = 'ASC'
        elif value.startswith('>'):
            field = value[1:]
            order = 'DESC'
        elif value.endswith('<'):
            field = value[:-1]
            order = 'DESC'
        elif value.startswith('<'):
            field = value[1:]
            order = 'ASC'
        else:
            # Check for -desc, -asc suffix
            if value.endswith('-desc') or value.endswith('_desc'):
                field = value[:-5]
                order = 'DESC'
            elif value.endswith('-descending') or value.endswith('_descending'):
                field = value[:-11]
                order = 'DESC'
            elif value.endswith('-asc') or value.endswith('_asc'):
                field = value[:-4]
                order = 'ASC'
            elif value.endswith('-ascending') or value.endswith('_ascending'):
                field = value[:-10]
                order = 'ASC'
            else:
                field = value
                order = None
        
        # Handle multiple fields (duration;size)
        if ';' in field or ',' in field:
            separator = ';' if ';' in field else ','
            fields = [f.strip() for f in field.split(separator)]
            normalized_fields = []
            for f in fields:
                normalized = self.SORT_ALIASES.get(f.lower().replace(' ', '-'), f)
                normalized_fields.append(normalized)
            return ','.join(normalized_fields), order
        
        # Normalize field name
        field = field.lower().replace(' ', '-')
        normalized_field = self.SORT_ALIASES.get(field, field)
        
        return normalized_field, order
    
    def _is_field_prefix(self, text: str, pos: int) -> bool:
        """Check if position is inside a field: value"""
        if pos == 0:
            return False
        
        check_start = max(0, pos - 50)
        substring = text[check_start:pos]
        
        field_pattern = r'(\w+):([^\s]*?)$'
        match = re.search(field_pattern, substring)
        
        return match is not None
    
    def _tokenize(self, query: str) -> List[str]:
        """Tokenize query with smart parenthesis detection"""
        tokens = []
        buffer = ''
        paren_depth = 0
        in_field_value = False
        i = 0
        
        while i < len(query):
            char = query[i]
            
            if char == ':' and buffer and buffer[-1].isalnum():
                buffer += char
                in_field_value = True
                i += 1
                continue
            
            if char == ' ' and paren_depth == 0:
                in_field_value = False
            
            if char == '(':
                is_tag_paren = False
                
                if in_field_value or self._is_field_prefix(query, i):
                    is_tag_paren = True
                elif buffer and (buffer[-1].isalnum() or buffer[-1] == '_'):
                    is_tag_paren = True
                
                if is_tag_paren:
                    buffer += char
                else:
                    if buffer.strip() and paren_depth == 0:
                        tokens.append(buffer.strip())
                        buffer = ''
                    paren_depth += 1
                    tokens.append('(')
                
            elif char == ')':
                is_tag_paren = False
                
                if in_field_value or self._is_field_prefix(query, i + 1):
                    is_tag_paren = True
                elif i + 1 < len(query) and (query[i + 1].isalnum() or query[i + 1] == '_'):
                    is_tag_paren = True
                elif paren_depth == 0:
                    is_tag_paren = True
                
                if is_tag_paren:
                    buffer += char
                else:
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
    
    def _parse_query(self, query: str) -> FilterNode:
        """Parse query string into AST"""
        tokens = self._tokenize(query)
        ast, _ = self._parse_tokens(tokens, 0, 0)
        return ast
    
    def _parse_tokens(self, tokens: List[str], start_idx: int = 0, depth: int = 0) -> Tuple[FilterNode, int]:
        """Parse tokens into AST"""
        and_group = []
        i = start_idx
        
        while i < len(tokens):
            token = tokens[i]
            
            if token == '(':
                node, new_idx = self._parse_tokens(tokens, i + 1, depth + 1)
                and_group.append(node)
                i = new_idx
            elif token == ')':
                i += 1
                break
            elif token == '|':
                i += 1
            else:
                filter_node = self._parse_filter_token(token)
                
                if i + 1 < len(tokens) and tokens[i + 1] == '|':
                    or_group = [filter_node]
                    i += 1
                    
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
        
        if len(and_group) == 0:
            result = FilterNode(type='AND')
        elif len(and_group) == 1:
            result = and_group[0]
        else:
            result = FilterNode(type='AND', children=and_group)
        
        return result, i
    
    def _parse_size_value(self, value_str: str) -> int:
        """Parse size value with units into bytes"""
        match = re.match(r'^([\d.]+)\s*([a-zA-Z]*)$', value_str.strip())
        if not match:
            # Try just number
            try:
                return int(float(value_str))
            except ValueError:
                raise ValueError(f"Invalid size format: {value_str}")
        
        number_str, unit_str = match.groups()
        try:
            number = float(number_str)
        except ValueError:
            raise ValueError(f"Invalid number in size: {number_str}")
        
        unit = unit_str.lower() if unit_str else 'b'
        
        multiplier = self.SIZE_UNITS.get(unit)
        if multiplier is None:
            raise ValueError(f"Unknown size unit: {unit_str}")
        
        return int(number * multiplier)
    
    def _parse_flexible_operator(self, value: str) -> Tuple[str, str]:
        """
        Parse operator from value with flexible placement
        
        Examples:
        - >=5kb → ('>=', '5kb')
        - 5kb< → ('<', '5kb')
        - 5kb → ('=', '5kb')
        - 5000=> → ('=>', '5000')
        """
        # Try operator at start
        op_match = re.match(r'^([<>]=?|=)(.+)$', value)
        if op_match:
            return op_match.group(1), op_match.group(2)
        
        # Try operator at end
        op_match = re.match(r'^(.+?)([<>]=?|=)$', value)
        if op_match:
            num_part = op_match.group(1)
            op = op_match.group(2)
            # Reverse operator if at end
            if op == '>':
                op = '<'
            elif op == '<':
                op = '>'
            elif op == '>=':
                op = '<='
            elif op == '<=':
                op = '>='
            return op, num_part
        
        # No operator found, default to =
        return '=', value
    
    def _parse_filter_token(self, token: str) -> FilterNode:
        """Parse a single filter token"""
        is_negated = False
        core = token
        for prefix in self.exclusion_prefixes:
            if token.startswith(prefix):
                is_negated = True
                core = token[len(prefix):]
                break
        
        colon_match = re.match(r'^([a-zA-Z_-]+):(.+)$', core)
        
        if not colon_match:
            return FilterNode(
                type='FILTER',
                key='tag',
                value=core,
                operator='=',
                is_negated=is_negated
            )
        
        field = colon_match.group(1).lower()
        value = colon_match.group(2)
        
        field = self.FIELD_ALIASES.get(field, field)
        
        # Handle file_type - add dot if missing
        if field == 'file_type':
            if not value.startswith('.') and not value.startswith('('):
                value = '.' + value
        
        # Special handling for different field types
        if field == 'file_size':
            operator, num_part = self._parse_flexible_operator(value)
            size_bytes = self._parse_size_value(num_part)
            return FilterNode(
                type='FILTER',
                key='file_size',
                value=size_bytes,
                operator=operator,
                is_negated=is_negated
            )
        elif field == 'duration':
            operator, num_part = self._parse_flexible_operator(value)
            try:
                duration = float(num_part)
            except ValueError:
                raise ValueError(f"Invalid duration: {num_part}")
            return FilterNode(
                type='FILTER',
                key='duration',
                value=duration,
                operator=operator,
                is_negated=is_negated
            )
        elif field == 'aspect_ratio':
            operator, num_part = self._parse_flexible_operator(value)
            try:
                ratio = float(num_part)
            except ValueError:
                raise ValueError(f"Invalid aspect ratio: {num_part}")
            return FilterNode(
                type='FILTER',
                key='aspect_ratio',
                value=ratio,
                operator=operator,
                is_negated=is_negated
            )
        elif field in self.DATE_FIELDS:
            return self._parse_date_filter(field, value, is_negated)
        elif field in self.NUMERIC_FIELDS:
            operator, num_part = self._parse_flexible_operator(value)
            
            if '*' in num_part:
                return FilterNode(
                    type='FILTER',
                    key=field,
                    value=num_part,
                    operator='pattern',
                    is_negated=is_negated
                )
            
            try:
                num_value = int(num_part)
            except ValueError:
                raise ValueError(f"Invalid number in {field}: {num_part}")
            
            return FilterNode(
                type='FILTER',
                key=field,
                value=num_value,
                operator=operator,
                is_negated=is_negated
            )
        
        # Text field
        return FilterNode(
            type='FILTER',
            key=field,
            value=value,
            operator='=',
            is_negated=is_negated
        )
    
    def _parse_date_filter(self, field: str, value: str, is_negated: bool) -> FilterNode:
        """Parse date filter - supports various formats including Unix timestamp"""
        operator, date_part = self._parse_flexible_operator(value)
        
        # Check if it's a Unix timestamp (all digits)
        if date_part.isdigit():
            try:
                timestamp = int(date_part)
                parsed_date = datetime.fromtimestamp(timestamp)
                iso_datetime = parsed_date.strftime('%Y-%m-%d %H:%M:%S')
                
                return FilterNode(
                    type='FILTER',
                    key=field,
                    value=iso_datetime,
                    operator=operator,
                    is_negated=is_negated
                )
            except (ValueError, OSError):
                raise ValueError(f"Invalid Unix timestamp: {date_part}")
        
        # Try datetime formats (with time)
        datetime_formats = [
            '%Y-%m-%d %H:%M:%S',
            '%Y-%m-%d %H:%M',
            '%Y/%m/%d %H:%M:%S',
            '%Y/%m/%d %H:%M',
            '%m-%d-%Y %H:%M:%S',
            '%m-%d-%Y %H:%M',
            '%d-%m-%Y %H:%M:%S',
            '%d-%m-%Y %H:%M',
        ]
        
        parsed_date = None
        has_time = False
        
        for fmt in datetime_formats:
            try:
                parsed_date = datetime.strptime(date_part, fmt)
                has_time = True
                break
            except ValueError:
                continue
        
        # Try date-only formats
        if not parsed_date:
            date_formats = [
                '%Y-%m-%d',
                '%Y/%m/%d',
                '%m-%d-%Y',
                '%m/%d/%Y',
                '%d-%m-%Y',
                '%d/%m/%Y',
                '%Y%m%d'
            ]
            
            for fmt in date_formats:
                try:
                    parsed_date = datetime.strptime(date_part, fmt)
                    break
                except ValueError:
                    continue
        
        if not parsed_date:
            raise ValueError(f"Invalid date format: {date_part}")
        
        # Format based on whether time was provided
        if has_time:
            iso_date = parsed_date.strftime('%Y-%m-%d %H:%M:%S')
        else:
            iso_date = parsed_date.strftime('%Y-%m-%d')
        
        return FilterNode(
            type='FILTER',
            key=field,
            value=iso_date,
            operator=operator,
            is_negated=is_negated
        )
    
    def _ast_to_sql(self, node: FilterNode) -> Tuple[str, List[Any]]:
        """Convert AST to SQL WHERE clause"""
        if node.type == 'FILTER':
            sql, params = self._filter_to_sql(node)
        elif node.type == 'AND':
            sql, params = self._and_to_sql(node)
        elif node.type == 'OR':
            sql, params = self._or_to_sql(node)
        else:
            sql, params = "1=1", []
        
        return sql, params
    
    def _filter_to_sql(self, node: FilterNode) -> Tuple[str, List[Any]]:
        """Convert single filter to SQL"""
        key = node.key
        value = node.value
        operator = node.operator
        is_negated = node.is_negated
        
        # Tag search
        if key == 'tag':
            if '*' in value:
                pattern = value.replace('*', '%')
                search_pattern = f'%"{pattern}"%'
                sql = "tags NOT LIKE ?" if is_negated else "tags LIKE ?"
                return sql, [search_pattern]
            else:
                search_pattern = f'%"{value}"%'
                sql = "tags NOT LIKE ?" if is_negated else "tags LIKE ?"
                return sql, [search_pattern]
        
        # Tag count
        if key == 'tag_count':
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
                
                return f"(length(tags) - length(replace(tags, ',', '')) + 1) {sql_op} ?", [value]
        
        # Aspect ratio (computed from width/height)
        if key == 'aspect_ratio':
            sql_op = operator
            if is_negated:
                op_inverse = {'=': '!=', '>': '<=', '>=': '<', '<': '>=', '<=': '>'}
                sql_op = op_inverse.get(operator, '!=')
            
            # Calculate aspect ratio as width/height
            return f"(CAST(width AS REAL) / CAST(height AS REAL)) {sql_op} ?", [value]
        
        # Matching tags (placeholder - handled in app layer)
        if key == 'matching_tags':
            logger.warning("matching_tags filter requires application-layer filtering")
            return "1=1", []
        
        # Date fields
        if key in self.DATE_FIELDS:
            sql_op = operator
            if is_negated:
                op_inverse = {'=': '!=', '>': '<=', '>=': '<', '<': '>=', '<=': '>'}
                sql_op = op_inverse.get(operator, '!=')
            
            # Date comparison
            return f"DATE({key}) {sql_op} DATE(?)", [value]
        
        # File size, duration
        if key in ['file_size', 'duration']:
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
                
                if key == 'duration':
                    return f"({key} IS NOT NULL AND {key} {sql_op} ?)", [value]
                else:
                    return f"{key} {sql_op} ?", [value]
        
        # Other numeric fields
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