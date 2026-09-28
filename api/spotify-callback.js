// api/spotify-callback.js
// Maneja el flujo OAuth de Spotify: recibe el código y lo cambia por tokens

export default async function handler(req, res) {
  console.log('🎵 Spotify callback invocado');

  const { code, error, state } = req.query;

  // Si Spotify devolvió un error
  if (error) {
    console.error('❌ Error de Spotify:', error);
    return res.redirect('/?spotify_error=' + encodeURIComponent(error));
  }

  // Si no hay código, no podemos hacer nada
  if (!code) {
    console.error('❌ No llegó el código de autorización');
    return res.redirect('/?spotify_error=no_code');
  }

  try {
    // ═══════════════════════════════════════════════════════════
    // Intercambiar el código por tokens de acceso
    // ═══════════════════════════════════════════════════════════
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const redirectUri = 'https://nexus-beige-two.vercel.app/api/spotify-callback';

    if (!clientId || !clientSecret) {
      throw new Error('Credenciales de Spotify no configuradas');
    }

    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ Error obteniendo tokens:', errorText);
      throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    console.log('✅ Tokens obtenidos correctamente');

    // ═══════════════════════════════════════════════════════════
    // Guardar tokens en cookie HTTP-only (segura)
    // ═══════════════════════════════════════════════════════════
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in; // segundos

    // Calcular cuándo expira (timestamp)
    const expiresAt = Date.now() + (expiresIn * 1000);

    // Guardar en cookies (30 días para refresh token)
    const cookies = [
      `spotify_access_token=${accessToken}; Path=/; Max-Age=${expiresIn}; SameSite=Lax; Secure`,
      `spotify_refresh_token=${refreshToken}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax; Secure`,
      `spotify_expires_at=${expiresAt}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax; Secure`,
    ];

    res.setHeader('Set-Cookie', cookies);

    // Redirigir al usuario de vuelta a NEXUS con éxito
    return res.redirect('/?spotify_connected=1');

  } catch (error) {
    console.error('💥 Error en callback:', error.message);
    return res.redirect('/?spotify_error=' + encodeURIComponent(error.message));
  }
}