import { useState, useCallback, useEffect } from 'react';
import { parseSubtitle } from './utils/parseSubtitle';
import { rebuildSubtitle } from './utils/rebuildSubtitle';
import { createZip, downloadBlob, getOutputFilename } from './utils/zipHelper';

const LANGUAGES = [
  { value: 'Bahasa Indonesia', label: '🇮🇩 Bahasa Indonesia' },
  { value: 'English', label: '🇬🇧 English' },
  { value: 'Bahasa Melayu', label: '🇲🇾 Bahasa Melayu' },
  { value: 'Japanese', label: '🇯🇵 Japanese' },
  { value: 'Korean', label: '🇰🇷 Korean' },
  { value: 'Chinese Simplified', label: '🇨🇳 Chinese Simplified' },
  { value: 'Spanish', label: '🇪🇸 Spanish' },
  { value: 'French', label: '🇫🇷 French' },
  { value: 'German', label: '🇩🇪 German' },
  { value: 'Arabic', label: '🇸🇦 Arabic' },
];

const MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o mini (Hemat & Cepat)' },
  { value: 'gpt-4o', label: 'GPT-4o (Kualitas Terbaik)' },
];

const BATCH_SIZE = 80; // Jumlah baris per request ke API
const SUPPORTED_EXT = ['srt', 'vtt', 'ass', 'ssa'];

