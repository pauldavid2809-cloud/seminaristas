/* ==========================================================================
   Comunión a enfermos · Parroquia "San Benito de Palermo"
   Página aparte (enfermos.html) para registrar la ubicación de los enfermos
   a los que se les lleva la comunión. Es una lista APARTE del censo: se
   guarda en la tabla "comunion_enfermos" (ver supabase-comunion.sql), con la
   zona detectada por GPS, para armar el recorrido de visitas.
   ========================================================================== */

"use strict";

const sb =
  typeof SUPABASE_URL === "string" && window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;
const HAY_MAPAS = typeof window.L !== "undefined";
const GEO_ZONAS = typeof ZONAS_GEO !== "undefined" ? ZONAS_GEO : [];
const GEO_PARROQUIA = typeof PARROQUIA_GEO !== "undefined" ? PARROQUIA_GEO : null;
const CENTRO = GEO_PARROQUIA ? [GEO_PARROQUIA.lat, GEO_PARROQUIA.lng] : [10.6548, -71.6019];

const TABLA = "comunion_enfermos";
const BUCKET = "comunion-fotos";
const FOTO_LADO = 1280; // px del lado mayor: buena vista y poco peso (~150 KB)
const LS_COLA = "comunion_pendientes";
const LS_COPIA = "comunion_copia";
const GPS_PRECISION_BUENA = 20;
const GPS_ESPERA_MS = 15000;

const $ = (s) => document.querySelector(s);

/* ---------- Utilidades ---------- */

function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizarTelefono(tel) {
  const d = String(tel || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("58")) return d;
  return "58" + (d.startsWith("0") ? d.slice(1) : d);
}

function formatoLocal(tel) {
  if (!tel) return "";
  const local = tel.startsWith("58") ? "0" + tel.slice(2) : tel;
  return local.length === 11 ? `${local.slice(0, 4)}-${local.slice(4)}` : local;
}

function errorDeRed(e) {
  return !navigator.onLine || !sb || /fetch|network|failed/i.test(e?.message || "");
}

