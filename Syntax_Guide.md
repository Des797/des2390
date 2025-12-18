# Rule34 Scraper - Advanced Search Syntax Guide

This guide explains how to construct searches to find posts efficiently using tags, filters, wildcards, and logical operators. Beginner-friendly examples appear first, advanced usage later.

---

## 1. Basic Tag Search

### Single Tag
```
girl
```
Finds all posts with the tag `girl`.

### Multiple Tags (AND)
```
girl red_hair
```
Finds posts that have **both** `girl` **and** `red_hair`.


### Negative Tags (NOT)
```
girl -blonde
```
Finds posts with `girl` **without** `blonde`.

**Negation Aliases:** `-`, `!`, `exclude:`, `remove:`, `negate:`, `not:`  
`girl exclude:blonde` **=** `girl -blonde`.

---

## 2. Wildcards

### Starts With
```
red*
```
Matches tags starting with `red` (e.g., `reddened`, `red_dress`).

### Ends With
```
*red
```
Matches tags ending with `red` (e.g., `angered`, `turning_red`).

### Contains
```
*red*
```
Matches tags containing `red` anywhere (e.g., `predator`, `red_shoes`, `sacred`).

**Tip:** Wildcards match **only on the side they appear**. Example: `ai_gen*` does **not** match `is_ai_generated`.

---

## 3. Owner Search

### Exact Owner
```
owner:username
```
Finds posts by `username`.

### Owner with Wildcard
```
owner:user*
```
Matches owners starting with `user` (e.g., `user123`, `username`).  
```
owner:*admin
```
Matches owners ending with `admin`.

**Would find:** `user123` for `owner:user*`.  
**Would not find:** `superuser`.

---

## 4. Score, Rating, and Dimensions

### Score
- Exact: `score:100` → exactly 100  
- Greater than: `score:>50` → greater than 50  
- Greater or equal: `score:>=100`  
- Less than: `score:<20`  
- Less or equal: `score:<=10`  
- Wildcards allowed: `score:1*` → 10, 12, 123

### Rating
- Safe: `rating:s`  
- Questionable: `rating:q`  
- Explicit: `rating:e`

### Dimensions
- Width: `width:1920` (exact), `width:>1920`, `width:<=1000`, `width:1*`  
- Height: `height:1080` (exact), `height:<500`, `height:>=720`, `height:10*`  

**Tip:** Wildcards in numeric fields match patterns; comparison operators apply numerical logic.

---

## 5. Title and File Type

### Title Search
- Contains text: `title:dragon` (case-insensitive)  
- Wildcards supported: `title:*dragon*` → matches titles containing `dragon` anywhere

### File Type
- By extension: `type:mp4`, `file_type:jpg`  
- Wildcard: `type:*p*` → matches `mp4`, `webp`

---

## 6. OR Operator (Parentheses)

### Basic OR
```
(red_hair|blonde|brunette)
```
Matches posts with **any one** of the tags.

**Would find:** `red_hair`, `blonde`, or `brunette`.  
**Would not find:** posts with neither.

### Alternative Separators
```
(cat~dog~fox)
```
```
(cat,dog,fox)
```
Works identically to `|`.

### Combining AND and OR
```
girl (red_hair|blonde) dress
```
Matches posts with:
- `girl` AND `dress` AND (`red_hair` OR `blonde`)

**Would find:** `girl`, `red_hair`, `dress`.  
**Would not find:** `girl`, `blonde` without `dress`.

### Multiple OR Groups
```
(cat|dog) (red|blue)
```
Matches posts with:
- (`cat` OR `dog`) AND (`red` OR `blue`)

**Would find:** `cat` + `red`, `dog` + `blue`.  
**Would not find:** `cat` + `green`, `mouse` + `red`.

### Nested OR Groups
```
(girl|(boy|child)) red_hair
```
Matches posts with:
- `red_hair` AND (`girl` OR `boy` OR `child`)

**Would find:** `boy` + `red_hair`.  
**Would not find:** `alien` + `red_hair`.

---

## 7. Complex Examples

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

## 8. Search Tips

1. Execute search with the **🔍 button** or **Enter**.  
2. Combine multiple filters for precise results.  
3. Wildcards match **only on the side placed**.  
4. Parentheses required for OR groups (`|`, `~`, `,`).  
5. Negative tags (`-`, `!`, `exclude:` etc.) exclude unwanted content.  
6. Dimension filters help locate high-quality images/videos.  
7. Owner wildcards find related artists.  
8. Numeric fields support wildcards and comparison operators.  

---

## 9. Operator Precedence

1. Parentheses (OR groups) first  
2. Negative tags / exclusions applied  
3. Wildcards matched  
4. Numeric & other filters (`owner`, `score`, `rating`, `type`, `title`, `width`, `height`) combined using **AND logic**


| Field / Filter    | Syntax Examples                                  | Notes / Wildcards                                                                                            |
| ----------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| **Tag**           | `girl`, `red_hair`, `-blonde`                    | Negation prefixes: `-`, `!`, `exclude:`, `remove:`, `negate:`, `not:`. Wildcards: `*red*`, `red_*`, `*_girl` |
| **Owner**         | `owner:username`, `owner:user*`                  | Aliases: `user`, `creator`, `author`. Wildcards supported at start/end/middle                                |
| **Score**         | `score:100`, `score:>50`, `score:*50*`           | Supports operators: `>`, `>=`, `<`, `<=`, `=`. Wildcards allowed                                             |
| **Rating**        | `rating:s`, `rating:q`, `rating:e`               | Case-insensitive                                                                                             |
| **Title**         | `title:dragon`                                   | Case-insensitive. Wildcards supported                                                                        |
| **File Type**     | `type:mp4`, `file_type:jpg`                      | Aliases: `ext`, `extension`, `filetype`. Wildcards supported                                                 |
| **Width**         | `width:>=1920`, `width:*20*`                     | Supports operators `>`, `>=`, `<`, `<=`, `=`. Wildcards allowed                                              |
| **Height**        | `height:<500`                                    | Same as width                                                                                                |
| **OR Groups**     | `(red_hair&#124;blonde)`, `(cat~dog)`, `(a,b,c)` | OR operators inside parentheses only. Nested OR allowed                                                      |
| **AND Logic**     | `girl red_hair`                                  | Space between tokens = AND                                                                                   |
| **Negative Tags** | `-ai_generated`, `not:blonde`                    | Applied before wildcards and OR                                                                              |
| **Wildcards**     | `*red*`, `red_*`, `*_girl`                       | `*` can be at start, end, or both sides. Numeric fields also support `*`                                     |
