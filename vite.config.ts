import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Strict Content-Security-Policy for production builds only (the dev server
// injects inline scripts for hot reload, which this policy would block).
// The app only ever talks to api.github.com.
const csp: Plugin = {
  name: 'myjournal-csp',
  apply: 'build',
  transformIndexHtml(html) {
    const policy = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src https://api.github.com",
      "manifest-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "object-src 'none'",
    ].join('; ');
    return html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${policy}">`);
  },
};

export default defineConfig({
  // Relative base so the build works at a domain root (Cloudflare Pages)
  // and under a sub-path (GitHub Pages: /myjournal/).
  base: './',
  plugins: [react(), csp],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
