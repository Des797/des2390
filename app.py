import os
import json
import logging
from functools import wraps
from flask import Flask, render_template, request, jsonify, send_from_directory, session, redirect, url_for

# Import configuration
from config import Config, get_config

# Import our modules
from database import Database
from api_client import Rule34APIClient
from file_manager import FileManager
from scraper import Scraper

# Get configuration
config = get_config()

# Configure logging
logging.basicConfig(
    level=config.LOG_LEVEL,
    format=config.LOG_FORMAT,
    handlers=[
        logging.FileHandler(config.LOG_FILE),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = config.SECRET_KEY

# Initialize Elasticsearch (optional)
es = None
es_config = config.get_elasticsearch_config()
if es_config:
    try:
        from elasticsearch import Elasticsearch
        es = Elasticsearch(**es_config)
        logger.info("Elasticsearch connection established")
    except Exception as e:
        logger.warning(f"Elasticsearch not available: {e}")

# Initialize modules
db = Database(config.DATABASE_PATH)
api_client = Rule34APIClient()
file_manager = FileManager()
scraper = Scraper(api_client, file_manager, db, es)

# Load configuration on startup
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

# Authentication decorator
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

# Routes
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        data = request.json
        if data.get("username") == config.AUTH_USERNAME and data.get("password") == config.AUTH_PASSWORD:
            session['logged_in'] = True
            return jsonify({"success": True})
        return jsonify({"success": False, "error": "Invalid credentials"}), 401
    return render_template("login.html")

@app.route("/logout")
def logout():
    session.pop('logged_in', None)
    return redirect(url_for('login'))

@app.route("/")
@login_required
def index():
    # Get tag counts for initial load
    tag_counts = db.get_all_tag_counts()
    return render_template("index.html", tag_counts=json.dumps(tag_counts))

@app.route("/api/status")
@login_required
def get_status():
    return jsonify(scraper.get_state())

@app.route("/api/config", methods=["GET", "POST"])
@login_required
def config():
    if request.method == "POST":
        data = request.json
        
        # Save API credentials
        if "api_user_id" in data:
            db.save_config("api_user_id", data["api_user_id"])
        if "api_key" in data:
            db.save_config("api_key", data["api_key"])
        
        # Save paths
        if "temp_path" in data:
            db.save_config("temp_path", data["temp_path"])
        if "save_path" in data:
            db.save_config("save_path", data["save_path"])
        
        # Save blacklist
        if "blacklist" in data:
            db.save_config("blacklist", json.dumps(data["blacklist"]))
        
        # Update modules with new config
        api_client.update_credentials(
            data.get("api_user_id", api_client.user_id),
            data.get("api_key", api_client.api_key)
        )
        file_manager.update_paths(
            data.get("temp_path", file_manager.temp_path),
            data.get("save_path", file_manager.save_path)
        )
        
        return jsonify({"success": True})
    else:
        return jsonify({
            "api_user_id": db.load_config("api_user_id", ""),
            "api_key": db.load_config("api_key", ""),
            "temp_path": db.load_config("temp_path", ""),
            "save_path": db.load_config("save_path", ""),
            "blacklist": json.loads(db.load_config("blacklist", "[]"))
        })

@app.route("/api/search_history")
@login_required
def search_history():
    return jsonify(db.get_search_history())

@app.route("/api/tag_history")
@login_required
def tag_history():
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 50))
    return jsonify(db.get_tag_history(limit, page))

@app.route("/api/tag_counts")
@login_required
def get_tag_counts():
    """Get all tag counts"""
    return jsonify(db.get_all_tag_counts())

@app.route("/api/rebuild_tag_counts", methods=["POST"])
@login_required
def rebuild_tag_counts():
    """Rebuild tag counts from all posts"""
    db.rebuild_tag_counts(file_manager.temp_path, file_manager.save_path)
    return jsonify({"success": True})

