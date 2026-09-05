# wg_template Fiesta - Plantilla Juegos de Fiesta para Navegador - Design Spec

**Fecha:** 2026-09-04
**Estado:** Aprobado (6/6 secciones aprobadas en brainstorming)
**Stack (diseño):** Svelte 4 + Vite 5 + TypeScript + Trystero 0.20 — SPA hash-router — GitHub Pages estático
**Stack real (scaffold verificado 2026-09-04):** Svelte 5.56 + Vite 8.2.2 + TypeScript ~6.0.2 + @sveltejs/vite-plugin-svelte 7 + Trystero 0.20 + Vitest 3 + jsdom (plantilla `create-vite` svelte-ts)
**Idioma plantilla:** ES
**Última actualización:** 2026-09-05 — roadmap 1–5 cerrado y publicado (`94570b2`); bug visual resuelto (ver §11)

---

## 1. Resumen y Objetivo

Plantilla base reutilizable para juegos de fiesta multijugador en navegador, 100% estática (GitHub Pages), sin base de datos ni servidor propio. Un usuario crea una sala, comparte un enlace (`#sala/<id>`), otros se unen. Plantilla incluye infraestructura P2P + lobby + 1 juego demo (Trivia por turnos) como ejemplo extensible. Pensada para 1-20 jugadores, juegos tranquilos por turnos (trivial, pictionary, votación) donde 200-500ms de lag es irrelevante.

**Restricción A:** Sin hostear ni pagar servidor. Se permite uso de trackers públicos gratuitos (Trystero usa `wss://tracker.openwebtorrent.com` y similares) sin crear cuenta. Variante 100% pura (sin trackers) documentada pero no usada por defecto por UX inviable (copy-paste manual).

---

## 2. Requisitos

### Funcionales
- RF1: Crear sala desde landing → genera id 6 chars (`crypto.randomUUID().slice(0,6)` o `nanoid`) → navega a `#sala/<id>` como host.
- RF2: Compartir enlace copiable + QR opcional (`location.origin + base + '#sala/<id>'`).
- RF3: Unirse vía enlace → `joinRoom(id)` vía Trystero.
- RF4: Lobby muestra lista reactiva de jugadores (1-20), nombres auto `Jugador 1,2,3...` asignados por orden de llegada, con input para renombrar al entrar y en lobby.
- RF5: Solo host ve botón "Empezar partida". Host autoritativo, peers esperan.
- RF6: Juego demo Trivia: fases `lobby → pregunta (timer 20s host) → resultados 5s → siguiente → final ranking`. Host controla timer y valida respuestas.
- RF7: Migración de host: si host se desconecta, el siguiente peer en `joinOrder` se convierte en nuevo host, restaura último `fullState` replicado, notifica con toast. Estado no se pierde (replicación cada cambio + heartbeat 2s).
- RF8: Límite 20 jugadores; si sala llena, nuevo peer recibe `roomFull`.
- RF9: Plantilla extensible: nuevo juego = implementar `GameModule<S,A>` + componente Svelte + registrar en `registry.ts`.

### No funcionales
- RNF1: 100% estático, sin backend propio, deploy a GitHub Pages vía Actions.
- RNF2: Bundle ligero (<150KB gzip sin juego).
- RNF3: Hash router (`#sala/...`) para evitar 404 en GH Pages; incluir `404.html` fallback.
- RNF4: Idioma ES, tema fiesta neutro reutilizable.
- RNF5: TypeScript estricto.
- RNF6: Vite `base` configurable por env (`/wg_template/` para GH Pages).

---

## 3. Arquitectura

### 3.1 Stack y topología
- **Svelte 4 + Vite 5 + TS** (SPA, sin SvelteKit) + `svelte-spa-router` hash o router manual hash simple.
- **Trystero 0.20** strategy `torrent` (trackers públicos). Adapter abstracto `TrysteroAdapter` para poder switchear a PeerJS sin tocar UI.
- Topología física: mesh de Trystero (todos-todos) para 1-20 con mensajes pequeños. Lógica: **host-autoritativo lógico** (solo host ejecuta reducer y emite `stateSync`). Mesh facilita migración (todos ya conectados) vs estrella que requeriría reconectar 19 peers.
- Si mesh satura, optimizable filtrando mensajes non-host sin cambiar topología.

