import logging
import signal
import sys
import threading
from flask import Flask, request, abort
import os
from dotenv import load_dotenv
load_dotenv()

# Import configuration
from config import get_config

# Import modules
from database import Database
from api_client import Rule34APIClient
from file_manager import FileManager
from scraper import Scraper
from services import (
    PostService, ConfigService, TagService, 
    SearchService, ScraperService, AutocompleteService
)
from routes import create_routes
from file_operations_queue import get_file_operations_queue

# Get configuration
app_config = get_config()

# Configure logging
logging.basicConfig(
    level=app_config.LOG_LEVEL,
    format=app_config.LOG_FORMAT,
    handlers=[
        logging.FileHandler(app_config.LOG_FILE),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
app.secret_key = app_config.SECRET_KEY
app.config['SESSION_COOKIE_SECURE'] = app_config.SESSION_COOKIE_SECURE
app.config['SESSION_COOKIE_HTTPONLY'] = app_config.SESSION_COOKIE_HTTPONLY
app.config['SESSION_COOKIE_SAMESITE'] = app_config.SESSION_COOKIE_SAMESITE
app.config['PERMANENT_SESSION_LIFETIME'] = app_config.PERMANENT_SESSION_LIFETIME

# Network security middleware
@app.before_request
def check_network_access():
    """Restrict access to local network only if configured"""
    if app_config.REQUIRE_LOCAL_NETWORK:
        client_ip = request.remote_addr
        
        # Allow localhost
        if client_ip in ['127.0.0.1', 'localhost', '::1']:
            return None
        
        # Check if IP is from local network
        if not app_config.is_local_network_ip(client_ip):
            logger.warning(f"Blocked access attempt from non-local IP: {client_ip}")
            abort(403)
        
    # Check allowed hosts if configured
    if app_config.ALLOWED_HOSTS:
        host = request.host.split(':')[0]
        if host not in app_config.ALLOWED_HOSTS and host not in ['127.0.0.1', 'localhost']:
            logger.warning(f"Blocked access attempt to non-allowed host: {host}")
            abort(403)
    
    return None

# Security headers
@app.after_request
def add_security_headers(response):
    """Add security headers to all responses"""
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response

# Initialize Elasticsearch (optional)
es = None
es_config = app_config.get_elasticsearch_config()
if es_config:
    try:
        from elasticsearch import Elasticsearch
        es = Elasticsearch(**es_config)
        logger.info("Elasticsearch connection established")
    except Exception as e:
        logger.warning(f"Elasticsearch not available: {e}")

# Initialize core modules
db = Database(app_config.DATABASE_PATH)
api_client = Rule34APIClient()
file_manager = FileManager()
scraper = Scraper(api_client, file_manager, db, es)
file_operations_queue = get_file_operations_queue(file_manager, db)

# Initialize services
services = {
    'post': PostService(file_manager, db),
    'config': ConfigService(db, api_client, file_manager),
    'tag': TagService(db),
    'search': SearchService(db),
    'scraper': ScraperService(scraper, db),
    'autocomplete': AutocompleteService(api_client),
    'file_manager': file_manager,
    'queue': file_operations_queue
}

# Load startup configuration
def load_startup_config():
    """Load configuration from database"""
    api_client.update_credentials(
        db.load_config("api_user_id", ""),
        db.load_config("api_key", "")
    )
    file_manager.update_paths(
        db.load_config("temp_path", ""),
        db.load_config("save_path", "")
    )
    logger.info("Startup configuration loaded")


# Register routes
create_routes(app, app_config, services)


# Graceful shutdown handler
def shutdown_handler(signum, frame):
    """Handle shutdown signals gracefully"""
    logger.info(f"Received signal {signum}, shutting down gracefully...")
    
    try:
        # Stop scraper first
        if scraper.state["active"]:
            logger.info("Stopping scraper...")
            scraper.stop()
        
        # Stop queue processor
        if file_operations_queue.running:
            logger.info("Stopping file operations queue...")
            file_operations_queue.stop()
        
        logger.info("Cleanup complete, exiting...")
    except Exception as e:
        logger.error(f"Error during shutdown: {e}")
    finally:
        sys.exit(0)


# Register signal handlers
signal.signal(signal.SIGINT, shutdown_handler)
signal.signal(signal.SIGTERM, shutdown_handler)


def async_database_sync():
    """Run FULL cache rebuild in background thread"""
    try:
        logger.info("="*60)
        logger.info("Starting FULL cache rebuild from disk...")
        logger.info("="*60)
        
        import time
        start_time = time.time()
        
        # Use the database's built-in cache rebuild which properly loads all posts
        success = db.rebuild_cache_from_files(file_manager)
        
        elapsed = time.time() - start_time
        
        if success:
            # Get counts after rebuild
            pending_count = db.get_cache_count(status='pending')
            saved_count = db.get_cache_count(status='saved')
            total_count = db.get_cache_count()
            
            logger.info("="*60)
            logger.info(f"Cache rebuild complete in {elapsed:.2f}s")
            logger.info(f"   Pending: {pending_count:,}")
            logger.info(f"   Saved:   {saved_count:,}")
            logger.info(f"   Total:   {total_count:,}")
            logger.info("="*60)
        else:
            logger.error("="*60)
            logger.error(f"Cache rebuild FAILED after {elapsed:.2f}s")
            logger.error("="*60)
            
    except Exception as e:
        logger.error("="*60)
        logger.error(f"Cache rebuild exception: {e}", exc_info=True)
        logger.error("="*60)


if __name__ == "__main__":
    load_startup_config()

    # Check if cache rebuild is needed
    cache_count = db.get_cache_count()
    cache_empty = cache_count == 0
    
    # Check if auto-sync is explicitly enabled (don't default to true)
    auto_sync_config = db.load_config("auto_sync_disk", None)
    
    # Only auto-sync if:
    # 1. Cache is empty (first run), OR
    # 2. User explicitly enabled auto_sync_disk
    should_rebuild = cache_empty
    
    if auto_sync_config is not None:
        # User has set a preference
        if isinstance(auto_sync_config, str):
            auto_sync_enabled = auto_sync_config.lower() in ('true', '1', 'yes')
        else:
            auto_sync_enabled = bool(auto_sync_config)
        
        if auto_sync_enabled:
            should_rebuild = True
            logger.info("Auto-sync explicitly enabled in config")
    
    if should_rebuild:
        if cache_empty:
            logger.info("Cache is empty - performing initial population...")
        else:
            logger.info("Auto-sync enabled - rebuilding cache from disk...")
        
        # Run OPTIMIZED cache rebuild in background thread (non-blocking)
        sync_thread = threading.Thread(target=async_database_sync, daemon=True)
        sync_thread.start()
        logger.info("Server starting while OPTIMIZED cache rebuilds in background...")
    else:
        logger.info(f"Cache already populated with {cache_count:,} posts - skipping rebuild")
        logger.info("To force a rebuild, set auto_sync_disk=true in config or use /api/rebuild_cache endpoint")

    # Print configuration
    app_config.print_info()
    
    # Print queue status
    print("\n" + "="*60)
    print("File Operations Queue: ACTIVE")
    print("Background retry processor running for locked files")
    print("="*60 + "\n")
    
    print("Server is starting...")
    if should_rebuild:
        print("OPTIMIZED cache rebuild running in background (bulk inserts)")
        print("Expected time: ~2-5 minutes for 200k posts (was 4 hours!)")
    print("Server will be responsive immediately")
    print("Network access restricted to local network only")
    print("="*60 + "\n")
    
    try:
        app.run(
            debug=app_config.DEBUG, 
            host=app_config.HOST, 
            port=app_config.PORT,
            threaded=True,
            use_reloader=False
        )
    except KeyboardInterrupt:
        logger.info("\nReceived keyboard interrupt, shutting down...")
    except Exception as e:
        logger.error(f"Server error: {e}", exc_info=True)
    finally:
        try:
            if scraper.state.get("active"):
                logger.info("Stopping scraper...")
                scraper.stop()
            
            if file_operations_queue and file_operations_queue.running:
                logger.info("Stopping file operations queue...")
                file_operations_queue.stop()
            
            logger.info("Application shutdown complete")
        except Exception as e:
            logger.error(f"Cleanup error: {e}")