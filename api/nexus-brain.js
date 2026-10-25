// Personalidad visual y tono. La API conserva reply/actions/sentences y agrega companion.
const NEXUS_EMOTIONS = new Set(['neutral','happy','curious','thoughtful','surprised','concerned','amused','empathetic']);
const NEXUS_ACCESSORIES = new Set(['none','witch_hat','umbrella','glasses','headphones','scarf']);
function normalizeNexusText(text) { return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function friendlyNexusText(text) {
  return String(text || '').replace(/,\s*(?:señor|senor|sir)(?=[.!?,:;]|$)/gi, '').replace(/^(?:señor|senor|sir),\s*/i, 'Franco, ').trim();
}
function parseNexusReply(value) {
  let raw=String(value||''),visual=null;
  const match=raw.match(/<nexus-ui>\s*(\{[\s\S]*?\})\s*<\/nexus-ui>/i);
  if(match){try{const data=JSON.parse(match[1]);visual={};if(NEXUS_EMOTIONS.has(data.emotion))visual.emotion=data.emotion;if(NEXUS_ACCESSORIES.has(data.accessory))visual.accessory=data.accessory;}catch(_){} }
  // Nunca leer etiquetas de presentación, incluso si el modelo las dejó incompletas.
  raw=raw.replace(/<nexus-ui>[\s\S]*?<\/nexus-ui>/gi,'').replace(/<nexus-ui>[\s\S]*$/gi,'');
  return {reply:friendlyNexusText(raw),visual};
}
function weatherVisual(data) {
  if(!data||data.error)return null;
  const raining=new Set([51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99]);
  const day=data.cuando==='extendido'?data.dias?.[0]:data;
  if(!day)return null;
  const rain=raining.has(Number(day.weatherCode))||(Number.isFinite(day.probLluvia)&&day.probLluvia>=40);
  if(rain)return {emotion:'concerned',accessory:'umbrella'};
  const temp=day.temperatura??day.tempMin;
  if(typeof temp==='number'&&temp<=12)return {emotion:'thoughtful',accessory:'scarf'};
  return {emotion:'neutral',accessory:'none'};
}
function weatherAdvice(data) {
  const visual=weatherVisual(data);if(!visual)return '';
  if(visual.accessory==='umbrella')return data.cuando==='mañana'?'Para mañana, yo llevaría un paraguas por las dudas.':'Si vas a salir, yo llevaría un paraguas por las dudas.';
  if(visual.accessory==='scarf')return data.cuando==='mañana'?'Para mañana tendría un abrigo a mano.':'Con esa temperatura, llevaría un abrigo.';
  return '';
}
function companionFor(context,explicit) {
  const text=normalizeNexusText(context.userText);
  const remove=/(quita|saca|sacate|sin|no uses|no quiero).{0,35}(sombrero|accesorio|paraguas|anteojos|bufanda|auriculares)/.test(text);
  let result={emotion:'neutral',accessory:'none'};
  const weather=weatherVisual(context.weather);
  if(weather)result=weather;
  else if(/\b(brujas?|hechizos?|hechiceria|halloween)\b/.test(text)&&! /\bno\b.{0,25}\b(brujas?|hechizos?|halloween)\b/.test(text))result={emotion:'curious',accessory:'witch_hat'};
  else if(/^musica/.test(context.intent||''))result={emotion:'happy',accessory:'headphones'};
  else if(/\b(explica|explicame|aprender|estudiar|calcul[a-z]*)\b/.test(text))result={emotion:'thoughtful',accessory:'glasses'};
  if(explicit?.emotion)result.emotion=explicit.emotion;
  if(explicit?.accessory&&!weather&&(result.accessory==='none'||explicit.accessory!=='none'))result.accessory=explicit.accessory;
  if(remove)result.accessory='none';
  if(context.error||context.weather?.error)result={emotion:'concerned',accessory:'none'};
  return result;
}
function enrichNexusResponse(payload,context) {
  const parsed=parseNexusReply(payload.reply);
  const reply=parsed.reply||'Me quedé sin una respuesta útil. ¿Probamos de nuevo?';
  return {...payload,reply,sentences:splitSentences(reply),companion:companionFor({...context,error:!!payload.error},parsed.visual)};
}

// netlify/functions/nexus-brain.js → adaptado para Vercel
// Vercel usa `module.exports = async (req, res)` (Express-style)
// Netlify usa `exports.handler = async (event)`

// ═══════════════════════════════════════════════════════════
// HERRAMIENTAS EXISTENTES
// ═══════════════════════════════════════════════════════════

async function getHora() {
  const now = new Date();
  return {
    hora: now.toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false }),
    fecha: now.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'long', day: 'numeric', month: 'long' }),
    hora24: Number(now.toLocaleTimeString('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', hour12: false })),
  };
}

async function getClima(ciudad = 'Buenos Aires', cuando = 'hoy') {
  try {
    const coords = {
      'buenos aires': { lat: -34.6037, lon: -58.3816 },
      'caba': { lat: -34.6037, lon: -58.3816 },
      'cordoba': { lat: -31.4201, lon: -64.1888 },
      'córdoba': { lat: -31.4201, lon: -64.1888 },
      'rosario': { lat: -32.9468, lon: -60.6393 },
      'mendoza': { lat: -32.8895, lon: -68.8458 },
      'la plata': { lat: -34.9215, lon: -57.9545 },
    };
    const loc = coords[ciudad.toLowerCase()];
    if (!loc) return { error: 'No tengo la ubicación de esa ciudad', ciudad };
    const codeMap = {
      0: 'despejado', 1: 'mayormente despejado', 2: 'parcialmente nublado', 3: 'nublado',
      45: 'con niebla', 48: 'con niebla helada', 51: 'con llovizna ligera', 53: 'con llovizna', 55: 'con llovizna intensa',
      61: 'con lluvia ligera', 63: 'con lluvia', 65: 'con lluvia intensa',
      71: 'con nieve ligera', 73: 'con nieve', 75: 'con nieve intensa',
      80: 'con chubascos', 81: 'con chubascos moderados', 82: 'con chubascos violentos',
      95: 'con tormenta', 96: 'con tormenta y granizo', 99: 'con tormenta severa',
    };

    if (cuando === 'mañana' || cuando === 'extendido') {
      const days = cuando === 'extendido' ? 7 : 2;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=America/Argentina/Buenos_Aires&forecast_days=${days}`;
      const res = await fetch(url);
      const data = await res.json();
      const daysArray = [];
      const today = new Date();
      for (let i = 0; i < days; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        daysArray.push({
          fecha: d.toISOString().slice(0, 10),
          dia: d.toLocaleDateString('es-AR', { weekday: 'long' }),
          tempMax: data.daily.temperature_2m_max[i],
          tempMin: data.daily.temperature_2m_min[i],
          weatherCode: data.daily.weather_code[i],
          condicion: codeMap[data.daily.weather_code[i]] || '—',
          probLluvia: data.daily.precipitation_probability_max[i],
        });
      }
      if (cuando === 'extendido') return { ciudad, cuando: 'extendido', dias: daysArray };
      const tomorrow = daysArray[1] || daysArray[0];
      return {
        ciudad, cuando: 'mañana',
        tempMax: tomorrow.tempMax, tempMin: tomorrow.tempMin,
        weatherCode: tomorrow.weatherCode, condicion: tomorrow.condicion, probLluvia: tomorrow.probLluvia,
      };
    } else {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=America/Argentina/Buenos_Aires`;
      const res = await fetch(url);
      const data = await res.json();
      return {
        ciudad, cuando: 'ahora',
        weatherCode: data.current.weather_code,
        temperatura: data.current.temperature_2m,
        humedad: data.current.relative_humidity_2m,
        viento: data.current.wind_speed_10m,
        condicion: codeMap[data.current.weather_code] || 'condición desconocida',
      };
    }
  } catch (err) {
    return { error: 'No pude consultar el clima' };
  }
}

