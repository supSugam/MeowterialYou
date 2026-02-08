import base64
import os

repo_root = "/home/ctrlcat/Repositories/Personal/MeowterialYou"
image_path = os.path.join(repo_root, "SpicetifyCat/assets/Purple/liked_songs.png")
css_path = os.path.join(repo_root, "example/templates/spotify_user.css")
js_path = os.path.join(repo_root, "example/templates/spotify_theme.js")

try:
    with open(image_path, "rb") as f:
        encoded_string = base64.b64encode(f.read()).decode('utf-8')
    
    data_uri = f'url("data:image/png;base64,{encoded_string}")'
    
    # Update CSS
    with open(css_path, "r") as f:
        css_content = f.read()
    
    css_content = css_content.replace('url("liked_songs.png")', data_uri)
    
    with open(css_path, "w") as f:
        f.write(css_content)
    print(f"Updated {css_path}")
    
    # Update JS
    with open(js_path, "r") as f:
        js_content = f.read()
        
    js_content = js_content.replace('url("liked_songs.png")', data_uri) # Handle double quotes
    js_content = js_content.replace("url('liked_songs.png')", data_uri) # Handle single quotes (just in case)

    with open(js_path, "w") as f:
        f.write(js_content)
    print(f"Updated {js_path}")

except Exception as e:
    print(f"Error: {e}")
