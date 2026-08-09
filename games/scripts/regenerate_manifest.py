#!/usr/bin/env python3
"""
Regenerate MANIFEST in games/index.html from games.json
This prevents the MANIFEST TRUNCATION FAILURE MODE.
Usage: python3 scripts/regenerate_manifest.py
"""
import json
import re

def regenerate_manifest():
    # Load games.json
    with open('games/games.json', 'r') as f:
        games_data = json.load(f)
    
    # Build manifest entries - match the existing format exactly
    entries = []
    for g in games_data['games']:
        entry = json.dumps(g, separators=(',', ':'), ensure_ascii=False)
        # Replace unicode char with JS escape
        entry = entry.replace('\u2014', '\\u2014')
        entries.append(entry)
    
    manifest_content = 'var MANIFEST=[' + ','.join(entries) + '];'
    
    # Read the HTML file
    with open('games/index.html', 'r') as f:
        content = f.read()
    
    # Replace the MANIFEST line - it spans from "var MANIFEST=[" to the next "];"
    pattern = r'var MANIFEST=\[.*?\];'
    new_content = re.sub(pattern, manifest_content, content, flags=re.DOTALL)
    
    if new_content == content:
        raise ValueError("MANIFEST pattern not found in games/index.html - no replacement made")
    
    # Write back
    with open('games/index.html', 'w') as f:
        f.write(new_content)
    
    print(f'✓ MANIFEST regenerated with {len(entries)} games')
    
    # Verify
    verify_match = re.search(r'var MANIFEST=(\[.*?\]);', new_content, re.DOTALL)
    if verify_match:
        verify_games = json.loads(verify_match.group(1))
        if len(verify_games) != len(games_data['games']):
            raise ValueError(f"Verification failed: count mismatch")
        print(f'✓ Verification: {len(verify_games)} games in new MANIFEST')

if __name__ == '__main__':
    regenerate_manifest()