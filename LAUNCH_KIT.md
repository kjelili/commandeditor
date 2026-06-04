# CommandEditor — Complete Launch Kit

Everything needed to launch. All numbers verified accurate (50+ tools, 50+ voice commands). Copy is paste-ready.

---

## 0. The positioning (memorise this)

> **The PDF toolkit you control with your voice — free, private, nothing leaves your device.**

Three angles, every piece of copy leads with one:

1. **Voice novelty** — "Edit a PDF without touching your mouse." (curiosity, shareable)
2. **Privacy anger** — "Your contract shouldn't be uploaded to a stranger's server to merge two pages." (taps existing frustration with Smallpdf/iLovePDF)
3. **Free, no catch** — "Unlimited. No signup. No 2-files-a-day wall." (attacks Smallpdf's free-tier cap)

---

## 1. Pre-launch gate (ALL must pass before posting anything)

- [ ] `commandeditor.com` AND `www.commandeditor.com` load on mobile data (not just wifi)
- [ ] Upload a PDF, run a tool, file downloads correctly — VERIFIED (compress 4827KB→2781KB)
- [ ] Voice command fires end-to-end — VERIFIED ("compress" by voice worked)
- [ ] Command reference panel opens and search works
- [ ] DevTools Network tab shows zero file upload when processing
- [ ] GitHub repo is PUBLIC (incognito, no 404) — VERIFIED public
- [ ] Latest build deployed (50+/50+ counts, OCR command, command panel)
- [ ] Demo video recorded using sample-demo-document.pdf ONLY
- [ ] Tested on a real phone, not just desktop

**Hard rule: every document shown in any public asset is the synthetic sample-demo-document.pdf. Never a real document. One real BVN/account number in one video frame is an irreversible leak.**

---

## 2. Product Hunt

**Tagline (60 char max):**
> The PDF toolkit you control with your voice — free & private

**Description:**
> CommandEditor is a PDF toolkit with one difference: nothing you open ever leaves your device. 50+ tools — merge, split, compress, sign, redact, OCR — run entirely in your browser. No uploads, no sign-up, no file-size limits, no "2 files a day then pay" wall.
>
> It's also the first PDF tool you operate by voice: 50+ hands-free commands. Say "merge," it merges. Built for speed, privacy, and accessibility.
>
> Free forever. Open source — verify the privacy claim yourself.

**Maker's first comment (post this yourself immediately — most-read element):**
> Hi PH 👋 I built CommandEditor because I was tired of uploading sensitive documents — contracts, IDs, tax forms — to random websites just to merge two pages. Every "free" PDF tool either caps you hard or quietly ships your files to their servers.
>
> CommandEditor does everything client-side. Open DevTools, watch the Network tab while you process a file — nothing uploads. That's the whole point, and you can verify it.
>
> The voice control started as an accessibility experiment and became my favourite feature. 50+ commands, hands-free.
>
> Free, no account, code is open. Genuinely keen for feedback — especially PDFs that break a tool. Tear it apart.

**Gallery shot list (use sample-demo-document.pdf for any document shown):**
1. Hero — "Document work, by voice."
2. The tool grid showing the full set
3. A voice command firing (mic active, command recognised)
4. DevTools Network tab proving zero uploads — *the killer shot*
5. The 15-second demo video (set as first gallery item)

---

## 3. Show HN (Hacker News)

**Title:**
> Show HN: CommandEditor – browser-only, voice-controlled PDF tools (no uploads)

**Body:**
> I built a PDF toolkit that runs entirely in the browser — pdf-lib, pdfjs, Web Crypto, all client-side. There's no file upload endpoint at all; you can confirm in the Network tab.
>
> 50+ tools (merge, split, OCR, redact, sign, AES-256, PII scan, accessibility audit) and 50+ voice commands via the Web Speech API — that part started as an accessibility experiment.
>
> Stack: Next.js on Vercel. The privacy model is the architecture, not a policy promise — there's nowhere for files to go.
>
> Free, no account. Code: https://github.com/kjelili/commandeditor
>
> Interested in feedback on client-side limits — password-protected PDF decryption is the obvious one pdf-lib can't do, and OCR is slower than server-side. Curious how others handled these in-browser.

---

## 4. Reddit — three maker posts (one per day, never simultaneously)

**r/privacy:**
> Title: I built a PDF editor that physically can't see your files — everything runs in your browser
>
> Tired of Smallpdf/iLovePDF uploading sensitive docs to their servers, I made one with no upload endpoint at all. 50+ tools, all client-side, open source so you can verify. Free, no signup. Want privacy folks to poke holes in it: [link]

**r/InternetIsBeautiful:**
> Title: A PDF toolkit you control with your voice — 50+ tools, runs entirely in your browser
>
> Say "merge" and it merges. Nothing uploads anywhere. Free, no account. [link]

**r/accessibility:**
> Title: Voice-controlled PDF tools — 50+ hands-free commands, fully keyboard-navigable
>
> Built with accessibility as a first-class goal. 50+ voice commands for merge/split/sign/etc., no mouse required. Free and open source. Would value feedback from people who rely on assistive tech — what's missing? [link]

---

## 5. Paid/social ad creative (4 angles — test cheap, scale the winner)

**Privacy anger (Meta/Reddit):**
> You shouldn't have to upload a confidential contract to a random website just to merge two pages.
>
> CommandEditor does it all in your browser. Files never leave your device. No upload, no signup, no "2 free files a day" wall.
>
> 50+ tools. Free. You can run them by voice.
>
> commandeditor.com

**Voice novelty (X/TikTok):**
> I made a PDF editor you talk to.
>
> Say "merge" — it merges. Say "compress" — it shrinks. 50+ tools, hands-free.
>
> Everything runs in your browser, so your documents never touch a server. Free, no signup.
>
> [attach 15-sec video] commandeditor.com

**Free-no-catch (Meta/Reddit):**
> Every "free" PDF site: 2 files a day, then $12/month.
>
> CommandEditor: unlimited, no signup, no file-size cap, no catch. It all runs in your browser — which is also why it's private. Nothing you open is uploaded anywhere.
>
> It's even voice-controlled. commandeditor.com

**Accessibility (LinkedIn/X):**
> A PDF toolkit you operate hands-free.
>
> 50+ voice commands — merge, split, sign, redact, OCR — no mouse needed. Runs fully in the browser, works offline after first load, nothing you open is ever uploaded.
>
> Built accessible. Free, no account. commandeditor.com

---

## 6. The 15-second demo video storyboard

**Specs:** Vertical 9:16 (1080×1920), 15s hard cap, captions on every shot, NO voiceover, screen recording (clean browser), one royalty-free trending audio track. Use ONLY sample-demo-document.pdf.

| Time | Visual | Caption |
|------|--------|---------|
| 0.0–2.5s | A *different* generic PDF site. File dragged in, spinner: "Uploading to our servers…" | `every free PDF tool does this 👆` |
| 2.5–3.0s | Hard cut to black (tension beat) | *(none)* |
| 3.0–5.0s | CommandEditor open, sample doc loaded, cursor moves away from mouse | `this one's different` |
| 5.0–6.0s | Mic button pulses, listening indicator | `🎙 "merge these"` |
| 6.0–9.0s | The PDFs visibly merge | `done. by voice.` |
| 9.0–11.5s | DevTools Network tab, zero upload requests, arrow pointing at empty list | `nothing left my computer ✅` |
| 11.5–14.0s | Quick montage: "compress" → shrinks, "sign" → signature appears | `50+ tools. all by voice.` |
| 14.0–15.0s | End card: logo, headline, URL | `commandeditor.com — free, no signup` |

**The DevTools shot (9–11.5s) is the whole video — it's proof, not a claim. Never cut it; cut the montage instead if over 15s.**

Make 3 variants changing ONLY the first caption: "every free PDF tool does this" / "POV: you stop uploading private docs to random sites" / "why is merging 2 PDFs so sketchy in 2026". Put the $100 behind whichever wins.

**Pair-with copy (X/Twitter):**
> I made a PDF editor you talk to.
>
> Say "merge" → it merges. Say "compress" → it shrinks. 50+ tools, all by voice.
>
> And nothing uploads — every file stays in your browser. Watch the Network tab. 👇
>
> Free, no signup. commandeditor.com

---

## 7. Launch-day runbook (Day 2 — the main event)

**Pick a Tuesday, Wednesday, or Thursday. Never Fri–Mon.**

**Night before:**
- All gate checks pass, video exported to phone + laptop
- PH account profile complete (photo, bio), HN account a few days old
- All posts saved in a notes file, ready to paste — do not compose live

**12:01 AM Pacific Time — Product Hunt live**
(PH runs on PT; 12:01 AM PT = full 24h voting window. Use PH scheduling if that hour is impossible.)
- Post tagline, description, gallery, video first
- Immediately post the maker's first comment yourself

**First 3 hours (critical — PH ranking is velocity-sensitive):**
- Reply to every comment within minutes, human and specific
- Do NOT mass-DM "please upvote" — PH penalises vote manipulation
- Share to networks as "launched today, would love honest feedback" — not "upvote me"

**~9 AM your time — Show HN live:**
- NEVER ask for upvotes (HN bans for this — zero tolerance)
- Reply substantively to every technical comment
- Lead with architecture honesty: no upload endpoint, verify in Network tab, repo link
- Expect a harsh comment. Grace + facts, never defensive. Lurkers judge your response more than the criticism

**Throughout the day:**
- Check both tabs every 15–20 min. Response speed is the biggest factor you control
- Bug report? Acknowledge fast and honestly. Don't argue
- Block the whole day. A launch with no founder replying for 3 hours is dead

**End of day:** Note which angle (privacy/voice/free) resonated most in comments — that decides where the $100 goes.

**Days 3–5:** r/privacy, then r/InternetIsBeautiful, then r/accessibility. One per day. Reply to every comment.

**Day 7+:** Put the entire $100 behind the single winning angle on the one platform where it landed. One concentrated burst, not scattered.

---

## 8. Hard rules (irreversible if broken)

1. Never ask for upvotes on HN or PH — both detect and punish it
2. Only the synthetic sample PDF appears in any asset, ever
3. Don't argue with critics — grace + facts; the silent majority is watching
4. Don't launch and walk away — block the whole day
5. One platform underperforming ≠ campaign failure; each day is a separate shot

---

## 9. Realistic success calibration

Most Show HN posts get modest traction. A *good* first launch: a few hundred PH upvotes, a HN post at 20–80 points with real comments, a few hundred genuine visits. Viral is rare and not the goal. The goal: real users, honest feedback, the first people who tell others. That compounds.

---

## 10. Post-launch (free, do these)

- Submit sitemap to Google Search Console (commandeditor.com → submit sitemap.xml)
- Submit to Bing Webmaster Tools
- Free uptime monitoring at uptimerobot.com
- Privacy-respecting analytics (Plausible/Fathom) or none — never break the privacy promise
- A feedback channel (form or email)

---

## Strategic note

You entered a crowded market (Smallpdf, iLovePDF, PDF24) plus a direct privacy-first rival (ExactPDF) with a head start. Your two real moats: **voice control** (genuinely unique — no competitor has it) and **verifiable client-side privacy** (now that the repo is public, "verify it yourself" is true and powerful — ExactPDF and incumbents can't credibly claim this because their processing is server-side).

Don't compete on "browser-only privacy" alone (ExactPDF got there first). Lead with **"voice-controlled, accessible, hands-free PDF processing"** — that's the territory you own.
