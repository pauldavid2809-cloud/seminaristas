# Censo parroquial · Parroquia "San Benito de Palermo"

Webapp de censo casa por casa (Arquidiócesis de Maracaibo) para las **8 zonas** de la parroquia San Benito de Palermo. Registra las casas visitadas y sus personas para el seguimiento parroquial. La estructura nació en la Parroquia El Buen Pastor (misiones de julio 2026) y es reutilizable para cualquier censo o jornada de visitas.

## Qué incluye

- **Censo**: registro de las casas visitadas y sus personas — enfermos, niños para Primera Comunión y Confirmación, personas vulnerables, bautizos pendientes, matrimonios por regularizar y unción/comunión a enfermos. Los datos se comparten entre todos los teléfonos (Supabase). Cada persona tiene estado de seguimiento (pendiente / en proceso / atendido) y botón de WhatsApp con mensaje personalizado según sus categorías. Si se registra sin señal, queda guardado en el teléfono y se envía al recuperar conexión. Incluye la guía de preguntas para la visita y la exportación a Excel (una hoja por zona).
- **Stats**: estadísticas del censo en vivo — totales por categoría, por zona, por día, y la tabla categoría × zona para organizar el seguimiento. Incluye un botón para descargar un PDF.

## Cómo usarla

Es una página estática, sin dependencias: abre `index.html` en el navegador, o publícala con GitHub Pages.

## Conectar el Censo (Supabase, gratis, ~15 min)

1. Crear un proyecto en [supabase.com](https://supabase.com) (plan Free). Hacerlo pocos días antes de empezar a usarlo: los proyectos gratuitos se pausan tras ~7 días sin uso (se reactivan desde el dashboard).
2. En el proyecto: **SQL Editor → New query**, pegar el contenido de [`supabase.sql`](supabase.sql) y ejecutar. Esto crea las zonas (Zona 1 a Zona 8, editables en el script), las tablas del censo y las políticas de seguridad (nadie puede borrar registros de verdad, solo ocultarlos).
3. **Project Settings → API**: copiar la *Project URL* y la *anon public key*, y pegarlas en [`config.js`](config.js).
4. Para renombrar una zona después: SQL Editor → `update sectores set nombre = 'Nombre nuevo' where nombre = 'Zona 1';` — y para agregar otra: `insert into sectores (nombre) values ('Nombre de la zona');`

> Nota: en la base de datos las zonas viven en la tabla `sectores` (nombre heredado del código original).

## Reutilizar la estructura para un censo nuevo

- **Opción A (recomendada)**: crear un proyecto nuevo de Supabase y repetir los pasos de arriba. El censo anterior queda intacto en su propio proyecto.
- **Opción B (mismo proyecto)**: exportar primero el Excel desde la app como respaldo y luego, en el SQL Editor, vaciar los datos conservando la estructura con `truncate table personas, casas;`. Las zonas se ajustan con `update sectores set activo = false where ...` e `insert into sectores ...`.

**Privacidad**: el censo guarda nombres, direcciones y teléfonos. Sin inicio de sesión, cualquiera que tenga el enlace puede verlos: no difundir la URL fuera de quienes deban tener acceso, y exportar/limpiar los datos al terminar cada censo.
