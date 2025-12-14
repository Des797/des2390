import os
from typing import Optional

class Config:
    """Application configuration"""
    
    # Flask Configuration
    SECRET_KEY = os.environ.get('FLASK_SECRET_KEY', 'your-secret-key-change-this')
    DEBUG = os.environ.get('FLASK_DEBUG', 'True').lower() == 'true'
    HOST = os.environ.get('FLASK_HOST', '0.0.0.0')
    PORT = int(os.environ.get('FLASK_PORT', 5000))
    
    # Authentication
    AUTH_USERNAME = os.environ.get('AUTH_USERNAME', 'admin')
    AUTH_PASSWORD = os.environ.get('AUTH_PASSWORD', 'admin')
    
    # Database Configuration
    DATABASE_PATH = os.environ.get('DATABASE_PATH', 'rule34_scraper.db')
    
    # Logging Configuration
    LOG_FILE = os.environ.get('LOG_FILE', 'rule34_scraper.log')
    LOG_LEVEL = os.environ.get('LOG_LEVEL', 'DEBUG')
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
    def validate(cls) -> list:
        """Validate configuration and return list of warnings/errors"""
        issues = []
        
        # Check authentication
        if cls.AUTH_USERNAME == 'admin' and cls.AUTH_PASSWORD == 'admin':
            issues.append('WARNING: Using default credentials. Change AUTH_USERNAME and AUTH_PASSWORD!')
        
        # Check secret key
        if cls.SECRET_KEY == 'your-secret-key-change-this':
            issues.append('WARNING: Using default secret key. Change FLASK_SECRET_KEY!')
        
        # Check Elasticsearch configuration
        if cls.ELASTICSEARCH_ENABLED:
            if not os.path.exists(cls.ES_CA_CERT):
                issues.append(f'WARNING: Elasticsearch CA cert not found at {cls.ES_CA_CERT}')
        
        return issues
    
    @classmethod
    def print_info(cls):
        """Print configuration information"""
        print("=" * 60)
        print("Rule34 Scraper Configuration")
        print("=" * 60)
        print(f"Server: http://{cls.HOST}:{cls.PORT}")
        print(f"Debug Mode: {cls.DEBUG}")
        print(f"Auth User: {cls.AUTH_USERNAME}")
        print(f"Database: {cls.DATABASE_PATH}")
        print(f"Log File: {cls.LOG_FILE}")
        print(f"Elasticsearch: {'Enabled' if cls.ELASTICSEARCH_ENABLED else 'Disabled'}")
        
        # Print validation issues
        issues = cls.validate()
        if issues:
            print("\nConfiguration Issues:")
            for issue in issues:
                print(f"  - {issue}")
        
        print("=" * 60)


class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True


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
    'default': DevelopmentConfig
}


def get_config(config_name: Optional[str] = None) -> Config:
    """Get configuration based on environment or name"""
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'default')
    
    return config.get(config_name, DevelopmentConfig)