### 3.2 Capas

```
UI Svelte (Landing, Room, Game, PlayerList, ShareLink, NameInput)
  ↓
Stores Svelte (roomStore, gameStore) — writable + derived
  ↓
Net Layer (net/room.ts, net/trysteroAdapter.ts, net/types.ts)
  ↓
Game Engine (game/engine.ts, game/types.ts, game/trivia/*)
```

- **UI** consume stores, despacha actions vía `net.broadcast`.
- **roomStore**: `{ salaId, hostId, peers: Peer[], selfId, selfName, isHost, joinOrder[] }`
- **gameStore**: `GameState` replicado (fuente de verdad = último `stateSync` del host).
- **Net Layer**: `createRoom()`, `joinRoom(id)`, `leaveRoom()`, `broadcast(msg)`, `onMessage(cb)`, `onPeerJoin/Leave`.
- **Engine**: función pura `reducer(state, action) => newState` + `createInitialState(peers)`.

### 3.3 Protocolo de mensajes (JSON vía Trystero DataChannel)

```ts
type Msg =
 | { t:'hello', peerId:string, name:string, joinTime:number }
 | { t:'requestState', from:string }
 | { t:'stateSync', fullState:GameState, version:number, hostId:string }
 | { t:'action', action:GameAction, from:string }
 | { t:'rename', peerId:string, newName:string }
 | { t:'roomFull', salaId:string }
 | { t:'hostChanged', newHostId:string }
```

- `hello` al entrar. Host responde con `stateSync`. Peers piden `requestState` si no reciben sync en 1s.
- `stateSync` cada cambio de estado + heartbeat 2s con `version` incremental (solo mayor version gana, evita split-brain).
- `action` peer→host, host valida y aplica reducer, luego `stateSync`.

### 3.4 Diagrama de flujo crear/unir

- Crear: `Landing.svelte: generarId() → joinRoom(id) as host (isHost=true, joinOrder=[self]) → navigate #sala/id → Room muestra link`
- Unir: `Abrir #sala/abc → joinRoom('abc') → send hello → host onPeerJoin → actualiza peers → broadcast stateSync → Room actualiza`

---

## 4. Componentes y Estructura de Archivos

```
wg_template/
├─ vite.config.ts          # base configurable, Svelte plugin
├─ svelte.config.js
├─ tsconfig.json
├─ index.html
├─ public/404.html         # SPA fallback GH Pages
├─ .github/workflows/pages.yml
├─ src/
│  ├─ main.ts
│  ├─ App.svelte            # router hash #/ → Landing, #sala/:id → Room/Game
│  ├─ app.css               # tema fiesta (variables CSS, neutro)
│  ├─ lib/
│  │  ├─ net/
│  │  │  ├─ types.ts        # Peer, RoomState, Msg
│  │  │  ├─ trysteroAdapter.ts # joinRoom Trystero, send/get, peers
│  │  │  └─ room.ts         # lógica sala: create/join/leave/broadcast/rename
│  │  ├─ stores/
│  │  │  ├─ roomStore.ts
│  │  │  └─ gameStore.ts
│  │  ├─ game/
│  │  │  ├─ types.ts        # GameModule<S,A>, GameState, Action
│  │  │  ├─ engine.ts       # host reducer, versioning
│  │  │  ├─ registry.ts     # Map gameId → module + component
│  │  │  └─ trivia/
│  │  │     ├─ types.ts
│  │  │     ├─ engine.ts
│  │  │     ├─ questions.ts # 10 preguntas ES
│  │  │     └─ Trivia.svelte
│  │  └─ utils/
│  │     ├─ names.ts        # asigna Jugador N, sanitize
│  │     └─ id.ts           # generateSalaId()
│  ├─ routes/
│  │  ├─ Landing.svelte
│  │  ├─ Room.svelte
│  │  └─ Game.svelte        # <svelte:component this={registry[gameId].Component}/>
│  └─ components/
│     ├─ PlayerList.svelte
│     ├─ ShareLink.svelte   # copiar + QR
│     └─ NameInput.svelte
├─ tests/
│  ├─ unit/
│  │  ├─ engine.test.ts
│  │  ├─ room.test.ts
│  │  └─ names.test.ts
│  └─ e2e/ (opcional playwright)
└─ README.md               # cómo usar plantilla, crear nuevo juego en 5 pasos
```

