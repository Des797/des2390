import json
from datetime import datetime
from typing import Optional, List, Dict, Any
import logging
import sqlite3
import time
from query_translator import get_query_translator

logger = logging.getLogger(__name__)

class PostCacheRepository:
    def __init__(self, core):
        self.core = core

    def cache_post(self, post_data: Dict[str, Any]) -> bool:
        """Cache a single post (incremental update)"""
        try:
            with self.core.get_connection() as conn:
                with conn:
                    conn.execute(
                        """INSERT OR REPLACE INTO post_cache 
                           (post_id, status, title, owner, score, rating, 
                            width, height, file_type, tags, date_folder, 
                            timestamp, file_path, downloaded_at, created_at, duration, file_size)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            post_data['id'],
                            post_data.get('status', 'pending'),
                            post_data.get('title', ''),
                            post_data.get('owner', ''),
                            post_data.get('score', 0),
                            post_data.get('rating', ''),
                            post_data.get('width', 0),
                            post_data.get('height', 0),
                            post_data.get('file_type', ''),
                            json.dumps(post_data.get('tags', [])),
                            post_data.get('date_folder', ''),
                            post_data.get('timestamp', 0),
                            post_data.get('file_path', ''),
                            post_data.get('downloaded_at', ''),
                            post_data.get('created_at', ''),
                            post_data.get('duration', None),
                            post_data.get('file_size', None)
                        )
                    )
            logger.info(f"Cached post {post_data['id']}")
            return True
        except Exception as e:
            logger.error(f"Failed to cache post {post_data.get('id')}: {e}", exc_info=True)
            return False

    def remove_from_cache(self, post_id: int) -> bool:
        """Remove a single post from cache"""
        try:
            with self.core.get_connection() as conn:
                with conn:
                    conn.execute("DELETE FROM post_cache WHERE post_id = ?", (post_id,))
            logger.debug(f"Removed post {post_id} from cache")
            return True
        except Exception as e:
            logger.error(f"Failed to remove post {post_id} from cache: {e}", exc_info=True)
            return False

    def update_post_status(self, post_id: int, status: str, date_folder: str = None) -> bool:
        """Update post status in cache (pending -> saved) with retry logic"""
        max_retries = 5
        retry_delay = 0.2
        
        for attempt in range(max_retries):
            try:
                with self.core.get_connection() as conn:
                    # Check if database is accessible first
                    try:
                        conn.execute("SELECT 1").fetchone()
                    except sqlite3.DatabaseError as db_err:
                        if "malformed" in str(db_err).lower():
                            logger.error(f"Database corruption detected: {db_err}")
                            logger.error("Please run database repair: VACUUM or restore from backup")
                            return False
                        raise
                    
                    with conn:
                        if date_folder:
                            conn.execute(
                                "UPDATE post_cache SET status = ?, date_folder = ? WHERE post_id = ?",
                                (status, date_folder, post_id)
                            )
                        else:
                            conn.execute(
                                "UPDATE post_cache SET status = ? WHERE post_id = ?",
                                (status, post_id)
                            )
                logger.debug(f"Updated post {post_id} status to {status}")
                return True
                
            except sqlite3.DatabaseError as e:
                error_msg = str(e)
                if "malformed" in error_msg.lower():
                    logger.error(f"CRITICAL: Database file is corrupted: {error_msg}")
                    logger.error("Action required: Run VACUUM or restore from backup")
                    return False
                    
                if attempt < max_retries - 1:
                    logger.warning(f"Database error on attempt {attempt + 1}/{max_retries}: {error_msg}")
                    time.sleep(retry_delay * (2 ** attempt))
                    continue
                else:
                    logger.error(f"Failed to update post {post_id} after {max_retries} attempts: {e}", exc_info=True)
                    return False
                    
            except Exception as e:
                logger.error(f"Unexpected error updating post {post_id} status: {e}", exc_info=True)
                return False
        
        return False

    def get_cached_posts(
        self, 
        status: Optional[str] = None,
        limit: int = 1000,
        offset: int = 0,
        sort_by: str = 'timestamp',
        order: str = 'DESC',
        search_query: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get posts from cache with SERVER-SIDE pagination, sorting, and ADVANCED query search
        
        Args:
            status: Filter by status (pending/saved/None for all)
            limit: Number of posts to return
            offset: Starting position
            sort_by: Column to sort by (timestamp, score, post_id, owner, width, height, created_at)
            order: Sort order (ASC/DESC)
            search_query: Advanced query with full frontend syntax support
        """
        try:
            logger.info(f"[PostCacheRepository] get_cached_posts called with search_query='{search_query}'")
            translator = get_query_translator()
            
            with self.core.get_connection() as conn:
                # Translate advanced query to SQL
                if search_query and search_query.strip():
                    logger.info(f"[PostCacheRepository] Using QueryTranslator for search_query: '{search_query}'")
                    where_clause, params = translator.translate(search_query, status)
                    query = f"SELECT * FROM post_cache WHERE {where_clause}"
                    logger.info(f"[PostCacheRepository] Generated SQL: {query}")
                    logger.info(f"[PostCacheRepository] Params: {params}")
                else:
                    logger.info(f"[PostCacheRepository] No search query, using simple status filter")
                    # No search query
                    if status:
                        query = "SELECT * FROM post_cache WHERE status = ?"
                        params = [status]
                    else:
                        query = "SELECT * FROM post_cache WHERE 1=1"
                        params = []

                # Validate sort column
                valid_sorts = {
                    'timestamp': 'timestamp',
                    'download': 'downloaded_at',
                    'upload': 'created_at',
                    'score': 'score',
                    'post_id': 'post_id',
                    'id': 'post_id',
                    'owner': 'owner',
                    'width': 'width',
                    'height': 'height',
                    'tags': 'tags'
                }
                
                sort_column = valid_sorts.get(sort_by, 'timestamp')
                order = 'DESC' if order.upper() == 'DESC' else 'ASC'
                
                # Special handling for tag count sorting
                if sort_by == 'tags':
                    query += f" ORDER BY (length(tags) - length(replace(tags, ',', ''))) {order}"
                else:
                    query += f" ORDER BY {sort_column} {order}"
                
                # Add pagination
                query += " LIMIT ? OFFSET ?"
                params.extend([limit, offset])

                logger.debug(f"Advanced Query SQL: {query}")
                logger.debug(f"Params: {params}")

                cursor = conn.execute(query, params)
                rows = cursor.fetchall()

            # Convert rows to dicts
            posts = []
            for row in rows:
                posts.append({
                    'id': row[0],
                    'status': row[1],
                    'title': row[2],
                    'owner': row[3],
                    'score': row[4],
                    'rating': row[5],
                    'width': row[6],
                    'height': row[7],
                    'file_type': row[8],
                    'tags': json.loads(row[9]) if row[9] else [],
                    'date_folder': row[10],
                    'timestamp': row[11],
                    'file_path': row[12],
                    'downloaded_at': row[13],
                    'created_at': row[14],
                    'duration': row[15] if len(row) > 15 else None,
                    'file_size': row[16] if len(row) > 16 else None
                })
            
            logger.info(f"[PostCacheRepository] Returning {len(posts)} posts")
            return posts
        except Exception as e:
            logger.error(f"Failed to get cached posts: {e}", exc_info=True)
            return []

    def get_cache_count(self, status: Optional[str] = None, search_query: Optional[str] = None) -> int:
        """
        Get total count of cached posts with optional filters using QueryTranslator
        
        Args:
            status: Filter by status
            search_query: Advanced query string (uses full translator)
        """
        try:
            from query_translator import get_query_translator
            translator = get_query_translator()
            
            with self.core.get_connection() as conn:
                # Use translator if search query exists
                if search_query and search_query.strip():
                    where_clause, params = translator.translate(search_query, status)
                    query = f"SELECT COUNT(*) FROM post_cache WHERE {where_clause}"
                else:
                    # Simple status filter
                    if status:
                        query = "SELECT COUNT(*) FROM post_cache WHERE status = ?"
                        params = [status]
                    else:
                        query = "SELECT COUNT(*) FROM post_cache"
                        params = []
                
                cursor = conn.execute(query, params)
                count = cursor.fetchone()[0]
                logger.info(f"[PostCacheRepository] Count query returned: {count}")
                return count
        except Exception as e:
            logger.error(f"Failed to get cache count: {e}", exc_info=True)
            return 0

    def is_cache_empty(self) -> bool:
        """Check if cache is empty"""
        try:
            return self.get_cache_count() == 0
        except Exception as e:
            logger.error(f"Failed to check if cache is empty: {e}", exc_info=True)
            return True

    def rebuild_cache_from_files(self, file_manager) -> bool:
        """Rebuild the entire cache from file_manager with progress logging"""
        logger.info("Starting full cache rebuild...")
        start_time = datetime.now()
        try:
            # Clear existing cache first
            with self.core.get_connection() as conn:
                with conn:
                    conn.execute("DELETE FROM post_cache")

            pending = file_manager.get_pending_posts()
            saved = file_manager.get_saved_posts()
            all_posts = pending + saved
            total = len(all_posts)

            logger.info(f"Caching {total} posts...")
            
            # Calculate progress milestones (every 10%)
            milestones = set()
            for pct in range(10, 100, 10):
                milestones.add(int(total * pct / 100))
            
            for i, post in enumerate(all_posts):
                self.cache_post(post)
                
                # Log at 10% intervals
                if (i + 1) in milestones:
                    percentage = int(((i + 1) / total) * 100)
                    elapsed = (datetime.now() - start_time).total_seconds()
                    rate = (i + 1) / elapsed if elapsed > 0 else 0
                    remaining = (total - (i + 1)) / rate if rate > 0 else 0
                    
                    logger.info(
                        f"Cache rebuild progress: {percentage}% "
                        f"({i + 1}/{total} posts, "
                        f"{rate:.1f} posts/sec, "
                        f"~{remaining:.0f}s remaining)"
                    )

            elapsed = (datetime.now() - start_time).total_seconds()
            logger.info(f"Cache rebuild complete: {total} posts in {elapsed:.2f}s ({total/elapsed:.1f} posts/sec)")
            return True
        except Exception as e:
            logger.error(f"Cache rebuild failed: {e}", exc_info=True)
            return False