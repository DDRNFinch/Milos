(function (global) {
  "use strict";

  if (!global.MilosPDF || typeof global.MilosPDF.observationPdf !== "function") return;
  global.MilosObservationPdfSource = global.MilosPDF;
})(window);
