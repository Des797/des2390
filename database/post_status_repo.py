from typing import Optional
from datetime import datetime
import logging
import time

logger = logging.getLogger(__name__)


class PostStatusRepository:
    def __init__(self, core):
        self.core = core
        logger.info("PostStatusRepository initialized")

    # Post status operations
    def get_post_status(self, post_id: int) -> Optional[str]:
        """Get status of a post"""
        try:
            with self.core.get_connection() as conn:
                cursor = conn.execute("SELECT status FROM processed_posts WHERE post_id=?", (post_id,))
                result = cursor.fetchone()
                return result[0] if result else None
        except Exception as e:
            logger.error(f"Failed to get status for post {post_id}: {e}", exc_info=True)
            return None

    def set_post_status(self, post_id: int, status: str):
        """Set status of a post with retry logic for locked database"""
        max_retries = 5
        retry_delay = 0.1
        
        for attempt in range(max_retries):
            try:
                with self.core.get_connection() as conn:
                    conn.execute(
                        "INSERT OR REPLACE INTO processed_posts (post_id, status, timestamp) VALUES (?, ?, ?)",
                        (post_id, status, datetime.now().isoformat())
                    )
                    # No need to call commit() in autocommit mode (isolation_level=None)
                    # But keeping it doesn't hurt and maintains compatibility
                    conn.commit()
                return  # Success - exit function
            except Exception as e:
                error_msg = str(e)
                if "database is locked" in error_msg and attempt < max_retries - 1:
                    logger.warning(
                        f"Database locked on set_post_status for post {post_id}, "
                        f"retry {attempt + 1}/{max_retries}"
                    )
                    time.sleep(retry_delay * (2 ** attempt))  # Exponential backoff
                    continue
                else:
                    logger.error(
                        f"Failed to set status '{status}' for post {post_id} "
                        f"after {attempt + 1} attempts: {e}", 
                        exc_info=True
                    )
                    break  # Give up after max retries or non-lock error

    # Elasticsearch operations
    def is_post_indexed(self, post_id: int) -> bool:
        """Check if post is indexed in Elasticsearch"""
        try:
            with self.core.get_connection() as conn:
                cursor = conn.execute("SELECT indexed FROM elasticsearch_posts WHERE post_id=?", (post_id,))
                result = cursor.fetchone()
                return result is not None
        except Exception as e:
            logger.error(f"Failed to check if post {post_id} is indexed: {e}", exc_info=True)
            return False

    def mark_post_indexed(self, post_id: int):
        """Mark post as indexed in Elasticsearch with retry logic"""
        max_retries = 5
        retry_delay = 0.1
        
        for attempt in range(max_retries):
            try:
                with self.core.get_connection() as conn:
                    conn.execute(
                        "INSERT OR REPLACE INTO elasticsearch_posts (post_id, indexed) VALUES (?, ?)",
                        (post_id, 1)
                    )
                    conn.commit()
                return  # Success
            except Exception as e:
                error_msg = str(e)
                if "database is locked" in error_msg and attempt < max_retries - 1:
                    logger.warning(
                        f"Database locked on mark_post_indexed for post {post_id}, "
                        f"retry {attempt + 1}/{max_retries}"
                    )
                    time.sleep(retry_delay * (2 ** attempt))
                    continue
                else:
                    logger.error(
                        f"Failed to mark post {post_id} as indexed "
                        f"after {attempt + 1} attempts: {e}", 
                        exc_info=True
                    )
                    break