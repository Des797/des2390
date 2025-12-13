# Rule34 Scraper - Complete Setup Guide

## 📁 File Structure

Create this exact folder structure:

```
rule34_scraper/
├── app.py                      # Main Flask application (updated)
├── config.py                   # Configuration management (NEW)
├── routes.py                   # Flask routes/blueprints (NEW)
├── database.py                 # Database operations module
├── api_client.py               # Rule34 API client module
├── file_manager.py             # File operations module
├── scraper.py                  # Scraper logic module
├── utils.py                    # Backend utilities (NEW)
├── exceptions.py               # Custom exceptions (NEW)
├── validators.py               # Input validation (NEW)
├── services.py                 # Business logic layer (NEW)
├── rule34_scraper.db          # Database (created automatically)
├── rule34_scraper.log         # Logs (created automatically)
├── templates/
│   ├── index.html             # Main interface
│   └── login.html             # Login page
└── static/
    ├── css/
    │   └── style.css          # All styles
    └── js/
        ├── main.js            # Main entry point
        ├── state.js           # State management & browser history
        ├── utils.js           # Utility functions
        ├── api.js             # API calls
        ├── config.js          # Configuration management
        ├── constants.js       # Constants & config (NEW)
        ├── posts.js           # Posts logic (refactored)
        ├── posts_renderer.js  # Posts rendering (NEW)
        ├── event_handlers.js  # Event binding (NEW)
        ├── modal.js           # Modal/lightbox functions
        ├── bulk.js            # Bulk operations
        ├── scraper_ui.js      # Scraper UI controls
        └── navigation.js      # Tab navigation
```

## 🔧 Installation

### 1. Install Python Dependencies

```bash
pip install flask elasticsearch requests
```

### 2. Set Up Files

1. **Create the folder structure** as shown above
2. **Copy each artifact** to its corresponding file:
   - Backend Python modules (app.py, database.py, api_client.py, file_manager.py, scraper.py)
   - Templates (index.html, login.html)
   - Static files (style.css, all JavaScript modules)

### 3. Configure Environment Variables

**Windows (PowerShell):**
```powershell
$env:AUTH_USERNAME = "yourusername"
$env:AUTH_PASSWORD = "yourpassword"
$env:FLASK_SECRET_KEY = "your-secret-key-here"
```

**Linux/Mac:**
```bash
export AUTH_USERNAME="yourusername"
export AUTH_PASSWORD="yourpassword"
export FLASK_SECRET_KEY="your-secret-key-here"
```

**Or create a `.env` file** (recommended):
```bash
AUTH_USERNAME=yourusername
AUTH_PASSWORD=yourpassword
FLASK_SECRET_KEY=your-secret-key-here
```

Then use `python-dotenv`:
```bash
pip install python-dotenv
```

Add to top of `app.py`:
```python
from dotenv import load_dotenv
load_dotenv()
```

## 🚀 Running the Application

### 1. Start Elasticsearch (Optional)

Elasticsearch is optional. If available, make sure it's running at `https://localhost:9200`

### 2. Start the Flask App

```bash
cd rule34_scraper
python app.py
```

### 3. Access the Application

**On the same computer:**
- Open browser to: `http://localhost:5000`

**From other devices on your network:**
- Find your computer's IP address:
  - Windows: `ipconfig` (look for IPv4 Address)
  - Linux/Mac: `ifconfig` or `ip addr`
- Access from other devices: `http://YOUR_IP:5000`
- Example: `http://192.168.1.100:5000`

### 4. Login

Use the username and password you set in environment variables.

## 📋 First-Time Setup

