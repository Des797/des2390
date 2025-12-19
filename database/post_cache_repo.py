import json
from datetime import datetime
from typing import Optional, List, Dict, Any
import logging

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
                            timestamp, file_path, downloaded_at, created_at, duration)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
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
                            post_data.get('duration', None)  # Add duration
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
        """Update post status in cache (pending -> saved)"""
        try:
            with self.core.get_connection() as conn:
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
        except Exception as e:
            logger.error(f"Failed to update post {post_id} status: {e}", exc_info=True)
            return False

    def get_cached_posts(
        self, 
        status: Optional[str] = None,
        limit: int = 1000,
        offset: int = 0,
        sort_by: str = 'timestamp',
        order: str = 'DESC'
    ) -> List[Dict[str, Any]]:
        """Get posts from cache with pagination and sorting"""
        try:
            with self.core.get_connection() as conn:
                query = "SELECT * FROM post_cache"
                params = []

                if status:
                    query += " WHERE status = ?"
                    params.append(status)

                valid_sorts = ['timestamp', 'score', 'post_id', 'owner', 'width', 'height']
                if sort_by not in valid_sorts:
                    sort_by = 'timestamp'

                query += f" ORDER BY {sort_by} {order} LIMIT ? OFFSET ?"
                params.extend([limit, offset])

                cursor = conn.execute(query, params)
                rows = cursor.fetchall()

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
                    'duration': row[15] if len(row) > 15 else None
                })
            return posts
        except Exception as e:
            logger.error(f"Failed to get cached posts: {e}", exc_info=True)
            return []

    def get_cache_count(self, status: Optional[str] = None) -> int:
        """Get total count of cached posts"""
        try:
            with self.core.get_connection() as conn:
                with conn:
                    if status:
                        cursor = conn.execute("SELECT COUNT(*) FROM post_cache WHERE status = ?", (status,))
                    else:
                        cursor = conn.execute("SELECT COUNT(*) FROM post_cache")
                    return cursor.fetchone()[0]
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

    # ---------------- Full Cache Rebuild ----------------
    def rebuild_cache_from_files(self, file_manager) -> bool:
        """Rebuild the entire cache from file_manager"""
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

            logger.info(f"Caching {len(all_posts)} posts...")
            for i, post in enumerate(all_posts):
                self.cache_post(post)
                if (i + 1) % 1000 == 0:
                    logger.info(f"Cached {i + 1}/{len(all_posts)} posts...")

            elapsed = (datetime.now() - start_time).total_seconds()
            logger.info(f"Cache rebuild complete: {len(all_posts)} posts in {elapsed:.2f}s")
            return True
        except Exception as e:
            logger.error(f"Cache rebuild failed: {e}", exc_info=True)
            return False

