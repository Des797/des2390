"""Route handlers for the Flask application"""
import logging
import json
import time
import os
from flask import request, jsonify, render_template, session, redirect, url_for, send_from_directory, Response
from functools import wraps
from exceptions import ValidationError, PostNotFoundError, StorageError
from validators import validate_username, validate_password, validate_post_id

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
    
    @app.route("/api/rebuild_cache", methods=["POST"])
    @login_required
    def rebuild_cache():
        """Manually rebuild the post cache"""
        try:
            from database import Database
            db = Database(config.DATABASE_PATH)
            success = db.rebuild_cache_from_files(file_manager)
            return jsonify({"success": success})
        except Exception as e:
            logger.error(f"Cache rebuild failed: {e}", exc_info=True)
            return jsonify({"success": False, "error": str(e)}), 500
    
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
    
    # FIXED: Main posts endpoint with proper error handling
    @app.route("/api/posts")
    @login_required
    def get_posts():
        try:
            filter_type = request.args.get('filter', 'all')
            logger.info(f"Loading posts with filter: {filter_type}")
            
            posts = post_service.get_posts(filter_type)
            logger.info(f"Successfully loaded {len(posts)} posts")
            
            return jsonify(posts)
        except ValidationError as e:
            logger.error(f"Validation error loading posts: {e}")
            return jsonify({"error": str(e)}), 400
        except Exception as e:
            logger.error(f"Unexpected error loading posts: {e}", exc_info=True)
            return jsonify({"error": f"Failed to load posts: {str(e)}"}), 500

    @app.route("/api/posts/stream")
    @login_required
    def stream_posts():
        """Stream posts with progress updates - uses fast database cache"""
        filter_type = request.args.get('filter', 'all')
        
        def generate():
            try:
                start_time = time.time()
                
                # Send initial status
                yield f"data: {json.dumps({'type': 'status', 'message': 'Loading from cache...'})}\n\n"
                
                # Get posts from cache (FAST!)
                status = None if filter_type == 'all' else filter_type
                posts = post_service.get_posts_cached(
                    status=status,
                    limit=100000,
                    sort_by='timestamp',
                    order='DESC'
                )
                
                total = len(posts)
                chunk_size = 100
                
                logger.info(f"Streaming {total} cached posts in chunks of {chunk_size}")
                
                # Send posts in chunks
                for i in range(0, total, chunk_size):
                    chunk = posts[i:i + chunk_size]
                    progress = min(i + chunk_size, total)
                    
                    yield f"data: {json.dumps({'type': 'chunk', 'posts': chunk, 'progress': progress, 'total': total})}\n\n"
                    time.sleep(0.01)
                
                load_time = time.time() - start_time
                logger.info(f"Finished streaming {total} posts from cache in {load_time:.2f}s")
                
                # Send completion
                yield f"data: {json.dumps({'type': 'complete', 'total': total})}\n\n"
                
            except Exception as e:
                logger.error(f"Streaming error: {e}", exc_info=True)
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        
        return Response(generate(), mimetype='text/event-stream', headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no'
        })
    
    @app.route("/api/pending")
    @login_required
    def get_pending():
        """Legacy endpoint"""
        try:
            return jsonify(post_service.get_posts('pending'))
        except Exception as e:
            logger.error(f"Error loading pending posts: {e}", exc_info=True)
            return jsonify({"error": str(e)}), 500
    
    @app.route("/api/saved")
    @login_required
    def get_saved():
        """Legacy endpoint"""
        try:
            return jsonify(post_service.get_posts('saved'))
        except Exception as e:
            logger.error(f"Error loading saved posts: {e}", exc_info=True)
            return jsonify({"error": str(e)}), 500
    
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

    @app.route("/api/post/<int:post_id>/generate-thumbnail", methods=["POST"])
    @login_required
    def generate_thumbnail(post_id):
        """Generate thumbnail for a video post on-demand"""
        try:
            post_id = validate_post_id(post_id)
            
            # Find the video file
            from video_processor import get_video_processor
            processor = get_video_processor()
            
            # Check temp directory
            video_path = None
            video_location = None  # Track where we found it
            
            if file_manager.temp_path:
                for filename in os.listdir(file_manager.temp_path):
                    if filename.startswith(str(post_id)) and filename.endswith(('.mp4', '.webm')):
                        video_path = os.path.join(file_manager.temp_path, filename)
                        video_location = 'temp'
                        break
            
            # Check save directory if not found
            if not video_path and file_manager.save_path:
                for date_folder in os.listdir(file_manager.save_path):
                    folder_path = os.path.join(file_manager.save_path, date_folder)
                    if not os.path.isdir(folder_path):
                        continue
                    for filename in os.listdir(folder_path):
                        if filename.startswith(str(post_id)) and filename.endswith(('.mp4', '.webm')):
                            video_path = os.path.join(folder_path, filename)
                            video_location = f'saved/{date_folder}'
                            break
                    if video_path:
                        break
            
            if not video_path:
                return jsonify({"error": "Video not found"}), 404
            
            # Generate thumbnail
            thumb_path = processor.generate_thumbnail_at_percentage(video_path, percentage=10.0)
            
            if thumb_path:
                # Convert to URL path
                if video_location == 'temp':
                    # Extract relative path from temp_path
                    relative_path = thumb_path.replace(file_manager.temp_path, '').lstrip(os.sep)
                    thumbnail_url = f"/temp/{relative_path.replace(os.sep, '/')}"
                else:
                    # Extract relative path from save_path
                    relative_path = thumb_path.replace(file_manager.save_path, '').lstrip(os.sep)
                    thumbnail_url = f"/saved/{relative_path.replace(os.sep, '/')}"
                
                logger.info(f"Generated thumbnail for post {post_id}: {thumbnail_url}")
                
                return jsonify({
                    "success": True,
                    "thumbnail_url": thumbnail_url,
                    "post_id": post_id
                })
            else:
                return jsonify({"error": "Thumbnail generation failed"}), 500
                
        except Exception as e:
            logger.error(f"Thumbnail generation error: {e}", exc_info=True)
            return jsonify({"error": str(e)}), 500

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
        logger.debug(f"Serving temp file: {filename}")
        return send_from_directory(file_manager.temp_path, filename)

    @app.route("/saved/<date_folder>/<path:filename>")
    @login_required
    def serve_saved(date_folder, filename):
        folder_path = os.path.join(file_manager.save_path, date_folder)
        logger.debug(f"Serving saved file: {date_folder}/{filename}")
        return send_from_directory(folder_path, filename)
    
    logger.info("Routes registered successfully")