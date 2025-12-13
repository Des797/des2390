"""
Utility functions for Rule34 Scraper backend
Shared helper functions used across modules
"""
import os
import shutil
import hashlib
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


def ensure_directory(path: str) -> bool:
    """
    Ensure a directory exists, create if it doesn't
    
    Args:
        path: Directory path to ensure
        
    Returns:
        True if successful, False otherwise
    """
    try:
        os.makedirs(path, exist_ok=True)
        return True
    except Exception as e:
        logger.error(f"Failed to create directory {path}: {e}")
        return False


def get_free_space_gb(path: str) -> Optional[float]:
    """
    Get free space in GB for a given path
    
    Args:
        path: Path to check
        
    Returns:
        Free space in GB or None if error
    """
    try:
        if not path or not os.path.exists(path):
            return None
        
        total, used, free = shutil.disk_usage(path)
        return free / (1024**3)
    except Exception as e:
        logger.error(f"Failed to get free space for {path}: {e}")
        return None


def calculate_file_hash(filepath: str, algorithm: str = 'md5') -> Optional[str]:
    """
    Calculate hash of a file
    
    Args:
        filepath: Path to file
        algorithm: Hash algorithm (md5, sha1, sha256)
        
    Returns:
        Hex digest of hash or None if error
    """
    try:
        hash_func = hashlib.new(algorithm)
        with open(filepath, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                hash_func.update(chunk)
        return hash_func.hexdigest()
    except Exception as e:
        logger.error(f"Failed to calculate hash for {filepath}: {e}")
        return None


def get_file_size(filepath: str) -> int:
    """
    Get file size in bytes
    
    Args:
        filepath: Path to file
        
    Returns:
        File size in bytes, 0 if error
    """
    try:
        return os.path.getsize(filepath)
    except Exception as e:
        logger.error(f"Failed to get file size for {filepath}: {e}")
        return 0


def format_bytes(bytes_size: int) -> str:
    """
    Format bytes to human readable string
    
    Args:
        bytes_size: Size in bytes
        
    Returns:
        Formatted string (e.g., "1.23 MB")
    """
    if bytes_size == 0:
        return "0 B"
    
    units = ['B', 'KB', 'MB', 'GB', 'TB']
    i = 0
    size = float(bytes_size)
    
    while size >= 1024.0 and i < len(units) - 1:
        size /= 1024.0
        i += 1
    
    return f"{size:.2f} {units[i]}"


def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename by removing invalid characters
    
    Args:
        filename: Original filename
        
    Returns:
        Sanitized filename
    """
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        filename = filename.replace(char, '_')
    return filename


def get_date_folder(date: Optional[datetime] = None) -> str:
    """
    Get date folder name in format MM.DD.YYYY
    
    Args:
        date: Date to format, defaults to today
        
    Returns:
        Formatted date string
    """
    if date is None:
        date = datetime.now()
    return date.strftime("%m.%d.%Y")


def parse_tags(tags_string: str) -> List[str]:
    """
    Parse tags from space-separated string
    
    Args:
        tags_string: Space-separated tags
        
    Returns:
        List of tag strings
    """
    return [tag.strip() for tag in tags_string.split() if tag.strip()]


def tags_match_blacklist(tags: List[str], blacklist: List[str]) -> bool:
    """
    Check if any tags match blacklist patterns
    
    Args:
        tags: List of tags to check
        blacklist: List of blacklist patterns (supports wildcards)
        
    Returns:
        True if any tag matches blacklist
    """
    import re
    
    for blacklist_item in blacklist:
        # Convert wildcard pattern to regex
        pattern = blacklist_item.replace('*', '.*')
        regex = re.compile(f'^{pattern}$', re.IGNORECASE)
        
        for tag in tags:
            if regex.match(tag):
                return True
    
    return False


def merge_dicts(*dicts: Dict[Any, Any]) -> Dict[Any, Any]:
    """
    Merge multiple dictionaries
    
    Args:
        *dicts: Variable number of dictionaries
        
    Returns:
        Merged dictionary
    """
    result = {}
    for d in dicts:
        result.update(d)
    return result


def safe_json_loads(json_string: str, default: Any = None) -> Any:
    """
    Safely load JSON string with fallback
    
    Args:
        json_string: JSON string to parse
        default: Default value if parsing fails
        
    Returns:
        Parsed JSON or default value
    """
    import json
    
    try:
        return json.loads(json_string)
    except (json.JSONDecodeError, TypeError) as e:
        logger.warning(f"Failed to parse JSON: {e}")
        return default


def truncate_string(s: str, length: int, suffix: str = '...') -> str:
    """
    Truncate string to specified length
    
    Args:
        s: String to truncate
        length: Maximum length
        suffix: Suffix to add if truncated
        
    Returns:
        Truncated string
    """
    if len(s) <= length:
        return s
    return s[:length - len(suffix)] + suffix


def batch_list(items: List[Any], batch_size: int) -> List[List[Any]]:
    """
    Split list into batches
    
    Args:
        items: List to batch
        batch_size: Size of each batch
        
    Returns:
        List of batches
    """
    return [items[i:i + batch_size] for i in range(0, len(items), batch_size)]


def is_valid_url(url: str) -> bool:
    """
    Check if string is a valid URL
    
    Args:
        url: URL to validate
        
    Returns:
        True if valid URL
    """
    import re
    
    pattern = re.compile(
        r'^https?://'  # http:// or https://
        r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|'  # domain
        r'localhost|'  # localhost
        r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'  # IP
        r'(?::\d+)?'  # optional port
        r'(?:/?|[/?]\S+)$', re.IGNORECASE)
    
    return pattern.match(url) is not None


def retry_on_exception(func, max_retries: int = 3, delay: float = 1.0):
    """
    Retry function on exception
    
    Args:
        func: Function to retry
        max_retries: Maximum number of retries
        delay: Delay between retries in seconds
        
    Returns:
        Function result or raises last exception
    """
    import time
    
    last_exception = None
    
    for attempt in range(max_retries):
        try:
            return func()
        except Exception as e:
            last_exception = e
            logger.warning(f"Attempt {attempt + 1}/{max_retries} failed: {e}")
            if attempt < max_retries - 1:
                time.sleep(delay)
    
    raise last_exception