# AGENTS.md — wg_hipster (juego de fiesta P2P)

> Archivo de traspaso: si retomas este proyecto en una conversación nueva (p. ej. dentro del devcontainer), empieza aquí.

## Qué es

**Este repo ES el juego wg_hipster**, no una plantilla. Juego de fiesta multijugador en navegador, 100 % estático (GitHub Pages), sin backend ni base de datos.
Flujo: crear sala → compartir enlace `#/sala/<id>` → lobby (1–20 jugadores) → hipster musical por turnos.
Red P2P con Trystero (`torrent`, trackers públicos, sin cuentas; `appId='wg_hipster_v1_'+salaId`). Host-autoritativo lógico con migración de host. UI en español.

## Dónde está la arquitectura

- **Spec (diseño + §11 estado de implementación):** `docs/historico/2026-09-04-wg-template-fiesta-design.md` (histórico de la plantilla origen; los nombres `wg_template` ahí son antiguos)
- **Plan base (histórico):** `docs/historico/2026-09-04-wg-template-fiesta-implementation.md` (histórico)
- **Este archivo** es solo el índice/handoff; consulta esos documentos para el detalle.

## Mapa de código

- `src/App.svelte`, `src/main.ts` — entrada + router hash (`#/` → Landing, `#/sala/<id>` → Room)
- `src/routes/{Landing,Room,Game}.svelte` — páginas; `Room.svelte` contiene la lógica P2P agnóstica al juego (hello/requestState/stateSync/action/rename, heartbeat 2 s, tick host 1 s, `electNewHost`; un solo juego)
- `src/components/{PlayerList,ShareLink,NameInput}.svelte` — UI lobby
- `src/lib/net/{types,trysteroAdapter,room}.ts` — `Msg`, adapter Trystero (`appId='wg_hipster_v1_'+salaId`), `electNewHost`/`isRoomFull`
- `src/lib/stores/{roomStore,gameStore}.ts` — `roomStore` (sala/peers/joinOrder/isHost) + `gameStore` (aplica `stateSync` solo si versión mayor)
- `src/lib/game/{types,registry}.ts` — contrato `GameModule` y registry dinámico por `juegoId`
- `src/lib/game/hipster/` — juego wg_hipster (modos título/año, dificultad + pistas, charts iTunes + buscador + playlists Deezer por JSONP)
- `src/lib/utils/{id,names}.ts` — `generateSalaId` (6 chars), `assignName` (`Jugador N`), `sanitizeName`
- `vite.config.ts` — `base=VITE_BASE || '/wg_hipster/'`, `server/preview` con `host:true, strictPort:true` (devcontainer)
- `.devcontainer/devcontainer.json` + `post-create.sh` — imagen `typescript-node:22`, puertos 5173/4173
- `.github/workflows/pages.yml` — build (`VITE_BASE=/wg_hipster/`) + `deploy-pages@v4`
- `tests/unit/` — 33 tests (hipster 22); `tests/e2e/` — 10 casos, incluido P2P real con dos contextos

## Comandos (Node 22)

```bash
npm ci            # instalar (postCreate del devcontainer ya lo hace)
npm run dev       # http://localhost:5173
npm run test      # vitest run (33 tests)
npm run check     # svelte-check + tsc
npm run build     # dist/ para Pages
npm run test:e2e  # Playwright; E2E_P2P=1 hace obligatorio el caso de trackers
```

## Estado a 2026-09-05

- Repo renombrado a juego: `wg_hipster` (`package.json`, `base /wg_hipster/`, `appId wg_hipster_v1_`, títulos, README/AGENTS).
- Docs de plantilla eliminadas (`NUEVO-REPO.md`); spec/plan origen movidos a `docs/historico/`.
- Siguiente: definir e implementar el juego wg_hipster sobre el contrato `GameModule` (sustituir trivia).

## Entorno

- Editor del usuario: **Zed** (no VS Code). El devcontainer es estándar; ábrelo con el soporte de contenedores de Zed.
- Idioma del proyecto: ES. Restricción: nada que hostear/pagar (Trystero usa trackers públicos).

## Al retomar

1. Revisa el diff local y `git log` antes de modificar nada.
2. Repite `check/test/build/test:e2e` si cambia código.
3. Este repo es el juego final, no crear repos derivados.
