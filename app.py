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

def sync_db_with_disk_optimized(file_manager, database):
    """
    Optimized database sync - only updates status table, not full cache rebuild
    Returns counts of pending and saved posts
    """
    import os
    import time
    from concurrent.futures import ThreadPoolExecutor, as_completed
    
    start_time = time.time()
    pending_count = 0
    saved_count = 0
    
    logger.info("Syncing database status with disk (fast mode)...")
    
    def process_pending_file(json_file):
        """Process single pending JSON file"""
        try:
            post_id = int(json_file.replace('.json', ''))
            database.set_post_status(post_id, "pending")
            return 1
        except:
            return 0
    
    def process_saved_folder(date_folder):
        """Process single saved folder"""
        count = 0
        try:
            folder_path = os.path.join(file_manager.save_path, date_folder)
            if not os.path.isdir(folder_path):
                return 0
            
            for filename in os.listdir(folder_path):
                if filename.endswith('.json'):
                    try:
                        post_id = int(filename.replace('.json', ''))
                        database.set_post_status(post_id, "saved")
                        count += 1
                    except:
                        pass
        except Exception as e:
            logger.error(f"Error processing folder {date_folder}: {e}")
        return count
    
    # Process pending posts (temp directory)
    if file_manager.temp_path and os.path.exists(file_manager.temp_path):
        try:
            json_files = [f for f in os.listdir(file_manager.temp_path) if f.endswith('.json')]
            
            with ThreadPoolExecutor(max_workers=10) as executor:
                futures = [executor.submit(process_pending_file, f) for f in json_files]
                for future in as_completed(futures):
                    pending_count += future.result()
            
            logger.info(f"Synced {pending_count} pending posts")
        except Exception as e:
            logger.error(f"Error syncing pending posts: {e}")
    
    # Process saved posts (archive directory)
    if file_manager.save_path and os.path.exists(file_manager.save_path):
        try:
            date_folders = [f for f in os.listdir(file_manager.save_path) 
                          if os.path.isdir(os.path.join(file_manager.save_path, f))]
            
            with ThreadPoolExecutor(max_workers=10) as executor:
                futures = [executor.submit(process_saved_folder, f) for f in date_folders]
                for i, future in enumerate(as_completed(futures), 1):
                    saved_count += future.result()
                    if i % 10 == 0:
                        logger.info(f"Processed {i}/{len(date_folders)} folders...")
            
            logger.info(f"Synced {saved_count} saved posts")
        except Exception as e:
            logger.error(f"Error syncing saved posts: {e}")
    
    elapsed = time.time() - start_time
    logger.info(f"Database sync completed in {elapsed:.2f}s")
    
    return pending_count, saved_count


def async_database_sync():
    """Run database sync in background thread"""
    try:
        logger.info("Starting background database sync...")
        pending_count, saved_count = sync_db_with_disk_optimized(file_manager, db)
        logger.info(f"Background sync complete: pending={pending_count}, saved={saved_count}")
    except Exception as e:
        logger.error(f"Background sync failed: {e}", exc_info=True)


if __name__ == "__main__":
    load_startup_config()

    # Optimized disk → DB reconciliation (NON-BLOCKING)
    auto_sync = db.load_config("auto_sync_disk", "true")
    
    # Handle both string and bool values
    if isinstance(auto_sync, str):
        auto_sync = auto_sync.lower() in ('true', '1', 'yes')
    
    if auto_sync:
        # Run sync in background thread so it doesn't block server startup
        logger.info("Starting database synchronization in background...")
        sync_thread = threading.Thread(target=async_database_sync, daemon=True)
        sync_thread.start()
        logger.info("Server starting while sync runs in background...")
    else:
        logger.info("Database synchronization skipped (auto_sync_disk disabled)")

    # Print configuration
    app_config.print_info()
    
    # Print queue status
    print("\n" + "="*60)
    print("File Operations Queue: ACTIVE")
    print("Background retry processor running for locked files")
    print("="*60 + "\n")
    
    print("🚀 Server is starting...")
    print("📊 Database sync running in background (non-blocking)")
    print("🌐 Server will be responsive immediately")
    print("🔒 Network access restricted to local network only")
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