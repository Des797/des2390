"""Video thumbnail generation and duration extraction using ffmpeg/ffprobe"""
import os
import subprocess
import logging
import re  
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger(__name__)


class VideoProcessor:
    """Handles video thumbnail generation and duration extraction"""
    
    def __init__(self):
        self.ffmpeg_available, self.ffmpeg_path = self._check_ffmpeg()
        self.ffprobe_available, self.ffprobe_path = self._check_ffprobe()
        
        if not self.ffmpeg_available:
            logger.warning("ffmpeg not available - video thumbnails will not be generated")
        else:
            logger.info(f"ffmpeg found at: {self.ffmpeg_path}")
            
        if not self.ffprobe_available:
            logger.warning("ffprobe not available - video duration detection will use fallback methods")
        else:
            logger.info(f"ffprobe found at: {self.ffprobe_path}")
    
    def _check_ffmpeg(self) -> Tuple[bool, Optional[str]]:
        """Check if ffmpeg is available and return its path"""
        try:
            result = subprocess.run(['ffmpeg', '-version'], 
                                  capture_output=True, 
                                  check=True, 
                                  timeout=5,
                                  text=True)
            
            # Try to extract path
            path = shutil.which('ffmpeg')
            logger.info(f"ffmpeg version check output: {result.stdout[:200]}")
            return True, path
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired) as e:
            logger.warning(f"ffmpeg check failed: {e}")
            return False, None
    
    def _check_ffprobe(self) -> Tuple[bool, Optional[str]]:
        """Check if ffprobe is available and return its path"""
        try:
            result = subprocess.run(['ffprobe', '-version'], 
                                  capture_output=True, 
                                  check=True, 
                                  timeout=5,
                                  text=True)
            
            # Try to extract path
            path = shutil.which('ffprobe')
            logger.info(f"ffprobe version check output: {result.stdout[:200]}")
            return True, path
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired) as e:
            logger.warning(f"ffprobe check failed: {e}")
            return False, None
    
    def get_video_duration(self, video_path: str) -> Optional[float]:
        """
        Get video duration in seconds using multiple fallback methods
        
        Priority:
        1. ffprobe (most accurate)
        2. ffmpeg (slower but works)
        3. Return None if both fail
        
        Args:
            video_path: Path to video file
        
        Returns:
            Duration in seconds or None if failed
        """
        if not os.path.exists(video_path):
            logger.error(f"Video file not found: {video_path}")
            return None
        
        logger.info(f"Attempting to get duration for: {video_path}")
        
        # Method 1: Try ffprobe (fastest and most accurate)
        if self.ffprobe_available:
            duration = self._get_duration_ffprobe(video_path)
            if duration is not None:
                logger.info(f"ffprobe succeeded: {duration}s for {video_path}")
                return duration
            else:
                logger.warning(f"ffprobe failed for {video_path}, trying ffmpeg fallback...")
        
        # Method 2: Try ffmpeg as fallback (slower but works)
        if self.ffmpeg_available:
            duration = self._get_duration_ffmpeg(video_path)
            if duration is not None:
                logger.info(f"ffmpeg fallback succeeded: {duration}s for {video_path}")
                return duration
            else:
                logger.error(f"ffmpeg fallback also failed for {video_path}")
        
        logger.error(f"All duration detection methods failed for {video_path}")
        return None
    
    def _get_duration_ffprobe(self, video_path: str) -> Optional[float]:
        """Get duration using ffprobe"""
        try:
            cmd = [
                'ffprobe',
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                video_path
            ]
            
            logger.debug(f"Running ffprobe command: {' '.join(cmd)}")
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=10,
                check=True,
                text=True
            )
            
            duration_str = result.stdout.strip()
            logger.debug(f"ffprobe raw output: '{duration_str}'")
            
            if duration_str:
                duration = float(duration_str)
                return duration
            else:
                logger.warning(f"ffprobe returned empty output for {video_path}")
                return None
            
        except subprocess.TimeoutExpired:
            logger.error(f"ffprobe timed out for {video_path}")
            return None
        except subprocess.CalledProcessError as e:
            logger.error(f"ffprobe failed: {e.stderr}")
            return None
        except (ValueError, AttributeError) as e:
            logger.error(f"Failed to parse ffprobe output: {e}")
            return None
    
    def _get_duration_ffmpeg(self, video_path: str) -> Optional[float]:
        """Get duration using ffmpeg as fallback (parses stderr output)"""
        try:
            cmd = [
                'ffmpeg',
                '-i', video_path,
                '-f', 'null',
                '-'
            ]
            
            logger.debug(f"Running ffmpeg command: {' '.join(cmd)}")
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=15,
                text=True
            )
            
            # ffmpeg outputs info to stderr
            stderr = result.stderr
            logger.debug(f"ffmpeg stderr output (first 500 chars): {stderr[:500]}")
            
            # Look for Duration: HH:MM:SS.ms
            duration_match = re.search(r'Duration:\s*(\d+):(\d+):(\d+\.\d+)', stderr)
            
            if duration_match:
                hours = int(duration_match.group(1))
                minutes = int(duration_match.group(2))
                seconds = float(duration_match.group(3))
                
                total_seconds = hours * 3600 + minutes * 60 + seconds
                logger.info(f"Parsed duration from ffmpeg: {total_seconds}s ({hours}h {minutes}m {seconds}s)")
                return total_seconds
            else:
                logger.warning(f"Could not find duration in ffmpeg output for {video_path}")
                return None
                
        except subprocess.TimeoutExpired:
            logger.error(f"ffmpeg timed out for {video_path}")
            return None
        except Exception as e:
            logger.error(f"ffmpeg duration detection failed: {e}")
            return None
    
    def generate_thumbnail(self, video_path: str, output_path: Optional[str] = None, 
                          timestamp: str = "00:00:01", size: str = "-1:-1") -> Optional[str]:
        """
        Generate thumbnail from video at specified timestamp
        
        Args:
            video_path: Path to video file
            output_path: Output path for thumbnail (auto-generated if None)
            timestamp: Timestamp to extract frame (format: HH:MM:SS)
            size: Thumbnail size (WxH or W:-1 for auto height)
        
        Returns:
            Path to generated thumbnail or None if failed
        """
        if not self.ffmpeg_available:
            logger.warning("ffmpeg not available, cannot generate thumbnail")
            return None
        
        if not os.path.exists(video_path):
            logger.error(f"Video not found: {video_path}")
            return None
        
        # Auto-generate output path if not provided
        if output_path is None:
            video_dir = os.path.dirname(video_path)
            video_name = Path(video_path).stem
            
            # Create .thumbnails subdirectory
            thumb_dir = os.path.join(video_dir, '.thumbnails')
            os.makedirs(thumb_dir, exist_ok=True)
            
            output_path = os.path.join(thumb_dir, f"{video_name}_thumb.jpg")
        
        # Check if thumbnail already exists
        if os.path.exists(output_path):
            logger.debug(f"Thumbnail already exists: {output_path}")
            return output_path
        
        try:
            # ffmpeg command to extract frame with proper aspect ratio
            cmd = [
                'ffmpeg',
                '-ss', timestamp,           # Seek to timestamp
                '-i', video_path,            # Input file
                '-vframes', '1',             # Extract 1 frame
                '-vf', f'scale={size}',      # Scale with aspect ratio preserved
                '-q:v', '1',                 # Quality (1-31, lower = better)
                '-y',                        # Overwrite output
                output_path
            ]
            
            logger.debug(f"Running thumbnail generation: {' '.join(cmd)}")
            
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
            logger.error(f"ffmpeg error: {e.stderr.decode('utf-8', errors='ignore') if e.stderr else 'Unknown'}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error generating thumbnail: {e}")
            return None
        
    def get_thumbnail_path(self, video_path: str) -> str:
        """Get expected thumbnail path for a video"""
        video_dir = os.path.dirname(video_path)
        video_name = Path(video_path).stem
        thumb_dir = os.path.join(video_dir, '.thumbnails')
        return os.path.join(thumb_dir, f"{video_name}_thumb.jpg")

    def thumbnail_exists(self, video_path: str) -> bool:
        """Check if thumbnail exists for a video"""
        thumb_path = self.get_thumbnail_path(video_path)
        return os.path.exists(thumb_path)
    
    def batch_generate_thumbnails(self, video_paths: list, progress_callback=None) -> dict:
        """Generate thumbnails for multiple videos"""
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
        """Generate thumbnail at a specific percentage of video duration"""
        duration = self.get_video_duration(video_path)
        if duration is None:
            # Fallback to 1 second if duration can't be determined
            logger.warning(f"Could not determine duration for {video_path}, using 1s fallback")
            return self.generate_thumbnail(video_path, output_path, "00:00:01")
        
        # Calculate timestamp
        target_seconds = duration * (percentage / 100.0)
        hours = int(target_seconds // 3600)
        minutes = int((target_seconds % 3600) // 60)
        seconds = int(target_seconds % 60)
        
        timestamp = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
        logger.info(f"Generating thumbnail at {percentage}% ({timestamp}) of {duration}s video")
        
        return self.generate_thumbnail(video_path, output_path, timestamp)
    
    def test_installation(self) -> dict:
        """
        Test ffmpeg/ffprobe installation and return diagnostic info
        
        Returns:
            Dictionary with diagnostic information
        """
        import shutil
        
        info = {
            'ffmpeg_available': self.ffmpeg_available,
            'ffmpeg_path': self.ffmpeg_path or shutil.which('ffmpeg'),
            'ffprobe_available': self.ffprobe_available,
            'ffprobe_path': self.ffprobe_path or shutil.which('ffprobe'),
            'system': os.name,
            'errors': []
        }
        
        # Test ffmpeg version
        if self.ffmpeg_available:
            try:
                result = subprocess.run(['ffmpeg', '-version'], 
                                      capture_output=True, 
                                      timeout=5, 
                                      text=True)
                info['ffmpeg_version'] = result.stdout.split('\n')[0]
            except Exception as e:
                info['errors'].append(f"ffmpeg version check failed: {e}")
        else:
            info['errors'].append("ffmpeg not found in PATH")
        
        # Test ffprobe version
        if self.ffprobe_available:
            try:
                result = subprocess.run(['ffprobe', '-version'], 
                                      capture_output=True, 
                                      timeout=5, 
                                      text=True)
                info['ffprobe_version'] = result.stdout.split('\n')[0]
            except Exception as e:
                info['errors'].append(f"ffprobe version check failed: {e}")
        else:
            info['errors'].append("ffprobe not found in PATH")
        
        # Check PATH
        info['path_directories'] = os.environ.get('PATH', '').split(os.pathsep)
        
        return info


# Global instance
_video_processor = None

def get_video_processor() -> VideoProcessor:
    """Get singleton VideoProcessor instance"""
    global _video_processor
    if _video_processor is None:
        _video_processor = VideoProcessor()
    return _video_processor


def test_video_processing():
    """
    Test function to diagnose video processing capabilities
    Run this from Python console to test your installation
    """
    processor = get_video_processor()
    info = processor.test_installation()
    
    print("\n" + "="*60)
    print("VIDEO PROCESSOR DIAGNOSTIC REPORT")
    print("="*60)
    
    print(f"\nSystem: {info['system']}")
    print(f"\nffmpeg available: {info['ffmpeg_available']}")
    if info.get('ffmpeg_path'):
        print(f"ffmpeg path: {info['ffmpeg_path']}")
    if info.get('ffmpeg_version'):
        print(f"ffmpeg version: {info['ffmpeg_version']}")
    
    print(f"\nffprobe available: {info['ffprobe_available']}")
    if info.get('ffprobe_path'):
        print(f"ffprobe path: {info['ffprobe_path']}")
    if info.get('ffprobe_version'):
        print(f"ffprobe version: {info['ffprobe_version']}")
    
    if info['errors']:
        print(f"\n⚠️  ERRORS FOUND:")
        for error in info['errors']:
            print(f"  - {error}")
    else:
        print(f"\n✅ No errors found")
    
    print(f"\nPATH directories ({len(info['path_directories'])} total):")
    for i, path in enumerate(info['path_directories'][:5], 1):
        print(f"  {i}. {path}")
    if len(info['path_directories']) > 5:
        print(f"  ... and {len(info['path_directories']) - 5} more")
    
    print("\n" + "="*60)
    
    return info