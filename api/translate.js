// api/translate.js
// Vercel Serverless Function — proxy aman ke OpenAI API
// API key disimpan sebagai environment variable, tidak pernah terekspos ke frontend

export default async function handler(req, res) {
  // Hanya izinkan metode POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Ambil API key dari environment variable (AMAN — tidak terekspos ke user)
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key belum dikonfigurasi di server' });
  }

  const { texts, targetLang, model = 'gpt-4o-mini' } = req.body;

  // Validasi input
  if (!texts || !Array.isArray(texts) || texts.length === 0) {
    return res.status(400).json({ error: 'Parameter texts tidak valid' });
  }
  if (!targetLang) {
    return res.status(400).json({ error: 'Parameter targetLang diperlukan' });
  }

  // Batas maksimal teks per request untuk keamanan
  if (texts.length > 150) {
    return res.status(400).json({ error: 'Maksimal 150 baris per request' });
  }

  // Format prompt dengan numbering agar mudah diparsing
  const numbered = texts.map((t, i) => `[${i + 1}] ${t}`).join('\n');

  const prompt = `Terjemahkan teks subtitle berikut ke ${targetLang}.
Setiap baris diawali dengan nomor dalam tanda kurung siku seperti [1], [2], dst.
Kembalikan HANYA terjemahan dengan format yang SAMA PERSIS ([nomor] teks terjemahan).
Pertahankan makna asli, gaya bicara, dan jangan tambahkan penjelasan apapun.

${numbered}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,  // API key ada di sini, aman di server
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,       // Rendah agar hasil konsisten
        max_tokens: 4096,
        messages: [
          {
            role: 'system',
            content: 'Kamu adalah penerjemah profesional subtitle film dan video. Terjemahkan dengan natural dan pertahankan nuansa emosi dialog.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({
        error: errorData.error?.message || 'OpenAI API error',
      });
    }

    const data = await response.json();
    const rawText = data.choices[0].message.content.trim();

    // Parse hasil terjemahan kembali ke array
    const lines = rawText.split('\n');
    const translated = new Array(texts.length).fill('');

    for (const line of lines) {
      const match = line.match(/^\[(\d+)\]\s*(.*)/);
      if (match) {
        const index = parseInt(match[1]) - 1;
        if (index >= 0 && index < texts.length) {
          translated[index] = match[2].trim();
        }
      }
    }

    // Fallback: jika ada yang kosong, gunakan teks asli
    for (let i = 0; i < translated.length; i++) {
      if (!translated[i]) translated[i] = texts[i];
    }

    return res.status(200).json({
      translated,
      usage: data.usage, // Informasi penggunaan token (opsional untuk ditampilkan)
    });

  } catch (error) {
    console.error('Translate error:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan server: ' + error.message });
  }
}
