import JSZip from 'jszip';

/**
 * Buat file ZIP dari array file yang sudah diterjemahkan
 * @param {Array} files - Array of { name, content }
 * @returns {Blob} ZIP blob
 */
export async function createZip(files) {
  const zip = new JSZip();

  for (const file of files) {
    zip.file(file.name, file.content);
  }

  return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/**
 * Trigger download file di browser
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate nama file output dengan suffix bahasa tujuan
 * Contoh: movie.srt → movie_Bahasa Indonesia.srt
 */
export function getOutputFilename(originalName, targetLang) {
  const langSuffix = targetLang ? `_${targetLang}` : '_translated';
  const lastDot = originalName.lastIndexOf('.');
  if (lastDot === -1) return originalName + langSuffix;
  return originalName.slice(0, lastDot) + langSuffix + originalName.slice(lastDot);
}
