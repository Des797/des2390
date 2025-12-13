import os
import logging
from functools import wraps
from flask import Flask, render_template, request, jsonify, send_from_directory, session, redirect, url_for
from elasticsearch import Elasticsearch

# Import our modules
from database import Database
from api_client import Rule34API
from post_manager import PostManager
from scraper import Scraper

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('rule34_scraper.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'your-secret-key-change-this')

# Authentication credentials from environment
AUTH_USERNAME = os.environ.get('AUTH_USERNAME', 'admin')
AUTH_PASSWORD = os.environ.get('AUTH_PASSWORD', 'admin')

# Elasticsearch Configuration
ES_HOST = "localhost"
ES_PORT = 9200
ES_USER = "elastic"
ES_PASSWORD = "o_UsKFunknykh_hSGBJP"
ES_CA_CERT = r"D:\elasticsearch-9.2.1-windows-x86_64\elasticsearch-9.2.1\config\certs\http_ca.crt"
ES_INDEX = "objects"

# Initialize Elasticsearch
try:
    es = Elasticsearch(
        [f"https://{ES_HOST}:{ES_PORT}"],
        basic_auth=(ES_USER, ES_PASSWORD),
        ca_certs=ES_CA_CERT,
        verify_certs=True
    )
    logger.info("Elasticsearch connection established")
except Exception as e:
    logger.error(f"Failed to connect to Elasticsearch: {e}")
    es = None

# Initialize modules
db = Database()
api_client = Rule34API()
post_manager = PostManager(db)
scraper = Scraper(db, api_client, post_manager, es)

# Load configuration on startup
scraper.load_config()

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
        if data.get("username") == AUTH_USERNAME and data.get("password") == AUTH_PASSWORD:
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
    return render_template("index.html")

@app.route("/api/status")
@login_required
def get_status():
    return jsonify(scraper.get_state())

@app.route("/api/config", methods=["GET", "POST"])
@login_required
def config():
    if request.method == "POST":
        scraper.save_config(request.json)
        return jsonify({"success": True})
    else:
        return jsonify(scraper.config)

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
    all_posts = post_manager.get_all_posts()
    db.rebuild_tag_counts(all_posts)
    return jsonify({"success": True, "total_posts": len(all_posts)})

@app.route("/api/start", methods=["POST"])
@login_required
def start_scraper():
    data = request.json
    tags = data.get("tags", "")
    result = scraper.start(tags)
    if "error" in result:
        return jsonify(result), 400
    return jsonify(result)

@app.route("/api/stop", methods=["POST"])
@login_required
def stop_scraper():
    return jsonify(scraper.stop())

@app.route("/api/posts")
@login_required
def get_posts():
    """Get posts based on filter parameter"""
    filter_type = request.args.get('filter', 'all')  # 'pending', 'saved', or 'all'
    
    if filter_type == 'pending':
        posts = post_manager.get_pending_posts()
    elif filter_type == 'saved':
        posts = post_manager.get_saved_posts()
    else:  # 'all'
        posts = post_manager.get_all_posts()
    
    return jsonify(posts)

@app.route("/api/pending")
@login_required
def get_pending():
    """Backward compatibility endpoint"""
    return jsonify(post_manager.get_pending_posts())

@app.route("/api/saved")
@login_required
def get_saved():
    """Backward compatibility endpoint"""
    return jsonify(post_manager.get_saved_posts())

@app.route("/api/save/<post_id>", methods=["POST"])
@login_required
def save_post(post_id):
    result = post_manager.save_post(int(post_id))
    if "error" in result:
        return jsonify(result), 404
    scraper.state["total_saved"] += 1
    return jsonify(result)

@app.route("/api/discard/<post_id>", methods=["POST"])
@login_required
def discard_post(post_id):
    result = post_manager.discard_post(int(post_id))
    if "error" in result:
        return jsonify(result), 404
    scraper.state["total_discarded"] += 1
    return jsonify(result)

@app.route("/api/delete/<post_id>", methods=["POST"])
@login_required
def delete_saved_post(post_id):
    """Delete a saved post permanently"""
    result = post_manager.delete_saved_post(int(post_id))
    if "error" in result:
        return jsonify(result), 404
    return jsonify(result)

@app.route("/api/post/<post_id>/size")
@login_required
def get_post_size(post_id):
    size = post_manager.get_post_size(int(post_id))
    return jsonify({"size": size})

@app.route("/api/autocomplete")
@login_required
def autocomplete_tags():
    query = request.args.get('q', '')
    return jsonify(api_client.autocomplete_tags(query))

@app.route("/temp/<path:filename>")
@login_required
def serve_temp(filename):
    temp_path = scraper.config.get("temp_path", "")
    return send_from_directory(temp_path, filename)

@app.route("/saved/<date_folder>/<path:filename>")
@login_required
def serve_saved(date_folder, filename):
    save_path = scraper.config.get("save_path", "")
    folder_path = os.path.join(save_path, date_folder)
    return send_from_directory(folder_path, filename)

if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("Rule34 Scraper Starting")
    logger.info(f"Auth: {AUTH_USERNAME} (set via AUTH_USERNAME env var)")
    logger.info(f"Network access enabled on: 0.0.0.0:5000")
    logger.info("=" * 60)
    
    # Run on all network interfaces to allow LAN access
    app.run(debug=True, host="0.0.0.0", port=5000)