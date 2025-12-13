"""
Business logic layer for Rule34 Scraper
Handles complex operations and coordinates between modules
"""
import logging
from typing import List, Dict, Any, Optional
from exceptions import (
    ValidationError,
    ConfigurationError,
    StorageError,
    InsufficientStorageError,
    ScraperAlreadyRunningError
)
from validators import (
    validate_post_id,
    validate_tags_list,
    validate_path,
    validate_filter_type,
    validate_blacklist
)
import utils

logger = logging.getLogger(__name__)


class ConfigService:
    """Service for managing application configuration"""
    
    def __init__(self, database):
        self.db = database
    
    def get_config(self) -> Dict[str, Any]:
        """Get complete configuration"""
        return {
            "api_user_id": self.db.load_config("api_user_id", ""),
            "api_key": self.db.load_config("api_key", ""),
            "temp_path": self.db.load_config("temp_path", ""),
            "save_path": self.db.load_config("save_path", ""),
            "blacklist": utils.safe_json_loads(self.db.load_config("blacklist", "[]"), [])
        }
    
    def update_config(self, config: Dict[str, Any], api_client, file_manager) -> bool:
        """
        Update configuration and apply to modules
        
        Args:
            config: Configuration dictionary
            api_client: API client instance
            file_manager: File manager instance
            
        Returns:
            True if successful
        """
        try:
            # Validate paths if provided
            if "temp_path" in config and config["temp_path"]:
                validate_path(config["temp_path"])
                self.db.save_config("temp_path", config["temp_path"])
            
            if "save_path" in config and config["save_path"]:
                validate_path(config["save_path"])
                self.db.save_config("save_path", config["save_path"])
            
            # Validate and save API credentials
            if "api_user_id" in config:
                self.db.save_config("api_user_id", config["api_user_id"])
            
            if "api_key" in config:
                self.db.save_config("api_key", config["api_key"])
            
            # Validate and save blacklist
            if "blacklist" in config:
                validated_blacklist = validate_blacklist(config["blacklist"])
                import json
                self.db.save_config("blacklist", json.dumps(validated_blacklist))
            
            # Update modules
            api_client.update_credentials(
                config.get("api_user_id", api_client.user_id),
                config.get("api_key", api_client.api_key)
            )
            
            file_manager.update_paths(
                config.get("temp_path", file_manager.temp_path),
                config.get("save_path", file_manager.save_path)
            )
            
            logger.info("Configuration updated successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to update configuration: {e}")
            raise ConfigurationError(f"Configuration update failed: {e}")


class PostService:
    """Service for managing posts"""
    
    def __init__(self, database, file_manager, scraper):
        self.db = database
        self.file_manager = file_manager
        self.scraper = scraper
    
    def get_posts(self, filter_type: str = 'all') -> List[Dict[str, Any]]:
        """
        Get posts with filtering
        
        Args:
            filter_type: Type of filter ('all', 'pending', 'saved')
            
        Returns:
            List of post dictionaries
        """
        filter_type = validate_filter_type(filter_type)
        
        if filter_type == 'pending':
            return self.file_manager.get_pending_posts()
        elif filter_type == 'saved':
            return self.file_manager.get_saved_posts()
        else:
            return self.file_manager.get_all_posts()
    
    def save_post(self, post_id: int) -> bool:
        """
        Save a post from pending to archive
        
        Args:
            post_id: Post ID to save
            
        Returns:
            True if successful
        """
        post_id = validate_post_id(post_id)
        
        if self.file_manager.save_post_to_archive(post_id):
            self.db.set_post_status(post_id, "saved")
            
            # Update scraper stats
            with self.scraper.lock:
                self.scraper.state["total_saved"] += 1
            
            logger.info(f"Post {post_id} saved successfully")
            return True
        else:
            logger.error(f"Failed to save post {post_id}")
            return False
    
    def discard_post(self, post_id: int) -> bool:
        """
        Discard a pending post
        
        Args:
            post_id: Post ID to discard
            
        Returns:
            True if successful
        """
        post_id = validate_post_id(post_id)
        
        # Get post data before discarding to update tag counts
        post_data = self.file_manager.load_post_json(post_id, self.file_manager.temp_path)
        
        if self.file_manager.discard_post(post_id):
            self.db.set_post_status(post_id, "discarded")
            
            # Update tag counts
            if post_data and 'tags' in post_data:
                self.db.update_tag_counts(post_data['tags'], increment=False)
            
            # Update scraper stats
            with self.scraper.lock:
                self.scraper.state["total_discarded"] += 1
            
            logger.info(f"Post {post_id} discarded successfully")
            return True
        else:
            logger.error(f"Failed to discard post {post_id}")
            return False
    
    def delete_saved_post(self, post_id: int, date_folder: str) -> bool:
        """
        Delete a saved post
        
        Args:
            post_id: Post ID to delete
            date_folder: Date folder containing the post
            
        Returns:
            True if successful
        """
        post_id = validate_post_id(post_id)
        
        import os
        folder_path = os.path.join(self.file_manager.save_path, date_folder)
        post_data = self.file_manager.load_post_json(post_id, folder_path)
        
        if self.file_manager.delete_saved_post(post_id, date_folder):
            # Update tag counts
            if post_data and 'tags' in post_data:
                self.db.update_tag_counts(post_data['tags'], increment=False)
            
            logger.info(f"Saved post {post_id} deleted successfully")
            return True
        else:
            logger.error(f"Failed to delete saved post {post_id}")
            return False
    
    def get_post_size(self, post_id: int) -> int:
        """
        Get file size for a post
        
        Args:
            post_id: Post ID
            
        Returns:
            File size in bytes
        """
        post_id = validate_post_id(post_id)
        return self.file_manager.get_file_size(post_id)


