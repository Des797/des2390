"""Business logic layer between routes and data"""
import logging
from typing import Dict, List, Any, Optional
from exceptions import PostNotFoundError, ValidationError, StorageError
from validators import (
    validate_post_id, validate_tags, validate_page_number, 
    validate_limit, validate_filter_type, validate_date_folder
)
from utils import get_date_folder

logger = logging.getLogger(__name__)


class PostService:
    """Service for post-related operations"""
    
    def __init__(self, file_manager, database):
        self.file_manager = file_manager
        self.database = database
        self._cache_initialized = False  # Track initialization state
    
    def _ensure_cache_initialized(self):
        """Ensure cache is initialized - runs ONCE per app lifecycle"""
        if not self._cache_initialized:
            if self.database.is_cache_empty():
                logger.info("Cache is empty, performing initial population...")
                self.database.rebuild_cache_from_files(self.file_manager)
            self._cache_initialized = True
    
    def get_posts(self, filter_type: str = 'all') -> List[Dict[str, Any]]:
        """
        Get posts - uses cache for speed!
        Cache initialization happens once per app lifecycle
        """
        filter_type = validate_filter_type(filter_type)
        
        # Ensure cache is ready (only runs once)
        self._ensure_cache_initialized()
        
        # Get from cache (FAST!)
        status = None if filter_type == 'all' else filter_type
        posts = self.database.get_cached_posts(
            status=status,
            limit=100000,
            sort_by='timestamp',
            order='DESC'
        )
        
        logger.info(f"Retrieved {len(posts)} posts from cache")
        return posts
    
    def get_posts_cached(self, status=None, limit=100000, sort_by='timestamp', order='DESC'):
        """
        Direct cache access for streaming endpoint
        Assumes cache is already initialized
        """
        self._ensure_cache_initialized()
        
        return self.database.get_cached_posts(
            status=status,
            limit=limit,
            sort_by=sort_by,
            order=order
        )
    
    def save_post(self, post_id: int) -> bool:
        """Save a pending post to archive - WITH INCREMENTAL CACHE UPDATE"""
        post_id = validate_post_id(post_id)
        
        # Load post data BEFORE moving
        post_data = self.file_manager.load_post_json(post_id, self.file_manager.temp_path)
        if not post_data:
            raise StorageError(f"Post {post_id} not found")
        
        # Move the files
        success = self.file_manager.save_post_to_archive(post_id)
        
        if success:
            # Update database status tracking
            self.database.set_post_status(post_id, "saved")
            
            # INCREMENTAL CACHE UPDATE (instant!)
            from datetime import datetime
            date_folder = datetime.now().strftime("%m.%d.%Y")
            self.database.update_post_status(post_id, 'saved', date_folder)
            
            logger.info(f"Post {post_id} saved and cache updated")
        else:
            logger.error(f"Failed to save post {post_id}")
            raise StorageError(f"Failed to save post {post_id}")
        
        return success
    
    def discard_post(self, post_id: int) -> bool:
        """Discard a pending post - WITH INCREMENTAL CACHE UPDATE"""
        post_id = validate_post_id(post_id)
        
        # Get post data before discarding to update tag counts
        post_data = self.file_manager.load_post_json(post_id, self.file_manager.temp_path)
        
        # Delete the files
        success = self.file_manager.discard_post(post_id)
        
        if success:
            # Update database status
            self.database.set_post_status(post_id, "discarded")
            
            # REMOVE FROM CACHE (instant!)
            self.database.remove_from_cache(post_id)
            
            # Update tag counts
            if post_data and 'tags' in post_data:
                self.database.update_tag_counts(post_data['tags'], increment=False)
            
            logger.info(f"Post {post_id} discarded and removed from cache")
        else:
            logger.error(f"Failed to discard post {post_id}")
            raise StorageError(f"Failed to discard post {post_id}")
        
        return success
    
    def delete_saved_post(self, post_id: int, date_folder: str) -> bool:
        """Delete a saved post - WITH INCREMENTAL CACHE UPDATE"""
        post_id = validate_post_id(post_id)
        date_folder = validate_date_folder(date_folder)
        
        # Get post data before deleting
        import os
        folder_path = os.path.join(self.file_manager.save_path, date_folder)
        post_data = self.file_manager.load_post_json(post_id, folder_path)
        
        # Delete the files
        success = self.file_manager.delete_saved_post(post_id, date_folder)
        
        if success:
            # REMOVE FROM CACHE (instant!)
            self.database.remove_from_cache(post_id)
            
            # Update tag counts
            if post_data and 'tags' in post_data:
                self.database.update_tag_counts(post_data['tags'], increment=False)
            
            logger.info(f"Saved post {post_id} deleted and removed from cache")
        else:
            logger.error(f"Failed to delete saved post {post_id}")
            raise StorageError(f"Failed to delete saved post {post_id}")
        
        return success
    
    def get_post_size(self, post_id: int) -> int:
        """Get file size for a post"""
        post_id = validate_post_id(post_id)
        return self.file_manager.get_file_size(post_id)


