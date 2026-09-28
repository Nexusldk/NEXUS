// api/spotify-search.js
// Busca tracks, artistas o playlists en Spotify

export default async function handler(req, res) {
  console.log('🔍 Búsqueda en Spotify invocada');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Leer access token de las cookies
    const cookies = req.headers.cookie || '';
    const accessTokenMatch = cookies.match(/spotify_access_token=([^;]+)/);
    const accessToken = accessTokenMatch ? accessTokenMatch[1] : null;

    if (!accessToken) {
      return res.status(401).json({ error: 'No hay access token. Conectá Spotify primero.' });
    }

    // Leer parámetros
    const query = req.query.q || req.body?.q;
    const type = req.query.type || req.body?.type || 'track'; // track, artist, album, playlist
    const limit = parseInt(req.query.limit || req.body?.limit || '10');

    if (!query) {
      return res.status(400).json({ error: 'Falta el parámetro q (query)' });
    }

    // Hacer la búsqueda
    const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${type}&limit=${limit}`;

    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('❌ Error buscando:', errorText);

      if (searchResponse.status === 401) {
        return res.status(401).json({ error: 'Token expirado. Refrescá.' });
      }

      return res.status(searchResponse.status).json({ error: 'Search failed' });
    }

    const searchData = await searchResponse.json();

    // Simplificar los resultados según el tipo
    let results = [];

    if (type === 'track' && searchData.tracks) {
      results = searchData.tracks.items.map(track => ({
        id: track.id,
        uri: track.uri,
        name: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        album: track.album.name,
        albumImage: track.album.images[0]?.url || null,
        duration: track.duration_ms,
        previewUrl: track.preview_url,
        spotifyUrl: track.external_urls.spotify,
      }));
    } else if (type === 'playlist' && searchData.playlists) {
      results = searchData.playlists.items.map(pl => ({
        id: pl.id,
        uri: pl.uri,
        name: pl.name,
        owner: pl.owner.display_name,
        image: pl.images[0]?.url || null,
        tracksTotal: pl.tracks.total,
        spotifyUrl: pl.external_urls.spotify,
      }));
    } else if (type === 'artist' && searchData.artists) {
      results = searchData.artists.items.map(a => ({
        id: a.id,
        uri: a.uri,
        name: a.name,
        image: a.images[0]?.url || null,
        genres: a.genres,
        spotifyUrl: a.external_urls.spotify,
      }));
    } else if (type === 'album' && searchData.albums) {
      results = searchData.albums.items.map(al => ({
        id: al.id,
        uri: al.uri,
        name: al.name,
        artist: al.artists.map(a => a.name).join(', '),
        image: al.images[0]?.url || null,
        releaseDate: al.release_date,
        spotifyUrl: al.external_urls.spotify,
      }));
    }

    console.log(`✅ Encontrados ${results.length} resultados`);
    return res.status(200).json({
      query,
      type,
      results,
    });

  } catch (error) {
    console.error('💥 Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}