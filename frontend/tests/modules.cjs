const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

exports.loadModule = function loadModule(relative, replacements = {}, globals = {}) {
  const filename = path.resolve(__dirname, "..", relative);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const output = {};
  vm.runInNewContext(code, {
    exports: output,
    require: (id) => Object.hasOwn(replacements, id) ? replacements[id] : require(id),
    setTimeout, clearTimeout, AbortController, URLSearchParams, console, ...globals,
  }, { filename });
  return output;
};