function puntoEnPoligono(lat, lng, pol) {
  let dentro = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [yi, xi] = pol[i];
    const [yj, xj] = pol[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function distanciaMetros(a, b) {
  const r = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/* Zona que contiene el punto; si cae fuera de las 8, la más cercana a su borde */
function zonaParaPunto(lat, lng) {
  const dentro = GEO_ZONAS.find((z) => puntoEnPoligono(lat, lng, z.poligono));
  if (dentro) return { zona: dentro, fuera: false };
  let mejor = null;
  GEO_ZONAS.forEach((z) => {
    const d = Math.min(...z.poligono.map((p) => distanciaMetros([lat, lng], p)));
    if (!mejor || d < mejor.d) mejor = { zona: z, d };
  });
  return mejor ? { zona: mejor.zona, fuera: true } : null;
}

function nombreZona(z) {
  return z.santo ? `${z.nombre} · ${z.santo}` : z.nombre;
}

function linkComoLlegar(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
}

let temporizadorToast = null;
function toast(texto) {
  const el = $("#toast");
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => (el.hidden = true), 3200);
}

/* ---------- Datos ---------- */

let enfermos = []; // { id, nombre, telefono, referencia, lat, lng, zona, foto, creado }
let usandoCopia = null;
let faltaTabla = false; // la tabla aún no se creó en Supabase

function esFaltaTabla(e) {
  const t = `${e?.code || ""} ${e?.message || ""}`;
  return /PGRST205|42P01|comunion_enfermos/.test(t) && /exist|find|schema cache/i.test(t);
}

async function cargar() {
  try {
    if (!sb) throw new Error("Failed to fetch");
    const { data, error } = await sb
      .from(TABLA)
      .select("*")
      .eq("eliminado", false)
      .order("creado_en", { ascending: false });
    if (error) throw error;
    faltaTabla = false;
    enfermos = data.map((x) => ({
      id: x.id,
      nombre: x.nombre,
      telefono: x.telefono,
      referencia: x.referencia,
      lat: x.lat,
      lng: x.lng,
      zona: (x.zona || "").trim(),
      foto: x.foto || null,
      creado: x.creado_en,
    }));
    usandoCopia = null;
    try {
      localStorage.setItem(LS_COPIA, JSON.stringify({ fecha: new Date().toISOString(), enfermos }));
    } catch {
      /* sin almacenamiento: solo se pierde el modo sin señal */
    }
  } catch (e) {
    if (esFaltaTabla(e)) {
      faltaTabla = true;
      return;
    }
    if (!errorDeRed(e)) throw e;
    try {
      const copia = JSON.parse(localStorage.getItem(LS_COPIA) || "null");
      if (copia) {
        enfermos = copia.enfermos;
        usandoCopia = copia.fecha;
      }
    } catch {
      /* sin copia guardada */
    }
  }
}

/* ---------- Cola sin señal ---------- */

let colaTexto = null;
let colaLeida = [];

function cola() {
  try {
    const texto = localStorage.getItem(LS_COLA) || "[]";
    // Se relee solo si cambió: con fotos la cola puede pesar
    if (texto !== colaTexto) {
      colaLeida = JSON.parse(texto);
      colaTexto = texto;
    }
    return colaLeida;
  } catch {
    return [];
  }
}

function guardarCola(lista) {
  try {
    localStorage.setItem(LS_COLA, JSON.stringify(lista));
    return true;
  } catch {
    return false; // sin almacenamiento o lleno (las fotos pesan)
  }
}

/* ---------- Fotos ---------- */

function urlFoto(ruta) {
  return ruta ? `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${ruta.split("/").map(encodeURIComponent).join("/")}` : null;
}

/* Foto de un enfermo: la que espera señal en este teléfono o la ya subida */
function fotoDe(e) {
  const enCola = cola().filter((r) => r.tipo === "foto" && r.id === e.id).pop();
  return enCola?.foto || urlFoto(e.foto);
}

function errorDeFotos(e) {
  return /foto|bucket/i.test(`${e?.message || ""} ${e?.error || ""}`);
}

async function comprimirFoto(archivo) {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error("No se pudo leer la foto"));
      i.src = url;
    });
    const escala = Math.min(1, FOTO_LADO / Math.max(img.naturalWidth, img.naturalHeight));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(img.naturalWidth * escala);
    lienzo.height = Math.round(img.naturalHeight * escala);
    lienzo.getContext("2d").drawImage(img, 0, 0, lienzo.width, lienzo.height);
    return lienzo.toDataURL("image/jpeg", 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function subirFoto(ruta, dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const { error } = await sb.storage.from(BUCKET).upload(ruta, blob, { contentType: "image/jpeg", upsert: false });
  // Si ya se había subido en un intento anterior, está bien
  if (error && !/exist|duplicate/i.test(`${error.message || ""} ${error.error || ""}`)) throw error;
}

async function enviar(registro) {
  if (registro.foto) await subirFoto(registro.fotoRuta, registro.foto);
  if (registro.tipo === "foto") {
    const { error } = await sb.from(TABLA).update({ foto: registro.fotoRuta }).eq("id", registro.id);
    if (error) throw error;
    return;
  }
  // El id se genera en el teléfono: si se reintenta, no se duplica
  const { error } = await sb.from(TABLA).upsert(registro.fila, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw error;
}

async function sincronizar() {
  if (!sb || !navigator.onLine) return;
  let lista = cola();
  if (!lista.length) return;
  for (const r of [...lista]) {
    try {
      await enviar(r);
      lista = lista.filter((x) => x !== r);
    } catch {
      guardarCola(lista);
      pintarAvisos();
      return;
    }
  }
  guardarCola(lista);
  await cargar();
  pintarTodo();
  toast("Registros enviados a la lista");
}

/* ---------- Mapa ---------- */

let mapa = null;
let capaEnfermos = null;
let miPin = null;
let miCirculo = null;
let miPos = null;
let miPosInfo = null; // { lat, lng, precision, t } de la última lectura del mapa

function capasBase(m) {
  const calles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
    crossOrigin: "",
  });
  const satelite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19, attribution: "© Esri" }
  );
  calles.addTo(m);
  L.control.layers({ Calles: calles, Satélite: satelite }, null, { position: "topright" }).addTo(m);
}

function capaZonas(m) {
  GEO_ZONAS.forEach((z) => {
    L.polygon(z.poligono, { color: z.color, weight: 2, opacity: 0.8, fillColor: z.color, fillOpacity: 0.1, interactive: false }).addTo(m);
  });
  if (GEO_PARROQUIA) {
    L.marker(CENTRO, {
      interactive: false,
      icon: L.divIcon({ className: "pin-parroquia", html: "⛪", iconSize: [32, 32], iconAnchor: [16, 16] }),
    }).addTo(m);
  }
}

