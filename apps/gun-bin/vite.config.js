import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import basicSsl from '@vitejs/plugin-basic-ssl';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    base: './',
    plugins: [
        basicSsl()
    ],
    resolve: {
        alias: [
            { find: 'gun/sea', replacement: path.resolve(__dirname, 'node_modules/gun/sea.js') },
            { find: 'gun/lib/webrtc', replacement: path.resolve(__dirname, 'node_modules/gun/lib/webrtc.js') },
            { find: 'gun/lib/radix', replacement: path.resolve(__dirname, 'node_modules/gun/lib/radix.js') },
            { find: 'gun/lib/radisk', replacement: path.resolve(__dirname, 'node_modules/gun/lib/radisk.js') },
            { find: 'gun/lib/store', replacement: path.resolve(__dirname, 'node_modules/gun/lib/store.js') },
            { find: 'gun/lib/erase', replacement: path.resolve(__dirname, 'node_modules/gun/lib/erase.js') },
            { find: /^gun$/, replacement: path.resolve(__dirname, 'node_modules/gun/gun.js') }
        ]
    },
    optimizeDeps: {
        include: [
            'gun',
            'gun/sea'
        ]
    },
    server: {
        port: 8765,
        host: true
    }
});
