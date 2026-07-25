#!/usr/bin/env python3
"""
Onyx Systems — Daily Joke generator (no-repeat, mirrors the proven joke_state.json
pattern but unified with the cursor logic in daily_fun.py).

Reads data/jokes.json ({jokes:[{q,a}]}) + data/joke_state.json cursor.
Picks today's joke with a never-repeat trailing-window cursor, writes
data/today_joke.json = {q,a,date}, refills the cache when < 30.

The index.html loader already reads data/today_joke.json (patched previously),
so this script only writes data files — no markup changes needed.

Run:  python3 scripts/joke_daily.py
"""
import os, json, datetime
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")

# reuse the proven cursor from daily_fun.py
import importlib.util
spec = importlib.util.spec_from_file_location("daily_fun", os.path.join(HERE, "daily_fun.py"))
df = importlib.util.module_from_spec(spec); spec.loader.exec_module(df)

# Offline refill bank (computer/tech only — NO mobile/phone jokes per brand rule).
JOKES_EXTRA = [
    {"q": "Why do programmers prefer dark mode?", "a": "Because light attracts bugs."},
    {"q": "Why was the computer cold?", "a": "It left its Windows open."},
    {"q": "What does a baby computer call its father?", "a": "Data."},
    {"q": "Why did the checkbox get kicked out of school?", "a": "It kept marking everything false."},
    {"q": "Why did the RAM go to therapy?", "a": "It couldn't stop thinking about its past sessions."},
    {"q": "How many programmers does it take to change a light bulb?", "a": "None — that's a hardware problem."},
    {"q": "Why did the firewall break up with the router?", "a": "It caught it letting too much in."},
    {"q": "What's a computer's favorite beat?", "a": "The algorithm."},
    {"q": "Why was the USB stick sad?", "a": "It felt ejected."},
    {"q": "Why don't computers ever get lost?", "a": "They always follow the path."},
    {"q": "What did the router say to the laptop?", "a": "I'm feeling a little disconnected."},
    {"q": "Why did the GPU sit alone at lunch?", "a": "It was processing too many things at once."},
    {"q": "What do you call a computer that sings?", "a": "A Dell."},
    {"q": "Why was the keyboard so calm?", "a": "It had all the right keys."},
    {"q": "Why did the server go to the gym?", "a": "To build up its cache."},
    {"q": "What's a hacker's favorite season?", "a": "Phishing season."},
    {"q": "Why did the cursor blush?", "a": "It was caught pointing at something."},
    {"q": "Why was the BIOS so wise?", "a": "It had been through every boot."},
    {"q": "What do you call an honest computer?", "a": "A novel concept."},
    {"q": "Why did the cloud go to school?", "a": "To improve its cache-titude."},
]
FLOOR_JOKES = 30

def norm(s):
    return "".join(ch for ch in s.lower() if ch.isalnum())

def main():
    today = datetime.date.today().isoformat()
    pool_path = os.path.join(DATA, "jokes.json")
    state_path = os.path.join(DATA, "joke_state.json")
    jokes = json.load(open(pool_path))["jokes"]
    # refill
    if len(jokes) < FLOOR_JOKES:
        seen = {norm(j["q"]) for j in jokes}
        for j in JOKES_EXTRA:
            if norm(j["q"]) not in seen:
                jokes.append(j); seen.add(norm(j["q"]))
        json.dump({"jokes": jokes}, open(pool_path, "w"), indent=2)
    joke, idx = df.cursor_pick(jokes, state_path, today)
    out = {"q": joke["q"], "a": joke["a"], "date": today}
    json.dump(out, open(os.path.join(DATA, "today_joke.json"), "w"), indent=2)
    print(f"OK {today} JOKE: '{joke['q']}' (idx {idx}/{len(jokes)-1}) cache={len(jokes)}")

if __name__ == "__main__":
    main()