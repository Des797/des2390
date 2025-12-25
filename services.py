"""Business logic layer - OPTIMIZED with server-side advanced query parsing"""
import logging
import random
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
        self._cache_initialized = False
        self._random_seed = None
    
    def _ensure_cache_initialized(self):
        """Ensure cache is initialized - runs ONCE per app lifecycle"""
        if not self._cache_initialized:
            try:
                if self.database.is_cache_empty():
                    logger.info("Cache is empty, performing initial population...")
                    self.database.rebuild_cache_from_files(self.file_manager)
                else:
                    logger.info("Cache already populated")
                self._cache_initialized = True
            except Exception as e:
                logger.error(f"Failed to initialize cache: {e}", exc_info=True)
                raise
    

    def get_posts(
        self, 
        filter_type: str = 'all', 
        limit: int = 100000, 
        offset: int = 0,
        sort_by: str = 'timestamp',
        order: str = 'DESC',
        search_query: Optional[str] = None,
        random_seed: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Get posts with SERVER-SIDE pagination, sorting, and filtering
        
        Args:
            filter_type: 'all', 'pending', 'saved'
            limit: Number of posts per page
            offset: Starting position
            sort_by: Sort column (timestamp, score, id, owner, etc.) or 'random'
            order: 'ASC' or 'DESC'
            search_query: Text search (searches owner, title, tags)
            random_seed: Seed for random sort (maintains order across pagination)
        
        Returns: {
            'posts': [...],
            'total': count (with filters applied),
            'limit': limit,
            'offset': offset,
            'random_seed': seed used (if random sort)
        }
        """
        filter_type = validate_filter_type(filter_type)
        
        # Ensure cache is ready
        self._ensure_cache_initialized()
        
        # Get total count WITH filters
        status = None if filter_type == 'all' else filter_type
        total = self.database.get_cache_count(status=status, search_query=search_query)
        
        # Handle random sort
        if sort_by == 'random':
            # Generate or reuse seed
            if random_seed is None:
                random_seed = random.randint(0, 2**31 - 1)
            
            # Get ALL matching posts
            all_posts = self.database.get_cached_posts(
                status=status,
                limit=total,  # Get all matching posts
                offset=0,
                sort_by='post_id',  # Stable sort for consistency
                order='ASC',
                search_query=search_query
            )
            
            # Shuffle with seed for consistency
            random.seed(random_seed)
            random.shuffle(all_posts)
            random.seed()  # Reset seed
            
            # Apply pagination to shuffled results
            posts = all_posts[offset:offset + limit]
            
            logger.info(f"Random sort: shuffled {len(all_posts)} posts, returning {len(posts)} (seed={random_seed})")
            
            return {
                'posts': posts,
                'total': total,
                'limit': limit,
                'offset': offset,
                'random_seed': random_seed
            }
        
        # Normal server-side sort
        posts = self.database.get_cached_posts(
            status=status,
            limit=limit,
            offset=offset,
            sort_by=sort_by,
            order=order,
            search_query=search_query
        )
        
        logger.info(f"Retrieved {len(posts)} posts (offset={offset}, total={total}, sort={sort_by} {order})")
        
        return {
            'posts': posts,
            'total': total,
            'limit': limit,
            'offset': offset
        }
    
    def get_total_count(self, filter_type: str = 'all', search_query: Optional[str] = None) -> int:
        """
        Get total count with optional search filter
        """
        try:
            filter_type = validate_filter_type(filter_type)
            self._ensure_cache_initialized()
            
            status = None if filter_type == 'all' else filter_type
            return self.database.get_cache_count(status=status, search_query=search_query)
        except Exception as e:
            logger.error(f"Failed to get total count: {e}", exc_info=True)
            return 0
    
    def save_post(self, post_id: int) -> bool:
        """Save a pending post to archive"""
        post_id = validate_post_id(post_id)
        
        post_data = self.file_manager.load_post_json(post_id, self.file_manager.temp_path)
        if not post_data:
            raise StorageError(f"Post {post_id} not found")
        
        success = self.file_manager.save_post_to_archive(post_id)
        
        if success:
            self.database.set_post_status(post_id, "saved")
            
            from datetime import datetime
            date_folder = datetime.now().strftime("%m.%d.%Y")
            self.database.update_post_status(post_id, 'saved', date_folder)
            
            logger.info(f"Post {post_id} saved and cache updated")
        else:
            logger.error(f"Failed to save post {post_id}")
            raise StorageError(f"Failed to save post {post_id}")
        
        return success
    
    def discard_post(self, post_id: int) -> bool:
        """Discard a pending post"""
        post_id = validate_post_id(post_id)
        
        post_data = self.file_manager.load_post_json(post_id, self.file_manager.temp_path)
        
        success = self.file_manager.discard_post(post_id)
        
        if success:
            self.database.set_post_status(post_id, "discarded")
            self.database.remove_from_cache(post_id)
            
            if post_data and 'tags' in post_data:
                self.database.update_tag_counts(post_data['tags'], increment=False)
            
            logger.info(f"Post {post_id} discarded and removed from cache")
        else:
            logger.error(f"Failed to discard post {post_id}")
            raise StorageError(f"Failed to discard post {post_id}")
        
        return success
    
    def delete_saved_post(self, post_id: int, date_folder: str) -> bool:
        """Delete a saved post"""
        post_id = validate_post_id(post_id)
        date_folder = validate_date_folder(date_folder)
        
        import os
        folder_path = os.path.join(self.file_manager.save_path, date_folder)
        post_data = self.file_manager.load_post_json(post_id, folder_path)
        
        success = self.file_manager.delete_saved_post(post_id, date_folder)
        
        if success:
            self.database.remove_from_cache(post_id)
            
            if post_data and 'tags' in post_data:
                self.database.update_tag_counts(post_data['tags'], increment=False)
            
            logger.info(f"Saved post {post_id} deleted and removed from cache")
        else:
            logger.error(f"Failed to delete saved post {post_id}")
            raise StorageError(f"Failed to delete saved post {post_id}")
        
        return success

    def get_top_tags(self, filter_type: str = 'all', search_query: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Get most common tags in current search results
        
        Args:
            filter_type: Status filter
            search_query: Advanced query string
            limit: Max number of tags to return
        
        Returns:
            List of {tag: str, count: int} sorted by frequency
        """
        try:
            from collections import Counter
            
            self._ensure_cache_initialized()
            
            # Get all matching posts
            status = None if filter_type == 'all' else filter_type
            posts = self.database.get_cached_posts(
                status=status,
                limit=100000,  # Get all matching posts
                offset=0,
                search_query=search_query
            )
            
            # Count tag frequencies
            tag_counter = Counter()
            for post in posts:
                for tag in post.get('tags', []):
                    tag_counter[tag] += 1
            
            # Return top tags
            top_tags = [
                {'tag': tag, 'count': count}
                for tag, count in tag_counter.most_common(limit)
            ]
            
            return top_tags
            
        except Exception as e:
            logger.error(f"Failed to get top tags: {e}", exc_info=True)
            return []

    def get_post_size(self, post_id: int) -> int:
        """Get file size for a post"""
        post_id = validate_post_id(post_id)
        return self.file_manager.get_file_size(post_id)
    
    def rebuild_cache(self) -> bool:
        """
        Rebuild post cache from files
        Updates service state properly
        """
        try:
            success = self.database.rebuild_cache_from_files(self.file_manager)
            if success:
                # Reset cache flag so it's considered initialized
                self._cache_initialized = True
                logger.info("Cache rebuilt successfully through service")
            return success
        except Exception as e:
            logger.error(f"Cache rebuild failed: {e}", exc_info=True)
            return False

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
        try:
            return self.database.get_all_tag_counts()
        except Exception as e:
            logger.error(f"Failed to get tag counts: {e}", exc_info=True)
            return {}
    
    def rebuild_tag_counts(self, temp_path: str, save_path: str) -> bool:
        """Rebuild tag counts from all posts"""
        try:
            self.database.rebuild_tag_counts(temp_path, save_path)
            logger.info("Tag counts rebuilt successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to rebuild tag counts: {e}", exc_info=True)
            return False
    
    def get_tag_history(self, page: int = 1, limit: int = 50) -> Dict[str, Any]:
        """Get tag edit history with pagination"""
        try:
            page = validate_page_number(page)
            limit = validate_limit(limit, max_limit=200)
            
            return self.database.get_tag_history(limit, page)
        except Exception as e:
            logger.error(f"Failed to get tag history: {e}", exc_info=True)
            return {"items": [], "total": 0}


class SearchService:
    """Service for search-related operations"""
    
    def __init__(self, database):
        self.database = database
    
    def get_search_history(self, limit: int = 10) -> List[Dict[str, str]]:
        """Get recent search history"""
        try:
            limit = validate_limit(limit, max_limit=100)
            return self.database.get_search_history(limit)
        except Exception as e:
            logger.error(f"Failed to get search history: {e}", exc_info=True)
            return []
    
    def add_search_history(self, tags: str) -> bool:
        """Add search to history"""
        try:
            tags = validate_tags(tags)
            if tags:
                self.database.add_search_history(tags)
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to add search history: {e}", exc_info=True)
            return False


class ScraperService:
    """Service for scraper operations"""
    
    def __init__(self, scraper, database):
        self.scraper = scraper
        self.database = database
    
    def start_scraper(self, tags: str = "", resume: bool = False):
        """Start the scraper"""
        tags = validate_tags(tags) if tags else ""
        
        # Check for resume opportunity if not explicitly resuming
        if not resume and tags:
            resume_page = self.scraper.check_resume_available(tags)
            if resume_page and resume_page > 0:
                return {
                    "resume_available": True,
                    "resume_page": resume_page,
                    "tags": tags
                }
        
        return self.scraper.start(tags, resume=resume)
    
    def stop_scraper(self) -> bool:
        """Stop the scraper"""
        self.scraper.stop()
        return True
    
    def get_status(self) -> Dict[str, Any]:
        """Get scraper status"""
        try:
            return self.scraper.get_state()
        except Exception as e:
            logger.error(f"Failed to get scraper status: {e}", exc_info=True)
            return {
                "active": False,
                "current_tags": "",
                "current_page": 0,
                "session_processed": 0,
                "session_skipped": 0,
                "posts_remaining": 0,
                "current_mode": "search",
                "storage_warning": False,
                "last_error": str(e),
                "requests_this_minute": 0,
                "rate_limit_wait": 0,
                "rate_limit_active": False,
                "search_queue": [],
                "total_posts_api": 0,
                "total_posts_local": 0
            }


class AutocompleteService:
    """Service for tag autocomplete"""
    
    def __init__(self, api_client):
        self.api_client = api_client
    
    def get_suggestions(self, query: str) -> List[str]:
        """Get autocomplete suggestions"""
        try:
            if not query or len(query) < 2:
                return []
            
            query = query.strip()[:50]
            
            return self.api_client.get_autocomplete_tags(query)
        except Exception as e:
            logger.error(f"Failed to get autocomplete suggestions: {e}", exc_info=True)
            return []