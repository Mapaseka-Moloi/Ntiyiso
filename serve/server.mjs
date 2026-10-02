#!/usr/bin/env node
/**
 * Ntiyiso — static dev server with clean-URL support.
 *
 * The app uses extensionless links such as "/app/settings". This server maps
 * those onto the matching feature folder's index.html, exactly the way the
 * production rewrites in netlify.toml / vercel.json / .htaccess do.
 *
 *   node serve/server.mjs            # http://localhost:5173
 *   node serve/server.mjs --port 8080
 *   node serve/server.mjs --root ..  # serve a different directory
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '..');

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
}
const PORT = Number(arg('port', process.env.PORT || 5173));
const ROOT = resolve(arg('root', DEFAULT_ROOT));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/** Resolve a URL pathname to a file inside ROOT, refusing to escape it. */
function toLocalPath(pathname) {
  const decoded = decodeURIComponent(pathname.split('?')[0].split('#')[0]);
  const rel = normalize(decoded).replace(/^([/\\])+/, '');
  const abs = resolve(ROOT, rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + sep)) return null;
  return abs;
}

async function isFile(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/**
 * Clean-URL resolution order, mirroring the host rewrites:
 *   /app/settings      -> app/settings/index.html
 *   /app/settings/     -> app/settings/index.html
 *   /app/settings.html -> app/settings.html
 */
async function resolveFile(pathname) {
  const abs = toLocalPath(pathname);
  if (!abs) return null;

  if (await isFile(abs)) return abs;

  const asIndex = join(abs, 'index.html');
  if (await isFile(asIndex)) return asIndex;

  if (!extname(abs)) {
    const asHtml = `${abs}.html`;
    if (await isFile(asHtml)) return asHtml;
  }
  return null;
}

const server = createServer(async (req, res) => {
  const url = req.url || '/';
  const pathname = url.split('?')[0];

  let file = await resolveFile(pathname);

  // Directory request without a trailing slash: redirect so relative assets
  // and clean URLs behave predictably.
  if (!file && await isFile(join(toLocalPath(pathname) || '', 'index.html'))) {
    res.writeHead(301, { Location: pathname.replace(/\/+$/, '') + '/' });
    return res.end();
  }

  if (!file) {
    const notFound = resolve(ROOT, '404.html');
    if (await isFile(notFound)) {
      const body = await readFile(notFound);
      res.writeHead(404, { 'Content-Type': MIME['.html'] });
      return res.end(body);
    }
    res.writeHead(404, { 'Content-Type': MIME['.txt'] });
    return res.end('404 Not Found');
  }

  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': MIME['.txt'] });
    res.end(`500 ${err.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`Ntiyiso dev server → http://localhost:${PORT}`);
  console.log(`Serving: ${ROOT}`);
});
