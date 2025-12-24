"""Post management route handlers"""
import logging
import json
import time
import os
from flask import request, jsonify, render_template, Response
from exceptions import ValidationError, StorageError
from validators import validate_post_id

logger = logging.getLogger(__name__)


def create_post_routes(app, config, services, login_required):
    """Register post-related routes"""
    
    post_service = services['post']
    tag_service = services['tag']
    file_manager = services['file_manager']
    queue = services['queue']
    autocomplete_service = services['autocomplete']
    
    @app.route("/")
    @login_required
    def index():
        tag_counts = tag_service.get_tag_counts()
        return render_template("index.html", tag_counts=json.dumps(tag_counts))
    
    @app.route("/api/posts")
    @login_required
    def get_posts():
        """
        OPTIMIZED: Returns total count immediately, then streams posts
        Frontend should use /api/posts/stream for large datasets
        """
        try:
            filter_type = request.args.get('filter', 'all')
            
            # Get total count first (fast)
            total = post_service.get_total_count(filter_type)
            
            # For small datasets, return all at once
            if total <= 1000:
                result = post_service.get_posts(filter_type, limit=total, offset=0)
                return jsonify({
                    'posts': result['posts'],
                    'total': total,
                    'loaded': len(result['posts'])
                })
            
            # For large datasets, return metadata and suggest streaming
            return jsonify({
                'posts': [],
                'total': total,
                'loaded': 0,
                'message': 'Dataset too large, use /api/posts/stream endpoint',
                'use_streaming': True
            })
            
        except Exception as e:
            logger.error(f"Error loading posts: {e}", exc_info=True)
            return jsonify({"error": str(e)}), 500

    @app.route("/api/posts/stream")
    @login_required
    def stream_posts():
        """
        OPTIMIZED: Stream posts in chunks with progress updates
        Uses database pagination instead of loading everything
        """
        filter_type = request.args.get('filter', 'all')
        
        def generate():
            try:
                start_time = time.time()
                
                # Get total count (fast with index)
                yield f"data: {json.dumps({'type': 'status', 'message': 'Counting posts...'})}\n\n"
                
                status = None if filter_type == 'all' else filter_type
                total = post_service.get_total_count(filter_type)
                
                yield f"data: {json.dumps({'type': 'status', 'message': f'Loading {total} posts...'})}\n\n"
                
                # Stream in chunks using database pagination
                chunk_size = 500  # Fetch 500 at a time from DB
                offset = 0
                loaded = 0
                
                logger.info(f"Streaming {total} posts in chunks of {chunk_size}")
                
                while offset < total:
                    # Fetch chunk from database
                    posts = post_service.get_posts_cached(
                        status=status,
                        limit=chunk_size,
                        offset=offset,
                        sort_by='timestamp',
                        order='DESC'
                    )
                    
                    if not posts:
                        break
                    
                    loaded += len(posts)
                    
                    # Send chunk to client
                    yield f"data: {json.dumps({'type': 'chunk', 'posts': posts, 'progress': loaded, 'total': total})}\n\n"
                    
                    offset += chunk_size
                    
                    # Small delay to prevent overwhelming client
                    time.sleep(0.01)
                
                load_time = time.time() - start_time
                logger.info(f"Finished streaming {loaded} posts in {load_time:.2f}s")
                
                # Send completion
                yield f"data: {json.dumps({'type': 'complete', 'total': loaded, 'time': load_time})}\n\n"
                
            except Exception as e:
                logger.error(f"Streaming error: {e}", exc_info=True)
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        
        return Response(generate(), mimetype='text/event-stream', headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no'
        })
    
    @app.route("/api/posts/paginated")
    @login_required
    def get_posts_paginated():
        """
        OPTIMIZED: Server-side pagination WITH sorting and text search
        
        Query params:
            - filter: 'all', 'pending', 'saved'
            - limit: number of posts per page (default 42, max 1000)
            - offset: starting position (default 0)
            - sort: sort column (timestamp, score, id, owner, width, height, tags, upload, download)
            - order: 'asc' or 'desc' (default 'desc')
            - search: text search query (searches owner, title, tags)
        
        Returns:
            {
                'posts': [...],     # Only the requested page, sorted
                'total': count,     # Total matching posts (with filters/search)
                'limit': limit,
                'offset': offset,
                'sort': sort,
                'order': order
            }
        """
        try:
            # Parse parameters
            filter_type = request.args.get('filter', 'all')
            limit = int(request.args.get('limit', 42))
            offset = int(request.args.get('offset', 0))
            sort_by = request.args.get('sort', 'timestamp')
            order = request.args.get('order', 'desc').upper()
            search_query = request.args.get('search', '').strip()
            
            # Validate
            if limit < 1 or limit > 1000:
                return jsonify({"error": "limit must be between 1 and 1000"}), 400
            if offset < 0:
                return jsonify({"error": "offset cannot be negative"}), 400
            if order not in ['ASC', 'DESC']:
                return jsonify({"error": "order must be 'asc' or 'desc'"}), 400
            
            # Map frontend sort names to backend columns
            sort_mapping = {
                'download': 'downloaded_at',
                'upload': 'created_at',
                'id': 'post_id',
                'tags': 'tags',  # Will be handled specially (tag count)
                'size': 'timestamp'  # Size requires file I/O, fallback to timestamp
            }
            sort_by = sort_mapping.get(sort_by, sort_by)
            
            logger.info(
                f"Paginated request: filter={filter_type}, limit={limit}, offset={offset}, "
                f"sort={sort_by} {order}, search='{search_query}'"
            )
            
            # CRITICAL: Pass search_query to service
            logger.info(f"Calling post_service.get_posts with search_query='{search_query}'")
            result = post_service.get_posts(
                filter_type=filter_type,
                limit=limit,
                offset=offset,
                sort_by=sort_by,
                order=order,
                search_query=search_query if search_query else None  # Pass search!
            )
            
            # Add sort/search info to response
            result['sort'] = sort_by
            result['order'] = order.lower()
            result['search'] = search_query
            
            logger.info(
                f"Returning {len(result['posts'])} posts, total={result['total']} "
                f"(sorted by {sort_by} {order}, search='{search_query}')"
            )
            
            return jsonify(result)
            
        except Exception as e:
            logger.error(f"Paginated endpoint error: {e}", exc_info=True)
            return jsonify({"error": str(e)}), 500
    
    @app.route("/api/posts/ids")
    @login_required
    def get_post_ids():
        """
        Get all post IDs matching filter/search (for bulk selection)
        Returns only IDs, not full post data
        """
        try:
            filter_type = request.args.get('filter', 'all')
            search_query = request.args.get('search', '').strip()
            
            # Use database directly for efficiency
            status = None if filter_type == 'all' else filter_type
            
            with post_service.database.core.get_connection() as conn:
                query = "SELECT post_id FROM post_cache WHERE 1=1"
                params = []
                
                if status:
                    query += " AND status = ?"
                    params.append(status)
                
                if search_query:
                    search_term = f"%{search_query}%"
                    query += " AND (owner LIKE ? OR title LIKE ? OR tags LIKE ?)"
                    params.extend([search_term, search_term, search_term])
                
                cursor = conn.execute(query, params)
                ids = [row[0] for row in cursor.fetchall()]
            
            return jsonify({
                'ids': ids,
                'count': len(ids)
            })
        except Exception as e:
            logger.error(f"Error getting post IDs: {e}", exc_info=True)
            return jsonify({"error": str(e)}), 500

    @app.route("/api/posts/top-tags")
    @login_required
    def get_top_tags():
        """
        Get most common tags in current search results
        
        Query params:
            - filter: 'all', 'pending', 'saved'
            - search: search query
            - limit: number of tags (default 50)
        """
        try:
            filter_type = request.args.get('filter', 'all')
            search_query = request.args.get('search', '').strip()
            limit = int(request.args.get('limit', 50))
            
            top_tags = post_service.get_top_tags(
                filter_type,
                search_query if search_query else None,
                limit
            )
            
            return jsonify({
                'tags': top_tags,
                'count': len(top_tags)
            })
        except Exception as e:
            logger.error(f"Error getting top tags: {e}", exc_info=True)
            return jsonify({"error": str(e)}), 500

    @app.route("/api/posts/count")
    @login_required
    def get_posts_count():
        """
        Fast endpoint to get total count with optional search filter
        
        Query params:
            - filter: 'all', 'pending', 'saved'
            - search: text search query
        """
        try:
            filter_type = request.args.get('filter', 'all')
            search_query = request.args.get('search', '').strip()
            
            total = post_service.get_total_count(
                filter_type, 
                search_query if search_query else None
            )
            
            return jsonify({
                'total': total,
                'filter': filter_type,
                'search': search_query
            })
        except Exception as e:
            logger.error(f"Error getting count: {e}", exc_info=True)
            return jsonify({"error": str(e)}), 500

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

    @app.route("/api/autocomplete")
    @login_required
    def autocomplete_tags():
        query = request.args.get('q', '')
        suggestions = autocomplete_service.get_suggestions(query)
        return jsonify(suggestions)