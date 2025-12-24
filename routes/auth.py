"""Authentication route handlers"""
import logging
from flask import request, jsonify, render_template, session, redirect, url_for
from exceptions import ValidationError
from validators import validate_username, validate_password

logger = logging.getLogger(__name__)


def create_auth_routes(app, config):
    """Register authentication routes"""
    
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