/* ==========================================================================
   Canales de WhatsApp de cada zona · Parroquia "San Benito de Palermo"
   Para cambiar un canal, reemplazar su enlace aquí.
   ========================================================================== */

const CANALES_ZONA = {
  "Zona 1": "https://whatsapp.com/channel/0029VbDkbWj2P59fhIYe2J2r",
  "Zona 2": "https://whatsapp.com/channel/0029VbE5Car42DcVnxiB472X",
  "Zona 3": "https://whatsapp.com/channel/0029Vb9DSloCRs1rmN8TxA22",
  "Zona 4": "https://whatsapp.com/channel/0029VbE2YMuCMY0G7uHMu91T",
  "Zona 5": "https://whatsapp.com/channel/0029Vb97ujJ2975L91mJGV1A",
  "Zona 6": "https://whatsapp.com/channel/0029Vb9LvtKFi8xhAF2s5b0v",
  "Zona 7": "https://whatsapp.com/channel/0029Vb8l3WNDuMRlrLqOL20D",
  "Zona 8": "https://whatsapp.com/channel/0029Vb8lWZH8aKvJeOdpkv0q",
};

function canalDeZona(nombre) {
  return CANALES_ZONA[String(nombre || "").trim()] || null;
}

/* Invitación al canal de la zona, para mandar por WhatsApp a una casa */
function mensajeCanal(zonaConSanto, url, saludo = "Saludos") {
  return [
    `${saludo} 🙏`,
    `Somos de la Parroquia San Benito de Palermo. Su casa pertenece a la *${zonaConSanto}*.`,
    "Los invitamos a seguir el canal de WhatsApp de su zona, donde compartiremos la Palabra del domingo, avisos y actividades:",
    url,
    "¡Dios les bendiga!",
  ].join("\n");
}
