import logging
import signal
import sys
from flask import Flask

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
signal.signal(signal.SIGINT, shutdown_handler)   # Ctrl+C
signal.signal(signal.SIGTERM, shutdown_handler)  # Kill signal


if __name__ == "__main__":
    load_startup_config()
    
    # Print configuration
    app_config.print_info()
    
    # Print queue status
    print("\n" + "="*60)
    print("File Operations Queue: ACTIVE")
    print("Background retry processor running for locked files")
    print("="*60 + "\n")
    
    try:
        # Use threaded=False to avoid socket issues on Windows
        app.run(
            debug=app_config.DEBUG, 
            host=app_config.HOST, 
            port=app_config.PORT,
            threaded=True,
            use_reloader=False  # Disable reloader to prevent double queue initialization
        )
    except KeyboardInterrupt:
        logger.info("\nReceived keyboard interrupt, shutting down...")
    except Exception as e:
        logger.error(f"Server error: {e}", exc_info=True)
    finally:
        # Cleanup on exit
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