import fs from 'node:fs';
import path from 'node:path';
import type { AttachmentScanResult } from './types.js';

/**
 * Scan the export root for attachment folders. A folder whose name is all
 * digits and matches a story id contributes one attachments row per file
 * (metadata only; bodies are never read). `.DS_Store` and nested directories
 * are skipped. All-digit folders matching no story id are counted as orphans.
 */
export function scanAttachments(
  srcDir: string,
  storyIds: ReadonlySet<number>,
): AttachmentScanResult {
  const attachments: AttachmentScanResult['attachments'] = [];
  let orphanFolders = 0;

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    const storyId = Number(entry.name);
    if (!storyIds.has(storyId)) {
      orphanFolders++;
      continue;
    }
    const dir = path.join(srcDir, entry.name);
    for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!file.isFile() || file.name === '.DS_Store') continue;
      const size = fs.statSync(path.join(dir, file.name)).size;
      attachments.push({
        storyId,
        filename: file.name,
        size,
        relPath: `${entry.name}/${file.name}`,
      });
    }
  }

  return { attachments, orphanFolders };
}
