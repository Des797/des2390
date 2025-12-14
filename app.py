import logging
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

# Initialize services
services = {
    'post': PostService(file_manager, db),
    'config': ConfigService(db, api_client, file_manager),
    'tag': TagService(db),
    'search': SearchService(db),
    'scraper': ScraperService(scraper, db),
    'autocomplete': AutocompleteService(api_client),
    'file_manager': file_manager  # For route access
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

if __name__ == "__main__":
    load_startup_config()
    
    # Print configuration
    app_config.print_info()
    
    app.run(debug=app_config.DEBUG, host=app_config.HOST, port=app_config.PORT)