class ConfigService:
    """Service for configuration operations"""
    
    def __init__(self, database, api_client, file_manager):
        self.database = database
        self.api_client = api_client
        self.file_manager = file_manager
    
    def get_config(self) -> Dict[str, Any]:
        """Get current configuration"""
        import json
        return {
            "api_user_id": self.database.load_config("api_user_id", ""),
            "api_key": self.database.load_config("api_key", ""),
            "temp_path": self.database.load_config("temp_path", ""),
            "save_path": self.database.load_config("save_path", ""),
            "blacklist": json.loads(self.database.load_config("blacklist", "[]"))
        }
    
    def save_config(self, config: Dict[str, Any]) -> bool:
        """Save configuration"""
        import json
        
        # Save API credentials
        if "api_user_id" in config:
            self.database.save_config("api_user_id", config["api_user_id"])
        if "api_key" in config:
            self.database.save_config("api_key", config["api_key"])
        
        # Save paths
        if "temp_path" in config:
            self.database.save_config("temp_path", config["temp_path"])
        if "save_path" in config:
            self.database.save_config("save_path", config["save_path"])
        
        # Save blacklist
        if "blacklist" in config:
            self.database.save_config("blacklist", json.dumps(config["blacklist"]))
        
        # Update modules with new config
        self.api_client.update_credentials(
            config.get("api_user_id", self.api_client.user_id),
            config.get("api_key", self.api_client.api_key)
        )
        self.file_manager.update_paths(
            config.get("temp_path", self.file_manager.temp_path),
            config.get("save_path", self.file_manager.save_path)
        )
        
        logger.info("Configuration saved successfully")
        return True


class TagService:
    """Service for tag-related operations"""
    
    def __init__(self, database):
        self.database = database
    
    def get_tag_counts(self) -> Dict[str, int]:
        """Get all tag counts"""
        return self.database.get_all_tag_counts()
    
    def rebuild_tag_counts(self, temp_path: str, save_path: str) -> bool:
        """Rebuild tag counts from all posts"""
        try:
            self.database.rebuild_tag_counts(temp_path, save_path)
            logger.info("Tag counts rebuilt successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to rebuild tag counts: {e}")
            return False
    
    def get_tag_history(self, page: int = 1, limit: int = 50) -> Dict[str, Any]:
        """Get tag edit history with pagination"""
        page = validate_page_number(page)
        limit = validate_limit(limit, max_limit=200)
        
        return self.database.get_tag_history(limit, page)


class SearchService:
    """Service for search-related operations"""
    
    def __init__(self, database):
        self.database = database
    
    def get_search_history(self, limit: int = 10) -> List[Dict[str, str]]:
        """Get recent search history"""
        limit = validate_limit(limit, max_limit=100)
        return self.database.get_search_history(limit)
    
    def add_search_history(self, tags: str) -> bool:
        """Add search to history"""
        tags = validate_tags(tags)
        if tags:
            self.database.add_search_history(tags)
            return True
        return False


class ScraperService:
    """Service for scraper operations"""
    
    def __init__(self, scraper, database):
        self.scraper = scraper
        self.database = database
    
    def start_scraper(self, tags: str = "") -> bool:
        """Start the scraper"""
        tags = validate_tags(tags) if tags else ""
        return self.scraper.start(tags)
    
    def stop_scraper(self) -> bool:
        """Stop the scraper"""
        self.scraper.stop()
        return True
    
    def get_status(self) -> Dict[str, Any]:
        """Get scraper status"""
        return self.scraper.get_state()


class AutocompleteService:
    """Service for tag autocomplete"""
    
    def __init__(self, api_client):
        self.api_client = api_client
    
    def get_suggestions(self, query: str) -> List[str]:
        """Get autocomplete suggestions"""
        if not query or len(query) < 2:
            return []
        
        # Sanitize query
        query = query.strip()[:50]  # Limit length
        
        return self.api_client.get_autocomplete_tags(query)