function getExt(name) {
  return name.split('.').pop().toLowerCase();
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [files, setFiles] = useState([]);           // List file yang diupload
  const [targetLang, setTargetLang] = useState('Bahasa Indonesia');
  const [model, setModel] = useState('gpt-4o-mini');
  const [isTranslating, setIsTranslating] = useState(false);
  const [results, setResults] = useState({});       // { fileId: { name, content } }

  // Cek apakah sudah pernah login sebelumnya
  useEffect(() => {
    const savedPassword = localStorage.getItem('app_password');
    if (savedPassword) {
      verifyPassword(savedPassword);
    }
  }, []);

  const verifyPassword = async (pass) => {
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsAuthenticated(true);
        setPassword(pass);
        localStorage.setItem('app_password', pass);
      } else {
        setLoginError(data.error || 'Password salah!');
        localStorage.removeItem('app_password');
      }
    } catch (err) {
      setLoginError('Koneksi server gagal');
    }
    setIsLoggingIn(false);
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (!password) return;
    verifyPassword(password);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setPassword('');
    localStorage.removeItem('app_password');
  };

  // Tambah file baru, hindari duplikat
  const addFiles = useCallback((newFiles) => {
    const filtered = Array.from(newFiles).filter(f =>
      SUPPORTED_EXT.includes(getExt(f.name))
    );

    setFiles(prev => {
      const existingKeys = new Set(prev.map(f => f.file.name + f.file.size));
      const unique = filtered.filter(f => !existingKeys.has(f.name + f.size));
      return [
        ...prev,
        ...unique.map(f => ({
          id: Date.now() + Math.random(),
          file: f,
          status: 'waiting',  // waiting | processing | done | error
          error: null,
          progress: 0,
        })),
      ];
    });
  }, []);

  // Handler drag & drop
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  // Update status satu file
  const updateFile = (id, patch) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  };

  // Kirim batch ke serverless function proxy
  async function translateBatch(texts, lang, mdl) {
    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts, targetLang: lang, model: mdl, password }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Server error');
    }

    const data = await response.json();
    return data.translated;
  }

  // Proses semua file
  const handleTranslate = async () => {
    const pending = files.filter(f => f.status === 'waiting' || f.status === 'error');
    if (!pending.length) return;

    setIsTranslating(true);

    for (const item of pending) {
      updateFile(item.id, { status: 'processing', progress: 0 });

      try {
        const text = await item.file.text();
        const ext = getExt(item.file.name);
        const blocks = parseSubtitle(text, ext);

        if (!blocks.length) throw new Error('File subtitle kosong atau format tidak dikenali');

        // Proses dalam batch
        for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
          const slice = blocks.slice(i, i + BATCH_SIZE);
          const texts = slice.map(b => b.text);
          const translated = await translateBatch(texts, targetLang, model);
          slice.forEach((b, j) => { b.translated = translated[j]; });

          const progress = Math.round(((i + BATCH_SIZE) / blocks.length) * 100);
          updateFile(item.id, { progress: Math.min(progress, 95) });
        }

        const outputContent = rebuildSubtitle(blocks, ext, text);
        const outputName = getOutputFilename(item.file.name, targetLang);

        setResults(prev => ({
          ...prev,
          [item.id]: { name: outputName, content: outputContent },
        }));

        updateFile(item.id, { status: 'done', progress: 100 });

      } catch (err) {
        // Jika error autentikasi (401), paksa logout
        if (err.message.toLowerCase().includes('password')) {
          handleLogout();
          alert('Sesi password telah berakhir atau tidak valid.');
          break;
        }
        updateFile(item.id, { status: 'error', error: err.message, progress: 0 });
      }
    }

    setIsTranslating(false);
  };

  // Download satu file
  const handleDownloadOne = (id) => {
    const result = results[id];
    if (!result) return;
    const blob = new Blob([result.content], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, result.name);
  };

  // Download semua sebagai ZIP
  const handleDownloadAll = async () => {
    const doneFiles = Object.values(results);
    if (!doneFiles.length) return;
    const zip = await createZip(doneFiles);
    downloadBlob(zip, 'subtitles_translated.zip');
  };

  const doneCount = files.filter(f => f.status === 'done').length;
  const hasFiles = files.length > 0;

  // Render Layar Login
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-sm w-full rounded-2xl shadow-xl p-8 border border-gray-100">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">🔒</div>
            <h1 className="text-xl font-bold text-gray-900">Area Terbatas</h1>
            <p className="text-sm text-gray-500 mt-1">Masukkan password akses untuk menggunakan alat ini.</p>
          </div>
          
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <input
                type="password"
                placeholder="Password rahasia..."
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                autoFocus
              />
              {loginError && <p className="text-red-500 text-xs mt-2 font-medium">{loginError}</p>}
            </div>
            
            <button
              type="submit"
              disabled={isLoggingIn || !password}
              className="w-full bg-gray-900 text-white rounded-lg px-4 py-3 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {isLoggingIn ? 'Memverifikasi...' : 'Masuk Aplikasi'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Render Aplikasi Utama
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Subtitle Translator</h1>
            <p className="text-sm text-gray-500 mt-1">
              Terjemahkan file subtitle secara batch menggunakan AI
            </p>
          </div>
          <button 
            onClick={handleLogout}
            className="text-sm text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-md transition-colors border border-transparent hover:border-red-100"
          >
            Logout
          </button>
        </div>

        {/* Info keamanan */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-5 text-sm text-green-800 flex items-center justify-between">
          <span>🔒 <strong>Aman:</strong> Sesi Anda diamankan dengan password. API Key tersembunyi.</span>
        </div>

        {/* Kontrol */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <select
            value={targetLang}
            onChange={e => setTargetLang(e.target.value)}
            className="flex-1 min-w-36 border rounded-lg px-3 py-2 text-sm bg-white"
          >
            {LANGUAGES.map(l => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>

          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white"
          >
            {MODELS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Drop Zone */}
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-400 mb-4 cursor-pointer hover:border-gray-400 transition-colors relative bg-white"
        >
          <input
            type="file"
            multiple
            accept=".srt,.vtt,.ass,.ssa"
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={e => addFiles(e.target.files)}
          />
          <div className="text-4xl mb-2">📁</div>
          <p className="font-medium text-gray-600">Drag & drop file subtitle di sini</p>
          <p className="text-xs mt-1">Mendukung .srt .vtt .ass — bisa banyak sekaligus</p>
        </div>

        {/* Statistik */}
        {hasFiles && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Total', value: files.length },
              { label: 'Selesai', value: doneCount, color: 'text-green-600' },
              { label: 'Gagal', value: files.filter(f => f.status === 'error').length, color: 'text-red-600' },
            ].map(s => (
              <div key={s.label} className="bg-white border rounded-lg p-3 text-center shadow-sm">
                <div className="text-xs text-gray-400">{s.label}</div>
                <div className={`text-xl font-medium ${s.color || 'text-gray-800'}`}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Daftar File */}
        {hasFiles && (
          <div className="flex flex-col gap-2 mb-4">
            {files.map(item => (
              <div key={item.id} className="bg-white border rounded-lg px-4 py-3 flex items-center gap-3 shadow-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate text-gray-800">{item.file.name}</div>
                  <div className="text-xs text-gray-400">
                    {(item.file.size / 1024).toFixed(1)} KB · {getExt(item.file.name).toUpperCase()}
                  </div>
                  {item.status === 'processing' && (
                    <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}
                  {item.status === 'error' && (
                    <div className="text-xs text-red-500 mt-1">{item.error}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.status === 'done' && (
                    <button
                      onClick={() => handleDownloadOne(item.id)}
                      className="text-xs px-3 py-1 border rounded-md hover:bg-gray-50 font-medium"
                    >
                      Download
                    </button>
                  )}
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    item.status === 'waiting' ? 'bg-gray-100 text-gray-500' :
                    item.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                    item.status === 'done' ? 'bg-green-100 text-green-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {item.status === 'waiting' ? 'Menunggu' :
                     item.status === 'processing' ? 'Memproses...' :
                     item.status === 'done' ? 'Selesai' : 'Gagal'}
                  </span>
                  {item.status !== 'processing' && (
                    <button
                      onClick={() => setFiles(prev => prev.filter(f => f.id !== item.id))}
                      className="text-gray-300 hover:text-gray-500 text-lg leading-none"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        {hasFiles && (
          <div className="flex gap-3 justify-end mt-6 border-t pt-4 border-gray-100">
            <button
              onClick={() => setFiles([])}
              className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 font-medium"
            >
              Hapus Semua
            </button>
            {doneCount > 1 && (
              <button
                onClick={handleDownloadAll}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 font-medium"
              >
                Download ZIP
              </button>
            )}
            <button
              onClick={handleTranslate}
              disabled={isTranslating}
              className="px-5 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 font-medium shadow-sm"
            >
              {isTranslating ? 'Memproses...' : 'Terjemahkan Semua'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
