/* ==========================================================================
   Registro público de jóvenes (se llega con el QR). Solo escribe en la tabla
   "jovenes": con la clave pública no se puede leer nada de lo que hay ahí.
   ========================================================================== */

"use strict";

const sb = crearCliente();
const LS_ANOTADO = "jovenes_anotado";
const $ = (s) => document.querySelector(s);

/* ---------- Formulario ---------- */

function edadEscrita() {
  return edadDesde($("#f-nacimiento").value);
}

function actualizarMenor() {
  const e = edadEscrita();
  $("#bloque-menor").hidden = !(e !== null && e >= 0 && e < JOVENES_MAYORIA);
}

function mostrarError(msg, campo) {
  const el = $("#f-error");
  el.textContent = msg;
  el.hidden = false;
  if (campo) {
    const c = $(campo);
    c.focus({ preventScroll: true });
    c.scrollIntoView({ behavior: "smooth", block: "center" });
  } else {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

/* Devuelve la fila lista para guardar, o null si hay algo que corregir */
function leerFormulario() {
  const nombre = $("#f-nombre").value.trim().replace(/\s+/g, " ");
  if (nombre.split(" ").filter((p) => p.length > 1).length < 2) return mostrarError("Escribe tu nombre y apellido.", "#f-nombre"), null;

  const nacimiento = $("#f-nacimiento").value;
  const edad = edadDesde(nacimiento);
  if (edad === null) return mostrarError("Escribe tu fecha de nacimiento.", "#f-nacimiento"), null;
  if (edad < JOVENES_EDAD_MIN || edad > JOVENES_EDAD_MAX)
    return mostrarError(`Revisa tu fecha de nacimiento: este grupo es para jóvenes de ${JOVENES_EDAD_MIN} a ${JOVENES_EDAD_MAX} años.`, "#f-nacimiento"), null;

  const telefono = normalizarTelefono($("#f-telefono").value);
  if (!telefono) return mostrarError("Escribe tu número de WhatsApp, por ejemplo 0414-1234567.", "#f-telefono"), null;

  let representante = null;
  let telefonoRepresentante = null;
  if (edad < JOVENES_MAYORIA) {
    representante = $("#f-repr").value.trim().replace(/\s+/g, " ");
    if (representante.split(" ").filter((p) => p.length > 1).length < 2)
      return mostrarError("Escribe el nombre y apellido de tu papá, mamá o representante.", "#f-repr"), null;
    telefonoRepresentante = normalizarTelefono($("#f-telrepr").value);
    if (!telefonoRepresentante) return mostrarError("Escribe el WhatsApp de tu representante, por ejemplo 0412-1234567.", "#f-telrepr"), null;
  }

  if (!$("#f-autoriza").checked) return mostrarError("Marca la casilla de autorización para poder anotarte.", "#f-autoriza"), null;

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : uuidSimple(),
    nombre,
    fecha_nacimiento: nacimiento,
    telefono,
    redes: $("#f-redes").value.trim() || null,
    representante,
    telefono_representante: telefonoRepresentante,
    consentimiento: true,
  };
}

function uuidSimple() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
  );
}

function mostrarExito(nombre) {
  $("#form").hidden = true;
  $("#portada").hidden = true;
  $("#aviso-ya").hidden = true;
  $("#exito-titulo").textContent = `¡Listo, ${nombre.split(" ")[0]}!`;
  const grupo = $("#exito-grupo");
  grupo.hidden = !JOVENES_GRUPO_WHATSAPP;
  if (JOVENES_GRUPO_WHATSAPP) grupo.href = JOVENES_GRUPO_WHATSAPP;
  $("#exito").hidden = false;
  window.scrollTo({ top: 0 });
}

function reiniciar() {
  $("#form").reset();
  $("#f-error").hidden = true;
  actualizarMenor();
  $("#exito").hidden = true;
  $("#form").hidden = false;
  $("#portada").hidden = false;
  $("#aviso-ya").hidden = true;
  window.scrollTo({ top: 0 });
}

async function enviar(ev) {
  ev.preventDefault();
  $("#f-error").hidden = true;
  // Trampa: un programa llenó el campo escondido. Se finge éxito y no se guarda nada.
  if ($("#f-sitio").value) return mostrarExito("amigo");
  const fila = leerFormulario();
  if (!fila) return;
  if (!sb) return mostrarError("No se pudo conectar. Revisa tu internet y vuelve a abrir esta página.");

  const boton = $("#f-enviar");
  boton.disabled = true;
  boton.textContent = "Enviando…";
  try {
    const { error } = await sb.from(TABLA_JOVENES).insert(fila);
    // 23505: ya se había guardado en un intento anterior (mismo id)
    if (error && error.code !== "23505") throw error;
    try {
      localStorage.setItem(LS_ANOTADO, new Date().toISOString());
    } catch {
      /* sin almacenamiento: solo se pierde el aviso de "ya te anotaste" */
    }
    mostrarExito(fila.nombre);
  } catch (e) {
    if (tablaNoExiste(e)) mostrarError("El registro todavía no está habilitado. Avisa al encargado de los jóvenes.");
    else if (errorDeRed(e)) mostrarError("No hay señal. Revisa tu internet y toca «Anotarme» otra vez.");
    else mostrarError("No se pudo guardar tu registro. Inténtalo de nuevo en un momento.");
  } finally {
    boton.disabled = false;
    boton.textContent = "Anotarme";
  }
}

/* ---------- Inicio ---------- */

$("#f-nacimiento").max = isoLocal();
try {
  if (localStorage.getItem(LS_ANOTADO)) $("#aviso-ya").hidden = false;
} catch {
  /* sin almacenamiento */
}
$("#f-nacimiento").addEventListener("input", actualizarMenor);
$("#f-nacimiento").addEventListener("change", actualizarMenor);
$("#form").addEventListener("submit", enviar);
$("#exito-otra").addEventListener("click", reiniciar);
