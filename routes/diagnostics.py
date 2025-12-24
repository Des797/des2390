"""Diagnostic and debug route handlers"""
import logging
import json
import os
import sys
import time
import traceback
from flask import request, jsonify

logger = logging.getLogger(__name__)


def create_diagnostic_routes(app, config, services, login_required):
    """Register diagnostic and debug routes"""
    
    post_service = services['post']
    file_manager = services['file_manager']
    queue = services['queue']
    
    @app.route("/api/health")
    def health_check():
        """Quick health check endpoint - no authentication required"""
        return jsonify({
            "status": "ok",
            "timestamp": time.time(),
            "message": "Server is running"
        })

    @app.route("/api/debug/init")
    @login_required
    def debug_init():
        """Debug endpoint to check what's happening on initialization"""
        try:
            # Check cache status
            cache_count = post_service.database.get_cache_count()
            cache_empty = post_service.database.is_cache_empty()
            
            # Check if cache is being initialized
            cache_initialized = post_service._cache_initialized
            
            return jsonify({
                "status": "ok",
                "cache_count": cache_count,
                "cache_empty": cache_empty,
                "cache_initialized": cache_initialized,
                "python_version": sys.version,
                "cwd": os.getcwd(),
                "temp_path": file_manager.temp_path,
                "save_path": file_manager.save_path,
                "database_path": config.DATABASE_PATH
            })
        except Exception as e:
            logger.error(f"Debug init error: {e}", exc_info=True)
            return jsonify({
                "status": "error",
                "error": str(e),
                "traceback": traceback.format_exc()
            }), 500
    
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

    @app.route("/api/fix_file_types", methods=["POST"])
    @login_required
    def fix_file_types():
        """Fix file_type mismatches between metadata and actual files"""
        try:
            fixed_count = 0
            errors = []
            
            # Check temp directory
            if file_manager.temp_path and os.path.exists(file_manager.temp_path):
                entries = list(os.scandir(file_manager.temp_path))
                file_map = {}
                json_files = []
                
                for entry in entries:
                    if entry.is_file():
                        if entry.name.endswith('.json'):
                            json_files.append(entry.name)
                        elif '_thumb' not in entry.name:
                            base_name = entry.name.rsplit('.', 1)[0]
                            try:
                                post_id = int(base_name)
                                file_map[post_id] = entry.name
                            except ValueError:
                                continue
                
                for json_file in json_files:
                    json_path = os.path.join(file_manager.temp_path, json_file)
                    try:
                        with open(json_path, 'r') as f:
                            post_data = json.load(f)
                        
                        post_id = post_data.get('id')
                        if post_id and post_id in file_map:
                            actual_filename = file_map[post_id]
                            actual_ext = os.path.splitext(actual_filename)[1]
                            stored_ext = post_data.get('file_type', '')
                            
                            if actual_ext.lower() != stored_ext.lower():
                                post_data['file_type'] = actual_ext
                                with open(json_path, 'w') as f:
                                    json.dump(post_data, f, indent=2)
                                fixed_count += 1
                                logger.info(f"Fixed post {post_id}: {stored_ext} -> {actual_ext}")
                    except Exception as e:
                        errors.append(f"Post {json_file}: {str(e)}")
            
            # Check saved directories
            if file_manager.save_path and os.path.exists(file_manager.save_path):
                for date_folder in os.listdir(file_manager.save_path):
                    folder_path = os.path.join(file_manager.save_path, date_folder)
                    if not os.path.isdir(folder_path):
                        continue
                    
                    entries = list(os.scandir(folder_path))
                    file_map = {}
                    json_files = []
                    
                    for entry in entries:
                        if entry.is_file():
                            if entry.name.endswith('.json'):
                                json_files.append(entry.name)
                            elif '_thumb' not in entry.name:
                                base_name = entry.name.rsplit('.', 1)[0]
                                try:
                                    post_id = int(base_name)
                                    file_map[post_id] = entry.name
                                except ValueError:
                                    continue
                    
                    for json_file in json_files:
                        json_path = os.path.join(folder_path, json_file)
                        try:
                            with open(json_path, 'r') as f:
                                post_data = json.load(f)
                            
                            post_id = post_data.get('id')
                            if post_id and post_id in file_map:
                                actual_filename = file_map[post_id]
                                actual_ext = os.path.splitext(actual_filename)[1]
                                stored_ext = post_data.get('file_type', '')
                                
                                if actual_ext.lower() != stored_ext.lower():
                                    post_data['file_type'] = actual_ext
                                    with open(json_path, 'w') as f:
                                        json.dump(post_data, f, indent=2)
                                    fixed_count += 1
                                    logger.info(f"Fixed post {post_id}: {stored_ext} -> {actual_ext}")
                        except Exception as e:
                            errors.append(f"Post {json_file}: {str(e)}")
            
            # Rebuild cache with fixed metadata
            if fixed_count > 0:
                from database import Database
                db = Database(config.DATABASE_PATH)
                db.rebuild_cache_from_files(file_manager)
                logger.info(f"Rebuilt cache after fixing {fixed_count} file_type mismatches")
            
            return jsonify({
                "success": True,
                "fixed_count": fixed_count,
                "errors": errors
            })
        except Exception as e:
            logger.error(f"Fix file types failed: {e}", exc_info=True)
            return jsonify({"success": False, "error": str(e)}), 500