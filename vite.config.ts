import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Chemins relatifs : servi à la racine (sa.leto…) et sous leto.performx.online/pro/
  base: './',
  plugins: [react()],
  server: { port: 5173 },
});
