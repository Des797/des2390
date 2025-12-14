"""Shared utility functions"""
import os
import json
import hashlib
from typing import Any, Dict, Optional
from datetime import datetime


def format_bytes(bytes_size: int) -> str:
    """Format bytes to human-readable string"""
    if bytes_size == 0:
        return "0 B"
    
    units = ['B', 'KB', 'MB', 'GB', 'TB']
    k = 1024
    i = 0
    
    while bytes_size >= k and i < len(units) - 1:
        bytes_size /= k
        i += 1
    
    return f"{bytes_size:.2f} {units[i]}"


def format_timestamp(timestamp: Optional[int]) -> str:
    """Format Unix timestamp to readable string"""
    if timestamp is None:
        return "Unknown"
    
    try:
        dt = datetime.fromtimestamp(timestamp)
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except (ValueError, OSError):
        return "Invalid timestamp"


def get_file_hash(filepath: str, algorithm: str = 'md5') -> Optional[str]:
    """Calculate file hash"""
    if not os.path.exists(filepath):
        return None
    
    try:
        hash_obj = hashlib.new(algorithm)
        with open(filepath, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                hash_obj.update(chunk)
        return hash_obj.hexdigest()
    except Exception:
        return None


def safe_json_loads(json_string: str, default: Any = None) -> Any:
    """Safely load JSON string, return default on error"""
    try:
        return json.loads(json_string)
    except (json.JSONDecodeError, TypeError):
        return default


def safe_json_dumps(obj: Any, default: str = "{}") -> str:
    """Safely dump object to JSON string, return default on error"""
    try:
        return json.dumps(obj)
    except (TypeError, ValueError):
        return default


def ensure_dir_exists(path: str) -> bool:
    """Ensure directory exists, create if needed"""
    try:
        os.makedirs(path, exist_ok=True)
        return True
    except OSError:
        return False


def get_file_extension(filename: str) -> str:
    """Get file extension including the dot"""
    _, ext = os.path.splitext(filename)
    return ext.lower()


def is_video_file(filename: str) -> bool:
    """Check if file is a video based on extension"""
    video_extensions = ['.mp4', '.webm', '.avi', '.mov', '.mkv']
    return get_file_extension(filename) in video_extensions


def is_image_file(filename: str) -> bool:
    """Check if file is an image based on extension"""
    image_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
    return get_file_extension(filename) in image_extensions


def merge_dicts(base: Dict, updates: Dict) -> Dict:
    """Merge two dictionaries, updates override base"""
    result = base.copy()
    result.update(updates)
    return result


def truncate_string(text: str, max_length: int = 100, suffix: str = '...') -> str:
    """Truncate string to max length"""
    if len(text) <= max_length:
        return text
    return text[:max_length - len(suffix)] + suffix


def sanitize_tag(tag: str) -> str:
    """Sanitize a tag string"""
    # Remove leading/trailing whitespace
    tag = tag.strip()
    
    # Replace multiple spaces with single space
    tag = ' '.join(tag.split())
    
    # Convert to lowercase for consistency
    tag = tag.lower()
    
    return tag


def parse_tags_string(tags_string: str) -> list:
    """Parse space-separated tags string into list"""
    if not tags_string:
        return []
    
    tags = tags_string.split()
    return [sanitize_tag(tag) for tag in tags if tag.strip()]


def calculate_storage_info(path: str) -> Dict[str, int]:
    """Calculate storage information for a path"""
    try:
        if not os.path.exists(path):
            return {
                'total': 0,
                'used': 0,
                'free': 0,
                'percent_used': 0
            }
        
        stat = os.statvfs(path) if hasattr(os, 'statvfs') else None
        
        if stat:
            total = stat.f_blocks * stat.f_frsize
            free = stat.f_bavail * stat.f_frsize
            used = total - free
        else:
            # Windows fallback
            import shutil
            total, used, free = shutil.disk_usage(path)
        
        percent_used = (used / total * 100) if total > 0 else 0
        
        return {
            'total': total,
            'used': used,
            'free': free,
            'percent_used': round(percent_used, 2)
        }
    except Exception:
        return {
            'total': 0,
            'used': 0,
            'free': 0,
            'percent_used': 0
        }


def count_files_in_directory(path: str, extensions: Optional[list] = None) -> int:
    """Count files in directory, optionally filter by extensions"""
    if not os.path.exists(path) or not os.path.isdir(path):
        return 0
    
    count = 0
    try:
        for filename in os.listdir(path):
            filepath = os.path.join(path, filename)
            if os.path.isfile(filepath):
                if extensions is None:
                    count += 1
                else:
                    if get_file_extension(filename) in extensions:
                        count += 1
    except OSError:
        pass
    
    return count


def get_current_timestamp() -> int:
    """Get current Unix timestamp"""
    return int(datetime.now().timestamp())


def get_date_folder() -> str:
    """Get current date folder name in MM.DD.YYYY format"""
    return datetime.now().strftime("%m.%d.%Y")


def chunks(lst: list, n: int):
    """Yield successive n-sized chunks from list"""
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


def clamp(value: int, min_value: int, max_value: int) -> int:
    """Clamp value between min and max"""
    return max(min_value, min(value, max_value))


def is_valid_url(url: str) -> bool:
    """Basic URL validation"""
    if not url or not isinstance(url, str):
        return False
    
    return url.startswith(('http://', 'https://'))


def extract_post_id_from_url(url: str) -> Optional[int]:
    """Extract post ID from Rule34 URL"""
    import re
    match = re.search(r'id=(\d+)', url)
    if match:
        try:
            return int(match.group(1))
        except ValueError:
            pass
    return None