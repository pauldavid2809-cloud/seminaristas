/* ==========================================================================
   Censo de la Misión · Parroquia "El Buen Pastor"
   Registro de casas y personas + estadísticas (Supabase)
   ========================================================================== */

"use strict";

/* ---------- Configuración y cliente ---------- */

const CENSO_CONFIGURADO =
  typeof SUPABASE_URL === "string" &&
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("PEGAR");

const sb = CENSO_CONFIGURADO
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const SALUDO_WA =
  "Saludos, le escribo de la Parroquia El Buen Pastor por la visita de las misiones 🙏";

const LS_PENDIENTES = "censo_pendientes";

/* ---------- Catálogos ---------- */

const CATEGORIAS = [
  { slug: "enfermo", etiqueta: "Enfermo", emoji: "🤒" },
  { slug: "primera_comunion", etiqueta: "Primera Comunión", emoji: "🍞" },
  { slug: "confirmacion", etiqueta: "Confirmación", emoji: "🕊️" },
  { slug: "vulnerable", etiqueta: "Persona vulnerable", emoji: "🤝" },
  { slug: "bautizo", etiqueta: "Bautizo pendiente", emoji: "💧" },
  { slug: "matrimonio", etiqueta: "Matrimonio por regularizar", emoji: "💍" },
  { slug: "uncion", etiqueta: "Unción / comunión a enfermos", emoji: "⛪" },
];

const ESTADOS = {
  pendiente: { etiqueta: "Pendiente", clase: "est-pendiente" },
  en_proceso: { etiqueta: "En proceso", clase: "est-en-proceso" },
  atendido: { etiqueta: "Atendido", clase: "est-atendido" },
};

function catInfo(slug) {
  return CATEGORIAS.find((c) => c.slug === slug) || { etiqueta: slug, emoji: "" };
}

/* ---------- Utilidades ---------- */

function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/* El misionero escribe 0412-1234567; se guarda listo para WhatsApp: 584121234567 */
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

function linkWhatsApp(tel) {
  return `https://wa.me/${tel}?text=${encodeURIComponent(SALUDO_WA)}`;
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

/* ---------- Estado del módulo ---------- */

let sectoresCenso = [];
let casasCenso = []; // cada casa lleva .personas[] y .sector (nombre)
let censoCargado = false;

const filtros = { texto: "", categoria: "", sector: "", estado: "" };

/* Formulario: modo = null | "nueva-casa" | "agregar-persona" | "editar-persona" | "editar-casa" */
let form = { modo: null, casa: null, persona: null };

/* ---------- Datos ---------- */

async function cargarSectores() {
  const { data, error } = await sb
    .from("sectores")
    .select("*")
    .eq("activo", true)
    .order("nombre");
  if (error) throw error;
  sectoresCenso = data;
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
    sector: c.sectores?.nombre || "",
    personas: porCasa[c.id] || [],
  }));
  censoCargado = true;
}

async function refrescarCenso() {
  if (!CENSO_CONFIGURADO) {
    renderSinConfigurar("#censo-lista");
    return;
  }
  const cont = document.querySelector("#censo-lista");
  if (!censoCargado) cont.innerHTML = `<div class="card vacio-card">Cargando el censo…</div>`;
  try {
    if (!sectoresCenso.length) await cargarSectores();
    await cargarCenso();
    renderFormulario();
    renderFiltros();
    renderLista();
    sincronizarPendientes();
  } catch (e) {
    cont.innerHTML = `<div class="card vacio-card">⚠️ No se pudo cargar el censo.<br><span class="mini-dia">${esc(
      e.message
    )}</span><br><button class="btn-secundario" data-accion="reintentar-carga">🔄 Reintentar</button></div>`;
  }
  renderAvisoOffline();
}

