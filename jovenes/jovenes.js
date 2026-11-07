/* ==========================================================================
   Lista privada de jóvenes (/jovenes)
   Entra solo el correo autorizado en Supabase (tabla jovenes_admins). Sin
   sesión, o con otra cuenta, la base no devuelve ninguna fila.
   ========================================================================== */

"use strict";

const sb = crearCliente();
const $ = (s) => document.querySelector(s);
const filtro = { texto: "", estado: "", edad: "" };
let jovenes = [];
let usuario = null;

/* ---------- Pantallas ---------- */

function mostrar(cual) {
  $("#cargando").hidden = cual !== "cargando";
  $("#login").hidden = cual !== "login";
  $("#panel").hidden = cual !== "panel";
  $("#btn-salir").hidden = cual !== "panel";
}

function mostrarLogin(mensaje = "") {
  mostrar("login");
  const el = $("#l-error");
  el.textContent = mensaje;
  el.hidden = !mensaje;
}

let temporizadorToast = null;
function toast(texto) {
  const el = $("#toast");
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => (el.hidden = true), 3000);
}

/* ---------- Sesión ---------- */

function mensajeLogin(e) {
  const t = e?.message || "";
  if (/invalid login/i.test(t)) return "Correo o clave incorrectos.";
  if (/not confirmed/i.test(t)) return "Falta confirmar tu correo: revisa tu bandeja de entrada.";
  if (errorDeRed(e)) return "No hay señal. Revisa tu internet.";
  return `No se pudo entrar: ${t}`;
}

async function entrar(user) {
  usuario = user;
  const { data: esEncargado, error } = await sb.rpc("es_admin_jovenes");
  if (error) {
    if (/PGRST202|es_admin_jovenes/.test(`${error.code} ${error.message}`))
      return mostrarLogin("Falta activar la base de datos de jóvenes en Supabase (archivo supabase-jovenes.sql).");
    return mostrarLogin(mensajeLogin(error));
  }
  if (!esEncargado) {
    await sb.auth.signOut();
    return mostrarLogin("Esta cuenta no tiene permiso para ver a los jóvenes.");
  }
  mostrar("panel");
  await cargar();
}

async function iniciarSesion(ev) {
  ev.preventDefault();
  const correo = $("#l-correo").value.trim();
  const clave = $("#l-clave").value;
  if (!correo || !clave) return mostrarLogin("Escribe tu correo y tu clave.");
  const boton = $("#l-entrar");
  boton.disabled = true;
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email: correo, password: clave });
    if (error) return mostrarLogin(mensajeLogin(error));
    $("#l-clave").value = "";
    await entrar(data.user);
  } catch (e) {
    mostrarLogin(mensajeLogin(e));
  } finally {
    boton.disabled = false;
  }
}

async function salir() {
  await sb.auth.signOut();
  jovenes = [];
  usuario = null;
  mostrarLogin();
}

/* ---------- Datos ---------- */

async function cargar() {
  const { data, error } = await sb.from(TABLA_JOVENES).select("*").eq("eliminado", false).order("creado_en", { ascending: false });
  if (error) {
    if (tablaNoExiste(error)) {
      $("#lista").innerHTML = `<div class="card vacio-card">Falta crear la tabla de jóvenes en Supabase (archivo supabase-jovenes.sql).</div>`;
      $("#resumen").innerHTML = "";
      return;
    }
    if (/jwt|expired|not authenticated/i.test(error.message)) return mostrarLogin("Tu sesión venció. Entra de nuevo.");
    $("#lista").innerHTML = `<div class="card vacio-card">⚠️ No se pudo cargar la lista.<span class="texto-suave">${esc(error.message)}</span></div>`;
    return;
  }
  jovenes = data;
  pintarTodo();
}

async function actualizar(id, cambios, textoOk) {
  const { error } = await sb.from(TABLA_JOVENES).update(cambios).eq("id", id);
  if (error) {
    toast(`No se pudo guardar: ${error.message}`);
    return false;
  }
  const j = jovenes.find((x) => x.id === id);
  if (j) Object.assign(j, cambios);
  if (textoOk) toast(textoOk);
  return true;
}

/* ---------- Pantalla principal ---------- */

const edadDe = (j) => edadDesde(j.fecha_nacimiento);
const esMenor = (j) => (edadDe(j) ?? 99) < JOVENES_MAYORIA;

function fechaLarga(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-VE", { day: "numeric", month: "short", year: "numeric" });
}

function hace(iso) {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  return new Date(iso).toLocaleDateString("es-VE", { day: "numeric", month: "short" });
}

