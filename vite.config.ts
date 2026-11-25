import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

function normalizeBasePath(raw: string | undefined): '' | `/${string}` {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === '/') return '';
  return (trimmed.startsWith('/') ? trimmed : `/${trimmed}`) as `/${string}`;
}

const extraAllowedHosts = (process.env.VITE_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

const host = process.env.VITE_HOST?.trim() || true;
const basePath = normalizeBasePath(process.env.BASE_PATH);

export default defineConfig({
  plugins: [
    sveltekit({
      preprocess: vitePreprocess(),
      paths: {
        base: basePath,
      },
      adapter: adapter({
        pages: 'dist',
        assets: 'dist',
        fallback: '404.html',
      }),
    }),
  ],
  server: {
    host,
    port: 5173,
    allowedHosts: ['.ts.net', ...extraAllowedHosts],
  },
  preview: {
    host,
    port: 4173,
    allowedHosts: ['.ts.net', ...extraAllowedHosts],
  },
});
