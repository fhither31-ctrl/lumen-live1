import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { socketioPlugin } from './vite-plugin-socketio';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), socketioPlugin()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
