import time
import logging
import requests
from collections import deque
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

class RateLimiter:
    """Rate limiter to respect API limits"""
    def __init__(self, max_requests: int = 60, time_window: int = 60):
        self.max_requests = max_requests
        self.time_window = time_window
        self.requests = deque()
        logger.debug(f"Rate limiter initialized: {max_requests} requests per {time_window}s")
    
    def wait_if_needed(self) -> bool:
        """Wait if rate limit would be exceeded"""
        now = time.time()
        
        # Remove old requests outside time window
        while self.requests and self.requests[0] < now - self.time_window:
            self.requests.popleft()
        
        # Check if we're at the limit
        if len(self.requests) >= self.max_requests:
            sleep_time = self.time_window - (now - self.requests[0]) + 0.1
            if sleep_time > 0:
                logger.debug(f"Rate limit reached, waiting {sleep_time:.2f}s")
                time.sleep(sleep_time)
                return self.wait_if_needed()
        
        self.requests.append(now)
        return True
    
    def get_current_count(self) -> int:
        """Get current number of requests in time window"""
        now = time.time()
        while self.requests and self.requests[0] < now - self.time_window:
            self.requests.popleft()
        return len(self.requests)


class Rule34APIClient:
    """Client for Rule34 API"""
    
    BASE_URL = "https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1"
    
    def __init__(self, user_id: str = "", api_key: str = ""):
        self.user_id = user_id
        self.api_key = api_key
        self.rate_limiter = RateLimiter()
        self.last_request_time = 0
    
    def update_credentials(self, user_id: str, api_key: str):
        """Update API credentials"""
        self.user_id = user_id
        self.api_key = api_key
    
    def apply_blacklist(self, tags: str, blacklist: List[str]) -> str:
        """Apply blacklist to search tags"""
        if not blacklist:
            return tags
        
        blacklist_parts = []
        for item in blacklist:
            if f"-{item}" not in tags:
                blacklist_parts.append(f"-{item}")
        
        result = f"{tags} {' '.join(blacklist_parts)}".strip()
        return result
    
    def make_request(self, tags: str = "", page: int = 0, post_id: Optional[int] = None,
                    blacklist: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """Make API request to Rule34"""
        logger.debug(f"Making API request - tags: '{tags}', page: {page}, post_id: {post_id}")
        
        # Wait for rate limiter
        self.rate_limiter.wait_if_needed()
        
        # Build URL parameters
        params = []
        
        if self.user_id:
            params.append(f"user_id={requests.utils.quote(self.user_id)}")
        if self.api_key:
            params.append(f"api_key={requests.utils.quote(self.api_key)}")
        
        if tags:
            # Apply blacklist if provided
            if blacklist:
                tags = self.apply_blacklist(tags, blacklist)
            params.append(f"tags={requests.utils.quote(tags)}")
        
        if page > 0:
            params.append(f"pid={page}")
        if post_id:
            params.append(f"id={post_id}")
        
        params.append("limit=1000")
        
        url = self.BASE_URL + ("&" if params else "") + "&".join(params)
        
        try:
            response = requests.get(url, timeout=30)
            self.last_request_time = time.time()
            
            if response.status_code == 200:
                data = response.json()
                
                # Check for API error response
                if isinstance(data, dict) and data.get("success") == "false":
                    logger.error(f"API returned error: {data.get('message', 'Unknown error')}")
                    return {"error": data.get("message", "API Error")}
                
                return data if isinstance(data, list) else []
            else:
                logger.error(f"API request failed with status {response.status_code}")
                return {"error": f"HTTP {response.status_code}"}
                
        except Exception as e:
            logger.error(f"API request exception: {e}", exc_info=True)
            return {"error": str(e)}
    
    def get_autocomplete_tags(self, query: str) -> List[str]:
        """Get autocomplete suggestions for tags"""
        if not query:
            return []
        
        try:
            self.rate_limiter.wait_if_needed()
            response = requests.get(
                f"https://api.rule34.xxx/autocomplete.php?q={requests.utils.quote(query)}", 
                timeout=10
            )
            if response.status_code == 200:
                return response.json()
            return []
        except Exception as e:
            logger.error(f"Autocomplete request failed: {e}")
            return []
    
    def download_file(self, url: str, save_path: str) -> bool:
        """Download file from URL to path"""
        try:
            response = requests.get(url, timeout=30, stream=True)
            if response.status_code == 200:
                with open(save_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                logger.debug(f"Downloaded file to {save_path}")
                return True
            else:
                logger.error(f"Download failed with status {response.status_code}")
                return False
        except Exception as e:
            logger.error(f"Download exception: {e}")
            return False
    
    def get_requests_per_minute(self) -> int:
        """Get current requests per minute count"""
        return self.rate_limiter.get_current_count()