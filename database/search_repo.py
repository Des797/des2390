from datetime import datetime
from typing import List, Dict
import logging

logger = logging.getLogger(__name__)


class SearchHistoryRepository:
    def __init__(self, core):
        self.core = core
        logger.info("SearchHistoryRepository initialized")

    def add_search_history(self, tags: str):
        """Add search to history"""
        if not tags.strip():
            return
        try:
            with self.core.get_connection() as conn:
                c = conn.cursor()
                try:
                    c.execute(
                        "INSERT INTO search_history (tags, timestamp) VALUES (?, ?)",
                        (tags, datetime.now().isoformat())
                    )
                    conn.commit()
                finally:
                    c.close()
        except Exception as e:
            logger.error(f"Failed to add search history for tags '{tags}': {e}", exc_info=True)

    def get_search_history(self, limit: int = 10) -> List[Dict[str, str]]:
        """Get recent search history"""
        try:
            with self.core.get_connection() as conn:
                c = conn.cursor()
                try:
                    c.execute(
                        "SELECT tags, timestamp FROM search_history ORDER BY timestamp DESC LIMIT ?",
                        (limit,)
                    )
                    results = c.fetchall()
                finally:
                    c.close()
            return [{"tags": r[0], "timestamp": r[1]} for r in results]
        except Exception as e:
            logger.error(f"Failed to fetch search history: {e}", exc_info=True)
            return []