async function getDolar() {
  try {
    const res = await fetch('https://dolarapi.com/v1/dolares');
    const data = await res.json();
    const result = {};
    data.forEach(item => {
      const nombre = item.nombre.toLowerCase().replace('dólar ', '').replace(' ', '_');
      result[nombre] = { compra: item.compra, venta: item.venta, actualizado: item.fechaActualizacion };
    });
    return result;
  } catch (err) {
    return { error: 'No pude consultar el dólar' };
  }
}

async function buscarWeb(query) {
  try {
    console.log(`🔍 Buscando: "${query}"`);
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.TAVILY_API_KEY}` },
      body: JSON.stringify({ query, max_results: 2, include_answer: true, search_depth: 'basic' }),
    });
    if (!res.ok) throw new Error(`Tavily error: ${res.status}`);
    const data = await res.json();
    return {
      answer: data.answer || null,
      results: (data.results || []).map(r => ({ title: r.title, url: r.url, content: r.content?.substring(0, 300) })),
    };
  } catch (err) {
    console.error('❌ Búsqueda:', err.message);
    return { error: 'No pude realizar la búsqueda web' };
  }
}

// ═══════════════════════════════════════════════════════════
// YOUTUBE
// ═══════════════════════════════════════════════════════════

async function buscarVideosYouTube(query, maxResults = 10) {
  try {
    console.log(`🎥 Buscando en YouTube: "${query}"`);
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return { error: 'YouTube API no configurada' };

    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=${maxResults}&q=${encodeURIComponent(query)}&type=video&key=${apiKey}`;
    const res = await fetch(searchUrl);
    
    if (!res.ok) throw new Error(`YouTube API error: ${res.status}`);
    
    const data = await res.json();
    if (!data.items || data.items.length === 0) return { videos: [], message: 'No encontré videos' };
    
    const videoIds = data.items.map(item => item.id.videoId).join(',');
    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${videoIds}&key=${apiKey}`;
    const detailsRes = await fetch(detailsUrl);
    const detailsData = await detailsRes.json();
    
    const detailsMap = {};
    if (detailsData.items) {
      detailsData.items.forEach(item => {
        detailsMap[item.id] = {
          duration: item.contentDetails?.duration || '',
          views: item.statistics?.viewCount || '0',
        };
      });
    }
    
    function formatDuration(iso) {
      if (!iso) return '';
      const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!match) return '';
      const h = match[1] || 0, m = match[2] || 0, s = match[3] || 0;
      if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      return `${m}:${String(s).padStart(2, '0')}`;
    }
    
    const videos = data.items.map(item => {
      const vid = item.id.videoId;
      const details = detailsMap[vid] || {};
      return {
        videoId: vid,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        description: item.snippet.description?.substring(0, 120),
        thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
        duration: formatDuration(details.duration),
        views: details.views,
        url: `https://www.youtube.com/watch?v=${vid}`,
        embedUrl: `https://www.youtube.com/embed/${vid}`,
      };
    });
    
    console.log(`✅ ${videos.length} videos encontrados`);
    return { videos, query };
  } catch (err) {
    console.error('❌ YouTube:', err.message);
    return { error: 'No pude buscar videos en YouTube' };
  }
}

// ═══════════════════════════════════════════════════════════
// MOOD → PLAYLIST
// ═══════════════════════════════════════════════════════════

function detectarMoodYPlaylist(text) {
  const t = text.toLowerCase();
  
  const moods = {
    cansado: { query: 'música relajante para dormir', genre: 'relajante', response: 'Te pongo algo relajante.' },
    relajado: { query: 'música chill relax', genre: 'chill', response: 'Perfecto, música chill.' },
    concentrado: { query: 'lofi hip hop para estudiar concentración', genre: 'lofi', response: 'Reproduciendo lofi para concentración.' },
    concentracion: { query: 'lofi hip hop para estudiar concentración', genre: 'lofi', response: 'Reproduciendo lofi para concentración.' },
    feliz: { query: 'música alegre happy hits', genre: 'alegre', response: 'Poniendo algo alegre.' },
    contento: { query: 'música alegre happy hits', genre: 'alegre', response: 'Poniendo algo alegre.' },
    triste: { query: 'música melancólica piano', genre: 'melancólica', response: 'Te acompaño con algo suave.' },
    motivado: { query: 'música motivacional workout', genre: 'motivacional', response: 'Activando modo motivacional.' },
    energia: { query: 'música energética dance', genre: 'energética', response: 'Energía pura.' },
    fiesta: { query: 'música fiesta party hits', genre: 'fiesta', response: 'Preparando el ambiente.' },
    dormir: { query: 'música para dormir piano suave', genre: 'para dormir', response: 'Música para descansar.' },
    trabajar: { query: 'música para trabajar concentración', genre: 'de trabajo', response: 'Reproduciendo música de trabajo.' },
    lluvia: { query: 'sonidos de lluvia para dormir', genre: 'lluvia', response: 'Poniendo sonidos de lluvia.' },
    gimnasio: { query: 'workout motivation music', genre: 'workout', response: 'Activando música de entrenamiento.' },
    gym: { query: 'workout motivation music', genre: 'workout', response: 'Activando música de entrenamiento.' },
    cocinar: { query: 'música para cocinar', genre: 'cocina', response: 'Música para la cocina.' },
    romantic: { query: 'música romántica', genre: 'romántica', response: 'Música romántica.' },
    romantico: { query: 'música romántica', genre: 'romántica', response: 'Música romántica.' },
    nostalgia: { query: 'hits de los 90s', genre: 'nostalgia', response: 'Volviendo a los 90.' },
    viaje: { query: 'road trip playlist', genre: 'viaje', response: 'Preparando la ruta.' },
    ruta: { query: 'road trip playlist', genre: 'viaje', response: 'Preparando la ruta.' },
    jazz: { query: 'jazz playlist', genre: 'jazz', response: 'Jazz, excelente elección.' },
    rock: { query: 'rock playlist', genre: 'rock', response: 'Rock.' },
    pop: { query: 'pop hits playlist', genre: 'pop', response: 'Pop.' },
    clasica: { query: 'música clásica piano', genre: 'clásica', response: 'Música clásica, muy elegante.' },
    clasico: { query: 'música clásica piano', genre: 'clásica', response: 'Música clásica, muy elegante.' },
    electronica: { query: 'electronic dance music', genre: 'electrónica', response: 'Electrónica.' },
    electronico: { query: 'electronic dance music', genre: 'electrónica', response: 'Electrónica.' },
    reggaeton: { query: 'reggaeton hits', genre: 'reggaetón', response: 'Reggaetón.' },
    cumbia: { query: 'cumbia playlist', genre: 'cumbia', response: 'Cumbia, a bailar.' },
    bachata: { query: 'bachata playlist', genre: 'bachata', response: 'Bachata.' },
    salsa: { query: 'salsa playlist', genre: 'salsa', response: 'Salsa.' },
    indie: { query: 'indie music playlist', genre: 'indie', response: 'Indie, buena elección.' },
    metal: { query: 'metal playlist', genre: 'metal', response: 'Metal.' },
    hiphop: { query: 'hip hop playlist', genre: 'hip hop', response: 'Hip hop.' },
    rap: { query: 'rap playlist', genre: 'rap', response: 'Rap.' },
  };
  
  for (const [key, value] of Object.entries(moods)) {
    if (t.includes(key)) return value;
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════
// GROQ API
// ═══════════════════════════════════════════════════════════

async function transcribirConGroq(audioBase64) {
  const audioBuffer = Buffer.from(audioBase64, 'base64');
  const blob = new Blob([audioBuffer], { type: 'audio/webm' });
  const formData = new FormData();
  formData.append('file', blob, 'audio.webm');
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('language', 'es');
  formData.append('response_format', 'json');
  
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: formData,
  });
  if (!res.ok) throw new Error(`Groq transcribe error: ${res.status}`);
  const data = await res.json();
  return data.text;
}

