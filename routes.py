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
    queue = services['queue']
    
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
    
    
    # NEW: Video processing diagnostics endpoint
    @app.route("/api/diagnostics/video", methods=["GET"])
    @login_required
    def video_diagnostics():
        """Get video processing diagnostic information"""
        from video_processor import test_video_processing
        
        info = test_video_processing()
        
        return jsonify({
            "ffmpeg_available": info['ffmpeg_available'],
            "ffmpeg_path": info.get('ffmpeg_path'),
            "ffmpeg_version": info.get('ffmpeg_version'),
            "ffprobe_available": info['ffprobe_available'],
            "ffprobe_path": info.get('ffprobe_path'),
            "ffprobe_version": info.get('ffprobe_version'),
            "system": info['system'],
            "errors": info['errors'],
            "recommendations": _get_video_recommendations(info)
        })
    
    def _get_video_recommendations(info):
        """Generate recommendations based on diagnostic info"""
        recommendations = []
        
        if not info['ffmpeg_available']:
            recommendations.append({
                "severity": "error",
                "message": "ffmpeg not found in PATH",
                "solution": "Install ffmpeg and add it to your system PATH. Download from https://ffmpeg.org/download.html"
            })
        
        if not info['ffprobe_available']:
            recommendations.append({
                "severity": "warning",
                "message": "ffprobe not found in PATH",
                "solution": "ffprobe usually comes with ffmpeg. Reinstall ffmpeg or add ffprobe to PATH separately."
            })
        
        if info['errors']:
            recommendations.append({
                "severity": "error",
                "message": f"Found {len(info['errors'])} configuration errors",
                "solution": "Check the errors list and PATH configuration"
            })
        
        if not recommendations:
            recommendations.append({
                "severity": "success",
                "message": "Video processing is properly configured",
                "solution": None
            })
        
        return recommendations
    
    # NEW: File operations queue status
    @app.route("/api/queue/status", methods=["GET"])
    @login_required
    def queue_status():
        """Get file operations queue status"""
        status = queue.get_queue_status()
        return jsonify({
            "queue_size": len(status),
            "operations": status,
            "running": queue.running
        })
    
    # NEW: Clear queue (for testing/admin)
    @app.route("/api/queue/clear", methods=["POST"])
    @login_required
    def queue_clear():
        """Clear all operations from queue"""
        with queue.lock:
            queue_size = len(queue.queue)
            queue.queue.clear()
        
        return jsonify({
            "success": True,
            "cleared": queue_size
        })
    
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
            success = post_service.save_post(post_id)
            if success:
                return jsonify({"success": True})
            else:
                # Add to queue for retry
                from file_operations_queue import OperationType
                queue.add_operation(post_id, OperationType.SAVE)
                return jsonify({
                    "success": False,
                    "error": "File locked - added to retry queue",
                    "queued": True
                }), 202  # 202 Accepted
        except ValidationError as e:
            return jsonify({"error": str(e)}), 400
        except StorageError as e:
            # Add to queue for retry
            from file_operations_queue import OperationType
            queue.add_operation(post_id, OperationType.SAVE)
            return jsonify({
                "error": str(e),
                "queued": True
            }), 202
    
    @app.route("/api/discard/<int:post_id>", methods=["POST"])
    @login_required
    def discard_post(post_id):
        try:
            success = post_service.discard_post(post_id)
            if success:
                return jsonify({"success": True})
            else:
                # Add to queue for retry
                from file_operations_queue import OperationType
                queue.add_operation(post_id, OperationType.DISCARD)
                return jsonify({
                    "success": False,
                    "error": "File locked - added to retry queue",
                    "queued": True
                }), 202
        except ValidationError as e:
            return jsonify({"error": str(e)}), 400
        except StorageError as e:
            from file_operations_queue import OperationType
            queue.add_operation(post_id, OperationType.DISCARD)
            return jsonify({
                "error": str(e),
                "queued": True
            }), 202
    
    @app.route("/api/delete/<int:post_id>", methods=["POST"])
    @login_required
    def delete_saved_post(post_id):
        try:
            data = request.json or {}
            date_folder = data.get('date_folder')
            
            if not date_folder:
                return jsonify({"error": "date_folder required"}), 400
            
            success = post_service.delete_saved_post(post_id, date_folder)
            if success:
                return jsonify({"success": True})
            else:
                # Add to queue for retry
                from file_operations_queue import OperationType
                queue.add_operation(post_id, OperationType.DELETE, date_folder)
                return jsonify({
                    "success": False,
                    "error": "File locked - added to retry queue",
                    "queued": True
                }), 202
        except ValidationError as e:
            return jsonify({"error": str(e)}), 400
        except StorageError as e:
            from file_operations_queue import OperationType
            queue.add_operation(post_id, OperationType.DELETE, date_folder)
            return jsonify({
                "error": str(e),
                "queued": True
            }), 202
    
    logger.info("Routes registered successfully")
    
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

    @app.route("/api/post/<int:post_id>/duration", methods=["GET"])
    @login_required
    def get_video_duration(post_id):
        """Get video duration for a post on-demand"""
        try:
            post_id = validate_post_id(post_id)
            
            # Find the video file
            from video_processor import get_video_processor
            processor = get_video_processor()
            
            # Check temp directory
            video_path = None
            
            if file_manager.temp_path and os.path.exists(file_manager.temp_path):
                for filename in os.listdir(file_manager.temp_path):
                    if filename.startswith(str(post_id)) and filename.endswith(('.mp4', '.webm')):
                        video_path = os.path.join(file_manager.temp_path, filename)
                        logger.info(f"Found video in temp: {video_path}")
                        break
            
            # Check save directory if not found
            if not video_path and file_manager.save_path and os.path.exists(file_manager.save_path):
                for date_folder in os.listdir(file_manager.save_path):
                    folder_path = os.path.join(file_manager.save_path, date_folder)
                    if not os.path.isdir(folder_path):
                        continue
                    for filename in os.listdir(folder_path):
                        if filename.startswith(str(post_id)) and filename.endswith(('.mp4', '.webm')):
                            video_path = os.path.join(folder_path, filename)
                            logger.info(f"Found video in {date_folder}: {video_path}")
                            break
                    if video_path:
                        break
            
            if not video_path:
                logger.error(f"Video not found for post {post_id}")
                return jsonify({"error": "Video not found"}), 404
            
            # Get duration
            logger.info(f"Getting duration for: {video_path}")
            duration = processor.get_video_duration(video_path)
            
            if duration is not None:
                logger.info(f"Retrieved duration for post {post_id}: {duration}s")
                return jsonify({
                    "success": True,
                    "duration": duration,
                    "post_id": post_id
                })
            else:
                logger.error(f"Failed to get video duration for post {post_id}")
                return jsonify({"error": "Failed to get video duration"}), 500
                
        except ValidationError as e:
            logger.error(f"Validation error for post {post_id}: {e}")
            return jsonify({"error": str(e)}), 400
        except Exception as e:
            logger.error(f"Duration retrieval error for post {post_id}: {e}", exc_info=True)
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