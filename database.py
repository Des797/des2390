import sqlite3
import json
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

class Database:
    def __init__(self, db_path: str = "rule34_scraper.db"):
        self.db_path = db_path
        self.init_db()
    
    def get_connection(self):
        """Get a database connection"""
        return sqlite3.connect(self.db_path)
    
    def init_db(self):
        """Initialize database tables"""
        logger.info("Initializing database...")
        conn = self.get_connection()
        c = conn.cursor()
        
        # Core tables
        c.execute("""CREATE TABLE IF NOT EXISTS processed_posts
                     (post_id INTEGER PRIMARY KEY, status TEXT, timestamp TEXT)""")
        
        c.execute("""CREATE TABLE IF NOT EXISTS config
                     (key TEXT PRIMARY KEY, value TEXT)""")
        
        c.execute("""CREATE TABLE IF NOT EXISTS elasticsearch_posts
                     (post_id INTEGER PRIMARY KEY, indexed BOOLEAN)""")
        
        c.execute("""CREATE TABLE IF NOT EXISTS search_history
                     (id INTEGER PRIMARY KEY AUTOINCREMENT, tags TEXT, timestamp TEXT)""")
        
        c.execute("""CREATE TABLE IF NOT EXISTS tag_history
                     (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER, 
                      old_tags TEXT, new_tags TEXT, timestamp TEXT)""")
        
        # New table for tag counts
        c.execute("""CREATE TABLE IF NOT EXISTS tag_counts
                     (tag TEXT PRIMARY KEY, count INTEGER DEFAULT 0)""")
        
        conn.commit()
        conn.close()
        logger.info("Database initialized successfully")
    
    # Config operations
    def save_config(self, key: str, value: str):
        """Save configuration value"""
        conn = self.get_connection()
        c = conn.cursor()
        c.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", (key, value))
        conn.commit()
        conn.close()
    
    def load_config(self, key: str, default=None) -> Optional[str]:
        """Load configuration value"""
        conn = self.get_connection()
        c = conn.cursor()
        c.execute("SELECT value FROM config WHERE key=?", (key,))
        result = c.fetchone()
        conn.close()
        return result[0] if result else default
    
    # Post status operations
    def get_post_status(self, post_id: int) -> Optional[str]:
        """Get status of a post"""
        conn = self.get_connection()
        c = conn.cursor()
        c.execute("SELECT status FROM processed_posts WHERE post_id=?", (post_id,))
        result = c.fetchone()
        conn.close()
        return result[0] if result else None
    
    def set_post_status(self, post_id: int, status: str):
        """Set status of a post"""
        conn = self.get_connection()
        c = conn.cursor()
        c.execute("INSERT OR REPLACE INTO processed_posts (post_id, status, timestamp) VALUES (?, ?, ?)",
                  (post_id, status, datetime.now().isoformat()))
        conn.commit()
        conn.close()
    
    # Elasticsearch operations
    def is_post_indexed(self, post_id: int) -> bool:
        """Check if post is indexed in Elasticsearch"""
        conn = self.get_connection()
        c = conn.cursor()
        c.execute("SELECT indexed FROM elasticsearch_posts WHERE post_id=?", (post_id,))
        result = c.fetchone()
        conn.close()
        return result is not None
    
    def mark_post_indexed(self, post_id: int):
        """Mark post as indexed in Elasticsearch"""
        conn = self.get_connection()
        c = conn.cursor()
        c.execute("INSERT OR REPLACE INTO elasticsearch_posts (post_id, indexed) VALUES (?, ?)",
                  (post_id, True))
        conn.commit()
        conn.close()
    
    # Search history operations
    def add_search_history(self, tags: str):
        """Add search to history"""
        if not tags.strip():
            return
        conn = self.get_connection()
        c = conn.cursor()
        c.execute("INSERT INTO search_history (tags, timestamp) VALUES (?, ?)",
                  (tags, datetime.now().isoformat()))
        conn.commit()
        conn.close()
    
    def get_search_history(self, limit: int = 10) -> List[Dict[str, str]]:
        """Get recent search history"""
        conn = self.get_connection()
        c = conn.cursor()
        c.execute("SELECT tags, timestamp FROM search_history ORDER BY timestamp DESC LIMIT ?", (limit,))
        results = c.fetchall()
        conn.close()
        return [{"tags": r[0], "timestamp": r[1]} for r in results]
    
    # Tag history operations
    def add_tag_history(self, post_id: int, old_tags: List[str], new_tags: List[str]):
        """Add tag edit to history"""
        conn = self.get_connection()
        c = conn.cursor()
        c.execute("""INSERT INTO tag_history (post_id, old_tags, new_tags, timestamp) 
                     VALUES (?, ?, ?, ?)""",
                  (post_id, json.dumps(old_tags), json.dumps(new_tags), datetime.now().isoformat()))
        conn.commit()
        conn.close()
        logger.info(f"Tag history added for post {post_id}")
    
    def get_tag_history(self, limit: int = 100, page: int = 1) -> Dict[str, Any]:
        """Get tag edit history with pagination"""
        conn = self.get_connection()
        c = conn.cursor()
        offset = (page - 1) * limit
        c.execute("""SELECT post_id, old_tags, new_tags, timestamp 
                     FROM tag_history ORDER BY timestamp DESC LIMIT ? OFFSET ?""",
                  (limit, offset))
        results = c.fetchall()
        
        c.execute("SELECT COUNT(*) FROM tag_history")
        total = c.fetchone()[0]
        
        conn.close()
        return {
            "items": [{
                "post_id": r[0],
                "old_tags": json.loads(r[1]),
                "new_tags": json.loads(r[2]),
                "timestamp": r[3]
            } for r in results],
            "total": total
        }
    
    # Tag count operations
    def update_tag_counts(self, tags: List[str], increment: bool = True):
        """Update counts for multiple tags"""
        conn = self.get_connection()
        c = conn.cursor()
        
        for tag in tags:
            if increment:
                c.execute("""INSERT INTO tag_counts (tag, count) VALUES (?, 1)
                            ON CONFLICT(tag) DO UPDATE SET count = count + 1""", (tag,))
            else:
                c.execute("""UPDATE tag_counts SET count = count - 1 
                            WHERE tag = ? AND count > 0""", (tag,))
        
        conn.commit()
        conn.close()
    
    def get_tag_count(self, tag: str) -> int:
        """Get count for a specific tag"""
        conn = self.get_connection()
        c = conn.cursor()
        c.execute("SELECT count FROM tag_counts WHERE tag=?", (tag,))
        result = c.fetchone()
        conn.close()
        return result[0] if result else 0
    
    def get_all_tag_counts(self) -> Dict[str, int]:
        """Get all tag counts as a dictionary"""
        conn = self.get_connection()
        c = conn.cursor()
        c.execute("SELECT tag, count FROM tag_counts")
        results = c.fetchall()
        conn.close()
        return {r[0]: r[1] for r in results}
    
    def rebuild_tag_counts(self, temp_path: str, save_path: str):
        """Rebuild tag counts from all posts (maintenance operation)"""
        import os
        
        logger.info("Rebuilding tag counts...")
        conn = self.get_connection()
        c = conn.cursor()
        
        # Clear existing counts
        c.execute("DELETE FROM tag_counts")
        
        tag_counts = {}
        
        # Count tags from temp directory
        if temp_path and os.path.exists(temp_path):
            for filename in os.listdir(temp_path):
                if filename.endswith(".json"):
                    json_path = os.path.join(temp_path, filename)
                    try:
                        with open(json_path, 'r') as f:
                            post_data = json.load(f)
                            for tag in post_data.get('tags', []):
                                tag_counts[tag] = tag_counts.get(tag, 0) + 1
                    except:
                        pass
        
        # Count tags from save directory
        if save_path and os.path.exists(save_path):
            for date_folder in os.listdir(save_path):
                folder_path = os.path.join(save_path, date_folder)
                if not os.path.isdir(folder_path):
                    continue
                for filename in os.listdir(folder_path):
                    if filename.endswith(".json"):
                        json_path = os.path.join(folder_path, filename)
                        try:
                            with open(json_path, 'r') as f:
                                post_data = json.load(f)
                                for tag in post_data.get('tags', []):
                                    tag_counts[tag] = tag_counts.get(tag, 0) + 1
                        except:
                            pass
        
        # Insert all counts
        for tag, count in tag_counts.items():
            c.execute("INSERT INTO tag_counts (tag, count) VALUES (?, ?)", (tag, count))
        
        conn.commit()
        conn.close()
        logger.info(f"Rebuilt {len(tag_counts)} tag counts")