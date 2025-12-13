# Rule34 Scraper - Complete Setup Guide

## 📁 File Structure

Create this exact folder structure:

```
rule34_scraper/
├── app.py
├── rule34_scraper.db (created automatically)
├── rule34_scraper.log (created automatically)
├── templates/
│   ├── index.html
│   └── login.html
└── static/
    ├── css/
    │   └── style.css
    └── js/
        └── app.js (combine Part 1 and Part 2)
```

## 🔧 Installation

### 1. Install Python Dependencies

```bash
pip install flask elasticsearch requests
```

### 2. Set Up Files

1. **Create the folder structure** as shown above
2. **Copy each artifact** to its corresponding file:
   - `app.py` → Backend code
   - `templates/login.html` → Login page
   - `templates/index.html` → Main interface
   - `static/css/style.css` → All styles
   - `static/js/app.js` → Combine Part 1 + Part 2 (append Part 2 to Part 1)

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

### 1. Start Elasticsearch

Make sure your Elasticsearch instance is running at `https://localhost:9200`

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

### Pending Posts Tab
- View all scraped posts awaiting review
- **Advanced search**: `tag1 tag2 owner:username score:>50`
- **Sorting**: Download date, upload date, ID, score, tag count, file size
- **Bulk operations**: Save/discard multiple posts
- **Select posts** by clicking checkboxes
- Click thumbnails for full-resolution view
- Navigate between posts with arrow buttons

### Saved Posts Tab
- View all saved posts
- Same search and sorting features as Pending
- Bulk delete operations
- Open posts on Rule34 website

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

## 🎨 Mobile Support

The interface is fully responsive and works on:
- Desktop browsers
- Tablets
- Mobile phones

## 🔒 Security Features

- **Password protection**: Required to access from any device
- **Session-based**: Stay logged in while using the app
- **Network access**: Only devices on your WiFi can access

## ⚙️ Advanced Configuration

### Change Port

Edit `app.py` (last line):
```python
app.run(debug=True, host="0.0.0.0", port=5000)  # Change 5000 to your port
```

### Elasticsearch Configuration

Edit the constants in `app.py`:
```python
ES_HOST = "localhost"
ES_PORT = 9200
ES_USER = "elastic"
ES_PASSWORD = "your_password"
ES_CA_CERT = r"path/to/cert"
ES_INDEX = "objects"
```

## 🐛 Troubleshooting

### "Failed to connect to Elasticsearch"
- Ensure Elasticsearch is running
- Check the certificate path is correct
- Verify credentials

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

## 📊 Rate Limiting

The scraper automatically limits requests to **60 per minute** to comply with Rule34's API limits. Bulk operations will respect this limit and show estimated completion time.

## 🚧 Future API Features (Currently Disabled)

These features are built into the UI but grayed out because the Rule34 API doesn't currently support them:

- **Like/Favorite posts**: Would add posts to your favorites
- **Edit tags**: Would update tags on Rule34 directly

The UI is ready - these will work once API endpoints are available.

## 📝 Notes

- **Post skipping works**: The scraper automatically skips posts you've already saved or discarded
- **Database is local**: All data stored in `rule34_scraper.db`
- **Logs available**: Check `rule34_scraper.log` for debugging
- **Backup recommended**: Periodically backup your database and saved posts

## 🆘 Support

If you encounter issues:
1. Check `rule34_scraper.log` for error messages
2. Verify all environment variables are set
3. Ensure Elasticsearch is running
4. Confirm API credentials are valid

## 📄 License

This tool is for personal use only. Respect Rule34's Terms of Service and API usage guidelines.