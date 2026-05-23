/**
 * Rebuild file subtitle dari blocks yang sudah diterjemahkan
 * Mengembalikan string isi file baru
 */

export function rebuildSubtitle(blocks, ext, originalText) {
  switch (ext.toLowerCase()) {
    case 'srt': return rebuildSRT(blocks);
    case 'vtt': return rebuildVTT(blocks, originalText);
    case 'ass':
    case 'ssa': return rebuildASS(blocks, originalText);
    default: return blocks.map(b => b.translated || b.text).join('\n');
  }
}

function rebuildSRT(blocks) {
  return blocks
    .map((b, i) => `${i + 1}\n${b.ts}\n${b.translated || b.text}`)
    .join('\n\n') + '\n';
}

function rebuildVTT(blocks, originalText) {
  // Pertahankan header VTT asli
  const headerMatch = originalText.match(/^(WEBVTT[^\n]*(\n[^\n]+)*\n\n)/);
  const header = headerMatch ? headerMatch[1] : 'WEBVTT\n\n';

  const body = blocks.map(b => {
    const idxLine = b.idx ? b.idx + '\n' : '';
    return `${idxLine}${b.ts}\n${b.translated || b.text}`;
  }).join('\n\n');

  return header + body + '\n';
}

function rebuildASS(blocks, originalText) {
  let result = originalText;

  for (const b of blocks) {
    if (b.raw && b.translated) {
      // Ganti teks dialog di baris ASS asli
      // Hati-hati: pertahankan override tags
      const newLine = b.raw.replace(b.rawDialog, b.translated);
      result = result.replace(b.raw, newLine);
    }
  }

  return result;
}
