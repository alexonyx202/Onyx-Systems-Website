#!/usr/bin/env python3
"""
Arcade Page Verification Script
Run after every game add/update to verify the arcade page is correct.
Usage: python3 scripts/verify_arcade_page.py [--live]
"""
import json
import re
import sys
import subprocess
import time

def verify_games_json():
    """Verify games.json is valid and has expected structure"""
    with open('games/games.json') as f:
        data = json.load(f)
    games = data.get('games', [])
    print(f'✓ games.json: {len(games)} games')
    for g in games:
        required = ['file', 'title', 'tagline', 'desc', 'thumb', 'cabinet', 'featured']
        for req in required:
            if req not in g:
                raise ValueError(f"Missing field '{req}' in game: {g.get('title', 'unknown')}")
    return games

def verify_cabinet_files(games):
    """Verify all cabinet files exist"""
    import os
    assets_dir = 'games/assets/'
    for g in games:
        cabinet = g.get('cabinet', '').replace('assets/', '')
        path = os.path.join(assets_dir, cabinet)
        if not os.path.exists(path):
            raise FileNotFoundError(f"Missing cabinet: {path} for {g['title']}")
    print(f'✓ All {len(games)} cabinet files exist')

def verify_manifest_matches(games):
    """Verify MANIFEST in games/index.html matches games.json exactly"""
    with open('games/index.html') as f:
        html = f.read()
    
    match = re.search(r'var MANIFEST=(\[.*?\]);', html, re.DOTALL)
    if not match:
        raise ValueError("MANIFEST not found in games/index.html")
    
    manifest_games = json.loads(match.group(1))
    
    if len(manifest_games) != len(games):
        raise ValueError(f"Count mismatch: MANIFEST={len(manifest_games)} vs games.json={len(games)}")
    
    for i, (m, g) in enumerate(zip(manifest_games, games)):
        if m['file'] != g['file']:
            raise ValueError(f"Index {i}: file mismatch: {m['file']} vs {g['file']}")
        if m['title'] != g['title']:
            raise ValueError(f"Index {i}: title mismatch: {m['title']} vs {g['title']}")
        if m.get('cabinet') != g.get('cabinet'):
            raise ValueError(f"Index {i}: cabinet mismatch for {g['title']}: {m.get('cabinet')} vs {g.get('cabinet')}")
    
    print(f'✓ MANIFEST matches games.json perfectly ({len(games)} games)')

def verify_grid_columns():
    """Verify 5-column grid on arcade page"""
    with open('games/index.html') as f:
        content = f.read()
    if 'repeat(5,minmax(0,1fr))' not in content:
        raise ValueError("5-column grid not found in games/index.html")
    print('✓ 5-column grid present in games/index.html')

def verify_new_games_badge():
    """Verify NEW GAMES badge on arcade page"""
    with open('games/index.html') as f:
        content = f.read()
    if 'new-games-badge' not in content:
        raise ValueError("NEW GAMES badge not found in games/index.html")
    print('✓ NEW GAMES badge present in games/index.html')

def verify_pwa_headers():
    """Verify PWA headers in new game HTML files"""
    new_games = ['data-break.html', 'bug-swarm.html', 'neon-pilot.html', 'technobonk.html']
    for fname in new_games:
        with open(f'games/{fname}') as f:
            head = f.read(1000)
        if 'manifest.webmanifest' not in head:
            raise ValueError(f"Missing manifest.webmanifest in {fname}")
        if 'apple-touch-icon' not in head:
            raise ValueError(f"Missing apple-touch-icon in {fname}")
    print(f'✓ PWA headers present in {len(new_games)} new games')