async function refrescarStats() {
  if (!CENSO_CONFIGURADO) {
    renderSinConfigurar("#stats-contenido");
    return;
  }
  const cont = document.querySelector("#stats-contenido");
  if (!censoCargado) cont.innerHTML = `<div class="card vacio-card">Cargando estadísticas…</div>`;
  try {
    if (!sectoresCenso.length) await cargarSectores();
    await cargarCenso();
    renderStats();
  } catch (e) {
    cont.innerHTML = `<div class="card vacio-card">⚠️ No se pudieron cargar las estadísticas.<br><span class="mini-dia">${esc(
      e.message
    )}</span></div>`;
  }
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
  localStorage.setItem(LS_PENDIENTES, JSON.stringify(lista));
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
  if (!CENSO_CONFIGURADO) return;
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
  const cont = document.querySelector("#censo-aviso-offline");
  const n = pendientes().length;
  if (!n) {
    cont.innerHTML = "";
    return;
  }
  cont.innerHTML = `
    <div class="aviso-offline">
      📶 Hay <strong>${n}</strong> registro${n > 1 ? "s" : ""} guardado${n > 1 ? "s" : ""} en este
      teléfono esperando señal.
      <button class="btn-secundario" data-accion="sincronizar">🔄 Enviar ahora</button>
    </div>`;
}

/* ---------- Formulario ---------- */

