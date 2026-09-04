import { cpSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

// The launcher mounts only verified build output and static assets, never runtime data.
if (process.env.DATA_ROOT !== '/tmp/data' || process.env.MEDIA_ROOT !== '/tmp/media') {
  throw new Error('Disposable public QA requires tmpfs-only data and media.');
}
cpSync('/bundle', '/tmp/app', { recursive: true });
cpSync('/static', '/tmp/app/.next/static', { recursive: true });
cpSync('/public', '/tmp/app/public', { recursive: true });
mkdirSync('/tmp/media', { recursive: true });
process.chdir('/tmp/app');
createRequire(import.meta.url)('/tmp/app/server.js');