def verify_local_render():
    """Start local server and verify arcade page has required static elements"""
    # Start server
    proc = subprocess.Popen(['python3', '-m', 'http.server', '8099'], 
                           cwd='.', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    
    try:
        # Fetch and check
        result = subprocess.run(['curl', '-s', 'http://localhost:8099/games/'], 
                              capture_output=True, text=True, timeout=10)
        html = result.stdout
        
        # Check key static elements (JS-rendered cards won't appear in raw HTML)
        checks = [
            ('renderGames function', 'function renderGames'),
            ('MANIFEST variable', 'var MANIFEST='),
            ('gameGrid element', 'id="gameGrid"'),
            ('NEW GAMES badge', 'new-games-badge'),
            ('5-column grid', 'repeat(5,minmax'),
        ]
        
        for name, pattern in checks:
            if pattern not in html:
                raise ValueError(f"Missing '{pattern}' ({name}) in rendered page")
        
        # Verify MANIFEST matches games.json count
        with open('games/games.json') as f:
            expected_count = len(json.load(f)['games'])
        match = re.search(r'var MANIFEST=(\[.*?\]);', html, re.DOTALL)
        if match:
            manifest_games = json.loads(match.group(1))
            if len(manifest_games) != expected_count:
                raise ValueError(f"MANIFEST has {len(manifest_games)} games, expected {expected_count}")
        
        print(f'✓ Local render: all static elements present, MANIFEST has {expected_count} games')
        
    finally:
        proc.terminate()
        proc.wait()

def verify_live():
    """Verify live site on onyxpc.us"""
    print("\n--- LIVE VERIFICATION ---")
    
    # Check games.json
    result = subprocess.run(['curl', '-s', 'https://onyxpc.us/games/games.json'], 
                          capture_output=True, text=True, timeout=15)
    live_games = json.loads(result.stdout)['games']
    print(f'✓ Live games.json: {len(live_games)} games')
    
    # Check arcade page - verify static elements and MANIFEST
    result = subprocess.run(['curl', '-s', 'https://onyxpc.us/games/'], 
                          capture_output=True, text=True, timeout=15)
    html = result.stdout
    
    # Check key static elements
    checks = [
        ('renderGames function', 'function renderGames'),
        ('MANIFEST variable', 'var MANIFEST='),
        ('gameGrid element', 'id="gameGrid"'),
        ('NEW GAMES badge', 'new-games-badge'),
        ('5-column grid', 'repeat(5,minmax'),
    ]
    
    for name, pattern in checks:
        if pattern not in html:
            raise ValueError(f"Live: Missing '{pattern}' ({name})")
    print('✓ Live arcade page: all static elements present')
    
    # Verify MANIFEST matches games.json count (not truncated)
    match = re.search(r'var MANIFEST=(\[.*?\]);', html, re.DOTALL)
    if match:
        manifest_games = json.loads(match.group(1))
        if len(manifest_games) != len(live_games):
            raise ValueError(f"Live MANIFEST has {len(manifest_games)} games, expected {len(live_games)}")
        print(f'✓ Live MANIFEST: {len(manifest_games)} games (not truncated)')
    else:
        raise ValueError("Live: MANIFEST not found")
    
    # Check cabinet images return 200
    for g in live_games:
        cabinet = g.get('cabinet', '').replace('assets/', '')
        result = subprocess.run(['curl', '-sI', f'https://onyxpc.us/games/assets/{cabinet}'], 
                              capture_output=True, text=True, timeout=10)
        if '200' not in result.stdout:
            raise ValueError(f"Live cabinet missing: {cabinet} for {g['title']}")
    print(f'✓ All {len(live_games)} cabinet images return HTTP 200')

def main():
    live = '--live' in sys.argv
    
    print("=== Arcade Page Verification ===\n")
    
    try:
        games = verify_games_json()
        verify_cabinet_files(games)
        verify_manifest_matches(games)
        verify_grid_columns()
        verify_new_games_badge()
        verify_pwa_headers()
        verify_local_render()
        
        if live:
            time.sleep(30)  # Wait for GitHub Pages to rebuild
            verify_live()
        
        print("\n=== ALL CHECKS PASSED ===")
        return 0
        
    except Exception as e:
        print(f"\n✗ VERIFICATION FAILED: {e}")
        return 1

if __name__ == '__main__':
    sys.exit(main())