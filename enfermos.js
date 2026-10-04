/* ==========================================================================
   Visita a enfermos · Parroquia "San Benito de Palermo"
   Página aparte (enfermos.html) para registrar rápido la ubicación de los
   enfermos. Guarda en el mismo censo: una casa con una persona de categoría
   "enfermo", con la zona detectada por GPS. Así aparecen también en la app
   principal y se puede armar el recorrido de visitas.
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

const LS_COLA = "enfermos_pendientes";
const LS_COPIA = "enfermos_copia";
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

let sectores = [];
let enfermos = []; // { casaId, personaId, nombre, telefono, referencia, lat, lng, zona, creado }
let usandoCopia = null;

async function cargar() {
  try {
    if (!sb) throw new Error("Failed to fetch");
    const [s, c, p] = await Promise.all([
      sb.from("sectores").select("id,nombre").eq("activo", true),
      sb.from("casas").select("id,sector_id,direccion,telefono,lat,lng,creado_en,sectores(nombre)").eq("eliminado", false),
      sb.from("personas").select("id,casa_id,nombre,categorias,creado_en").eq("eliminado", false).overlaps("categorias", ["enfermo", "uncion"]),
    ]);
    for (const r of [s, c, p]) if (r.error) throw r.error;
    sectores = s.data.map((x) => ({ ...x, nombre: x.nombre.trim() }));
    const casas = Object.fromEntries(c.data.map((x) => [x.id, x]));
    enfermos = p.data
      .filter((x) => casas[x.casa_id])
      .map((x) => {
        const casa = casas[x.casa_id];
        return {
          casaId: casa.id,
          personaId: x.id,
          nombre: x.nombre,
          telefono: casa.telefono,
          referencia: casa.direccion,
          lat: casa.lat,
          lng: casa.lng,
          zona: (casa.sectores?.nombre || "").trim(),
          creado: x.creado_en,
        };
      })
      .sort((a, b) => (a.creado < b.creado ? 1 : -1));
    usandoCopia = null;
    try {
      localStorage.setItem(LS_COPIA, JSON.stringify({ fecha: new Date().toISOString(), sectores, enfermos }));
    } catch {
      /* sin almacenamiento: solo se pierde el modo sin señal */
    }
  } catch (e) {
    if (!errorDeRed(e)) throw e;
    try {
      const copia = JSON.parse(localStorage.getItem(LS_COPIA) || "null");
      if (copia) {
        sectores = copia.sectores;
        enfermos = copia.enfermos;
        usandoCopia = copia.fecha;
      }
    } catch {
      /* sin copia guardada */
    }
  }
}

/* ---------- Cola sin señal ---------- */

function cola() {
  try {
    return JSON.parse(localStorage.getItem(LS_COLA) || "[]");
  } catch {
    return [];
  }
}

function guardarCola(lista) {
  try {
    localStorage.setItem(LS_COLA, JSON.stringify(lista));
  } catch {
    /* sin almacenamiento */
  }
}

