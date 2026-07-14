# Misiones Julio 2026 · Parroquia "El Buen Pastor"

Webapp para las misiones del **17 al 27 de julio de 2026** (Arquidiócesis de Maracaibo, Vicaría Episcopal Territorial Oeste). Permite que cada seminarista vea por día qué le toca.

## Qué incluye

- **Por día**: actividades del cronograma parroquial, responsables (grupos parroquiales), alimentación, y el equipo interno del día (2 de cocina y 2 de liturgia). Al abrirla durante las misiones, muestra el día de hoy automáticamente.
- **Mi turno**: cada seminarista elige su nombre y ve sus roles fijos, sus días de cocina (y con quién) y sus días de liturgia.
- **Cronograma**: la tabla completa de los 11 días, adaptada de la minuta CPP del 03 de julio.
- **Equipo**: los 10 seminaristas, la coordinación general (disciplina y logística: Paul Urdaneta y Rixio García), los roles fijos y el resumen de la distribución de turnos.
- **Censo**: registro de las casas visitadas y sus personas — enfermos, niños para Primera Comunión y Confirmación, personas vulnerables, bautizos pendientes, matrimonios por regularizar y unción/comunión a enfermos. Los datos se comparten entre todos los teléfonos (Supabase). Cada persona tiene estado de seguimiento (pendiente / en proceso / atendido) y botón de WhatsApp directo. Si se registra sin señal, queda guardado en el teléfono y se envía al recuperar conexión.
- **Stats**: estadísticas de la misión en vivo — totales por categoría, por sector, por día, y la tabla categoría × sector para el seguimiento post-misión.

## Rotación

- **Cocina**: 2 por día, sin parejas repetidas ni días seguidos. Todos cocinan 2 veces; Dany Araujo (responsable de cocina) y Rixio García cubren el día extra de la despedida.
- **Liturgia**: 2 por día, con las mismas reglas. Todos sirven 2 veces; Armando Celis (responsable, presente en la llegada y la despedida) y Jorge Reyes cubren los turnos extra.
- Nadie tiene cocina y liturgia el mismo día.

## Cómo usarla

Es una página estática, sin dependencias: abre `index.html` en el navegador, o publícala con GitHub Pages. Los datos (días, actividades, turnos) están al inicio de `app.js` por si hay que ajustar algo.

## Conectar el Censo (Supabase, gratis, ~15 min)

1. Crear un proyecto en [supabase.com](https://supabase.com) (plan Free). Hacerlo pocos días antes de la misión: los proyectos gratuitos se pausan tras ~7 días sin uso (se reactivan desde el dashboard).
2. En el proyecto: **SQL Editor → New query**, pegar el contenido de [`supabase.sql`](supabase.sql) y ejecutar. Esto crea los sectores, las tablas del censo y las políticas de seguridad (nadie puede borrar registros de verdad, solo ocultarlos).
3. **Project Settings → API**: copiar la *Project URL* y la *anon public key*, y pegarlas en [`config.js`](config.js).
4. Para agregar el séptimo sector cuando se defina: SQL Editor → `insert into sectores (nombre) values ('Nombre del sector');`

**Privacidad**: el censo guarda nombres, direcciones y teléfonos. Sin inicio de sesión, cualquiera que tenga el enlace puede verlos: no difundir la URL fuera del equipo misionero y exportar/limpiar los datos al terminar la misión.
