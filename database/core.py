import sqlite3
import logging
from .schema import init_schema

logger = logging.getLogger(__name__)

class DatabaseCore:
    def __init__(self, db_path: str = "rule34_scraper.db"):
        self.db_path = db_path
        try:
            self.init_db()
        except Exception as e:
            logger.exception(f"Failed to initialize database at {db_path}: {e}")

    def get_connection(self):
        """Get a database connection"""
        try:
            return sqlite3.connect(self.db_path)
        except sqlite3.Error as e:
            logger.exception(f"Failed to connect to database {self.db_path}: {e}")
            raise

    def init_db(self):
        """Initialize database using schema module"""
        logger.info("Initializing database...")
        try:
            init_schema(self)
        except Exception as e:
            logger.exception(f"Failed to initialize schema: {e}")
            raise

    def log_index_stats(self):
        """Log SQLite index information for diagnostics"""
        try:
            with self.get_connection() as conn:
                c = conn.cursor()
                try:
                    c.execute("""
                        SELECT name, tbl_name
                        FROM sqlite_master
                        WHERE type = 'index'
                          AND name NOT LIKE 'sqlite_%'
                        ORDER BY tbl_name, name
                    """)
                    indexes = c.fetchall()

                    logger.info("SQLite index statistics:")
                    for name, table in indexes:
                        logger.info(f"  Index: {name} (table: {table})")
                finally:
                    c.close()

        except Exception as e:
            logger.warning(f"Failed to log index stats: {e}")
