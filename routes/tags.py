"""Tag management route handlers"""
import logging
from flask import request, jsonify
from exceptions import ValidationError

logger = logging.getLogger(__name__)


def create_tag_routes(app, services, login_required):
    """Register tag-related routes"""
    
    tag_service = services['tag']
    file_manager = services['file_manager']
    
    @app.route("/api/tag_history")
    @login_required
    def tag_history():
        try:
            page = int(request.args.get('page', 1))
            limit = int(request.args.get('limit', 50))
            return jsonify(tag_service.get_tag_history(page, limit))
        except ValidationError as e:
            return jsonify({"error": str(e)}), 400
    
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