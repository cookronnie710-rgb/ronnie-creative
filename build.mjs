// Build a single, fully self-contained index.html (no network, no build step
// required to RUN it). Inlines React, ReactDOM, compiled Tailwind CSS, and the
// transpiled app so it works offline — ideal for use on a phone at a car boot.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { transformSync } from '@babel/core';
import presetReact from '@babel/preset-react';

const root = new URL('.', import.meta.url).pathname;

// 1. Compile Tailwind (scans src/app.jsx via tailwind.config.js content globs).
console.log('• compiling tailwind…');
execSync(
  'npx tailwindcss -c tailwind.config.js -i src/styles.css -o build/tailwind.css --minify',
  { cwd: root, stdio: 'inherit' }
);
const css = readFileSync(root + 'build/tailwind.css', 'utf8');

// 2. Transpile the JSX app to plain browser JS (no runtime Babel needed).
console.log('• transpiling app…');
const jsx = readFileSync(root + 'src/app.jsx', 'utf8');
const { code } = transformSync(jsx, {
  presets: [[presetReact, { runtime: 'classic', pragma: 'React.createElement' }]],
  filename: 'app.jsx',
  compact: false,
});

// 3. Grab the React UMD production builds shipped in node_modules.
const react = readFileSync(root + 'node_modules/react/umd/react.production.min.js', 'utf8');
const reactDom = readFileSync(root + 'node_modules/react-dom/umd/react-dom.production.min.js', 'utf8');

// 4. Assemble the single file.
const custom = `
    html, body, #root { height: 100%; }
    body { background:#0b0f17; -webkit-tap-highlight-color:transparent; overscroll-behavior-y:none; }
    input, select, textarea { font-size:16px; }
    input[type=number]::-webkit-outer-spin-button,
    input[type=number]::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
    input[type=number] { -moz-appearance:textfield; }
    ::-webkit-scrollbar { width:8px; height:8px; }
    ::-webkit-scrollbar-thumb { background:#1f2937; border-radius:8px; }`;

const html = `<!DOCTYPE html>
<html lang="en-GB" class="dark">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="theme-color" content="#0b0f17" />
<meta name="description" content="FlipTracker — offline deal calculator, inventory tracker and eBay listing generator for UK resellers." />
<title>FlipTracker — eBay Reseller Toolkit</title>
<style>${css}</style>
<style>${custom}
</style>
</head>
<body class="text-slate-100">
<div id="root"></div>
<script>${react}</script>
<script>${reactDom}</script>
<script>${code}</script>
</body>
</html>
`;

writeFileSync(root + 'index.html', html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`✓ wrote index.html (${kb} KB, fully self-contained)`);
