-- ============================================================================
-- Jóvenes de la parroquia (registro por QR + página privada /jovenes)
-- Pegar en Supabase → SQL Editor → New query → Run (una sola vez).
-- ANTES de correrlo: cambiar PON-AQUI-TU-CORREO por el correo con el que vas
-- a entrar a /jovenes (el mismo con el que crearás tu usuario en Supabase →
-- Authentication → Users → Add user).
-- Cada línea es una orden completa. No toca ninguna otra tabla.
-- Seguridad: cualquiera puede anotarse (insert), pero SOLO ese correo puede
-- ver o actualizar los datos. Si el joven es menor de 18 años, el insert exige
-- los datos del representante.
-- ============================================================================

create table jovenes (id uuid primary key default gen_random_uuid(), nombre text not null, fecha_nacimiento date not null, telefono text not null, redes text, representante text, telefono_representante text, consentimiento boolean not null default false, estado text not null default 'nuevo', notas text, eliminado boolean not null default false, creado_en timestamptz not null default now());
alter table jovenes add constraint jovenes_datos_check check (char_length(nombre) between 3 and 120 and char_length(telefono) between 7 and 20 and char_length(coalesce(redes, '')) <= 200 and char_length(coalesce(representante, '')) <= 120 and char_length(coalesce(telefono_representante, '')) <= 20 and char_length(coalesce(notas, '')) <= 1000 and estado in ('nuevo','contactado','activo','inactivo'));
alter table jovenes add constraint jovenes_consentimiento_check check (consentimiento);
create table jovenes_admins (email text primary key);
alter table jovenes_admins enable row level security;
insert into jovenes_admins (email) values ('PON-AQUI-TU-CORREO');
create or replace function es_admin_jovenes() returns boolean language sql security definer stable set search_path = public as $$ select exists (select 1 from jovenes_admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))) $$;
alter table jovenes enable row level security;
create policy "cualquiera se anota" on jovenes for insert to anon, authenticated with check (estado = 'nuevo' and notas is null and eliminado = false and consentimiento = true and fecha_nacimiento <= current_date - interval '10 years' and fecha_nacimiento > current_date - interval '41 years' and (fecha_nacimiento <= current_date - interval '18 years' or (char_length(coalesce(representante, '')) >= 3 and char_length(coalesce(telefono_representante, '')) >= 7)));
create policy "solo el encargado ve" on jovenes for select to authenticated using (es_admin_jovenes());
create policy "solo el encargado actualiza" on jovenes for update to authenticated using (es_admin_jovenes()) with check (es_admin_jovenes());
