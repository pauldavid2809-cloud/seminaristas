# Censo parroquial · Parroquia "San Benito de Palermo"

Webapp de censo casa por casa (Arquidiócesis de Maracaibo) para las **8 zonas** de la parroquia San Benito de Palermo. Registra las casas visitadas y sus personas para el seguimiento parroquial. La estructura nació en la Parroquia El Buen Pastor (misiones de julio 2026) y es reutilizable para cualquier censo o jornada de visitas.

## Qué incluye

- **Ubicación de cada casa**: al registrar una casa la app toma el punto GPS del teléfono (afina unos segundos hasta tener buena precisión). El punto se puede corregir arrastrando el pin o tocando el mapa, con vista de calles o satélite. Cada casa con ubicación tiene botones de **Cómo llegar** (Google Maps) y **Ver en mapa**.
- **Zonas pastorales**: los límites de las 8 zonas y la ubicación de la parroquia vienen de [`datos/zonas-san-benito.kml`](datos/zonas-san-benito.kml) (dibujado en Google Earth) y se usan desde [`zonas.js`](zonas.js), que también guarda el **santo o advocación de cada zona** (Zona 1 · San José, Zona 2 · Corazón de Jesús, Zona 3 · San José Gregorio Hernández, Zona 4 · Divina Pastora, Zona 5 · Virgen de Lourdes, Zona 6 · San Benito de Palermo, Zona 7 · Divina Misericordia, Zona 8 · Nuestra Señora de Coromoto). La app muestra la zona siempre con su santo. Al marcar una casa, la app **detecta sola en qué zona cae** y la elige en el formulario; si se elige otra a mano o el punto queda fuera de las 8 zonas, lo avisa. Las tarjetas también avisan si el punto de una casa cae en otra zona distinta a la asignada.
- **Mapa**: las 8 zonas dibujadas con sus colores y números, la parroquia, y todas las casas censadas; filtro por zona (resalta la zona elegida).
- **Tu ubicación en vivo** (pestaña Mapa): al abrir el mapa aparece tu punto azul con su precisión y un panel que dice **en qué zona estás** (o, si estás fuera, cuál es la más cercana y a qué distancia), **a cuántos metros está la parroquia** (con "Cómo llegar" a pie) y **cuántas casas hay censadas en tu zona** y cuántas tienen pendientes ("Ver casas" abre la lista filtrada). Al pasar a otra zona sale un aviso. "Seguirme" hace que el mapa te acompañe mientras caminas (se apaga si mueves el mapa con el dedo). El GPS solo está activo con la pestaña Mapa abierta y la pantalla encendida, para ahorrar batería.
- **App instalable y sin señal**: se instala en la pantalla de inicio con el logo de la parroquia (Android: botón **Instalar** en la app; iPhone: Safari → Compartir → Agregar a inicio). Gracias al service worker ([`sw.js`](sw.js)) abre aunque no haya señal, muestra el último censo guardado en el teléfono y deja registrar casas nuevas, que se envían solas al volver la conexión. Los mapas de calles que ya se vieron también quedan guardados. Editar, quitar o cambiar estados sí necesita señal.
- **Autorización de la familia**: el formulario de la casa tiene una casilla obligatoria ("La familia autoriza que la Parroquia San Benito de Palermo guarde estos datos para su acompañamiento pastoral"); se guarda si autorizó y cuándo (`consentimiento`, `consentimiento_en`). Las casas sin autorización registrada muestran un aviso, y el Excel incluye la columna.
- **Casas**: registro de las casas visitadas y sus personas — enfermos, niños para Primera Comunión y Confirmación, personas vulnerables, bautizos pendientes, matrimonios por regularizar y unción/comunión a enfermos. Los datos se comparten entre todos los teléfonos (Supabase). Cada persona tiene estado de seguimiento (pendiente / en proceso / atendido) y botón de WhatsApp con mensaje personalizado según sus categorías. Si se registra sin señal, queda guardado en el teléfono y se envía al recuperar conexión. Incluye la guía de preguntas para la visita y la exportación a Excel (una hoja por zona, con coordenadas y enlace a Google Maps de cada casa).
- **Palabra**: el díptico de evangelización de la semana (Evangelio del domingo, reflexión, preguntas para conversar en familia, oración, "Vive esta Palabra", horarios de misa e invitación a la Lectio Divina), con selector de dípticos anteriores. Cada casa con teléfono tiene un botón verde 📖 que envía el díptico por WhatsApp con el nombre de la familia. El enlace del mensaje lleva a [`palabra.html`](palabra.html), una **página pública que solo muestra el díptico** (no carga el censo ni Supabase), para no exponer datos de las familias.
- **Stats**: estadísticas del censo en vivo — totales por categoría, por zona, por día, y la tabla categoría × zona para organizar el seguimiento. Incluye un botón para descargar un PDF.