1. **Login** with your credentials
2. Go to **Scraper** tab
3. Enter your **Rule34 API credentials**:
   - User ID
   - API Key (get from: https://rule34.xxx/index.php?page=account&s=options)
4. Set your **file paths**:
   - Temp Path (for pending posts)
   - Save Path (for saved posts)
5. Click **"💾 Save Configuration"**

## 🎯 Features Overview

### Scraper Tab
- Configure API credentials and paths
- Start/stop scraping
- View real-time statistics
- Monitor requests per minute

### Posts Tab (Merged Pending & Saved)
- **View filter dropdown**: All Posts / Pending Only / Saved Only
- View all posts with status badges (PENDING/SAVED)
- **Advanced search**: `tag1 tag2 owner:username score:>50`
- **Sorting**: Download date, upload date, ID, score, tag count, file size
- **Bulk operations**: Save/discard pending posts, delete saved posts
- **Tag counts**: Each tag shows count in parentheses `tag_name (123)`
- **Select posts** by clicking checkboxes
- Click thumbnails for full-resolution view
- Navigate between posts with arrow buttons
- **Browser back/forward works correctly** - navigation state is preserved in URL

### Blacklist Tab
- Add tags to automatically exclude from scraping
- Supports wildcards (`red_*`, `*_girl`)
- Bulk add (space or comma separated)

### Tag History Tab
- View all tag edits (when API support is added)
- Paginated list
- Shows added/removed tags

## 🔑 Keyboard Shortcuts

- **Escape**: Close modal
- **Arrow Left/Right**: Navigate between posts in modal
- **Enter** (in search): Start scraping

## 🌐 Browser Navigation

- **Back/Forward buttons work correctly**: The browser history is properly managed
- **Bookmarkable URLs**: Each view state is reflected in the URL
- **Deep linking**: Share URLs that point to specific filters, pages, and searches

## 🎨 Mobile Support

The interface is fully responsive and works on:
- Desktop browsers
- Tablets
- Mobile phones

## 🔒 Security Features

- **Password protection**: Required to access from any device
- **Session-based**: Stay logged in while using the app
- **Network access**: Accessible from any device on your local network

## ⚙️ Advanced Configuration

### Change Port

Edit `app.py` (last line):
```python
app.run(debug=True, host="0.0.0.0", port=5000)  # Change 5000 to your port
```

### Elasticsearch Configuration (Optional)

Edit the constants in `app.py`:
```python
ES_HOST = "localhost"
ES_PORT = 9200
ES_USER = "elastic"
ES_PASSWORD = "your_password"
ES_CA_CERT = r"path/to/cert"
ES_INDEX = "objects"
```

**Note**: The scraper works perfectly fine without Elasticsearch. It's only used for additional indexing.

## 🐛 Troubleshooting

### "Failed to connect to Elasticsearch"
- This is a warning, not an error - the app will work without Elasticsearch
- To fix: Ensure Elasticsearch is running, check certificate path, verify credentials

### "Login page won't load"
- Check environment variables are set
- Restart Flask app after setting variables

### "Can't access from other devices"
- Ensure firewall allows port 5000
- Verify devices are on same network
- Check IP address is correct

### "Scraper not working"
- Verify API credentials are correct
- Check temp/save paths exist and are writable
- Review `rule34_scraper.log` for errors

### JavaScript Modules Not Loading
- Ensure all `.js` files are in `static/js/` directory
- Check browser console for errors
- Verify file paths are correct

## 📊 Rate Limiting

The scraper automatically limits requests to **60 per minute** to comply with Rule34's API limits. Bulk operations will respect this limit and show estimated completion time.

## 🏗️ Architecture

### Backend (Python)
- **app.py**: Main Flask routes and application setup (will be refactored to use routes.py)
- **config.py**: Centralized configuration with dataclasses and environment variables
- **routes.py**: Flask Blueprints for organized routing
- **database.py**: All database operations (SQLite)
- **api_client.py**: Rule34 API communication and rate limiting
- **file_manager.py**: File system operations
- **scraper.py**: Main scraping logic
- **utils.py**: Shared utility functions (file operations, formatting, etc.)
- **exceptions.py**: Custom exception classes for better error handling
- **validators.py**: Input validation functions
- **services.py**: Business logic layer (coordinates between modules)

### Frontend (JavaScript Modules)
- **main.js**: Entry point, initializes everything
- **state.js**: Global state and browser history management
- **utils.js**: Utility functions (formatting, filtering, etc.)
- **constants.js**: All configuration constants and magic strings
- **api.js**: Frontend API calls to Flask backend
- **config.js**: Configuration UI management
- **posts.js**: Posts business logic (refactored, rendering separated)
- **posts_renderer.js**: Pure rendering functions for posts
- **event_handlers.js**: All DOM event binding logic
- **modal.js**: Lightbox/modal functionality
- **bulk.js**: Bulk operations on multiple posts
- **scraper_ui.js**: Scraper controls and status
- **navigation.js**: Tab switching

## 🚧 Future API Features (Currently Disabled)

These features are built into the UI but grayed out because the Rule34 API doesn't currently support them:

- **Like/Favorite posts**: Would add posts to your favorites
- **Edit tags**: Would update tags on Rule34 directly

The UI is ready - these will work once API endpoints are available.

## 📝 Notes

- **Post skipping works**: The scraper automatically skips posts you've already saved or discarded
- **Database is local**: All data stored in `rule34_scraper.db`
- **Tag counts**: Automatically maintained for all posts in your database
- **Logs available**: Check `rule34_scraper.log` for debugging
- **Backup recommended**: Periodically backup your database and saved posts
- **Modular code**: Easy to maintain and extend with separated concerns

## 🆘 Support

If you encounter issues:
1. Check `rule34_scraper.log` for error messages
2. Verify all environment variables are set
3. Confirm API credentials are valid
4. Check browser console for JavaScript errors

## 📄 License

This tool is for personal use only. Respect Rule34's Terms of Service and API usage guidelines.