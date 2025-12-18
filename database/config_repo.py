from typing import Optional
import logging

logger = logging.getLogger(__name__)

class ConfigRepository:
    def __init__(self, core):
        self.core = core
        logger.info("ConfigRepository initialized")

    def save_config(self, key: str, value: str):
        """Save configuration value"""
        try:
            with self.core.get_connection() as conn:
                c = conn.cursor()
                c.execute(
                    "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
                    (key, value)
                )
                conn.commit()
            logger.debug(f"Saved config: {key}={value}")
        except Exception as e:
            logger.error(f"Failed to save config '{key}': {e}", exc_info=True)

    def load_config(self, key: str, default=None) -> Optional[str]:
        """Load configuration value"""
        try:
            with self.core.get_connection() as conn:
                c = conn.cursor()
                c.execute("SELECT value FROM config WHERE key=?", (key,))
                result = c.fetchone()
            if result:
                logger.debug(f"Loaded config: {key}={result[0]}")
            else:
                logger.debug(f"Config '{key}' not found, returning default")
            return result[0] if result else default
        except Exception as e:
            logger.error(f"Failed to load config '{key}': {e}", exc_info=True)
            return default
