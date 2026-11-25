import { launchBrowser } from './browser.mjs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let browser;
try {
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: {width: 64, height: 64} });
  const features = await page.evaluate(() => {
    const canvas = Boolean(document.createElement('canvas').getContext('2d'));
    const gl = document.createElement('canvas').getContext('webgl2');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return { canvas, webgl2: Boolean(gl), hdrTarget: Boolean(gl?.getExtension('EXT_color_buffer_float')),
             renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null };
  });
  if (features.webgl2) {
    const bundle = new URL('../dist/pixi.mjs', import.meta.url);
    if (existsSync(bundle)) {
      try {
        await page.addScriptTag({path: fileURLToPath(new URL('../dist/probe-pixi.js', import.meta.url))});
        features.pixi = await page.evaluate(() => window.probePixi());
      } catch (error) {
        features.pixi = false;
        features.pixiError = String(error).slice(0, 300);
      }
    }
  }
  console.log(JSON.stringify({ ...features, version: browser.version() }));
} catch (error) {
  console.log(JSON.stringify({ error: String(error).slice(0, 1200) }));
} finally {
  await browser?.close();
}
