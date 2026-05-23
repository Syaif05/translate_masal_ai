/**
 * Parse file subtitle menjadi array of blocks
 * Setiap block: { idx, ts, text, raw? }
 * Mendukung format: SRT, VTT, ASS/SSA
 */

export function parseSubtitle(text, ext) {
  switch (ext.toLowerCase()) {
    case 'srt': return parseSRT(text);
    case 'vtt': return parseVTT(text);
    case 'ass':
    case 'ssa': return parseASS(text);
    default: throw new Error(`Format .${ext} tidak didukung`);
  }
}

function parseSRT(text) {
  const blocks = [];
  const parts = text.trim().split(/\n\n+/);

  for (const part of parts) {
    const lines = part.trim().split('\n');
    if (lines.length < 3) continue;

    const idx = lines[0].trim();
    const ts = lines[1].trim();
    const dialogLines = lines.slice(2);

    if (!/\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}/.test(ts)) continue;

    blocks.push({
      idx,
      ts,
      text: dialogLines.join('\n'),
    });
  }

  return blocks;
}

function parseVTT(text) {
  const blocks = [];
  // Hapus header WEBVTT dan metadata
  const content = text.replace(/^WEBVTT[^\n]*(\n[^\n]+)*\n\n/, '');
  const parts = content.trim().split(/\n\n+/);

  for (const part of parts) {
    const lines = part.trim().split('\n');
    if (lines.length < 2) continue;

    let i = 0;
    let idx = '';

    // Cek apakah baris pertama adalah cue identifier (bukan timestamp)
    if (!/-->/.test(lines[0])) {
      idx = lines[0];
      i = 1;
    }

    const ts = lines[i];
    if (!ts || !/-->/.test(ts)) continue;

    const dialogLines = lines.slice(i + 1);
    // Hapus VTT tags seperti <b>, <i>, <c.color>
    const cleanText = dialogLines.join('\n').replace(/<[^>]+>/g, '');

    blocks.push({ idx, ts, text: cleanText });
  }

  return blocks;
}

function parseASS(text) {
  const blocks = [];
  const lines = text.split('\n');

  for (const line of lines) {
    if (!line.startsWith('Dialogue:')) continue;

    const parts = line.split(',');
    if (parts.length < 10) continue;

    const start = parts[1].trim();
    const end = parts[2].trim();
    // Dialog ada di kolom ke-9 (index ke-9) dan seterusnya
    const dialogRaw = parts.slice(9).join(',');
    // Hapus override tags ASS seperti {\an8}, {\i1}, dll
    const dialog = dialogRaw.replace(/\{[^}]*\}/g, '').replace(/\\N/g, '\n').trim();

    if (!dialog) continue;

    blocks.push({
      idx: '',
      ts: `${start} --> ${end}`,
      text: dialog,
      raw: line,       // Simpan baris asli untuk rebuild ASS
      rawDialog: dialogRaw, // Dialog asli sebelum dibersihkan tag-nya
    });
  }

  return blocks;
}