function iconoEnfermo(n, clase = "") {
  return L.divIcon({ className: `pin-enfermo ${clase}`, html: `<span>${n}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
}

function iniciarMapa() {
  const el = $("#mapa-enfermos");
  if (!HAY_MAPAS) {
    el.innerHTML = `<div class="mapa-fallback">El mapa necesita internet. Igual puedes registrar enfermos con el GPS.</div>`;
    return;
  }
  mapa = L.map(el, { zoomControl: true }).setView(CENTRO, 16);
  capasBase(mapa);
  capaZonas(mapa);
  mapa.createPane("enfermos").style.zIndex = 650;
  capaEnfermos = L.layerGroup().addTo(mapa);
  const limites = GEO_ZONAS.length ? L.latLngBounds(GEO_ZONAS.flatMap((z) => z.poligono)) : null;
  if (limites) mapa.fitBounds(limites, { padding: [16, 16] });
}

function pintarMapa() {
  if (!mapa) return;
  capaEnfermos.clearLayers();
  const r = rutaActual();
  if (r) {
    L.polyline(puntosRuta(r), { color: "#1d3a5f", weight: 3, opacity: 0.75, dashArray: "6 8", interactive: false }).addTo(capaEnfermos);
  }
  enfermos
    .filter((e) => e.lat != null)
    .forEach((e) => {
      const n = numeroDe(e);
      const clase = !r ? "" : n == null ? "fuera-ruta" : r.visitados.includes(e.id) ? "visitado" : "";
      L.marker([e.lat, e.lng], { icon: iconoEnfermo(n == null ? "" : clase === "visitado" ? "✓" : n, clase), pane: "enfermos" })
        .bindPopup(
          `<div class="popup-casa">${fotoDe(e) ? `<img class="popup-foto" src="${esc(fotoDe(e))}" alt="Foto del lugar" data-accion="ver-foto" data-src="${esc(fotoDe(e))}" />` : ""}<strong>${n != null && r ? `${n}. ` : ""}${esc(e.nombre)}</strong><p>${esc(e.zona)}${
            e.referencia ? ` · ${esc(e.referencia)}` : ""
          }</p><a class="btn btn-principal" href="${linkComoLlegar(e.lat, e.lng)}" target="_blank" rel="noopener">Cómo llegar</a></div>`
        )
        .addTo(capaEnfermos);
    });
}

function seguirMiUbicacion() {
  if (!("geolocation" in navigator)) return;
  navigator.geolocation.watchPosition(
    (pos) => {
      miPos = [pos.coords.latitude, pos.coords.longitude];
      miPosInfo = { lat: miPos[0], lng: miPos[1], precision: pos.coords.accuracy, t: Date.now() };
      if (!mapa) return;
      if (!miPin) {
        miCirculo = L.circle(miPos, { radius: pos.coords.accuracy, color: "#2563eb", weight: 1, fillOpacity: 0.12, interactive: false }).addTo(mapa);
        miPin = L.marker(miPos, {
          interactive: false,
          zIndexOffset: 1000,
          icon: L.divIcon({ className: "", html: '<div class="pin-yo"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        }).addTo(mapa);
      } else {
        miPin.setLatLng(miPos);
        miCirculo.setLatLng(miPos).setRadius(pos.coords.accuracy);
      }
    },
    () => {
      /* sin permiso: el mapa funciona igual, sin tu punto */
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
  );
}

/* ---------- Lista ---------- */

function pintarAvisos() {
  const n = cola().length;
  const avisos = [];
  if (faltaTabla) {
    avisos.push(`<div class="aviso-offline"><span><strong>Falta activar la lista.</strong> Hay que crear la tabla en Supabase (archivo supabase-comunion.sql). Mientras tanto no se puede guardar.</span></div>`);
  }
  if (usandoCopia) {
    avisos.push(`<div class="aviso-offline"><span><strong>Sin señal.</strong> Ves la lista guardada en este teléfono. Lo que registres se envía solo al volver la señal.</span></div>`);
  }
  if (n) {
    avisos.push(`<div class="aviso-offline"><span>Hay <strong>${n}</strong> registro${n > 1 ? "s" : ""} guardado${n > 1 ? "s" : ""} en este teléfono esperando señal.</span>
      <button class="btn btn-secundario btn-chip" data-accion="sincronizar">Enviar ahora</button></div>`);
  }
  $("#avisos").innerHTML = avisos.join("");
}

function pintarLista() {
  const pendientesCola = cola().filter((r) => r.fila).map((r) => ({ nombre: r.fila.nombre, zona: r.zonaNombre, enCola: true }));
  const todos = [...pendientesCola, ...enfermos];
  $("#contador").textContent = `${todos.length} enfermo${todos.length !== 1 ? "s" : ""} registrado${todos.length !== 1 ? "s" : ""}`;
  if (!todos.length) {
    $("#lista-enfermos").innerHTML = `<div class="card vacio-card"><span class="vacio-icono">🙏</span>Todavía no hay enfermos registrados.<span class="texto-suave">Toca <strong>Registrar enfermo</strong> frente a su casa.</span></div>`;
    return;
  }
  const titulo = rutaActual() ? `<p class="censo-contador lista-titulo">Todos los enfermos</p>` : "";
  $("#lista-enfermos").innerHTML = titulo + todos
    .map((e) => {
      if (e.enCola) {
        return `<div class="card enfermo-fila"><span class="enfermo-num cola">⏳</span><div class="enfermo-datos"><strong>${esc(e.nombre)}</strong><span class="texto-suave">${esc(e.zona || "")} · esperando señal</span></div></div>`;
      }
      const conPunto = e.lat != null;
      const n = conPunto ? numeroDe(e) ?? "·" : "–";
      return `<div class="card enfermo-fila">
        ${
          fotoDe(e)
            ? `<button type="button" class="enfermo-foto" data-accion="ver-foto" data-src="${esc(fotoDe(e))}" aria-label="Ver foto del lugar"><img src="${esc(fotoDe(e))}" alt="" loading="lazy" /><span class="enfermo-num${n === "·" ? " fuera-ruta" : ""}">${n}</span></button>`
            : `<span class="enfermo-num${n === "·" ? " fuera-ruta" : ""}">${n}</span>`
        }
        <div class="enfermo-datos">
          <strong>${esc(e.nombre)}</strong>
          <span class="texto-suave">${esc(e.zona)}${e.referencia ? ` · ${esc(e.referencia)}` : ""}</span>
          ${e.telefono ? `<a class="enfermo-tel" href="tel:${esc(e.telefono)}">📞 ${esc(formatoLocal(e.telefono))}</a>` : ""}
          ${fotoDe(e) ? "" : `<button type="button" class="enfermo-agregar-foto" data-accion="agregar-foto" data-id="${esc(e.id)}">📷 Agregar foto</button>`}
        </div>
        ${conPunto ? `<a class="btn btn-principal btn-chip enfermo-llegar" href="${linkComoLlegar(e.lat, e.lng)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 21 3l-8 18-2-8z" /></svg>Cómo llegar</a>` : `<span class="texto-suave">sin ubicación</span>`}
      </div>`;
    })
    .join("");
}

function pintarTodo() {
  pintarAvisos();
  pintarLista();
  pintarRuta();
  pintarMapa();
}

/* ---------- Recorrido ---------- */

const LS_RUTA = "comunion_ruta";
const FACTOR_CALLES = 1.3; // por las calles se camina más que en línea recta
const METROS_POR_MINUTO = 75; // ~4,5 km/h
const MAX_INTERMEDIAS = 9; // Google Maps acepta pocas paradas intermedias por enlace

// { inicio: { tipo: "parroquia"|"yo", lat, lng }, volver, paradas: [id], visitados: [id], creada }
let ruta = (() => {
  try {
    return JSON.parse(localStorage.getItem(LS_RUTA) || "null");
  } catch {
    return null;
  }
})();

function guardarRuta() {
  try {
    if (ruta) localStorage.setItem(LS_RUTA, JSON.stringify(ruta));
    else localStorage.removeItem(LS_RUTA);
  } catch {
    /* sin almacenamiento: el recorrido dura mientras la página esté abierta */
  }
}

/* El recorrido guardado con los enfermos que siguen en la lista */
function rutaActual() {
  if (!ruta) return null;
  const porId = Object.fromEntries(enfermos.filter((e) => e.lat != null).map((e) => [e.id, e]));
  const paradas = ruta.paradas.map((id) => porId[id]).filter(Boolean);
  if (!paradas.length) return null;
  return { ...ruta, paradas, visitados: ruta.visitados || [] };
}

function numeroDe(e) {
  const r = rutaActual();
  if (!r) return enfermos.filter((x) => x.lat != null).indexOf(e) + 1 || null;
  const i = r.paradas.indexOf(e);
  return i === -1 ? null : i + 1;
}

function puntosRuta(r) {
  return [[r.inicio.lat, r.inicio.lng], ...r.paradas.map((e) => [e.lat, e.lng]), ...(r.volver ? [CENTRO] : [])];
}

function largo(puntos) {
  let d = 0;
  for (let i = 1; i < puntos.length; i++) d += distanciaMetros(puntos[i - 1], puntos[i]);
  return d;
}

/* Orden de visita: el más cercano primero y luego se destraban cruces (2-opt) */
function ordenarParadas(inicio, paradas, fin) {
  const costo = (orden) => largo([inicio, ...orden.map((e) => [e.lat, e.lng]), ...(fin ? [fin] : [])]);
  const pendientes = [...paradas];
  let orden = [];
  let actual = inicio;
  while (pendientes.length) {
    let k = 0;
    pendientes.forEach((e, i) => {
      if (distanciaMetros(actual, [e.lat, e.lng]) < distanciaMetros(actual, [pendientes[k].lat, pendientes[k].lng])) k = i;
    });
    const [e] = pendientes.splice(k, 1);
    orden.push(e);
    actual = [e.lat, e.lng];
  }
  let mejor = costo(orden);
  let mejoro = true;
  while (mejoro) {
    mejoro = false;
    for (let i = 0; i < orden.length - 1; i++) {
      for (let j = i + 1; j < orden.length; j++) {
        const nuevo = [...orden.slice(0, i), ...orden.slice(i, j + 1).reverse(), ...orden.slice(j + 1)];
        const c = costo(nuevo);
        if (c < mejor - 0.5) {
          orden = nuevo;
          mejor = c;
          mejoro = true;
        }
      }
    }
  }
  return orden;
}

/* Enlaces de Google Maps a pie, partidos en tramos si hay muchas paradas */
function tramosGoogle(r) {
  const pt = (p) => `${p[0]},${p[1]}`;
  const destinos = r.paradas.map((e) => [e.lat, e.lng]);
  if (r.volver) destinos.push(CENTRO);
  const n = r.paradas.length;
  const tramos = [];
  // "Donde estoy": sin origen, Google Maps sale de la ubicación actual del teléfono
  let origen = r.inicio.tipo === "yo" ? null : [r.inicio.lat, r.inicio.lng];
  let i = 0;
  while (i < destinos.length) {
    const trozo = destinos.slice(i, i + MAX_INTERMEDIAS + 1);
    const destino = trozo.pop();
    let url = `https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${pt(destino)}`;
    if (origen) url += `&origin=${pt(origen)}`;
    if (trozo.length) url += `&waypoints=${trozo.map(pt).join("%7C")}`;
    const desde = i + 1;
    const hasta = i + trozo.length + 1;
    tramos.push({ url, desde: Math.min(desde, n), hasta: Math.min(hasta, n), regreso: hasta > n, soloRegreso: desde > n });
    origen = destino;
    i = hasta;
  }
  return tramos;
}

function textoDistancia(m) {
  return m < 1000 ? `${Math.round(m / 10) * 10}\u00a0m` : `${(m / 1000).toFixed(1).replace(".", ",")}\u00a0km`;
}

function textoMinutos(min) {
  min = Math.max(1, Math.round(min));
  return min < 60 ? `${min}\u00a0min` : `${Math.floor(min / 60)}\u00a0h${min % 60 ? ` ${min % 60}\u00a0min` : ""}`;
}

function etiquetaTramo(t, total) {
  if (total === 1) return "Abrir recorrido en Google Maps";
  if (t.soloRegreso) return "Regreso a la parroquia";
  const visitas = t.desde === t.hasta ? `visita ${t.desde}` : `visitas ${t.desde} a ${t.hasta}`;
  return `Tramo: ${visitas}${t.regreso ? " y regreso" : ""}`;
}

function pintarRuta() {
  const conPunto = enfermos.filter((e) => e.lat != null);
  $("#btn-ruta").hidden = !conPunto.length;
  const r = rutaActual();
  const caja = $("#ruta");
  if (!r) {
    caja.innerHTML = "";
    return;
  }
  const metros = largo(puntosRuta(r)) * FACTOR_CALLES;
  const tramos = tramosGoogle(r);
  const hechas = r.paradas.filter((e) => r.visitados.includes(e.id)).length;
  const siguiente = r.paradas.find((e) => !r.visitados.includes(e.id));
  caja.innerHTML = `<section class="card ruta-card">
    <div class="ruta-cab">
      <div>
        <strong>Recorrido de visitas</strong>
        <span class="texto-suave">${r.paradas.length} visita${r.paradas.length !== 1 ? "s" : ""} · ${textoDistancia(metros)} · ~${textoMinutos(metros / METROS_POR_MINUTO)} a pie${
          hechas ? ` · ${hechas} hecha${hechas !== 1 ? "s" : ""}` : ""
        }</span>
      </div>
      <button type="button" class="btn btn-secundario btn-chip" data-accion="quitar-ruta">Quitar</button>
    </div>
    <div class="ruta-tramos">
      ${tramos
        .map((t) => `<a class="btn btn-principal" href="${t.url}" target="_blank" rel="noopener">${etiquetaTramo(t, tramos.length)}</a>`)
        .join("")}
    </div>
    ${tramos.length > 1 ? `<p class="ayuda">Google Maps solo acepta unas 10 paradas por enlace: al terminar un tramo, abre el siguiente.</p>` : ""}
    <ol class="ruta-paradas">
      <li class="ruta-punta">${r.inicio.tipo === "yo" ? "📍 Salida: donde estabas" : "⛪ Salida: la parroquia"}</li>
      ${r.paradas
        .map((e, i) => {
          const hecha = r.visitados.includes(e.id);
          return `<li class="ruta-parada${hecha ? " hecha" : ""}${e === siguiente ? " siguiente" : ""}">
          <span class="enfermo-num${hecha ? " visitado" : ""}">${hecha ? "✓" : i + 1}</span>
          <div class="enfermo-datos">
            <strong>${esc(e.nombre)}</strong>
            <span class="texto-suave">${e === siguiente ? "Siguiente · " : ""}${esc(e.zona)}${e.referencia ? ` · ${esc(e.referencia)}` : ""}</span>
          </div>
          <button type="button" class="btn btn-chip ${hecha ? "btn-suave" : "btn-secundario"}" data-accion="visitado" data-id="${esc(e.id)}" aria-pressed="${hecha}">${hecha ? "Visitado" : "Listo"}</button>
          <a class="btn btn-principal btn-icono-chip" href="${linkComoLlegar(e.lat, e.lng)}" target="_blank" rel="noopener" aria-label="Cómo llegar a ${esc(e.nombre)}" title="Cómo llegar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 21 3l-8 18-2-8z" /></svg></a>
          ${e === siguiente && fotoDe(e) ? `<img class="ruta-foto" src="${esc(fotoDe(e))}" alt="Foto del lugar" data-accion="ver-foto" data-src="${esc(fotoDe(e))}" />` : ""}
        </li>`;
        })
        .join("")}
      ${r.volver ? `<li class="ruta-punta">⛪ Regreso a la parroquia</li>` : ""}
    </ol>
    <p class="ayuda">Distancia y tiempo aproximados; Google Maps te da el camino exacto por las calles.</p>
  </section>`;
}

function abrirRuta() {
  const conPunto = enfermos.filter((e) => e.lat != null);
  const elegidos = ruta ? new Set(ruta.paradas) : null;
  $("#r-lista").innerHTML = conPunto
    .map(
      (e) => `<label class="ruta-sel"><input type="checkbox" value="${esc(e.id)}" ${!elegidos || elegidos.has(e.id) ? "checked" : ""} />
        <span><strong>${esc(e.nombre)}</strong><small class="texto-suave">${esc(e.zona)}</small></span></label>`
    )
    .join("");
  const yo = $("#r-inicio-yo");
  yo.disabled = !miPos;
  $("#r-yo-nota").textContent = miPos ? "" : "(activa el GPS para usarlo)";
  document.querySelector(`input[name="r-inicio"][value="${ruta?.inicio?.tipo === "yo" && miPos ? "yo" : "parroquia"}"]`).checked = true;
  $("#r-volver").checked = !!ruta?.volver;
  $("#r-error").hidden = true;
  $("#hoja-ruta").hidden = false;
  document.body.classList.add("hoja-abierta");
}

function cerrarRuta() {
  $("#hoja-ruta").hidden = true;
  document.body.classList.remove("hoja-abierta");
}

function armarRuta() {
  const ids = [...document.querySelectorAll("#r-lista input:checked")].map((x) => x.value);
  const paradas = enfermos.filter((e) => e.lat != null && ids.includes(e.id));
  if (!paradas.length) {
    const el = $("#r-error");
    el.textContent = "Marca al menos un enfermo para el recorrido.";
    el.hidden = false;
    return;
  }
  const tipo = document.querySelector('input[name="r-inicio"]:checked').value === "yo" && miPos ? "yo" : "parroquia";
  const inicio = tipo === "yo" ? miPos : CENTRO;
  const volver = $("#r-volver").checked;
  const orden = ordenarParadas(inicio, paradas, volver ? CENTRO : null);
  ruta = {
    inicio: { tipo, lat: inicio[0], lng: inicio[1] },
    volver,
    paradas: orden.map((e) => e.id),
    visitados: [],
    creada: new Date().toISOString(),
  };
  guardarRuta();
  cerrarRuta();
  pintarTodo();
  if (mapa) mapa.fitBounds(L.latLngBounds(puntosRuta(rutaActual())), { padding: [30, 30], maxZoom: 17 });
  $("#ruta").scrollIntoView({ behavior: "smooth", block: "start" });
  toast(`Recorrido listo: ${orden.length} visita${orden.length !== 1 ? "s" : ""}`);
}

function marcarVisitado(id) {
  if (!ruta) return;
  const v = new Set(ruta.visitados || []);
  if (v.has(id)) v.delete(id);
  else v.add(id);
  ruta.visitados = [...v];
  guardarRuta();
  pintarRuta();
  pintarMapa();
}

function quitarRuta() {
  if (!confirm("¿Quitar el recorrido?")) return;
  ruta = null;
  guardarRuta();
  pintarTodo();
}

/* ---------- Formulario ---------- */

let formUbic = null;
let gpsWatch = null;
let gpsTiempo = null;
let mapaForm = null;
let pinForm = null;

function estadoUbic(tipo, texto) {
  const el = $("#ubic-estado");
  el.className = `ubic-estado ${tipo}`;
  el.innerHTML = `<span>${texto}</span>`;
  const z = $("#ubic-zona");
  if (formUbic && GEO_ZONAS.length) {
    const r = zonaParaPunto(formUbic.lat, formUbic.lng);
    z.hidden = false;
    z.className = `ubic-zona ${r.fuera ? "aviso" : "ok"}`;
    z.innerHTML = r.fuera
      ? `<span>Fuera de las 8 zonas. Se guardará en la más cercana: <strong>${esc(nombreZona(r.zona))}</strong></span>`
      : `<span class="zona-punto" style="background:${r.zona.color}"></span><span>Zona: <strong>${esc(nombreZona(r.zona))}</strong></span>`;
  } else {
    z.hidden = true;
  }
}

function detenerGPS() {
  if (gpsWatch != null) navigator.geolocation.clearWatch(gpsWatch);
  gpsWatch = null;
  clearTimeout(gpsTiempo);
}

function ponerPunto(u, centrar) {
  formUbic = u;
  if (!mapaForm) return;
  const p = [u.lat, u.lng];
  if (!pinForm) {
    pinForm = L.marker(p, {
      draggable: true,
      icon: L.divIcon({
        className: "pin-casa",
        html: '<svg viewBox="0 0 24 24"><path d="M12 22s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12z"/><circle cx="12" cy="10" r="2.6"/></svg>',
        iconSize: [36, 36],
        iconAnchor: [18, 34],
      }),
    }).addTo(mapaForm);
    pinForm.on("dragend", () => {
      detenerGPS();
      const q = pinForm.getLatLng();
      formUbic = { lat: q.lat, lng: q.lng, precision: null };
      estadoUbic("ok", "Punto ajustado a mano");
    });
  } else {
    pinForm.setLatLng(p);
  }
  if (centrar) mapaForm.setView(p, 18);
}

function capturarGPS() {
  if (!("geolocation" in navigator)) {
    estadoUbic("error", "Este teléfono no da la ubicación. Toca el mapa donde está la casa.");
    return;
  }
  detenerGPS();
  estadoUbic("buscando", "Buscando señal GPS…");
  let mejor = null;
  let listo = false;
  const terminar = () => {
    listo = true;
    detenerGPS();
    if (mejor) estadoUbic("ok", `Ubicación guardada · ±${Math.round(mejor.precision)}&nbsp;m`);
  };
  gpsTiempo = setTimeout(() => {
    if (mejor) terminar();
    else {
      detenerGPS();
      estadoUbic("error", "El GPS tardó demasiado. Inténtalo de nuevo o toca el mapa donde está la casa.");
    }
  }, GPS_ESPERA_MS);
  const lectura = (u) => {
    if (listo) return;
    if (!mejor || u.precision < mejor.precision) {
      mejor = u;
      ponerPunto(u, true);
      estadoUbic("buscando", `Afinando… ±${Math.round(u.precision)}&nbsp;m`);
    }
    if (u.precision <= GPS_PRECISION_BUENA) terminar();
  };
  const desdeGPS = (pos) => lectura({ lat: pos.coords.latitude, lng: pos.coords.longitude, precision: pos.coords.accuracy });
  /* la ubicación reciente del mapa sirve de inmediato; luego se afina */
  if (miPosInfo && Date.now() - miPosInfo.t < 15000) {
    lectura({ lat: miPosInfo.lat, lng: miPosInfo.lng, precision: miPosInfo.precision });
  }
  navigator.geolocation.getCurrentPosition(desdeGPS, () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: GPS_ESPERA_MS });
  if (listo) return;
  gpsWatch = navigator.geolocation.watchPosition(
    desdeGPS,
    (err) => {
      detenerGPS();
      if (mejor) terminar();
      else
        estadoUbic(
          "error",
          err && err.code === 1
            ? "Permite la ubicación en el navegador, o toca el mapa donde está la casa."
            : "No se pudo obtener la ubicación. Toca el mapa donde está la casa."
        );
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: GPS_ESPERA_MS }
  );
}

function abrirFormulario() {
  formUbic = null;
  pinForm = null;
  $("#hoja").hidden = false;
  document.body.classList.add("hoja-abierta");
  $("#f-nombre").value = "";
  $("#f-telefono").value = "";
  $("#f-referencia").value = "";
  $("#f-autoriza").checked = false;
  ponerFotoForm(null);
  $("#f-error").hidden = true;
  estadoUbic("", "Sin ubicación todavía");
  setTimeout(() => {
    if (HAY_MAPAS && !mapaForm) {
      mapaForm = L.map($("#form-mapa"), { zoomControl: true }).setView(miPos || CENTRO, 17);
      capasBase(mapaForm);
      capaZonas(mapaForm);
      mapaForm.on("click", (ev) => {
        detenerGPS();
        ponerPunto({ lat: ev.latlng.lat, lng: ev.latlng.lng, precision: null }, false);
        estadoUbic("ok", "Punto marcado en el mapa");
      });
    } else if (!HAY_MAPAS) {
      $("#form-mapa").innerHTML = `<div class="mapa-fallback">El mapa necesita internet; el GPS funciona igual.</div>`;
    }
    if (mapaForm) mapaForm.invalidateSize();
    capturarGPS();
  }, 80);
}

function cerrarFormulario() {
  detenerGPS();
  if (mapaForm) {
    mapaForm.remove();
    mapaForm = null;
  }
  pinForm = null;
  $("#hoja").hidden = true;
  document.body.classList.remove("hoja-abierta");
}

function errorForm(msg) {
  const el = $("#f-error");
  el.textContent = msg;
  el.hidden = false;
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function guardar() {
  const nombre = $("#f-nombre").value.trim();
  if (!nombre) return errorForm("Escribe el nombre del enfermo.");
  if (!formUbic) return errorForm("Falta la ubicación: usa el GPS o toca el mapa donde está la casa.");
  if (!$("#f-autoriza").checked) return errorForm("Pide la autorización de la familia y marca la casilla.");
  if (faltaTabla) return errorForm("La lista todavía no está activada en Supabase (falta crear la tabla).");
  const r = zonaParaPunto(formUbic.lat, formUbic.lng);

  const referencia = $("#f-referencia").value.trim();
  const registro = {
    zonaNombre: r ? nombreZona(r.zona) : "",
    fila: {
      id: crypto.randomUUID ? crypto.randomUUID() : uuidSimple(),
      nombre,
      telefono: normalizarTelefono($("#f-telefono").value),
      referencia: referencia || null,
      zona: r ? r.zona.nombre : null,
      lat: formUbic.lat,
      lng: formUbic.lng,
      precision_m: formUbic.precision != null ? Math.round(formUbic.precision) : null,
      consentimiento_en: new Date().toISOString(),
    },
  };
  if (formFoto) {
    registro.foto = formFoto;
    registro.fotoRuta = `${registro.fila.id}/${Date.now()}.jpg`;
    registro.fila.foto = registro.fotoRuta;
  }

  const boton = $("#f-guardar");
  boton.disabled = true;
  try {
    await enviar(registro);
    cerrarFormulario();
    await cargar();
    pintarTodo();
    toast(`${nombre} quedó en la lista de comunión`);
  } catch (e) {
    if (errorDeRed(e)) {
      let aviso = "Sin señal: quedó guardado y se enviará al volver la señal";
      if (!guardarCola([...cola(), registro])) {
        // Sin espacio para la foto: se guarda el registro sin ella
        delete registro.foto;
        delete registro.fila.foto;
        guardarCola([...cola(), registro]);
        aviso = "Sin señal y sin espacio para la foto: se guardó sin foto";
      }
      cerrarFormulario();
      pintarTodo();
      toast(aviso);
    } else if (registro.foto && errorDeFotos(e)) {
      errorForm("Las fotos todavía no están activadas en Supabase. Quita la foto para guardar, o activa las fotos primero.");
    } else {
      errorForm(`No se pudo guardar: ${e.message}`);
    }
  } finally {
    boton.disabled = false;
  }
}

let formFoto = null; // foto del formulario (JPEG comprimido, data URL)
let fotoPara = null; // "form" o el id del enfermo al que se le agrega foto

function ponerFotoForm(dataUrl) {
  formFoto = dataUrl;
  const vista = $("#f-foto-vista");
  vista.hidden = !dataUrl;
  vista.querySelector("img").src = dataUrl || "";
  $("#f-foto-btn").textContent = dataUrl ? "📷 Cambiar foto" : "📷 Tomar o elegir foto";
}

function elegirFoto(destino) {
  fotoPara = destino;
  const input = $("#input-foto");
  input.value = "";
  input.click();
}

async function alElegirFoto(archivo) {
  if (!archivo) return;
  let dataUrl;
  try {
    dataUrl = await comprimirFoto(archivo);
  } catch (e) {
    toast(e.message);
    return;
  }
  if (fotoPara === "form") ponerFotoForm(dataUrl);
  else if (fotoPara) agregarFoto(fotoPara, dataUrl);
}

async function agregarFoto(id, dataUrl) {
  const registro = { tipo: "foto", id, foto: dataUrl, fotoRuta: `${id}/${Date.now()}.jpg` };
  toast("Subiendo foto…");
  try {
    await enviar(registro);
    await cargar();
    pintarTodo();
    toast("Foto guardada");
  } catch (e) {
    if (errorDeRed(e)) {
      if (guardarCola([...cola(), registro])) {
        pintarTodo();
        toast("Sin señal: la foto se enviará al volver la señal");
      } else toast("Sin señal y sin espacio en el teléfono para la foto");
    } else if (errorDeFotos(e)) {
      toast("Las fotos todavía no están activadas en Supabase");
    } else toast(`No se pudo guardar la foto: ${e.message}`);
  }
}

function verFoto(src) {
  const visor = $("#visor");
  visor.querySelector("img").src = src;
  visor.hidden = false;
}

function uuidSimple() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
  );
}

/* ---------- Eventos ---------- */

document.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-accion]");
  if (!el) return;
  const a = el.dataset.accion;
  if (a === "abrir") abrirFormulario();
  else if (a === "cerrar") cerrarFormulario();
  else if (a === "guardar") guardar();
  else if (a === "gps") capturarGPS();
  else if (a === "sincronizar") sincronizar();
  else if (a === "elegir-foto") elegirFoto("form");
  else if (a === "quitar-foto") ponerFotoForm(null);
  else if (a === "agregar-foto") elegirFoto(el.dataset.id);
  else if (a === "ver-foto") verFoto(el.dataset.src);
  else if (a === "cerrar-visor") $("#visor").hidden = true;
  else if (a === "abrir-ruta") abrirRuta();
  else if (a === "cerrar-ruta") cerrarRuta();
  else if (a === "armar-ruta") armarRuta();
  else if (a === "quitar-ruta") quitarRuta();
  else if (a === "visitado") marcarVisitado(el.dataset.id);
  else if (a === "ruta-todos" || a === "ruta-ninguno")
    document.querySelectorAll("#r-lista input").forEach((x) => (x.checked = a === "ruta-todos"));
});

document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape") return;
  if (!$("#visor").hidden) $("#visor").hidden = true;
  else if (!$("#hoja").hidden) cerrarFormulario();
  else if (!$("#hoja-ruta").hidden) cerrarRuta();
});

window.addEventListener("online", sincronizar);
$("#input-foto").addEventListener("change", (ev) => alElegirFoto(ev.target.files[0]));

(async function iniciar() {
  iniciarMapa();
  seguirMiUbicacion();
  await cargar();
  pintarTodo();
  sincronizar();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
