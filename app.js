"use strict";

/* ==========================================================================
   Base de datos de las Misiones — Parroquia "El Buen Pastor"
   17 al 27 de julio de 2026
   ========================================================================== */

const SEMINARISTAS = [
  "Armando Celis",
  "Alfenyer Fernández",
  "Luis Polanco",
  "Rances Mercado",
  "Jorge Reyes",
  "Mario Soto",
  "Alejandro Rubio",
  "Dany Araujo",
  "Rixio García",
  "Paul Urdaneta",
];

const ROLES_FIJOS = [
  { rol: "Cocina (responsable)", icono: "🍲", personas: ["Dany Araujo"] },
  { rol: "Liturgia (responsable)", icono: "📖", personas: ["Armando Celis"] },
  {
    rol: "Limpieza, mantenimiento y logística de baño",
    icono: "🧹",
    personas: ["Jorge Reyes", "Alejandro Rubio"],
  },
  { rol: "Primeros auxilios", icono: "⛑️", personas: ["Mario Soto"] },
  { rol: "Material fotográfico", icono: "📷", personas: ["Luis Polanco"] },
  {
    rol: "Reseña diaria y documentación",
    icono: "📝",
    personas: ["Rances Mercado"],
  },
  {
    rol: "Coro",
    icono: "🎵",
    personas: ["Alfenyer Fernández", "Dany Araujo", "Alejandro Rubio", "Armando Celis"],
  },
];

/*
  Rotación interna:
  - Cocina: 2 por día. Nadie repite en días seguidos, ninguna pareja se
    repite y nadie tiene cocina y liturgia el mismo día. Todos cocinan
    2 veces; los 2 turnos extra del día 27 (despedida) los cubren
    Dany Araujo (responsable de cocina) y Rixio García.
  - Liturgia: 2 por día, con las mismas reglas de la cocina. Todos sirven
    2 veces; los 2 turnos extra los cubren Armando Celis (responsable de
    liturgia, presente en la llegada y la despedida) y Jorge Reyes.
*/

