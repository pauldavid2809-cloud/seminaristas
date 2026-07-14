/* ==========================================================================
   Configuración de Supabase (Censo de la Misión)

   Cómo obtener estos valores:
   1. Crear el proyecto en https://supabase.com (plan Free).
   2. Ejecutar el script supabase.sql en SQL Editor.
   3. Project Settings → API → copiar "Project URL" y "anon public" key.

   La anon key es pública por diseño (la seguridad real son las políticas
   RLS del script SQL), así que este archivo puede subirse al repositorio.
   ========================================================================== */

const SUPABASE_URL = "https://zanbuungsgmsdirhqxcg.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphbmJ1dW5nc2dtc2RpcmhxeGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5ODE3NzksImV4cCI6MjA5OTU1Nzc3OX0.rlADmpdMHnMihyFrEBMa6ZYmQntqYlb30HgCpGciXPo";
