/* Genera el QR de jovenes/registro.html (PNG y SVG en jovenes/).
   Solo hace falta volver a correrlo si cambia la dirección de la página.
   Uso:  npm install qrcode   y luego   node herramientas/hacer_qr.js [URL] */
const QR = require("qrcode");
const path = require("path");
const URL_REGISTRO = process.argv[2] || "https://pauldavid2809-cloud.github.io/seminaristas/jovenes/registro.html";
const salida = path.join(__dirname, "..", "jovenes") + path.sep;
(async () => {
  const opciones = { errorCorrectionLevel: "Q", margin: 4, color: { dark: "#122940", light: "#ffffff" } };
  await QR.toFile(salida + "qr-jovenes.png", URL_REGISTRO, { ...opciones, width: 1200 });
  await QR.toFile(salida + "qr-jovenes.svg", URL_REGISTRO, { ...opciones, type: "svg" });
  console.log("QR listo para", URL_REGISTRO);
})();
