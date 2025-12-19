"""Background queue system for retrying failed file operations"""
import threading
import time
import logging
from typing import Dict, List, Tuple, Optional
from datetime import datetime
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class OperationType(Enum):
    SAVE = "save"
    DISCARD = "discard"
    DELETE = "delete"


@dataclass
class QueuedOperation:
    """Represents a queued file operation"""
    post_id: int
    operation_type: OperationType
    date_folder: Optional[str] = None  # Only for delete operations
    attempts: int = 0
    max_attempts: int = 10
    next_retry: float = 0  # Timestamp for next retry
    error: Optional[str] = None
    queued_at: float = 0
    
    def __post_init__(self):
        if self.queued_at == 0:
            self.queued_at = time.time()


class FileOperationsQueue:
    """
    Background queue for retrying failed file operations
    
    Handles cases where files are locked and need to be retried later.
    """
    
    def __init__(self, file_manager, database):
        self.file_manager = file_manager
        self.database = database
        self.queue: Dict[int, QueuedOperation] = {}  # post_id -> operation
        self.lock = threading.Lock()
        self.running = False
        self.thread = None
        
        # Retry timing (exponential backoff)
        self.initial_retry_delay = 10  # seconds
        self.max_retry_delay = 300  # 5 minutes max
    
    def start(self):
        """Start the background queue processor"""
        if self.running:
            logger.warning("Queue processor already running")
            return
        
        self.running = True
        self.thread = threading.Thread(target=self._process_queue, daemon=True)
        self.thread.start()
        logger.info("File operations queue processor started")
    
    def stop(self):
        """Stop the background queue processor"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
        logger.info("File operations queue processor stopped")
    
    def add_operation(self, post_id: int, operation_type: OperationType, 
                     date_folder: Optional[str] = None) -> bool:
        """
        Add an operation to the retry queue
        
        Args:
            post_id: Post ID
            operation_type: Type of operation (save/discard/delete)
            date_folder: Date folder (only for delete operations)
        
        Returns:
            True if added, False if already queued
        """
        with self.lock:
            if post_id in self.queue:
                logger.warning(f"Post {post_id} already in queue, skipping")
                return False
            
            operation = QueuedOperation(
                post_id=post_id,
                operation_type=operation_type,
                date_folder=date_folder,
                next_retry=time.time() + self.initial_retry_delay
            )
            
            self.queue[post_id] = operation
            logger.info(f"Added {operation_type.value} operation for post {post_id} to queue")
            return True
    
    def remove_operation(self, post_id: int):
        """Remove an operation from the queue"""
        with self.lock:
            if post_id in self.queue:
                del self.queue[post_id]
                logger.info(f"Removed post {post_id} from queue")
    
    def get_queue_status(self) -> List[Dict]:
        """Get current queue status for API/UI"""
        with self.lock:
            status = []
            for post_id, op in self.queue.items():
                status.append({
                    'post_id': post_id,
                    'operation': op.operation_type.value,
                    'attempts': op.attempts,
                    'max_attempts': op.max_attempts,
                    'next_retry': op.next_retry,
                    'error': op.error,
                    'queued_at': op.queued_at,
                    'time_in_queue': time.time() - op.queued_at
                })
            return status
    
    def _calculate_retry_delay(self, attempts: int) -> float:
        """Calculate exponential backoff delay"""
        delay = self.initial_retry_delay * (2 ** attempts)
        return min(delay, self.max_retry_delay)
    
    def _process_queue(self):
        """Background thread that processes queued operations"""
        logger.info("Queue processor thread started")
        
        while self.running:
            try:
                current_time = time.time()
                operations_to_process = []
                
                # Find operations ready for retry
                with self.lock:
                    for post_id, op in list(self.queue.items()):
                        if current_time >= op.next_retry:
                            operations_to_process.append((post_id, op))
                
                # Process operations (outside lock to avoid blocking)
                for post_id, op in operations_to_process:
                    self._try_operation(post_id, op)
                
                # Sleep before next iteration
                time.sleep(5)
                
            except Exception as e:
                logger.error(f"Error in queue processor: {e}", exc_info=True)
                time.sleep(5)
        
        logger.info("Queue processor thread stopped")
    
    def _try_operation(self, post_id: int, op: QueuedOperation):
        """
        Try to execute a queued operation
        
        Args:
            post_id: Post ID
            op: Queued operation
        """
        op.attempts += 1
        logger.info(f"Attempting {op.operation_type.value} for post {post_id} (attempt {op.attempts}/{op.max_attempts})")
        
        try:
            success = False
            
            if op.operation_type == OperationType.SAVE:
                success = self.file_manager.save_post_to_archive(post_id)
                if success:
                    # Update database
                    self.database.set_post_status(post_id, "saved")
                    from datetime import datetime
                    date_folder = datetime.now().strftime("%m.%d.%Y")
                    self.database.update_post_status(post_id, 'saved', date_folder)
            
            elif op.operation_type == OperationType.DISCARD:
                success = self.file_manager.discard_post(post_id)
                if success:
                    self.database.set_post_status(post_id, "discarded")
                    self.database.remove_from_cache(post_id)
                    
                    # Update tag counts
                    post_data = self.file_manager.load_post_json(
                        post_id, 
                        self.file_manager.temp_path
                    )
                    if post_data and 'tags' in post_data:
                        self.database.update_tag_counts(post_data['tags'], increment=False)
            
            elif op.operation_type == OperationType.DELETE:
                success = self.file_manager.delete_saved_post(post_id, op.date_folder)
                if success:
                    self.database.remove_from_cache(post_id)
                    
                    # Update tag counts
                    import os
                    folder_path = os.path.join(
                        self.file_manager.save_path, 
                        op.date_folder
                    )
                    post_data = self.file_manager.load_post_json(post_id, folder_path)
                    if post_data and 'tags' in post_data:
                        self.database.update_tag_counts(post_data['tags'], increment=False)
            
            if success:
                logger.info(f"✅ Successfully completed {op.operation_type.value} for post {post_id}")
                self.remove_operation(post_id)
            else:
                self._handle_failed_attempt(post_id, op, "Operation returned False")
        
        except Exception as e:
            error_msg = str(e)
            logger.error(f"❌ Error during {op.operation_type.value} for post {post_id}: {error_msg}")
            self._handle_failed_attempt(post_id, op, error_msg)
    
    def _handle_failed_attempt(self, post_id: int, op: QueuedOperation, error: str):
        """Handle a failed operation attempt"""
        op.error = error
        
        if op.attempts >= op.max_attempts:
            logger.error(f"Post {post_id} exceeded max attempts ({op.max_attempts}), removing from queue")
            self.remove_operation(post_id)
        else:
            # Schedule next retry with exponential backoff
            delay = self._calculate_retry_delay(op.attempts)
            op.next_retry = time.time() + delay
            
            logger.info(f"Will retry post {post_id} in {delay:.0f} seconds (attempt {op.attempts + 1}/{op.max_attempts})")


# Global instance
_file_operations_queue = None

def get_file_operations_queue(file_manager=None, database=None) -> FileOperationsQueue:
    """Get singleton FileOperationsQueue instance"""
    global _file_operations_queue
    if _file_operations_queue is None:
        if file_manager is None or database is None:
            raise ValueError("FileManager and Database required for first initialization")
        _file_operations_queue = FileOperationsQueue(file_manager, database)
        _file_operations_queue.start()
    return _file_operations_queue