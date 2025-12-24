"""Route handlers for the Flask application - Main entry point"""
import logging
from functools import wraps
from flask import session, redirect, url_for

from .auth import create_auth_routes
from .posts import create_post_routes
from .scraper import create_scraper_routes
from .config import create_config_routes
from .tags import create_tag_routes
from .diagnostics import create_diagnostic_routes
from .files import create_file_routes

logger = logging.getLogger(__name__)


def login_required(f):
    """Authentication decorator"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function


def create_routes(app, config, services):
    """Create and register all routes"""
    
    # Unpack services
    post_service = services['post']
    config_service = services['config']
    tag_service = services['tag']
    search_service = services['search']
    scraper_service = services['scraper']
    autocomplete_service = services['autocomplete']
    file_manager = services['file_manager']
    queue = services['queue']
    
    # Create service bundle for passing to route modules
    service_bundle = {
        'post': post_service,
        'config': config_service,
        'tag': tag_service,
        'search': search_service,
        'scraper': scraper_service,
        'autocomplete': autocomplete_service,
        'file_manager': file_manager,
        'queue': queue
    }
    
    # Register all route modules
    create_auth_routes(app, config)
    create_post_routes(app, config, service_bundle, login_required)
    create_scraper_routes(app, service_bundle, login_required)
    create_config_routes(app, service_bundle, login_required)
    create_tag_routes(app, service_bundle, login_required)
    create_diagnostic_routes(app, config, service_bundle, login_required)
    create_file_routes(app, service_bundle, login_required)
    
    logger.info("Routes registered successfully")