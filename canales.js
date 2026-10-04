/* ==========================================================================
   Canal de WhatsApp de la Parroquia "San Benito de Palermo" (uno para todas
   las zonas). Para cambiarlo, reemplazar el enlace aquí.
   ========================================================================== */

const CANAL_PARROQUIA = "https://whatsapp.com/channel/0029VbE5Car42DcVnxiB472X";

/* Invitación al canal, para mandar por WhatsApp a una casa */
function mensajeCanal(zonaConSanto, saludo = "Saludos") {
  return [
    `${saludo} 🙏`,
    `Somos de la Parroquia San Benito de Palermo${zonaConSanto ? ` (su casa está en la *${zonaConSanto}*)` : ""}.`,
    "Los invitamos a seguir el canal de WhatsApp de la parroquia, donde compartiremos la Palabra del domingo, avisos y actividades:",
    CANAL_PARROQUIA,
    "¡Dios les bendiga!",
  ].join("\n");
}
