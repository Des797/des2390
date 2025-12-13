import os
import json
import time
import uuid
import sqlite3
import requests
import threading
import logging
from datetime import datetime
from pathlib import Path
from functools import wraps
from flask import Flask, render_template, request, jsonify, send_from_directory, session, redirect, url_for
from elasticsearch import Elasticsearch
from collections import deque

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

# Global variables
scraper_state = {
    "active": False,
    "current_tags": "",
    "current_page": 0,
    "total_processed": 0,
    "total_saved": 0,
    "total_discarded": 0,
    "total_skipped": 0,
    "requests_this_minute": 0,
    "last_request_time": 0,
    "current_mode": "search",
    "api_user_id": "",
    "api_key": "",
    "temp_path": "",
    "save_path": "",
    "blacklist": [],
    "storage_warning": False,
    "memory_warning": False,
    "last_error": ""
}

bulk_operation_state = {
    "active": False,
    "type": "",
    "total": 0,
    "processed": 0,
    "cancelled": False
}

request_times = deque(maxlen=60)
scraper_lock = threading.Lock()

# Authentication decorator
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

# Database setup
def init_db():
    logger.info("Initializing database...")
    conn = sqlite3.connect("rule34_scraper.db")
    c = conn.cursor()
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
    conn.commit()
    conn.close()
    logger.info("Database initialized successfully")

init_db()

# Rate limiter
class RateLimiter:
    def __init__(self, max_requests=60, time_window=60):
        self.max_requests = max_requests
        self.time_window = time_window
        self.requests = deque()
        logger.debug(f"Rate limiter initialized: {max_requests} requests per {time_window}s")
    
    def wait_if_needed(self):
        now = time.time()
        while self.requests and self.requests[0] < now - self.time_window:
            self.requests.popleft()
        
        if len(self.requests) >= self.max_requests:
            sleep_time = self.time_window - (now - self.requests[0]) + 0.1
            if sleep_time > 0:
                logger.debug(f"Rate limit reached, waiting {sleep_time:.2f}s")
                time.sleep(sleep_time)
                return self.wait_if_needed()
        
        self.requests.append(now)
        scraper_state["requests_this_minute"] = len(self.requests)
        return True

rate_limiter = RateLimiter()

# Config helpers
def save_config(key, value):
    conn = sqlite3.connect("rule34_scraper.db")
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", (key, value))
    conn.commit()
    conn.close()

def load_config(key, default=None):
    conn = sqlite3.connect("rule34_scraper.db")
    c = conn.cursor()
    c.execute("SELECT value FROM config WHERE key=?", (key,))
    result = c.fetchone()
    conn.close()
    return result[0] if result else default

# Search history helpers
def add_search_history(tags):
    if not tags.strip():
        return
    conn = sqlite3.connect("rule34_scraper.db")
    c = conn.cursor()
    c.execute("INSERT INTO search_history (tags, timestamp) VALUES (?, ?)",
              (tags, datetime.now().isoformat()))
    conn.commit()
    conn.close()

def get_search_history(limit=10):
    conn = sqlite3.connect("rule34_scraper.db")
    c = conn.cursor()
    c.execute("SELECT tags, timestamp FROM search_history ORDER BY timestamp DESC LIMIT ?", (limit,))
    results = c.fetchall()
    conn.close()
    return [{"tags": r[0], "timestamp": r[1]} for r in results]

# Tag history helpers
def add_tag_history(post_id, old_tags, new_tags):
    conn = sqlite3.connect("rule34_scraper.db")
    c = conn.cursor()
    c.execute("""INSERT INTO tag_history (post_id, old_tags, new_tags, timestamp) 
                 VALUES (?, ?, ?, ?)""",
              (post_id, json.dumps(old_tags), json.dumps(new_tags), datetime.now().isoformat()))
    conn.commit()
    conn.close()
    logger.info(f"Tag history added for post {post_id}")

def get_tag_history(limit=100, page=1):
    conn = sqlite3.connect("rule34_scraper.db")
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

# Post status helpers
def get_post_status(post_id):
    conn = sqlite3.connect("rule34_scraper.db")
    c = conn.cursor()
    c.execute("SELECT status FROM processed_posts WHERE post_id=?", (post_id,))
    result = c.fetchone()
    conn.close()
    return result[0] if result else None

def set_post_status(post_id, status):
    conn = sqlite3.connect("rule34_scraper.db")
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO processed_posts (post_id, status, timestamp) VALUES (?, ?, ?)",
              (post_id, status, datetime.now().isoformat()))
    conn.commit()
    conn.close()

