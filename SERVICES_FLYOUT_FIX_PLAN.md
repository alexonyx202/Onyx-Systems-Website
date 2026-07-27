# Onyx Systems Website - Services Flyout Fix Plan

## Problem Analysis

### Current Issues with Services Flyout (`SECTIONS.services` in index.html lines 1307-1314):
1. **Poorly written content** - Generic, doesn't match John's actual comprehensive service offering
2. **Specific repairs advertised** - "Screen repair" listed explicitly when user says "I do not advertise all the specific repairs I do"
3. **Content overflow** - Forces scrolling in the 540px wide flyout panel (height 100vh with sticky header/footer)
4. **Graphics need improvement** - SVGs are inconsistent style, some need better representation
5. **Doesn't communicate full scope** - Missing: custom builds, consulting, diagnostics, testing, Windows debloat/repair, OS reinstalls, data backups, generalized onsite service

### Current Services Flyout Content (lines 1307-1314):
```javascript
services:{
  eyebrow:'What I do',
  title:'Services',
  icon:'assets/img/cartoon/computer-fix.svg',
  html:
    '<div class="svc-row"><img class="svc-ic" src="assets/img/cartoon/computer-fix.svg" alt="Computer and laptop repair icon"><h3>Computer & Laptop Repair</h3></div><p>Cracked screens, dead batteries, slow machines, hardware faults — diagnosed and fixed right.</p>' +
    '<div class="svc-row"><img class="svc-ic" src="assets/img/cartoon/virus.svg" alt="Virus and malware removal icon"><h3>Virus & Malware Removal</h3></div><p>Clean infections, lock things down, and get you back online safely.</p>' +
    '<div class="svc-row"><img class="svc-ic" src="assets/img/cartoon/data.svg" alt="Data recovery icon"><h3>Data Recovery</h3></div><p>Photos, documents, and drives recovered from failed or corrupted storage.</p>' +
    '<div class="svc-row"><img class="svc-ic" src="assets/img/cartoon/upgrade.svg" alt="Upgrades and custom builds icon"><h3>Upgrades & Custom Builds</h3></div><p>More speed, more storage, or a new PC built to your needs and budget.</p>' +
    '<div class="svc-row"><img class="svc-ic" src="assets/img/cartoon/os.svg" alt="All operating systems icon"><h3>All Operating Systems</h3></div><p>Windows, macOS, Linux, and ChromeOS — setup, tuning, and fixes across the board.</p>' +
    '<div class="svc-row"><img class="svc-ic" src="assets/img/cartoon/network.svg" alt="On-site IT and networks icon"><h3>On-Site IT & Networks</h3></div><p>Wi-Fi, wiring, and small-business support at your home or office.</p>' +
    '<div class="chip-row"><span class="chip">Virus removal</span><span class="chip">SSD upgrades</span><span class="chip">Screen repair</span><span class="chip">Mac & Linux</span><span class="chip">Backups</span><span class="chip">Wi-Fi</span><span class="chip">Tuning</span></div>'
}
```

### Panel CSS Constraints (lines 269-293):
- Fixed width: `min(540px, 94vw)`
- Height: `100vh` with sticky header (78px) and footer (72px)
- Body: `overflow-y:auto` with 26px padding
- **Available content height: ~850px on desktop, ~600px on mobile**

---

## Solution Design

### New Service Categories (Generalized, No Specific Repair Types)

**Category 1: Computer Repair & Diagnostics** (computer-fix.svg)
- Hardware & software diagnostics
- Desktop, laptop, Mac repair
- Component-level troubleshooting

**Category 2: Virus, Malware & Security** (virus.svg)
- Virus & malware removal
- System hardening & cleanup
- Ransomware recovery

**Category 3: Data Services** (data.svg)
- Data recovery & backup solutions
- Drive cloning & migration
- Cloud backup setup

**Category 4: Upgrades & Custom Builds** (upgrade.svg)
- Hardware upgrades (SSD, RAM, GPU, etc.)
- Custom PC builds to spec
- Performance optimization

