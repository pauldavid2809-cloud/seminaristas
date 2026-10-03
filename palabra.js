/* ==========================================================================
   Díptico de evangelización (Palabra de la semana)
   Lo usan la app (pestaña Palabra) y la página pública palabra.html.
   Los datos vienen de dipticos.js (generado desde el .docx semanal).
   ========================================================================== */

"use strict";

const LISTA_DIPTICOS = typeof DIPTICOS !== "undefined" ? DIPTICOS : [];

const ICONO_LIBRO =
  '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>';
const ICONO_COMPARTIR =
  '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>';
const ICONO_ENLACE =
  '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>';

function svgPalabra(trazos) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${trazos}</svg>`;
}

function escPalabra(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isoLocal(fecha) {
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${m}-${d}`;
}

/* El díptico "de esta semana": el más reciente cuyo domingo cae dentro de
   los próximos 6 días (o ya pasó). Si todos son futuros, el más cercano. */
function dipticoActual(hoy = new Date()) {
  if (!LISTA_DIPTICOS.length) return null;
  const limite = new Date(hoy);
  limite.setDate(limite.getDate() + 6);
  const tope = isoLocal(limite);
  return LISTA_DIPTICOS.find((d) => d.fecha <= tope) || LISTA_DIPTICOS[LISTA_DIPTICOS.length - 1];
}

function dipticoPorId(id) {
  return LISTA_DIPTICOS.find((d) => d.id === id) || null;
}

/* Enlace a la página pública: solo muestra el díptico, nunca datos del censo */
function enlaceDiptico(d) {
  const url = new URL("palabra.html", location.href);
  url.search = `?d=${encodeURIComponent(d.id)}`;
  url.hash = "";
  return url.href;
}

/* "Familia Pérez" -> "Saludos, familia Pérez"; "Pérez" -> "Saludos, familia Pérez" */
function saludoFamilia(familia) {
  const nombre = String(familia || "").trim().replace(/^familia\s+/i, "");
  return nombre ? `Saludos, familia ${nombre}` : "Saludos";
}

function mensajeDiptico(d, saludo = "Saludos") {
  const lineas = [
    `${saludo} 🙏`,
    "Te compartimos la Palabra de esta semana de la Parroquia San Benito de Palermo:",
    "",
    `📖 *${d.titulo}*`,
    `${d.cita} · ${d.fechaTexto}`,
  ];
  if (d.oracion) lineas.push("", `🙏 ${d.oracion}`);
  if (d.misas && d.misas.horarios.length) {
    lineas.push("", `⛪ ${d.misas.titulo || "Misas:"} ${d.misas.horarios.join(" · ")}`);
  }
  if (d.invitacion && d.invitacion.length) lineas.push(d.invitacion.join(" "));
  lineas.push("", `Léelo completo aquí: ${enlaceDiptico(d)}`);
  return lineas.join("\n");
}

/* Con teléfono abre el chat de esa casa; sin teléfono, WhatsApp deja elegir */
function linkWhatsAppDiptico(d, telefono, saludo) {
  const texto = encodeURIComponent(mensajeDiptico(d, saludo));
  return telefono ? `https://wa.me/${telefono}?text=${texto}` : `https://wa.me/?text=${texto}`;
}

