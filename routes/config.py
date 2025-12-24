"""Configuration route handlers"""
import logging
from flask import request, jsonify
from exceptions import ValidationError

logger = logging.getLogger(__name__)


def create_config_routes(app, services, login_required):
    """Register configuration routes"""
    
    config_service = services['config']
    search_service = services['search']
    
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
    
    @app.route("/api/search_history")
    @login_required
    def search_history():
        return jsonify(search_service.get_search_history())