function opcionesSectores(seleccionado) {
  return sectoresCenso
    .map(
      (s) =>
        `<option value="${s.id}" ${s.id === seleccionado ? "selected" : ""}>${esc(s.nombre)}</option>`
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
    <div class="form-persona">
      <div class="form-persona-cab">
        <strong>👤 Persona</strong>
        ${quitable ? `<button type="button" class="btn-quitar" data-accion="quitar-bloque">✕ Quitar</button>` : ""}
      </div>
      <div class="form-campo">
        <label>Nombre y apellido *</label>
        <input type="text" class="fp-nombre" value="${esc(p.nombre || "")}" placeholder="María Pérez" />
      </div>
      <div class="form-campo">
        <label>Edad</label>
        <input type="number" class="fp-edad" min="0" max="120" value="${p.edad ?? ""}" placeholder="10" />
      </div>
      <div class="form-campo">
        <label>Categorías * <span class="mini-dia">(puede marcar varias)</span></label>
        <div class="cat-chips">${chipsCategorias(p.categorias || [])}</div>
      </div>
      <div class="form-campo">
        <label>Notas</label>
        <textarea class="fp-notas" rows="2" placeholder="Detalles útiles para el seguimiento">${esc(p.notas || "")}</textarea>
      </div>
    </div>`;
}

function camposCasa(c = {}) {
  return `
    <div class="form-casa">
      <div class="form-fila">
        <div class="form-campo">
          <label>Sector *</label>
          <select class="fc-sector">
            <option value="">— Elegir —</option>
            ${opcionesSectores(c.sector_id)}
          </select>
        </div>
        <div class="form-campo">
          <label>Familia (apellido)</label>
          <input type="text" class="fc-familia" value="${esc(c.familia || "")}" placeholder="Familia Pérez" />
        </div>
      </div>
      <div class="form-campo">
        <label>Dirección *</label>
        <input type="text" class="fc-direccion" value="${esc(c.direccion || "")}" placeholder="Calle, casa, punto de referencia" />
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

function renderFormulario() {
  const cont = document.querySelector("#censo-form");

  if (!form.modo) {
    cont.innerHTML = `
      <button class="btn-principal btn-registrar" data-accion="abrir-form">
        ➕ Registrar casa / visita
      </button>`;
    return;
  }

  let titulo = "";
  let cuerpo = "";
  if (form.modo === "nueva-casa") {
    titulo = "➕ Registrar casa / visita";
    cuerpo = `
      ${camposCasa()}
      <div id="form-personas">${bloquePersona()}</div>
      <button type="button" class="btn-secundario" data-accion="agregar-bloque">
        ➕ Agregar otra persona de esta casa
      </button>`;
  } else if (form.modo === "agregar-persona") {
    titulo = `➕ Agregar persona`;
    cuerpo = `
      <p class="mini-dia form-contexto">🏠 ${esc(form.casa.familia || form.casa.direccion)} · ${esc(form.casa.sector)}</p>
      <div id="form-personas">${bloquePersona()}</div>
      <button type="button" class="btn-secundario" data-accion="agregar-bloque">
        ➕ Agregar otra persona de esta casa
      </button>`;
  } else if (form.modo === "editar-persona") {
    titulo = `✏️ Editar a ${esc(form.persona.nombre)}`;
    cuerpo = `<div id="form-personas">${bloquePersona(form.persona)}</div>`;
  } else if (form.modo === "editar-casa") {
    titulo = `✏️ Editar casa`;
    cuerpo = camposCasa(form.casa);
  }

  cont.innerHTML = `
    <div class="card form-censo">
      <h3>${titulo}</h3>
      ${cuerpo}
      <p class="form-error" hidden></p>
      <div class="form-acciones">
        <button type="button" class="btn-principal" data-accion="guardar-form">💾 Guardar</button>
        <button type="button" class="btn-secundario" data-accion="cerrar-form">Cancelar</button>
      </div>
    </div>`;
  cont.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const f = document.querySelector("#censo-form");
  return {
    sector_id: Number(f.querySelector(".fc-sector").value) || null,
    familia: f.querySelector(".fc-familia").value.trim() || null,
    direccion: f.querySelector(".fc-direccion").value.trim(),
    telefono: normalizarTelefono(f.querySelector(".fc-telefono").value),
    notas: f.querySelector(".fc-notas").value.trim() || null,
  };
}

function mostrarErrorForm(msg) {
  const el = document.querySelector("#censo-form .form-error");
  el.textContent = msg;
  el.hidden = false;
}

async function guardarFormulario() {
  const boton = document.querySelector('[data-accion="guardar-form"]');
  boton.disabled = true;
  try {
    if (form.modo === "nueva-casa") {
      const casa = leerCamposCasa();
      const personas = leerBloquesPersona();
      if (!casa.sector_id) return mostrarErrorForm("Elige el sector.");
      if (!casa.direccion) return mostrarErrorForm("Escribe la dirección de la casa.");
      for (const p of personas) {
        if (!p.nombre) return mostrarErrorForm("Cada persona necesita nombre.");
        if (!p.categorias.length)
          return mostrarErrorForm(`Marca al menos una categoría para ${p.nombre}.`);
      }
      const paquete = { casa, personas };
      try {
        await insertarPaquete(paquete);
      } catch (e) {
        if (errorDeRed(e)) {
          guardarPendientes([...pendientes(), paquete]);
          form = { modo: null };
          renderFormulario();
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
      if (!casa.sector_id) return mostrarErrorForm("Elige el sector.");
      if (!casa.direccion) return mostrarErrorForm("Escribe la dirección de la casa.");
      const { error } = await sb.from("casas").update(casa).eq("id", form.casa.id);
      if (error) throw error;
    }
    form = { modo: null };
    await cargarCenso();
    renderFormulario();
    renderLista();
  } catch (e) {
    mostrarErrorForm(`No se pudo guardar: ${e.message}`);
  } finally {
    const b = document.querySelector('[data-accion="guardar-form"]');
    if (b) b.disabled = false;
  }
}

/* ---------- Filtros y lista ---------- */

function renderFiltros() {
  const cont = document.querySelector("#censo-filtros");
  cont.innerHTML = `
    <div class="censo-filtros">
      <input type="search" id="filtro-texto" placeholder="🔎 Buscar nombre, dirección, familia…"
             value="${esc(filtros.texto)}" />
      <div class="filtro-chips">
        <button class="cat-chip ${!filtros.categoria ? "activo" : ""}" data-accion="filtro-cat" data-cat="">Todas</button>
        ${CATEGORIAS.map(
          (c) => `
          <button class="cat-chip ${filtros.categoria === c.slug ? "activo" : ""}"
                  data-accion="filtro-cat" data-cat="${c.slug}">${c.emoji} ${esc(c.etiqueta)}</button>`
        ).join("")}
      </div>
      <div class="filtro-selects">
        <select id="filtro-sector">
          <option value="">Todos los sectores</option>
          ${sectoresCenso
            .map(
              (s) =>
                `<option value="${s.id}" ${String(s.id) === filtros.sector ? "selected" : ""}>${esc(s.nombre)}</option>`
            )
            .join("")}
        </select>
        <select id="filtro-estado">
          <option value="">Todos los estados</option>
          ${Object.entries(ESTADOS)
            .map(
              ([k, v]) =>
                `<option value="${k}" ${k === filtros.estado ? "selected" : ""}>${v.etiqueta}</option>`
            )
            .join("")}
        </select>
        <button class="btn-secundario" data-accion="recargar">🔄</button>
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
      return `<span class="badge turno">${c.emoji} ${esc(c.etiqueta)}</span>`;
    })
    .join("");
}

function cardPersona(p, casa) {
  const telWA = casa.telefono;
  const est = ESTADOS[p.estado] || ESTADOS.pendiente;
  return `
    <div class="persona-censo">
      <div class="persona-censo-cab">
        <strong>${esc(p.nombre)}</strong>${p.edad != null ? ` <span class="mini-dia">· ${p.edad} años</span>` : ""}
        <select class="select-estado ${est.clase}" data-accion="cambiar-estado" data-id="${p.id}">
          ${Object.entries(ESTADOS)
            .map(
              ([k, v]) => `<option value="${k}" ${k === p.estado ? "selected" : ""}>${v.etiqueta}</option>`
            )
            .join("")}
        </select>
      </div>
      <div class="persona-censo-badges">${badgesCategorias(p.categorias)}</div>
      ${p.notas ? `<p class="mini-dia">📝 ${esc(p.notas)}</p>` : ""}
      <div class="persona-censo-pie">
        ${
          telWA
            ? `<a class="btn-whatsapp" href="${linkWhatsApp(telWA)}" target="_blank" rel="noopener">💬 WhatsApp</a>`
            : ""
        }
        <button class="btn-mini" data-accion="editar-persona" data-id="${p.id}">✏️</button>
        <button class="btn-mini" data-accion="eliminar-persona" data-id="${p.id}">🗑️</button>
        <span class="mini-dia registro-pie">${fechaCorta(p.creado_en)}</span>
      </div>
    </div>`;
}

function renderLista() {
  const cont = document.querySelector("#censo-lista");
  const lista = casasFiltradas();
  const totalPersonas = lista.reduce((n, c) => n + c.personasVisibles.length, 0);

  if (!casasCenso.length) {
    cont.innerHTML = `<div class="card vacio-card">Aún no hay casas registradas.<br>Toca <strong>➕ Registrar casa / visita</strong> para comenzar el censo.</div>`;
    return;
  }

  const cards = lista
    .map(
      (c) => `
    <div class="card casa-card">
      <div class="casa-cab">
        <div>
          <strong>🏠 ${esc(c.familia || "Casa")}</strong>
          <span class="badge rol">${esc(c.sector)}</span>
          <p class="mini-dia">📍 ${esc(c.direccion)}
            ${c.telefono ? ` · <a href="tel:${esc(c.telefono)}">📞 ${esc(formatoLocal(c.telefono))}</a>` : ""}
          </p>
          ${c.notas ? `<p class="mini-dia">📝 ${esc(c.notas)}</p>` : ""}
        </div>
        <div class="casa-botones">
          <button class="btn-mini" data-accion="persona-en-casa" data-id="${c.id}">➕ Persona</button>
          <button class="btn-mini" data-accion="editar-casa" data-id="${c.id}">✏️</button>
          <button class="btn-mini" data-accion="eliminar-casa" data-id="${c.id}">🗑️</button>
        </div>
      </div>
      ${c.personasVisibles.map((p) => cardPersona(p, c)).join("")}
      ${
        c.personasVisibles.length < c.personas.length
          ? `<p class="mini-dia">(${c.personas.length - c.personasVisibles.length} persona(s) más en esta casa fuera del filtro)</p>`
          : ""
      }
    </div>`
    )
    .join("");

  cont.innerHTML = `
    <p class="censo-contador">${lista.length} casa${lista.length !== 1 ? "s" : ""} · ${totalPersonas} persona${totalPersonas !== 1 ? "s" : ""}${
      filtros.texto || filtros.categoria || filtros.sector || filtros.estado ? " (con filtros)" : ""
    }</p>
    ${cards || `<div class="card vacio-card">Ninguna casa coincide con los filtros.</div>`}`;
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
  const { error } = await sb.from("personas").update({ estado }).eq("id", id);
  if (error) {
    alert(`No se pudo cambiar el estado: ${error.message}`);
    return;
  }
  const { persona } = buscarPersona(id);
  if (persona) persona.estado = estado;
  renderLista();
}

async function eliminarPersona(id) {
  const { persona } = buscarPersona(id);
  if (!persona) return;
  if (!confirm(`¿Quitar a ${persona.nombre} del censo?`)) return;
  const { error } = await sb.from("personas").update({ eliminado: true }).eq("id", id);
  if (error) {
    alert(`No se pudo eliminar: ${error.message}`);
    return;
  }
  await cargarCenso();
  renderLista();
}

async function eliminarCasa(id) {
  const casa = casasCenso.find((c) => c.id === id);
  if (!casa) return;
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
    alert(`No se pudo eliminar: ${(r1.error || r2.error).message}`);
    return;
  }
  await cargarCenso();
  renderLista();
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
  const cont = document.querySelector("#stats-contenido");
  const casas = statsSector
    ? casasCenso.filter((c) => String(c.sector_id) === statsSector)
    : casasCenso;
  const personas = casas.flatMap((c) => c.personas);
  const totalCasas = casas.length;
  const total = personas.length;

  const selector = `
    <div class="censo-filtros">
      <select id="stats-filtro-sector">
        <option value="">📊 Todos los sectores</option>
        ${sectoresCenso
          .map(
            (s) =>
              `<option value="${s.id}" ${String(s.id) === statsSector ? "selected" : ""}>${esc(s.nombre)}</option>`
          )
          .join("")}
      </select>
    </div>`;

  if (!total && !totalCasas) {
    cont.innerHTML = `${selector}<div class="card vacio-card">Aún no hay datos del censo${
      statsSector ? " en este sector" : ""
    }.<br>Las estadísticas aparecerán cuando se registren las primeras casas.</div>`;
    return;
  }

  /* Por estado */
  const porEstado = { pendiente: 0, en_proceso: 0, atendido: 0 };
  personas.forEach((p) => porEstado[p.estado]++);

  /* Por categoría */
  const porCat = {};
  CATEGORIAS.forEach((c) => (porCat[c.slug] = 0));
  personas.forEach((p) => p.categorias.forEach((c) => porCat[c]++));
  const maxCat = Math.max(1, ...Object.values(porCat));

  /* Por sector (personas y casas) */
  const porSector = {};
  if (!statsSector) sectoresCenso.forEach((s) => (porSector[s.nombre] = { personas: 0, casas: 0 }));
  casas.forEach((c) => {
    const s = (porSector[c.sector] = porSector[c.sector] || { personas: 0, casas: 0 });
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

  /* Categoría × sector */
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

  const nombreSectorActivo = statsSector
    ? sectoresCenso.find((s) => String(s.id) === statsSector)?.nombre || ""
    : "";

  cont.innerHTML = `
    ${selector}
    <div class="card dia-encabezado">
      <h2>📊 Estadísticas${nombreSectorActivo ? ` · ${esc(nombreSectorActivo)}` : " de la misión"}</h2>
      <p class="dia-titulo">${total} persona${total !== 1 ? "s" : ""} censada${total !== 1 ? "s" : ""} · ${totalCasas} casa${totalCasas !== 1 ? "s" : ""} visitada${totalCasas !== 1 ? "s" : ""}</p>
      <div class="stats-estados">
        <span class="badge ${ESTADOS.pendiente.clase}">Pendientes: ${porEstado.pendiente}</span>
        <span class="badge ${ESTADOS.en_proceso.clase}">En proceso: ${porEstado.en_proceso}</span>
        <span class="badge ${ESTADOS.atendido.clase}">Atendidos: ${porEstado.atendido}</span>
      </div>
    </div>

    <div class="card">
      <h3>Por categoría</h3>
      ${CATEGORIAS.map((c) => barra(`${c.emoji} ${esc(c.etiqueta)}`, porCat[c.slug], maxCat)).join("")}
      <p class="mini-dia">Una persona con varias categorías cuenta en cada una.</p>
    </div>

    ${
      statsSector
        ? ""
        : `<div class="card">
      <h3>Por sector</h3>
      ${nombresSectores
        .map((s) =>
          barra(esc(s), porSector[s].personas, maxSector, ` <span class="mini-dia">· ${porSector[s].casas} casa${porSector[s].casas !== 1 ? "s" : ""}</span>`)
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
      <h3>Categoría × sector</h3>
      <div class="tabla-scroll">
        <table class="tabla-cruce">
          <thead>
            <tr><th>Categoría</th>${nombresSectores.map((s) => `<th>${esc(s)}</th>`).join("")}<th>Total</th></tr>
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
      <p class="mini-dia">La vista clave para organizar el seguimiento de la parroquia después de la misión.</p>
    </div>

    <button class="btn-secundario btn-actualizar" data-accion="actualizar-stats">🔄 Actualizar</button>`;
}

/* ---------- Sin configurar ---------- */

function renderSinConfigurar(sel) {
  document.querySelector(sel).innerHTML = `
    <div class="card vacio-card">
      <p>⚙️ El censo todavía no está conectado.</p>
      <p class="mini-dia" style="margin-top:8px">
        1. Crear el proyecto gratis en <strong>supabase.com</strong><br>
        2. Ejecutar el script <strong>supabase.sql</strong> en el SQL Editor<br>
        3. Pegar la URL y la anon key en <strong>config.js</strong>
      </p>
    </div>`;
}

/* ---------- Eventos (delegación) ---------- */

document.querySelector("#vista-censo").addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-accion]");
  if (!el) return;
  const accion = el.dataset.accion;

  if (accion === "abrir-form") {
    form = { modo: "nueva-casa" };
    renderFormulario();
  } else if (accion === "cerrar-form") {
    form = { modo: null };
    renderFormulario();
  } else if (accion === "guardar-form") {
    guardarFormulario();
  } else if (accion === "agregar-bloque") {
    document.querySelector("#form-personas").insertAdjacentHTML("beforeend", bloquePersona({}, true));
  } else if (accion === "quitar-bloque") {
    el.closest(".form-persona").remove();
  } else if (accion === "toggle-cat") {
    el.classList.toggle("activo");
  } else if (accion === "filtro-cat") {
    filtros.categoria = el.dataset.cat;
    renderFiltros();
    renderLista();
  } else if (accion === "recargar" || accion === "reintentar-carga") {
    censoCargado = false;
    refrescarCenso();
  } else if (accion === "sincronizar") {
    sincronizarPendientes();
  } else if (accion === "persona-en-casa") {
    const casa = casasCenso.find((c) => c.id === el.dataset.id);
    form = { modo: "agregar-persona", casa };
    renderFormulario();
  } else if (accion === "editar-casa") {
    const casa = casasCenso.find((c) => c.id === el.dataset.id);
    form = { modo: "editar-casa", casa };
    renderFormulario();
  } else if (accion === "eliminar-casa") {
    eliminarCasa(el.dataset.id);
  } else if (accion === "editar-persona") {
    const { persona, casa } = buscarPersona(el.dataset.id);
    form = { modo: "editar-persona", persona, casa };
    renderFormulario();
  } else if (accion === "eliminar-persona") {
    eliminarPersona(el.dataset.id);
  }
});

document.querySelector("#vista-censo").addEventListener("change", (ev) => {
  const el = ev.target;
  if (el.dataset.accion === "cambiar-estado") {
    cambiarEstado(el.dataset.id, el.value);
  } else if (el.id === "filtro-sector") {
    filtros.sector = el.value;
    renderLista();
  } else if (el.id === "filtro-estado") {
    filtros.estado = el.value;
    renderLista();
  }
});

document.querySelector("#vista-censo").addEventListener("input", (ev) => {
  if (ev.target.id === "filtro-texto") {
    filtros.texto = ev.target.value;
    renderLista();
  }
});

document.querySelector("#vista-stats").addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-accion]");
  if (el?.dataset.accion === "actualizar-stats") refrescarStats();
});

document.querySelector("#vista-stats").addEventListener("change", (ev) => {
  if (ev.target.id === "stats-filtro-sector") {
    statsSector = ev.target.value;
    renderStats();
  }
});

/* Recargar datos al entrar a las pestañas nuevas (el toggle visual lo hace app.js) */
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    if (tab.dataset.vista === "censo") refrescarCenso();
    if (tab.dataset.vista === "stats") refrescarStats();
  });
});

/* Reintentar la cola offline al recuperar señal y al abrir la app */
window.addEventListener("online", sincronizarPendientes);
if (CENSO_CONFIGURADO) sincronizarPendientes();
renderAvisoOffline();
