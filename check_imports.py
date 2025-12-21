"""
Quick diagnostic script to check database imports
Run this before starting the app to verify all imports work
"""
import sys
import traceback

print("="*60)
print("Database Import Diagnostic")
print("="*60)

# Test 1: Core
print("\n1. Testing database.core...")
try:
    from database.core import DatabaseCore
    print("   ✅ DatabaseCore imported successfully")
except Exception as e:
    print(f"   ❌ DatabaseCore import failed: {e}")
    traceback.print_exc()
    sys.exit(1)

# Test 2: Schema
print("\n2. Testing database.schema...")
try:
    from database.schema import init_schema
    print("   ✅ init_schema imported successfully")
except Exception as e:
    print(f"   ❌ init_schema import failed: {e}")
    traceback.print_exc()
    sys.exit(1)

# Test 3: Config Repo
print("\n3. Testing database.config_repo...")
try:
    from database.config_repo import ConfigRepository
    print("   ✅ ConfigRepository imported successfully")
except Exception as e:
    print(f"   ❌ ConfigRepository import failed: {e}")
    traceback.print_exc()
    sys.exit(1)

# Test 4: Search Repo
print("\n4. Testing database.search_repo...")
try:
    from database.search_repo import SearchHistoryRepository
    print("   ✅ SearchHistoryRepository imported successfully")
except Exception as e:
    print(f"   ❌ SearchHistoryRepository import failed: {e}")
    traceback.print_exc()
    sys.exit(1)

# Test 5: Tag Repo
print("\n5. Testing database.tag_repo...")
try:
    from database.tag_repo import TagRepository
    print("   ✅ TagRepository imported successfully")
except Exception as e:
    print(f"   ❌ TagRepository import failed: {e}")
    traceback.print_exc()
    sys.exit(1)

# Test 6: Post Cache Repo
print("\n6. Testing database.post_cache_repo...")
try:
    from database.post_cache_repo import PostCacheRepository
    print("   ✅ PostCacheRepository imported successfully")
except Exception as e:
    print(f"   ❌ PostCacheRepository import failed: {e}")
    traceback.print_exc()
    sys.exit(1)

# Test 7: Post Status Repo (THE PROBLEM)
print("\n7. Testing database.post_status_repo...")
try:
    from database.post_status_repo import PostStatusRepository
    print("   ✅ PostStatusRepository imported successfully")
except Exception as e:
    print(f"   ❌ PostStatusRepository import failed: {e}")
    traceback.print_exc()
    sys.exit(1)

# Test 8: Database class
print("\n8. Testing database.database...")
try:
    from database.database import Database
    print("   ✅ Database imported successfully")
except Exception as e:
    print(f"   ❌ Database import failed: {e}")
    traceback.print_exc()
    sys.exit(1)

# Test 9: Top-level import
print("\n9. Testing top-level database import...")
try:
    from database import Database
    print("   ✅ Database (top-level) imported successfully")
except Exception as e:
    print(f"   ❌ Database (top-level) import failed: {e}")
    traceback.print_exc()
    sys.exit(1)

print("\n" + "="*60)
print("✅ All imports successful!")
print("="*60)
print("\nYou can now run: python app.py")