---

## 5. Gestión de Sala y Migración

- **joinOrder**: array `string[]` de peerIds en orden de llegada (host es `[0]`). Se replica en `stateSync`.
- **Elección host**: determinista `hostId = joinOrder[0]` donde peer aún conectado (`peersMap.has(id)`).
- **Detección caída**: `onPeerLeave` de Trystero → si `leftId === hostId`, cada peer calcula `nuevoHost = joinOrder.find(id => peersMap.has(id))`, si `nuevoHost === selfId` → `isHost=true` y empieza heartbeat `stateSync`.
- **Reconexión host**: si host vuelve, entra como peer normal al final de `joinOrder`, no recupera host (evita split-brain).
- **Nombres**: `names.ts: assignName(peers.length+1) => 'Jugador N'`, al entrar input prefill con ese nombre, `rename` → validación longitud 2-20, no vacío, no duplicado exacto (se permite pero se muestra con sufijo).
- **Límite 20**: `room.ts: if peers.length>=20 → send roomFull y no añade a joinOrder`.

---

## 6. Juego Demo Trivia

- **Preguntas**: 10 hardcodeadas ES en `questions.ts` (`{q, opciones:[4], correcta:0-3}`).
- **Estado**: `{ phase:'lobby'|'pregunta'|'resultados'|'final', preguntaIdx:number, respuestas:Record<peerId,opcion>, puntuaciones:Record<peerId,number>, timer:number, version:number }`
- **Timer**: solo host `setInterval 1000ms` decrementa `timer`, hace `broadcast(stateSync)`. Peers solo renderizan `timer`.
- **Acciones**: `startGame`, `answer{opcion}`, `nextQuestion`, `restart`. Host valida: solo 1 respuesta por pregunta, solo si `phase==='pregunta'` y `timer>0`.
- **Puntos**: 100 correcto + 0 bonus (simple). Ranking en `final`.
- **Extensibilidad**: documentada en README: 1) crear carpeta `src/lib/game/miJuego/`, 2) implementar `GameModule`, 3) exportar `Component.svelte`, 4) registrar en `registry.ts`, 5) cambiar `gameId` en lobby.

---

## 7. Build, Deploy, Testing

- **Vite base**: `base: process.env.BASE_PATH || '/wg_template/'` → `vite.config.ts` lee `VITE_BASE` o `BASE_PATH`.
- **Hash router**: URLs `#/` y `#sala/<id>` → no necesita rewrite en GH Pages. Se incluye `404.html` que hace `location.replace('/wg_template/#' + location.pathname)` como fallback si se usa history en futuro.
- **GitHub Actions** `.github/workflows/pages.yml`: trigger `push: main`, `npm ci`, `npm run build`, `actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4`. Permisos `pages: write`, `id-token: write`.
- **Tests**: Vitest para reducer y room logic; Playwright opcional 2 pestañas. `npm run test`, `npm run test:e2e`.
- **Verificación**: `npm run build && npx vite preview --port 4173` + abrir 2 pestañas `http://localhost:4173/#/sala/test`.

---

## 8. Riesgos

- Trackers públicos inestables → mitigación: Trystero config con 3 trackers (`tracker.openwebtorrent.com`, `tracker.fastcast.nz`, `tracker.btorrent.xyz`), adapter switcheable a PeerJS.
- Mesh 20 peers 190 conexiones → mitigación: mensajes solo JSON pequeños, filtrar non-host, heartbeat 2s no 100ms.
- Split-brain en migración → mitigación: version incremental, solo mayor version se aplica.