function filtrados() {
  const t = filtro.texto.trim().toLowerCase();
  return jovenes.filter((j) => {
    if (filtro.estado && j.estado !== filtro.estado) return false;
    if (filtro.edad === "menores" && !esMenor(j)) return false;
    if (filtro.edad === "mayores" && esMenor(j)) return false;
    if (t) {
      const pajar = [j.nombre, formatoLocal(j.telefono), j.telefono, j.redes, j.representante, j.notas].join(" ").toLowerCase();
      if (!pajar.includes(t)) return false;
    }
    return true;
  });
}

function pintarResumen() {
  const nuevos = jovenes.filter((j) => j.estado === "nuevo").length;
  const menores = jovenes.filter(esMenor).length;
  $("#resumen").innerHTML = `
    <div class="kpis">
      <div class="kpi destacado"><span class="kpi-valor">${jovenes.length}</span><span class="kpi-etiqueta">Jóvenes</span></div>
      <div class="kpi"><span class="kpi-valor">${nuevos}</span><span class="kpi-etiqueta">Nuevos</span></div>
      <div class="kpi"><span class="kpi-valor">${menores}</span><span class="kpi-etiqueta">Menores de 18</span></div>
    </div>`;
}

function mensajeJoven(j) {
  const nombre = j.nombre.split(" ")[0];
  const grupo = JOVENES_GRUPO_WHATSAPP ? ` Únete a nuestro grupo de WhatsApp: ${JOVENES_GRUPO_WHATSAPP}` : "";
  return `¡Hola ${nombre}! 🙌 Somos del grupo de jóvenes de la Parroquia San Benito de Palermo. Gracias por anotarte, queremos invitarte a nuestras próximas actividades.${grupo}`;
}

function mensajeRepresentante(j) {
  return `Saludos, ${j.representante} 🙏. Le escribimos de la Parroquia San Benito de Palermo: ${j.nombre} se anotó en el grupo de jóvenes y queremos invitarlo(a) a nuestras actividades. ¿Podemos contar con su permiso?`;
}

