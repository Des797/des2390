import sqlite3
import logging
import threading
from contextlib import contextmanager
from .schema import init_schema

logger = logging.getLogger(__name__)

class DatabaseCore:
    def __init__(self, db_path: str = "rule34_scraper.db"):
        self.db_path = db_path
        self.local = threading.local()
        self._lock = threading.Lock()
        
        try:
            self.init_db()
        except Exception as e:
            logger.exception(f"Failed to initialize database at {db_path}: {e}")

    def _get_connection(self):
        """Get thread-local connection with optimized settings"""
        if not hasattr(self.local, 'connection') or self.local.connection is None:
            try:
                # Create connection with increased timeout and thread safety
                conn = sqlite3.connect(
                    self.db_path,
                    timeout=30.0,  # Increased timeout for locked database
                    check_same_thread=False,
                    isolation_level=None  # Autocommit mode for faster writes
                )
                
                # Enable WAL mode for better concurrent access
                conn.execute("PRAGMA journal_mode=WAL")
                
                # Optimize for performance
                conn.execute("PRAGMA synchronous=NORMAL")  # Faster than FULL, still safe
                conn.execute("PRAGMA cache_size=10000")  # 10MB cache
                conn.execute("PRAGMA temp_store=MEMORY")
                
                # Enable foreign keys
                conn.execute("PRAGMA foreign_keys=ON")
                
                self.local.connection = conn
                logger.debug(f"Created new database connection for thread {threading.current_thread().name}")
            except sqlite3.Error as e:
                logger.exception(f"Failed to connect to database {self.db_path}: {e}")
                raise
        
        return self.local.connection

    @contextmanager
    def get_connection(self):
        """Context manager for database connections with automatic retry on lock"""
        max_retries = 3
        retry_delay = 0.1
        
        for attempt in range(max_retries):
            try:
                conn = self._get_connection()
                yield conn
                return
            except sqlite3.OperationalError as e:
                if "database is locked" in str(e) and attempt < max_retries - 1:
                    logger.warning(f"Database locked, retry {attempt + 1}/{max_retries}")
                    import time
                    time.sleep(retry_delay * (2 ** attempt))  # Exponential backoff
                    continue
                else:
                    logger.error(f"Database error after {attempt + 1} attempts: {e}")
                    raise
            except Exception as e:
                logger.exception(f"Unexpected database error: {e}")
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
    
    def close_all_connections(self):
        """Close all thread-local connections (call on shutdown)"""
        if hasattr(self.local, 'connection') and self.local.connection:
            try:
                self.local.connection.close()
                self.local.connection = None
                logger.debug("Closed database connection")
            except Exception as e:
                logger.error(f"Error closing connection: {e}")
    
    def vacuum(self):
        """Vacuum the database to reclaim space and optimize"""
        try:
            with self.get_connection() as conn:
                logger.info("Running VACUUM on database...")
                conn.execute("VACUUM")
                logger.info("VACUUM completed")
        except Exception as e:
            logger.error(f"VACUUM failed: {e}")
    
    def checkpoint(self):
        """Checkpoint the WAL file"""
        try:
            with self.get_connection() as conn:
                conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                logger.debug("WAL checkpoint completed")
        except Exception as e:
            logger.error(f"Checkpoint failed: {e}")