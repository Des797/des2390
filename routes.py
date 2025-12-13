"""
Flask routes module
Separates routing logic from application initialization
"""
import json
from flask import Blueprint, render_template, request, jsonify, send_from_directory, session, redirect, url_for
from functools import wraps

# Create blueprints
main_bp = Blueprint('main', __name__)
api_bp = Blueprint('api', __name__, url_prefix='/api')
files_bp = Blueprint('files', __name__)


def login_required(f):
    """Authentication decorator"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session:
            return redirect(url_for('main.login'))
        return f(*args, **kwargs)
    return decorated_function


def init_routes(app, db, scraper, file_manager, api_client, auth_username, auth_password):
    """Initialize all routes with dependencies"""
    
    # ============================================================================
    # Main Routes
    # ============================================================================
    
    @main_bp.route("/login", methods=["GET", "POST"])
    def login():
        if request.method == "POST":
            data = request.json
            if data.get("username") == auth_username and data.get("password") == auth_password:
                session['logged_in'] = True
                return jsonify({"success": True})
            return jsonify({"success": False, "error": "Invalid credentials"}), 401
        return render_template("login.html")
    
    @main_bp.route("/logout")
    def logout():
        session.pop('logged_in', None)
        return redirect(url_for('main.login'))
    
    @main_bp.route("/")
    @login_required
    def index():
        tag_counts = db.get_all_tag_counts()
        return render_template("index.html", tag_counts=json.dumps(tag_counts))
    
    # ============================================================================
    # API Routes - Status & Control
    # ============================================================================
    
    @api_bp.route("/status")
    @login_required
    def get_status():
        return jsonify(scraper.get_state())
    
    @api_bp.route("/start", methods=["POST"])
    @login_required
    def start_scraper():
        data = request.json
        tags = data.get("tags", "")
        
        if scraper.start(tags):
            return jsonify({"success": True})
        else:
            return jsonify({"error": "Failed to start scraper"}), 400
    
    @api_bp.route("/stop", methods=["POST"])
    @login_required
    def stop_scraper():
        scraper.stop()
        return jsonify({"success": True})
    
    # ============================================================================
    # API Routes - Configuration
    # ============================================================================
    
    @api_bp.route("/config", methods=["GET", "POST"])
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
    
    # ============================================================================
    # API Routes - History & Tags
    # ============================================================================
    
    @api_bp.route("/search_history")
    @login_required
    def search_history():
        return jsonify(db.get_search_history())
    
    @api_bp.route("/tag_history")
    @login_required
    def tag_history():
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 50))
        return jsonify(db.get_tag_history(limit, page))
    
    @api_bp.route("/tag_counts")
    @login_required
    def get_tag_counts():
        return jsonify(db.get_all_tag_counts())
    
    @api_bp.route("/rebuild_tag_counts", methods=["POST"])
    @login_required
    def rebuild_tag_counts():
        db.rebuild_tag_counts(file_manager.temp_path, file_manager.save_path)
        return jsonify({"success": True})
    
    # ============================================================================
    # API Routes - Posts
    # ============================================================================
    
    @api_bp.route("/posts")
    @login_required
    def get_posts():
        filter_type = request.args.get('filter', 'all')
        
        if filter_type == 'pending':
            posts = file_manager.get_pending_posts()
        elif filter_type == 'saved':
            posts = file_manager.get_saved_posts()
        else:  # all
            posts = file_manager.get_all_posts()
        
        return jsonify(posts)
    
    @api_bp.route("/pending")
    @login_required
    def get_pending():
        """Legacy endpoint"""
        return jsonify(file_manager.get_pending_posts())
    
    @api_bp.route("/saved")
    @login_required
    def get_saved():
        """Legacy endpoint"""
        return jsonify(file_manager.get_saved_posts())
    
    @api_bp.route("/save/<int:post_id>", methods=["POST"])
    @login_required
    def save_post(post_id):
        if file_manager.save_post_to_archive(post_id):
            db.set_post_status(post_id, "saved")
            
            with scraper.lock:
                scraper.state["total_saved"] += 1
            
            return jsonify({"success": True})
        else:
            return jsonify({"error": "Failed to save post"}), 500
    
    @api_bp.route("/discard/<int:post_id>", methods=["POST"])
    @login_required
    def discard_post(post_id):
        post_data = file_manager.load_post_json(post_id, file_manager.temp_path)
        
        if file_manager.discard_post(post_id):
            db.set_post_status(post_id, "discarded")
            
            if post_data and 'tags' in post_data:
                db.update_tag_counts(post_data['tags'], increment=False)
            
            with scraper.lock:
                scraper.state["total_discarded"] += 1
            
            return jsonify({"success": True})
        else:
            return jsonify({"error": "Failed to discard post"}), 500
    
    @api_bp.route("/delete/<int:post_id>", methods=["POST"])
    @login_required
    def delete_saved_post(post_id):
        data = request.json
        date_folder = data.get('date_folder')
        
        if not date_folder:
            return jsonify({"error": "date_folder required"}), 400
        
        import os
        folder_path = os.path.join(file_manager.save_path, date_folder)
        post_data = file_manager.load_post_json(post_id, folder_path)
        
        if file_manager.delete_saved_post(post_id, date_folder):
            if post_data and 'tags' in post_data:
                db.update_tag_counts(post_data['tags'], increment=False)
            
            return jsonify({"success": True})
        else:
            return jsonify({"error": "Failed to delete post"}), 500
    
    @api_bp.route("/post/<int:post_id>/size")
    @login_required
    def get_post_size(post_id):
        size = file_manager.get_file_size(post_id)
        return jsonify({"size": size})
    
    @api_bp.route("/autocomplete")
    @login_required
    def autocomplete_tags():
        query = request.args.get('q', '')
        suggestions = api_client.get_autocomplete_tags(query)
        return jsonify(suggestions)
    
    # ============================================================================
    # File Serving Routes
    # ============================================================================
    
    @files_bp.route("/temp/<path:filename>")
    @login_required
    def serve_temp(filename):
        return send_from_directory(file_manager.temp_path, filename)
    
    @files_bp.route("/saved/<date_folder>/<path:filename>")
    @login_required
    def serve_saved(date_folder, filename):
        import os
        folder_path = os.path.join(file_manager.save_path, date_folder)
        return send_from_directory(folder_path, filename)
    
    # Register blueprints
    app.register_blueprint(main_bp)
    app.register_blueprint(api_bp)
    app.register_blueprint(files_bp)