async function chatConGroq(messages, maxTokens = 500, tools = null, retryWithoutTools = false) {
  const body = { model: 'openai/gpt-oss-120b', messages, temperature: 0.7, max_tokens: maxTokens };
  if (tools && !retryWithoutTools) { 
    body.tools = tools; 
    body.tool_choice = 'auto'; 
  }
  
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  
  if (!res.ok) {
    const err = await res.text();
    
    if (tools && !retryWithoutTools && err.includes('Failed to parse tool call arguments')) {
      console.warn('⚠️ Tool calling falló, reintentando sin tools...');
      return chatConGroq(messages, maxTokens, null, true);
    }
    
    throw new Error(`Groq chat error: ${res.status} - ${err.substring(0, 200)}`);
  }
  
  const data = await res.json();
  return data.choices[0]?.message;
}

// ═══════════════════════════════════════════════════════════
// TOOLS
// ═══════════════════════════════════════════════════════════

const TOOLS = [
  { type: 'function', function: { name: 'guardar_nota', description: 'Guarda una nota.', parameters: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] } } },
  { type: 'function', function: { name: 'leer_notas', description: 'Lee todas las notas.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'borrar_nota', description: 'Borra nota por índice o todas.', parameters: { type: 'object', properties: { indice: { type: 'number' }, borrar_todas: { type: 'boolean' } } } } },
  { type: 'function', function: { name: 'crear_hoja', description: 'Crea hoja de cálculo.', parameters: { type: 'object', properties: { nombre: { type: 'string' }, columnas: { type: 'array', items: { type: 'string' } } }, required: ['nombre', 'columnas'] } } },
  { type: 'function', function: { name: 'agregar_fila', description: 'Agrega fila a hoja.', parameters: { type: 'object', properties: { nombre_hoja: { type: 'string' }, valores: { type: 'array', items: { type: 'string' } } }, required: ['nombre_hoja', 'valores'] } } },
  { type: 'function', function: { name: 'mostrar_hoja', description: 'Muestra hoja en panel visual.', parameters: { type: 'object', properties: { nombre: { type: 'string' } }, required: ['nombre'] } } },
  { type: 'function', function: { name: 'exportar_hoja', description: 'Exporta CSV.', parameters: { type: 'object', properties: { nombre: { type: 'string' } }, required: ['nombre'] } } },
  { type: 'function', function: { name: 'listar_hojas', description: 'Lista hojas.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'borrar_hoja', description: 'Borra hoja.', parameters: { type: 'object', properties: { nombre: { type: 'string' } }, required: ['nombre'] } } },
  { type: 'function', function: { name: 'enviar_whatsapp', description: 'WhatsApp con mensaje.', parameters: { type: 'object', properties: { numero: { type: 'string' }, mensaje: { type: 'string' } }, required: ['numero', 'mensaje'] } } },
  { type: 'function', function: { name: 'enviar_email', description: 'Email.', parameters: { type: 'object', properties: { destinatario: { type: 'string' }, asunto: { type: 'string' }, cuerpo: { type: 'string' } }, required: ['destinatario'] } } },
  { type: 'function', function: { name: 'hacer_llamada', description: 'Llamada.', parameters: { type: 'object', properties: { numero: { type: 'string' } }, required: ['numero'] } } },
  
  { type: 'function', function: { 
    name: 'reproducir_musica', 
    description: 'Reproduce música en el mini player flotante. Usar cuando el usuario pida "poné música", "quiero escuchar X", "reproducí Y".', 
    parameters: { type: 'object', properties: { busqueda: { type: 'string', description: 'Qué reproducir (canción, artista, género)' } }, required: ['busqueda'] } 
  } },
  { type: 'function', function: { 
    name: 'controlar_musica', 
    description: 'Controla el mini player: pausar, reanudar, siguiente, anterior, cerrar.', 
    parameters: { type: 'object', properties: { accion: { type: 'string', enum: ['pausar', 'reanudar', 'siguiente', 'anterior', 'cerrar'] } }, required: ['accion'] } 
  } },
  
  { type: 'function', function: { name: 'calcular', description: 'Calcula operación matemática.', parameters: { type: 'object', properties: { expresion: { type: 'string' } }, required: ['expresion'] } } },
  { type: 'function', function: { name: 'recordar_dato', description: 'Guarda dato personal.', parameters: { type: 'object', properties: { clave: { type: 'string' }, valor: { type: 'string' } }, required: ['clave', 'valor'] } } },
  { type: 'function', function: { name: 'copiar_portapapeles', description: 'Copia texto.', parameters: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] } } },
  { type: 'function', function: { name: 'abrir_url', description: 'Abre URL externa.', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } },
  { type: 'function', function: { name: 'buscar_en_google', description: 'Google.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'buscar_en_youtube', description: 'YouTube.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'poner_timer', description: 'Timer.', parameters: { type: 'object', properties: { minutos: { type: 'number' }, mensaje: { type: 'string' } }, required: ['minutos'] } } },
  { type: 'function', function: { name: 'modo_reposo', description: 'Modo reposo.', parameters: { type: 'object', properties: { minutos: { type: 'number' } } } } },
  
  { type: 'function', function: { name: 'mostrar_imagen', description: 'Muestra imágenes en panel.', parameters: { type: 'object', properties: { busqueda: { type: 'string' } }, required: ['busqueda'] } } },
  { type: 'function', function: { name: 'mostrar_video', description: 'Busca videos en YouTube.', parameters: { type: 'object', properties: { busqueda: { type: 'string' } }, required: ['busqueda'] } } },
  { type: 'function', function: { name: 'mostrar_mapa', description: 'Muestra mapa.', parameters: { type: 'object', properties: { lugar: { type: 'string' } }, required: ['lugar'] } } },
  { type: 'function', function: { name: 'mostrar_texto', description: 'Muestra texto largo.', parameters: { type: 'object', properties: { titulo: { type: 'string' }, contenido: { type: 'string' }, fuente: { type: 'string' } }, required: ['titulo', 'contenido'] } } },
  { type: 'function', function: { name: 'mostrar_clima_extendido', description: 'Muestra pronóstico.', parameters: { type: 'object', properties: { ciudad: { type: 'string' } } } } },
  { type: 'function', function: { name: 'limpiar_pantalla', description: 'Cierra todos los paneles.', parameters: { type: 'object', properties: {} } } },
  
  { type: 'function', function: { name: 'activar_modo_enfoque', description: 'Activa modo enfoque.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'desactivar_modo_enfoque', description: 'Desactiva modo enfoque.', parameters: { type: 'object', properties: {} } } },
];

// ═══════════════════════════════════════════════════════════
// RESPUESTAS DIRECTAS
// ═══════════════════════════════════════════════════════════

function respuestaDirectaHora(d) { return `Son las ${d.hora}.`; }

function respuestaDirectaClima(d) {
  if (d.error) return 'Ahora no pude comprobar el clima. Prefiero no darte un pronóstico inventado.';
  if (d.cuando === 'extendido') {
    const days = d.dias || [];
    if (!days.length) return 'No conseguí el pronóstico extendido.';
    const first=days[0];
    return `Hoy en ${d.ciudad} se esperan entre ${first.tempMin} y ${first.tempMax} grados, ${first.condicion}. ` + weatherAdvice(d);
  }
  let reply;
  if (d.cuando === 'mañana') {
    reply = `Mañana en ${d.ciudad} se esperan entre ${d.tempMin} y ${d.tempMax} grados, ${d.condicion}.`;
    if (d.probLluvia > 30) reply += ` Hay ${d.probLluvia} por ciento de probabilidad de lluvia.`;
  } else reply = `En ${d.ciudad} hay ${d.temperatura} grados y está ${d.condicion}.`;
  const advice=weatherAdvice(d);return reply+(advice?' '+advice:'');
}

function respuestaDirectaDolar(d) {
  if (d.error) return 'No pude consultar el dólar.';
  const blue = d.blue, oficial = d.oficial;
  let r = '';
  if (blue) r += `El blue está a ${blue.compra} para compra y ${blue.venta} para venta. `;
  if (oficial) r += `El oficial, ${oficial.compra} y ${oficial.venta}.`;
  return r.trim() || 'Sin datos del dólar.';
}

// ═══════════════════════════════════════════════════════════
// DETECCIÓN DE INTENCIÓN
// ═══════════════════════════════════════════════════════════

function detectIntent(text) {
  const t = text.toLowerCase();
  
  // ═══════════════════════════════════════════════════════════
  // MÚSICA — detección directa por regex (sin LLM)
  // ═══════════════════════════════════════════════════════════
  
  if (/\b(pausá|pausa|pausar|pará|para)\b.*\b(música|musica|canción|cancion|tema)\b/.test(t)) return 'musica_pausar';
  if (/\b(reanudá|reanuda|continuá|continua|seguí|segui|resumí|resumi)\b.*\b(música|musica|canción|cancion)\b/.test(t)) return 'musica_reanudar';
  if (/\b(siguiente|próxima|proxima)\b.*\b(canción|cancion|tema|música|musica)\b/.test(t)) return 'musica_siguiente';
  if (/\b(canción|tema|música|musica)\b.*\b(siguiente|próxima|proxima)\b/.test(t)) return 'musica_siguiente';
  if (/\b(anterior|previa)\b.*\b(canción|cancion|tema|música|musica)\b/.test(t)) return 'musica_anterior';
  if (/\b(cerrá|cerra|detené|detene|pará|para)\b.*\b(música|musica|player|reproductor|canción)\b/.test(t)) return 'musica_cerrar';
  
  const musicKeywords = /\b(reproducí|reproduce|poné|pon|quiero escuchar|escuchar|quiero música|poner música|música de|musica de|playlist de|tocá|toca)\b/;
  const musicMention = /\b(música|musica|canción|cancion|tema|playlist|álbum|album|artista)\b/;
  
  if (musicKeywords.test(t)) {
    const match = t.match(/(?:reproducí|reproduce|poné|pon|quiero escuchar|escuchar|música de|musica de|playlist de|tocá|toca)\s+(.+)/i);
    if (match) {
      return 'musica_cancion';
    }
    if (musicMention.test(t)) {
      return 'musica_preguntar';
    }
  }
  
  const mood = detectarMoodYPlaylist(t);
  if (mood && /\b(estoy|me siento)\b/.test(t) && /\b(musica|música|playlist|escuchar)\b/.test(t)) return 'musica_mood';
  
  // ═══════════════════════════════════════════════════════════
  // RESTO DE INTENCIONES
  // ═══════════════════════════════════════════════════════════
  
  if (/^briefing|dame el briefing|resumen del día/i.test(t)) return 'briefing';
  if (/\b(modo enfoque|modo concentración)\b/.test(t)) return 'modo_enfoque';
  if (/\b(salir de enfoque|desactivar enfoque|modo normal)\b/.test(t)) return 'modo_normal';

  const esSaludo = /^(hola|buenas|buenos días|buenas tardes|buenas noches|hey|qué tal|cómo estás|cómo andás|qué hacés|todo bien|cómo va)\b/i.test(t.trim());
  if (esSaludo || (t.trim().length < 15 && /\b(hola|gracias|chau|adiós|buenas|ok)\b/i.test(t))) return null;

  if (/\b(mostrame|mostrá|muestra|enséñame|quiero ver|visualizá|abrime|abrí|abre)\b/.test(t) && 
      /\b(imagen|imágenes|imagenes|foto|fotos)\b/.test(t)) return 'tool';
  if (/\b(mostrame|mostrá|muestra|enséñame|quiero ver|visualizá|buscame|buscá)\b/.test(t) && 
      /\b(video|vídeo|clip|videos|vídeos)\b/.test(t)) return 'tool';
  if (/\b(mostrame|mostrá|muestra|dónde|donde)\b/.test(t) && 
      /\b(mapa|ubicación|ubicacion|ubicado|queda)\b/.test(t)) return 'tool';
  if (/\b(mostrame|mostrá|muestra)\b/.test(t) && /\b(clima|tiempo|pronóstico|pronostico|semana)\b/.test(t)) return 'tool';
  if (/\b(limpiá la pantalla|limpia la pantalla|cerrá todo|cerra todo)\b/.test(t)) return 'tool';

  if (/\b(guardá|guarda|anotá|anota|tomá nota)\b/.test(t)) return 'tool';
  if (/\b(qué notas|leeme las notas|mis notas)\b/.test(t)) return 'tool';
  if (/\b(borrá|borra|eliminá|elimina).*(nota|notas)\b/.test(t)) return 'tool';
  if (/\b(creá|crea|nueva|nuevo).*(hoja|tabla|planilla)\b/.test(t)) return 'tool';
  if (/\b(agregá|agrega|añadí|añade|sumá|suma).*(hoja|fila|tabla)\b/.test(t)) return 'tool';
  if (/\b(leeme la hoja|leer hoja|mostrame la hoja|quiero ver la hoja)\b/.test(t)) return 'tool';
  if (/\b(exportá|exporta|descargá|descarga|csv).*(hoja|tabla)\b/.test(t)) return 'tool';
  if (/\b(whatsapp|wsp|wasap|mandale|enviale|manda|envia)\b/.test(t)) return 'tool';
  if (/\b(mandá|manda|envía|envia|escribí).*(mail|email|correo)\b/.test(t)) return 'tool';
  if (/\b(llamá|llama|llamar|marcar)\b.*\d/.test(t)) return 'tool';
  if (/\b(calculá|calcula|cuánto es|cuanto es|cuanto da)\b/.test(t)) return 'tool';
  if (/\b(recordá|recuerda|acordate|acordáte).*que\b/.test(t)) return 'tool';
  if (/\b(copiá|copia|copiar).*(portapapeles|clipboard|esto)\b/.test(t)) return 'tool';
  if (/\b(abrí|abre|abrime|abrir).*(youtube|google|página|sitio|web)\b/.test(t)) return 'tool';
  if (/\b(buscá|busca|búscame).*(google|youtube|en la web)\b/.test(t)) return 'tool';
  if (/\b(poneme|pon|iniciá|creá).*(timer|temporizador|alarma|recordatorio)\b/.test(t)) return 'tool';
  if (/\b(modo reposo|reposo|descansá)\b/.test(t)) return 'tool';

  if (/\b(qué hora|que hora|hora es|decime la hora|dame la hora)\b/.test(t)) return 'hora';
  if (/\b(clima|temperatura|frío|calor|llueve|llover|soleado|pronóstico)\b/.test(t)) return 'clima';
  if (/\b(dólar|dolar|blue|oficial|mep|tarjeta|cripto)\b/.test(t)) return 'dolar';
  if (/\b(busca|buscá|búscame|investiga|averigua|googlea)\b/.test(t)) return 'buscar';
  if (necesitaInfoActual(t)) return 'buscar';

  return null;
}

function necesitaInfoActual(t) {
  const frasesConversacionales = [/cómo estás/, /cómo andás/, /cómo te va/, /cómo va todo/, /qué haces/, /qué hacés/, /qué tal/, /todo bien/];
  if (frasesConversacionales.some(p => p.test(t))) return false;

  const palabras = ['hoy', 'ayer', 'mañana', 'ahora', 'actualmente', 'reciente', 'últimamente', 'última hora', 'esta semana', 'este mes', 'este año', 'anoche', 'resultado', 'salió', 'ganó', 'perdió', 'empató', 'partido', 'final', 'noticia', 'noticias', 'pasó', 'sucedió', 'nuevo', 'nueva', 'último', 'precio', 'vale', 'cotiza', 'bitcoin', 'ethereum', 'presidente', 'gobierno', 'elecciones', 'inter', 'miami', 'barcelona', 'river', 'boca', 'messi', 'argentina'];
  if (palabras.some(p => t.includes(p))) return true;

  const patrones = [
    /\bcómo\s+(salió|fue|estuvo|anduvo|le fue)\b/,
    /\bqué\s+(pasó|sucedió|hay|dice|opina)\b/,
    /\bcuándo\s+(es|fue|será|juega|sale)\b/,
    /\bdónde\s+(queda|está|fue|juega)\b/,
    /\bquién\s+(es|fue|ganó|perdió)\b/,
    /\bcuánto\s+(está|vale|salió)\b/,
  ];
  return patrones.some(p => p.test(t));
}

function extractCiudad(text) {
  const t = text.toLowerCase();
  const ciudades = ['buenos aires', 'caba', 'cordoba', 'córdoba', 'rosario', 'mendoza', 'la plata'];
  for (const c of ciudades) if (t.includes(c)) return c;
  return 'Córdoba';
}

function extractCuandoClima(text) {
  const t = text.toLowerCase();
  if (/\b(semana|7 días|7 dias|extendido|próximos|proximos)\b/.test(t)) return 'extendido';
  if (/\b(mañana|para mañana|el día de mañana|pronóstico)\b/.test(t)) return 'mañana';
  return 'hoy';
}

function extractQueryBusqueda(text) {
  return text
    .replace(/\b(busca|buscá|búscame|investiga|consultá|averigua|googlea|enterate)\b/gi, '')
    .replace(/\b(nexus|por favor|decime|dame)\b/gi, '')
    .trim() || text;
}

// ═══════════════════════════════════════════════════════════
// CALCULADORA
// ═══════════════════════════════════════════════════════════

function calcularSeguro(expr) {
  try {
    const sanitized = expr.replace(/\s+/g, '').replace(/[^0-9+\-*/().,%^]/gi, '');
    let clean = sanitized.replace(/\^/g, '**')
      .replace(/sqrt\(/g, 'Math.sqrt(').replace(/abs\(/g, 'Math.abs(')
      .replace(/sin\(/g, 'Math.sin(').replace(/cos\(/g, 'Math.cos(')
      .replace(/tan\(/g, 'Math.tan(').replace(/log\(/g, 'Math.log(')
      .replace(/pi/gi, 'Math.PI');
    const result = Function('"use strict"; return (' + clean + ')')();
    if (typeof result !== 'number' || !isFinite(result)) return { error: 'Inválido' };
    return { result: Math.round(result * 1000000) / 1000000 };
  } catch (e) {
    return { error: 'No pude calcular' };
  }
}

// ═══════════════════════════════════════════════════════════
// TOOLS
// ═══════════════════════════════════════════════════════════

async function buildToolAction(toolName, args, notas, hojas) {
  switch (toolName) {
    case 'guardar_nota': return { action: { type: 'save_note', text: args.texto }, result: `Nota guardada.` };
    case 'leer_notas': {
      const l = notas.length === 0 ? 'No hay notas.' : notas.map((n, i) => `${i + 1}. ${n}`).join(' | ');
      return { action: null, result: `Notas (${notas.length}): ${l}` };
    }
    case 'borrar_nota': {
      if (args.borrar_todas && !args.indice) return { action: { type: 'clear_notes' }, result: `Todas borradas.` };
      if (args.indice) return { action: { type: 'delete_note', index: args.indice - 1 }, result: `Borrando ${args.indice}.` };
      if (notas.length > 0) return { action: { type: 'delete_note', index: notas.length - 1 }, result: `Borrando última.` };
      return { action: null, result: 'No hay notas.' };
    }
    case 'crear_hoja': return { action: { type: 'create_sheet', name: args.nombre, columns: args.columnas }, result: `Hoja "${args.nombre}" creada.` };
    case 'agregar_fila': return { action: { type: 'add_row', sheet: args.nombre_hoja, values: args.valores }, result: `Fila agregada.` };
    case 'mostrar_hoja': {
      const h = hojas[args.nombre.toLowerCase()];
      if (!h) return { action: null, result: `No existe "${args.nombre}".` };
      return { action: { type: 'show_sheet', name: args.nombre }, result: `Mostrando "${args.nombre}".` };
    }
    case 'exportar_hoja': {
      const h = hojas[args.nombre.toLowerCase()];
      if (!h) return { action: null, result: `No existe "${args.nombre}".` };
      return { action: { type: 'export_sheet', name: args.nombre }, result: `Exportando.` };
    }
    case 'listar_hojas': {
      const n = Object.keys(hojas);
      return { action: null, result: n.length === 0 ? 'No hay hojas.' : `Hojas: ${n.join(', ')}` };
    }
    case 'borrar_hoja': return { action: { type: 'delete_sheet', name: args.nombre }, result: `Borrando "${args.nombre}".` };
    case 'enviar_whatsapp': {
      const num = String(args.numero).replace(/[^0-9]/g, '');
      return { action: { type: 'open_url', url: `https://wa.me/${num}?text=${encodeURIComponent(args.mensaje)}` }, result: `WhatsApp a ${num}.` };
    }
    case 'enviar_email': {
      const url = `mailto:${args.destinatario}?subject=${encodeURIComponent(args.asunto || '')}&body=${encodeURIComponent(args.cuerpo || '')}`;
      return { action: { type: 'open_url', url }, result: `Email.` };
    }
    case 'hacer_llamada': return { action: { type: 'open_url', url: `tel:${args.numero}` }, result: `Llamando.` };
    
    case 'reproducir_musica': {
      const ytResult = await buscarVideosYouTube(args.busqueda, 10);
      if (ytResult.error || !ytResult.videos || ytResult.videos.length === 0) {
        return { action: null, result: `No encontré videos de "${args.busqueda}".` };
      }
      return {
        action: { type: 'play_music', query: args.busqueda, videos: ytResult.videos },
        result: `Reproduciendo "${args.busqueda}" (${ytResult.videos.length} videos en cola).`
      };
    }
    
    case 'controlar_musica': {
      return { action: { type: 'music_control', accion: args.accion }, result: `Control: ${args.accion}.` };
    }
    
    case 'calcular': {
      const r = calcularSeguro(args.expresion);
      return { action: null, result: r.error ? r.error : `${args.expresion} = ${r.result}` };
    }
    case 'recordar_dato': return { action: { type: 'save_fact', key: args.clave, value: args.valor }, result: `Recordado.` };
    case 'copiar_portapapeles': return { action: { type: 'copy_to_clipboard', text: args.texto }, result: `Copiado.` };
    case 'abrir_url': return { action: { type: 'open_url', url: args.url }, result: `Abriendo.` };
    case 'buscar_en_google': return { action: { type: 'open_url', url: `https://www.google.com/search?q=${encodeURIComponent(args.query)}` }, result: `Buscando.` };
    case 'buscar_en_youtube': return { action: { type: 'open_url', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(args.query)}` }, result: `Buscando.` };
    case 'poner_timer': return { action: { type: 'set_timer', minutes: args.minutos, message: args.mensaje || 'Timer' }, result: `Timer ${args.minutos} min.` };
    case 'modo_reposo': return { action: { type: 'sleep_mode', minutes: args.minutos || 30 }, result: `Modo reposo.` };
    
    case 'mostrar_imagen': return { action: { type: 'show_panel', panelType: 'image', query: args.busqueda }, result: `Mostrando imágenes.` };
    
    case 'mostrar_video': {
      const ytResult = await buscarVideosYouTube(args.busqueda, 6);
      if (ytResult.error) {
        return { action: { type: 'show_panel', panelType: 'video_fallback', query: args.busqueda }, result: `Error YouTube.` };
      }
      return { 
        action: { type: 'show_panel', panelType: 'video', query: args.busqueda, videos: ytResult.videos }, 
        result: `Encontré ${ytResult.videos.length} videos.` 
      };
    }
    
    case 'mostrar_mapa': return { action: { type: 'show_panel', panelType: 'map', query: args.lugar }, result: `Mostrando mapa.` };
    case 'mostrar_texto': return { action: { type: 'show_panel', panelType: 'text', title: args.titulo, content: args.contenido, source: args.fuente }, result: `Mostrando texto.` };
    case 'mostrar_clima_extendido': return { action: { type: 'show_panel', panelType: 'weather', query: args.ciudad || 'Córdoba' }, result: `Mostrando pronóstico.` };
    case 'limpiar_pantalla': return { action: { type: 'clear_panels' }, result: `Cerrando paneles.` };
    
    case 'activar_modo_enfoque': return { action: { type: 'focus_mode', active: true }, result: `Modo enfoque activado.` };
    case 'desactivar_modo_enfoque': return { action: { type: 'focus_mode', active: false }, result: `Modo enfoque desactivado.` };
    
    default: return { action: null, result: `Tool desconocida.` };
  }
}

// ═══════════════════════════════════════════════════════════
// SPLIT SENTENCES
// ═══════════════════════════════════════════════════════════

function splitSentences(text) {
  if (!text) return [];
  const parts = text.replace(/([.!?;:])\s+/g, '$1|||').split('|||').map(s => s.trim()).filter(s => s.length > 1);
  const merged = [];
  for (const p of parts) {
    if (merged.length > 0 && p.length < 10) merged[merged.length - 1] += ' ' + p;
    else merged.push(p);
  }
  return merged;
}

// ═══════════════════════════════════════════════════════════
// PROMPT
// ═══════════════════════════════════════════════════════════

function getSaludoPorHora() {
  const now = new Date();
  const hora = parseInt(now.toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', hour12: false }));
  if (hora >= 5 && hora < 12) return 'Buen día';
  if (hora >= 12 && hora < 19) return 'Buenas tardes';
  if (hora >= 19 && hora < 23) return 'Buenas noches';
  return 'Trabajando a estas horas';
}

function buildSystemPrompt(statusContext, recentHistory, currentPanel) {
  const saludo = getSaludoPorHora();
  
  let continuityContext = '';
  if (Array.isArray(recentHistory) && recentHistory.length > 0) {
    continuityContext = '\n\n## CONTEXTO CONVERSACIONAL\n';
    for (const conv of recentHistory.slice(-6)) {
      continuityContext += `Usuario: ${conv.user}\nVos: ${conv.assistant}\n`;
    }
    continuityContext += '\nSi el usuario hace una pregunta corta o ambigua, asumí que se refiere al tema anterior.';
  }
  
  let panelContext = '';
  if (currentPanel && currentPanel.type) {
    panelContext = `\n\n## PANEL ABIERTO\nPanel "${currentPanel.type}" mostrando "${currentPanel.query}".`;
  }

  return `Sos NEXUS, el compañero y asistente personal de Franco. Tu identidad es cercana, curiosa, ingeniosa y con criterio. Tu interfaz tiene un rostro expresivo, pero tu función principal es ayudar y conversar con naturalidad.

## PERSONALIDAD
- Hablá en español rioplatense, de vos. El usuario se llama Franco. Usá su nombre cuando resulte natural, sin repetirlo en cada mensaje.
- Trato horizontal y cálido: nada de mayordomo, títulos, «Señor», «a sus órdenes», servilismo o solemnidad de JARVIS.
- Tené criterio: si te pide opinión, elegí una postura razonada, explicá brevemente por qué y reconocé la incertidumbre. Podés discrepar con respeto y ofrecer una alternativa concreta.
- Usá «yo elegiría», «me inclino por» o «te recomendaría» para recomendaciones. No afirmes experiencias humanas, emociones reales ni recuerdos que no están en el contexto.
- Humor ligero cuando encaje. Escuchá el tono: ante tristeza o problemas, priorizá empatía y ayuda, sin bromas forzadas.
- Sé curioso y conversador, pero no termines siempre con una pregunta. Continuá el hilo y evitá respuestas prefabricadas o aduladoras.

## RESPUESTAS PARA VOZ
- Texto plano, sin markdown, listas visuales, asteriscos ni emojis en lo que se dice en voz alta.
- Normalmente 2 a 4 frases; ampliá si Franco pide más detalle o una explicación completa.
- Respondé directamente, sin repetir saludos en cada turno ni anunciar «sistemas en línea».
- Conservá la precisión: no inventes clima, resultados, precios, acciones realizadas o datos actuales. Las recomendaciones se basan en los datos disponibles; admití cuando falten.

## PROACTIVIDAD Y FUNCIONES
- Sugerí algo útil y concreto cuando encaje, sin insistir. Recomendá paraguas solo si el pronóstico consultado indica lluvia o probabilidad relevante; abrigo si los datos indican frío.
- Conservá todas las herramientas disponibles. Usalas para notas, hojas, memoria, cálculos, búsqueda, música, comunicación, mapas, paneles y modos, según lo solicitado.
- No ejecutes acciones solo para acompañar una opinión. Distinguí entre sugerir algo y hacerlo.

## EXPRESIÓN DEL COMPAÑERO
Al FINAL de cada respuesta de texto, añadí exactamente una etiqueta de presentación. El servidor la retira antes de hablar y la convierte en datos para el rostro:
<nexus-ui>{"emotion":"curious","accessory":"none"}</nexus-ui>
Emociones permitidas: neutral, happy, curious, thoughtful, surprised, concerned, amused, empathetic.
Accesorios permitidos: none, witch_hat, umbrella, glasses, headphones, scarf.
Elegí la expresión que acompañe tu respuesta. Accesorios solo cuando encajen: witch_hat al conversar sobre brujas/Halloween, glasses para explicar o estudiar, headphones al tratar música, umbrella/scarf con clima verificado. Por defecto none. Si Franco pide quitar un accesorio, usá none. No hace falta anunciarlo ni fingir que un accesorio concede capacidades nuevas.
La etiqueta no forma parte de tu mensaje hablado. Si llamás herramientas, no la incluyas en sus argumentos; emitila en la respuesta final.

## MÚSICA
- Si pide música sin especificar género → preguntá qué le gustaría escuchar.
- Si menciona mood → sugerí playlist apropiada (usa reproducir_musica).
- Control con controlar_musica: pausar, reanudar, siguiente, anterior, cerrar.

## CONTEXTO
- Usuario: Franco, en Córdoba, Argentina; español rioplatense.
- Saludo apropiado: "${saludo}"
- Fecha: ${new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
- Hora: ${new Date().toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit' })}
${statusContext}${continuityContext}${panelContext}`;
}

// ═══════════════════════════════════════════════════════════
// HANDLER — ADAPTADO PARA VERCEL (req, res)
// ═══════════════════════════════════════════════════════════

module.exports = async (req, res) => {
  console.log('🔥 FUNCIÓN INVOCADA');
  const startTime = Date.now();
  const companionContext = { userText: '', intent: null, weather: null };
  const respond = payload => res.status(200).json(enrichNexusResponse(payload, companionContext));

  // CORS (por si acaso)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const { audioBase64, userPrompt, history, notas = [], hojas = {}, facts = {}, currentPanel = null } = req.body;
    if (!audioBase64 && !userPrompt) return res.status(400).json({ error: 'Falta audio o prompt' });

    let finalUserText = userPrompt;

    if (audioBase64) {
      console.log('🎙️ Transcribiendo...');
      const t0 = Date.now();
      finalUserText = await transcribirConGroq(audioBase64);
      console.log(`✅ Transcrito en ${Date.now() - t0}ms: "${finalUserText}"`);
    }

    const cleanText = (finalUserText || '').trim();
    companionContext.userText = cleanText;
    if (cleanText.length < 3) {
      const reply = 'No te escuché bien. ¿Me lo repetís?';
      return respond({ reply, transcribedText: cleanText, sentences: [reply] });
    }

    const tLower = cleanText.toLowerCase();
    if (/\b(olvidá todo|olvida todo|borrá tu memoria|reseteá)\b/.test(tLower)) {
      const reply = 'Memoria borrada.';
      return respond({ reply, transcribedText: cleanText, intent: 'clear_memory', fast: true, sentences: [reply] });
    }

    const intent = detectIntent(cleanText);
    companionContext.intent = intent;
    console.log(`🎯 Intención: ${intent || 'conversación'}`);

    let toolResult = null;
    let respuestaRapida = null;
    let frontendActions = [];

    // Briefing
    if (intent === 'briefing') {
      const [horaData, climaData, dolarData] = await Promise.all([getHora(), getClima(extractCiudad(cleanText), 'hoy'), getDolar()]);
      const saludo = getSaludoPorHora();
      const blue = dolarData.blue;
      companionContext.weather = climaData;
      let briefing = `${saludo}, Franco. Son las ${horaData.hora}. `;
      briefing += climaData.error ? 'Ahora no pude comprobar el clima. ' : respuestaDirectaClima(climaData) + ' ';
      if (blue) briefing += `El dólar blue está a ${blue.venta} para la venta. `;
      briefing += `¿Con qué querés arrancar?`;
      return respond({ reply: briefing, transcribedText: cleanText, intent: 'briefing', fast: true, sentences: splitSentences(briefing) });
    }
    
    // Modo enfoque
    if (intent === 'modo_enfoque') {
      const reply = 'Listo, bajamos las distracciones.';
      return respond({ reply, transcribedText: cleanText, intent: 'modo_enfoque', fast: true, actions: [{ type: 'focus_mode', active: true }], sentences: splitSentences(reply) });
    }
    
    if (intent === 'modo_normal') {
      const reply = 'Listo, volvemos al modo normal.';
      return respond({ reply, transcribedText: cleanText, intent: 'modo_normal', fast: true, actions: [{ type: 'focus_mode', active: false }], sentences: splitSentences(reply) });
    }
    
    // CONTROL DE MÚSICA
    if (intent === 'musica_pausar' || intent === 'musica_reanudar' || intent === 'musica_siguiente' || intent === 'musica_anterior' || intent === 'musica_cerrar') {
      let accion = 'pausar';
      if (intent === 'musica_pausar') accion = 'pausar';
      else if (intent === 'musica_reanudar') accion = 'reanudar';
      else if (intent === 'musica_siguiente') accion = 'siguiente';
      else if (intent === 'musica_anterior') accion = 'anterior';
      else if (intent === 'musica_cerrar') accion = 'cerrar';
      
      const reply = accion === 'pausar' ? 'Pausado.' :
                    accion === 'reanudar' ? 'Continuando.' :
                    accion === 'siguiente' ? 'Siguiente.' :
                    accion === 'anterior' ? 'Volviendo.' :
                    'Cerrando reproductor.';
      
      return respond({ reply, transcribedText: cleanText, intent, fast: true, actions: [{ type: 'music_control', accion }], sentences: splitSentences(reply) });
    }
    
    // PREGUNTAR QUÉ MÚSICA
    if (intent === 'musica_preguntar') {
      const reply = '¿Qué te gustaría escuchar? Puedo poner rock, pop, jazz, clásica, electrónica, o algo según cómo te sientas.';
      return respond({ reply, transcribedText: cleanText, intent: 'musica_preguntar', fast: true, sentences: splitSentences(reply) });
    }
    
    // MÚSICA POR CANCIÓN/ARTISTA/GÉNERO
    if (intent === 'musica_cancion') {
      const match = cleanText.match(/(?:reproducí|reproduce|poné|pon|quiero escuchar|escuchar|música de|musica de|playlist de|tocá|toca)\s+(.+)/i);
      const query = match ? match[1].trim().replace(/[.,!?]$/, '') : cleanText;
      
      console.log(`🎵 Buscando: "${query}"`);
      const ytResult = await buscarVideosYouTube(query, 10);
      
      if (ytResult.videos && ytResult.videos.length > 0) {
        const reply = `Vamos con ${query}.`;
        return respond({
          reply,
          transcribedText: cleanText,
          intent: 'musica_cancion',
          fast: true,
          actions: [{ type: 'play_music', query, videos: ytResult.videos }],
          sentences: splitSentences(reply),
        });
      } else {
        const reply = `No encontré "${query}".`;
        return respond({ reply, transcribedText: cleanText, intent, fast: true, sentences: splitSentences(reply) });
      }
    }
    
    // MÚSICA POR MOOD
    if (intent === 'musica_mood') {
      const mood = detectarMoodYPlaylist(cleanText);
      if (mood) {
        const ytResult = await buscarVideosYouTube(mood.query, 10);
        if (ytResult.videos && ytResult.videos.length > 0) {
          return respond({
            reply: mood.response,
            transcribedText: cleanText,
            intent: 'musica_mood',
            fast: true,
            actions: [{ type: 'play_music', query: mood.query, videos: ytResult.videos }],
            sentences: splitSentences(mood.response),
          });
        }
      }
    }

    if (intent === 'hora') { toolResult = await getHora(); respuestaRapida = respuestaDirectaHora(toolResult); }
    else if (intent === 'clima') { toolResult = await getClima(extractCiudad(cleanText), extractCuandoClima(cleanText)); companionContext.weather = toolResult; respuestaRapida = respuestaDirectaClima(toolResult); }
    else if (intent === 'dolar') { toolResult = await getDolar(); respuestaRapida = respuestaDirectaDolar(toolResult); }
    else if (intent === 'buscar') { toolResult = await buscarWeb(extractQueryBusqueda(cleanText)); }

    if (respuestaRapida) {
      return respond({ reply: respuestaRapida, transcribedText: cleanText, intent, fast: true, sentences: splitSentences(respuestaRapida) });
    }

    let historyContext = null;
    if (Array.isArray(history) && history.length > 0) historyContext = history.slice(-6);

    let statusContext = '';
    if (notas.length > 0) statusContext += `\nNotas: ${notas.map((n,i)=>`${i+1}."${n}"`).join(', ')}`;
    const hojasNombres = Object.keys(hojas);
    if (hojasNombres.length > 0) statusContext += `\nHojas: ${hojasNombres.join(', ')}.`;
    const factKeys = Object.keys(facts);
    if (factKeys.length > 0) statusContext += `\nDatos: ${factKeys.map(k => `${k}="${facts[k]}"`).join(', ')}`;

    const systemPrompt = buildSystemPrompt(statusContext, historyContext, currentPanel);

    let userMessage = cleanText;
    if (toolResult) userMessage += `\n\n[DATOS WEB]\n${JSON.stringify(toolResult)}\n\nResumí en 2 frases.`;

    console.log('🧠 LLM con tools...');
    const t1 = Date.now();
    const message = await chatConGroq([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ], 400, TOOLS);
    console.log(`✅ LLM en ${Date.now() - t1}ms`);

    if (message.tool_calls && message.tool_calls.length > 0) {
      console.log(`🛠️ Tool calls: ${message.tool_calls.length}`);
      const toolMessages = [];
      const toolActions = [];
      
      for (const call of message.tool_calls) {
        const toolName = call.function.name;
        let args = {};
        try { args = JSON.parse(call.function.arguments); } catch (e) {}
        console.log(`🛠️ ${toolName}(${JSON.stringify(args)})`);
        const { action, result } = await buildToolAction(toolName, args, notas, hojas);
        if (action) toolActions.push(action);
        toolMessages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
      
      console.log('🧠 LLM segunda pasada...');
      const finalMessage = await chatConGroq([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
        message,
        ...toolMessages,
      ], 250);
      
      const finalReply = finalMessage.content || 'Listo.';
      
      return respond({
        reply: finalReply,
        transcribedText: cleanText,
        intent: 'tool',
        actions: toolActions,
        sentences: splitSentences(finalReply),
      });
    }

    const aiReply = message.content;
    if (!aiReply) throw new Error('Sin respuesta del LLM');

    return respond({ reply: aiReply, transcribedText: cleanText, intent, sentences: splitSentences(aiReply) });

  } catch (error) {
    console.error('💥 ERROR:', error.message);
    const errorReply = 'Se cortó la conexión. Probemos de nuevo en un momento.';
    return respond({ reply: errorReply, error: error.message, sentences: [errorReply] });
  }
};