class ScraperService:
    """Service for managing scraper operations"""
    
    def __init__(self, scraper, database, file_manager):
        self.scraper = scraper
        self.db = database
        self.file_manager = file_manager
    
    def start_scraper(self, tags: str = "") -> bool:
        """
        Start the scraper
        
        Args:
            tags: Tags to search for
            
        Returns:
            True if started successfully
            
        Raises:
            ScraperAlreadyRunningError: If scraper is already running
            ConfigurationError: If configuration is invalid
        """
        if self.scraper.state["active"]:
            raise ScraperAlreadyRunningError("Scraper is already running")
        
        # Validate configuration
        if not self.file_manager.temp_path or not self.file_manager.save_path:
            raise ConfigurationError("Temp path and save path must be configured")
        
        # Check storage
        free_space = utils.get_free_space_gb(self.file_manager.temp_path)
        if free_space is not None and free_space < 5.0:
            raise InsufficientStorageError(f"Insufficient storage space: {free_space:.2f} GB available")
        
        # Start scraper
        if self.scraper.start(tags):
            logger.info(f"Scraper started with tags: '{tags}'")
            return True
        else:
            logger.error("Failed to start scraper")
            return False
    
    def stop_scraper(self) -> bool:
        """
        Stop the scraper
        
        Returns:
            True if stopped successfully
        """
        self.scraper.stop()
        logger.info("Scraper stopped")
        return True
    
    def get_status(self) -> Dict[str, Any]:
        """
        Get scraper status
        
        Returns:
            Status dictionary
        """
        return self.scraper.get_state()


class TagService:
    """Service for managing tags"""
    
    def __init__(self, database, file_manager):
        self.db = database
        self.file_manager = file_manager
    
    def get_tag_counts(self) -> Dict[str, int]:
        """Get all tag counts"""
        return self.db.get_all_tag_counts()
    
    def rebuild_tag_counts(self) -> Dict[str, int]:
        """
        Rebuild tag counts from all posts
        
        Returns:
            Updated tag counts
        """
        logger.info("Rebuilding tag counts...")
        self.db.rebuild_tag_counts(
            self.file_manager.temp_path,
            self.file_manager.save_path
        )
        logger.info("Tag counts rebuilt successfully")
        return self.db.get_all_tag_counts()
    
    def get_tag_history(self, page: int = 1, limit: int = 50) -> Dict[str, Any]:
        """
        Get tag edit history
        
        Args:
            page: Page number
            limit: Items per page
            
        Returns:
            Dictionary with items and total count
        """
        return self.db.get_tag_history(limit, page)
    
    def add_tag_history(self, post_id: int, old_tags: List[str], new_tags: List[str]):
        """
        Add tag edit to history
        
        Args:
            post_id: Post ID
            old_tags: Previous tags
            new_tags: New tags
        """
        post_id = validate_post_id(post_id)
        old_tags = validate_tags_list(old_tags)
        new_tags = validate_tags_list(new_tags)
        
        self.db.add_tag_history(post_id, old_tags, new_tags)
        logger.info(f"Tag history recorded for post {post_id}")


class SearchService:
    """Service for search operations"""
    
    def __init__(self, database):
        self.db = database
    
    def get_search_history(self, limit: int = 10) -> List[Dict[str, str]]:
        """
        Get recent search history
        
        Args:
            limit: Number of items to return
            
        Returns:
            List of search history items
        """
        return self.db.get_search_history(limit)
    
    def add_search_history(self, tags: str):
        """
        Add search to history
        
        Args:
            tags: Search tags
        """
        if tags and tags.strip():
            self.db.add_search_history(tags.strip())