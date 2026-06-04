# Deploying CommandEditor to Vercel

Vercel is the simplest way to deploy this app — no local Node.js setup needed, free tier covers everything CommandEditor needs, and SSL is automatic.

---

## Option 1 — Deploy via GitHub (recommended)

This sets up automatic deployments: every time you push code changes, Vercel rebuilds and deploys.

### Step 1 — Push the code to GitHub

1. Go to **https://github.com/new** and create a new repository (e.g. `commandeditor`). Make it private if you want.
2. On your computer, install GitHub Desktop from **https://desktop.github.com** if you don't have git installed
3. Unzip `commandeditor-vercel.zip`
4. In GitHub Desktop, choose **File → Add Local Repository**, pick the unzipped folder, then **Publish repository** to GitHub

Alternatively, if you have git on the command line:
```
cd path/to/DocEditor-main
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/commandeditor.git
git branch -M main
git push -u origin main
```

### Step 2 — Connect Vercel to the repo

1. Go to **https://vercel.com/signup** and sign up with your GitHub account
2. On the Vercel dashboard, click **Add New → Project**
3. Find your `commandeditor` repo in the list and click **Import**
4. Vercel auto-detects this is a Next.js project — leave all settings at defaults
5. Click **Deploy**

Vercel builds and deploys the site in about 2 minutes. When done, you get a URL like `commandeditor-abc123.vercel.app`. Visit it to confirm everything works.

### Step 3 — Add your custom domain

1. In the Vercel dashboard, open your project, then go to **Settings → Domains**
2. Type `commandeditor.com` and click **Add**
3. Vercel shows you DNS records to configure. There are two options:
   - **Easiest:** transfer DNS to Vercel by changing nameservers at qservers
   - **Quickest:** add A and CNAME records at qservers pointing to Vercel
4. Add `www.commandeditor.com` the same way — Vercel will offer to redirect www to apex automatically
5. SSL certificates are issued automatically within minutes once DNS resolves

### DNS configuration at qservers

If you keep DNS at qservers, add these records in your DNS management panel:

| Type  | Host | Value                  |
| ----- | ---- | ---------------------- |
| A     | @    | 76.76.21.21            |
| CNAME | www  | cname.vercel-dns.com   |

Save, then go back to Vercel — it will detect the records within a few minutes and issue SSL.

---

## Option 2 — Deploy without GitHub (drag and drop)

If you don't want to use git, you can deploy directly from your computer.

### Step 1 — Install Vercel CLI

1. Install Node.js from **https://nodejs.org** (LTS version)
2. Open a terminal and install Vercel CLI:
   ```
   npm install -g vercel
   ```

### Step 2 — Deploy from the project folder

1. Unzip `commandeditor-vercel.zip`
2. In a terminal, navigate to the folder:
   ```
   cd path/to/DocEditor-main
   ```
3. Run:
   ```
   vercel
   ```
4. First time: it asks you to log in. Press Enter and follow the browser prompt.
5. It asks a few questions — accept all defaults by pressing Enter:
   - Set up and deploy? **yes**
   - Which scope? (your account)
   - Link to existing project? **no**
   - Project name? **commandeditor**
   - Directory? **./**
   - Override settings? **no**

Vercel builds and deploys. You get a preview URL.

To deploy to production:
```
vercel --prod
```

Then add your custom domain via the Vercel dashboard (Settings → Domains) as in Option 1 Step 3.

---

## Verifying the deploy

After deployment, visit `https://commandeditor.com` (or your `.vercel.app` URL) and check:

- [ ] Homepage loads with no errors in the browser console
- [ ] You can upload a PDF and run a tool (merge, split, compress)
- [ ] DevTools → Network tab shows no API calls when processing files (everything happens in your browser)
- [ ] Voice command works: click the mic icon, say "merge" — needs HTTPS to work
- [ ] PWA install prompt appears in Chrome's address bar
- [ ] `https://commandeditor.com/robots.txt` returns the robots file
- [ ] `https://commandeditor.com/sitemap.xml` returns the sitemap
- [ ] `https://www.commandeditor.com` redirects to `https://commandeditor.com`
- [ ] Security headers visible in DevTools → Network → request headers: CSP, HSTS, X-Frame-Options, Permissions-Policy

---

## What Vercel handles automatically

- HTTPS / SSL certificate (auto-renewed, free)
- HTTP → HTTPS redirect
- HTTP/2 and HTTP/3
- Global CDN (your site is served from the nearest data center to each visitor)
- Gzip and Brotli compression
- Static asset caching (immutable hashed filenames)
- Automatic deployments on every git push (Option 1 only)
- Preview deployments for every branch (Option 1 only)

The `vercel.json` in the project configures the security headers (CSP, HSTS, etc.) that the qservers `.htaccess` used to do.

---

## After launch

- Submit your sitemap to Google: https://search.google.com/search-console — add `commandeditor.com` as a property, then submit `https://commandeditor.com/sitemap.xml`
- Submit to Bing: https://www.bing.com/webmasters
- Set up free uptime monitoring at https://uptimerobot.com
- Work through `LAUNCH_CHECKLIST.md` before announcing publicly

---

## Pricing — what's free, what's not

Vercel's free **Hobby** plan covers everything CommandEditor needs:

- 100 GB bandwidth per month
- Unlimited static deploys
- Free SSL
- Free custom domain
- 100 GB-hours of serverless function execution (CommandEditor doesn't use functions, so this doesn't apply)

You'd only need to upgrade if you hit 100 GB/month bandwidth, which would mean roughly 50,000+ unique visitors per month. By then the site is successful enough to justify the $20/month Pro plan.

---

## Troubleshooting

**Build fails on Vercel**
Open the build logs in the Vercel dashboard. The most common cause is a TypeScript error — but I've already cleaned all of those, so if a new one appears it's because something else changed. If you see a `Module not found` error, check that all dependencies are in `package.json`.

**Custom domain shows "Invalid Configuration"**
DNS hasn't propagated yet. Wait 15–60 minutes and Vercel will detect it. Check status at https://dnschecker.org with `commandeditor.com` and confirm the records show worldwide.

**SSL certificate not issued**
SSL is auto-issued once DNS resolves to Vercel. If it's stuck for more than 30 minutes after DNS propagates, click the **Refresh** icon next to the domain in Vercel's Domains settings.

**`vercel` command not found**
The CLI install didn't complete. Try `npm install -g vercel` again, or use `npx vercel` instead.

**404 on subroutes after deployment**
Vercel handles Next.js routing automatically — this shouldn't happen. If it does, check that `next.config.js` has `trailingSlash: true` (it does in your project).

**Microphone permission denied for voice commands**
Browsers require HTTPS for the microphone API. Confirm the URL shows `https://` and the green padlock. Voice won't work on `http://` (only `localhost` is exempt).
