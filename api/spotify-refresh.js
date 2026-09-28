// api/spotify-refresh.js
// Refresca el access token de Spotify usando el refresh token
// El frontend lo llama cuando el token está por expirar

export default async function handler(req, res) {
  console.log('🔄 Refresh token de Spotify invocado');

  // CORS (por si acaso)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Leer el refresh token de las cookies
    const cookies = req.headers.cookie || '';
    const refreshTokenMatch = cookies.match(/spotify_refresh_token=([^;]+)/);
    const refreshToken = refreshTokenMatch ? refreshTokenMatch[1] : null;

    if (!refreshToken) {
      return res.status(401).json({ error: 'No hay refresh token' });
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Credenciales de Spotify no configuradas');
    }

    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    // Pedir nuevo access token
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ Error refrescando token:', errorText);
      return res.status(401).json({ error: 'Refresh failed' });
    }

    const tokenData = await tokenResponse.json();
    const newAccessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in;
    const expiresAt = Date.now() + (expiresIn * 1000);

    // Actualizar las cookies
    const newCookies = [
      `spotify_access_token=${newAccessToken}; Path=/; Max-Age=${expiresIn}; SameSite=Lax; Secure`,
      `spotify_expires_at=${expiresAt}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax; Secure`,
    ];

    // Si Spotify devolvió un nuevo refresh token, guardarlo también
    if (tokenData.refresh_token) {
      newCookies.push(
        `spotify_refresh_token=${tokenData.refresh_token}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax; Secure`
      );
    }

    res.setHeader('Set-Cookie', newCookies);

    console.log('✅ Token refrescado');
    return res.status(200).json({
      success: true,
      access_token: newAccessToken,
      expires_at: expiresAt,
    });

  } catch (error) {
    console.error('💥 Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}