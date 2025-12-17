# Rule34 Scraper - Advanced Search Syntax Guide

## Basic Tag Search

### Single Tag
```
girl
```
Finds all posts with the tag "girl"

### Multiple Tags (AND)
```
girl red_hair
```
Finds posts that have BOTH "girl" AND "red_hair"

### Negative Tags (Exclusion)
```
girl -blonde
```
Finds posts with "girl" but WITHOUT "blonde"

---

## OR Operator

### Using Parentheses with Pipe
```
(red_hair|blonde|brunette)
```
Finds posts with red_hair OR blonde OR brunette

### Using Parentheses with Tilde
```
(cat~dog~fox)
```
Alternative syntax: finds posts with cat OR dog OR fox

### Combining AND with OR
```
girl (red_hair|blonde) dress
```
Finds posts that have "girl" AND "dress" AND (red_hair OR blonde)

### Multiple OR Groups
```
(cat|dog) (red|blue)
```
Finds posts that have (cat OR dog) AND (red OR blue)

---

## Wildcards

### Starts With
```
red_*
```
Finds tags starting with "red_" (e.g., red_hair, red_dress, red_eyes)

### Ends With
```
*_girl
```
Finds tags ending with "_girl" (e.g., cat_girl, fox_girl, demon_girl)

### Contains
```
*red*
```
Finds tags containing "red" anywhere (e.g., red, bored, sacred)

### Exact Match (No Wildcard)
```
red
```
Finds only the exact tag "red"

**Note:** Wildcards only apply to the side they're on. `ai_gen*` will NOT match `not_ai_generated` because it only matches the start.

---

## Owner Search

### Exact Owner
```
owner:username
```
Finds posts by exact username

### Owner with Wildcard
```
owner:user*
```
Finds posts by owners starting with "user" (e.g., user123, username, user_artist)

```
owner:*admin
```
Finds posts by owners ending with "admin"

---

## Score Search

### Exact Score
```
score:100
```
Finds posts with score exactly 100

### Greater Than
```
score:>50
```
Finds posts with score greater than 50

### Greater Than or Equal
```
score:>=100
```
Finds posts with score 100 or higher

### Less Than
```
score:<20
```
Finds posts with score less than 20

### Less Than or Equal
```
score:<=10
```
Finds posts with score 10 or lower

---

## Rating Search

### Safe
```
rating:s
```
Finds safe posts

### Questionable
```
rating:q
```
Finds questionable posts

### Explicit
```
rating:e
```
Finds explicit posts

---

## Title Search

### Contains Text
```
title:dragon
```
Finds posts with "dragon" in the title (case-insensitive)

---

## File Type Search

### By Extension
```
type:mp4
```
Finds video files (.mp4)

```
type:jpg
```
Finds JPEG images

```
file_type:webm
```
Alternative syntax (same result)

---

## Dimension Search

### Width Filters
```
width:>=1920
```
Finds posts 1920px wide or wider

```
width:<1000
```
Finds posts narrower than 1000px

```
width:1920
```
Finds posts exactly 1920px wide

### Height Filters
```
height:>=1080
```
Finds posts 1080px tall or taller

```
height:<500
```
Finds posts shorter than 500px

---

## Complex Examples

### High-res red-haired or blonde girl
```
girl (red_hair|blonde) width:>=1920 height:>=1080
```

### Popular cat or dog posts by specific artists
```
(cat|dog) owner:artist* score:>=100
```

### HD videos with specific tags
```
type:mp4 width:>=1920 rating:s (landscape|nature)
```

### Exclude AI-generated content
```
girl red_hair -ai_generated -ai_gen* score:>50
```

### Search with wildcards and dimensions
```
*_girl dress width:>=1000 (red*|blue*)
```

---

## Search Tips

1. **Click the 🔍 button or press Enter** to execute your search
2. **Combine filters** for precise results
3. **Use wildcards wisely** - they only work on the side where they appear
4. **OR groups** must be in parentheses with | or ~ separator
5. **Negative tags** help exclude unwanted content
6. **Dimension filters** are great for finding high-quality images
7. **Owner wildcards** help find related artists

---

## Operator Precedence

1. **Parentheses (OR groups)** are evaluated first
2. **Negative tags** are applied
3. **Wildcards** are matched
4. **All other filters** (owner, score, rating, etc.) are combined with AND logic