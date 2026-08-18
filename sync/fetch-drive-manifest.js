#!/usr/bin/env node
/**
 * Walks a Google Drive folder tree and writes site/data/manifest.json
 * in the shape the brand kit site expects.
 *
 * Auth: a Google Cloud service account, shared as a Viewer on the root
 * Drive folder (the service account's own Drive is otherwise empty, so
 * sharing is required — see README.md "Connect Drive" section).
 *
 * Env vars (see .env.example):
 *   DRIVE_ROOT_FOLDER_ID        - the folder ID from the Drive URL
 *   GOOGLE_SERVICE_ACCOUNT_KEY  - full JSON key, as a single-line string
 *                                 (used in CI / GitHub Actions secrets)
 *   GOOGLE_APPLICATION_CREDENTIALS - path to a key file (used locally,
 *                                 alternative to the var above)
 *   OUTPUT_PATH                 - defaults to ../site/data/manifest.json
 */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const ROOT_FOLDER_ID = process.env.DRIVE_ROOT_FOLDER_ID;
const OUTPUT_PATH = process.env.OUTPUT_PATH || path.join(__dirname, '../site/data/manifest.json');

const DONT_PATTERN = /don'?t|not to do|no'?s\b|what not/i;

function classifyKind(mimeType) {
  if (mimeType === 'application/vnd.google-apps.folder') return 'folder';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'other';
}

function buildLinks(file) {
  return {
    viewUrl: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
    downloadUrl: file.webContentLink || `https://drive.google.com/uc?export=download&id=${file.id}`,
    thumbnailUrl: file.thumbnailLink
      ? file.thumbnailLink.replace(/=s\d+$/, '=s1000')
      : `https://drive.google.com/thumbnail?id=${file.id}&sz=w1000`,
  };
}

async function listChildren(drive, folderId) {
  const files = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, webViewLink, webContentLink, thumbnailLink, createdTime)',
      pageSize: 200,
      pageToken,
    });
    files.push(...res.data.files);
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  // Stable order: Drive has no manual "folder order" via the API, so we
  // sort by name. Prefix Drive file/folder names with "01 - ", "02 - " etc.
  // if you need a specific order to survive the sync.
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return files;
}

async function walk(drive, folderId, name) {
  const children = await listChildren(drive, folderId);
  const node = { name, folders: [], files: [] };

  if (DONT_PATTERN.test(name)) node.isDont = true;

  for (const child of children) {
    const kind = classifyKind(child.mimeType);
    if (kind === 'folder') {
      node.folders.push(await walk(drive, child.id, child.name));
    } else {
      node.files.push({
        name: child.name,
        kind,
        mimeType: child.mimeType,
        ...buildLinks(child),
      });
    }
  }

  return node;
}

async function main() {
  if (!ROOT_FOLDER_ID) {
    throw new Error('DRIVE_ROOT_FOLDER_ID is not set. Copy .env.example to .env and fill it in.');
  }

  const authOptions = { scopes: ['https://www.googleapis.com/auth/drive.readonly'] };
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    authOptions.credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  }
  // else: falls back to GOOGLE_APPLICATION_CREDENTIALS file path automatically

  const auth = new google.auth.GoogleAuth(authOptions);
  const drive = google.drive({ version: 'v3', auth });

  const rootMeta = await drive.files.get({ fileId: ROOT_FOLDER_ID, fields: 'name' });
  const tree = await walk(drive, ROOT_FOLDER_ID, rootMeta.data.name);

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: 'drive-sync',
    root: { name: 'Stridekick Brand Kit', folders: tree.folders, files: tree.files },
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${OUTPUT_PATH} (${tree.folders.length} top-level folders)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
