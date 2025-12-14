"""Route handlers for the Flask application"""
import logging
from flask import request, jsonify, render_template, session, redirect, url_for, send_from_directory
from functools import wraps
from exceptions import ValidationError, PostNotFoundError, StorageError
from validators import validate_username, validate_password

logger = logging.getLogger(__name__)


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
    
    # Authentication decorator
    def login_required(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'logged_in' not in session:
                return redirect(url_for('login'))
            return f(*args, **kwargs)
        return decorated_function
    
    # Authentication routes
    @app.route("/login", methods=["GET", "POST"])
    def login():
        if request.method == "POST":
            try:
                data = request.json or {}
                username = validate_username(data.get("username", ""))
                password = validate_password(data.get("password", ""))
                
                if username == config.AUTH_USERNAME and password == config.AUTH_PASSWORD:
                    session['logged_in'] = True
                    return jsonify({"success": True})
                
                return jsonify({"success": False, "error": "Invalid credentials"}), 401
            except ValidationError as e:
                return jsonify({"success": False, "error": str(e)}), 400
        
        return render_template("login.html")
    
    @app.route("/logout")
    def logout():
        session.pop('logged_in', None)
        return redirect(url_for('login'))
    
    # Main route
    @app.route("/")
    @login_required
    def index():
        tag_counts = tag_service.get_tag_counts()
        import json
        return render_template("index.html", tag_counts=json.dumps(tag_counts))
    
    # Status route
    @app.route("/api/status")
    @login_required
    def get_status():
        return jsonify(scraper_service.get_status())
    
    # Config routes
    @app.route("/api/config", methods=["GET", "POST"])
    @login_required
    def api_config():
        try:
            if request.method == "POST":
                data = request.json or {}
                config_service.save_config(data)
                return jsonify({"success": True})
            else:
                return jsonify(config_service.get_config())
        except ValidationError as e:
            return jsonify({"error": str(e)}), 400
        except Exception as e:
            logger.error(f"Config error: {e}", exc_info=True)
            return jsonify({"error": "Internal server error"}), 500
    
    # Search history route
    @app.route("/api/search_history")
    @login_required
    def search_history():
        return jsonify(search_service.get_search_history())
    
    # Tag history route
    @app.route("/api/tag_history")
    @login_required
    def tag_history():
        try:
            page = int(request.args.get('page', 1))
            limit = int(request.args.get('limit', 50))
            return jsonify(tag_service.get_tag_history(page, limit))
        except ValidationError as e:
            return jsonify({"error": str(e)}), 400
    
    # Tag counts routes
    @app.route("/api/tag_counts")
    @login_required
    def get_tag_counts():
        return jsonify(tag_service.get_tag_counts())
    
    @app.route("/api/rebuild_tag_counts", methods=["POST"])
    @login_required
    def rebuild_tag_counts():
        success = tag_service.rebuild_tag_counts(
            file_manager.temp_path, 
            file_manager.save_path
        )
        return jsonify({"success": success})
    
    # Scraper control routes
    @app.route("/api/start", methods=["POST"])
    @login_required
    def start_scraper():
        try:
            data = request.json or {}
            tags = data.get("tags", "")
            
            if scraper_service.start_scraper(tags):
                return jsonify({"success": True})
            else:
                return jsonify({"error": "Failed to start scraper"}), 400
        except ValidationError as e:
            return jsonify({"error": str(e)}), 400
    
    @app.route("/api/stop", methods=["POST"])
    @login_required
    def stop_scraper():
        scraper_service.stop_scraper()
        return jsonify({"success": True})
    
    # Post routes
    @app.route("/api/posts")
    @login_required
    def get_posts():
        try:
            filter_type = request.args.get('filter', 'all')
            posts = post_service.get_posts(filter_type)
            return jsonify(posts)
        except ValidationError as e:
            return jsonify({"error": str(e)}), 400
    
    @app.route("/api/pending")
    @login_required
    def get_pending():
        """Legacy endpoint"""
        return jsonify(post_service.get_posts('pending'))
    
    @app.route("/api/saved")
    @login_required
    def get_saved():
        """Legacy endpoint"""
        return jsonify(post_service.get_posts('saved'))
    
    @app.route("/api/save/<int:post_id>", methods=["POST"])
    @login_required
    def save_post(post_id):
        try:
            post_service.save_post(post_id)
            return jsonify({"success": True})
        except ValidationError as e:
            return jsonify({"error": str(e)}), 400
        except StorageError as e:
            return jsonify({"error": str(e)}), 500
    
    @app.route("/api/discard/<int:post_id>", methods=["POST"])
    @login_required
    def discard_post(post_id):
        try:
            post_service.discard_post(post_id)
            return jsonify({"success": True})
        except ValidationError as e:
            return jsonify({"error": str(e)}), 400
        except StorageError as e:
            return jsonify({"error": str(e)}), 500
    
    @app.route("/api/delete/<int:post_id>", methods=["POST"])
    @login_required
    def delete_saved_post(post_id):
        try:
            data = request.json or {}
            date_folder = data.get('date_folder')
            
            if not date_folder:
                return jsonify({"error": "date_folder required"}), 400
            
            post_service.delete_saved_post(post_id, date_folder)
            return jsonify({"success": True})
        except ValidationError as e:
            return jsonify({"error": str(e)}), 400
        except StorageError as e:
            return jsonify({"error": str(e)}), 500
    
    @app.route("/api/post/<int:post_id>/size")
    @login_required
    def get_post_size(post_id):
        try:
            size = post_service.get_post_size(post_id)
            return jsonify({"size": size})
        except ValidationError as e:
            return jsonify({"error": str(e)}), 400
    
    # Autocomplete route
    @app.route("/api/autocomplete")
    @login_required
    def autocomplete_tags():
        query = request.args.get('q', '')
        suggestions = autocomplete_service.get_suggestions(query)
        return jsonify(suggestions)
    
    # File serving routes
    @app.route("/temp/<path:filename>")
    @login_required
    def serve_temp(filename):
        return send_from_directory(file_manager.temp_path, filename)
    
    @app.route("/saved/<date_folder>/<path:filename>")
    @login_required
    def serve_saved(date_folder, filename):
        import os
        folder_path = os.path.join(file_manager.save_path, date_folder)
        return send_from_directory(folder_path, filename)
    
    logger.info("Routes registered successfully")