---

## 9. Fuera de alcance (no en plantilla base)

- Persistencia DB, login, ranking global.
- Chat de voz/video.
- Más juegos aparte de las demos de trivia y votación añadidas por el roadmap.

---

## 10. Criterios de éxito

- Usuario crea sala en <2 clicks, comparte link, segundo usuario se une sin recargar host.
- Lobby muestra lista en tiempo real, rename funciona.
- Trivia completa flujo lobby→10 preguntas→ranking sin desync.
- Host se va, nuevo host toma control sin perder puntuaciones.
- `npm run build` genera `dist/` desplegable a GH Pages y Actions despliega automáticamente.

---

## 11. Estado de implementación (2026-09-04)

### Roadmap local completado

> Actualización del roadmap: la cobertura E2E P2P real usa dos contextos de navegador.
> Depende de los trackers públicos y puede saltarse cuando no son accesibles; definir
> `E2E_P2P=1` la convierte en obligatoria para una ejecución local o CI con red.

- `Room.svelte` y `Game.svelte` resuelven el juego por registry y sincronizan `juegoId`.
- Trivia configurable por número de preguntas, segundos y categoría; votación como
  segundo juego y ejemplo mínimo.
- Verificación local: `check` sin errores, 24 tests unitarios, build correcto y seis
  E2E en verde, incluido el caso P2P obligatorio con `E2E_P2P=1`.
- Estos cambios están commiteados y publicados (`94570b2` en `origin/main`, deploy
  a Pages en success); la información que sigue describe la base publicada antes del roadmap.

### Base publicada antes del roadmap

- **Repo:** `Neikon/wg_template`, rama `main`, commit `d7cbeb1` ("feat: scaffold fiesta P2P plantilla") pusheado a `origin`. Remoto: `https://github.com/Neikon/wg_template.git`.
- **Despliegue:** Pages habilitado (`build_type=workflow`). Run `33898722403` → `build ✅ deploy ✅`. URL viva: `https://neikon.github.io/wg_template/` (el primer run `33898615747` falló solo por Pages aún no habilitado).
- **Verificación local (toolbox `Fedora-gpu`, node 22):** `npm run check` → svelte-check 0 errores; `npm run test` → 4 suites / 16 tests PASS (`names`, `id`, `room`, `engine`); `npm run build` → 160 módulos, `dist/assets/*.js` ~127 KB (43,7 KB gzip), `base=/wg_template/` correcto en `dist/index.html`.
- **Desviación del diseño:** el scaffold real es Svelte 5 + Vite 8 (no Svelte 4 + Vite 5). `src/main.ts` aún usa la API legacy `new App({ target })`; en Svelte 5 la API es `mount()`. `svelte-check` y el build no lo detectan, pero es la **hipótesis principal del bug pendiente**.
- **Devcontainer (SIN commitear):** `.devcontainer/devcontainer.json` (imagen `typescript-node:22`, `postCreateCommand: npm ci`, forward `5173/4173`, extensión `svelte.svelte-vscode`, feature `github-cli`) + `vite.config.ts` con `server/preview: { host: true, strictPort: true }` para exponer Vite desde el contenedor. Estado: `M vite.config.ts`, `?? .devcontainer/`.
- **Bug visual (resuelto):** la página publicada mostraba solo el fondo oscuro. Causa: `src/main.ts` usaba la API legacy `new App()` en vez de `mount()` de Svelte 5 (corregido en `30f6f23`). Verificado 2026-09-05: la landing renderiza en local (e2e) y en producción (`https://neikon.github.io/wg_template/` muestra título, input de nombre y botón "Crear sala").
- **Entorno del host:** Bazzite (Fedora atomic), sin `node`/`npm` locales; se usó `podman` + toolbox `Fedora-gpu` (node v22.23.1). El usuario trabaja con **Zed** (no VS Code).
