import { defineConfig } from 'vite';

export default defineConfig({
  // Relative assets work at both / and GitHub Pages' /3dspacegame/ path.
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173
  },
  preview: {
    host: '127.0.0.1',
    port: 4173
  }
});