const linkWA = (tel, msg) => `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;

function cardJoven(j) {
  const edad = edadDe(j);
  const menor = esMenor(j);
  return `
    <div class="card joven-card" data-id="${esc(j.id)}">
      <div class="joven-cab">
        <div class="joven-info">
          <strong class="persona-nombre">${esc(j.nombre)}${edad !== null ? ` <span class="persona-edad">· ${edad} años</span>` : ""}</strong>
          <div class="persona-censo-badges">
            ${menor ? `<span class="badge cat">👪 Menor de edad</span>` : ""}
            <span class="badge cat">📅 ${esc(hace(j.creado_en))}</span>
          </div>
        </div>
        <select class="select-estado est-${j.estado === "nuevo" ? "pendiente" : j.estado === "contactado" ? "en-proceso" : j.estado === "activo" ? "atendido" : "pendiente"}" data-accion="estado" data-id="${esc(j.id)}" aria-label="Estado">
          ${Object.entries(JOVENES_ESTADOS).map(([k, v]) => `<option value="${k}" ${k === j.estado ? "selected" : ""}>${v}</option>`).join("")}
        </select>
      </div>
      <div class="casa-linea">📞 <a href="tel:+${esc(j.telefono)}">${esc(formatoLocal(j.telefono))}</a></div>
      <div class="casa-linea">🎂 <span>${esc(fechaLarga(j.fecha_nacimiento))}</span></div>
      ${j.redes ? `<div class="casa-linea">📲 <span class="joven-redes">${esc(j.redes)}</span></div>` : ""}
      ${
        menor
          ? `<div class="joven-repr">
               <strong>👪 Representante</strong>
               <span>${esc(j.representante || "—")}</span>
               ${j.telefono_representante ? `<a href="tel:+${esc(j.telefono_representante)}">📞 ${esc(formatoLocal(j.telefono_representante))}</a>` : ""}
             </div>`
          : ""
      }
      <textarea class="joven-nota" rows="2" data-accion="nota" data-id="${esc(j.id)}" placeholder="Notas del encargado…">${esc(j.notas || "")}</textarea>
      <div class="casa-acciones">
        <a class="btn btn-whatsapp btn-chip" href="${linkWA(j.telefono, mensajeJoven(j))}" target="_blank" rel="noopener">WhatsApp</a>
        ${
          menor && j.telefono_representante
            ? `<a class="btn btn-whatsapp btn-chip" href="${linkWA(j.telefono_representante, mensajeRepresentante(j))}" target="_blank" rel="noopener">WhatsApp al representante</a>`
            : ""
        }
        <span class="espaciador"></span>
        <button class="btn btn-icono peligro" data-accion="quitar" data-id="${esc(j.id)}" type="button" title="Quitar de la lista" aria-label="Quitar de la lista">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
        </button>
      </div>
    </div>`;
}

function pintarLista() {
  const lista = filtrados();
  const hayFiltros = filtro.texto || filtro.estado || filtro.edad;
  if (!jovenes.length) {
    $("#lista").innerHTML = `
      <div class="card vacio-card">
        <span class="vacio-icono">🙌</span>
        <strong>Todavía no hay jóvenes anotados</strong>
        <span class="texto-suave">Comparte el QR o el enlace de registro y aparecerán aquí.</span>
      </div>`;
    return;
  }
  $("#lista").innerHTML = `
    <p class="censo-contador">${lista.length} ${lista.length === 1 ? "joven" : "jóvenes"}${hayFiltros ? " (con filtros)" : ""}</p>
    ${lista.map(cardJoven).join("") || `<div class="card vacio-card">Nadie coincide con los filtros.</div>`}`;
}

function pintarTodo() {
  pintarResumen();
  pintarLista();
}

/* ---------- Acciones ---------- */

function exportar() {
  if (typeof XLSX === "undefined") return alert("No se pudo cargar el generador de Excel. Revisa tu internet e inténtalo de nuevo.");
  const lista = filtrados();
  if (!lista.length) return alert("No hay jóvenes con estos filtros.");
  const filas = lista.map((j) => ({
    Nombre: j.nombre,
    "Fecha de nacimiento": j.fecha_nacimiento,
    Edad: edadDe(j) ?? "",
    Teléfono: formatoLocal(j.telefono),
    "Redes sociales": j.redes || "",
    Representante: j.representante || "",
    "Teléfono del representante": formatoLocal(j.telefono_representante),
    Estado: JOVENES_ESTADOS[j.estado] || j.estado,
    Notas: j.notas || "",
    "Fecha de registro": new Date(j.creado_en).toLocaleDateString("es-VE"),
  }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), "Jóvenes");
  XLSX.writeFile(libro, `jovenes-san-benito-${isoLocal()}.xlsx`);
}

async function copiarEnlace() {
  const enlace = new URL("registro.html", location.href).href;
  try {
    await navigator.clipboard.writeText(enlace);
    toast("Enlace copiado");
  } catch {
    window.prompt("Copia este enlace:", enlace);
  }
}

async function quitar(id) {
  const j = jovenes.find((x) => x.id === id);
  if (!j || !confirm(`¿Quitar a ${j.nombre} de la lista?`)) return;
  if (await actualizar(id, { eliminado: true }, "Quitado de la lista")) {
    jovenes = jovenes.filter((x) => x.id !== id);
    pintarTodo();
  }
}

/* ---------- Eventos ---------- */

document.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-accion]");
  if (!el) return;
  const a = el.dataset.accion;
  if (a === "salir") salir();
  else if (a === "recargar") cargar();
  else if (a === "exportar") exportar();
  else if (a === "copiar-enlace") copiarEnlace();
  else if (a === "quitar") quitar(el.dataset.id);
});

document.addEventListener("change", async (ev) => {
  const el = ev.target;
  if (el.dataset.accion === "estado") {
    if (await actualizar(el.dataset.id, { estado: el.value }, `Estado: ${JOVENES_ESTADOS[el.value]}`)) pintarTodo();
    else pintarLista();
  } else if (el.dataset.accion === "nota") {
    const nota = el.value.trim() || null;
    const j = jovenes.find((x) => x.id === el.dataset.id);
    if (j && (j.notas || null) !== nota) await actualizar(el.dataset.id, { notas: nota }, "Nota guardada");
  } else if (el.id === "filtro-estado") {
    filtro.estado = el.value;
    pintarLista();
  } else if (el.id === "filtro-edad") {
    filtro.edad = el.value;
    pintarLista();
  }
});

document.addEventListener("input", (ev) => {
  if (ev.target.id === "filtro-texto") {
    filtro.texto = ev.target.value;
    pintarLista();
  }
});

$("#form-login").addEventListener("submit", iniciarSesion);
$("#filtro-estado").insertAdjacentHTML("beforeend", Object.entries(JOVENES_ESTADOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join(""));

(async function iniciar() {
  if (!sb) return mostrarLogin("No se pudo conectar. Revisa tu internet y recarga la página.");
  try {
    const { data } = await sb.auth.getSession();
    if (data.session) await entrar(data.session.user);
    else mostrarLogin();
  } catch (e) {
    mostrarLogin(mensajeLogin(e));
  }
})();
