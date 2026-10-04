-- ============================================================================
-- Comunión a enfermos · Parroquia "San Benito de Palermo"
-- Lista APARTE del censo para la página enfermos.html.
-- Pegar en Supabase → SQL Editor → New query → Run (una sola vez).
-- No toca ninguna otra tabla.
-- ============================================================================

create table comunion_enfermos (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  telefono          text,          -- formato WhatsApp (58412...)
  referencia        text,          -- dirección o referencia (opcional)
  zona              text,          -- "Zona 1" … "Zona 8", detectada por GPS
  lat               double precision not null check (lat between -90 and 90),
  lng               double precision not null check (lng between -180 and 180),
  precision_m       real check (precision_m >= 0),
  consentimiento_en timestamptz,   -- cuándo la familia autorizó guardar los datos
  notas             text,
  eliminado         boolean not null default false,
  creado_en         timestamptz not null default now()
);

-- RLS: igual que el censo (anon lee, inserta y actualiza; nadie borra de verdad)
alter table comunion_enfermos enable row level security;

create policy "anon lee comunion"       on comunion_enfermos for select to anon using (true);
create policy "anon inserta comunion"   on comunion_enfermos for insert to anon with check (true);
create policy "anon actualiza comunion" on comunion_enfermos for update to anon using (true) with check (true);

-- ============================================================================
-- Fotos del lugar (correr una sola vez, después de lo de arriba)
-- Las fotos se guardan en Storage, bucket público "comunion-fotos" (máx. 2 MB, solo JPEG)
-- ============================================================================
alter table comunion_enfermos add column foto text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('comunion-fotos', 'comunion-fotos', true, 2097152, array['image/jpeg']);
create policy "anon sube fotos comunion" on storage.objects for insert to anon with check (bucket_id = 'comunion-fotos');

-- ============================================================================
-- Varias personas en la misma casa (correr una sola vez)
-- "casa" = id del primero que se registró en esa casa (null = es el primero)
-- ============================================================================
alter table comunion_enfermos add column casa uuid;