**Category 5: Operating Systems & Software** (os.svg)
- Windows, macOS, Linux, ChromeOS
- OS installation, repair & migration
- Windows debloat & problem resolution
- Software setup & troubleshooting

**Category 6: On-Site IT & Networks** (network.svg)
- Home & small business on-site service
- Wi-Fi, networking, wiring
- By appointment, evenings preferred

**Category 7: Consulting & Sales** (gear.svg)
- Technology consulting & purchasing advice
- Refurbished computer sales
- IT guidance for home & business

---

### Improved Content Structure (Fits Without Scroll)

The panel body has ~850px height. With proper spacing, 7 categories fit comfortably.

**New HTML Structure:**
```html
<!-- Category rows with icons -->
<div class="svc-row">
  <img class="svc-ic" src="assets/img/cartoon/computer-fix.svg" alt="">
  <div>
    <h3>Computer Repair & Diagnostics</h3>
    <p>Desktops, laptops, Macs — hardware & software faults found and fixed.</p>
  </div>
</div>

<div class="svc-row">
  <img class="svc-ic" src="assets/img/cartoon/virus.svg" alt="">
  <div>
    <h3>Virus, Malware & Security</h3>
    <p>Complete cleanup, system hardening, and ransomware recovery.</p>
  </div>
</div>

<div class="svc-row">
  <img class="svc-ic" src="assets/img/cartoon/data.svg" alt="">
  <div>
    <h3>Data Recovery & Backups</h3>
    <p>Drive recovery, cloning, migration, and automated backup setup.</p>
  </div>
</div>

<div class="svc-row">
  <img class="svc-ic" src="assets/img/cartoon/upgrade.svg" alt="">
  <div>
    <h3>Upgrades & Custom Builds</h3>
    <p>SSD, RAM, GPU upgrades; custom PCs built to your needs and budget.</p>
  </div>
</div>

<div class="svc-row">
  <img class="svc-ic" src="assets/img/cartoon/os.svg" alt="">
  <div>
    <h3>All Operating Systems</h3>
    <p>Windows, macOS, Linux, ChromeOS — install, repair, debloat, migrate.</p>
  </div>
</div>

<div class="svc-row">
  <img class="svc-ic" src="assets/img/cartoon/network.svg" alt="">
  <div>
    <h3>On-Site IT & Networks</h3>
    <p>Home/small business visits by appointment — Wi-Fi, wiring, setup.</p>
  </div>
</div>

<div class="svc-row">
  <img class="svc-ic" src="assets/img/cartoon/gear.svg" alt="">
  <div>
    <h3>Consulting, Sales & Advice</h3>
    <p>Tech purchasing guidance, refurbished systems, honest recommendations.</p>
  </div>
</div>

<!-- Tag chips - GENERALIZED (no specific repairs) -->
<div class="chip-row">
  <span class="chip">All computers</span>
  <span class="chip">All operating systems</span>
  <span class="chip">Hardware & software</span>
  <span class="chip">Custom builds</span>
  <span class="chip">Data & backups</span>
  <span class="chip">On-site service</span>
  <span class="chip">Consulting & sales</span>
</div>
```

---

### CSS Improvements Needed

1. **Reduce vertical spacing** in `.svc-row` (currently 18px margin + 6px h3 margin)
2. **Tighter chip row** spacing
3. **Ensure icons are consistent** - may need a new `gear.svg` or use existing `gear.svg` for consulting
4. **Better responsive behavior** - panel should not force scroll on desktop

---

## Implementation Checklist

- [ ] Update `SECTIONS.services` object in index.html with new content
- [ ] Verify all SVG icons exist (gear.svg exists for consulting)
- [ ] Test flyout panel on desktop (no scroll) and mobile (minimal scroll)
- [ ] Verify chip tags are generalized, no specific repairs
- [ ] Ensure content matches user's stated service scope exactly
- [ ] Test in browser (onyxpc.us) after deployment
- [ ] Verify no "AI slop" - clean, professional, conversion-focused copy

---

## Perfect Prompt for Implementation

See `SERVICES_FLYOUT_FIX_PROMPT.md` for the exact prompt to give to an AI agent to implement this fix perfectly.