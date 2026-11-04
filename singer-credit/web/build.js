'use strict';
// Builds a single self-contained HTML page from the same engine the desktop app runs.
// Output: web/singer-credit.html (publishable as an Artifact, or openable from disk).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const MODULES = ['util', 'policy', 'i18n', 'engine', 'seed', 'api'];

const body = read('renderer/index.html').replace(/[\s\S]*<body>/, '').replace(/<\/body>[\s\S]*/, '')
  .replace(/\s*<script src="app\.js"><\/script>/, '')
  .replace('<div class="today">', '<span class="proto">Prototype</span>\n    <div class="today">');

const bundle = MODULES.map(n => `  '${n}': function (module, exports, require) {\n${read('src/' + n + '.js')}\n  },`).join('\n');

const page = `<title>SINGER CREDIT</title>
<style>
${read('renderer/styles.css')}
.proto{border:1px solid var(--line);color:var(--mute);border-radius:999px;padding:3px 11px;font-size:12px;letter-spacing:.3px}
</style>
${body}
<script>
(function () {
  'use strict';
  var defs = {
${bundle}
  };
  var cache = {};
  function require(name) {
    var key = String(name).replace(/^\\.\\//, '');
    if (cache[key]) return cache[key].exports;
    var def = defs[key];
    if (!def) throw new Error('Module not found: ' + name);
    var mod = cache[key] = { exports: {} };
    def(mod, mod.exports, require);
    return mod.exports;
  }

  var SOP = ${JSON.stringify(read('docs/SOP.md'))};
  var KEY = 'singer-credit-state-v1';
  var memory = null;

  var api = require('api').createApi({
    name: 'web',
    loadState: function () {
      try { var raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; }
      catch (e) { return memory; }
    },
    saveState: function (s) {
      memory = s;
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private window or full storage: memory only */ }
    },
    readSop: function () { return SOP; },
    exportCsv: function (filename, csv) { return { filename: filename, csv: csv }; }
  });
  api.init();

  window.singer = { call: function (method) { return Promise.resolve(api.call(method, [].slice.call(arguments, 1))); } };
})();
</script>
<script>
${read('renderer/app.js')}
</script>
`;

fs.mkdirSync(path.join(root, 'web'), { recursive: true });
fs.writeFileSync(path.join(root, 'web', 'singer-credit.html'), page);
console.log('web/singer-credit.html', (page.length / 1024).toFixed(0) + ' KB');
