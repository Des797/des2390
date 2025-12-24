"""Scraper control route handlers"""
import logging
from flask import request, jsonify
from exceptions import ValidationError

logger = logging.getLogger(__name__)


def create_scraper_routes(app, services, login_required):
    """Register scraper-related routes"""
    
    scraper_service = services['scraper']
    
    @app.route("/api/status")
    @login_required
    def get_status():
        return jsonify(scraper_service.get_status())
    
    @app.route("/api/start", methods=["POST"])
    @login_required
    def start_scraper():
        try:
            data = request.json or {}
            tags = data.get("tags", "")
            resume = data.get("resume", False)
            
            result = scraper_service.start_scraper(tags, resume)
            
            if isinstance(result, dict) and result.get("resume_available"):
                # Return resume prompt
                return jsonify({
                    "resume_available": True,
                    "resume_page": result.get("resume_page", 0),
                    "tags": tags
                })
            elif result:
                return jsonify({"success": True})
            else:
                return jsonify({"error": "Failed to start scraper"}), 400
        except ValidationError as e:
            return jsonify({"error": str(e)}), 400

    @app.route("/api/scraper/queue", methods=["GET"])
    @login_required
    def get_scraper_queue():
        """Get current search queue"""
        try:
            # Use scraper_service to access scraper
            queue = scraper_service.scraper.get_queue()
            return jsonify({
                "queue": queue,
                "count": len(queue)
            })
        except Exception as e:
            logger.error(f"Failed to get queue: {e}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/scraper/queue/add", methods=["POST"])
    @login_required
    def add_to_scraper_queue():
        """Add search to queue"""
        try:
            data = request.json or {}
            tags = data.get("tags", "")
            
            if not tags:
                return jsonify({"error": "Tags required"}), 400
            
            # Use scraper_service to access scraper
            success = scraper_service.scraper.add_to_queue(tags)
            
            if success:
                return jsonify({
                    "success": True,
                    "queue": scraper_service.scraper.get_queue()
                })
            else:
                return jsonify({"error": "Search already in queue"}), 400
        except Exception as e:
            logger.error(f"Failed to add to queue: {e}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/scraper/queue/clear", methods=["POST"])
    @login_required
    def clear_scraper_queue():
        """Clear search queue"""
        try:
            scraper_service.scraper.clear_queue()
            return jsonify({"success": True})
        except Exception as e:
            logger.error(f"Failed to clear queue: {e}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/scraper/resume/check", methods=["POST"])
    @login_required
    def check_resume():
        """Check if resume is available for a search"""
        try:
            data = request.json or {}
            tags = data.get("tags", "")
            
            if not tags:
                return jsonify({"resume_available": False})
            
            # Use scraper_service to access scraper
            resume_page = scraper_service.scraper.check_resume_available(tags)
            
            return jsonify({
                "resume_available": resume_page is not None,
                "resume_page": resume_page or 0
            })
        except Exception as e:
            logger.error(f"Failed to check resume: {e}")
            return jsonify({"error": str(e)}), 500
    
    @app.route("/api/stop", methods=["POST"])
    @login_required
    def stop_scraper():
        scraper_service.stop_scraper()
        return jsonify({"success": True})