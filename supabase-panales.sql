-- ============================================================================
-- Pañales de adulto y de niño (pestaña "Pañales" del censo)
-- Pegar en Supabase → SQL Editor → New query → Run (una sola vez).
-- Solo amplía la lista de categorías permitidas en "personas"; no borra ni
-- cambia ningún dato. Cada línea es una orden completa.
-- ============================================================================

alter table personas drop constraint personas_categorias_check;
alter table personas add constraint personas_categorias_check check (array_length(categorias, 1) >= 1 and categorias <@ array['enfermo','primera_comunion','confirmacion','vulnerable','bautizo','matrimonio','uncion','panales_adulto','panales_nino']::text[]);
