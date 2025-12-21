import sqlite3
import logging

logger = logging.getLogger(__name__)

def init_schema(core):
    """Initialize database schema with tables and indexes"""
    try:
        with core.get_connection() as conn:
            c = conn.cursor()

            # ---- TABLES ----
            c.execute("""CREATE TABLE IF NOT EXISTS processed_posts (
                post_id INTEGER PRIMARY KEY,
                status TEXT,
                timestamp TEXT
            )""")

            c.execute("""CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT
            )""")

            c.execute("""CREATE TABLE IF NOT EXISTS elasticsearch_posts (
                post_id INTEGER PRIMARY KEY,
                indexed BOOLEAN
            )""")

            c.execute("""CREATE TABLE IF NOT EXISTS search_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tags TEXT,
                timestamp TEXT
            )""")

            c.execute("""CREATE TABLE IF NOT EXISTS tag_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER,
                old_tags TEXT,
                new_tags TEXT,
                timestamp TEXT
            )""")

            c.execute("""CREATE TABLE IF NOT EXISTS tag_counts (
                tag TEXT PRIMARY KEY,
                count INTEGER DEFAULT 0
            )""")

            c.execute("""CREATE TABLE IF NOT EXISTS post_cache (
                post_id INTEGER PRIMARY KEY,
                status TEXT,
                title TEXT,
                owner TEXT,
                score INTEGER,
                rating TEXT,
                width INTEGER,
                height INTEGER,
                file_type TEXT,
                tags TEXT,
                date_folder TEXT,
                timestamp REAL,
                file_path TEXT,
                downloaded_at TEXT,
                created_at TEXT,
                duration REAL
            )""")
            
            c.execute("""CREATE VIRTUAL TABLE IF NOT EXISTS post_search_fts 
                         USING fts5(post_id UNINDEXED, owner, title, tags, 
                                   content='post_cache', content_rowid='post_id')""")
            
            c.execute("""CREATE TRIGGER IF NOT EXISTS post_cache_ai AFTER INSERT ON post_cache BEGIN
                INSERT INTO post_search_fts(post_id, owner, title, tags) 
                VALUES (new.post_id, new.owner, new.title, new.tags);
            END""")
            
            c.execute("""CREATE TRIGGER IF NOT EXISTS post_cache_ad AFTER DELETE ON post_cache BEGIN
                DELETE FROM post_search_fts WHERE post_id = old.post_id;
            END""")
            
            c.execute("""CREATE TRIGGER IF NOT EXISTS post_cache_au AFTER UPDATE ON post_cache BEGIN
                DELETE FROM post_search_fts WHERE post_id = old.post_id;
                INSERT INTO post_search_fts(post_id, owner, title, tags) 
                VALUES (new.post_id, new.owner, new.title, new.tags);
            END""")
            
            # Add duration column if it doesn't exist (migration)
            try:
                c.execute("SELECT duration FROM post_cache LIMIT 1")
            except sqlite3.OperationalError:
                logger.info("Adding duration column to post_cache table...")
                c.execute("ALTER TABLE post_cache ADD COLUMN duration REAL")
                logger.info("Duration column added successfully")

            # ---- INDEXES ----
            indexes = [
                "CREATE INDEX IF NOT EXISTS idx_status_timestamp ON post_cache(status, timestamp DESC)",
                "CREATE INDEX IF NOT EXISTS idx_status_score ON post_cache(status, score DESC)",
                "CREATE INDEX IF NOT EXISTS idx_owner_status ON post_cache(owner, status)",
                "CREATE INDEX IF NOT EXISTS idx_rating_status ON post_cache(rating, status)",
                "CREATE INDEX IF NOT EXISTS idx_status ON post_cache(status)",
                "CREATE INDEX IF NOT EXISTS idx_timestamp ON post_cache(timestamp)",
                "CREATE INDEX IF NOT EXISTS idx_score ON post_cache(score)",
                "CREATE INDEX IF NOT EXISTS idx_owner ON post_cache(owner)",
                "CREATE INDEX IF NOT EXISTS idx_file_type ON post_cache(file_type)",
                "CREATE INDEX IF NOT EXISTS idx_dimensions ON post_cache(width, height)",
                "CREATE INDEX IF NOT EXISTS idx_tag_count ON tag_counts(count DESC)",
                "CREATE INDEX IF NOT EXISTS idx_search_timestamp ON search_history(timestamp DESC)",
                "CREATE INDEX IF NOT EXISTS idx_tag_history_post ON tag_history(post_id)",
                "CREATE INDEX IF NOT EXISTS idx_tag_history_timestamp ON tag_history(timestamp DESC)",
                "CREATE INDEX IF NOT EXISTS idx_owner_text ON post_cache(owner COLLATE NOCASE)",
                "CREATE INDEX IF NOT EXISTS idx_title_text ON post_cache(title COLLATE NOCASE)",
                "CREATE INDEX IF NOT EXISTS idx_created_at ON post_cache(created_at DESC)",
                "CREATE INDEX IF NOT EXISTS idx_downloaded_at ON post_cache(downloaded_at DESC)",
            ]

            for idx_query in indexes:
                c.execute(idx_query)

            conn.commit()
            logger.info("Database schema initialized successfully")

    except Exception as e:
        logger.error(f"Failed to initialize database schema: {e}", exc_info=True)
