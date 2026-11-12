def parse_tech_notes(md_path):
    md = md_path.read_text(encoding="utf-8")
    posts = []
    # Match "## Post N:" or "## Post N —" or "## Post N -" or "## Post N" (with optional header label)
    for m in re.finditer(r"^##\\s*Post\\s+(\\d+)\\s*(?:[:—–-]\\s*)?(.*)$", md, re.M):
        start = m.end()
        header_label = m.group(2).strip()  # e.g. "DAILY BRIEF SUMMARY", "SECURITY", "LOCAL-N-FL"
        # Determine post type based on header label (S2 spec)
        # Post 1 (Daily-Brief Summary) → news[] ONLY (type: "newsletter")
        # Post 2+ (News + Tip) → posts[] ONLY (type: "news" or "tip")
        if "Daily Brief Summary" in header_label or "Daily Brief" in header_label:
            # Post 1: Daily-Brief Summary → news[] ONLY
            # Parse body for news[] entry
            start = m.end()
            # Find next "## Post N" to delimit this post's body
            nm = re.search(r"^##\\s*Post\\s+\\d+\\s*(?:[:—–-]\\s*)?.*$\", md[start:], re.M)
            end = start + (nm.start() if nm else len(md[start:]))
            body = md[start:end]
            # Extract headline (must name the product)
            real_headline = _heading_section(body, "Headline")
            real_headline = re.sub(r"\s+", " ", _strip_bold(real_headline)).strip()
            headline = real_headline if real_headline else header_label
            
            # Extract tip (must state obtain method)
            tip = _strip_bold(_heading_section(body, "The Tip")).strip()
            
            # Truth section is first-person shop narrative (exempt from jargon check)
            truth = _strip_bold(_heading_section(body, "The Shop Owner's Truth")).strip()
            
            # Build news[] entry (type: "newsletter")
            posts.append({
                "id": f"onyx-2026-{date_iso}-daily-brief-auto",
                "type": "newsletter",
                "title": headline,
                "summary": tip,
                "truth": truth,
                "tags": _hashtags(body) or BASE_TAGS,
                "date": date_iso
            })
        else:
            # Posts 2+ → posts[] ONLY (type: "news" or "tip")
            start = m.end()
            nm = re.search(r"^##\\s*Post\\s+\\d+\\s*(?:[:—–-]\\s*)?.*$\", md[start:], re.M)
            end = start + (nm.start() if nm else len(md[start:]))
            body = md[start:end]
            
            # Extract headline (must name the product)
            real_headline = _heading_section(body, "Headline")
            real_headline = re.sub(r"\s+", " ", _strip_bold(real_headline)).strip()
            headline = real_headline if real_headline else header_label
            
            # Extract tip (must state obtain method)
            tip = _strip_bold(_heading_section(body, "The Tip")).strip()
            
            # Truth section is first-person shop narrative (exempt from jargon check)
            truth = _strip_bold(_heading_section(body, "The Shop Owner's Truth")).strip()
            
            # Build posts[] entry (type: "news" or "tip")
            post_type = "news" if "News" in header_label or "Security" in header_label else "tip"
            posts.append({
                "id": f"onyx-2026-{date_iso}-post-{m.group(1)}",
                "type": post_type,
                "title": headline,
                "tip": tip,
                "truth": truth,
                "tags": _hashtags(body) or BASE_TAGS,
                "date": date_iso
            })
    return posts