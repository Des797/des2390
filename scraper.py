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
            "session_processed": 0,
            "session_skipped": 0,
            "posts_remaining": 0,
            "current_mode": "search",
            "storage_warning": False,
            "last_error": "",
            "log": [],
            "rate_limit_wait": 0,  # Seconds to wait before retry
            "rate_limit_active": False,  # Is rate limiting active?
            "search_queue": [],  # Queue of searches
            "total_posts_api": 0,  # Total posts from API
            "total_posts_local": 0,  # Total posts in ES
            "resume_available": False,  # Can resume previous search?
            "resume_page": 0  # Page to resume from
        }      
        self.lock = threading.Lock()
        self.thread = None
        self._stop_flag = False
        
        # Rate limiting
        self._rate_limit_failures = 0
        self._last_success_time = time.time()
        
        # Memory optimization
        self._processed_posts_cache = deque(maxlen=1000)  # Track recent posts only
    
    def get_state(self) -> Dict[str, Any]:
        """Get current scraper state"""
        with self.lock:
            state_copy = self.state.copy()
            state_copy["requests_this_minute"] = self.api_client.get_requests_per_minute()
            return state_copy
    
    def add_to_queue(self, tags: str) -> bool:
        """Add a search to the queue"""
        with self.lock:
            if tags not in self.state["search_queue"]:
                self.state["search_queue"].append(tags)
                self._add_log(f"Added to queue: {tags}", "info")
                return True
            return False
    
    def get_queue(self) -> List[str]:
        """Get current search queue"""
        with self.lock:
            return self.state["search_queue"].copy()
    
    def clear_queue(self):
        """Clear search queue"""
        with self.lock:
            self.state["search_queue"].clear()
            self._add_log("Search queue cleared", "info")
    
    def check_resume_available(self, tags: str) -> Optional[int]:
        try:
            raw = self.database.load_config(f"last_page_{tags}", None)
            if raw is None:
                return None
            page = int(raw)
            if page > 0:
                return page
        except (ValueError, TypeError):
            pass
        return None
    
    def start(self, tags: str = "", resume: bool = False) -> bool:
        """Start scraping"""
        if self.state["active"]:
            logger.warning("Scraper already running")
            return False
        
        if not self.file_manager.temp_path or not self.file_manager.save_path:
            logger.error("Paths not configured")
            return False
        
        # Check for resume opportunity
        resume_page = 0
        if not resume:
            last_page = self.check_resume_available(tags)
            if last_page is not None:
                with self.lock:
                    self.state["resume_available"] = True
                    self.state["resume_page"] = last_page
                logger.info(f"Resume available for '{tags}' at page {last_page}")
                return False  # Wait for user confirmation
        else:
            resume_page = self.state.get("resume_page", 0)
        with self.lock:
            self.state["active"] = True
            self.state["current_tags"] = tags
            self.state["current_page"] = resume_page
            self.state["current_mode"] = "search" if tags else "newest"
            self.state["session_processed"] = 0
            self.state["session_skipped"] = 0
            self.state["posts_remaining"] = 0
            self.state["last_error"] = ""
            self.state["log"] = []
            self.state["rate_limit_wait"] = 0
            self.state["rate_limit_active"] = False
            self.state["resume_available"] = False
            self._rate_limit_failures = 0
            self._stop_flag = False
            
            # Clear processed cache for new session
            self._processed_posts_cache.clear()
        
        # Add to search history
        if tags:
            self.database.add_search_history(tags)
        
        # Get total count from API (lazy)
        if tags and self.es:
            threading.Thread(target=self._fetch_total_counts, args=(tags,), daemon=True).start()
        
        # Start scraper thread
        self.thread = threading.Thread(target=self._scraper_loop, daemon=True)
        self.thread.start()
        
        logger.info(f"Scraper started with tags: '{tags}' (resume: {resume}, page: {resume_page})")
        return True
    
    def stop(self):
        """Stop scraping"""
        with self.lock:
            self.state["active"] = False
            self._stop_flag = True
        logger.info("Scraper stopped")
    
    def _fetch_total_counts(self, tags: str):
        """Fetch total counts from API and Elasticsearch (runs in background)"""
        try:
            # Get API count
            api_count = self.api_client.get_post_count(tags)
            
            # Get local count from ES
            local_count = 0
            if self.es:
                try:
                    tag_list = [t.strip() for t in tags.split() if t.strip()]
                    query = {
                        "query": {
                            "bool": {
                                "must": [{"term": {"tags": tag}} for tag in tag_list]
                            }
                        }
                    }
                    result = self.es.count(index="objects", body=query)
                    local_count = result.get("count", 0)
                except Exception as e:
                    logger.warning(f"ES count failed: {e}")
            
            with self.lock:
                self.state["total_posts_api"] = api_count
                self.state["total_posts_local"] = local_count
                
            logger.info(f"Total counts - API: {api_count}, Local: {local_count}")
            
        except Exception as e:
            logger.error(f"Failed to fetch total counts: {e}")
    
    def _add_log(self, message: str, level: str = "info"):
        """Add entry to activity log"""
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
    
    def _handle_rate_limit(self):
        """Handle rate limiting with exponential backoff"""
        self._rate_limit_failures += 1
        
        # Exponential backoff: 30s, 60s, 120s, 240s, max 300s (5 min)
        wait_time = min(30 * (2 ** (self._rate_limit_failures - 1)), 300)
        
        with self.lock:
            self.state["rate_limit_active"] = True
            self.state["rate_limit_wait"] = wait_time
        
        self._add_log(f"Rate limited. Waiting {wait_time}s before retry (attempt {self._rate_limit_failures})", "warning")
        logger.warning(f"Rate limit hit. Waiting {wait_time}s")
        
        # Wait with countdown
        start_wait = time.time()
        while time.time() - start_wait < wait_time and not self._stop_flag:
            remaining = wait_time - (time.time() - start_wait)
            with self.lock:
                self.state["rate_limit_wait"] = max(0, int(remaining))
            time.sleep(1)
        
        with self.lock:
            self.state["rate_limit_active"] = False
            self.state["rate_limit_wait"] = 0
    
    def _scraper_loop(self):
        """Main scraper loop"""
        logger.info("Scraper loop started")
        
        blacklist = self.database.load_config("blacklist", "[]")
        try:
            import json
            blacklist = json.loads(blacklist)
        except:
            blacklist = []
        
        while self.state["active"] and not self._stop_flag:
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
                
                # Save current page for resume
                if tags:
                    self.database.save_config(f"last_page_{tags}", str(page))
                
                # If in newest mode, clear tags
                if self.state["current_mode"] == "newest":
                    tags = ""
                
                # Make API request
                posts = self.api_client.make_request(
                    tags=tags,
                    page=page,
                    blacklist=blacklist
                )
                
                # Handle 502/rate limit errors
                if isinstance(posts, dict) and "error" in posts:
                    error_msg = posts["error"]
                    with self.lock:
                        self.state["last_error"] = error_msg
                    
                    if "502" in error_msg or "rate" in error_msg.lower():
                        self._handle_rate_limit()
                        continue
                    
                    time.sleep(5)
                    continue
                
                # Success - reset rate limit counter
                self._rate_limit_failures = 0
                self._last_success_time = time.time()
                
                # Log API request
                tag_display = tags if tags else "(newest posts)"
                self._add_log(f"API request: page {page}, tags: {tag_display}")
                
                # No posts returned - search exhausted
                if not posts:
                    if self.state["current_mode"] == "search":
                        # Check if there are queued searches
                        next_search = None
                        with self.lock:
                            if self.state["search_queue"]:
                                next_search = self.state["search_queue"].pop(0)
                        
                        if next_search:
                            logger.info(f"Moving to next queued search: {next_search}")
                            self._add_log(f"Search exhausted. Moving to: {next_search}", "info")
                            with self.lock:
                                self.state["current_tags"] = next_search
                                self.state["current_page"] = 0
                                self.state["current_mode"] = "search"
                            
                            # Get counts for new search
                            if self.es:
                                threading.Thread(target=self._fetch_total_counts, args=(next_search,), daemon=True).start()
                            continue
                        else:
                            # No more queued searches, switch to newest
                            logger.info("All searches exhausted, switching to newest mode")
                            self._add_log("All searches complete. Switching to newest posts", "warning")
                            with self.lock:
                                self.state["current_mode"] = "newest"
                                self.state["current_page"] = 0
                                self.state["current_tags"] = ""
                            continue
                    else:
                        # Already in newest mode, wait and retry
                        time.sleep(10)
                        continue
                
                # Update posts remaining
                with self.lock:
                    self.state["posts_remaining"] = len(posts)

                # Process each post
                for i, post in enumerate(posts):
                    if not self.state["active"] or self._stop_flag:
                        break
                    
                    # Update remaining count
                    with self.lock:
                        self.state["posts_remaining"] = len(posts) - i - 1
                    
                    self._process_post(post, blacklist)
                    
                    # Memory management: periodic cleanup
                    if i % 100 == 0:
                        import gc
                        gc.collect()
    
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
                    self.es.index(index="objects", id=post_id, document={
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