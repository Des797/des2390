from .core import DatabaseCore
from .config_repo import ConfigRepository
from .search_repo import SearchHistoryRepository
from .tag_repo import TagRepository
from .post_cache_repo import PostCacheRepository
from .post_status_repo import PostStatusRepository

class Database:

    def __init__(self, db_path="rule34_scraper.db"):
        self.core = DatabaseCore(db_path)
        self.config = ConfigRepository(self.core)
        self.search = SearchHistoryRepository(self.core)
        self.tags = TagRepository(self.core)
        self.cache = PostCacheRepository(self.core)
        self.status = PostStatusRepository(self.core)

    # ----- Config -----
    def save_config(self, *a, **kw): return self.config.save_config(*a, **kw)
    def load_config(self, *a, **kw): return self.config.load_config(*a, **kw)

    # ----- Search History -----
    def add_search_history(self, *a, **kw): return self.search.add_search_history(*a, **kw)
    def get_search_history(self, *a, **kw): return self.search.get_search_history(*a, **kw)

    # ----- Tag Management -----
    def add_tag_history(self, *a, **kw): return self.tags.add_tag_history(*a, **kw)
    def get_tag_history(self, *a, **kw): return self.tags.get_tag_history(*a, **kw)
    def update_tag_counts(self, *a, **kw): return self.tags.update_tag_counts(*a, **kw)
    def get_tag_count(self, *a, **kw): return self.tags.get_tag_count(*a, **kw)
    def get_all_tag_counts(self, *a, **kw): return self.tags.get_all_tag_counts(*a, **kw)
    def rebuild_tag_counts(self, *a, **kw): return self.tags.rebuild_tag_counts(*a, **kw)

    # ----- Post Cache -----
    def cache_post(self, *a, **kw): return self.cache.cache_post(*a, **kw)
    def remove_from_cache(self, *a, **kw): return self.cache.remove_from_cache(*a, **kw)
    def update_post_status(self, *a, **kw): return self.cache.update_post_status(*a, **kw)
    def get_cached_posts(self, *a, **kw): return self.cache.get_cached_posts(*a, **kw)
    def get_cache_count(self, *a, **kw): return self.cache.get_cache_count(*a, **kw)
    def is_cache_empty(self, *a, **kw): return self.cache.is_cache_empty(*a, **kw)
    def rebuild_cache_from_files(self, *a, **kw): return self.cache.rebuild_cache_from_files(*a, **kw)

    # ----- Post Status / Elasticsearch -----
    def get_post_status(self, *a, **kw): return self.status.get_post_status(*a, **kw)
    def set_post_status(self, *a, **kw): return self.status.set_post_status(*a, **kw)
    def is_post_indexed(self, *a, **kw): return self.status.is_post_indexed(*a, **kw)
    def mark_post_indexed(self, *a, **kw): return self.status.mark_post_indexed(*a, **kw)

    def log_index_stats(self):
        return self.core.log_index_stats()
