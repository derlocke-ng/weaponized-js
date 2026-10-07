# Copilot Instructions for `gun-bin`

## Project Purpose
- `gun-bin` is a client-side encrypted pastebin built with Vite and vanilla JavaScript.
- Encryption/decryption uses `GUN` + `SEA`.
- Markdown rendering uses `marked`, and all rendered HTML must be sanitized with `DOMPurify`.

## Tech Stack
- Runtime: browser app (ES modules), plus optional Node verification scripts.
- Build/dev tool: Vite.
- Language: plain JavaScript (no TypeScript in this repo).
- Styling: CSS in `src/style.css`.

## Important Files
- App logic/UI wiring: `src/main.js`
- App config (TTL options, defaults): `src/config.js`
- Styles: `src/style.css`
- HTML shell: `index.html`
- Vite + Gun aliasing: `vite.config.js`
- Local verification scripts: `simple_verify.js`, `repro_verify.js`, `verify_logic.js`

## Code Guidelines
- Keep changes minimal and focused; avoid broad refactors unless requested.
- Preserve existing architecture (single-page vanilla JS app) unless user asks otherwise.
- Prefer small helper functions over introducing frameworks or complex abstractions.
- Follow the local style of the file being edited (spacing, semicolons, naming patterns).
- Do not add inline comments unless explicitly requested.

## Security and Privacy Requirements (Critical)
- Never bypass encryption in `createPaste` / `retrievePaste` flows.
- Never log passphrases, decrypted sensitive payloads, or secret material to console.
- Keep markdown rendering path safe: parse with `marked` and sanitize with `DOMPurify` before inserting into DOM.
- Do not introduce `innerHTML` assignments for user content unless sanitized first.
- Maintain TTL and burn-after-reading behavior; do not weaken deletion/expiry checks.
- Do not add telemetry, analytics, or external tracking scripts.

## Dependency and Build Rules
- Prefer existing dependencies already in `package.json`.
- If adding a dependency, justify it and keep it minimal.
- Keep Vite alias configuration for `gun` imports intact unless fixing a specific Gun resolution issue.

## Validation Workflow
Use these commands when relevant:
- Install deps: `npm install`
- Dev server: `npm run dev`
- Production build: `npm run build`
- Preview build: `npm run preview`
- Crypto sanity check: `node simple_verify.js`
- Repro script: `node repro_verify.js`
- Gun logic check: `node verify_logic.js`

## Expected Copilot Behavior in this Repo
- Prioritize correctness and safety of encryption/decryption and sanitization flows.
- When modifying UI behavior, keep existing tab/panel interactions and IDs stable unless asked to redesign.
- When changing config defaults (TTL, burn behavior), update `src/config.js` and ensure UI population still works.
- When uncertain, choose the simplest implementation that preserves current behavior.