const DIAS = [
  {
    fecha: "2026-07-17",
    nombre: "Viernes 17",
    titulo: "Recibimiento de los seminaristas",
    especial: true,
    actividades: [{ turno: "6:00 PM", desc: "Eucaristía de recibimiento" }],
    responsables: ["Templo parroquial"],
    alimentacion: [],
    cocina: ["Dany Araujo", "Paul Urdaneta"],
    liturgia: ["Armando Celis", "Luis Polanco"],
  },
  {
    fecha: "2026-07-18",
    nombre: "Sábado 18",
    titulo: "Sector La Chamarreta",
    actividades: [
      {
        turno: "Todo el día",
        desc: "Jornada de evangelización, actividad con los jóvenes y los niños en el sector La Chamarreta",
      },
    ],
    responsables: ["Filial Divino Niño"],
    alimentacion: ["Almuerzo", "Transporte"],
    cocina: ["Armando Celis", "Alfenyer Fernández"],
    liturgia: ["Jorge Reyes", "Rixio García"],
  },
  {
    fecha: "2026-07-19",
    nombre: "Domingo 19",
    titulo: "Domingo parroquial",
    actividades: [
      { turno: "Mañana", desc: "Eucaristías dominicales" },
      { turno: "Día", desc: "Comuniones" },
      { turno: "Tarde", desc: "Rosario en un sector" },
    ],
    responsables: ["Templo parroquial"],
    alimentacion: [],
    cocina: ["Luis Polanco", "Rances Mercado"],
    liturgia: ["Alfenyer Fernández", "Mario Soto"],
  },
  {
    fecha: "2026-07-20",
    nombre: "Lunes 20",
    titulo: "Visita a los enfermos",
    actividades: [
      { turno: "Mañana", desc: "Visita a los enfermos" },
      { turno: "Tarde", desc: "Visita a los enfermos" },
    ],
    responsables: ["Delegados de la palabra y Sagrada Comunión"],
    alimentacion: ["Desayuno", "Almuerzo (Marianela)"],
    cocina: ["Jorge Reyes", "Mario Soto"],
    liturgia: ["Dany Araujo", "Paul Urdaneta"],
  },
  {
    fecha: "2026-07-21",
    nombre: "Martes 21",
    titulo: "Jornada de evangelización",
    actividades: [
      { turno: "Mañana", desc: "Jornada de evangelización" },
      { turno: "Tarde", desc: "Rosario en un sector" },
    ],
    responsables: ["Legión de María"],
    alimentacion: ["Almuerzo", "Cena"],
    cocina: ["Alejandro Rubio", "Rixio García"],
    liturgia: ["Rances Mercado", "Jorge Reyes"],
  },
  {
    fecha: "2026-07-22",
    nombre: "Miércoles 22",
    titulo: "Sector Altos III",
    actividades: [
      { turno: "Mañana", desc: "Jornada de evangelización en el sector Altos III" },
      { turno: "Tarde", desc: "Actividad juvenil" },
    ],
    responsables: [
      "C.E. Rosa Mística (mañana)",
      "Pastoral Juvenil y Hermandad de Samuel (tarde)",
    ],
    alimentacion: [
      "Almuerzo y transporte (C.E. Rosa Mística)",
      "Cena (Pastoral Juvenil y H. Samuel)",
    ],
    cocina: ["Dany Araujo", "Luis Polanco"],
    liturgia: ["Armando Celis", "Alejandro Rubio"],
  },
  {
    fecha: "2026-07-23",
    nombre: "Jueves 23",
    titulo: "Sol Amado",
    actividades: [
      { turno: "Mañana", desc: "Actividad y jornada de evangelización en Sol Amado" },
      { turno: "Tarde", desc: "Actividad con las familias" },
    ],
    responsables: ["Filial Divino Niño (mañana)", "Pastoral familiar (tarde)"],
    alimentacion: [
      "Desayuno, almuerzo y transporte (C.E. Rosa Mística)",
      "Cena (Pastoral Juvenil y H. Samuel)",
    ],
    cocina: ["Paul Urdaneta", "Jorge Reyes"],
    liturgia: ["Luis Polanco", "Rixio García"],
  },
  {
    fecha: "2026-07-24",
    nombre: "Viernes 24",
    titulo: "Sector Las Trinitarias",
    actividades: [
      { turno: "Mañana", desc: "Jornada de evangelización en el sector Las Trinitarias" },
      { turno: "Tarde", desc: "Formación litúrgica" },
    ],
    responsables: ["C.E. Santísima Trinidad (mañana)", "Cofradías (tarde)"],
    alimentacion: [
      "Desayuno y transporte (C.E. Santísima Trinidad)",
      "Cena (Cofradías)",
    ],
    cocina: ["Armando Celis", "Alejandro Rubio"],
    liturgia: ["Dany Araujo", "Mario Soto"],
  },
  {
    fecha: "2026-07-25",
    nombre: "Sábado 25",
    titulo: "Sector Altos II",
    actividades: [
      { turno: "Mañana", desc: "Jornada de evangelización en el sector Altos II" },
      { turno: "Tarde", desc: "Formación con los monaguillos" },
    ],
    responsables: [
      "C.E. Jesús de la Divina Misericordia y Pastoral de Catequesis (mañana)",
      "Pastoral de monaguillos (tarde)",
    ],
    alimentacion: [
      "Almuerzo y transporte (C.E. Jesús de la Divina Misericordia)",
      "Compartir (Monaguillos)",
    ],
    cocina: ["Alfenyer Fernández", "Rixio García"],
    liturgia: ["Rances Mercado", "Alejandro Rubio"],
  },
  {
    fecha: "2026-07-26",
    nombre: "Domingo 26",
    titulo: "Domingo parroquial",
    actividades: [
      { turno: "Mañana", desc: "Eucaristías dominicales" },
      { turno: "Día", desc: "Actividad con los niños" },
    ],
    responsables: [
      "EMC",
      "Caritas",
      "Renovación Carismática",
      "Cursillos de Cristiandad",
    ],
    alimentacion: [
      "Desayuno: EMC y Caritas",
      "Almuerzo: Renovación Carismática",
      "Cena: Cursillos de Cristiandad",
    ],
    cocina: ["Rances Mercado", "Mario Soto"],
    liturgia: ["Alfenyer Fernández", "Paul Urdaneta"],
  },
  {
    fecha: "2026-07-27",
    nombre: "Lunes 27",
    titulo: "Despedida de los seminaristas",
    especial: true,
    actividades: [{ turno: "Día", desc: "Despedida de los seminaristas" }],
    responsables: ["Templo parroquial"],
    alimentacion: [],
    cocina: ["Dany Araujo", "Rixio García"],
    liturgia: ["Armando Celis", "Jorge Reyes"],
  },
];

const NOTAS = [
  "Si algún grupo necesita algún requerimiento en la alimentación, puede comunicarlo.",
  "Si algún grupo desea colaborar otro día con la alimentación, también puede comunicarlo.",
];

/* ==========================================================================
   Utilidades
   ========================================================================== */

const $ = (sel) => document.querySelector(sel);

function primerNombre(nombre) {
  return nombre.split(" ")[0];
}

function iniciales(nombre) {
  return nombre
    .split(" ")
    .map((p) => p[0])
    .join("");
}

