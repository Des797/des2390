import os
import uuid
import time
import logging
import threading
from datetime import datetime
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class Scraper:
    """Main scraper for Rule34 posts"""
    
    def __init__(self, api_client, file_manager, database, elasticsearch_client=None):
        self.api_client = api_client
        self.file_manager = file_manager
        self.database = database
        self.es = elasticsearch_client
        
        self.state = {
            "active": False,
            "current_tags": "",
            "current_page": 0,
            "total_processed": 0,
            "total_saved": 0,
            "total_discarded": 0,
            "total_skipped": 0,
            "current_mode": "search",
            "storage_warning": False,
            "last_error": ""
        }
        
        self.lock = threading.Lock()
        self.thread = None
    
    def get_state(self) -> Dict[str, Any]:
        """Get current scraper state"""
        with self.lock:
            state_copy = self.state.copy()
            state_copy["requests_this_minute"] = self.api_client.get_requests_per_minute()
            return state_copy
    
    def start(self, tags: str = "") -> bool:
        """Start scraping"""
        if self.state["active"]:
            logger.warning("Scraper already running")
            return False
        
        if not self.file_manager.temp_path or not self.file_manager.save_path:
            logger.error("Paths not configured")
            return False
        
        # Reset state
        with self.lock:
            self.state["active"] = True
            self.state["current_tags"] = tags
            self.state["current_page"] = 0
            self.state["current_mode"] = "search" if tags else "newest"
            self.state["total_processed"] = 0
            self.state["total_saved"] = 0
            self.state["total_discarded"] = 0
            self.state["total_skipped"] = 0
            self.state["last_error"] = ""
        
        # Add to search history
        if tags:
            self.database.add_search_history(tags)
        
        # Start scraper thread
        self.thread = threading.Thread(target=self._scraper_loop, daemon=True)
        self.thread.start()
        
        logger.info(f"Scraper started with tags: '{tags}'")
        return True
    
    def stop(self):
        """Stop scraping"""
        with self.lock:
            self.state["active"] = False
        logger.info("Scraper stopped")
    
    def _scraper_loop(self):
        """Main scraper loop"""
        logger.info("Scraper loop started")
        
        blacklist = self.database.load_config("blacklist", "[]")
        try:
            import json
            blacklist = json.loads(blacklist)
        except:
            blacklist = []
        
        while self.state["active"]:
            try:
                # Check storage
                if not self.file_manager.check_storage(self.file_manager.temp_path):
                    logger.error("Storage critically low")
                    with self.lock:
                        self.state["storage_warning"] = True
                        self.state["active"] = False
                    break
                
                # Get current tags and page
                tags = self.state["current_tags"]
                page = self.state["current_page"]
                
                # If in newest mode, clear tags
                if self.state["current_mode"] == "newest":
                    tags = ""
                
                # Make API request
                posts = self.api_client.make_request(
                    tags=tags,
                    page=page,
                    blacklist=blacklist
                )
                
                # Handle errors
                if isinstance(posts, dict) and "error" in posts:
                    with self.lock:
                        self.state["last_error"] = posts["error"]
                    time.sleep(5)
                    continue
                
                # No posts returned
                if not posts:
                    if self.state["current_mode"] == "search":
                        # Switch to newest mode
                        logger.info("Search exhausted, switching to newest mode")
                        with self.lock:
                            self.state["current_mode"] = "newest"
                            self.state["current_page"] = 0
                        continue
                    else:
                        # Wait and retry in newest mode
                        time.sleep(10)
                        continue
                
                # Process each post
                for post in posts:
                    if not self.state["active"]:
                        break
                    
                    self._process_post(post)
                
                # Increment page
                with self.lock:
                    self.state["current_page"] += 1
                
                # Small delay between pages
                time.sleep(1)
                
            except Exception as e:
                logger.error(f"Scraper loop exception: {e}", exc_info=True)
                with self.lock:
                    self.state["last_error"] = str(e)
                time.sleep(5)
        
        logger.info("Scraper loop ended")
    
    def _process_post(self, post: Dict[str, Any]):
        """Process a single post"""
        post_id = post.get("id")
        if not post_id:
            return
        
        # Check if already processed
        status = self.database.get_post_status(post_id)
        if status in ["saved", "discarded"]:
            with self.lock:
                self.state["total_skipped"] += 1
            return
        
        # Extract tags
        tags_str = post.get("tags", "")
        tags_list = [tag.strip() for tag in tags_str.split() if tag.strip()]
        
        # Index in Elasticsearch if available
        if self.es and not self.database.is_post_indexed(post_id):
            try:
                obj_id = str(uuid.uuid4())
                self.es.index(index="objects", id=obj_id, document={
                    "tags": tags_list,
                    "added": datetime.now(),
                    "post_id": post_id
                })
                self.database.mark_post_indexed(post_id)
            except Exception as e:
                logger.error(f"Elasticsearch indexing error: {e}")
        
        # Download file
        file_url = post.get("file_url")
        if not file_url:
            return
        
        # Ensure temp directory exists
        self.file_manager.ensure_directory(self.file_manager.temp_path)
        
        # Determine file extension
        file_ext = os.path.splitext(file_url)[1] or ".jpg"
        temp_file = os.path.join(self.file_manager.temp_path, f"{post_id}{file_ext}")
        
        # Download
        if self.api_client.download_file(file_url, temp_file):
            # Generate video thumbnail if it's a video
            is_video = file_ext.lower() in ['.mp4', '.webm']
            duration = None
            if is_video:
                try:
                    from video_processor import get_video_processor
                    processor = get_video_processor()
                    
                    # Get video duration
                    duration = processor.get_video_duration(temp_file)
                    
                    # Generate thumbnail
                    thumb_path = processor.generate_thumbnail_at_percentage(
                        temp_file, 
                        percentage=10.0
                    )
                    if thumb_path:
                        logger.debug(f"Generated thumbnail for video {post_id}")
                except Exception as e:
                    logger.warning(f"Video processing failed for {post_id}: {e}")
            
            # Create post metadata
            post_data = {
                "id": post_id,
                "file_path": temp_file,
                "file_url": file_url,
                "tags": tags_list,
                "score": post.get("score", 0),
                "rating": post.get("rating", ""),
                "width": post.get("width", 0),
                "height": post.get("height", 0),
                "preview_url": post.get("preview_url", ""),
                "owner": post.get("owner", "unknown"),
                "title": post.get("title", ""),
                "created_at": post.get("created_at", ""),
                "change": post.get("change", ""),
                "file_type": file_ext.lower(),
                "duration": duration,  # Add duration field
                "downloaded_at": datetime.now().isoformat(),
                "status": "pending",
                "timestamp": time.time()
            }
            
            # Save metadata
            self.file_manager.save_post_json(post_data, self.file_manager.temp_path)
            
            # ADD TO CACHE IMMEDIATELY (incremental!)
            self.database.cache_post(post_data)
            
            # Update tag counts
            self.database.update_tag_counts(tags_list, increment=True)
            
            # Update stats
            with self.lock:
                self.state["total_processed"] += 1
            
            logger.info(f"Downloaded and cached post {post_id}")