def is_post_indexed(post_id):
    conn = sqlite3.connect("rule34_scraper.db")
    c = conn.cursor()
    c.execute("SELECT indexed FROM elasticsearch_posts WHERE post_id=?", (post_id,))
    result = c.fetchone()
    conn.close()
    return result is not None

def mark_post_indexed(post_id):
    conn = sqlite3.connect("rule34_scraper.db")
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO elasticsearch_posts (post_id, indexed) VALUES (?, ?)",
              (post_id, True))
    conn.commit()
    conn.close()

# Storage checks
def check_storage(path, min_gb=5):
    try:
        if not path or not os.path.exists(path):
            return True
        import shutil
        total, used, free = shutil.disk_usage(path)
        free_gb = free / (1024**3)
        logger.debug(f"Storage check for {path}: {free_gb:.2f} GB free")
        return free_gb > min_gb
    except Exception as e:
        logger.error(f"Storage check failed: {e}")
        return True

# Apply blacklist
def apply_blacklist(tags, blacklist):
    if not blacklist:
        return tags
    blacklist_parts = []
    for item in blacklist:
        if f"-{item}" not in tags:
            blacklist_parts.append(f"-{item}")
    result = f"{tags} {' '.join(blacklist_parts)}".strip()
    return result

# API Request helper
def make_api_request(tags="", page=0, post_id=None):
    logger.debug(f"Making API request - tags: '{tags}', page: {page}, post_id: {post_id}")
    rate_limiter.wait_if_needed()
    
    user_id = scraper_state.get("api_user_id", "")
    api_key = scraper_state.get("api_key", "")
    
    base_url = "https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1"
    params = []
    
    if user_id:
        params.append(f"user_id={requests.utils.quote(user_id)}")
    if api_key:
        params.append(f"api_key={requests.utils.quote(api_key)}")
    if tags:
        blacklist = scraper_state.get("blacklist", [])
        if blacklist:
            tags = apply_blacklist(tags, blacklist)
        params.append(f"tags={requests.utils.quote(tags)}")
    if page > 0:
        params.append(f"pid={page}")
    if post_id:
        params.append(f"id={post_id}")
    
    params.append("limit=1000")
    url = base_url + ("&" if params else "") + "&".join(params)
    
    try:
        response = requests.get(url, timeout=30)
        scraper_state["last_request_time"] = time.time()
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, dict) and data.get("success") == "false":
                logger.error(f"API returned error: {data.get('message', 'Unknown error')}")
                return {"error": data.get("message", "API Error")}
            return data if isinstance(data, list) else []
        else:
            logger.error(f"API request failed with status {response.status_code}")
            return {"error": f"HTTP {response.status_code}"}
    except Exception as e:
        logger.error(f"API request exception: {e}", exc_info=True)
        return {"error": str(e)}

