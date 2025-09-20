import { defineConfig } from 'vite';

export default defineConfig({
  base: '/econs_housing_viewer/',
  server: { port: 5173 },
  preview: { port: 4173 }
});