@app.route("/api/start", methods=["POST"])
@login_required
def start_scraper():
    data = request.json
    tags = data.get("tags", "")
    
    if scraper.start(tags):
        return jsonify({"success": True})
    else:
        return jsonify({"error": "Failed to start scraper"}), 400

@app.route("/api/stop", methods=["POST"])
@login_required
def stop_scraper():
    scraper.stop()
    return jsonify({"success": True})

@app.route("/api/posts")
@login_required
def get_posts():
    """Get posts with optional filter (pending/saved/all)"""
    filter_type = request.args.get('filter', 'all')
    
    if filter_type == 'pending':
        posts = file_manager.get_pending_posts()
    elif filter_type == 'saved':
        posts = file_manager.get_saved_posts()
    else:  # all
        posts = file_manager.get_all_posts()
    
    return jsonify(posts)

@app.route("/api/pending")
@login_required
def get_pending():
    """Legacy endpoint - get pending posts"""
    return jsonify(file_manager.get_pending_posts())

@app.route("/api/saved")
@login_required
def get_saved():
    """Legacy endpoint - get saved posts"""
    return jsonify(file_manager.get_saved_posts())

@app.route("/api/save/<int:post_id>", methods=["POST"])
@login_required
def save_post(post_id):
    if file_manager.save_post_to_archive(post_id):
        db.set_post_status(post_id, "saved")
        
        # Update scraper stats
        with scraper.lock:
            scraper.state["total_saved"] += 1
        
        return jsonify({"success": True})
    else:
        return jsonify({"error": "Failed to save post"}), 500

@app.route("/api/discard/<int:post_id>", methods=["POST"])
@login_required
def discard_post(post_id):
    # Get post data before discarding to update tag counts
    post_data = file_manager.load_post_json(post_id, file_manager.temp_path)
    
    if file_manager.discard_post(post_id):
        db.set_post_status(post_id, "discarded")
        
        # Update tag counts
        if post_data and 'tags' in post_data:
            db.update_tag_counts(post_data['tags'], increment=False)
        
        # Update scraper stats
        with scraper.lock:
            scraper.state["total_discarded"] += 1
        
        return jsonify({"success": True})
    else:
        return jsonify({"error": "Failed to discard post"}), 500

@app.route("/api/delete/<int:post_id>", methods=["POST"])
@login_required
def delete_saved_post(post_id):
    """Delete a saved post"""
    data = request.json
    date_folder = data.get('date_folder')
    
    if not date_folder:
        return jsonify({"error": "date_folder required"}), 400
    
    # Get post data before deleting to update tag counts
    folder_path = os.path.join(file_manager.save_path, date_folder)
    post_data = file_manager.load_post_json(post_id, folder_path)
    
    if file_manager.delete_saved_post(post_id, date_folder):
        # Update tag counts
        if post_data and 'tags' in post_data:
            db.update_tag_counts(post_data['tags'], increment=False)
        
        return jsonify({"success": True})
    else:
        return jsonify({"error": "Failed to delete post"}), 500

@app.route("/api/post/<int:post_id>/size")
@login_required
def get_post_size(post_id):
    size = file_manager.get_file_size(post_id)
    return jsonify({"size": size})

@app.route("/api/autocomplete")
@login_required
def autocomplete_tags():
    query = request.args.get('q', '')
    suggestions = api_client.get_autocomplete_tags(query)
    return jsonify(suggestions)

@app.route("/temp/<path:filename>")
@login_required
def serve_temp(filename):
    return send_from_directory(file_manager.temp_path, filename)

@app.route("/saved/<date_folder>/<path:filename>")
@login_required
def serve_saved(date_folder, filename):
    folder_path = os.path.join(file_manager.save_path, date_folder)
    return send_from_directory(folder_path, filename)

if __name__ == "__main__":
    load_startup_config()
    
    # Print configuration
    config.print_info()
    
    app.run(debug=config.DEBUG, host=config.HOST, port=config.PORT)