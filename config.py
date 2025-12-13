"""
Configuration module for Rule34 Scraper
Centralizes all configuration variables and defaults
"""
import os
from dataclasses import dataclass
from typing import Optional

@dataclass
class AppConfig:
    """Main application configuration"""
    secret_key: str
    auth_username: str
    auth_password: str
    host: str = "0.0.0.0"
    port: int = 5000
    debug: bool = True
    database_path: str = "rule34_scraper.db"
    log_file: str = "rule34_scraper.log"
    
    @classmethod
    def from_env(cls):
        """Load configuration from environment variables"""
        return cls(
            secret_key=os.environ.get('FLASK_SECRET_KEY', 'your-secret-key-change-this'),
            auth_username=os.environ.get('AUTH_USERNAME', 'admin'),
            auth_password=os.environ.get('AUTH_PASSWORD', 'admin'),
            host=os.environ.get('FLASK_HOST', '0.0.0.0'),
            port=int(os.environ.get('FLASK_PORT', 5000)),
            debug=os.environ.get('FLASK_DEBUG', 'True').lower() == 'true'
        )


@dataclass
class ElasticsearchConfig:
    """Elasticsearch configuration"""
    enabled: bool
    host: str = "localhost"
    port: int = 9200
    user: str = "elastic"
    password: str = ""
    ca_cert: Optional[str] = None
    index: str = "objects"
    verify_certs: bool = True
    
    @classmethod
    def from_env(cls):
        """Load Elasticsearch config from environment variables"""
        return cls(
            enabled=os.environ.get('ES_ENABLED', 'False').lower() == 'true',
            host=os.environ.get('ES_HOST', 'localhost'),
            port=int(os.environ.get('ES_PORT', 9200)),
            user=os.environ.get('ES_USER', 'elastic'),
            password=os.environ.get('ES_PASSWORD', ''),
            ca_cert=os.environ.get('ES_CA_CERT'),
            index=os.environ.get('ES_INDEX', 'objects'),
            verify_certs=os.environ.get('ES_VERIFY_CERTS', 'True').lower() == 'true'
        )


@dataclass
class ScraperConfig:
    """Scraper-specific configuration"""
    rate_limit_requests: int = 60
    rate_limit_window: int = 60
    min_storage_gb: float = 5.0
    default_timeout: int = 30
    chunk_size: int = 8192
    
    @classmethod
    def from_env(cls):
        """Load scraper config from environment variables"""
        return cls(
            rate_limit_requests=int(os.environ.get('SCRAPER_RATE_LIMIT', 60)),
            rate_limit_window=int(os.environ.get('SCRAPER_RATE_WINDOW', 60)),
            min_storage_gb=float(os.environ.get('SCRAPER_MIN_STORAGE_GB', 5.0)),
            default_timeout=int(os.environ.get('SCRAPER_TIMEOUT', 30)),
            chunk_size=int(os.environ.get('SCRAPER_CHUNK_SIZE', 8192))
        )


class APIConfig:
    """Rule34 API configuration"""
    BASE_URL = "https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1"
    AUTOCOMPLETE_URL = "https://api.rule34.xxx/autocomplete.php"
    MAX_LIMIT = 1000


# Default configurations
DEFAULT_APP_CONFIG = AppConfig.from_env()
DEFAULT_ES_CONFIG = ElasticsearchConfig.from_env()
DEFAULT_SCRAPER_CONFIG = ScraperConfig.from_env()


def get_logging_config():
    """Get logging configuration"""
    return {
        'level': os.environ.get('LOG_LEVEL', 'DEBUG'),
        'format': '%(asctime)s - %(levelname)s - %(message)s',
        'handlers': [
            {
                'type': 'file',
                'filename': DEFAULT_APP_CONFIG.log_file
            },
            {
                'type': 'console'
            }
        ]
    }