async function enviar(registro) {
  let casaId = registro.casa_id;
  if (!casaId) {
    const { data, error } = await sb.from("casas").insert(registro.casa).select("id").single();
    if (error) throw error;
    casaId = data.id;
    registro.casa_id = casaId; // si falla la persona, no se duplica la casa al reintentar
  }
  const { error } = await sb.from("personas").insert({ ...registro.persona, casa_id: casaId });
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
  toast("Registros enviados al censo");
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

function iconoEnfermo(n) {
  return L.divIcon({ className: "pin-enfermo", html: `<span>${n}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
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
  enfermos
    .filter((e) => e.lat != null)
    .forEach((e, i) => {
      L.marker([e.lat, e.lng], { icon: iconoEnfermo(i + 1), pane: "enfermos" })
        .bindPopup(
          `<div class="popup-casa"><strong>${esc(e.nombre)}</strong><p>${esc(e.zona)}${
            e.referencia && !e.referencia.startsWith("(") ? ` · ${esc(e.referencia)}` : ""
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
  if (usandoCopia) {
    avisos.push(`<div class="aviso-offline"><span><strong>Sin señal.</strong> Ves la lista guardada en este teléfono. Lo que registres se envía solo al volver la señal.</span></div>`);
  }
  if (n) {
    avisos.push(`<div class="aviso-offline"><span>Hay <strong>${n}</strong> enfermo${n > 1 ? "s" : ""} guardado${n > 1 ? "s" : ""} en este teléfono esperando señal.</span>
      <button class="btn btn-secundario btn-chip" data-accion="sincronizar">Enviar ahora</button></div>`);
  }
  $("#avisos").innerHTML = avisos.join("");
}

function pintarLista() {
  const pendientesCola = cola().map((r) => ({ nombre: r.persona.nombre, zona: r.zonaNombre, enCola: true }));
  const todos = [...pendientesCola, ...enfermos];
  $("#contador").textContent = `${todos.length} enfermo${todos.length !== 1 ? "s" : ""} registrado${todos.length !== 1 ? "s" : ""}`;
  if (!todos.length) {
    $("#lista-enfermos").innerHTML = `<div class="card vacio-card"><span class="vacio-icono">🙏</span>Todavía no hay enfermos registrados.<span class="texto-suave">Toca <strong>Registrar enfermo</strong> frente a su casa.</span></div>`;
    return;
  }
  let numero = 0;
  $("#lista-enfermos").innerHTML = todos
    .map((e) => {
      if (e.enCola) {
        return `<div class="card enfermo-fila"><span class="enfermo-num cola">⏳</span><div class="enfermo-datos"><strong>${esc(e.nombre)}</strong><span class="texto-suave">${esc(e.zona || "")} · esperando señal</span></div></div>`;
      }
      const conPunto = e.lat != null;
      const n = conPunto ? ++numero : "–";
      return `<div class="card enfermo-fila">
        <span class="enfermo-num">${n}</span>
        <div class="enfermo-datos">
          <strong>${esc(e.nombre)}</strong>
          <span class="texto-suave">${esc(e.zona)}${e.referencia && !e.referencia.startsWith("(") ? ` · ${esc(e.referencia)}` : ""}</span>
          ${e.telefono ? `<a class="enfermo-tel" href="tel:${esc(e.telefono)}">📞 ${esc(formatoLocal(e.telefono))}</a>` : ""}
        </div>
        ${conPunto ? `<a class="btn btn-suave btn-chip" href="${linkComoLlegar(e.lat, e.lng)}" target="_blank" rel="noopener">Llegar</a>` : `<span class="texto-suave">sin ubicación</span>`}
      </div>`;
    })
    .join("");
}

function pintarTodo() {
  pintarAvisos();
  pintarLista();
  pintarMapa();
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
  const r = zonaParaPunto(formUbic.lat, formUbic.lng);
  const sector = r && sectores.find((s) => s.nombre === r.zona.nombre);
  if (!sector) return errorForm("No se pudo asignar la zona. Abre la página una vez con señal y vuelve a intentarlo.");

  const ahora = new Date().toISOString();
  const referencia = $("#f-referencia").value.trim();
  const registro = {
    zonaNombre: nombreZona(r.zona),
    casa: {
      sector_id: sector.id,
      direccion: referencia || "(sin dirección: ver ubicación en el mapa)",
      familia: null,
      telefono: normalizarTelefono($("#f-telefono").value),
      notas: "Registrado desde Visita a enfermos",
      lat: formUbic.lat,
      lng: formUbic.lng,
      precision_m: formUbic.precision != null ? Math.round(formUbic.precision) : null,
      consentimiento: true,
      consentimiento_en: ahora,
    },
    persona: { nombre, edad: null, categorias: ["enfermo"], notas: null },
  };

  const boton = $("#f-guardar");
  boton.disabled = true;
  try {
    await enviar(registro);
    cerrarFormulario();
    await cargar();
    pintarTodo();
    toast(`${nombre} quedó registrado en el censo`);
  } catch (e) {
    if (errorDeRed(e)) {
      guardarCola([...cola(), registro]);
      cerrarFormulario();
      pintarTodo();
      toast("Sin señal: quedó guardado y se enviará al volver la señal");
    } else {
      errorForm(`No se pudo guardar: ${e.message}`);
    }
  } finally {
    boton.disabled = false;
  }
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
});

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && !$("#hoja").hidden) cerrarFormulario();
});

window.addEventListener("online", sincronizar);

(async function iniciar() {
  iniciarMapa();
  seguirMiUbicacion();
  await cargar();
  pintarTodo();
  sincronizar();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
