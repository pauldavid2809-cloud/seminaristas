-- ============================================================================
-- Censo parroquial · Parroquia "San Benito de Palermo"
-- Pegar este script completo en Supabase → SQL Editor → New query → Run
-- ============================================================================

-- Zonas de la parroquia (la tabla se llama "sectores" por historia del código).
-- EDITAR esta lista si las zonas cambian de nombre; después se agregan más con:
--   insert into sectores (nombre) values ('Nombre de la zona');
create table sectores (
  id     serial primary key,
  nombre text not null unique,
  activo boolean not null default true
);

insert into sectores (nombre) values
  ('Zona 1'), ('Zona 2'), ('Zona 3'), ('Zona 4'),
  ('Zona 5'), ('Zona 6'), ('Zona 7'), ('Zona 8');

-- Casa/familia: agrupa los casos de un mismo hogar
create table casas (
  id             uuid primary key default gen_random_uuid(),
  sector_id      int not null references sectores(id),
  direccion      text not null,
  familia        text,          -- apellido o "familia Pérez" (opcional)
  telefono       text,          -- guardado en formato WhatsApp (58412...)
  notas          text,
  lat            double precision check (lat between -90 and 90),    -- ubicación GPS
  lng            double precision check (lng between -180 and 180),
  precision_m    real check (precision_m >= 0),  -- precisión del GPS (null = marcada a mano)
  eliminado      boolean not null default false,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index casas_sector_idx on casas (sector_id);

-- Personas censadas (una casa puede tener varios casos)
create table personas (
  id             uuid primary key default gen_random_uuid(),
  casa_id        uuid not null references casas(id),
  nombre         text not null,
  edad           int check (edad between 0 and 120),
  categorias     text[] not null
                 check (array_length(categorias, 1) >= 1
                        and categorias <@ array[
                          'enfermo','primera_comunion','confirmacion',
                          'vulnerable','bautizo','matrimonio','uncion'
                        ]::text[]),
  notas          text,
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente','en_proceso','atendido')),
  eliminado      boolean not null default false,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index personas_casa_idx on personas (casa_id);

-- Mantener actualizado_en al día automáticamente
create or replace function tocar_actualizado_en()
returns trigger language plpgsql as $$
begin
  new.actualizado_en = now();
  return new;
end $$;

create trigger casas_touch before update on casas
  for each row execute function tocar_actualizado_en();
create trigger personas_touch before update on personas
  for each row execute function tocar_actualizado_en();

-- RLS: anon puede leer, insertar y actualizar.
-- Sin política DELETE = nadie puede borrar filas de verdad (borrado suave).
alter table sectores enable row level security;
alter table casas    enable row level security;
alter table personas enable row level security;

create policy "anon lee sectores"    on sectores for select to anon using (true);
create policy "anon lee casas"       on casas    for select to anon using (true);
create policy "anon inserta casas"   on casas    for insert to anon with check (true);
create policy "anon actualiza casas" on casas    for update to anon using (true) with check (true);
create policy "anon lee personas"    on personas for select to anon using (true);
create policy "anon inserta"         on personas for insert to anon with check (true);
create policy "anon actualiza"       on personas for update to anon using (true) with check (true);
