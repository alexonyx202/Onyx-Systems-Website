import json

# Load current feed
with open('data/feed.json') as f:
    feed = json.load(f)

# Today's news entry (from newsletter brief)
today_news = {
    'id': 'news-2026-07-25',
    'type': 'newsletter',
    'date': '2026-07-25',
    'title': 'FTC scam alert: fake agents call demanding payment \u2014 hang up, call 1-877-FTC-HELP',
    'tag': 'Security Alert',
    'excerpt': 'Your caller ID says "FTC." The voice sounds official, uses a real employee name, claims identity theft or recovered money. They need verification or a fee. The FTC does NOT cold-call, demand gift cards/crypto/wire/gold, and has no badge agents. Hang up. Share nothing. If concerned, call FTC yourself at 1-877-FTC-HELP or visit ReportFraud.ftc.gov.',
    'image': 'assets/img/news/2026-07-25-composite.jpg',
    'comic': 'assets/img/news/2026-07-25-comic-square.jpg',
    'read_more': '#contact'
}

# S2 posts (3 items)
s2_posts = [
    {
        'id': 'onyx-2026-07-25-tip-003',
        'type': 'tip',
        'date': '2026-07-25',
        'title': 'Windows 11 24H2 stops ransomware encrypting your files \u2014 Controlled Folder Access is free and already installed',
        'tag': 'OnyxSystems',
        'summary': 'Open Windows Security \u2192 Virus & threat protection \u2192 Manage ransomware protection \u2192 turn on Controlled Folder Access. Then click "Protected folders" and add your Documents, Pictures, and any work folders. Only whitelisted apps (Office, your editor, browser) can write there \u2014 ransomware gets blocked cold. Enable via PowerShell: `Set-MpPreference -EnableControlledFolderAccess Enabled; Add-MpPreference -ControlledFolderAccessProtectedFolders "$env:USERPROFILE\\Documents","$env:USERPROFILE\\Pictures","$env:USERPROFILE\\Desktop"`. Verify with `Get-MpPreference | Select EnableControlledFolderAccess`.',
        'truth': 'People pay for "ransomware protection" suites that just wrap this exact Windows feature. The honest answer: Microsoft built Controlled Folder Access into Defender in 2017 and it works \u2014 but it\'s OFF by default because some old apps break. ONYX SYSTEMS enables Controlled Folder Access on every build and whitelists the 5-6 apps the customer actually uses. Zero ransomware incidents in three years. ONYX SYSTEMS hardens your Windows install with Controlled Folder Access, whitelists your actual apps, and tests it against a simulated encryptor \u2014 so you know it works before you need it. Included with any tune-up.',
        'tags': ['#OnyxSystems', '#LakeCityFL', '#ComputerRepair', '#Ransomware', '#WindowsSecurity'],
        'cta': ''
    },
    {
        'id': 'onyx-2026-07-25-news-002',
        'type': 'news',
        'date': '2026-07-25',
        'title': 'Firefox 153 ships Containers by default \u2014 separate Work, Personal, Banking, Shopping in one window free',
        'tag': 'OnyxSystems',
        'summary': 'Open Firefox 153+, click the menu \u2192 New Container Tab \u2192 pick Work, Personal, Banking, or Shopping. Each Firefox Container has its own cookies, logins, and tracking \u2014 Google in your Work Firefox Container can\'t see your Personal YouTube history. No extension needed; it\'s built in. Get Firefox 153+ from mozilla.org/firefox.',
        'truth': 'Most people use Chrome profiles or incognito and think they\'re separated. They\'re not \u2014 Google still links them by IP and fingerprint. Firefox Containers is the only mainstream browser feature that actually isolates cookie jars at the engine level. I run four Firefox Containers daily and it\'s the single best privacy upgrade that costs zero dollars. ONYX SYSTEMS sets up Firefox Containers for your workflow and shows you how to auto-assign sites to the right Firefox Container. Free, takes 10 minutes.',
        'tags': ['#OnyxSystems', '#LakeCityFL', '#ComputerRepair', '#Firefox', '#Privacy'],
        'cta': ''
    },
    {
        'id': 'onyx-2026-07-25-tip-001',
        'type': 'tip',
        'date': '2026-07-25',
        'title': 'ONYX SYSTEMS: TECH TIP \u2014 Run Llama 3.3 8B locally on 8GB RAM \u2014 Ollama + Open WebUI is free, offline, no account needed',
        'tag': 'Tech Tip',
        'summary': 'Install Ollama from ollama.com (Windows/macOS/Linux), then run ollama run llama3.3:8b - that is a local model. For a chat UI, run docker run -d -p 3000:8080 -v open-webui:/app/backend/data ghcr.io/open-webui/open-webui:main and open localhost:3000. Your prompts never leave your machine.',
        'truth': 'Customers ask me which AI should I pay for. The honest answer: if your PC has 8GB+ RAM, you already own a better private AI than any $20/month cloud subscription. I run Llama 3.3 8B on a 5-year-old Dell and it codes, summarizes, and writes emails offline. Cloud AI is convenient; local AI is yours.',
        'tags': ['#OnyxSystems', '#LakeCityFL', '#ComputerRepair', '#LocalAI', '#Ollama'],
        'cta': 'Download Ollama at ollama.com, then run ollama run llama3.3:8b. For the web UI, run the Docker command above.'
    }
]

# Prepend today's news (remove any existing today news first)
feed['news'] = [n for n in feed['news'] if not (n.get('date') == '2026-07-25' and n.get('id') == 'news-2026-07-25')]
feed['news'].insert(0, today_news)

# Cap news to 6
feed['news'] = feed['news'][:6]

# Add S2 posts (remove any existing today posts with same IDs)
for p in s2_posts:
    feed['posts'] = [x for x in feed['posts'] if x.get('id') != p['id']]
    feed['posts'].insert(0, p)

# Cap posts to 8
feed['posts'] = feed['posts'][:8]

# Update timestamp
feed['updated'] = '2026-07-25'

# Save
with open('data/feed.json', 'w') as f:
    json.dump(feed, f, indent=2)

print('feed.json updated')
print(f'news count: {len(feed["news"])}')
print(f'posts count: {len(feed["posts"])}')