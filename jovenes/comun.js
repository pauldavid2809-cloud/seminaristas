/* ==========================================================================
   Jóvenes de la parroquia · código compartido por registro.html y index.html
   ========================================================================== */

"use strict";

const TABLA_JOVENES = "jovenes";

/* Enlace del grupo o canal de WhatsApp de los jóvenes (opcional). Si se llena,
   aparece al terminar de anotarse y en el mensaje de bienvenida. */
const JOVENES_GRUPO_WHATSAPP = "";

const JOVENES_EDAD_MIN = 10;
const JOVENES_EDAD_MAX = 40;
const JOVENES_MAYORIA = 18;

const JOVENES_ESTADOS = { nuevo: "Nuevo", contactado: "Contactado", activo: "Activo", inactivo: "Inactivo" };

function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/* 0414-1234567 → 584141234567 (número de Venezuela). Con "+" y otro país se
   deja tal cual. Devuelve "" si no parece un teléfono. */
function normalizarTelefono(tel) {
  const crudo = String(tel || "").trim();
  const d = crudo.replace(/\D/g, "");
  if (!d) return "";
  if (crudo.startsWith("+") && !d.startsWith("58")) return d.length >= 8 && d.length <= 15 ? d : "";
  const ve = d.startsWith("58") ? d : "58" + (d.startsWith("0") ? d.slice(1) : d);
  return /^58\d{10}$/.test(ve) ? ve : "";
}

function formatoLocal(tel) {
  if (!tel) return "";
  const local = tel.startsWith("58") ? "0" + tel.slice(2) : tel;
  return local.length === 11 ? `${local.slice(0, 4)}-${local.slice(4)}` : local;
}

/* Edad cumplida a partir de "AAAA-MM-DD"; null si la fecha no es válida */
function edadDesde(iso, hoy = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return null;
  const [y, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const nace = new Date(y, mes - 1, d);
  if (nace.getFullYear() !== y || nace.getMonth() !== mes - 1 || nace.getDate() !== d) return null;
  let edad = hoy.getFullYear() - y;
  if (hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < d)) edad--;
  return edad;
}

function isoLocal(fecha = new Date()) {
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${m}-${d}`;
}

function errorDeRed(e) {
  return !navigator.onLine || /fetch|network|failed|load/i.test(e?.message || "");
}

/* La tabla todavía no se creó en Supabase */
function tablaNoExiste(e) {
  const t = `${e?.code || ""} ${e?.message || ""}`;
  return /PGRST205|42P01/.test(t) || (/jovenes/.test(t) && /schema cache|does not exist/i.test(t));
}

/* Cliente de Supabase. Sin opciones = visitante (clave pública), sin guardar
   ni leer sesiones. La lista privada pide guardar su sesión en un espacio
   PROPIO (SESION_JOVENES): si usara el de por defecto, el censo del mismo sitio
   la leería y dejaría de ver sus datos (sus reglas son para visitantes). */
const SESION_JOVENES = "sb-jovenes-auth";

function crearCliente({ conSesion = false } = {}) {
  if (typeof SUPABASE_URL !== "string" || !window.supabase) return null;
  const auth = conSesion
    ? { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: SESION_JOVENES }
    : { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth });
}

/* Quita la sesión que versiones anteriores de /jovenes dejaron en el espacio
   compartido del sitio (la leía el censo y lo dejaba vacío) */
function limpiarSesionVieja() {
  try {
    const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
    localStorage.removeItem(`sb-${ref}-auth-token`);
  } catch {
    /* sin almacenamiento */
  }
}
