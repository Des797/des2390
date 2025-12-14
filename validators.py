"""Input validation functions"""
import os
import re
from typing import Optional, List
from exceptions import ValidationError


def validate_post_id(post_id: any) -> int:
    """Validate post ID is a positive integer"""
    try:
        post_id = int(post_id)
        if post_id <= 0:
            raise ValidationError(f"Post ID must be positive, got {post_id}")
        return post_id
    except (ValueError, TypeError):
        raise ValidationError(f"Invalid post ID: {post_id}")


def validate_tags(tags: str) -> str:
    """Validate and sanitize tags string"""
    if not isinstance(tags, str):
        raise ValidationError("Tags must be a string")
    
    # Remove excessive whitespace
    tags = " ".join(tags.split())
    
    # Check for length
    if len(tags) > 1000:
        raise ValidationError("Tags string too long (max 1000 characters)")
    
    return tags


def validate_path(path: str, must_exist: bool = False) -> str:
    """Validate file system path"""
    if not isinstance(path, str):
        raise ValidationError("Path must be a string")
    
    if not path.strip():
        raise ValidationError("Path cannot be empty")
    
    # Check for invalid characters (Windows)
    invalid_chars = '<>"|?*'
    if any(char in path for char in invalid_chars):
        raise ValidationError(f"Path contains invalid characters: {invalid_chars}")
    
    if must_exist and not os.path.exists(path):
        raise ValidationError(f"Path does not exist: {path}")
    
    return path


def validate_date_folder(date_folder: str) -> str:
    """Validate date folder format (MM.DD.YYYY)"""
    if not isinstance(date_folder, str):
        raise ValidationError("Date folder must be a string")
    
    pattern = r'^\d{2}\.\d{2}\.\d{4}$'
    if not re.match(pattern, date_folder):
        raise ValidationError(f"Invalid date folder format: {date_folder}. Expected MM.DD.YYYY")
    
    return date_folder


def validate_page_number(page: any) -> int:
    """Validate page number"""
    try:
        page = int(page)
        if page < 1:
            raise ValidationError(f"Page number must be at least 1, got {page}")
        return page
    except (ValueError, TypeError):
        raise ValidationError(f"Invalid page number: {page}")


def validate_limit(limit: any, max_limit: int = 1000) -> int:
    """Validate pagination limit"""
    try:
        limit = int(limit)
        if limit < 1:
            raise ValidationError(f"Limit must be at least 1, got {limit}")
        if limit > max_limit:
            raise ValidationError(f"Limit exceeds maximum of {max_limit}, got {limit}")
        return limit
    except (ValueError, TypeError):
        raise ValidationError(f"Invalid limit: {limit}")


def validate_blacklist(blacklist: List[str]) -> List[str]:
    """Validate blacklist tags"""
    if not isinstance(blacklist, list):
        raise ValidationError("Blacklist must be a list")
    
    validated = []
    for tag in blacklist:
        if not isinstance(tag, str):
            raise ValidationError(f"Blacklist tag must be a string, got {type(tag)}")
        
        tag = tag.strip()
        if tag:
            # Check for reasonable length
            if len(tag) > 100:
                raise ValidationError(f"Blacklist tag too long (max 100 chars): {tag}")
            validated.append(tag)
    
    return validated


def validate_filter_type(filter_type: str) -> str:
    """Validate filter type"""
    valid_filters = ['all', 'pending', 'saved']
    
    if filter_type not in valid_filters:
        raise ValidationError(f"Invalid filter type: {filter_type}. Must be one of {valid_filters}")
    
    return filter_type


def validate_api_credentials(user_id: Optional[str], api_key: Optional[str]) -> tuple:
    """Validate API credentials"""
    if user_id is not None and not isinstance(user_id, str):
        raise ValidationError("User ID must be a string")
    
    if api_key is not None and not isinstance(api_key, str):
        raise ValidationError("API key must be a string")
    
    # Allow empty strings for optional credentials
    return (user_id, api_key)


def validate_username(username: str) -> str:
    """Validate username for authentication"""
    if not isinstance(username, str):
        raise ValidationError("Username must be a string")
    
    username = username.strip()
    
    if not username:
        raise ValidationError("Username cannot be empty")
    
    if len(username) > 50:
        raise ValidationError("Username too long (max 50 characters)")
    
    # Check for valid characters (alphanumeric, underscore, hyphen)
    if not re.match(r'^[a-zA-Z0-9_-]+$', username):
        raise ValidationError("Username can only contain letters, numbers, underscores, and hyphens")
    
    return username


def validate_password(password: str) -> str:
    """Validate password for authentication"""
    if not isinstance(password, str):
        raise ValidationError("Password must be a string")
    
    if not password:
        raise ValidationError("Password cannot be empty")
    
    if len(password) < 3:
        raise ValidationError("Password too short (minimum 3 characters)")
    
    if len(password) > 100:
        raise ValidationError("Password too long (max 100 characters)")
    
    return password


def sanitize_filename(filename: str) -> str:
    """Sanitize filename by removing invalid characters"""
    # Remove or replace invalid characters
    invalid_chars = '<>:"|?*\\/\0'
    for char in invalid_chars:
        filename = filename.replace(char, '_')
    
    # Remove leading/trailing spaces and dots
    filename = filename.strip('. ')
    
    # Ensure not empty
    if not filename:
        filename = 'unnamed'
    
    return filename