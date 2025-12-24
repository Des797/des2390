"""File serving route handlers"""
import logging
import json
import os
from flask import request, jsonify, send_from_directory

logger = logging.getLogger(__name__)


def create_file_routes(app, services, login_required):
    """Register file serving routes"""
    
    file_manager = services['file_manager']
    
    @app.route("/temp/<path:filename>")
    @login_required
    def serve_temp(filename):
        """
        Serve a temp file. If not found, attempt to fix metadata for the corresponding post.
        """
        try:
            file_path = os.path.join(file_manager.temp_path, filename)
            if os.path.exists(file_path):
                return send_from_directory(file_manager.temp_path, filename)

            # Extract post_id from filename
            base_name = os.path.splitext(os.path.basename(filename))[0]
            try:
                post_id = int(base_name)
            except ValueError:
                return jsonify({"error": "File not found"}), 404

            logger.warning(f"File {filename} missing. Attempting to fix post {post_id}...")

            # Attempt to fix JSON metadata
            json_path = os.path.join(file_manager.temp_path, f"{post_id}.json")
            if not os.path.exists(json_path) and file_manager.save_path:
                # Try saved folders
                for date_folder in os.listdir(file_manager.save_path):
                    folder_path = os.path.join(file_manager.save_path, date_folder)
                    candidate = os.path.join(folder_path, f"{post_id}.json")
                    if os.path.exists(candidate):
                        json_path = candidate
                        break

            if not os.path.exists(json_path):
                return jsonify({"error": "File and metadata not found"}), 404

            with open(json_path, 'r') as f:
                post_data = json.load(f)

            # Try to find actual media file in temp
            found_file = None
            for ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm']:
                candidate = os.path.join(file_manager.temp_path, f"{post_id}{ext}")
                if os.path.exists(candidate):
                    found_file = candidate
                    post_data['file_type'] = ext
                    break

            # If not in temp, check saved directories
            if not found_file and file_manager.save_path:
                for date_folder in os.listdir(file_manager.save_path):
                    folder_path = os.path.join(file_manager.save_path, date_folder)
                    for ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm']:
                        candidate = os.path.join(folder_path, f"{post_id}{ext}")
                        if os.path.exists(candidate):
                            found_file = candidate
                            post_data['file_type'] = ext
                            break
                    if found_file:
                        break

            if not found_file:
                return jsonify({"error": "File not found after scanning"}), 404

            # Update JSON metadata
            with open(json_path, 'w') as f:
                json.dump(post_data, f, indent=2)
            logger.info(f"Fixed file_type for post {post_id} -> {post_data['file_type']}")

            # Rebuild cache for this post
            from database import Database
            from config import Config
            config = Config()
            db = Database(config.DATABASE_PATH)
            db.rebuild_cache_from_files(file_manager)
            logger.info(f"Rebuilt cache for post {post_id}")

            # Serve fixed file
            relative_path = found_file.replace(file_manager.temp_path, '').lstrip(os.sep)
            return send_from_directory(file_manager.temp_path, os.path.basename(found_file))

        except Exception as e:
            logger.error(f"Error serving temp file {filename}: {e}", exc_info=True)
            return jsonify({"error": str(e)}), 500

    @app.route("/saved/<date_folder>/<path:filename>")
    @login_required
    def serve_saved(date_folder, filename):
        folder_path = os.path.join(file_manager.save_path, date_folder)
        logger.debug(f"Serving saved file: {date_folder}/{filename}")
        return send_from_directory(folder_path, filename)