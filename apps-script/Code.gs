/**
 * Stridekick Brand Kit — Drive manifest generator (Apps Script version)
 *
 * Use this instead of sync/fetch-drive-manifest.js if you don't have
 * permission to create a Google Cloud service account. This runs entirely
 * under your own Google account — no Cloud Console, no IT ticket.
 *
 * SETUP
 * 1. Go to https://script.google.com → New project.
 * 2. Delete the placeholder code and paste in this whole file.
 * 3. Replace ROOT_FOLDER_ID below with your real brand kit folder's ID
 *    (the long string in the folder's URL).
 * 4. Run the "syncManifest" function once from the editor (Run button)
 *    to grant Drive permission when prompted, and confirm it finishes
 *    without errors (check View → Executions if unsure).
 * 5. Deploy → New deployment → type "Web app" →
 *      Execute as: Me
 *      Who has access: Anyone
 *    Click Deploy, authorize again if asked, and copy the Web App URL
 *    (it ends in /exec).
 * 6. Paste that URL into site/config.js as `manifestUrl`.
 * 7. Open the URL directly in a browser tab first — you should see raw
 *    JSON. If you see that, the site will be able to read it too.
 *
 * KEEPING IT FRESH
 * The /exec URL always computes the tree live, so simply loading the
 * site re-reads Drive on every visit — nothing to schedule. If your kit
 * folder gets large (100s of files) and it starts to feel slow, add a
 * time-driven trigger (Triggers → Add trigger → syncManifest → time-driven)
 * that runs writeManifestToDriveFile() every hour instead, and point
 * config.js at the resulting file's direct-download link. Most teams
 * won't need this.
 */

const ROOT_FOLDER_ID = '1y3qv2wvSBCGJPjCXHmnXnsxN8teLOjz8';
const DONT_PATTERN = /don'?t|not to do|no'?s\b|what not/i;

function doGet(e) {
  const manifest = buildManifest();
  return ContentService
    .createTextOutput(JSON.stringify(manifest))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildManifest() {
  const rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const tree = walk(rootFolder, rootFolder.getName());
  return {
    generatedAt: new Date().toISOString(),
    source: 'apps-script',
    root: { name: 'Stridekick Brand Kit', folders: tree.folders, files: tree.files },
  };
}

function walk(folder, name) {
  const node = { name: name, folders: [], files: [] };
  if (DONT_PATTERN.test(name)) node.isDont = true;

  const folders = sortedByName(collect(folder.getFolders()));
  folders.forEach(function (f) {
    node.folders.push(walk(f, f.getName()));
  });

  const files = sortedByName(collect(folder.getFiles()));
  files.forEach(function (file) {
    node.files.push(toFileEntry(file));
  });

  return node;
}

function toFileEntry(file) {
  const id = file.getId();
  const mimeType = file.getMimeType();
  return {
    name: file.getName(),
    kind: classifyKind(mimeType),
    mimeType: mimeType,
    viewUrl: 'https://drive.google.com/file/d/' + id + '/view',
    downloadUrl: 'https://drive.google.com/uc?export=download&id=' + id,
    thumbnailUrl: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1000',
  };
}

function classifyKind(mimeType) {
  if (mimeType.indexOf('image/') === 0) return 'image';
  if (mimeType.indexOf('video/') === 0) return 'video';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'other';
}

function collect(iterator) {
  const out = [];
  while (iterator.hasNext()) out.push(iterator.next());
  return out;
}

function sortedByName(items) {
  return items.sort(function (a, b) {
    return a.getName().localeCompare(b.getName(), undefined, { numeric: true });
  });
}

/**
 * Optional fallback for the "keeping it fresh" note above: writes the
 * manifest into a plain-text file in Drive instead of serving it live.
 * Only needed if you switch to the time-driven-trigger approach.
 */
function writeManifestToDriveFile() {
  const manifest = buildManifest();
  const json = JSON.stringify(manifest);
  const fileName = 'brand-kit-manifest.json';

  const existing = DriveApp.getFilesByName(fileName);
  if (existing.hasNext()) {
    const file = existing.next();
    file.setContent(json);
    Logger.log('Updated existing file: ' + file.getId());
  } else {
    const file = DriveApp.createFile(fileName, json, MimeType.PLAIN_TEXT);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    Logger.log('Created new file: ' + file.getId() +
      ' — use https://drive.google.com/uc?export=download&id=' + file.getId() + ' as manifestUrl');
  }
}
