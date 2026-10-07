import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import basicSsl from "@vitejs/plugin-basic-ssl";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), basicSsl()],
  base: "/EnigmaJS/", // GitHub Pages repo name
  server: {
    host: "0.0.0.0", // Allow access from outside the container
    port: 5173, // The port number
    https: true, // Enable HTTPS with self-signed cert
  },
});