# Download helper
def download_image(url, save_path):
    try:
        response = requests.get(url, timeout=30, stream=True)
        if response.status_code == 200:
            with open(save_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            return True
        return False
    except Exception as e:
        logger.error(f"Download exception: {e}")
        return False

# Scraper thread
def scraper_thread():
    logger.info("Scraper thread started")
    while scraper_state["active"]:
        try:
            temp_path = scraper_state.get("temp_path")
            save_path = scraper_state.get("save_path")
            
            if temp_path and not check_storage(temp_path):
                logger.error("Storage critically low")
                scraper_state["storage_warning"] = True
                scraper_state["active"] = False
                break
            
            tags = scraper_state["current_tags"]
            page = scraper_state["current_page"]
            
            if scraper_state["current_mode"] == "newest":
                tags = ""
            
            posts = make_api_request(tags=tags, page=page)
            
            if isinstance(posts, dict) and "error" in posts:
                scraper_state["last_error"] = posts["error"]
                time.sleep(5)
                continue
            
            if not posts:
                if scraper_state["current_mode"] == "search":
                    scraper_state["current_mode"] = "newest"
                    scraper_state["current_page"] = 0
                    continue
                else:
                    time.sleep(10)
                    continue
            
            for post in posts:
                if not scraper_state["active"]:
                    break
                
                post_id = post.get("id")
                if not post_id:
                    continue
                
                status = get_post_status(post_id)
                if status in ["saved", "discarded"]:
                    scraper_state["total_skipped"] += 1
                    continue
                
                tags_str = post.get("tags", "")
                tags_list = [tag.strip() for tag in tags_str.split() if tag.strip()]
                
                if not is_post_indexed(post_id):
                    if es:
                        try:
                            obj_id = str(uuid.uuid4())
                            es.index(index=ES_INDEX, id=obj_id, document={
                                "tags": tags_list,
                                "added": datetime.now(),
                                "post_id": post_id
                            })
                            mark_post_indexed(post_id)
                        except Exception as e:
                            logger.error(f"Elasticsearch error: {e}")
                
                file_url = post.get("file_url")
                if not file_url or not temp_path:
                    continue
                
                os.makedirs(temp_path, exist_ok=True)
                file_ext = os.path.splitext(file_url)[1] or ".jpg"
                temp_file = os.path.join(temp_path, f"{post_id}{file_ext}")
                
                if download_image(file_url, temp_file):
                    with scraper_lock:
                        post_data = {
                            "id": post_id,
                            "file_path": temp_file,
                            "file_url": file_url,
                            "tags": tags_list,
                            "score": post.get("score", 0),
                            "rating": post.get("rating", ""),
                            "width": post.get("width", 0),
                            "height": post.get("height", 0),
                            "preview_url": post.get("preview_url", ""),
                            "owner": post.get("owner", "unknown"),
                            "title": post.get("title", ""),
                            "created_at": post.get("created_at", ""),
                            "change": post.get("change", ""),
                            "file_type": file_ext.lower(),
                            "downloaded_at": datetime.now().isoformat()
                        }
                        
                        json_path = os.path.join(temp_path, f"{post_id}.json")
                        with open(json_path, 'w') as f:
                            json.dump(post_data, f, indent=2)
                    
                    scraper_state["total_processed"] += 1
            
            scraper_state["current_page"] += 1
            time.sleep(1)
            
        except Exception as e:
            logger.error(f"Scraper exception: {e}", exc_info=True)
            scraper_state["last_error"] = str(e)
            time.sleep(5)
    
    logger.info("Scraper thread ended")

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
    return jsonify(scraper_state)

@app.route("/api/bulk_status")
@login_required
def get_bulk_status():
    return jsonify(bulk_operation_state)

@app.route("/api/config", methods=["GET", "POST"])
@login_required
def config():
    if request.method == "POST":
        data = request.json
        for key in ["api_user_id", "api_key", "temp_path", "save_path"]:
            if key in data:
                scraper_state[key] = data[key]
                save_config(key, data[key])
        if "blacklist" in data:
            scraper_state["blacklist"] = data["blacklist"]
            save_config("blacklist", json.dumps(data["blacklist"]))
        return jsonify({"success": True})
    else:
        return jsonify({
            "api_user_id": load_config("api_user_id", ""),
            "api_key": load_config("api_key", ""),
            "temp_path": load_config("temp_path", ""),
            "save_path": load_config("save_path", ""),
            "blacklist": json.loads(load_config("blacklist", "[]"))
        })

@app.route("/api/search_history")
@login_required
def search_history():
    return jsonify(get_search_history())

@app.route("/api/tag_history")
@login_required
def tag_history():
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 50))
    return jsonify(get_tag_history(limit, page))

@app.route("/api/start", methods=["POST"])
@login_required
def start_scraper():
    data = request.json
    tags = data.get("tags", "")
    
    if scraper_state["active"]:
        return jsonify({"error": "Scraper already running"}), 400
    if not scraper_state.get("temp_path") or not scraper_state.get("save_path"):
        return jsonify({"error": "Configure paths first"}), 400
    
    scraper_state["active"] = True
    scraper_state["current_tags"] = tags
    scraper_state["current_page"] = 0
    scraper_state["current_mode"] = "search" if tags else "newest"
    scraper_state["total_processed"] = 0
    scraper_state["total_saved"] = 0
    scraper_state["total_discarded"] = 0
    scraper_state["total_skipped"] = 0
    scraper_state["last_error"] = ""
    
    if tags:
        add_search_history(tags)
    
    threading.Thread(target=scraper_thread, daemon=True).start()
    return jsonify({"success": True})

@app.route("/api/stop", methods=["POST"])
@login_required
def stop_scraper():
    scraper_state["active"] = False
    return jsonify({"success": True})

@app.route("/api/pending")
@login_required
def get_pending():
    temp_path = scraper_state.get("temp_path")
    if not temp_path or not os.path.exists(temp_path):
        return jsonify([])
    
    pending = []
    for filename in os.listdir(temp_path):
        if filename.endswith(".json"):
            json_path = os.path.join(temp_path, filename)
            try:
                with open(json_path, 'r') as f:
                    post_data = json.load(f)
                    post_data['timestamp'] = os.path.getmtime(json_path)
                    pending.append(post_data)
            except:
                pass
    return jsonify(pending)

@app.route("/api/saved")
@login_required
def get_saved():
    save_path = scraper_state.get("save_path")
    if not save_path or not os.path.exists(save_path):
        return jsonify([])
    
    saved = []
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
                        post_data['timestamp'] = os.path.getmtime(json_path)
                        post_data['date_folder'] = date_folder
                        post_id = post_data['id']
                        file_ext = post_data.get('file_type', '.jpg')
                        post_data['file_path'] = os.path.join(folder_path, f"{post_id}{file_ext}")
                        saved.append(post_data)
                except:
                    pass
    return jsonify(saved)

