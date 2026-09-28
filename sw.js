// Service Worker de NEXUS — v1

const CACHE_NAME = 'nexus-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// Instalación: cachear los assets principales
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Service Worker: cacheando assets');
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('⚠️ No se pudieron cachear todos los assets:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activación: limpiar caches viejas
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker: activado');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('🗑️ Service Worker: eliminando cache vieja:', name);
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: estrategia network-first con fallback a cache
self.addEventListener('fetch', (event) => {
  // No interceptar llamadas a funciones de Netlify (siempre deben ir a la red)
  if (event.request.url.includes('/.netlify/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Guardar copia en cache
        if (response.ok && event.request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Si falla la red, usar cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // Si no hay cache, devolver index.html para navegación
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Sin conexión', { status: 503 });
        });
      })
  );
});