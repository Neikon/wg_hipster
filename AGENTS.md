# AGENTS.md — wg_hipster (juego de fiesta P2P)

> Archivo de traspaso: si retomas este proyecto en una conversación nueva (p. ej. dentro del devcontainer), empieza aquí.

## Qué es

**Este repo ES el juego wg_hipster**, no una plantilla. Juego de fiesta multijugador en navegador, 100 % estático (GitHub Pages), sin backend ni base de datos.
Flujo: crear sala → compartir enlace `#/sala/<id>` → lobby (1–20 jugadores) → hipster musical por turnos.
Red P2P con Trystero (`torrent` por defecto, trackers públicos, sin cuentas; `appId='wg_hipster_v1_'+salaId`). Supabase es opcional y requiere un proyecto. El anfitrión valida el estado y las acciones. UI en español.

## Dónde está la arquitectura

- **Spec (diseño + §11 estado de implementación):** `docs/historico/2026-09-04-wg-template-fiesta-design.md` (histórico de la plantilla origen; los nombres `wg_template` ahí son antiguos)
- **Plan base (histórico):** `docs/historico/2026-09-04-wg-template-fiesta-implementation.md` (histórico)
- **Este archivo** es solo el índice/handoff; consulta esos documentos para el detalle.

## Mapa de código

- `src/App.svelte`, `src/main.ts` — entrada + router hash (`#/` → Landing, `#/sala/<id>` → Room)
- `src/routes/{Landing,Room,Game}.svelte` — páginas; `Room.svelte` conecta la UI al transporte y a `SyncNode`, genera invitaciones con la señalización activa y supervisa la conexión (reintentos, recargas limitadas y aviso al agotarse)
- `src/components/{PlayerList,ShareLink,NameInput,KoFi}.svelte` — UI lobby + píldora ko-fi (landing/lobby/espera/resultados)
- `src/app.css` + `src/lib/stores/theme.ts` + `src/components/ThemeToggle.svelte` — estilo festival póster dual (claro/oscuro según sistema + toggle persistido)
- `src/lib/game/hipster/colores.ts` — color dinámico de carátula (Canvas + contraste WCAG AA, store `tinteActual`)
- `src/lib/net/{types,trysteroAdapter,room,transport,turn}.ts` — tipos de jugadores, adapter Trystero multi-estrategia (`supabase` opcional con proyecto propio; `torrent` por defecto con `appId='wg_hipster_v1_'+salaId`, 4 trackers verificados 2026-09-09, 5 STUN + TURN opcional vía `turn.ts` para NAT simétrica), `electNewHost`/`isRoomFull`, `relayStatus()` (solo torrent); `signaling.ts` (`?net=`, `?supaUrl/Key`, localStorage); `debug.ts` (log exportable con `?debug=1` o botón: red+protocolo+consola+visibilidad, build id, sonda de broadcast, reanuncio al volver de 2º plano, copiar/descargar); `iceCheck.ts` (botón Probar mi red: gathering local + veredicto P2P_OK/SOLO_TURN/NO_P2P); `scripts/patch-trystero.js` (postinstall) corrige la fuga del offer pool de trystero 0.20.1 (40 RTCPeerConnection fugadas por ciclo → sala fantasma a los minutos); hooks solo-e2e vía query del hash: `transport.trackerUrls()` acepta `?tracker=ws://…` (repetible) y el adapter `?lagMs=&lossPct=` (móvil lento simulado)
- `src/lib/net/syncEngine.ts` — `SyncNode`: admisión y acciones ligadas a la conexión, instantáneas por destinatario y migración de host. La vista del invitado oculta los datos privados de la ronda. Solo el sucesor recibe una copia de recuperación separada
- `src/lib/stores/{roomStore,gameStore}.ts` — `roomStore` (sala/peers/joinOrder/isHost) + `gameStore` (vista validada por `SyncNode`)
- `src/lib/game/{types,registry}.ts` — contrato `GameModule` y registry dinámico por `juegoId`
- `src/lib/game/hipster/` — juego wg_hipster (modos título/año, dificultad + pistas, autoplay, charts iTunes y búsqueda de álbumes y artistas por JSON); dificultad experto en modo título: sin opciones, texto libre, corrección del host (buena/mala + extra +50) con pantalla de espera
- `src/lib/utils/{id,names}.ts` — `generateSalaId` (6 chars), `randomName` (Animal+Adjetivo 20×20, con excluidos), `sanitizeName`
- `vite.config.ts` — `base=VITE_BASE || '/wg_hipster/'`, `server/preview` con `host:true, strictPort:true` (devcontainer)
- `.devcontainer/devcontainer.json` + `post-create.sh` — imagen `typescript-node:22`, puertos 5173/4173
- `.github/workflows/pages.yml` — build (`VITE_BASE=/wg_hipster/`) + `deploy-pages@v4`
- `tests/unit/` cubre motor, protocolo P2P y utilidades. `tests/e2e/` prueba WebRTC real con tracker local, el relevo del anfitrión y salas de 5 a 20 jugadores. Consulta `tests/e2e/multijugador.spec.ts` para las variantes de pérdida, sala envejecida y señalización pública o Supabase.
## Comandos (Node 22)

```bash
npm ci            # instalar (postCreate del devcontainer ya lo hace)
npm run dev       # http://localhost:5173
npm run test      # vitest run
npm run check     # svelte-check + tsc
npm run build     # dist/ para Pages
npm run test:e2e  # Playwright con WebRTC real y tracker local
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