// Fecha local de hoy en formato YYYY-MM-DD (sin sorpresas de zona horaria)
function hoyISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dia}`;
}

function indiceDiaInicial() {
  const hoy = hoyISO();
  const idx = DIAS.findIndex((d) => d.fecha === hoy);
  if (idx !== -1) return idx;
  if (hoy > DIAS[DIAS.length - 1].fecha) return DIAS.length - 1;
  return 0;
}

function chipPersona(nombre, extra = "") {
  return `<span class="persona ${extra}"><span class="avatar">${iniciales(
    nombre
  )}</span>${nombre}</span>`;
}

/* ==========================================================================
   Vista: Por día
   ========================================================================== */

let diaSeleccionado = indiceDiaInicial();

function renderSelectorDias() {
  const cont = $("#selector-dias");
  cont.innerHTML = DIAS.map((d, i) => {
    const [dow, num] = d.nombre.split(" ");
    const esHoy = d.fecha === hoyISO();
    return `<button class="dia-chip ${i === diaSeleccionado ? "activo" : ""}" data-dia="${i}">
        <span class="dia-chip-dow">${dow.slice(0, 3)}</span>
        <span class="dia-chip-num">${num}</span>
        ${esHoy ? '<span class="dia-chip-hoy">HOY</span>' : ""}
      </button>`;
  }).join("");
  cont.querySelectorAll(".dia-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      diaSeleccionado = Number(btn.dataset.dia);
      renderSelectorDias();
      renderDia();
    });
  });
  const activo = cont.querySelector(".dia-chip.activo");
  if (activo) activo.scrollIntoView({ block: "nearest", inline: "center" });
}

function renderDia() {
  const d = DIAS[diaSeleccionado];
  const esHoy = d.fecha === hoyISO();

  const actividades = d.actividades
    .map(
      (a) => `<li><span class="badge turno">${a.turno}</span>${a.desc}</li>`
    )
    .join("");

  const responsables = d.responsables
    .map((r) => `<li>${r}</li>`)
    .join("");

  const alimentacion = d.alimentacion.length
    ? d.alimentacion.map((a) => `<li>${a}</li>`).join("")
    : "<li class='vacio'>Cocina del equipo misionero</li>";

  $("#vista-dia-detalle").innerHTML = `
    <div class="card dia-encabezado ${d.especial ? "especial" : ""}">
      <h2>${d.nombre} de julio ${esHoy ? '<span class="badge hoy">Hoy</span>' : ""}</h2>
      <p class="dia-titulo">${d.titulo}</p>
    </div>

    <div class="card">
      <h3>📅 Actividades</h3>
      <ul class="lista">${actividades}</ul>
    </div>

    <div class="card equipo-dia">
      <h3>🏠 Equipo interno del día</h3>
      <div class="asignacion">
        <span class="asignacion-rol">🍲 Cocina</span>
        <div class="personas">${d.cocina.map((p) => chipPersona(p)).join("")}</div>
      </div>
      <div class="asignacion">
        <span class="asignacion-rol">📖 Liturgia</span>
        <div class="personas">${d.liturgia.map((p) => chipPersona(p)).join("")}</div>
      </div>
    </div>

    <div class="card">
      <h3>🤝 Responsables parroquiales</h3>
      <ul class="lista">${responsables}</ul>
    </div>

    <div class="card">
      <h3>🍽️ Alimentación</h3>
      <ul class="lista">${alimentacion}</ul>
    </div>
  `;
}

/* ==========================================================================
   Vista: Mi turno
   ========================================================================== */

let seminaristaSeleccionado = null;

function renderSelectorSeminaristas() {
  const cont = $("#selector-seminaristas");
  cont.innerHTML = SEMINARISTAS.map(
    (s) => `<button class="sem-chip ${
      s === seminaristaSeleccionado ? "activo" : ""
    }" data-sem="${s}">
        <span class="avatar">${iniciales(s)}</span>${primerNombre(s)}
      </button>`
  ).join("");
  cont.querySelectorAll(".sem-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      seminaristaSeleccionado = btn.dataset.sem;
      renderSelectorSeminaristas();
      renderMiTurno();
    });
  });
}

function renderMiTurno() {
  const cont = $("#vista-mi-detalle");
  const s = seminaristaSeleccionado;
  if (!s) {
    cont.innerHTML =
      '<div class="card vacio-card">Elige tu nombre para ver tus turnos ⬆️</div>';
    return;
  }

  const rolesFijos = ROLES_FIJOS.filter((r) => r.personas.includes(s));
  const diasCocina = DIAS.filter((d) => d.cocina.includes(s));
  const diasLiturgia = DIAS.filter((d) => d.liturgia.includes(s));

  const rolesHTML = rolesFijos.length
    ? rolesFijos
        .map(
          (r) =>
            `<li><span class="badge rol">${r.icono}</span>${r.rol}<span class="rol-nota">todos los días</span></li>`
        )
        .join("")
    : "<li class='vacio'>Sin rol fijo asignado</li>";

  const turnosDia = (lista, icono, etiqueta) =>
    lista
      .map((d) => {
        const companeros = (etiqueta === "Cocina" ? d.cocina : d.liturgia).filter(
          (p) => p !== s
        );
        return `<li>
            <span class="badge turno">${d.nombre}</span>
            <strong>${icono} ${etiqueta}</strong>
            ${
              companeros.length
                ? `<span class="rol-nota">con ${companeros
                    .map(primerNombre)
                    .join(" y ")}</span>`
                : ""
            }
            <span class="mini-dia">${d.titulo}</span>
          </li>`;
      })
      .join("");

  cont.innerHTML = `
    <div class="card dia-encabezado">
      <h2>${s}</h2>
      <p class="dia-titulo">${diasCocina.length} turno(s) de cocina · ${diasLiturgia.length} de liturgia</p>
    </div>

    <div class="card">
      <h3>⭐ Roles fijos</h3>
      <ul class="lista">${rolesHTML}</ul>
    </div>

    <div class="card">
      <h3>🍲 Mis días de cocina</h3>
      <ul class="lista turnos">${turnosDia(diasCocina, "🍲", "Cocina")}</ul>
    </div>

    <div class="card">
      <h3>📖 Mis días de liturgia</h3>
      <ul class="lista turnos">${turnosDia(diasLiturgia, "📖", "Liturgia")}</ul>
    </div>
  `;
}

/* ==========================================================================
   Vista: Cronograma completo
   ========================================================================== */

function renderCronograma() {
  const filas = DIAS.map((d) => {
    const acts = d.actividades
      .map((a) => `<div><strong>${a.turno}:</strong> ${a.desc}</div>`)
      .join("");
    const resp = d.responsables.map((r) => `<div>${r}</div>`).join("");
    const alim = d.alimentacion.length
      ? d.alimentacion.map((a) => `<div>${a}</div>`).join("")
      : "<div>—</div>";
    return `<tr class="${d.especial ? "fila-especial" : ""}">
        <td class="col-dia"><strong>${d.nombre}</strong><br><span class="mini-dia">${d.titulo}</span></td>
        <td>${acts}</td>
        <td>${resp}</td>
        <td>${alim}</td>
        <td>${d.cocina.map(primerNombre).join(" y ")}</td>
        <td>${d.liturgia.map(primerNombre).join(", ")}</td>
      </tr>`;
  }).join("");

  $("#tabla-cronograma tbody").innerHTML = filas;
  $("#notas-cronograma").innerHTML =
    "<h3>Nota</h3><ul class='lista'>" +
    NOTAS.map((n) => `<li>${n}</li>`).join("") +
    "</ul>";
}

/* ==========================================================================
   Vista: Equipo
   ========================================================================== */

function renderEquipo() {
  const roles = ROLES_FIJOS.map(
    (r) => `<div class="card">
        <h3>${r.icono} ${r.rol}</h3>
        <div class="personas">${r.personas.map((p) => chipPersona(p)).join("")}</div>
      </div>`
  ).join("");

  const resumen = SEMINARISTAS.map((s) => {
    const c = DIAS.filter((d) => d.cocina.includes(s)).length;
    const l = DIAS.filter((d) => d.liturgia.includes(s)).length;
    return `<tr><td>${s}</td><td>${c}</td><td>${l}</td></tr>`;
  }).join("");

  $("#vista-equipo-detalle").innerHTML = `
    <div class="card">
      <h3>👥 Seminaristas misioneros</h3>
      <div class="personas">${SEMINARISTAS.map((p) => chipPersona(p)).join("")}</div>
    </div>
    ${roles}
    <div class="card">
      <h3>⚖️ Distribución de turnos</h3>
      <div class="tabla-scroll">
        <table class="tabla-resumen">
          <thead><tr><th>Seminarista</th><th>Cocina</th><th>Liturgia</th></tr></thead>
          <tbody>${resumen}</tbody>
        </table>
      </div>
      <p class="mini-dia">Todos cocinan 2 veces; Dany (responsable de cocina) y Rixio cubren el día de la despedida. En liturgia todos sirven 2 veces; Armando (responsable de liturgia) y Jorge cubren los turnos extra.</p>
    </div>
  `;
}

/* ==========================================================================
   Navegación
   ========================================================================== */

function mostrarVista(id) {
  document.querySelectorAll(".vista").forEach((v) => {
    v.classList.toggle("visible", v.id === `vista-${id}`);
  });
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("activo", t.dataset.vista === id);
  });
  window.scrollTo({ top: 0 });
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => mostrarVista(tab.dataset.vista));
});

/* ==========================================================================
   Inicio
   ========================================================================== */

renderSelectorDias();
renderDia();
renderSelectorSeminaristas();
renderMiTurno();
renderCronograma();
renderEquipo();
mostrarVista("dia");
