import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

function findBrowser() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.platform === 'win32') {
    for (const root of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)) {
      for (const path of ['Google/Chrome/Application/chrome.exe', 'Microsoft/Edge/Application/msedge.exe']) {
        const candidate = join(root, path);
        if (existsSync(candidate)) return candidate;
      }
    }
  } else {
    for (const name of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
      const result = spawnSync('which', [name], { encoding: 'utf8' });
      if (result.status === 0) return result.stdout.trim();
    }
  }
  return undefined;
}

export async function launchBrowser() {
  const angle = process.env.PIPE_ANGLE || 'swiftshader';
  const options = {
    headless: true,
    chromiumSandbox: process.env.ANIM_CHROME_SANDBOX === '1',
    timeout: 18000,
    args: [
      '--disable-dev-shm-usage', '--use-gl=angle', `--use-angle=${angle}`,
      '--disable-background-timer-throttling',
      ...(angle === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : []),
    ],
  };
  const system = findBrowser();
  if (!system) return chromium.launch(options);
  try {
    return await chromium.launch({ ...options, executablePath: system });
  } catch (error) {
    if (process.env.CHROME_PATH || !existsSync(chromium.executablePath())) throw error;
    return chromium.launch(options);
  }
}
