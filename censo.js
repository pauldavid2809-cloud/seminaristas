/* ==========================================================================
   Censo parroquial · Parroquia "San Benito de Palermo"
   Registro de casas y personas por zona, con ubicación GPS, mapa de las
   zonas pastorales y estadísticas (Supabase + Leaflet; límites en zonas.js)
   (la tabla "sectores" de la base de datos guarda las zonas)
   ========================================================================== */

"use strict";

/* ---------- Configuración y cliente ---------- */

const CENSO_CONFIGURADO =
  typeof SUPABASE_URL === "string" &&
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("PEGAR");

/* window.supabase puede faltar si el CDN no cargó (sin señal): la guía de
   preguntas y el resto de la interfaz deben funcionar igual */
const sb =
  CENSO_CONFIGURADO && window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

/* Leaflet (mapas) también viene de un CDN y puede faltar sin señal */
const HAY_MAPAS = typeof window.L !== "undefined";

const SALUDO_WA =
  "Saludos, le escribimos de la Parroquia San Benito de Palermo 🙏";

const LS_PENDIENTES = "censo_pendientes";
/* Copia del último censo descargado, para abrir la app sin señal */
const LS_INSTANTANEA = "censo_instantanea";
const LS_INSTALAR_OCULTO = "instalar_oculto";

/* Límites de las zonas pastorales (zonas.js, generado desde el KML) */
const GEO_ZONAS = typeof ZONAS_GEO !== "undefined" ? ZONAS_GEO : [];
const GEO_PARROQUIA = typeof PARROQUIA_GEO !== "undefined" ? PARROQUIA_GEO : null;

/* Centro por defecto de los mapas mientras no haya casas con ubicación */
const CENTRO_PARROQUIA = GEO_PARROQUIA ? [GEO_PARROQUIA.lat, GEO_PARROQUIA.lng] : [10.6427, -71.6125];

/* Precisión (en metros) a partir de la cual se deja de afinar el GPS */
const GPS_PRECISION_BUENA = 20;
const GPS_PRECISION_DUDOSA = 50;
const GPS_ESPERA_MS = 15000;

/* ---------- Catálogos ---------- */

const CATEGORIAS = [
  {
    slug: "enfermo",
    etiqueta: "Enfermo",
    emoji: "🤒",
    pregunta: "¿Hay alguna persona enferma o encamada en la casa?",
    mensaje: "la visita del sacerdote para llevarle la comunión",
  },
  {
    slug: "primera_comunion",
    etiqueta: "Primera Comunión",
    emoji: "🍞",
    pregunta:
      "¿Hay niños o jóvenes que no hayan hecho la Primera Comunión y quieran prepararse?",
    mensaje: "la preparación para la Primera Comunión",
  },
  {
    slug: "confirmacion",
    etiqueta: "Confirmación",
    emoji: "🕊️",
    pregunta: "¿Hay jóvenes o adultos que no hayan recibido la Confirmación?",
    mensaje: "la preparación para la Confirmación",
  },
  {
    slug: "vulnerable",
    etiqueta: "Persona vulnerable",
    emoji: "🤝",
    pregunta:
      "¿Vive aquí algún adulto mayor solo, persona con discapacidad o en situación de necesidad?",
    mensaje: "cómo la parroquia puede acompañarle y en qué podemos ayudar",
  },
  {
    slug: "bautizo",
    etiqueta: "Bautizo pendiente",
    emoji: "💧",
    pregunta: "¿Hay niños o adultos sin bautizar que deseen recibir el bautismo?",
    mensaje: "la preparación y la fecha para el Bautismo",
  },
  {
    slug: "matrimonio",
    etiqueta: "Matrimonio por regularizar",
    emoji: "💍",
    pregunta:
      "¿Hay parejas que deseen casarse por la Iglesia o regularizar su unión?",
    mensaje: "regularizar su matrimonio por la Iglesia",
  },
  {
    slug: "uncion",
    etiqueta: "Unción / comunión a enfermos",
    emoji: "⛪",
    pregunta:
      "¿Algún enfermo desea que le lleven la comunión o recibir la unción de los enfermos en casa?",
    mensaje: "que un sacerdote le lleve la comunión o la unción de los enfermos",
  },
];

const ESTADOS = {
  pendiente: { etiqueta: "Pendiente", clase: "est-pendiente" },
  en_proceso: { etiqueta: "En proceso", clase: "est-en-proceso" },
  atendido: { etiqueta: "Atendido", clase: "est-atendido" },
};

/* Respaldo si una zona de la base no está en zonas.js; normalmente cada
   zona usa el color con que se dibujó en el KML */
const COLORES_ZONA = [
  "#2563eb",
  "#d97706",
  "#059669",
  "#db2777",
  "#7c3aed",
  "#0891b2",
  "#dc2626",
  "#65a30d",
];

function catInfo(slug) {
  return CATEGORIAS.find((c) => c.slug === slug) || { etiqueta: slug, emoji: "" };
}

/* ---------- Íconos (trazos SVG) ---------- */

const ICONOS = {
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  tel: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  borrar: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  personaMas: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"/>',
  ruta: '<path d="M3 11 21 3l-8 18-2-8z"/>',
  cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  recargar: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
  descargar: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  gps: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  cargando: '<path d="M12 3a9 9 0 1 0 9 9"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  alerta: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
  mapa: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  imprimir: '<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/>',
  casa: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>',
  persona: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  navegar: '<path d="M12 2 4.5 20.3l.7.7L12 18l6.8 3 .7-.7z"/>',
  libro: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
  wifiNo: '<path d="M2 8.5a15 15 0 0 1 5-3M22 8.5A15 15 0 0 0 12 5M5.5 12a10 10 0 0 1 3-2M18.5 12a10 10 0 0 0-4-2.3M9 15.5a5 5 0 0 1 6 0M12 19.5v.5M3 3l18 18"/>',
};

function icono(nombre, clase = "") {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"${clase ? ` class="${clase}"` : ""}>${ICONOS[nombre]}</svg>`;
}

/* ---------- Utilidades ---------- */

const $ = (sel) => document.querySelector(sel);

function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function plural(n, singular, pluralTxt = singular + "s") {
  return `${n} ${n === 1 ? singular : pluralTxt}`;
}

/* Se escribe 0412-1234567; se guarda listo para WhatsApp: 584121234567 */
function normalizarTelefono(tel) {
  const digitos = String(tel || "").replace(/\D/g, "");
  if (!digitos) return null;
  if (digitos.startsWith("58")) return digitos;
  if (digitos.startsWith("0")) return "58" + digitos.slice(1);
  return "58" + digitos;
}

function formatoLocal(tel) {
  if (!tel) return "";
  const local = tel.startsWith("58") ? "0" + tel.slice(2) : tel;
  return local.length === 11 ? `${local.slice(0, 4)}-${local.slice(4)}` : local;
}

function linkWhatsApp(tel, mensaje) {
  return `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`;
}

/* Arma un saludo de WhatsApp según las categorías de la persona
   (enfermo, primera comunión, etc.), para no mandar un mensaje genérico */
function mensajeWhatsApp(persona) {
  const nombre = persona.nombre.split(" ")[0];
  const motivos = persona.categorias
    .map((slug) => catInfo(slug).mensaje)
    .filter(Boolean);

  if (!motivos.length) return SALUDO_WA;

  const listaMotivos =
    motivos.length === 1
      ? motivos[0]
      : `${motivos.slice(0, -1).join(", ")} y ${motivos[motivos.length - 1]}`;

  return `Saludos, le escribimos de la Parroquia San Benito de Palermo 🙏. Con respecto a ${nombre}, quisiéramos conversar sobre ${listaMotivos}. ¿Podemos coordinar con usted?`;
}

function fechaCorta(iso) {
  return new Date(iso).toLocaleDateString("es-VE", { day: "numeric", month: "short" });
}

function fechaISO(iso) {
  const f = new Date(iso);
  const m = String(f.getMonth() + 1).padStart(2, "0");
  const d = String(f.getDate()).padStart(2, "0");
  return `${f.getFullYear()}-${m}-${d}`;
}

function errorDeRed(error) {
  return !navigator.onLine || /fetch|network|failed/i.test(error?.message || "");
}

/* ---------- Ubicación: utilidades ---------- */

function tieneUbicacion(casa) {
  return casa.lat != null && casa.lng != null;
}

function linkComoLlegar(casa) {
  return `https://www.google.com/maps/dir/?api=1&destination=${casa.lat},${casa.lng}`;
}

function linkVerEnGoogleMaps(casa) {
  return `https://www.google.com/maps?q=${casa.lat},${casa.lng}`;
}

function zonaGeoPorNombre(nombre) {
  return GEO_ZONAS.find((z) => z.nombre === nombre) || null;
}

/* "Zona 1" -> "Zona 1 · San José" (santo o advocación de la zona) */
function zonaConSanto(nombre) {
  const santo = zonaGeoPorNombre(nombre)?.santo;
  return santo ? `${nombre} · ${santo}` : nombre;
}

function colorZona(sectorId) {
  const i = sectoresCenso.findIndex((s) => s.id === sectorId);
  const geo = i >= 0 ? zonaGeoPorNombre(sectoresCenso[i].nombre) : null;
  if (geo) return geo.color;
  return COLORES_ZONA[(i < 0 ? 0 : i) % COLORES_ZONA.length];
}

/* Punto en polígono (trazado de rayos); polígono en [lat, lng] */
function puntoEnPoligono(lat, lng, poligono) {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [yi, xi] = poligono[i];
    const [yj, xj] = poligono[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/* Zona pastoral (de zonas.js) que contiene el punto, o null si cae fuera */
function zonaDelPunto(lat, lng) {
  return GEO_ZONAS.find((z) => puntoEnPoligono(lat, lng, z.poligono)) || null;
}

function sectorPorNombre(nombre) {
  return sectoresCenso.find((s) => s.nombre === nombre) || null;
}

/* Si la casa tiene ubicación y el punto cae en otra zona, devuelve esa zona */
function zonaDiscrepante(casa) {
  if (!tieneUbicacion(casa) || !GEO_ZONAS.length) return null;
  const geo = zonaDelPunto(casa.lat, casa.lng);
  return geo && geo.nombre !== casa.sector ? geo : null;
}

function puntoZona(sectorId) {
  return `<span class="zona-punto" style="background:${colorZona(sectorId)}"></span>`;
}

/* Centro de las casas ya ubicadas: así un mapa nuevo abre en la parroquia */
function centroCenso() {
  const ubicadas = casasCenso.filter(tieneUbicacion);
  if (!ubicadas.length) return null;
  const lat = ubicadas.reduce((s, c) => s + c.lat, 0) / ubicadas.length;
  const lng = ubicadas.reduce((s, c) => s + c.lng, 0) / ubicadas.length;
  return [lat, lng];
}

/* Capas base: calles (OpenStreetMap) y satélite (Esri), para reconocer
   la casa desde arriba en los barrios */
function agregarCapasBase(mapa) {
  const calles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
    /* con CORS el service worker guarda los mosaicos vistos para usarlos sin señal */
    crossOrigin: "",
  });
  const satelite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19, attribution: "© Esri" }
  );
  calles.addTo(mapa);
  L.control.layers({ Calles: calles, Satélite: satelite }, null, { position: "topright" }).addTo(mapa);
}

