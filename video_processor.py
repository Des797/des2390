"""Video thumbnail generation using ffmpeg"""
import os
import subprocess
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class VideoProcessor:
    """Handles video thumbnail generation"""
    
    def __init__(self):
        self.ffmpeg_available = self._check_ffmpeg()
        if not self.ffmpeg_available:
            logger.warning("ffmpeg not available - video thumbnails will not be generated")
    
    def _check_ffmpeg(self) -> bool:
        """Check if ffmpeg is available"""
        try:
            subprocess.run(['ffmpeg', '-version'], 
                         capture_output=True, 
                         check=True, 
                         timeout=5)
            return True
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            return False
    
    def generate_thumbnail(self, video_path: str, output_path: Optional[str] = None, 
                          timestamp: str = "00:00:01", size: str = "320x180") -> Optional[str]:
        """
        Generate thumbnail from video at specified timestamp
        
        Args:
            video_path: Path to video file
            output_path: Output path for thumbnail (auto-generated if None)
            timestamp: Timestamp to extract frame (format: HH:MM:SS)
            size: Thumbnail size (WxH)
        
        Returns:
            Path to generated thumbnail or None if failed
        """
        if not self.ffmpeg_available:
            return None
        
        if not os.path.exists(video_path):
            logger.error(f"Video not found: {video_path}")
            return None
        
        # Auto-generate output path if not provided
        if output_path is None:
            video_dir = os.path.dirname(video_path)
            video_name = Path(video_path).stem
            output_path = os.path.join(video_dir, f"{video_name}_thumb.jpg")
        
        # Check if thumbnail already exists
        if os.path.exists(output_path):
            return output_path
        
        try:
            # ffmpeg command to extract frame
            cmd = [
                'ffmpeg',
                '-ss', timestamp,           # Seek to timestamp
                '-i', video_path,            # Input file
                '-vframes', '1',             # Extract 1 frame
                '-vf', f'scale={size}',      # Scale to size
                '-q:v', '2',                 # Quality (1-31, lower = better)
                '-y',                        # Overwrite output
                output_path
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=30,
                check=True
            )
            
            if os.path.exists(output_path):
                logger.info(f"Generated thumbnail: {output_path}")
                return output_path
            else:
                logger.error(f"Thumbnail generation failed: output not created")
                return None
                
        except subprocess.TimeoutExpired:
            logger.error(f"Thumbnail generation timed out for {video_path}")
            return None
        except subprocess.CalledProcessError as e:
            logger.error(f"ffmpeg error: {e.stderr.decode('utf-8', errors='ignore')}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error generating thumbnail: {e}")
            return None
    
    def get_video_duration(self, video_path: str) -> Optional[float]:
        """
        Get video duration in seconds using ffprobe
        
        Args:
            video_path: Path to video file
            
        Returns:
            Duration in seconds or None if failed
        """
        if not self.ffmpeg_available:
            return None
        
        try:
            cmd = [
                'ffprobe',
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                video_path
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=10,
                check=True,
                text=True
            )
            
            duration = float(result.stdout.strip())
            return duration
            
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError) as e:
            logger.error(f"Failed to get video duration: {e}")
            return None
    
    def batch_generate_thumbnails(self, video_paths: list, progress_callback=None) -> dict:
        """
        Generate thumbnails for multiple videos
        
        Args:
            video_paths: List of video file paths
            progress_callback: Optional callback(current, total, path)
        
        Returns:
            Dict mapping video_path -> thumbnail_path
        """
        results = {}
        total = len(video_paths)
        
        for i, video_path in enumerate(video_paths, 1):
            if progress_callback:
                progress_callback(i, total, video_path)
            
            thumb_path = self.generate_thumbnail(video_path)
            if thumb_path:
                results[video_path] = thumb_path
        
        logger.info(f"Generated {len(results)}/{total} thumbnails")
        return results
    
    def generate_thumbnail_at_percentage(self, video_path: str, percentage: float = 10.0,
                                        output_path: Optional[str] = None) -> Optional[str]:
        """
        Generate thumbnail at percentage of video duration
        
        Args:
            video_path: Path to video file
            percentage: Percentage of video duration (0-100)
            output_path: Output path for thumbnail
        
        Returns:
            Path to generated thumbnail or None if failed
        """
        duration = self.get_video_duration(video_path)
        if duration is None:
            # Fallback to 1 second if duration can't be determined
            return self.generate_thumbnail(video_path, output_path, "00:00:01")
        
        # Calculate timestamp
        target_seconds = duration * (percentage / 100.0)
        hours = int(target_seconds // 3600)
        minutes = int((target_seconds % 3600) // 60)
        seconds = int(target_seconds % 60)
        
        timestamp = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
        
        return self.generate_thumbnail(video_path, output_path, timestamp)


# Global instance
_video_processor = None

def get_video_processor() -> VideoProcessor:
    """Get singleton VideoProcessor instance"""
    global _video_processor
    if _video_processor is None:
        _video_processor = VideoProcessor()
    return _video_processor