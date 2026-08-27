(function (global) {
  "use strict";

  const optimizer = global.MilosMediaOptimize;
  if (!optimizer) return;

  async function prepareVideoForExport(source) {
    return source;
  }

  global.MilosMediaOptimize = Object.freeze(Object.assign({}, optimizer, {
    version: "2.9",
    compressVideoOnExport: false,
    exportStrategy: "stored-original",
    prepareVideoForExport,
  }));
})(window);
