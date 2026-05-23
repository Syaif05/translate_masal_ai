export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body;
  const validPassword = process.env.APP_PASSWORD;

  if (!validPassword) {
    // If no password configured on server, just allow it (or you could block it)
    return res.status(200).json({ success: true });
  }

  if (password === validPassword) {
    return res.status(200).json({ success: true });
  }

  return res.status(401).json({ error: 'Password salah' });
}