function iconoParroquia() {
  return L.divIcon({ className: "pin-parroquia", html: "⛪", iconSize: [34, 34], iconAnchor: [17, 17] });
}

/* Dibuja las zonas pastorales y la parroquia. Con interactivas = false los
   toques atraviesan los polígonos (en el formulario se toca el mapa para
   marcar la casa). */
function agregarCapaZonas(mapa, { interactivas = false, resaltar = "" } = {}) {
  const grupo = L.layerGroup().addTo(mapa);
  GEO_ZONAS.forEach((z) => {
    const atenuada = resaltar && resaltar !== z.nombre;
    const poligono = L.polygon(z.poligono, {
      color: z.color,
      weight: atenuada ? 1.5 : 2.5,
      opacity: atenuada ? 0.45 : 0.95,
      fillColor: z.color,
      fillOpacity: atenuada ? 0.05 : 0.16,
      interactive: interactivas,
    }).addTo(grupo);
    if (interactivas) {
      const sector = sectorPorNombre(z.nombre);
      const nCasas = sector ? casasCenso.filter((c) => c.sector_id === sector.id).length : 0;
      poligono.bindPopup(
        `<div class="popup-casa"><strong>${esc(z.nombre)}</strong>${z.santo ? `<p class="popup-santo">${esc(z.santo)}</p>` : ""}<p>${plural(nCasas, "casa censada", "casas censadas")}</p>${
          z.nota ? `<p>${esc(z.nota)}</p>` : ""
        }</div>`
      );
    }
    if (z.etiqueta) {
      L.marker(z.etiqueta, {
        interactive: false,
        icon: L.divIcon({
          className: "etiqueta-zona",
          html: `<span style="border-color:${z.color}">${esc(z.nombre.replace("Zona ", ""))}</span>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      }).addTo(grupo);
    }
  });
  if (GEO_PARROQUIA) {
    L.marker([GEO_PARROQUIA.lat, GEO_PARROQUIA.lng], {
      icon: iconoParroquia(),
      interactive: interactivas,
      zIndexOffset: 500,
    })
      .bindPopup(`<div class="popup-casa"><strong>${esc(GEO_PARROQUIA.nombre)}</strong></div>`)
      .addTo(grupo);
  }
  return grupo;
}

function limitesZonas(nombre = "") {
  const zonas = nombre ? GEO_ZONAS.filter((z) => z.nombre === nombre) : GEO_ZONAS;
  if (!zonas.length) return null;
  return L.latLngBounds(zonas.flatMap((z) => z.poligono));
}

/* ---------- Estado del módulo ---------- */

let sectoresCenso = [];
let casasCenso = []; // cada casa lleva .personas[] y .sector (nombre)
let censoCargado = false;

const filtros = { texto: "", categoria: "", sector: "", estado: "" };

/* Formulario: modo = null | "nueva-casa" | "agregar-persona" | "editar-persona" | "editar-casa" */
let form = { modo: null, casa: null, persona: null };

/* Ubicación que se está editando en el formulario: { lat, lng, precision } */
let formUbic = null;
let gpsWatchId = null;
let gpsTemporizador = null;
let mapaForm = null;
let pinForm = null;
/* true cuando la persona eligió la zona a mano: el GPS ya no la cambia */
let zonaElegidaAMano = false;

let vistaActual = "censo";

/* ---------- Datos ---------- */

async function cargarSectores() {
  const { data, error } = await sb
    .from("sectores")
    .select("*")
    .eq("activo", true)
    .order("nombre");
  if (error) throw error;
  sectoresCenso = data.map((s) => ({ ...s, nombre: s.nombre.trim() }));
}

async function cargarCenso() {
  const [casasRes, personasRes] = await Promise.all([
    sb
      .from("casas")
      .select("*, sectores(nombre)")
      .eq("eliminado", false)
      .order("creado_en", { ascending: false }),
    sb
      .from("personas")
      .select("*")
      .eq("eliminado", false)
      .order("creado_en", { ascending: true }),
  ]);
  if (casasRes.error) throw casasRes.error;
  if (personasRes.error) throw personasRes.error;

  const porCasa = {};
  personasRes.data.forEach((p) => {
    (porCasa[p.casa_id] = porCasa[p.casa_id] || []).push(p);
  });
  casasCenso = casasRes.data.map((c) => ({
    ...c,
    sector: (c.sectores?.nombre || "").trim(),
    personas: porCasa[c.id] || [],
  }));
  censoCargado = true;
}

/* Fecha de la copia guardada que se está mostrando (sin señal), o null */
let usandoInstantanea = null;

function guardarInstantanea() {
  try {
    localStorage.setItem(
      LS_INSTANTANEA,
      JSON.stringify({ fecha: new Date().toISOString(), sectores: sectoresCenso, casas: casasCenso })
    );
  } catch {
    /* sin espacio o almacenamiento bloqueado: solo se pierde el modo sin señal */
  }
}

function cargarInstantanea() {
  try {
    const copia = JSON.parse(localStorage.getItem(LS_INSTANTANEA) || "null");
    if (!copia || !Array.isArray(copia.casas)) return false;
    sectoresCenso = copia.sectores || [];
    casasCenso = copia.casas;
    censoCargado = true;
    usandoInstantanea = copia.fecha;
    return true;
  } catch {
    return false;
  }
}

function mensajeError(e) {
  return errorDeRed(e) || !sb
    ? "Sin señal: este cambio necesita conexión. Las casas nuevas sí se pueden registrar sin señal."
    : e.message;
}

async function asegurarDatos() {
  try {
    if (!sb) throw new Error("Failed to fetch: el censo no está conectado");
    if (!sectoresCenso.length || usandoInstantanea) await cargarSectores();
    await cargarCenso();
    usandoInstantanea = null;
    guardarInstantanea();
  } catch (e) {
    if ((errorDeRed(e) || !sb) && cargarInstantanea()) return;
    throw e;
  } finally {
    renderAvisoOffline();
  }
}

async function refrescarCenso() {
  if (!CENSO_CONFIGURADO) {
    renderSinConfigurar("#censo-lista");
    return;
  }
  if (!sb && !cargarInstantanea()) {
    renderSinConexion("#censo-lista");
    return;
  }
  const cont = $("#censo-lista");
  if (!censoCargado) cont.innerHTML = `<div class="card vacio-card">Cargando el censo…</div>`;
  try {
    await asegurarDatos();
    renderFiltros();
    renderLista();
    sincronizarPendientes();
  } catch (e) {
    cont.innerHTML = `<div class="card vacio-card">⚠️ No se pudo cargar el censo.<span class="texto-suave">${esc(
      e.message
    )}</span><br><button class="btn btn-secundario" data-accion="reintentar-carga">${icono("recargar")} Reintentar</button></div>`;
  }
  renderAvisoOffline();
}

async function refrescarStats() {
  if (!CENSO_CONFIGURADO) {
    renderSinConfigurar("#stats-contenido");
    return;
  }
  if (!sb && !cargarInstantanea()) {
    renderSinConexion("#stats-contenido");
    return;
  }
  const cont = $("#stats-contenido");
  if (!censoCargado) cont.innerHTML = `<div class="card vacio-card">Cargando estadísticas…</div>`;
  try {
    await asegurarDatos();
    renderStats();
  } catch (e) {
    cont.innerHTML = `<div class="card vacio-card">⚠️ No se pudieron cargar las estadísticas.<span class="texto-suave">${esc(
      e.message
    )}</span></div>`;
  }
}

async function refrescarMapa(opciones = {}) {
  renderMiUbicacion();
  if (!CENSO_CONFIGURADO) {
    renderMapa(opciones);
    return;
  }
  try {
    if (!censoCargado || opciones.recargar) await asegurarDatos();
  } catch (e) {
    /* sin datos frescos: se muestra lo que haya en memoria */
  }
  renderMapa(opciones);
}

/* ---------- Exportar a Excel (una hoja por zona) ---------- */

function exportarExcel() {
  if (typeof XLSX === "undefined") {
    alert(
      "No se pudo cargar el generador de Excel. Revisa tu conexión a internet e inténtalo de nuevo."
    );
    return;
  }
  if (!casasCenso.length) {
    alert("Todavía no hay casas registradas en el censo para exportar.");
    return;
  }

  const libro = XLSX.utils.book_new();
  const sectoresOrdenados = [...sectoresCenso].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, "es", { numeric: true })
  );

  sectoresOrdenados.forEach((sector) => {
    const casasSector = casasCenso.filter((c) => c.sector_id === sector.id);
    const filas = [];
    casasSector.forEach((casa) => {
      const base = {
        Zona: zonaConSanto(sector.nombre),
        Familia: casa.familia || "",
        Dirección: casa.direccion,
        Teléfono: formatoLocal(casa.telefono),
        "Notas de la casa": casa.notas || "",
        Latitud: tieneUbicacion(casa) ? casa.lat : "",
        Longitud: tieneUbicacion(casa) ? casa.lng : "",
        "Ubicación (Google Maps)": tieneUbicacion(casa) ? linkVerEnGoogleMaps(casa) : "",
        "Autorización de la familia": casa.consentimiento
          ? `Sí (${new Date(casa.consentimiento_en).toLocaleDateString("es-VE")})`
          : "No registrada",
      };
      if (!casa.personas.length) {
        filas.push({ ...base, Persona: "", Edad: "", Categorías: "", Estado: "", "Notas de la persona": "", "Fecha de registro": "" });
        return;
      }
      casa.personas.forEach((p) => {
        filas.push({
          ...base,
          Persona: p.nombre,
          Edad: p.edad ?? "",
          Categorías: p.categorias.map((c) => catInfo(c).etiqueta).join(", "),
          Estado: (ESTADOS[p.estado] || ESTADOS.pendiente).etiqueta,
          "Notas de la persona": p.notas || "",
          "Fecha de registro": fechaCorta(p.creado_en),
        });
      });
    });
    if (!filas.length) filas.push({ Familia: "(sin casas registradas en esta zona)" });

    const hoja = XLSX.utils.json_to_sheet(filas);
    const nombreHoja = sector.nombre.replace(/[:\\/?*[\]]/g, "").slice(0, 31) || `Zona ${sector.id}`;
    XLSX.utils.book_append_sheet(libro, hoja, nombreHoja);
  });

  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(libro, `censo-san-benito-${fecha}.xlsx`);
}

/* ---------- Cola offline (solo registros nuevos) ---------- */

function pendientes() {
  try {
    return JSON.parse(localStorage.getItem(LS_PENDIENTES) || "[]");
  } catch {
    return [];
  }
}

function guardarPendientes(lista) {
  try {
    localStorage.setItem(LS_PENDIENTES, JSON.stringify(lista));
  } catch {
    /* almacenamiento bloqueado: no hay dónde guardar la cola */
  }
}

async function insertarPaquete(paquete) {
  let casaId = paquete.casa_id;
  if (!casaId) {
    const { data, error } = await sb.from("casas").insert(paquete.casa).select("id").single();
    if (error) throw error;
    casaId = data.id;
    paquete.casa_id = casaId; // si las personas fallan, no duplicar la casa al reintentar
  }
  if (paquete.personas.length) {
    const filas = paquete.personas.map((p) => ({ ...p, casa_id: casaId }));
    const { error } = await sb.from("personas").insert(filas);
    if (error) throw error;
    paquete.personas = [];
  }
}

async function sincronizarPendientes() {
  if (!sb) {
    /* la librería del censo no cargó al abrir sin señal: con señal y sin
       formulario abierto, se recarga la app para conectarse y enviar */
    if (navigator.onLine && !form.modo && (pendientes().length || usandoInstantanea)) location.reload();
    return;
  }
  let cola = pendientes();
  if (!cola.length) return;
  let cambio = false;
  for (const paquete of [...cola]) {
    try {
      await insertarPaquete(paquete);
      cola = cola.filter((p) => p !== paquete);
      cambio = true;
    } catch (e) {
      guardarPendientes(cola);
      renderAvisoOffline();
      return; // sin señal todavía: se reintenta luego
    }
  }
  guardarPendientes(cola);
  renderAvisoOffline();
  if (cambio) {
    await cargarCenso();
    renderLista();
  }
}

function renderAvisoOffline() {
  const cont = $("#censo-aviso-offline");
  const n = pendientes().length;
  const copia = usandoInstantanea
    ? `
    <div class="aviso-offline">
      ${icono("wifiNo")}
      <span><strong>Sin señal.</strong> Estás viendo el censo guardado en este teléfono
      (${new Date(usandoInstantanea).toLocaleString("es-VE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}).
      Las casas nuevas que registres se envían solas al volver la señal.</span>
    </div>`
    : "";
  if (!n) {
    cont.innerHTML = copia;
    return;
  }
  cont.innerHTML = copia + `
    <div class="aviso-offline">
      ${icono("wifiNo")}
      <span>Hay <strong>${n}</strong> registro${n > 1 ? "s" : ""} guardado${n > 1 ? "s" : ""} en este
      teléfono esperando señal.</span>
      <button class="btn btn-secundario btn-chip" data-accion="sincronizar">${icono("recargar")} Enviar ahora</button>
    </div>`;
}

function renderEstadoRed() {
  const el = $("#estado-red");
  const enLinea = navigator.onLine;
  el.classList.toggle("sin-red", !enLinea);
  el.textContent = enLinea ? "En línea" : "Sin señal";
}

/* ---------- Guía de preguntas para la visita ---------- */

function renderGuiaCenso() {
  const cont = $("#censo-guia");
  if (!cont) return;
  cont.innerHTML = `
    <div class="card guia-censo">
      <details>
        <summary><span class="guia-icono">❓</span>Preguntas para llenar el censo</summary>
        <div class="guia-cuerpo">
          <p class="texto-suave">
            Al llegar, preséntate: «Buenas, venimos de la Parroquia San Benito
            de Palermo y estamos visitando las casas de la zona». Luego pregunta:
          </p>

          <h4>📍 Ubicación</h4>
          <ul class="lista">
            <li>Párate frente a la puerta de la casa y toca <strong>Usar mi GPS</strong>. Si el punto no quedó exacto, arrastra el pin en el mapa.</li>
          </ul>

          <h4>🏠 La casa</h4>
          <ul class="lista">
            <li><strong>Autorización:</strong> ¿Nos permiten guardar estos datos para que la parroquia pueda acompañarlos? (sin su permiso no se registra la casa)</li>
            <li>¿Cuál es el apellido de la familia?</li>
            <li>¿Cuál es la dirección de la casa o un punto de referencia?</li>
            <li>¿Nos regala un número de teléfono (WhatsApp si tiene) para que la parroquia pueda contactarlos?</li>
          </ul>

          <h4>👤 Por cada persona a registrar</h4>
          <ul class="lista">
            <li>¿Cuál es su nombre y apellido?</li>
            <li>¿Qué edad tiene?</li>
          </ul>

          <h4>✅ Para marcar sus categorías</h4>
          <ul class="lista">
            ${CATEGORIAS.map(
              (c) => `<li>${c.emoji} <strong>${esc(c.etiqueta)}</strong>: ${esc(c.pregunta)}</li>`
            ).join("")}
          </ul>

          <h4>📝 Para las notas</h4>
          <ul class="lista">
            <li>¿Algo más que la parroquia deba saber para acompañarlos? (horarios en que se les consigue, situación particular de la persona…)</li>
            <li>Antes de despedirte: ¿podemos hacer una breve oración con ustedes?</li>
          </ul>
        </div>
      </details>
    </div>`;
}

/* ---------- Formulario (hoja deslizable) ---------- */

function opcionesSectores(seleccionado) {
  return sectoresCenso
    .map(
      (s) =>
        `<option value="${s.id}" ${s.id === seleccionado ? "selected" : ""}>${esc(zonaConSanto(s.nombre))}</option>`
    )
    .join("");
}

function chipsCategorias(activas = []) {
  return CATEGORIAS.map(
    (c) => `
      <button type="button" class="cat-chip ${activas.includes(c.slug) ? "activo" : ""}"
              data-accion="toggle-cat" data-cat="${c.slug}">
        ${c.emoji} ${esc(c.etiqueta)}
      </button>`
  ).join("");
}

function bloquePersona(p = {}, quitable = false) {
  return `
    <div class="form-seccion form-persona">
      <div class="form-persona-cab">
        <span class="form-seccion-titulo">${icono("persona")} Persona</span>
        ${quitable ? `<button type="button" class="btn-quitar" data-accion="quitar-bloque">Quitar</button>` : ""}
      </div>
      <div class="form-fila">
        <div class="form-campo" style="flex:3">
          <label>Nombre y apellido *</label>
          <input type="text" class="fp-nombre" value="${esc(p.nombre || "")}" placeholder="María Pérez" autocomplete="off" />
        </div>
        <div class="form-campo" style="flex:1">
          <label>Edad</label>
          <input type="number" class="fp-edad" inputmode="numeric" min="0" max="120" value="${p.edad ?? ""}" placeholder="10" />
        </div>
      </div>
      <div class="form-campo">
        <label>Categorías * <span class="texto-suave" style="display:inline">(puede marcar varias)</span></label>
        <div class="cat-chips">${chipsCategorias(p.categorias || [])}</div>
      </div>
      <div class="form-campo">
        <label>Notas</label>
        <textarea class="fp-notas" rows="2" placeholder="Detalles útiles para el seguimiento">${esc(p.notas || "")}</textarea>
      </div>
    </div>`;
}

function seccionUbicacion() {
  return `
    <div class="form-seccion">
      <span class="form-seccion-titulo">${icono("pin")} Ubicación de la casa</span>
      <div id="ubic-estado" class="ubic-estado"></div>
      <div id="ubic-zona" class="ubic-zona" hidden></div>
      <div id="form-mapa" class="form-mapa"></div>
      <div class="ubic-botones">
        <button type="button" class="btn btn-suave" data-accion="capturar-ubicacion">${icono("gps")} Usar mi GPS</button>
        <button type="button" class="btn btn-secundario" data-accion="quitar-ubicacion">Quitar</button>
      </div>
      <p class="ayuda">Párate frente a la puerta. Si el punto no quedó exacto, arrastra el pin o toca el mapa donde está la casa.</p>
    </div>`;
}

function camposCasa(c = {}) {
  return `
    ${seccionUbicacion()}
    <div class="form-seccion">
      <span class="form-seccion-titulo">${icono("casa")} La casa</span>
      <div class="form-fila">
        <div class="form-campo">
          <label>Zona *</label>
          <select class="fc-sector">
            <option value="">Elegir</option>
            ${opcionesSectores(c.sector_id)}
          </select>
        </div>
        <div class="form-campo">
          <label>Familia</label>
          <input type="text" class="fc-familia" value="${esc(c.familia || "")}" placeholder="Familia Pérez" autocomplete="off" />
        </div>
      </div>
      <div class="form-campo">
        <label>Dirección *</label>
        <input type="text" class="fc-direccion" value="${esc(c.direccion || "")}" placeholder="Calle, casa, punto de referencia" autocomplete="off" />
      </div>
      <div class="form-campo">
        <label>Teléfono de la casa</label>
        <input type="tel" class="fc-telefono" inputmode="tel" value="${esc(formatoLocal(c.telefono))}" placeholder="0412-1234567" />
      </div>
      <div class="form-campo">
        <label>Notas de la casa</label>
        <textarea class="fc-notas" rows="2" placeholder="Observaciones de la visita">${esc(c.notas || "")}</textarea>
      </div>
    </div>`;
}

function bloqueConsentimiento(c = {}) {
  return `
    <label class="consentimiento">
      <input type="checkbox" class="fc-consentimiento" ${c.consentimiento ? "checked" : ""} />
      <span><strong>La familia autoriza</strong> que la Parroquia San Benito de Palermo guarde estos datos
      para su acompañamiento pastoral. *</span>
    </label>`;
}

function renderFormulario() {
  const hoja = $("#hoja");
  const panel = $("#censo-form");

  if (!form.modo) {
    detenerGPS();
    destruirMapaForm();
    hoja.hidden = true;
    panel.innerHTML = "";
    document.body.classList.remove("hoja-abierta");
    return;
  }

  let titulo = "";
  let cuerpo = "";
  const conCasa = form.modo === "nueva-casa" || form.modo === "editar-casa";

  if (form.modo === "nueva-casa") {
    titulo = "Registrar casa";
    cuerpo = `
      ${camposCasa()}
      <div id="form-personas">${bloquePersona()}</div>
      <button type="button" class="btn btn-suave btn-bloque" data-accion="agregar-bloque">
        ${icono("personaMas")} Agregar otra persona de esta casa
      </button>
      ${bloqueConsentimiento()}`;
  } else if (form.modo === "agregar-persona") {
    titulo = "Agregar persona";
    cuerpo = `
      <p class="form-contexto">${puntoZona(form.casa.sector_id)} ${esc(form.casa.familia || form.casa.direccion)} · ${esc(zonaConSanto(form.casa.sector))}</p>
      <div id="form-personas">${bloquePersona()}</div>
      <button type="button" class="btn btn-suave btn-bloque" data-accion="agregar-bloque">
        ${icono("personaMas")} Agregar otra persona de esta casa
      </button>`;
  } else if (form.modo === "editar-persona") {
    titulo = `Editar a ${esc(form.persona.nombre)}`;
    cuerpo = `<div id="form-personas">${bloquePersona(form.persona)}</div>`;
  } else if (form.modo === "editar-casa") {
    titulo = "Editar casa";
    cuerpo = `${camposCasa(form.casa)}${bloqueConsentimiento(form.casa)}`;
  }

  panel.innerHTML = `
    <div class="hoja-cab">
      <h2>${titulo}</h2>
      <button type="button" class="btn btn-icono" data-accion="cerrar-form" aria-label="Cerrar">${icono("cerrar")}</button>
    </div>
    <div class="hoja-cuerpo">
      ${cuerpo}
      <p class="form-error" hidden></p>
    </div>
    <div class="hoja-pie">
      <button type="button" class="btn btn-secundario" data-accion="cerrar-form">Cancelar</button>
      <button type="button" class="btn btn-principal" data-accion="guardar-form">${icono("check")} Guardar</button>
    </div>`;

  hoja.hidden = false;
  document.body.classList.add("hoja-abierta");

  if (conCasa) {
    formUbic =
      form.modo === "editar-casa" && tieneUbicacion(form.casa)
        ? { lat: form.casa.lat, lng: form.casa.lng, precision: form.casa.precision_m }
        : null;
    zonaElegidaAMano = form.modo === "editar-casa";
    pintarEstadoUbic();
    pintarZonaDetectada();
    /* el mapa se crea cuando la hoja ya tiene su tamaño final */
    setTimeout(iniciarMapaForm, 60);
    if (form.modo === "nueva-casa") capturarUbicacion();
  }
}

function leerBloquesPersona() {
  return [...document.querySelectorAll("#censo-form .form-persona")].map((b) => ({
    nombre: b.querySelector(".fp-nombre").value.trim(),
    edad: b.querySelector(".fp-edad").value ? Number(b.querySelector(".fp-edad").value) : null,
    categorias: [...b.querySelectorAll(".cat-chip.activo")].map((ch) => ch.dataset.cat),
    notas: b.querySelector(".fp-notas").value.trim() || null,
  }));
}

function leerCamposCasa() {
  const f = $("#censo-form");
  return {
    sector_id: Number(f.querySelector(".fc-sector").value) || null,
    familia: f.querySelector(".fc-familia").value.trim() || null,
    direccion: f.querySelector(".fc-direccion").value.trim(),
    telefono: normalizarTelefono(f.querySelector(".fc-telefono").value),
    notas: f.querySelector(".fc-notas").value.trim() || null,
    lat: formUbic ? formUbic.lat : null,
    lng: formUbic ? formUbic.lng : null,
    precision_m: formUbic && formUbic.precision != null ? Math.round(formUbic.precision) : null,
    ...leerConsentimiento(),
  };
}

/* Conserva la fecha original si la casa ya tenía la autorización */
function leerConsentimiento() {
  const marcado = Boolean($("#censo-form .fc-consentimiento")?.checked);
  const previa = form.modo === "editar-casa" && form.casa.consentimiento ? form.casa.consentimiento_en : null;
  return {
    consentimiento: marcado,
    consentimiento_en: marcado ? previa || new Date().toISOString() : null,
  };
}

const ERROR_CONSENTIMIENTO =
  "Pide a la familia su autorización y marca la casilla antes de guardar.";

function mostrarErrorForm(msg) {
  const el = $("#censo-form .form-error");
  el.textContent = msg;
  el.hidden = false;
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function cerrarFormulario() {
  form = { modo: null };
  formUbic = null;
  renderFormulario();
}

async function guardarFormulario() {
  const boton = $('[data-accion="guardar-form"]');
  boton.disabled = true;
  try {
    if (form.modo === "nueva-casa") {
      const casa = leerCamposCasa();
      const personas = leerBloquesPersona();
      if (!casa.sector_id) return mostrarErrorForm("Elige la zona.");
      if (!casa.direccion) return mostrarErrorForm("Escribe la dirección de la casa.");
      if (!casa.consentimiento) return mostrarErrorForm(ERROR_CONSENTIMIENTO);
      for (const p of personas) {
        if (!p.nombre) return mostrarErrorForm("Cada persona necesita nombre.");
        if (!p.categorias.length)
          return mostrarErrorForm(`Marca al menos una categoría para ${p.nombre}.`);
      }
      const paquete = { casa, personas };
      try {
        if (!sb) throw new Error("Failed to fetch: el censo no está conectado");
        await insertarPaquete(paquete);
      } catch (e) {
        if (errorDeRed(e) || !sb) {
          guardarPendientes([...pendientes(), paquete]);
          cerrarFormulario();
          renderAvisoOffline();
          return;
        }
        throw e;
      }
    } else if (form.modo === "agregar-persona") {
      const personas = leerBloquesPersona();
      for (const p of personas) {
        if (!p.nombre) return mostrarErrorForm("Cada persona necesita nombre.");
        if (!p.categorias.length)
          return mostrarErrorForm(`Marca al menos una categoría para ${p.nombre}.`);
      }
      const filas = personas.map((p) => ({ ...p, casa_id: form.casa.id }));
      const { error } = await sb.from("personas").insert(filas);
      if (error) throw error;
    } else if (form.modo === "editar-persona") {
      const [p] = leerBloquesPersona();
      if (!p.nombre) return mostrarErrorForm("La persona necesita nombre.");
      if (!p.categorias.length) return mostrarErrorForm("Marca al menos una categoría.");
      const { error } = await sb.from("personas").update(p).eq("id", form.persona.id);
      if (error) throw error;
    } else if (form.modo === "editar-casa") {
      const casa = leerCamposCasa();
      if (!casa.sector_id) return mostrarErrorForm("Elige la zona.");
      if (!casa.direccion) return mostrarErrorForm("Escribe la dirección de la casa.");
      if (!casa.consentimiento) return mostrarErrorForm(ERROR_CONSENTIMIENTO);
      const { error } = await sb.from("casas").update(casa).eq("id", form.casa.id);
      if (error) throw error;
    }
    cerrarFormulario();
    await cargarCenso();
    renderLista();
    if (vistaActual === "mapa") renderMapa();
  } catch (e) {
    mostrarErrorForm(`No se pudo guardar. ${mensajeError(e)}`);
  } finally {
    const b = $('[data-accion="guardar-form"]');
    if (b) b.disabled = false;
  }
}

/* ---------- Ubicación en el formulario (GPS + mapa con pin) ---------- */

function pintarEstadoUbic(tipo, texto) {
  const el = $("#ubic-estado");
  if (!el) return;
  if (!tipo) {
    if (formUbic) {
      tipo = "ok";
      texto =
        formUbic.precision != null
          ? `Ubicación guardada · precisión ±${Math.round(formUbic.precision)} m`
          : "Ubicación marcada en el mapa";
    } else {
      tipo = "";
      texto = "Sin ubicación todavía";
    }
  }
  const iconos = { ok: "check", buscando: "cargando", error: "alerta", aviso: "alerta" };
  el.className = `ubic-estado ${tipo}`;
  el.innerHTML = `${icono(iconos[tipo] || "pin", tipo === "buscando" ? "girando" : "")}<span>${texto}</span>`;
  pintarZonaDetectada();
}

/* Según el punto marcado: elige la zona sola (si no se eligió a mano) o
   avisa si el punto cae en otra zona o fuera de las 8 zonas */
function pintarZonaDetectada() {
  const el = $("#ubic-zona");
  if (!el) return;
  if (!formUbic || !GEO_ZONAS.length) {
    el.hidden = true;
    return;
  }
  const select = $("#censo-form .fc-sector");
  const geo = zonaDelPunto(formUbic.lat, formUbic.lng);
  el.hidden = false;

  if (!geo) {
    el.className = "ubic-zona aviso";
    el.innerHTML = `${icono("alerta")}<span>El punto está fuera de las 8 zonas de la parroquia. Revisa el pin.</span>`;
    return;
  }
  const sector = sectorPorNombre(geo.nombre);
  if (sector && select && (!zonaElegidaAMano || !select.value)) {
    select.value = String(sector.id);
    zonaElegidaAMano = false;
  }
  const elegido = select ? sectoresCenso.find((s) => String(s.id) === select.value) : null;
  if (elegido && elegido.nombre !== geo.nombre) {
    el.className = "ubic-zona aviso";
    el.innerHTML = `${icono("alerta")}<span>El punto cae en <strong>${esc(zonaConSanto(geo.nombre))}</strong>, pero elegiste ${esc(
      elegido.nombre
    )}.</span><button type="button" class="btn btn-secundario btn-chip" data-accion="usar-zona-detectada">Usar ${esc(
      geo.nombre
    )}</button>`;
  } else {
    el.className = "ubic-zona ok";
    el.innerHTML = `<span class="zona-punto" style="background:${geo.color}"></span><span>Zona detectada por el GPS: <strong>${esc(
      zonaConSanto(geo.nombre)
    )}</strong></span>`;
  }
}

function mensajeErrorGPS(err) {
  if (err && err.code === 1)
    return "Permiso de ubicación denegado. Actívalo en el navegador o marca la casa tocando el mapa.";
  if (err && err.code === 3) return "El GPS tardó demasiado. Intenta de nuevo al aire libre o toca el mapa.";
  return "No se pudo obtener la ubicación. Intenta de nuevo o toca el mapa donde está la casa.";
}

function detenerGPS() {
  if (gpsWatchId != null && navigator.geolocation) navigator.geolocation.clearWatch(gpsWatchId);
  gpsWatchId = null;
  clearTimeout(gpsTemporizador);
  gpsTemporizador = null;
}

/* Escucha el GPS unos segundos y se queda con la lectura más precisa */
function capturarUbicacion() {
  if (!("geolocation" in navigator)) {
    pintarEstadoUbic("error", "Este teléfono no permite obtener la ubicación. Marca la casa tocando el mapa.");
    return;
  }
  detenerGPS();
  pintarEstadoUbic("buscando", "Buscando señal GPS…");
  let mejor = null;

  const terminar = () => {
    detenerGPS();
    if (!mejor) return;
    if (mejor.precision > GPS_PRECISION_DUDOSA) {
      pintarEstadoUbic(
        "aviso",
        `Precisión baja (±${Math.round(mejor.precision)} m). Revisa el pin y muévelo si hace falta.`
      );
    } else {
      pintarEstadoUbic();
    }
  };

  gpsTemporizador = setTimeout(() => {
    if (!mejor) {
      detenerGPS();
      pintarEstadoUbic("error", mensajeErrorGPS({ code: 3 }));
    } else {
      terminar();
    }
  }, GPS_ESPERA_MS);

  gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const lectura = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        precision: pos.coords.accuracy,
      };
      if (!mejor || lectura.precision < mejor.precision) {
        mejor = lectura;
        ponerUbicForm(lectura, true);
        pintarEstadoUbic("buscando", `Afinando ubicación… ±${Math.round(lectura.precision)} m`);
      }
      if (lectura.precision <= GPS_PRECISION_BUENA) terminar();
    },
    (err) => {
      detenerGPS();
      if (mejor) terminar();
      else pintarEstadoUbic("error", mensajeErrorGPS(err));
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: GPS_ESPERA_MS }
  );
}

function ponerUbicForm(ubic, centrar) {
  formUbic = ubic;
  if (!mapaForm) return;
  const punto = [ubic.lat, ubic.lng];
  if (!pinForm) {
    pinForm = L.marker(punto, { draggable: true, autoPan: true, icon: iconoPinCasa() }).addTo(mapaForm);
    pinForm.on("dragend", () => {
      detenerGPS();
      const p = pinForm.getLatLng();
      formUbic = { lat: p.lat, lng: p.lng, precision: null };
      pintarEstadoUbic();
    });
  } else {
    pinForm.setLatLng(punto);
  }
  if (centrar) mapaForm.setView(punto, Math.max(mapaForm.getZoom(), 18));
}

function quitarUbicacion() {
  detenerGPS();
  formUbic = null;
  if (pinForm && mapaForm) mapaForm.removeLayer(pinForm);
  pinForm = null;
  pintarEstadoUbic();
}

function iniciarMapaForm() {
  const el = $("#form-mapa");
  if (!el || mapaForm) return;
  if (!HAY_MAPAS) {
    el.innerHTML = `<div class="mapa-fallback">El mapa necesita internet. Igual se guardan las coordenadas del GPS.</div>`;
    return;
  }
  const centro = formUbic ? [formUbic.lat, formUbic.lng] : centroCenso() || CENTRO_PARROQUIA;
  mapaForm = L.map(el, { zoomControl: true }).setView(centro, formUbic ? 18 : 16);
  agregarCapasBase(mapaForm);
  agregarCapaZonas(mapaForm);
  mapaForm.on("click", (ev) => {
    detenerGPS();
    ponerUbicForm({ lat: ev.latlng.lat, lng: ev.latlng.lng, precision: null }, false);
    pintarEstadoUbic();
  });
  if (formUbic) ponerUbicForm(formUbic, true);
  setTimeout(() => mapaForm && mapaForm.invalidateSize(), 250);
}

function iconoPinCasa() {
  return L.divIcon({
    className: "pin-casa",
    html: '<svg viewBox="0 0 24 24"><path d="M12 22s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12z"/><circle cx="12" cy="10" r="2.6"/></svg>',
    iconSize: [36, 36],
    iconAnchor: [18, 34],
  });
}

function destruirMapaForm() {
  if (mapaForm) mapaForm.remove();
  mapaForm = null;
  pinForm = null;
}

/* ---------- Resumen, filtros y lista ---------- */

function renderResumen() {
  const cont = $("#censo-resumen");
  const personas = casasCenso.flatMap((c) => c.personas);
  const pendientesN = personas.filter((p) => p.estado === "pendiente").length;
  cont.innerHTML = `
    <div class="kpis">
      <div class="kpi destacado"><span class="kpi-valor">${casasCenso.length}</span><span class="kpi-etiqueta">Casas</span></div>
      <div class="kpi"><span class="kpi-valor">${personas.length}</span><span class="kpi-etiqueta">Personas</span></div>
      <div class="kpi"><span class="kpi-valor">${pendientesN}</span><span class="kpi-etiqueta">Pendientes</span></div>
    </div>`;
}

function renderFiltros() {
  const cont = $("#censo-filtros");
  cont.innerHTML = `
    <div class="censo-filtros">
      <div class="buscador">
        ${icono("buscar")}
        <input type="search" id="filtro-texto" placeholder="Buscar nombre, dirección, familia…"
               value="${esc(filtros.texto)}" />
      </div>
      <div class="filtro-chips">
        <button class="cat-chip ${!filtros.categoria ? "activo" : ""}" data-accion="filtro-cat" data-cat="">Todas</button>
        ${CATEGORIAS.map(
          (c) => `
          <button class="cat-chip ${filtros.categoria === c.slug ? "activo" : ""}"
                  data-accion="filtro-cat" data-cat="${c.slug}">${c.emoji} ${esc(c.etiqueta)}</button>`
        ).join("")}
      </div>
      <div class="filtro-fila">
        <select id="filtro-sector" aria-label="Zona">
          <option value="">Todas las zonas</option>
          ${sectoresCenso
            .map(
              (s) =>
                `<option value="${s.id}" ${String(s.id) === filtros.sector ? "selected" : ""}>${esc(zonaConSanto(s.nombre))}</option>`
            )
            .join("")}
        </select>
        <select id="filtro-estado" aria-label="Estado">
          <option value="">Todos los estados</option>
          ${Object.entries(ESTADOS)
            .map(
              ([k, v]) =>
                `<option value="${k}" ${k === filtros.estado ? "selected" : ""}>${v.etiqueta}</option>`
            )
            .join("")}
        </select>
        <button class="btn btn-icono" data-accion="recargar" title="Recargar" aria-label="Recargar">${icono("recargar")}</button>
        <button class="btn btn-icono" data-accion="exportar-excel" title="Exportar Excel por zona" aria-label="Exportar Excel por zona">${icono("descargar")}</button>
      </div>
    </div>`;
}

function personaCoincide(p) {
  if (filtros.categoria && !p.categorias.includes(filtros.categoria)) return false;
  if (filtros.estado && p.estado !== filtros.estado) return false;
  return true;
}

function casasFiltradas() {
  const texto = filtros.texto.toLowerCase();
  return casasCenso
    .filter((c) => {
      if (filtros.sector && String(c.sector_id) !== filtros.sector) return false;
      if ((filtros.categoria || filtros.estado) && !c.personas.some(personaCoincide)) return false;
      if (texto) {
        const enCasa = [c.direccion, c.familia, c.sector, formatoLocal(c.telefono)]
          .join(" ")
          .toLowerCase()
          .includes(texto);
        const enPersonas = c.personas.some((p) => p.nombre.toLowerCase().includes(texto));
        if (!enCasa && !enPersonas) return false;
      }
      return true;
    })
    .map((c) => ({
      ...c,
      personasVisibles:
        filtros.categoria || filtros.estado ? c.personas.filter(personaCoincide) : c.personas,
    }));
}

function badgesCategorias(slugs) {
  return slugs
    .map((s) => {
      const c = catInfo(s);
      return `<span class="badge cat">${c.emoji} ${esc(c.etiqueta)}</span>`;
    })
    .join("");
}

function cardPersona(p, casa) {
  const est = ESTADOS[p.estado] || ESTADOS.pendiente;
  return `
    <div class="persona-censo">
      <div class="persona-censo-cab">
        <span class="persona-nombre">${esc(p.nombre)}${p.edad != null ? ` <span class="persona-edad">· ${p.edad} años</span>` : ""}</span>
        <select class="select-estado ${est.clase}" data-accion="cambiar-estado" data-id="${p.id}" aria-label="Estado de seguimiento">
          ${Object.entries(ESTADOS)
            .map(
              ([k, v]) => `<option value="${k}" ${k === p.estado ? "selected" : ""}>${v.etiqueta}</option>`
            )
            .join("")}
        </select>
      </div>
      <div class="persona-censo-badges">${badgesCategorias(p.categorias)}</div>
      ${p.notas ? `<p class="persona-nota">📝 ${esc(p.notas)}</p>` : ""}
      <div class="persona-censo-pie">
        ${
          casa.telefono
            ? `<a class="btn btn-whatsapp" href="${linkWhatsApp(casa.telefono, mensajeWhatsApp(p))}" target="_blank" rel="noopener">WhatsApp</a>`
            : ""
        }
        <button class="btn btn-icono" data-accion="editar-persona" data-id="${p.id}" aria-label="Editar persona">${icono("editar")}</button>
        <button class="btn btn-icono peligro" data-accion="eliminar-persona" data-id="${p.id}" aria-label="Quitar persona">${icono("borrar")}</button>
        <span class="registro-pie">${fechaCorta(p.creado_en)}</span>
      </div>
    </div>`;
}

function accionesUbicacion(c) {
  if (tieneUbicacion(c)) {
    return `
      <a class="btn btn-principal btn-chip" href="${linkComoLlegar(c)}" target="_blank" rel="noopener">${icono("ruta")} Cómo llegar</a>
      <button class="btn btn-icono" data-accion="ver-en-mapa" data-id="${c.id}" title="Ver en mapa" aria-label="Ver en mapa">${icono("mapa")}</button>`;
  }
  return `<button class="btn btn-secundario btn-chip ubic-falta" data-accion="editar-casa" data-id="${c.id}">${icono("pin")} Agregar ubicación</button>`;
}

function botonEnviarDiptico(c) {
  const d = typeof dipticoActual === "function" ? dipticoActual() : null;
  if (!d || !c.telefono) return "";
  return `<a class="btn btn-icono btn-diptico" href="${linkWhatsAppDiptico(d, c.telefono, saludoFamilia(c.familia))}"
             target="_blank" rel="noopener" title="Enviar el díptico «${esc(d.titulo)}» por WhatsApp"
             aria-label="Enviar díptico por WhatsApp">${icono("libro")}</a>`;
}

function cardCasa(c) {
  return `
    <div class="card casa-card">
      <div class="casa-cab">
        <div class="casa-avatar" style="background:${colorZona(c.sector_id)}1a">🏠</div>
        <div class="casa-info">
          <div class="casa-titulo">
            <strong>${esc(c.familia || "Casa")}</strong>
            <span class="zona-pill">${puntoZona(c.sector_id)}${esc(zonaConSanto(c.sector))}</span>
          </div>
          <div class="casa-linea">${icono("pin")}<span>${esc(c.direccion)}</span></div>
          ${
            c.telefono
              ? `<div class="casa-linea">${icono("tel")}<a href="tel:${esc(c.telefono)}">${esc(formatoLocal(c.telefono))}</a></div>`
              : ""
          }
          ${c.notas ? `<div class="casa-linea">📝 <span>${esc(c.notas)}</span></div>` : ""}
          ${
            c.consentimiento
              ? ""
              : `<div class="casa-linea ubic-falta">${icono("alerta")}<span>Falta la autorización de la familia (edita la casa para registrarla)</span></div>`
          }
          ${(() => {
            const otra = zonaDiscrepante(c);
            return otra
              ? `<div class="casa-linea ubic-falta">${icono("alerta")}<span>El punto del mapa cae en ${esc(zonaConSanto(otra.nombre))}</span></div>`
              : "";
          })()}
        </div>
      </div>
      <div class="casa-acciones">
        ${accionesUbicacion(c)}
        <span class="espaciador"></span>
        ${botonEnviarDiptico(c)}
        <button class="btn btn-icono" data-accion="persona-en-casa" data-id="${c.id}" title="Agregar persona" aria-label="Agregar persona">${icono("personaMas")}</button>
        <button class="btn btn-icono" data-accion="editar-casa" data-id="${c.id}" title="Editar casa" aria-label="Editar casa">${icono("editar")}</button>
        <button class="btn btn-icono peligro" data-accion="eliminar-casa" data-id="${c.id}" title="Quitar casa" aria-label="Quitar casa">${icono("borrar")}</button>
      </div>
      ${
        c.personasVisibles.length
          ? `<div class="personas-lista">${c.personasVisibles.map((p) => cardPersona(p, c)).join("")}${
              c.personasVisibles.length < c.personas.length
                ? `<p class="mas-fuera-filtro">${plural(c.personas.length - c.personasVisibles.length, "persona más", "personas más")} en esta casa fuera del filtro</p>`
                : ""
            }</div>`
          : ""
      }
    </div>`;
}

function renderLista() {
  renderResumen();
  const cont = $("#censo-lista");
  const lista = casasFiltradas();
  const totalPersonas = lista.reduce((n, c) => n + c.personasVisibles.length, 0);

  if (!casasCenso.length) {
    cont.innerHTML = `
      <div class="card vacio-card">
        <span class="vacio-icono">🏡</span>
        <strong>Aún no hay casas registradas</strong>
        <span class="texto-suave">Toca <strong>Registrar casa</strong> para comenzar el censo.</span>
      </div>`;
    return;
  }

  const hayFiltros = filtros.texto || filtros.categoria || filtros.sector || filtros.estado;
  cont.innerHTML = `
    <p class="censo-contador">${plural(lista.length, "casa")} · ${plural(totalPersonas, "persona")}${hayFiltros ? " (con filtros)" : ""}</p>
    ${lista.map(cardCasa).join("") || `<div class="card vacio-card">Ninguna casa coincide con los filtros.</div>`}`;
}

/* ---------- Acciones sobre registros ---------- */

function buscarPersona(id) {
  for (const c of casasCenso) {
    const p = c.personas.find((x) => x.id === id);
    if (p) return { persona: p, casa: c };
  }
  return {};
}

async function cambiarEstado(id, estado) {
  const { error } = sb
    ? await sb.from("personas").update({ estado }).eq("id", id)
    : { error: new Error("Failed to fetch") };
  if (error) {
    alert(`No se pudo cambiar el estado. ${mensajeError(error)}`);
    renderLista();
    return;
  }
  const { persona } = buscarPersona(id);
  if (persona) persona.estado = estado;
  renderLista();
}

async function eliminarPersona(id) {
  const { persona } = buscarPersona(id);
  if (!persona) return;
  if (!sb) return alert(mensajeError(new Error("Failed to fetch")));
  if (!confirm(`¿Quitar a ${persona.nombre} del censo?`)) return;
  const { error } = await sb.from("personas").update({ eliminado: true }).eq("id", id);
  if (error) {
    alert(`No se pudo eliminar. ${mensajeError(error)}`);
    return;
  }
  await cargarCenso();
  renderLista();
}

async function eliminarCasa(id) {
  const casa = casasCenso.find((c) => c.id === id);
  if (!casa) return;
  if (!sb) return alert(mensajeError(new Error("Failed to fetch")));
  const n = casa.personas.length;
  if (
    !confirm(
      `¿Quitar esta casa (${casa.familia || casa.direccion})${n ? ` y sus ${n} persona(s)` : ""} del censo?`
    )
  )
    return;
  const r1 = await sb.from("personas").update({ eliminado: true }).eq("casa_id", id);
  const r2 = await sb.from("casas").update({ eliminado: true }).eq("id", id);
  if (r1.error || r2.error) {
    alert(`No se pudo eliminar. ${mensajeError(r1.error || r2.error)}`);
    return;
  }
  await cargarCenso();
  renderLista();
}

/* ---------- Mapa general ---------- */

let mapaGeneral = null;
let capaCasas = null;
let marcadoresCasa = {};
let mapaZona = "";
let capaZonasGeneral = null;

function popupCasa(c) {
  const emojis = [...new Set(c.personas.flatMap((p) => p.categorias))]
    .map((s) => catInfo(s).emoji)
    .join(" ");
  return `
    <div class="popup-casa">
      <strong>${esc(c.familia || "Casa")}</strong>
      <p>${esc(zonaConSanto(c.sector))} · ${esc(c.direccion)}</p>
      <p>${plural(c.personas.length, "persona")}${emojis ? ` · ${emojis}` : ""}</p>
      <a class="btn btn-principal" href="${linkComoLlegar(c)}" target="_blank" rel="noopener">Cómo llegar</a>
    </div>`;
}

function renderMapaBarra() {
  $("#mapa-barra").innerHTML = `
    <div class="mapa-barra">
      <select id="mapa-filtro-zona" class="selector-zona" aria-label="Zona">
        <option value="">Todas las zonas</option>
        ${sectoresCenso
          .map(
            (s) =>
              `<option value="${s.id}" ${String(s.id) === mapaZona ? "selected" : ""}>${esc(zonaConSanto(s.nombre))}</option>`
          )
          .join("")}
      </select>
      <button class="btn btn-icono" data-accion="recargar-mapa" title="Recargar" aria-label="Recargar">${icono("recargar")}</button>
    </div>`;
}

function renderMapa({ enfocar, vistaInicial } = {}) {
  if (enfocar) mapaZona = "";
  mapaEnfocandoCasa = Boolean(enfocar);
  renderMapaBarra();

  const casas = mapaZona ? casasCenso.filter((c) => String(c.sector_id) === mapaZona) : casasCenso;
  const ubicadas = casas.filter(tieneUbicacion);
  const sinUbic = casas.length - ubicadas.length;

  const zonasLeyenda = mapaZona ? sectoresCenso.filter((s) => String(s.id) === mapaZona) : sectoresCenso;
  $("#mapa-pie").innerHTML = `
    <div class="mapa-pie">
      ${zonasLeyenda.map((s) => `<span class="leyenda">${puntoZona(s.id)}${esc(zonaConSanto(s.nombre))}</span>`).join("")}
      <span class="mapa-sin-ubic">${plural(ubicadas.length, "casa")} en el mapa${
        sinUbic ? ` · ${plural(sinUbic, "casa")} sin ubicación (agrégala desde la tarjeta de la casa)` : ""
      }</span>
    </div>`;

  const el = $("#mapa-general");
  if (!HAY_MAPAS) {
    el.innerHTML = `<div class="mapa-fallback">El mapa necesita internet para cargar. Revisa la conexión y recarga la página.</div>`;
    return;
  }

  if (!mapaGeneral) {
    mapaGeneral = L.map(el, { zoomControl: true }).setView(CENTRO_PARROQUIA, 16);
    agregarCapasBase(mapaGeneral);
    /* las casas van por encima de los números de zona y de la parroquia,
       y tu posición por encima de todo */
    mapaGeneral.createPane("casas").style.zIndex = 650;
    mapaGeneral.createPane("yo").style.zIndex = 660;
    mapaGeneral.getPane("yo").style.pointerEvents = "none";
    mapaGeneral.on("dragstart", () => {
      if (seguirme) activarSeguirme(false);
    });
  }
  dibujarMiPosicion();
  const nombreZona = mapaZona ? sectoresCenso.find((s) => String(s.id) === mapaZona)?.nombre || "" : "";
  if (capaZonasGeneral) mapaGeneral.removeLayer(capaZonasGeneral);
  capaZonasGeneral = agregarCapaZonas(mapaGeneral, { interactivas: true, resaltar: nombreZona });
  if (capaCasas) mapaGeneral.removeLayer(capaCasas);
  capaCasas = L.layerGroup().addTo(mapaGeneral);

  marcadoresCasa = {};
  ubicadas.forEach((c) => {
    const m = L.circleMarker([c.lat, c.lng], {
      pane: "casas",
      radius: 9,
      color: "#122940",
      weight: 2,
      fillColor: colorZona(c.sector_id),
      fillOpacity: 1,
    }).bindPopup(popupCasa(c));
    m.addTo(capaCasas);
    marcadoresCasa[c.id] = m;
  });

  /* el contenedor acaba de hacerse visible: Leaflet necesita medirlo */
  setTimeout(() => {
    mapaGeneral.invalidateSize();
    const destino = enfocar && marcadoresCasa[enfocar];
    if (destino) {
      mapaGeneral.setView(destino.getLatLng(), 18);
      destino.openPopup();
    } else if (vistaInicial && miPos && cercaDeLaParroquia(miPos)) {
      /* al abrir el mapa con tu posición ya conocida, te muestra a ti */
      mapaGeneral.setView([miPos.lat, miPos.lng], 17);
    } else {
      /* encuadra la zona elegida (o las 8) junto con sus casas */
      const limites = limitesZonas(nombreZona);
      ubicadas.forEach((c) => (limites ? limites.extend([c.lat, c.lng]) : null));
      if (limites) mapaGeneral.fitBounds(limites, { padding: [24, 24], maxZoom: 18 });
      else if (ubicadas.length)
        mapaGeneral.fitBounds(L.latLngBounds(ubicadas.map((c) => [c.lat, c.lng])), { padding: [36, 36], maxZoom: 17 });
    }
  }, 80);
}

/* ---------- Mi ubicación en el mapa (en vivo) ---------- */

/* El seguimiento corre solo con la pestaña Mapa abierta y la pantalla
   encendida, para no gastar batería. */
let miPos = null; // { lat, lng, precision }
let miWatch = null;
let miError = "";
let miPin = null;
let miCirculo = null;
let miZonaNombre;
let seguirme = false;
let miPrimeraVez = true;
let mapaEnfocandoCasa = false;

/* Hasta esta distancia de la parroquia, al abrir el mapa se centra en ti */
const RADIO_CERCA_PARROQUIA_M = 3000;

function distanciaMetros(lat1, lng1, lat2, lng2) {
  const r = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

/* Distancia del punto al borde de un polígono (proyección local en metros) */
function distanciaAPoligono(lat, lng, poligono) {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  const ky = 110540;
  let minimo = Infinity;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const ax = (poligono[j][1] - lng) * kx;
    const ay = (poligono[j][0] - lat) * ky;
    const bx = (poligono[i][1] - lng) * kx;
    const by = (poligono[i][0] - lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const largo2 = dx * dx + dy * dy;
    const t = largo2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / largo2)) : 0;
    minimo = Math.min(minimo, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return minimo;
}

function zonaMasCercana(lat, lng) {
  let mejor = null;
  GEO_ZONAS.forEach((z) => {
    const metros = distanciaAPoligono(lat, lng, z.poligono);
    if (!mejor || metros < mejor.metros) mejor = { zona: z, metros };
  });
  return mejor;
}

function formatoDistancia(m) {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}

function cercaDeLaParroquia(pos) {
  return GEO_PARROQUIA
    ? distanciaMetros(pos.lat, pos.lng, GEO_PARROQUIA.lat, GEO_PARROQUIA.lng) <= RADIO_CERCA_PARROQUIA_M
    : true;
}

function iniciarMiUbicacion() {
  if (miWatch != null) return;
  if (!("geolocation" in navigator)) {
    miError = "Este teléfono no permite obtener la ubicación.";
    renderMiUbicacion();
    return;
  }
  miError = "";
  miPrimeraVez = true;
  renderMiUbicacion();
  miWatch = navigator.geolocation.watchPosition(alMoverme, errorMiUbicacion, {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 20000,
  });
}

function detenerMiUbicacion() {
  if (miWatch != null && navigator.geolocation) navigator.geolocation.clearWatch(miWatch);
  miWatch = null;
}

function errorMiUbicacion(err) {
  /* un tiempo de espera con una posición ya conocida no es un problema */
  if (err && err.code === 3 && miPos) return;
  if (err && err.code === 1) detenerMiUbicacion();
  miError =
    err && err.code === 1
      ? "Para verte en el mapa, permite el acceso a la ubicación en el navegador."
      : mensajeErrorGPS(err);
  renderMiUbicacion();
}

function alMoverme(pos) {
  miError = "";
  miPos = { lat: pos.coords.latitude, lng: pos.coords.longitude, precision: pos.coords.accuracy };

  const zona = GEO_ZONAS.length ? zonaDelPunto(miPos.lat, miPos.lng) : null;
  const nombre = zona ? zona.nombre : null;
  if (miZonaNombre !== undefined && nombre !== miZonaNombre) {
    mostrarToast(nombre ? `Entraste a la ${zonaConSanto(nombre)}` : "Saliste de las zonas de la parroquia");
  }
  miZonaNombre = nombre;

  dibujarMiPosicion();
  if (mapaGeneral) {
    if (seguirme) {
      mapaGeneral.panTo([miPos.lat, miPos.lng]);
    } else if (miPrimeraVez && !mapaEnfocandoCasa && cercaDeLaParroquia(miPos)) {
      mapaGeneral.setView([miPos.lat, miPos.lng], Math.max(mapaGeneral.getZoom(), 17));
    }
    miPrimeraVez = false;
  }
  renderMiUbicacion();
}

function dibujarMiPosicion() {
  if (!mapaGeneral || !miPos) return;
  const punto = [miPos.lat, miPos.lng];
  if (!miPin) {
    miCirculo = L.circle(punto, {
      pane: "yo",
      radius: miPos.precision,
      color: "#2563eb",
      weight: 1,
      fillColor: "#2563eb",
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(mapaGeneral);
    miPin = L.marker(punto, {
      pane: "yo",
      interactive: false,
      icon: L.divIcon({ className: "", html: '<div class="pin-yo"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
    }).addTo(mapaGeneral);
  } else {
    miPin.setLatLng(punto);
    miCirculo.setLatLng(punto).setRadius(miPos.precision);
  }
}

function activarSeguirme(activo) {
  seguirme = activo;
  if (seguirme && mapaGeneral && miPos) {
    mapaGeneral.setView([miPos.lat, miPos.lng], Math.max(mapaGeneral.getZoom(), 17));
  }
  $(".mapa-btn-yo")?.classList.toggle("activo", seguirme);
  renderMiUbicacion();
}

function renderMiUbicacion() {
  const cont = $("#mapa-yo");
  if (!cont) return;

  if (miError && !miPos) {
    cont.innerHTML = `
      <div class="mi-ubic error">
        <div class="mi-ubic-cab">${icono("alerta")}<span class="mi-ubic-titulo">${esc(miError)}</span></div>
        <button class="btn btn-secundario btn-chip" data-accion="mapa-reintentar-ubic">${icono("recargar")} Reintentar</button>
      </div>`;
    return;
  }
  if (!miPos) {
    cont.innerHTML = `
      <div class="mi-ubic">
        <div class="mi-ubic-cab">${icono("cargando", "girando")}<span class="mi-ubic-titulo">Buscando tu ubicación…</span></div>
      </div>`;
    return;
  }

  const zona = GEO_ZONAS.length ? zonaDelPunto(miPos.lat, miPos.lng) : null;
  let cabecera;
  if (zona) {
    cabecera = `<span class="zona-punto grande" style="background:${zona.color}"></span>
      <div class="mi-ubic-textos"><span class="mi-ubic-titulo">Estás en la <strong>${esc(zona.nombre)}</strong></span>${
        zona.santo ? `<span class="mi-ubic-santo">${esc(zona.santo)}</span>` : ""
      }`;
  } else {
    const cercana = zonaMasCercana(miPos.lat, miPos.lng);
    cabecera = `${icono("alerta")}
      <div class="mi-ubic-textos"><span class="mi-ubic-titulo">Estás fuera de las 8 zonas</span>${
        cercana
          ? `<span class="mi-ubic-sub">La más cercana es la <strong>${esc(zonaConSanto(cercana.zona.nombre))}</strong>, a ${formatoDistancia(cercana.metros)}</span>`
          : ""
      }`;
  }
  cabecera += `<span class="mi-ubic-sub">En vivo · precisión ±${Math.round(miPos.precision)} m</span></div>`;

  let filaParroquia = "";
  if (GEO_PARROQUIA) {
    const metros = distanciaMetros(miPos.lat, miPos.lng, GEO_PARROQUIA.lat, GEO_PARROQUIA.lng);
    filaParroquia = `
      <div class="mi-ubic-fila">
        <span>⛪ A <strong>${formatoDistancia(metros)}</strong> de la parroquia</span>
        <a class="btn btn-suave btn-chip" href="https://www.google.com/maps/dir/?api=1&destination=${GEO_PARROQUIA.lat},${GEO_PARROQUIA.lng}&travelmode=walking"
           target="_blank" rel="noopener">${icono("ruta")} Cómo llegar</a>
      </div>`;
  }

  let filaCasas = "";
  const sector = zona ? sectorPorNombre(zona.nombre) : null;
  if (sector) {
    const casasZona = casasCenso.filter((c) => c.sector_id === sector.id);
    const conPendientes = casasZona.filter((c) => c.personas.some((p) => p.estado === "pendiente")).length;
    filaCasas = `
      <div class="mi-ubic-fila">
        <span>🏠 <strong>${plural(casasZona.length, "casa censada", "casas censadas")}</strong> en esta zona${
          conPendientes ? ` · ${plural(conPendientes, "con pendientes", "con pendientes")}` : ""
        }</span>
        ${
          casasZona.length
            ? `<button class="btn btn-suave btn-chip" data-accion="ver-casas-zona" data-id="${sector.id}">Ver casas</button>`
            : ""
        }
      </div>`;
  }

  cont.innerHTML = `
    <div class="mi-ubic">
      <div class="mi-ubic-cab">
        ${cabecera}
        <button class="btn btn-chip ${seguirme ? "btn-principal" : "btn-secundario"}" data-accion="mapa-seguir"
                aria-pressed="${seguirme}" title="El mapa te sigue mientras caminas">${icono("navegar")} ${seguirme ? "Siguiéndote" : "Seguirme"}</button>
      </div>
      ${filaParroquia}
      ${filaCasas}
    </div>`;
}

let temporizadorToast = null;

function mostrarToast(texto) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = texto;
  el.hidden = false;
  el.classList.remove("saliendo");
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => {
    el.classList.add("saliendo");
    setTimeout(() => (el.hidden = true), 250);
  }, 3500);
  if (navigator.vibrate) navigator.vibrate(60);
}

/* ---------- Estadísticas ---------- */

function barra(etiqueta, valor, max, extra = "") {
  const pct = max ? Math.round((valor / max) * 100) : 0;
  return `
    <div class="barra-fila">
      <div class="barra-etiqueta">${etiqueta}</div>
      <div class="barra-pista"><div class="barra-relleno" style="width:${pct}%"></div></div>
      <div class="barra-valor">${valor}${extra}</div>
    </div>`;
}

let statsSector = "";

function renderStats() {
  const cont = $("#stats-contenido");
  const casas = statsSector
    ? casasCenso.filter((c) => String(c.sector_id) === statsSector)
    : casasCenso;
  const personas = casas.flatMap((c) => c.personas);
  const totalCasas = casas.length;
  const total = personas.length;

  const nombreSectorActivo = statsSector
    ? sectoresCenso.find((s) => String(s.id) === statsSector)?.nombre || ""
    : "";

  const selector = `
    <div class="censo-filtros no-imprimir">
      <select id="stats-filtro-sector" aria-label="Zona">
        <option value="">Todas las zonas</option>
        ${sectoresCenso
          .map(
            (s) =>
              `<option value="${s.id}" ${String(s.id) === statsSector ? "selected" : ""}>${esc(zonaConSanto(s.nombre))}</option>`
          )
          .join("")}
      </select>
    </div>`;

  const encabezadoImpresion = `
    <div class="stats-print-header">
      <h1>Parroquia "San Benito de Palermo" · Arquidiócesis de Maracaibo</h1>
      <p>Estadísticas del censo${nombreSectorActivo ? ` · ${esc(zonaConSanto(nombreSectorActivo))}` : " · Todas las zonas"}</p>
      <p>Generado el ${new Date().toLocaleDateString("es-VE", { day: "numeric", month: "long", year: "numeric" })}</p>
    </div>`;

  if (!total && !totalCasas) {
    cont.innerHTML = `${selector}${encabezadoImpresion}<div class="card vacio-card"><span class="vacio-icono">📊</span>Aún no hay datos del censo${
      statsSector ? " en esta zona" : ""
    }.<span class="texto-suave">Las estadísticas aparecerán cuando se registren las primeras casas.</span></div>`;
    return;
  }

  /* Por estado */
  const porEstado = { pendiente: 0, en_proceso: 0, atendido: 0 };
  personas.forEach((p) => porEstado[p.estado]++);

  /* Ubicación */
  const conUbic = casas.filter(tieneUbicacion).length;
  const pctUbic = totalCasas ? Math.round((conUbic / totalCasas) * 100) : 0;

  /* Por categoría */
  const porCat = {};
  CATEGORIAS.forEach((c) => (porCat[c.slug] = 0));
  personas.forEach((p) => p.categorias.forEach((c) => porCat[c]++));
  const maxCat = Math.max(1, ...Object.values(porCat));

  /* Por zona (personas y casas) */
  const porSector = {};
  if (!statsSector) sectoresCenso.forEach((s) => (porSector[s.nombre] = { id: s.id, personas: 0, casas: 0 }));
  casas.forEach((c) => {
    const s = (porSector[c.sector] = porSector[c.sector] || { id: c.sector_id, personas: 0, casas: 0 });
    s.casas++;
    s.personas += c.personas.length;
  });
  const maxSector = Math.max(1, ...Object.values(porSector).map((s) => s.personas));

  /* Por día */
  const porDia = {};
  personas.forEach((p) => {
    const d = fechaISO(p.creado_en);
    porDia[d] = (porDia[d] || 0) + 1;
  });
  const dias = Object.keys(porDia).sort();
  const maxDia = Math.max(1, ...Object.values(porDia));

  /* Categoría × zona */
  const cruce = {};
  CATEGORIAS.forEach((c) => (cruce[c.slug] = {}));
  casas.forEach((casa) =>
    casa.personas.forEach((p) =>
      p.categorias.forEach((cat) => {
        cruce[cat][casa.sector] = (cruce[cat][casa.sector] || 0) + 1;
      })
    )
  );
  const nombresSectores = Object.keys(porSector);

  cont.innerHTML = `
    ${selector}
    ${encabezadoImpresion}
    <div class="kpis cuatro">
      <div class="kpi destacado"><span class="kpi-valor">${totalCasas}</span><span class="kpi-etiqueta">Casas visitadas</span></div>
      <div class="kpi"><span class="kpi-valor">${total}</span><span class="kpi-etiqueta">Personas censadas</span></div>
      <div class="kpi"><span class="kpi-valor">${pctUbic}%</span><span class="kpi-etiqueta">Casas con ubicación (${conUbic})</span></div>
      <div class="kpi"><span class="kpi-valor">${porEstado.pendiente}</span><span class="kpi-etiqueta">Pendientes</span></div>
    </div>

    <div class="card">
      <h3>Seguimiento${nombreSectorActivo ? ` · ${esc(zonaConSanto(nombreSectorActivo))}` : ""}</h3>
      <div class="stats-estados">
        <span class="badge ${ESTADOS.pendiente.clase}">Pendientes: ${porEstado.pendiente}</span>
        <span class="badge ${ESTADOS.en_proceso.clase}">En proceso: ${porEstado.en_proceso}</span>
        <span class="badge ${ESTADOS.atendido.clase}">Atendidos: ${porEstado.atendido}</span>
      </div>
    </div>

    <div class="card">
      <h3>Por categoría</h3>
      ${CATEGORIAS.map((c) => barra(`${c.emoji} ${esc(c.etiqueta)}`, porCat[c.slug], maxCat)).join("")}
      <p class="texto-suave">Una persona con varias categorías cuenta en cada una.</p>
    </div>

    ${
      statsSector
        ? ""
        : `<div class="card">
      <h3>Por zona</h3>
      ${nombresSectores
        .map((s) =>
          barra(
            `${puntoZona(porSector[s].id)}${esc(zonaConSanto(s))}`,
            porSector[s].personas,
            maxSector,
            ` <span class="barra-extra">· ${plural(porSector[s].casas, "casa")}</span>`
          )
        )
        .join("")}
    </div>`
    }

    <div class="card">
      <h3>Registros por día</h3>
      ${dias
        .map((d) =>
          barra(
            new Date(d + "T12:00:00").toLocaleDateString("es-VE", { weekday: "short", day: "numeric", month: "short" }),
            porDia[d],
            maxDia
          )
        )
        .join("")}
    </div>

    <div class="card">
      <h3>Categoría × zona</h3>
      <div class="tabla-scroll">
        <table class="tabla-cruce">
          <thead>
            <tr><th>Categoría</th>${nombresSectores.map((s) => `<th title="${esc(zonaConSanto(s))}">${esc(s)}</th>`).join("")}<th>Total</th></tr>
          </thead>
          <tbody>
            ${CATEGORIAS.map((c) => {
              const fila = nombresSectores.map((s) => cruce[c.slug][s] || 0);
              return `<tr><td>${c.emoji} ${esc(c.etiqueta)}</td>${fila
                .map((v) => `<td>${v || ""}</td>`)
                .join("")}<td><strong>${porCat[c.slug]}</strong></td></tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
      <p class="texto-suave">La vista clave para organizar el seguimiento de la parroquia.</p>
    </div>

    <div class="stats-botones no-imprimir">
      <button class="btn btn-secundario" data-accion="actualizar-stats">${icono("recargar")} Actualizar</button>
      <button class="btn btn-principal" data-accion="exportar-pdf">${icono("imprimir")} PDF</button>
      <button class="btn btn-acento btn-ancho" data-accion="exportar-excel">${icono("descargar")} Exportar Excel por zona</button>
    </div>`;
}

/* ---------- Palabra (díptico de la semana) ---------- */

let palabraId = "";

function renderPalabra() {
  const cont = $("#palabra-contenido");
  const semana = typeof dipticoActual === "function" ? dipticoActual() : null;
  const d = (palabraId && dipticoPorId(palabraId)) || semana;
  if (!d) {
    cont.innerHTML = `<div class="card vacio-card"><span class="vacio-icono">📖</span>Todavía no hay dípticos cargados.</div>`;
    return;
  }
  cont.innerHTML = `
    ${htmlSelectorDipticos(d.id, semana && semana.id)}
    <div class="aviso-palabra">
      ${icono("libro")}
      <span>Para enviarlo a una familia, toca el botón verde ${icono("libro")} en la tarjeta de su casa: el mensaje sale con su nombre y su teléfono.</span>
    </div>
    ${htmlDiptico(d)}`;
}

/* ---------- Sin configurar / sin conexión ---------- */

function renderSinConfigurar(sel) {
  $(sel).innerHTML = `
    <div class="card vacio-card">
      <p>⚙️ El censo todavía no está conectado.</p>
      <p class="texto-suave" style="margin-top:8px">
        1. Crear el proyecto gratis en <strong>supabase.com</strong><br>
        2. Ejecutar el script <strong>supabase.sql</strong> en el SQL Editor<br>
        3. Pegar la URL y la anon key en <strong>config.js</strong>
      </p>
    </div>`;
}

function renderSinConexion(sel) {
  $(sel).innerHTML = `
    <div class="card vacio-card">
      <span class="vacio-icono">📶</span>
      No hubo señal al abrir la app y el censo no se pudo conectar.
      <span class="texto-suave">Cuando tengas conexión, recarga la página. Mientras tanto puedes usar la guía de preguntas.</span>
    </div>`;
}

/* ---------- Navegación entre pestañas ---------- */

function mostrarVista(id) {
  vistaActual = id;
  document.querySelectorAll(".vista").forEach((v) => {
    v.classList.toggle("visible", v.id === `vista-${id}`);
  });
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("activo", t.dataset.vista === id);
  });
  $("#fab").classList.toggle("oculto", id === "stats" || id === "palabra");
  $("#fab").classList.toggle("compacto", id === "mapa");
  if (id === "mapa") iniciarMiUbicacion();
  else detenerMiUbicacion();
  window.scrollTo({ top: 0 });
}

function irA(id, opciones) {
  mostrarVista(id);
  if (id === "censo") refrescarCenso();
  if (id === "stats") refrescarStats();
  if (id === "mapa") refrescarMapa({ vistaInicial: true, ...opciones });
  if (id === "palabra") renderPalabra();
}

/* ---------- Eventos (delegación) ---------- */

document.addEventListener("click", (ev) => {
  const tab = ev.target.closest(".tab");
  if (tab) {
    irA(tab.dataset.vista);
    return;
  }

  const el = ev.target.closest("[data-accion]");
  if (!el) return;
  const accion = el.dataset.accion;
  const id = el.dataset.id;

  switch (accion) {
    case "abrir-form":
      if (!sb && !sectoresCenso.length && !cargarInstantanea()) {
        alert("Para registrar sin señal, abre la app al menos una vez con conexión.");
        return;
      }
      form = { modo: "nueva-casa" };
      renderFormulario();
      break;
    case "cerrar-form":
      cerrarFormulario();
      break;
    case "guardar-form":
      guardarFormulario();
      break;
    case "agregar-bloque":
      $("#form-personas").insertAdjacentHTML("beforeend", bloquePersona({}, true));
      $("#form-personas").lastElementChild.scrollIntoView({ behavior: "smooth", block: "start" });
      break;
    case "quitar-bloque":
      el.closest(".form-persona").remove();
      break;
    case "toggle-cat":
      el.classList.toggle("activo");
      break;
    case "capturar-ubicacion":
      capturarUbicacion();
      break;
    case "quitar-ubicacion":
      quitarUbicacion();
      break;
    case "usar-zona-detectada": {
      const geo = formUbic && zonaDelPunto(formUbic.lat, formUbic.lng);
      const sector = geo && sectorPorNombre(geo.nombre);
      if (sector) $("#censo-form .fc-sector").value = String(sector.id);
      zonaElegidaAMano = false;
      pintarZonaDetectada();
      break;
    }
    case "filtro-cat":
      filtros.categoria = el.dataset.cat;
      renderFiltros();
      renderLista();
      break;
    case "recargar":
    case "reintentar-carga":
      censoCargado = false;
      refrescarCenso();
      break;
    case "exportar-excel":
      exportarExcel();
      break;
    case "sincronizar":
      sincronizarPendientes();
      break;
    case "persona-en-casa":
      form = { modo: "agregar-persona", casa: casasCenso.find((c) => c.id === id) };
      renderFormulario();
      break;
    case "editar-casa":
      form = { modo: "editar-casa", casa: casasCenso.find((c) => c.id === id) };
      renderFormulario();
      break;
    case "eliminar-casa":
      eliminarCasa(id);
      break;
    case "editar-persona": {
      const { persona, casa } = buscarPersona(id);
      form = { modo: "editar-persona", persona, casa };
      renderFormulario();
      break;
    }
    case "eliminar-persona":
      eliminarPersona(id);
      break;
    case "ver-en-mapa":
      irA("mapa", { enfocar: id });
      break;
    case "recargar-mapa":
      refrescarMapa({ recargar: true });
      break;
    case "mapa-centrarme":
      if (miPos) activarSeguirme(true);
      else iniciarMiUbicacion();
      break;
    case "mapa-seguir":
      activarSeguirme(!seguirme);
      break;
    case "mapa-reintentar-ubic":
      detenerMiUbicacion();
      iniciarMiUbicacion();
      break;
    case "ver-casas-zona":
      filtros.sector = String(id);
      irA("censo");
      break;
    case "actualizar-stats":
      refrescarStats();
      break;
    case "exportar-pdf":
      window.print();
      break;
  }
});

document.addEventListener("change", (ev) => {
  const el = ev.target;
  if (el.dataset.accion === "cambiar-estado") {
    cambiarEstado(el.dataset.id, el.value);
  } else if (el.classList.contains("fc-sector")) {
    zonaElegidaAMano = true;
    pintarZonaDetectada();
  } else if (el.id === "filtro-sector") {
    filtros.sector = el.value;
    renderLista();
  } else if (el.id === "filtro-estado") {
    filtros.estado = el.value;
    renderLista();
  } else if (el.id === "mapa-filtro-zona") {
    mapaZona = el.value;
    miPrimeraVez = false;
    renderMapa();
  } else if (el.id === "palabra-selector") {
    palabraId = el.value;
    renderPalabra();
    window.scrollTo({ top: 0 });
  } else if (el.id === "stats-filtro-sector") {
    statsSector = el.value;
    renderStats();
  }
});

document.addEventListener("input", (ev) => {
  if (ev.target.id === "filtro-texto") {
    filtros.texto = ev.target.value;
    renderLista();
  }
});

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && form.modo) cerrarFormulario();
});

/* ---------- Instalar la app (PWA) ---------- */

let eventoInstalar = null;

function enModoApp() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function esIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function renderAvisoInstalar() {
  const cont = $("#aviso-instalar");
  if (!cont) return;
  let oculto = false;
  try {
    oculto = localStorage.getItem(LS_INSTALAR_OCULTO) === "1";
  } catch {
    /* sin almacenamiento: se muestra igual */
  }
  if (enModoApp() || oculto || (!eventoInstalar && !esIOS())) {
    cont.innerHTML = "";
    return;
  }
  cont.innerHTML = `
    <div class="aviso-instalar">
      <img src="img/icono-192.png" alt="" width="44" height="44" />
      <div class="aviso-instalar-texto">
        <strong>Instala el censo en tu teléfono</strong>
        <span>${
          eventoInstalar
            ? "Queda como una app con el logo de la parroquia y abre aunque no haya señal."
            : "En Safari toca <strong>Compartir</strong> y luego <strong>Agregar a inicio</strong>. Así abre aunque no haya señal."
        }</span>
      </div>
      <div class="aviso-instalar-botones">
        ${eventoInstalar ? `<button class="btn btn-acento btn-chip" data-accion="instalar-app">Instalar</button>` : ""}
        <button class="btn btn-icono" data-accion="ocultar-instalar" aria-label="Ocultar">${icono("cerrar")}</button>
      </div>
    </div>`;
}

window.addEventListener("beforeinstallprompt", (ev) => {
  ev.preventDefault();
  eventoInstalar = ev;
  renderAvisoInstalar();
});

window.addEventListener("appinstalled", () => {
  eventoInstalar = null;
  renderAvisoInstalar();
  mostrarToast("Listo: el censo quedó instalado en tu teléfono");
});

document.addEventListener("click", async (ev) => {
  const el = ev.target.closest('[data-accion="instalar-app"], [data-accion="ocultar-instalar"]');
  if (!el) return;
  if (el.dataset.accion === "instalar-app" && eventoInstalar) {
    eventoInstalar.prompt();
    await eventoInstalar.userChoice.catch(() => null);
    eventoInstalar = null;
  } else if (el.dataset.accion === "ocultar-instalar") {
    try {
      localStorage.setItem(LS_INSTALAR_OCULTO, "1");
    } catch {
      /* sin almacenamiento: se oculta solo por esta vez */
    }
    $("#aviso-instalar").innerHTML = "";
    return;
  }
  renderAvisoInstalar();
});

/* El service worker guarda la app en el teléfono para abrirla sin señal */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* sin service worker la app funciona igual, solo que no abre sin señal */
    });
  });
}

/* ---------- Inicio ---------- */

window.addEventListener("online", async () => {
  renderEstadoRed();
  await sincronizarPendientes();
  if (usandoInstantanea && sb) {
    if (vistaActual === "censo") refrescarCenso();
    else if (vistaActual === "stats") refrescarStats();
    else if (vistaActual === "mapa") refrescarMapa({ recargar: true });
  }
});
window.addEventListener("offline", renderEstadoRed);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) detenerMiUbicacion();
  else if (vistaActual === "mapa") iniciarMiUbicacion();
});

renderEstadoRed();
renderAvisoInstalar();
renderGuiaCenso();
renderAvisoOffline();
if (sb) sincronizarPendientes();
refrescarCenso();
