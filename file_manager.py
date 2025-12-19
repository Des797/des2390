import os
import json
import shutil
import logging
import time
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = logging.getLogger(__name__)

class FileManager:
    """Manages file operations for posts"""
    
    def __init__(self, temp_path: str = "", save_path: str = ""):
        self.temp_path = temp_path
        self.save_path = save_path
    
    def update_paths(self, temp_path: str, save_path: str):
        """Update file paths"""
        self.temp_path = temp_path
        self.save_path = save_path
        logger.info(f"Paths updated - Temp: {temp_path}, Save: {save_path}")
    
    def check_storage(self, path: str, min_gb: float = 5) -> bool:
        """Check if storage has minimum free space"""
        try:
            if not path or not os.path.exists(path):
                return True
            
            total, used, free = shutil.disk_usage(path)
            free_gb = free / (1024**3)
            logger.debug(f"Storage check for {path}: {free_gb:.2f} GB free")
            return free_gb > min_gb
        except Exception as e:
            logger.error(f"Storage check failed: {e}")
            return True
    
    def ensure_directory(self, path: str):
        """Ensure directory exists"""
        os.makedirs(path, exist_ok=True)
    
    def save_post_json(self, post_data: Dict[str, Any], directory: str):
        """Save post metadata as JSON"""
        post_id = post_data['id']
        json_path = os.path.join(directory, f"{post_id}.json")
        
        with open(json_path, 'w') as f:
            json.dump(post_data, f, indent=2)
        
        logger.debug(f"Saved JSON for post {post_id}")
    
    def load_post_json(self, post_id: int, directory: str) -> Optional[Dict[str, Any]]:
        """Load post metadata from JSON"""
        json_path = os.path.join(directory, f"{post_id}.json")
        
        if not os.path.exists(json_path):
            return None
        
        try:
            with open(json_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load JSON for post {post_id}: {e}")
            return None
    
    def get_pending_posts(self) -> List[Dict[str, Any]]:
        """Get all pending posts from temp directory - HIGHLY OPTIMIZED"""
        if not self.temp_path or not os.path.exists(self.temp_path):
            return []
        
        start_time = time.time()
        
        # Get all JSON files first with single directory scan
        try:
            entries = list(os.scandir(self.temp_path))
            json_files = [e.name for e in entries if e.name.endswith(".json") and e.is_file()]
        except Exception as e:
            logger.error(f"Failed to list temp directory: {e}")
            return []
        
        if not json_files:
            return []
        
        logger.info(f"Found {len(json_files)} pending post files")
        
        # Optimized loader with minimal overhead
        def load_post_fast(filename):
            json_path = os.path.join(self.temp_path, filename)
            try:
                # Use faster JSON decoder and file stats
                stat = os.stat(json_path)
                with open(json_path, 'r', buffering=65536) as f:  # Larger buffer
                    post_data = json.load(f)
                    post_data['timestamp'] = stat.st_mtime
                    post_data['status'] = 'pending'
                    # Duration will be calculated on-demand, not stored
                    if 'duration' not in post_data:
                        post_data['duration'] = None
                    return post_data
            except Exception as e:
                logger.error(f"Failed to load pending post {filename}: {e}")
                return None
        
        # Use ThreadPoolExecutor with optimal worker count
        pending = []
        max_workers = min(20, len(json_files))  # Don't over-parallelize small sets
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit in batches to reduce memory overhead
            batch_size = 100
            for i in range(0, len(json_files), batch_size):
                batch = json_files[i:i + batch_size]
                futures = [executor.submit(load_post_fast, f) for f in batch]
                
                for future in as_completed(futures):
                    result = future.result()
                    if result:
                        pending.append(result)
        
        load_time = time.time() - start_time
        logger.info(f"Loaded {len(pending)} pending posts in {load_time:.2f}s")
        return pending
    
    def get_saved_posts(self) -> List[Dict[str, Any]]:
        """Get all saved posts from save directory - OPTIMIZED"""
        if not self.save_path or not os.path.exists(self.save_path):
            return []
        
        start_time = time.time()
        saved = []
        
        # Get all date folders
        try:
            date_folders = [f for f in os.listdir(self.save_path) 
                           if os.path.isdir(os.path.join(self.save_path, f))]
        except Exception as e:
            logger.error(f"Failed to list save directory: {e}")
            return []
        
        if not date_folders:
            return []
        
        logger.info(f"Found {len(date_folders)} date folders")
        
        def load_folder_posts(date_folder):
            folder_path = os.path.join(self.save_path, date_folder)
            folder_posts = []
            
            try:
                json_files = [f for f in os.listdir(folder_path) if f.endswith(".json")]
            except Exception as e:
                logger.error(f"Failed to list folder {date_folder}: {e}")
                return []
            
            for filename in json_files:
                json_path = os.path.join(folder_path, filename)
                try:
                    with open(json_path, 'r') as f:
                        post_data = json.load(f)
                        post_data['timestamp'] = os.path.getmtime(json_path)
                        post_data['date_folder'] = date_folder
                        post_data['status'] = 'saved'
                        
                        # Duration will be calculated on-demand
                        if 'duration' not in post_data:
                            post_data['duration'] = None
                        
                        # Ensure file_path is set
                        post_id = post_data['id']
                        file_ext = post_data.get('file_type', '.jpg')
                        post_data['file_path'] = os.path.join(folder_path, f"{post_id}{file_ext}")
                        
                        folder_posts.append(post_data)
                except Exception as e:
                    logger.error(f"Failed to load saved post {filename}: {e}")
            
            return folder_posts
        
        # Load folders in parallel
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(load_folder_posts, folder) for folder in date_folders]
            for i, future in enumerate(as_completed(futures), 1):
                folder_posts = future.result()
                saved.extend(folder_posts)
                
                # Log progress for large datasets
                if i % 10 == 0 or i == len(date_folders):
                    logger.info(f"Processed {i}/{len(date_folders)} folders, {len(saved)} posts so far")
        
        load_time = time.time() - start_time
        logger.info(f"Loaded {len(saved)} saved posts in {load_time:.2f}s")
        return saved
    
    def get_all_posts(self) -> List[Dict[str, Any]]:
        """Get all posts (pending + saved)"""
        return self.get_pending_posts() + self.get_saved_posts()
    
    def _safe_move_file(self, src: str, dst: str, max_retries: int = 3, retry_delay: float = 0.5) -> bool:
        """
        Safely move a file with retry logic for locked files
        
        Args:
            src: Source file path
            dst: Destination file path
            max_retries: Number of retry attempts
            retry_delay: Delay between retries in seconds
            
        Returns:
            True if move succeeded, False otherwise
        """
        for attempt in range(max_retries):
            try:
                # Ensure destination directory exists
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                
                # Try to move the file
                shutil.move(src, dst)
                return True
                
            except PermissionError as e:
                if attempt < max_retries - 1:
                    logger.warning(f"File locked (attempt {attempt + 1}/{max_retries}): {src}. Retrying in {retry_delay}s...")
                    time.sleep(retry_delay)
                    retry_delay *= 2  # Exponential backoff
                else:
                    logger.error(f"Failed to move file after {max_retries} attempts (file locked): {src}")
                    return False
                    
            except FileNotFoundError as e:
                logger.error(f"Source file not found: {src}")
                return False
                
            except Exception as e:
                logger.error(f"Unexpected error moving file {src} to {dst}: {e}")
                return False
        
        return False
    
    def save_post_to_archive(self, post_id: int) -> bool:
        """Move post from temp to save directory with improved error handling"""
        if not self.temp_path or not self.save_path:
            logger.error("Paths not configured")
            return False
        
        json_path = os.path.join(self.temp_path, f"{post_id}.json")
        if not os.path.exists(json_path):
            logger.error(f"Post {post_id} not found in temp")
            return False
        
        try:
            # Load post data
            with open(json_path, 'r') as f:
                post_data = json.load(f)
            
            # Create date folder
            date_folder = datetime.now().strftime("%m.%d.%Y")
            target_dir = os.path.join(self.save_path, date_folder)
            self.ensure_directory(target_dir)
            
            # Get file path and check if it exists
            file_path = post_data.get("file_path")
            if not file_path:
                logger.error(f"No file_path in post data for {post_id}")
                return False
            
            # Handle case where file_path might be just filename
            if not os.path.isabs(file_path):
                file_path = os.path.join(self.temp_path, file_path)
            
            if not os.path.exists(file_path):
                # Try alternative: post_id + file_type
                file_ext = post_data.get('file_type', '.jpg')
                alt_path = os.path.join(self.temp_path, f"{post_id}{file_ext}")
                
                if os.path.exists(alt_path):
                    file_path = alt_path
                    logger.info(f"Found file at alternative path: {alt_path}")
                else:
                    logger.error(f"File not found for post {post_id}: {file_path}")
                    logger.error(f"Also tried: {alt_path}")
                    return False
            
            # Now file_path is verified to exist - proceed with move
            file_ext = post_data.get('file_type', os.path.splitext(file_path)[1])
            target_file = os.path.join(target_dir, f"{post_id}{file_ext}")
            target_json = os.path.join(target_dir, f"{post_id}.json")
            
            # Move media file with retry logic for locked files
            if not self._safe_move_file(file_path, target_file):
                logger.error(f"Failed to move media file for post {post_id}")
                return False
            
            logger.debug(f"Moved {file_path} to {target_file}")

            # Move thumbnail if exists (optional - don't fail if missing)
            video_dir = os.path.dirname(file_path)
            thumb_path = os.path.join(video_dir, '.thumbnails', f"{post_id}_thumb.jpg")
            
            if os.path.exists(thumb_path):
                target_thumb_dir = os.path.join(target_dir, '.thumbnails')
                os.makedirs(target_thumb_dir, exist_ok=True)
                target_thumb = os.path.join(target_thumb_dir, f"{post_id}_thumb.jpg")
                
                # Try to move thumbnail, but don't fail the entire operation if it fails
                if self._safe_move_file(thumb_path, target_thumb):
                    logger.debug(f"Moved thumbnail to {target_thumb}")
                else:
                    logger.warning(f"Failed to move thumbnail for post {post_id}, but continuing...")
            else:
                logger.debug(f"No thumbnail found for post {post_id} (will be generated on-demand)")
            
            # Move JSON - use safe move here too
            if not self._safe_move_file(json_path, target_json):
                logger.error(f"Failed to move JSON for post {post_id}")
                # Try to rollback media file
                try:
                    shutil.move(target_file, file_path)
                    logger.info(f"Rolled back media file for post {post_id}")
                except Exception as rollback_err:
                    logger.error(f"Failed to rollback media file: {rollback_err}")
                return False
            
            logger.debug(f"Moved JSON to {target_json}")
            logger.info(f"Saved post {post_id} to {date_folder}")
            return True
                
        except Exception as e:
            logger.error(f"Failed to save post {post_id}: {e}", exc_info=True)
            return False
    
    def discard_post(self, post_id: int) -> bool:
        """Delete post from temp directory"""
        if not self.temp_path:
            logger.error("Temp path not configured")
            return False
        
        json_path = os.path.join(self.temp_path, f"{post_id}.json")
        if not os.path.exists(json_path):
            logger.error(f"Post {post_id} not found")
            return False
        
        try:
            # Load post data to get file path
            with open(json_path, 'r') as f:
                post_data = json.load(f)
            
            # Delete media file with retry logic
            file_path = post_data.get("file_path")
            if file_path and os.path.exists(file_path):
                # Try multiple times with increasing delay
                deleted = False
                for attempt in range(3):
                    try:
                        os.remove(file_path)
                        deleted = True
                        break
                    except PermissionError:
                        if attempt < 2:
                            logger.warning(f"File locked, retrying... (attempt {attempt + 1}/3)")
                            time.sleep(0.5 * (attempt + 1))
                        else:
                            logger.error(f"Failed to delete file after 3 attempts: {file_path}")
                            return False
                
                if deleted:
                    # Delete thumbnail if exists (best effort)
                    try:
                        thumb_path = os.path.join(self.temp_path, '.thumbnails', f"{post_id}_thumb.jpg")
                        if os.path.exists(thumb_path):
                            os.remove(thumb_path)
                            logger.debug(f"Deleted thumbnail for post {post_id}")
                    except Exception as thumb_error:
                        logger.warning(f"Failed to delete thumbnail for post {post_id}: {thumb_error}")
            
            # Delete JSON
            os.remove(json_path)
            
            logger.info(f"Discarded post {post_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to discard post {post_id}: {e}")
            return False
        
    def delete_saved_post(self, post_id: int, date_folder: str) -> bool:
        """Delete post from save directory"""
        if not self.save_path:
            logger.error("Save path not configured")
            return False
        
        folder_path = os.path.join(self.save_path, date_folder)
        json_path = os.path.join(folder_path, f"{post_id}.json")
        
        if not os.path.exists(json_path):
            logger.error(f"Post {post_id} not found in {date_folder}")
            return False
        
        try:
            # Load post data
            with open(json_path, 'r') as f:
                post_data = json.load(f)
            
            # Delete media file with retry logic
            file_ext = post_data.get('file_type', '.jpg')
            file_path = os.path.join(folder_path, f"{post_id}{file_ext}")
            
            if os.path.exists(file_path):
                # Try multiple times
                deleted = False
                for attempt in range(3):
                    try:
                        os.remove(file_path)
                        deleted = True
                        break
                    except PermissionError:
                        if attempt < 2:
                            logger.warning(f"File locked, retrying... (attempt {attempt + 1}/3)")
                            time.sleep(0.5 * (attempt + 1))
                        else:
                            logger.error(f"Failed to delete file after 3 attempts: {file_path}")
                            return False
                
                if deleted:
                    # Delete thumbnail if exists (best effort)
                    try:
                        thumb_path = os.path.join(folder_path, '.thumbnails', f"{post_id}_thumb.jpg")
                        if os.path.exists(thumb_path):
                            os.remove(thumb_path)
                            logger.debug(f"Deleted thumbnail for post {post_id}")
                    except Exception as thumb_error:
                        logger.warning(f"Failed to delete thumbnail for post {post_id}: {thumb_error}")
            
            # Delete JSON
            os.remove(json_path)
            
            logger.info(f"Deleted saved post {post_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete saved post {post_id}: {e}")
            return False

    def get_file_size(self, post_id: int) -> int:
        """Get file size for a post"""
        # Check temp directory
        if self.temp_path and os.path.exists(self.temp_path):
            for filename in os.listdir(self.temp_path):
                if filename.startswith(str(post_id)) and not filename.endswith('.json'):
                    file_path = os.path.join(self.temp_path, filename)
                    return os.path.getsize(file_path)
        
        # Check save directory
        if self.save_path and os.path.exists(self.save_path):
            for date_folder in os.listdir(self.save_path):
                folder_path = os.path.join(self.save_path, date_folder)
                if not os.path.isdir(folder_path):
                    continue
                
                for filename in os.listdir(folder_path):
                    if filename.startswith(str(post_id)) and not filename.endswith('.json'):
                        file_path = os.path.join(folder_path, filename)
                        return os.path.getsize(file_path)
        
        return 0