@app.route("/api/save/<post_id>", methods=["POST"])
@login_required
def save_post(post_id):
    temp_path = scraper_state.get("temp_path")
    save_path = scraper_state.get("save_path")
    
    if not temp_path or not save_path:
        return jsonify({"error": "Paths not configured"}), 400
    
    json_path = os.path.join(temp_path, f"{post_id}.json")
    if not os.path.exists(json_path):
        return jsonify({"error": "Post not found"}), 404
    
    with open(json_path, 'r') as f:
        post_data = json.load(f)
    
    date_folder = datetime.now().strftime("%m.%d.%Y")
    target_dir = os.path.join(save_path, date_folder)
    os.makedirs(target_dir, exist_ok=True)
    
    file_path = post_data["file_path"]
    if os.path.exists(file_path):
        file_ext = post_data.get('file_type', os.path.splitext(file_path)[1])
        target_file = os.path.join(target_dir, f"{post_id}{file_ext}")
        target_json = os.path.join(target_dir, f"{post_id}.json")
        
        os.rename(file_path, target_file)
        os.rename(json_path, target_json)
        
        set_post_status(post_id, "saved")
        scraper_state["total_saved"] += 1
        return jsonify({"success": True})
    
    return jsonify({"error": "File not found"}), 404

@app.route("/api/discard/<post_id>", methods=["POST"])
@login_required
def discard_post(post_id):
    temp_path = scraper_state.get("temp_path")
    if not temp_path:
        return jsonify({"error": "Temp path not configured"}), 400
    
    json_path = os.path.join(temp_path, f"{post_id}.json")
    if os.path.exists(json_path):
        with open(json_path, 'r') as f:
            post_data = json.load(f)
        
        file_path = post_data.get("file_path")
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
        os.remove(json_path)
        
        set_post_status(post_id, "discarded")
        scraper_state["total_discarded"] += 1
        return jsonify({"success": True})
    
    return jsonify({"error": "Post not found"}), 404

@app.route("/api/post/<post_id>/size")
@login_required
def get_post_size(post_id):
    temp_path = scraper_state.get("temp_path")
    save_path = scraper_state.get("save_path")
    
    if temp_path and os.path.exists(temp_path):
        for filename in os.listdir(temp_path):
            if filename.startswith(str(post_id)) and not filename.endswith('.json'):
                size = os.path.getsize(os.path.join(temp_path, filename))
                return jsonify({"size": size})
    
    if save_path and os.path.exists(save_path):
        for date_folder in os.listdir(save_path):
            folder_path = os.path.join(save_path, date_folder)
            if not os.path.isdir(folder_path):
                continue
            for filename in os.listdir(folder_path):
                if filename.startswith(str(post_id)) and not filename.endswith('.json'):
                    size = os.path.getsize(os.path.join(folder_path, filename))
                    return jsonify({"size": size})
    
    return jsonify({"size": 0})

@app.route("/api/autocomplete")
@login_required
def autocomplete_tags():
    query = request.args.get('q', '')
    if not query:
        return jsonify([])
    
    try:
        rate_limiter.wait_if_needed()
        response = requests.get(f"https://api.rule34.xxx/autocomplete.php?q={requests.utils.quote(query)}", timeout=10)
        if response.status_code == 200:
            return jsonify(response.json())
        return jsonify([])
    except:
        return jsonify([])

@app.route("/temp/<path:filename>")
@login_required
def serve_temp(filename):
    temp_path = scraper_state.get("temp_path", "")
    return send_from_directory(temp_path, filename)

@app.route("/saved/<date_folder>/<path:filename>")
@login_required
def serve_saved(date_folder, filename):
    save_path = scraper_state.get("save_path", "")
    folder_path = os.path.join(save_path, date_folder)
    return send_from_directory(folder_path, filename)

if __name__ == "__main__":
    scraper_state["api_user_id"] = load_config("api_user_id", "")
    scraper_state["api_key"] = load_config("api_key", "")
    scraper_state["temp_path"] = load_config("temp_path", "")
    scraper_state["save_path"] = load_config("save_path", "")
    scraper_state["blacklist"] = json.loads(load_config("blacklist", "[]"))
    
    logger.info("=" * 60)
    logger.info("Rule34 Scraper Starting")
    logger.info(f"Auth: {AUTH_USERNAME} (set via AUTH_USERNAME env var)")
    logger.info("=" * 60)
    
    app.run(debug=True, host="0.0.0.0", port=5000)