function htmlDiptico(d) {
  const e = escPalabra;
  const vive = d.vive || { intro: "", items: [] };
  return `
    <article class="diptico">
      <header class="diptico-portada">
        <img class="diptico-logo" src="img/logo-san-benito.jpg" alt="Parroquia San Benito de Palermo" width="84" height="84" />
        <p class="diptico-sobre">Evangelización · Parroquia San Benito de Palermo</p>
        <h2>${e(d.titulo)}</h2>
        <p class="diptico-cita">${e(d.cita)}</p>
        <p class="diptico-tiempo">${e(d.tiempo)}<br />${e(d.fechaTexto)}</p>
      </header>

      <div class="diptico-acciones">
        <a class="btn btn-whatsapp-grande" href="${linkWhatsAppDiptico(d)}" target="_blank" rel="noopener">
          ${svgPalabra(ICONO_COMPARTIR)} Compartir
        </a>
        <button type="button" class="btn btn-secundario" data-accion="copiar-enlace-diptico" data-id="${e(d.id)}">
          ${svgPalabra(ICONO_ENLACE)} Copiar enlace
        </button>
      </div>

      <section class="diptico-seccion">
        <h3><span>📖</span> Proclamación del Evangelio</h3>
        <p class="diptico-encabezado">${e(d.evangelio.encabezado)}</p>
        ${d.evangelio.parrafos.map((p) => `<p>${e(p)}</p>`).join("")}
        ${d.evangelio.cierre ? `<p class="diptico-cierre">${e(d.evangelio.cierre)}</p>` : ""}
      </section>

      <section class="diptico-seccion">
        <h3><span>✍️</span> Reflexión pastoral</h3>
        ${d.reflexion.map((p) => `<p>${e(p)}</p>`).join("")}
      </section>

      ${
        d.preguntas.length
          ? `<section class="diptico-seccion">
        <h3><span>👨‍👩‍👧</span> Para conversar en familia</h3>
        <ol class="diptico-preguntas">${d.preguntas.map((p) => `<li>${e(p)}</li>`).join("")}</ol>
      </section>`
          : ""
      }

      ${
        d.oracion
          ? `<section class="diptico-seccion diptico-oracion">
        <h3><span>🙏</span> Oración</h3>
        <blockquote>${e(d.oracion)}</blockquote>
      </section>`
          : ""
      }

      ${
        vive.items.length
          ? `<section class="diptico-seccion">
        <h3><span>🌱</span> Vive esta Palabra esta semana</h3>
        ${vive.intro ? `<p class="diptico-intro">${e(vive.intro)}</p>` : ""}
        <ul class="diptico-vive">
          ${vive.items
            .map((i) => `<li>${i.titulo ? `<strong>${e(i.titulo)}:</strong> ` : ""}${e(i.texto)}</li>`)
            .join("")}
        </ul>
      </section>`
          : ""
      }

      <section class="diptico-seccion diptico-esperamos">
        <h3><span>⛪</span> Te esperamos</h3>
        ${d.misas && d.misas.titulo ? `<p class="diptico-intro">${e(d.misas.titulo)}</p>` : ""}
        ${
          d.misas && d.misas.horarios.length
            ? `<ul class="diptico-horarios">${d.misas.horarios.map((h) => `<li>${e(h)}</li>`).join("")}</ul>`
            : ""
        }
        ${(d.invitacion || []).map((p) => `<p>${e(p)}</p>`).join("")}
      </section>
    </article>`;
}

/* Selector de dípticos anteriores (solo si hay más de uno) */
function htmlSelectorDipticos(idActivo, idSemana) {
  if (LISTA_DIPTICOS.length < 2) return "";
  return `
    <label class="diptico-selector">
      <span>Díptico</span>
      <select id="palabra-selector" aria-label="Elegir díptico">
        ${LISTA_DIPTICOS.map(
          (d) =>
            `<option value="${escPalabra(d.id)}" ${d.id === idActivo ? "selected" : ""}>${escPalabra(
              d.fechaTexto
            )} · ${escPalabra(d.titulo)}${d.id === idSemana ? " (esta semana)" : ""}</option>`
        ).join("")}
      </select>
    </label>`;
}

async function copiarEnlaceDiptico(id, boton) {
  const d = dipticoPorId(id);
  if (!d) return;
  const enlace = enlaceDiptico(d);
  try {
    await navigator.clipboard.writeText(enlace);
    const original = boton.innerHTML;
    boton.textContent = "¡Enlace copiado!";
    setTimeout(() => (boton.innerHTML = original), 1800);
  } catch {
    window.prompt("Copia este enlace:", enlace);
  }
}

document.addEventListener("click", (ev) => {
  const el = ev.target.closest('[data-accion="copiar-enlace-diptico"]');
  if (el) copiarEnlaceDiptico(el.dataset.id, el);
});
