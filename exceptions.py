"""Custom exception classes for the application"""


class Rule34ScraperException(Exception):
    """Base exception for all application errors"""
    pass


class ConfigurationError(Rule34ScraperException):
    """Raised when configuration is invalid or missing"""
    pass


class StorageError(Rule34ScraperException):
    """Raised when storage operations fail"""
    pass


class APIError(Rule34ScraperException):
    """Raised when API requests fail"""
    pass


class DatabaseError(Rule34ScraperException):
    """Raised when database operations fail"""
    pass


class ValidationError(Rule34ScraperException):
    """Raised when input validation fails"""
    pass


class AuthenticationError(Rule34ScraperException):
    """Raised when authentication fails"""
    pass


class ScraperError(Rule34ScraperException):
    """Raised when scraper operations fail"""
    pass


class FileOperationError(Rule34ScraperException):
    """Raised when file operations fail"""
    pass


class PostNotFoundError(Rule34ScraperException):
    """Raised when a post cannot be found"""
    pass


class InsufficientStorageError(StorageError):
    """Raised when disk space is insufficient"""
    pass