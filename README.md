# Stridekick Brand Kit

A small static site that mirrors a Google Drive folder: your team drops
assets into Drive, and the site renders whatever's there. No manual
link-updating. Two ways to connect it to Drive are included — pick
whichever matches the access you actually have (see step 1).

```
stridekick-brand-kit/
├── site/                     ← the deployable static site (host this folder)
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── config.js             ← paste your manifest URL here (the only edit you need)
│   ├── planned-taxonomy.js   ← the full section list, incl. ones not in Drive yet
│   └── data/
│       ├── manifest.sample.json   ← placeholder data, used until a real manifest exists
│       └── manifest.json          ← optional, written by sync/ (Option B only)
├── apps-script/
│   └── Code.gs                ← Option A: no Google Cloud access needed
├── sync/
│   ├── fetch-drive-manifest.js    ← Option B: service-account version
│   ├── package.json
│   └── .env.example
└── .github/workflows/sync-and-deploy.yml   ← optional, pairs with Option B

Open `site/index.html` directly (or run any static file server in that
folder) right now and you'll see the sample data laid out — that's the
whole point of shipping it separately from the real manifest.

## 1. Connect Drive (one-time)

There are two ways to do this. Use whichever matches what you actually
have access to.

### Option A — Apps Script (no Google Cloud access needed)

This is the path if you don't have permission to create things in Google
Cloud Console. It runs entirely under your own Google account.

1. Go to [script.google.com](https://script.google.com) → **New project**.
2. Paste in the contents of `apps-script/Code.gs`.
3. Replace `PASTE_YOUR_FOLDER_ID_HERE` with your real folder's ID — the
   long string in the folder's URL. For the test folder you shared,
   that's the `1y3qv2wvSBCGJPjCXHmnXnsxN8teLOjz8` part of
   `drive.google.com/drive/folders/1y3qv2wvSBCGJPjCXHmnXnsxN8teLOjz8`.
4. Click **Run** once (any function selected in the toolbar is fine) to
   trigger the Drive permission prompt, and approve it — it's asking to
   let *your own* script read *your own* Drive, nothing is shared
   externally at this step.
5. **Deploy → New deployment → Web app** → Execute as **Me**, Who has
   access **Anyone** → Deploy. Copy the URL it gives you (ends in `/exec`).
6. Paste that URL into `site/config.js` as `manifestUrl`.
7. Test it: open the `/exec` URL directly in a browser tab first — you
   should see raw JSON of your folder tree. If that works, the site will
   read it too, live, on every page load. Nothing to re-run or schedule.

Full comments and a fallback approach (in case your folder gets large
enough that live computation feels slow) are in `apps-script/Code.gs`.

### Option B — Service account + sync script (if you get Cloud access later)

If someone on your team *does* have Google Cloud Console access, this
version is a bit more robust for very large kits and works with Shared
Drives. It's not required — Option A covers the same outcome.

1. In [Google Cloud Console](https://console.cloud.google.com), create (or
   reuse) a project, then enable the **Google Drive API**.
2. Under **IAM & Admin → Service Accounts**, create a service account. No
   special roles needed.
3. Open the service account → **Keys → Add key → JSON**. This downloads a
   key file — treat it like a password.
4. Copy the service account's email address (looks like
   `brand-kit@your-project.iam.gserviceaccount.com`).
5. In Drive, share your brand kit root folder with that email as a
   **Viewer**.

```bash
cd sync
npm install
cp .env.example .env      # then paste in your folder ID + key
npm run sync
```

This writes `site/data/manifest.json`, which the site reads as a fallback
if `config.js`'s `manifestUrl` is empty.

## 2. Host it at brand.stridekick.com

The `site/` folder is a plain static site — any static host works
(Cloudflare Pages, Netlify, Vercel, and GitHub Pages are all free at this
scale). Point that host at the `site` directory as the publish root.

Then, in Stridekick's DNS provider, add:

```
CNAME   brand   →   <the target your host gives you>
```

Your host will handle SSL automatically once the CNAME resolves. This
part needs whoever manages `stridekick.com`'s DNS.

## 3. Keep it auto-updating

If you used **Option A (Apps Script)**, you're already done — the site
reads the `/exec` URL live on every page load, so nothing else to set up.

If you used **Option B (service account)**, `manifest.json` only updates
when someone runs `npm run sync`. `.github/workflows/sync-and-deploy.yml`
automates that on a schedule (every 6 hours by default) and commits the
refreshed manifest. To use it:

1. Push this project to a GitHub repo.
2. Add two repo secrets: `DRIVE_ROOT_FOLDER_ID` and
   `GOOGLE_SERVICE_ACCOUNT_KEY` (paste the whole JSON key file contents).
3. Uncomment the deploy step matching your host (Cloudflare Pages and
   Netlify examples are in the file) and add its secrets too.

If you'd rather not wire up GitHub Actions yet, running `npm run sync`
by hand before a deploy works fine to start.

## Things worth knowing

- **Header logo:** the site looks for a "purple" file inside
  Logos → Logotype → Horizontal and uses it as the top-left header mark;
  if it can't find one (or the image fails to load), it falls back to
  the "Stridekick Brand Kit" text automatically. No config needed —
  just make sure that folder/file naming exists in Drive.
- **Full navigation, greyed where empty:** `site/planned-taxonomy.js`
  lists every section from your original outline, including ones with no
  Drive folder yet. The nav always shows all of them; anything not yet
  matched to a real Drive folder renders greyed out and isn't a link.
  Matching is by name (case/punctuation-insensitive), so add the real
  folder in Drive with a matching name and it lights up automatically —
  no code changes needed. Any real folder that isn't in this planned
  list at all still shows up too, appended at the end, so nothing you
  actually add is ever hidden by this file being stale.
- **Ordering:** Drive's API doesn't expose a manual "custom order," so
  folders/files sync in alphabetical order. Prefix names with `01 -`,
  `02 -` etc. in Drive if you need a specific sequence.
- **New top-level folders just work.** The site renders whatever
  section/subsection structure exists in Drive at sync time — you don't
  need to touch `app.js` to add a category later.
- **"Don't" sections are auto-styled.** Any folder named with "don't",
  "not to do", "no's", or "what not" gets the warning treatment (red
  accent, ⚠ marker) automatically.
- **Heads up:** your outline lists both "Not To Do" and "What Not To Do"
  under Stickers — worth a quick check on whether that's intentional or
  one should be renamed/merged once the real folders exist. Both are
  wired up as-is in the sample data for now.
- **Large videos:** the sync script links straight to Drive's file
  preview for videos rather than downloading them, so large files won't
  slow down the site itself.
- **Colors PDF:** you mentioned a PDF with your color palette in the test
  folder — happy to extract the hex/RGB values into a `colors.json` the
  site can render as swatches. Upload that PDF directly in a message and
  I can pull the values out.