## Cómo usarla

Es una página estática, sin dependencias: abre `index.html` en el navegador, o publícala con GitHub Pages.

## Conectar el Censo (Supabase, gratis, ~15 min)

1. Crear un proyecto en [supabase.com](https://supabase.com) (plan Free). Hacerlo pocos días antes de empezar a usarlo: los proyectos gratuitos se pausan tras ~7 días sin uso (se reactivan desde el dashboard).
2. En el proyecto: **SQL Editor → New query**, pegar el contenido de [`supabase.sql`](supabase.sql) y ejecutar. Esto crea las zonas (Zona 1 a Zona 8, editables en el script), las tablas del censo y las políticas de seguridad (nadie puede borrar registros de verdad, solo ocultarlos).
3. **Project Settings → API**: copiar la *Project URL* y la *anon public key*, y pegarlas en [`config.js`](config.js).
4. Para renombrar una zona después: SQL Editor → `update sectores set nombre = 'Nombre nuevo' where nombre = 'Zona 1';` — y para agregar otra: `insert into sectores (nombre) values ('Nombre de la zona');`

> Nota: en la base de datos las zonas viven en la tabla `sectores` (nombre heredado del código original). Los nombres deben coincidir con los del KML (`Zona 1` … `Zona 8`) para que la detección y los colores funcionen.

### Actualizar los límites de las zonas

Si se redibujan las zonas en Google Earth, exportar el KML, reemplazar `datos/zonas-san-benito.kml` y regenerar `zonas.js` con las mismas coordenadas (cada polígono como lista de `[latitud, longitud]`). Si cambia el nombre de una zona, cambiarlo también en la tabla `sectores`.

## Publicar cambios en la app instalada

La app instalada busca la versión nueva cada vez que se abre con señal. Al cambiar archivos, subir el número `?v=` en `index.html` (como siempre). Si se cambia la forma de guardar archivos en `sw.js`, subir también su `VERSION`.

## Agregar el díptico de cada semana

1. Guardar el .docx del díptico (misma estructura de siempre: portada, Proclamación del Evangelio, Reflexión pastoral, Para conversar en familia, Oración, Vive esta Palabra esta semana, Te esperamos).
2. Ejecutar: `python3 herramientas/diptico_a_app.py ruta/al/diptico.docx`
3. El script guarda el .docx y sus datos en `datos/dipticos/AAAA-MM-DD.*` (fecha del domingo) y regenera `dipticos.js`. Subir los cambios a `main` y GitHub Pages lo publica.

La app muestra sola el díptico de la semana: el más reciente cuyo domingo cae dentro de los próximos 6 días.

## Reutilizar la estructura para un censo nuevo

- **Opción A (recomendada)**: crear un proyecto nuevo de Supabase y repetir los pasos de arriba. El censo anterior queda intacto en su propio proyecto.
- **Opción B (mismo proyecto)**: exportar primero el Excel desde la app como respaldo y luego, en el SQL Editor, vaciar los datos conservando la estructura con `truncate table personas, casas;`. Las zonas se ajustan con `update sectores set activo = false where ...` e `insert into sectores ...`.

**Privacidad**: el censo guarda nombres, direcciones y teléfonos. Sin inicio de sesión, cualquiera que tenga el enlace puede verlos: no difundir la URL fuera de quienes deban tener acceso, y exportar/limpiar los datos al terminar cada censo.
