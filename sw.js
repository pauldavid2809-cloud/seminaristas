/* ==========================================================================
   Service worker · Censo Parroquia "San Benito de Palermo"
   Guarda la app en el teléfono para que abra sin señal.
   - Páginas: primero la red (para recibir actualizaciones), y si no hay
     señal, la copia guardada.
   - Archivos de la app y librerías: la copia guardada al instante y se
     actualiza en segundo plano.
   - Mosaicos del mapa de calles: se guardan los que se van viendo.
   - Datos del censo (Supabase): nunca se guardan aquí; siempre van a la red
     (la app guarda su propia copia para el modo sin señal).
   Al cambiar algo importante de este archivo, subir VERSION.
   ========================================================================== */

const VERSION = "2026-10-04-1";
const CACHE_APP = `censo-app-${VERSION}`;
const CACHE_MAPAS = "censo-mapas-v1";
const MAX_MOSAICOS = 3000;
const ESPERA_RED_MS = 4000;

const PAGINAS = ["index.html", "palabra.html"];
const EXTRAS = [
  "./",
  "index.html",
  "palabra.html",
  "manifest.webmanifest",
  "img/logo-san-benito.jpg",
  "img/icono-192.png",
  "img/icono-512.png",
  "img/icono-adaptable-512.png",
  "img/icono-apple-180.png",
];

const urlAbsoluta = (u) => new URL(u, self.registration.scope).href;
const esDatos = (url) => url.hostname.endsWith("supabase.co");
const esMosaico = (url) => /(^|\.)tile\.openstreetmap\.org$|arcgisonline\.com$/.test(url.hostname);

/* Lee una página y devuelve los archivos que carga (src/href) */
async function archivosDe(pagina) {
  const resp = await fetch(urlAbsoluta(pagina), { cache: "reload" });
  const html = await resp.text();
  return [...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
    .map((m) => new URL(m[1], urlAbsoluta(pagina)))
    .filter((url) => url.protocol === "https:" || url.origin === self.location.origin)
    .filter((url) => !esDatos(url) && url.pathname !== "/")
    .map((url) => url.href);
}

async function guardar(cache, url) {
  const mismoOrigen = new URL(url).origin === self.location.origin;
  const resp = await fetch(url, { cache: "reload", mode: mismoOrigen ? "same-origin" : "cors", credentials: "omit" });
  if (resp.ok) await cache.put(url, resp);
}

self.addEventListener("install", (ev) => {
  ev.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_APP);
      const urls = new Set(EXTRAS.map(urlAbsoluta));
      for (const pagina of PAGINAS) {
        try {
          (await archivosDe(pagina)).forEach((u) => urls.add(u));
        } catch {
          /* sin red al instalar: se guarda lo que se pueda */
        }
      }
      /* un archivo que falle (p. ej. un CDN caído) no impide instalar */
      await Promise.allSettled([...urls].map((u) => guardar(cache, u)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    (async () => {
      const vigentes = [CACHE_APP, CACHE_MAPAS];
      for (const nombre of await caches.keys()) {
        if (!vigentes.includes(nombre)) await caches.delete(nombre);
      }
      await self.clients.claim();
    })()
  );
});

function conLimite(promesa, ms) {
  return new Promise((resolver, rechazar) => {
    const t = setTimeout(() => rechazar(new Error("tiempo de espera")), ms);
    promesa.then(
      (r) => {
        clearTimeout(t);
        resolver(r);
      },
      (e) => {
        clearTimeout(t);
        rechazar(e);
      }
    );
  });
}

async function paginaPrimeroRed(req) {
  const cache = await caches.open(CACHE_APP);
  try {
    const resp = await conLimite(fetch(req), ESPERA_RED_MS);
    if (resp.ok) cache.put(req, resp.clone());
    return resp;
  } catch {
    return (
      (await cache.match(req, { ignoreSearch: true })) ||
      (await cache.match(urlAbsoluta("index.html"))) ||
      Response.error()
    );
  }
}

async function copiaYActualiza(req) {
  const cache = await caches.open(CACHE_APP);
  const enCache = await cache.match(req);
  const red = fetch(req)
    .then((resp) => {
      if (resp && resp.ok) cache.put(req, resp.clone());
      return resp;
    })
    .catch(() => null);
  return enCache || (await red) || Response.error();
}

let recortando = false;
async function recortarMosaicos(cache) {
  if (recortando) return;
  recortando = true;
  try {
    const claves = await cache.keys();
    const sobran = claves.length - MAX_MOSAICOS;
    if (sobran > 0) await Promise.all(claves.slice(0, sobran).map((k) => cache.delete(k)));
  } finally {
    recortando = false;
  }
}

async function mosaico(req) {
  const cache = await caches.open(CACHE_MAPAS);
  const enCache = await cache.match(req);
  if (enCache) return enCache;
  try {
    const resp = await fetch(req);
    /* las respuestas opacas (sin CORS) ocupan muchísima cuota: no se guardan */
    if (resp.ok && resp.type !== "opaque") {
      await cache.put(req, resp.clone());
      recortarMosaicos(cache);
    }
    return resp;
  } catch {
    return Response.error();
  }
}

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (esDatos(url)) return;
  if (esMosaico(url)) {
    ev.respondWith(mosaico(req));
    return;
  }
  if (req.mode === "navigate") {
    ev.respondWith(paginaPrimeroRed(req));
    return;
  }
  if (url.origin === self.location.origin || url.protocol === "https:") {
    ev.respondWith(copiaYActualiza(req));
  }
});
