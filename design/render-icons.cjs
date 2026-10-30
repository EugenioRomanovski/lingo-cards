const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const [svgPath, outDir] = process.argv.slice(2);
  const svg = fs.readFileSync(svgPath, 'utf8');
  const b = await chromium.launch();
  const p = await b.newPage();
  const jobs = [
    ['icon-512.png', 512, 0], ['icon-192.png', 192, 0], ['apple-touch-icon.png', 180, 0],
    ['icon-maskable-512.png', 512, 0.1], ['favicon-32.png', 32, 0, true], ['favicon-64.png', 64, 0, true],
    ['preview-rounded.png', 512, 0, true],
  ];
  for (const [name, size, pad, rounded] of jobs) {
    await p.setViewportSize({ width: size, height: size });
    const inner = size * (1 - 2 * pad);
    const r = rounded ? size * 0.225 : 0;
    await p.setContent(`<html><body style="margin:0;background:transparent">
      <div style="width:${size}px;height:${size}px;overflow:hidden;border-radius:${r}px;background:#4A47C8;display:flex;align-items:center;justify-content:center">
      <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" style="width:${pad ? size : inner}px;height:${pad ? size : inner}px;${pad ? `transform:scale(${1 - 2 * pad})` : ''}"></div></body></html>`);
    await p.screenshot({ path: path.join(outDir, name), omitBackground: true });
  }
  await b.close();
})();
