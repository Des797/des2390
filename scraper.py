import os
import uuid
import time
import logging
import threading
from datetime import datetime
from typing import Dict, Any, Optional, List

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
            "session_processed": 0,  # Posts downloaded this session
            "session_skipped": 0,    # Posts skipped this session
            "posts_remaining": 0,    # Posts left in current batch
            "current_mode": "search",
            "storage_warning": False,
            "last_error": "",
            "log": []  # Activity log
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
        
        with self.lock:
            self.state["active"] = True
            self.state["current_tags"] = tags
            self.state["current_page"] = 0
            self.state["current_mode"] = "search" if tags else "newest"
            self.state["session_processed"] = 0
            self.state["session_skipped"] = 0
            self.state["posts_remaining"] = 0
            self.state["last_error"] = ""
            self.state["log"] = [] 

        
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
        
    def _add_log(self, message: str, level: str = "info"):
        """Add entry to activity log"""
        from datetime import datetime
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        with self.lock:
            # Keep only last 100 entries
            if len(self.state["log"]) >= 100:
                self.state["log"].pop(0)
            
            self.state["log"].append({
                "timestamp": timestamp,
                "message": message,
                "level": level
            })
    
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
                    blacklist=blacklist  # Always apply blacklist
                )
                
                # Log API request
                tag_display = tags if tags else "(newest posts)"
                self._add_log(f"API request: page {page}, tags: {tag_display}")
                
                # Handle errors
                if isinstance(posts, dict) and "error" in posts:
                    with self.lock:
                        self.state["last_error"] = posts["error"]
                    time.sleep(5)
                    continue
                
                # No posts returned
                if not posts:
                    if self.state["current_mode"] == "search":
                        # Switch to newest mode with blacklist
                        logger.info("Search exhausted, switching to newest mode with blacklist filtering")
                        self._add_log("Search exhausted, switching to newest posts with blacklist filtering", "warning")
                        with self.lock:
                            self.state["current_mode"] = "newest"
                            self.state["current_page"] = 0
                            self.state["current_tags"] = ""  # Clear search tags
                        continue
                    else:
                        # Wait and retry in newest mode
                        time.sleep(10)
                        continue
                
                    # Update posts remaining
                    with self.lock:
                        self.state["posts_remaining"] = len(posts)

                    # Process each post
                    for i, post in enumerate(posts):
                        if not self.state["active"]:
                            break
                        
                        # Update remaining count
                        with self.lock:
                            self.state["posts_remaining"] = len(posts) - i - 1
                        
                        self._process_post(post, blacklist)
    
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
    
    def _process_post(self, post: Dict[str, Any], blacklist: List[str] = None):
        """Process a single post"""
        post_id = post.get("id")
        if not post_id:
            return
        
        # Extract tags
        tags_str = post.get("tags", "")
        tags_list = [tag.strip() for tag in tags_str.split() if tag.strip()]
        
        # Check blacklist if in newest mode
        if blacklist and self.state["current_mode"] == "newest":
            # Check if any tag is blacklisted
            for tag in tags_list:
                for blacklist_pattern in blacklist:
                    # Support wildcard matching
                    if self._matches_blacklist(tag, blacklist_pattern):
                        logger.debug(f"Skipping post {post_id} due to blacklisted tag: {tag}")
                        self._add_log(f"Skipped post {post_id} (blacklisted tag: {tag})", "warning")
                        with self.lock:
                            self.state["session_skipped"] += 1
                        return
        
        # Check if already processed
        status = self.database.get_post_status(post_id)
        if status in ["saved", "discarded"]:
            self._add_log(f"Skipped post {post_id} (already {status})")
            with self.lock:
                self.state["session_skipped"] += 1
            return
        
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
                "duration": duration,
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
                self.state["session_processed"] += 1
            
            self._add_log(f"Downloaded post {post_id} ({file_ext})")
            logger.info(f"Downloaded and cached post {post_id}")

    def _matches_blacklist(self, tag: str, pattern: str) -> bool:
        """Check if tag matches blacklist pattern (supports wildcards)"""
        import re
        # Convert wildcard pattern to regex
        regex_pattern = pattern.replace('*', '.*')
        regex_pattern = f'^{regex_pattern}$'
        return bool(re.match(regex_pattern, tag, re.IGNORECASE))