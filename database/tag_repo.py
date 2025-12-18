import json
from datetime import datetime
from typing import List, Dict, Any
import logging
import os

logger = logging.getLogger(__name__)

class TagRepository:
    def __init__(self, core):
        self.core = core

    # Tag history operations
    def add_tag_history(self, post_id: int, old_tags: List[str], new_tags: List[str]):
        """Add tag edit to history"""
        try:
            with self.core.get_connection() as conn:
                conn.execute(
                    """INSERT INTO tag_history (post_id, old_tags, new_tags, timestamp) 
                       VALUES (?, ?, ?, ?)""",
                    (post_id, json.dumps(old_tags), json.dumps(new_tags), datetime.now().isoformat())
                )
            logger.info(f"Tag history added for post {post_id}")
        except Exception as e:
            logger.error(f"Failed to add tag history for post {post_id}: {e}", exc_info=True)

    def get_tag_history(self, limit: int = 100, page: int = 1) -> Dict[str, Any]:
        """Get tag edit history with pagination"""
        try:
            offset = (page - 1) * limit
            with self.core.get_connection() as conn:
                cursor = conn.execute(
                    """SELECT post_id, old_tags, new_tags, timestamp 
                       FROM tag_history ORDER BY timestamp DESC LIMIT ? OFFSET ?""",
                    (limit, offset)
                )
                results = cursor.fetchall()
                cursor_total = conn.execute("SELECT COUNT(*) FROM tag_history")
                total = cursor_total.fetchone()[0]

            return {
                "items": [
                    {
                        "post_id": r[0],
                        "old_tags": json.loads(r[1]),
                        "new_tags": json.loads(r[2]),
                        "timestamp": r[3]
                    } for r in results
                ],
                "total": total
            }
        except Exception as e:
            logger.error(f"Failed to get tag history: {e}", exc_info=True)
            return {"items": [], "total": 0}

    def update_tag_counts(self, tags: List[str], increment: bool = True):
        """Update counts for multiple tags"""
        try:
            with self.core.get_connection() as conn:
                with conn:
                    for tag in tags:
                        if increment:
                            conn.execute(
                                """INSERT INTO tag_counts (tag, count) VALUES (?, 1)
                                   ON CONFLICT(tag) DO UPDATE SET count = count + 1""",
                                (tag,)
                            )
                        else:
                            conn.execute(
                                """UPDATE tag_counts SET count = count - 1 
                                   WHERE tag = ? AND count > 0""",
                                (tag,)
                            )
        except Exception as e:
            logger.error(f"Failed to update tag counts: {e}", exc_info=True)

    def get_tag_count(self, tag: str) -> int:
        """Get count for a specific tag"""
        try:
            with self.core.get_connection() as conn:
                cursor = conn.execute("SELECT count FROM tag_counts WHERE tag=?", (tag,))
                result = cursor.fetchone()
                return result[0] if result else 0
        except Exception as e:
            logger.error(f"Failed to get tag count for {tag}: {e}", exc_info=True)
            return 0

    def get_all_tag_counts(self) -> Dict[str, int]:
        """Get all tag counts as a dictionary"""
        try:
            with self.core.get_connection() as conn:
                cursor = conn.execute("SELECT tag, count FROM tag_counts")
                results = cursor.fetchall()
                return {r[0]: r[1] for r in results}
        except Exception as e:
            logger.error(f"Failed to get all tag counts: {e}", exc_info=True)
            return {}

    def _count_tags_in_directory(self, path: str, tag_counts: Dict[str, int]):
        """Helper to count tags in all JSON files in a directory"""
        if not path or not os.path.exists(path):
            return
        for root, _, files in os.walk(path):
            for filename in files:
                if not filename.endswith(".json"):
                    continue
                json_path = os.path.join(root, filename)
                try:
                    with open(json_path, 'r', encoding='utf-8') as f:
                        post_data = json.load(f)
                        for tag in post_data.get('tags', []):
                            tag_counts[tag] = tag_counts.get(tag, 0) + 1
                except Exception as e:
                    logger.warning(f"Failed to read {json_path}: {e}", exc_info=True)

    def rebuild_tag_counts(self, temp_path: str, save_path: str):
        """Rebuild tag counts from all posts (maintenance operation)"""
        logger.info("Rebuilding tag counts...")
        tag_counts: Dict[str, int] = {}

        # Count tags in both directories
        self._count_tags_in_directory(temp_path, tag_counts)
        self._count_tags_in_directory(save_path, tag_counts)

        try:
            with self.core.get_connection() as conn:
                conn.execute("DELETE FROM tag_counts")
                for tag, count in tag_counts.items():
                    conn.execute("INSERT INTO tag_counts (tag, count) VALUES (?, ?)", (tag, count))
            logger.info(f"Rebuilt {len(tag_counts)} tag counts")
        except Exception as e:
            logger.error(f"Failed to rebuild tag counts: {e}", exc_info=True)
