"""Repair script for corrupted SQLite database with logging and internal table handling"""

import sqlite3
import os
import logging
import shutil
from contextlib import closing

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

def repair_database(original_path, backup_path=None):
    """
    Repair a possibly corrupted SQLite database by copying tables to a new database.

    Args:
        original_path (str): Path to the corrupted database.
        backup_path (str, optional): Path to save the repaired database. If None, will append '_repaired'.
    """
    if not os.path.exists(original_path):
        logger.error(f"Database not found: {original_path}")
        return False

    if backup_path is None:
        base, ext = os.path.splitext(original_path)
        backup_path = f"{base}_repaired{ext}"

    logger.info(f"Starting database repair: {original_path}")
    logger.info(f"Backup/repaired database will be: {backup_path}")

    try:
        with closing(sqlite3.connect(original_path)) as conn:
            conn.execute("PRAGMA foreign_keys=OFF;")
            conn.execute("PRAGMA integrity_check;")
            tables = [row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()]
            logger.info(f"Found tables: {tables}")

            with closing(sqlite3.connect(backup_path)) as new_conn:
                new_conn.execute("PRAGMA foreign_keys=OFF;")
                new_conn.execute("BEGIN TRANSACTION;")

                internal_tables = {'sqlite_sequence', 'sqlite_stat1', 'sqlite_stat2', 'sqlite_stat3', 'sqlite_stat4'}

                for table in tables:
                    if table in internal_tables:
                        logger.info(f"Skipping internal SQLite table: {table}")
                        continue

                    logger.info(f"Processing table: {table}")

                    # Get CREATE TABLE statement
                    create_sql = conn.execute(
                        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?;", (table,)
                    ).fetchone()

                    if not create_sql or not create_sql[0]:
                        logger.warning(f"No CREATE TABLE statement found for {table}, skipping...")
                        continue

                    try:
                        new_conn.execute(create_sql[0])
                    except Exception as e:
                        logger.error(f"Failed to create table {table}: {e}")
                        continue

                    # Copy data
                    try:
                        rows = conn.execute(f"SELECT * FROM {table};").fetchall()
                        if not rows:
                            logger.info(f"Table {table}: no rows to copy")
                            continue

                        placeholders = ','.join(['?'] * len(rows[0]))
                        new_conn.executemany(f"INSERT INTO {table} VALUES ({placeholders})", rows)
                        logger.info(f"Table {table}: copied {len(rows)} rows")
                    except Exception as e:
                        logger.error(f"Failed to copy rows for table {table}: {e}")

                new_conn.commit()
        logger.info("Database repair completed successfully")
        return True

    except Exception as e:
        logger.error(f"Unexpected error during repair: {e}", exc_info=True)
        return False

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        logger.error("Usage: python database_corruption_fix.py <path_to_db> [<backup_path>]")
        sys.exit(1)

    original_db = sys.argv[1]
    backup_db = sys.argv[2] if len(sys.argv) >= 3 else None
    success = repair_database(original_db, backup_db)

    if success:
        logger.info("Repair finished successfully")
    else:
        logger.error("Repair failed, manual intervention may be required")
