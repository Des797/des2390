import os
import secrets
from typing import Optional

class Config:
    """Application configuration"""
    
    # Flask Configuration
    SECRET_KEY = os.environ.get('FLASK_SECRET_KEY') or secrets.token_hex(32)
    DEBUG = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    HOST = os.environ.get('FLASK_HOST', '0.0.0.0')
    PORT = int(os.environ.get('FLASK_PORT', 8734))  # Non-standard port
    
    # Session Configuration
    SESSION_COOKIE_SECURE = False  # Set to True if using HTTPS
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    PERMANENT_SESSION_LIFETIME = 3600  # 1 hour
    
    # Authentication
    AUTH_USERNAME = os.environ.get('AUTH_USERNAME') or secrets.token_urlsafe(12)
    AUTH_PASSWORD = os.environ.get('AUTH_PASSWORD') or secrets.token_urlsafe(16)
    
    # Network Security
    ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '').split(',') if os.environ.get('ALLOWED_HOSTS') else []
    REQUIRE_LOCAL_NETWORK = os.environ.get('REQUIRE_LOCAL_NETWORK', 'True').lower() == 'true'
    
    # Database Configuration
    DATABASE_PATH = os.environ.get('DATABASE_PATH', 'rule34_scraper.db')
    
    # Cache Sync Configuration
    AUTO_SYNC_DISK = os.environ.get('AUTO_SYNC_DISK', 'False').lower() == 'true'  # NEW: Default to False
    
    # Logging Configuration
    LOG_FILE = os.environ.get('LOG_FILE', 'rule34_scraper.log')
    LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO')  # Changed from DEBUG for production
    LOG_FORMAT = '%(asctime)s - %(levelname)s - %(message)s'
    
    # Elasticsearch Configuration (Optional)
    ELASTICSEARCH_ENABLED = os.environ.get('ELASTICSEARCH_ENABLED', 'False').lower() == 'true'
    ES_HOST = os.environ.get('ES_HOST', 'localhost')
    ES_PORT = int(os.environ.get('ES_PORT', 9200))
    ES_USER = os.environ.get('ES_USER', 'elastic')
    ES_PASSWORD = os.environ.get('ES_PASSWORD', 'o_UsKFunknykh_hSGBJP')
    ES_CA_CERT = os.environ.get('ES_CA_CERT', r"D:\elasticsearch-9.2.1-windows-x86_64\elasticsearch-9.2.1\config\certs\http_ca.crt")
    ES_INDEX = os.environ.get('ES_INDEX', 'objects')
    ES_VERIFY_CERTS = os.environ.get('ES_VERIFY_CERTS', 'True').lower() == 'true'
    
    # Rate Limiting
    RATE_LIMIT_REQUESTS = int(os.environ.get('RATE_LIMIT_REQUESTS', 60))
    RATE_LIMIT_WINDOW = int(os.environ.get('RATE_LIMIT_WINDOW', 60))
    
    # Storage Configuration
    MIN_FREE_SPACE_GB = float(os.environ.get('MIN_FREE_SPACE_GB', 5.0))
    
    # Scraper Configuration
    SCRAPER_PAGE_LIMIT = int(os.environ.get('SCRAPER_PAGE_LIMIT', 1000))
    SCRAPER_DELAY_BETWEEN_PAGES = float(os.environ.get('SCRAPER_DELAY_BETWEEN_PAGES', 1.0))
    
    # API Configuration
    RULE34_API_BASE_URL = 'https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1'
    RULE34_AUTOCOMPLETE_URL = 'https://api.rule34.xxx/autocomplete.php'
    RULE34_POST_VIEW_URL = 'https://rule34.xxx/index.php?page=post&s=view&id='
    
    # File Type Configuration
    SUPPORTED_VIDEO_TYPES = ['.mp4', '.webm']
    SUPPORTED_IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
    
    # Pagination Defaults
    DEFAULT_PAGE_SIZE = 24
    TAG_HISTORY_PAGE_SIZE = 50
    SEARCH_HISTORY_LIMIT = 10
    
    @classmethod
    def get_elasticsearch_config(cls) -> Optional[dict]:
        """Get Elasticsearch configuration if enabled"""
        if not cls.ELASTICSEARCH_ENABLED:
            return None
        
        return {
            'hosts': [f"https://{cls.ES_HOST}:{cls.ES_PORT}"],
            'basic_auth': (cls.ES_USER, cls.ES_PASSWORD),
            'ca_certs': cls.ES_CA_CERT,
            'verify_certs': cls.ES_VERIFY_CERTS
        }
    
    @classmethod
    def get_logging_config(cls) -> dict:
        """Get logging configuration"""
        return {
            'level': cls.LOG_LEVEL,
            'format': cls.LOG_FORMAT,
            'handlers': [
                {
                    'type': 'file',
                    'filename': cls.LOG_FILE
                },
                {
                    'type': 'stream'
                }
            ]
        }
    
    @classmethod
    def is_local_network_ip(cls, ip: str) -> bool:
        """Check if IP is from a local network"""
        if ip in ['127.0.0.1', 'localhost', '::1']:
            return True
        
        # Check for private IP ranges
        parts = ip.split('.')
        if len(parts) == 4:
            try:
                first = int(parts[0])
                second = int(parts[1])
                
                # 10.0.0.0/8
                if first == 10:
                    return True
                # 172.16.0.0/12
                if first == 172 and 16 <= second <= 31:
                    return True
                # 192.168.0.0/16
                if first == 192 and second == 168:
                    return True
            except ValueError:
                pass
        
        return False
    
    @classmethod
    def validate(cls) -> list:
        """Validate configuration and return list of warnings/errors"""
        issues = []
        
        # Check authentication
        if cls.AUTH_USERNAME == 'admin' and cls.AUTH_PASSWORD == 'admin':
            issues.append('CRITICAL: Using default credentials. Change AUTH_USERNAME and AUTH_PASSWORD immediately!')
        
        # Check if credentials were auto-generated
        if not os.environ.get('AUTH_USERNAME') or not os.environ.get('AUTH_PASSWORD'):
            issues.append('INFO: Generated random credentials. Set AUTH_USERNAME and AUTH_PASSWORD environment variables to use custom credentials.')
        
        # Check secret key
        if cls.SECRET_KEY == 'your-secret-key-change-this':
            issues.append('CRITICAL: Using default secret key. Set FLASK_SECRET_KEY environment variable!')
        elif not os.environ.get('FLASK_SECRET_KEY'):
            issues.append('INFO: Generated random secret key. Set FLASK_SECRET_KEY environment variable for persistent sessions.')
        
        # Check Elasticsearch configuration
        if cls.ELASTICSEARCH_ENABLED:
            if not os.path.exists(cls.ES_CA_CERT):
                issues.append(f'WARNING: Elasticsearch CA cert not found at {cls.ES_CA_CERT}')
        
        # Network security check
        if cls.DEBUG:
            issues.append('WARNING: Debug mode is enabled. Disable for production use.')
        
        if cls.PORT in [80, 443, 8080, 5000, 3000]:
            issues.append(f'INFO: Using common port {cls.PORT}. Consider using a non-standard port for obscurity.')
        
        # Auto-sync warning
        if cls.AUTO_SYNC_DISK:
            issues.append('INFO: AUTO_SYNC_DISK is enabled. Cache will rebuild from disk on every startup (takes 2-5 minutes).')
        
        return issues
    
    @classmethod
    def get_local_ip(cls) -> str:
        """Get the local network IP address"""
        import socket
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "Unable to determine"
    
    @classmethod
    def print_info(cls):
        """Print configuration information"""
        local_ip = cls.get_local_ip()
        
        print("=" * 60)
        print("Rule34 Scraper Configuration")
        print("=" * 60)
        print(f"Local Server: http://127.0.0.1:{cls.PORT}")
        if local_ip != "Unable to determine":
            print(f"Network Access: http://{local_ip}:{cls.PORT}")
        print(f"Debug Mode: {cls.DEBUG}")
        print(f"Auth User: {cls.AUTH_USERNAME}")
        print(f"Auth Pass: {'*' * len(cls.AUTH_PASSWORD)}")
        print(f"Database: {cls.DATABASE_PATH}")
        print(f"Log File: {cls.LOG_FILE}")
        print(f"Elasticsearch: {'Enabled' if cls.ELASTICSEARCH_ENABLED else 'Disabled'}")
        print(f"Local Network Only: {cls.REQUIRE_LOCAL_NETWORK}")
        print(f"Auto-Sync Disk: {'Enabled' if cls.AUTO_SYNC_DISK else 'Disabled'}")
        
        # Print validation issues
        issues = cls.validate()
        if issues:
            print("\nConfiguration Issues:")
            for issue in issues:
                if issue.startswith('CRITICAL'):
                    print(f"  🔴 {issue}")
                elif issue.startswith('WARNING'):
                    print(f"  🟡 {issue}")
                else:
                    print(f"  ℹ️  {issue}")
        
        print("\nNetwork Access Instructions:")
        print("  1. Make sure your firewall allows connections on port", cls.PORT)
        if local_ip != "Unable to determine":
            print(f"  2. Access from other devices: http://{local_ip}:{cls.PORT}")
        print("  3. Use the credentials above to log in")
        
        if not cls.AUTO_SYNC_DISK:
            print("\nCache Sync:")
            print("  - Auto-sync is DISABLED (fast startup)")
            print("  - To enable: set AUTO_SYNC_DISK=true environment variable")
            print("  - Or manually rebuild via /api/rebuild_cache endpoint")
        else:
            print("\nCache Sync:")
            print("  - Auto-sync is ENABLED (rebuilds on startup)")
            print("  - Expected rebuild time: 2-5 minutes for 200k posts")
        
        print("=" * 60)


class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    LOG_LEVEL = 'DEBUG'


class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    LOG_LEVEL = 'INFO'


class TestingConfig(Config):
    """Testing configuration"""
    TESTING = True
    DATABASE_PATH = ':memory:'
    ELASTICSEARCH_ENABLED = False


# Configuration dictionary
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': ProductionConfig  # Changed to production as default
}


def get_config(config_name: Optional[str] = None) -> Config:
    """Get configuration based on environment or name"""
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'default')
    
    return config.get(config_name, ProductionConfig)