# CommandEditor — Launch Checklist

Work through this before announcing the site publicly.

## Pre-launch — technical

- [ ] `npm install` runs without errors on the build machine
- [ ] `npm run build` produces an `out/` directory
- [ ] `out/index.html` exists and references hashed `_next/static/` bundles
- [ ] `out/.htaccess` exists with the security headers
- [ ] `out/pdf.worker.min.mjs` exists (copied automatically by the build)
- [ ] `out/manifest.json`, `out/robots.txt`, `out/sitemap.xml` exist
- [ ] Total `out/` size is reasonable (typically 5–15 MB)

## Pre-launch — hosting

- [ ] DNS A records for `commandeditor.com` and `www.commandeditor.com` point to qservers IP
- [ ] Let's Encrypt SSL certificate is active (AutoSSL run completed)
- [ ] `https://commandeditor.com` returns 200 OK
- [ ] `http://commandeditor.com` returns 301 → `https://commandeditor.com`
- [ ] `https://www.commandeditor.com` returns 301 → `https://commandeditor.com`
- [ ] Security headers visible in browser DevTools: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy

## Pre-launch — functional

- [ ] Upload a PDF — does it preview?
- [ ] Try each major tool category at least once: merge, split, compress, convert, OCR, sign, edit
- [ ] All tools render their UI without console errors
- [ ] Voice commands work — test in Chrome on HTTPS: "merge", "split", "darkmode", "help", "undo", "zoomin", "install"
- [ ] PWA install prompt appears (look for the install icon in Chrome's address bar)
- [ ] Mobile responsive: test on a phone — does the layout adapt? Are buttons tappable?
- [ ] Dark mode toggle works and persists across reload (localStorage)
- [ ] localStorage migration: confirm any users with old `doceditor-*` keys get auto-migrated to `commandeditor-*`

## Pre-launch — quality

- [ ] No errors in browser console on the homepage
- [ ] No errors when opening each tool
- [ ] Lighthouse score: Performance ≥ 90, Accessibility ≥ 90, Best Practices ≥ 90, SEO ≥ 90
- [ ] No mixed-content warnings
- [ ] No 404s in the Network tab

## Pre-launch — SEO and discovery

- [ ] `robots.txt` accessible at `https://commandeditor.com/robots.txt`
- [ ] `sitemap.xml` accessible at `https://commandeditor.com/sitemap.xml`
- [ ] Submitted sitemap to Google Search Console
- [ ] Submitted sitemap to Bing Webmaster Tools
- [ ] `meta description` on the homepage is unique and compelling
- [ ] Open Graph image (`og:image`) renders correctly when shared on social
- [ ] Favicon shows in browser tabs

## Privacy promise verification

CommandEditor's differentiator is that files never leave the user's device. Confirm this is true:

- [ ] Open DevTools → Network tab
- [ ] Upload a PDF and run merge, split, compress, sign, OCR
- [ ] No request body contains the PDF
- [ ] No `XHR` or `fetch` calls go to any backend (only static asset loads from `commandeditor.com`)
- [ ] Disconnect from the internet, reload the page (PWA), upload a file — does the tool still work?

## Post-launch

- [ ] Set up uptime monitoring (e.g. UptimeRobot — free)
- [ ] Set up an analytics tool that respects privacy (Plausible, Fathom) — or no analytics at all to honor the privacy promise
- [ ] Set up a feedback channel (form on a Contact page, or an email address)
- [ ] Write a launch announcement post with the key differentiator: "all processing happens in your browser, your files never leave your device"
- [ ] Share on Hacker News, Product Hunt, relevant subreddits

## Comparison to competitors

To make sure CommandEditor is competitive, verify these capabilities work better or are at least on par:

- **vs Smallpdf** (which limits free users to 2 tasks/day, $12/mo Pro) — CommandEditor is unlimited and free
- **vs iLovePDF** ($7/mo Premium, 25 MB file cap) — CommandEditor has no file size cap (limited only by browser memory)
- **vs PDF24** (free with ads) — CommandEditor is ad-free
- **vs Sejda** (3 tasks/day free) — CommandEditor is unlimited

Everyone else uploads files to a server. CommandEditor's privacy-first architecture is the moat.
