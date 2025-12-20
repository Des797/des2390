import os
import uuid
import time
import logging
import threading
from datetime import datetime
from typing import Dict, Any, Optional, List
from collections import deque

logger = logging.getLogger(__name__)

class Scraper:
    """Main scraper for Rule34 posts with rate limiting and search queue"""
    
    def __init__(self, api_client, file_manager, database, elasticsearch_client=None):
        self.api_client = api_client
        self.file_manager = file_manager
        self.database = database
        self.es = elasticsearch_client
        
        self.state = {
            "active": False,
            "current_tags": "",
            "current_page": 0,
            "session_processed": 0,
            "session_skipped": 0,
            "posts_remaining": 0,
            "total_posts_for_query": None,
            "local_posts_for_query": None,
            "current_mode": "search",
            "storage_warning": False,
            "last_error": "",
            "log": [],
            "rate_limit_wait": 0,
            "rate_limit_active": False,
            "search_queue": [],
            "current_search_index": 0
        }      
        self.lock = threading.Lock()
        self.thread = None
        self.consecutive_502_errors = 0
        self.last_request_time = 0
    
    def get_state(self) -> Dict[str, Any]:
        """Get current scraper state"""
        with self.lock:
            state_copy = self.state.copy()
            state_copy["requests_this_minute"] = self.api_client.get_requests_per_minute()
            return state_copy
    
    def start(self, tags: str = "") -> bool:
        """Start scraping with optional search queue"""
        if self.state["active"]:
            logger.warning("Scraper already running")
            return False
        
        if not self.file_manager.temp_path or not self.file_manager.save_path:
            logger.error("Paths not configured")
            return False
        
        # Parse search queue (separated by semicolons)
        search_queue = []
        if tags:
            search_queue = [t.strip() for t in tags.split(';') if t.strip()]
        
        # Check for resume option
        resume_page = None
        if len(search_queue) == 1:
            # Single search - check for saved progress
            saved_page = self.database.load_config(f"last_page:{search_queue[0]}", None)
            if saved_page and int(saved_page) > 0:
                resume_page = int(saved_page)
        
        with self.lock:
            self.state["active"] = True
            self.state["search_queue"] = search_queue if search_queue else [""]
            self.state["current_search_index"] = 0
            self.state["current_tags"] = self.state["search_queue"][0]
            self.state["current_page"] = resume_page if resume_page else 0
            self.state["current_mode"] = "search" if self.state["current_tags"] else "newest"
            self.state["session_processed"] = 0
            self.state["session_skipped"] = 0
            self.state["posts_remaining"] = 0
            self.state["total_posts_for_query"] = None
            self.state["local_posts_for_query"] = None
            self.state["last_error"] = ""
            self.state["log"] = [] 
            self.state["rate_limit_wait"] = 0
            self.state["rate_limit_active"] = False
        
        # Reset consecutive errors
        self.consecutive_502_errors = 0
        
        # Add to search history
        for search in search_queue:
            if search:
                self.database.add_search_history(search)
        
        # Start background thread to calculate total/local posts
        if self.es and self.state["current_tags"]:
            threading.Thread(
                target=self._calculate_progress_stats,
                args=(self.state["current_tags"],),
                daemon=True
            ).start()
        
        # Start scraper thread
        self.thread = threading.Thread(target=self._scraper_loop, daemon=True)
        self.thread.start()
        
        logger.info(f"Scraper started with queue: {self.state['search_queue']}")
        if resume_page:
            self._add_log(f"Resuming from page {resume_page}", "info")
        return True
    
    def stop(self):
        """Stop scraping"""
        with self.lock:
            # Save current progress
            if self.state["current_tags"]:
                self.database.save_config(
                    f"last_page:{self.state['current_tags']}", 
                    str(self.state["current_page"])
                )
            self.state["active"] = False
        logger.info("Scraper stopped")
    
    def add_to_queue(self, tags: str) -> bool:
        """Add search to queue while scraper is running"""
        if not tags:
            return False
        
        with self.lock:
            if tags not in self.state["search_queue"]:
                self.state["search_queue"].append(tags)
                self._add_log(f"Added to queue: {tags}", "info")
                logger.info(f"Added to search queue: {tags}")
                return True
        return False
    
    def _add_log(self, message: str, level: str = "info"):
        """Add entry to activity log with memory limit"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        with self.lock:
            # Keep only last 50 entries (reduced from 100 for memory)
            if len(self.state["log"]) >= 50:
                self.state["log"] = self.state["log"][-25:]  # Keep last 25
            
            self.state["log"].append({
                "timestamp": timestamp,
                "message": message,
                "level": level
            })
    
    def _calculate_progress_stats(self, tags: str):
        """Calculate total posts for query (background thread)"""
        if not self.es:
            return
        
        try:
            # Query API for total count (page 0, limit 1)
            response = self.api_client.make_request(tags=tags, page=0, limit=1)
            if isinstance(response, dict) and "count" in response:
                total = response["count"]
                with self.lock:
                    self.state["total_posts_for_query"] = total
                logger.info(f"Total posts for '{tags}': {total}")
            
            # Query Elasticsearch for local count
            result = self.es.count(
                index="objects",
                body={"query": {"match": {"tags": tags}}}
            )
            local_count = result.get("count", 0)
            
            with self.lock:
                self.state["local_posts_for_query"] = local_count
            
            logger.info(f"Local posts for '{tags}': {local_count}")
            
        except Exception as e:
            logger.error(f"Failed to calculate progress stats: {e}")
    
    def _handle_rate_limit(self, status_code: int):
        """Handle rate limiting with exponential backoff"""
        if status_code == 502 or status_code == 429:
            self.consecutive_502_errors += 1
            
            # Calculate wait time (exponential backoff: 5s, 10s, 20s, 40s, ...)
            base_wait = 5
            wait_time = min(base_wait * (2 ** (self.consecutive_502_errors - 1)), 300)  # Max 5 min
            
            with self.lock:
                self.state["rate_limit_wait"] = wait_time
                self.state["rate_limit_active"] = True
            
            self._add_log(
                f"Rate limit hit (error {status_code}). Waiting {wait_time}s before retry...",
                "warning"
            )
            logger.warning(f"Rate limit: waiting {wait_time}s (attempt {self.consecutive_502_errors})")
            
            # Wait with countdown
            for remaining in range(wait_time, 0, -1):
                if not self.state["active"]:
                    break
                
                with self.lock:
                    self.state["rate_limit_wait"] = remaining
                
                time.sleep(1)
            
            with self.lock:
                self.state["rate_limit_active"] = False
                self.state["rate_limit_wait"] = 0
    
    def _move_to_next_search(self):
        """Move to next search in queue"""
        with self.lock:
            self.state["current_search_index"] += 1
            
            if self.state["current_search_index"] >= len(self.state["search_queue"]):
                # All searches exhausted, switch to newest mode
                logger.info("All searches exhausted, switching to newest mode")
                self._add_log("All searches complete. Switching to newest posts...", "success")
                self.state["current_mode"] = "newest"
                self.state["current_tags"] = ""
                self.state["current_page"] = 0
                self.state["total_posts_for_query"] = None
                self.state["local_posts_for_query"] = None
            else:
                # Move to next search
                next_tags = self.state["search_queue"][self.state["current_search_index"]]
                logger.info(f"Moving to next search: {next_tags}")
                self._add_log(f"Starting next search: {next_tags}", "info")
                self.state["current_tags"] = next_tags
                self.state["current_page"] = 0
                self.state["current_mode"] = "search"
                
                # Calculate stats for new search
                if self.es and next_tags:
                    threading.Thread(
                        target=self._calculate_progress_stats,
                        args=(next_tags,),
                        daemon=True
                    ).start()
    
    def _scraper_loop(self):
        """Main scraper loop with memory management"""
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
                
                # Rate limiting between requests (minimum 1 second)
                current_time = time.time()
                time_since_last = current_time - self.last_request_time
                if time_since_last < 1.0:
                    time.sleep(1.0 - time_since_last)
                
                # Get current tags and page
                tags = self.state["current_tags"]
                page = self.state["current_page"]
                
                # Make API request
                posts = self.api_client.make_request(
                    tags=tags,
                    page=page,
                    blacklist=blacklist
                )
                
                self.last_request_time = time.time()
                
                # Log API request
                tag_display = tags if tags else "(newest posts)"
                self._add_log(f"API request: page {page}, tags: {tag_display}")
                
                # Handle rate limit errors
                if isinstance(posts, dict) and "error" in posts:
                    error_msg = posts["error"]
                    
                    # Check if it's a rate limit error
                    if "502" in error_msg or "429" in error_msg:
                        self._handle_rate_limit(502)
                        continue
                    else:
                        with self.lock:
                            self.state["last_error"] = error_msg
                        time.sleep(5)
                        continue
                
                # Reset consecutive errors on success
                self.consecutive_502_errors = 0
                
                # No posts returned
                if not posts:
                    if self.state["current_mode"] == "search":
                        # Save progress
                        if self.state["current_tags"]:
                            self.database.save_config(
                                f"last_page:{self.state['current_tags']}", 
                                str(self.state["current_page"])
                            )
                        
                        # Move to next search
                        self._move_to_next_search()
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
                
                # Periodic memory cleanup (every 10 pages)
                if self.state["current_page"] % 10 == 0:
                    import gc
                    gc.collect()
                
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
        
        # Check if already processed this session (memory optimization)
        if post_id in self._processed_posts_cache:
            with self.lock:
                self.state["session_skipped"] += 1
            return
        
        # Extract tags
        tags_str = post.get("tags", "")
        tags_list = [tag.strip() for tag in tags_str.split() if tag.strip()]
        
        # Check blacklist
        if blacklist:
            for tag in tags_list:
                for blacklist_pattern in blacklist:
                    if self._matches_blacklist(tag, blacklist_pattern):
                        logger.debug(f"Skipping post {post_id} due to blacklisted tag: {tag}")
                        self._add_log(f"Skipped post {post_id} (blacklisted: {tag})", "warning")
                        with self.lock:
                            self.state["session_skipped"] += 1
                        self._processed_posts_cache.append(post_id)
                        return
        
        # Disk-first existence check
        file_url = post.get("file_url")
        if not file_url:
            return

        file_ext = os.path.splitext(file_url)[1] or ".jpg"
        temp_file = os.path.join(self.file_manager.temp_path, f"{post_id}{file_ext}")
        file_on_disk = os.path.exists(temp_file)

        if not file_on_disk and self.file_manager.save_path:
            if os.path.exists(self.file_manager.save_path):
                for folder in os.listdir(self.file_manager.save_path):
                    folder_path = os.path.join(self.file_manager.save_path, folder)
                    if not os.path.isdir(folder_path):
                        continue
                    candidate = os.path.join(folder_path, f"{post_id}{file_ext}")
                    if os.path.exists(candidate):
                        file_on_disk = True
                        break

        if file_on_disk:
            # ASYNC: Don't block on database - mark as saved in background
            import threading
            threading.Thread(
                target=lambda: self.database.set_post_status(post_id, "saved"),
                daemon=True
            ).start()
            
            self._add_log(f"Skipped post {post_id} (already on disk)")
            with self.lock:
                self.state["session_skipped"] += 1
            self._processed_posts_cache.append(post_id)
            return

        # DB status check (quick read, no locking issues)
        status = self.database.get_post_status(post_id)
        if status in ["saved", "discarded"]:
            self._add_log(f"Skipped post {post_id} (already {status})")
            with self.lock:
                self.state["session_skipped"] += 1
            self._processed_posts_cache.append(post_id)
            return
        
        # Index in Elasticsearch if available (async to avoid blocking)
        if self.es and not self.database.is_post_indexed(post_id):
            def index_async():
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
            
            threading.Thread(target=index_async, daemon=True).start()
        
        # Ensure temp directory exists
        self.file_manager.ensure_directory(self.file_manager.temp_path)
        
        # Download
        if self.api_client.download_file(file_url, temp_file):
            # Generate video thumbnail if it's a video
            is_video = file_ext.lower() in ['.mp4', '.webm']
            duration = None
            if is_video:
                try:
                    from video_processor import get_video_processor
                    processor = get_video_processor()
                    duration = processor.get_video_duration(temp_file)
                    thumb_path = processor.generate_thumbnail_at_percentage(temp_file, percentage=10.0)
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
            
            # Save metadata (file I/O is fast)
            self.file_manager.save_post_json(post_data, self.file_manager.temp_path)
            
            # ASYNC: Database operations in background thread to avoid blocking
            def save_to_db():
                try:
                    # Add to cache immediately
                    self.database.cache_post(post_data)
                    
                    # Update tag counts
                    self.database.update_tag_counts(tags_list, increment=True)
                except Exception as e:
                    logger.error(f"Database save error for post {post_id}: {e}")
            
            threading.Thread(target=save_to_db, daemon=True).start()
            
            # Track in session
            self._processed_posts_cache.append(post_id)
            
            # Update stats
            with self.lock:
                self.state["session_processed"] += 1
            
            self._add_log(f"Downloaded post {post_id} ({file_ext})")
            logger.info(f"Downloaded and cached post {post_id}")
        
    def _matches_blacklist(self, tag: str, pattern: str) -> bool:
        """Check if tag matches blacklist pattern (supports wildcards)"""
        import re
        regex_pattern = pattern.replace('*', '.*')
        regex_pattern = f'^{regex_pattern}$'
        return bool(re.match(regex_pattern, tag, re.IGNORECASE))