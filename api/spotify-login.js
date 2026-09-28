// api/spotify-login.js
// Inicia el flujo OAuth redirigiendo al usuario a Spotify

export default async function handler(req, res) {
  console.log('🎵 Login de Spotify invocado');

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = 'https://nexus-beige-two.vercel.app/api/spotify-callback';

  if (!clientId) {
    console.error('❌ SPOTIFY_CLIENT_ID no configurado');
    return res.status(500).json({ error: 'Spotify no configurado' });
  }

  // ═══════════════════════════════════════════════════════════
  // Scopes necesarios para NEXUS
  // ═══════════════════════════════════════════════════════════
  const scopes = [
    'user-read-playback-state',      // Leer estado de reproducción
    'user-modify-playback-state',    // Pausar/reanudar/cambiar track
    'user-read-currently-playing',   // Ver qué está sonando
    'streaming',                     // Web Playback SDK
    'user-read-email',               // Info básica de usuario
    'user-read-private',             // Info de cuenta (Premium)
    'playlist-read-private',         // Leer playlists propias
    'playlist-read-collaborative',   // Leer playlists colaborativas
    'user-library-read',             // Leer canciones guardadas
  ].join(' ');

  // Estado random para seguridad (evita CSRF)
  const state = Math.random().toString(36).substring(2, 15);

  // Guardar state en cookie para verificar después
  res.setHeader('Set-Cookie', `spotify_oauth_state=${state}; Path=/; Max-Age=600; SameSite=Lax; Secure`);

  // Construir URL de autorización
  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('show_dialog', 'false'); // No pedir autorización de nuevo si ya está

  console.log('🔀 Redirigiendo a Spotify...');

  // Redirigir al usuario
  return res.redirect(authUrl.toString());
}