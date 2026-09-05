# wg_template Fiesta - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plantilla reutilizable Svelte+Vite+TS para juegos de fiesta P2P (1-20 jugadores, turnos) con crear sala / compartir link / lobby / trivia demo + migración de host, 100% estática en GitHub Pages sin servidor propio (Trystero trackers públicos).

**Architecture:** SPA Svelte hash-router + Net Layer Trystero (mesh físico, host lógico autoritativo) + Stores + Game Engine puro (reducer) + registry de juegos. Ver spec para protocolo `hello/requestState/stateSync/action` con versionado.

**Tech Stack (diseño):** Svelte 4, Vite 5, TypeScript 5, Trystero 0.20, svelte-spa-router o router hash manual, qrcode opcional, Vitest, Playwright opcional.
**Tech Stack real (scaffold 2026-09-04):** Svelte 5.56, Vite 8.2.2, TypeScript ~6.0.2, @sveltejs/vite-plugin-svelte 7, Trystero 0.20, router hash manual, Vitest 3 + jsdom.

**Spec:** `docs/superpowers/specs/2026-09-04-wg-template-fiesta-design.md`

## Global Constraints

- 100% estático, sin backend propio — deploy vía `.github/workflows/pages.yml` a GitHub Pages.
- Vite `base` configurable (`/wg_template/` para GH Pages) — hash router `#sala/<id>`.
- Idioma ES, tema fiesta neutro.
- TypeScript estricto.
- Trystero strategy `torrent` con múltiples trackers públicos, adapter switcheable.
- Límite 20 jugadores, nombres `Jugador N` auto + rename validado (2-20 chars).
- Host migration determinista por `joinOrder`, `stateSync` versionado + heartbeat 2s.

---

## Estado de ejecución (2026-09-04)

- **Task 1 (scaffold):** ✅ hecho. `npm create vite test_vite -- --template svelte-ts` copiado a raíz (versiones reales arriba). `vite.config.ts` con `base=VITE_BASE || '/wg_template/'`. Commit `d7cbeb1` en `main`, pusheado a `Neikon/wg_template`.
- **Task 2 (net layer):** ✅ hecho. `src/lib/net/{types,trysteroAdapter,room}.ts` + `src/lib/utils/{id,names}.ts` + tests `names/id/room` en PASS.
- **Task 3 (stores):** ✅ hecho. `src/lib/stores/{roomStore,gameStore}.ts` con `initRoom`, `applyStateSync` por versión. Sin `tests/unit/stores.test.ts` (se validó vía tests de engine/room).
- **Task 4 (UI base):** ✅ hecho. `Landing/Room/Game` + `PlayerList/ShareLink/NameInput`, router hash en `App.svelte`.
- **Task 5 (trivia):** ✅ hecho. `src/lib/game/trivia/{types,questions,engine,Trivia}.svelte` + `registry.ts` + `tests/unit/engine.test.ts` (6 tests PASS: start/answer/doble-respuesta/tick/resultados/next).
- **Task 6 (P2P + migración):** ✅ implementado en `Room.svelte` (`hello/requestState/stateSync/action/rename`, `electNewHost`, heartbeat 2s, timer host 1s). Sin prueba E2E real de 2 peers todavía.
- **Task 7 (Pages + docs):** ✅ hecho. `pages.yml` (build `VITE_BASE=/wg_template/` + `deploy-pages@v4`), `404.html`, `README.md` ES con guía 5 pasos. Run `33898722403` en success, URL `https://neikon.github.io/wg_template/`.
- **Evidencia:** `npm run check` 0 errores · `npm run test` 16/16 PASS · `npm run build` 160 módulos, JS ~127 KB (43,7 KB gzip).
- **Pendiente:** Task 8 (devcontainer, a medio commitear) y Task 9 (bug pantalla negra) — ver final del plan.

---

## File Structure (crear/modificar)

- `package.json`, `vite.config.ts`, `svelte.config.js`, `tsconfig.json`, `index.html`
- `public/404.html`
- `.github/workflows/pages.yml`
- `src/main.ts`, `src/App.svelte`, `src/app.css`
- `src/lib/net/types.ts`, `src/lib/net/trysteroAdapter.ts`, `src/lib/net/room.ts`
- `src/lib/stores/roomStore.ts`, `src/lib/stores/gameStore.ts`
- `src/lib/game/types.ts`, `src/lib/game/engine.ts`, `src/lib/game/registry.ts`
- `src/lib/game/trivia/types.ts`, `src/lib/game/trivia/engine.ts`, `src/lib/game/trivia/questions.ts`, `src/lib/game/trivia/Trivia.svelte`
- `src/lib/utils/names.ts`, `src/lib/utils/id.ts`
- `src/routes/Landing.svelte`, `src/routes/Room.svelte`, `src/routes/Game.svelte`
- `src/components/PlayerList.svelte`, `src/components/ShareLink.svelte`, `src/components/NameInput.svelte`
- `tests/unit/engine.test.ts`, `tests/unit/room.test.ts`, `tests/unit/names.test.ts`
- `README.md`

---

### Task 1: Scaffold Svelte + Vite + TS + deps base

**Files:**
- Create: `package.json`, `vite.config.ts`, `svelte.config.js`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `public/404.html`, `src/main.ts`, `src/App.svelte`, `src/app.css`, `src/vite-env.d.ts`
- Modify: none

**Interfaces:**
- Consumes: nada
- Produces: proyecto compilable `npm run dev/build`, base configurable

- [ ] **Step 1: Inicializar proyecto Vite Svelte TS**

Run: `npm create vite@latest . -- --template svelte-ts` (o manual). Si `npm create` interactivo falla, crear archivos manuales.

```bash
# En wg_template vacío:
npm init -y
npm install svelte @sveltejs/vite-plugin-svelte
npm install -D vite typescript
```

Alternativa exacta: usar `npm create vite` con `svelte-ts`.

Verificar `package.json` contiene scripts `dev`, `build`, `preview`.

- [ ] **Step 2: Escribir vite.config.ts con base configurable y plugin Svelte**

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  base: process.env.VITE_BASE || '/wg_template/',
  server: { port: 5173 },
  preview: { port: 4173 }
})
```

- [ ] **Step 3: Escribir tsconfig.json estricto**

```json
{
  "extends": "@tsconfig/svelte/tsconfig.json",
  "compilerOptions": {
    "target": "ESNext",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "resolveJsonModule": true,
    "allowJs": true,
    "checkJs": true,
    "isolatedModules": true,
    "strict": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts","src/**/*.svelte"]
}
```

Añadir `svelte.config.js` y `index.html` estándar Vite.

- [ ] **Step 4: Crear src/main.ts y src/App.svelte mínimo con hash router**

```ts
// src/main.ts
import App from './App.svelte'
import './app.css'
const app = new App({ target: document.getElementById('app')! })
export default app
```

```svelte
<!-- src/App.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  let route = location.hash || '#/'
  onMount(()=> window.addEventListener('hashchange', ()=> route = location.hash))
</script>
<main>
  {#if route.startsWith('#/sala/')}
    <p>Sala {route}</p>
  {:else}
    <h1>wg_template Fiesta</h1>
    <a href="#/sala/test">Crear sala</a>
  {/if}
</main>
```

- [ ] **Step 5: Crear app.css tema fiesta neutro ES**

```css
:root { --bg:#0f0e17; --fg:#fffffe; --accent:#ff8906; --card:#232946; }
body{margin:0;font-family:system-ui;background:var(--bg);color:var(--fg)}
```

- [ ] **Step 6: Instalar y verificar build**

Run: `npm install && npm run build`
Expected: PASS, `dist/index.html` existe con `<script type="module">`

- [ ] **Step 7: Crear public/404.html fallback GH Pages**

```html
<script>sessionStorage.redirect = location.href; location.replace('/wg_template/')</script>
```

+ en `index.html` restaurar redirect si existe.

- [ ] **Step 8: Commit**

```bash
git init -b main 2>/dev/null || true
git add package.json vite.config.ts svelte.config.js tsconfig.json index.html public/ src/
git commit -m "feat: scaffold Svelte+Vite+TS con base GH Pages"
```

---

### Task 2: Net Layer — Trystero adapter + room logic + utils

**Files:**
- Create: `src/lib/net/types.ts`, `src/lib/net/trysteroAdapter.ts`, `src/lib/net/room.ts`, `src/lib/utils/names.ts`, `src/lib/utils/id.ts`
- Test: `tests/unit/names.test.ts`, `tests/unit/room.test.ts`

**Interfaces:**
- Consumes: Trystero `joinRoom`
- Produces: `createSalaId():string`, `assignName(index:number):string`, `sanitizeName(name:string):string|null`, `createRoomAdapter(salaId:string)` con `{ send, onMessage, onPeerJoin, onPeerLeave, leave }`

- [ ] **Step 1: Escribir test fallido para names y id**

```ts
// tests/unit/names.test.ts
import { describe,it,expect } from 'vitest'
import { assignName, sanitizeName } from '../../src/lib/utils/names'
describe('names',()=>{
  it('assigns Jugador N',()=> expect(assignName(1)).toBe('Jugador 1'))
  it('sanitizes too short',()=> expect(sanitizeName('a')).toBeNull())
  it('sanitizes ok',()=> expect(sanitizeName(' Ana ')).toBe('Ana'))
})
```

```ts
// tests/unit/room.test.ts - mock trystero
import { generateSalaId } from '../../src/lib/utils/id'
import { describe,it,expect } from 'vitest'
describe('id',()=>{ it('generates 6 chars',()=> expect(generateSalaId()).toMatch(/^[a-z0-9]{6}$/)) })
```

- [ ] **Step 2: Run test to verify fail**

Run: `npm run test -- tests/unit/names.test.ts`
Expected: FAIL "cannot find module"

- [ ] **Step 3: Instalar deps y crear implementaciones**

```bash
npm install trystero
npm install -D vitest jsdom
```

```ts
// src/lib/utils/id.ts
export function generateSalaId(): string {
  return Math.random().toString(36).slice(2,8).padEnd(6,'0')
}
```

```ts
// src/lib/utils/names.ts
export function assignName(index:number):string { return `Jugador ${index}` }
export function sanitizeName(raw:string):string|null {
  const t = raw.trim().slice(0,20)
  if (t.length < 2) return null
  return t
}
```

```ts
// src/lib/net/types.ts
export type PeerId = string
export interface Peer { id: PeerId; name: string; joinTime: number }
export type Msg =
 | { t:'hello', peerId:string, name:string, joinTime:number }
 | { t:'requestState', from:string }
 | { t:'stateSync', fullState:any, version:number, hostId:string, peers:Peer[], joinOrder:string[] }
 | { t:'action', action:any, from:string }
 | { t:'roomFull', salaId:string }
```

```ts
// src/lib/net/trysteroAdapter.ts
import { joinRoom as trysteroJoin } from 'trystero/torrent'
export function createTrysteroRoom(salaId:string, onMessage:(m:any,peerId:string)=>void) {
  const room = trysteroJoin({appId:'wg_template_v1_'+salaId}, salaId)
  const [send, get] = room.makeAction('msg')
  // get handler
  room.onPeerJoin(id=>{})
  room.onPeerLeave(id=>{})
  return { send, get, room }
}
```

Simplificar: exponer `joinTrystero(salaId)` que retorna `{send, get, onPeerJoin, onPeerLeave, leave}`.

```ts
// src/lib/net/room.ts
import { generateSalaId } from '../utils/id'
import { writable } from 'svelte/store'
export { generateSalaId }
```

Implementar lógica de peers, joinOrder, isHost, version.

- [ ] **Step 4: Run tests pass**

Run: `npm run test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/net/ src/lib/utils/ tests/unit/
git commit -m "feat: net layer trystero + utils names/id"
```

---

### Task 3: Stores Svelte — roomStore + gameStore

**Files:**
- Create: `src/lib/stores/roomStore.ts`, `src/lib/stores/gameStore.ts`
- Modify: `src/lib/net/room.ts` (integrar stores)

**Interfaces:**
- Consumes: Net Layer `createTrysteroRoom`
- Produces: `roomStore: writable<RoomState>`, `gameStore: writable<GameState>`, `initRoom(salaId, selfName, isHost)`, `handleIncoming(msg)`

- [ ] **Step 1: Write failing test for stores**

```ts
// tests/unit/stores.test.ts
import { get } from 'svelte/store'
import { roomStore, initRoom } from '../../src/lib/stores/roomStore'
import { describe,it,expect } from 'vitest'
describe('roomStore',()=>{
  it('init as host sets isHost',()=>{
    initRoom('abc123','Jugador 1', true)
    expect(get(roomStore).isHost).toBe(true)
    expect(get(roomStore).salaId).toBe('abc123')
  })
})
```

- [ ] **Step 2: Run fail**

Run: `vitest run tests/unit/stores.test.ts`
Expected: FAIL not found

- [ ] **Step 3: Implement roomStore.ts**

```ts
// src/lib/stores/roomStore.ts
import { writable } from 'svelte/store'
import type { Peer } from '../net/types'
export interface RoomState {
  salaId:string; selfId:string; selfName:string; hostId:string; peers:Peer[]; joinOrder:string[]; isHost:boolean; version:number
}
export const roomStore = writable<RoomState>({ salaId:'', selfId:'', selfName:'', hostId:'', peers:[], joinOrder:[], isHost:false, version:0 })
export function initRoom(salaId:string, selfName:string, isHost:boolean){
  const selfId = Math.random().toString(36).slice(2,9)
  const peer:Peer={id:selfId,name:selfName,joinTime:Date.now()}
  roomStore.set({ salaId, selfId, selfName, hostId: isHost?selfId:'', peers:[peer], joinOrder:[selfId], isHost, version:0 })
}
```

```ts
// src/lib/stores/gameStore.ts
import { writable } from 'svelte/store'
export const gameStore = writable<any>({ phase:'lobby', version:0 })
```

- [ ] **Step 4: Run pass**

Run: `vitest run tests/unit/stores.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/ tests/unit/stores.test.ts
git commit -m "feat: stores room y game"
```

---

### Task 4: UI Base — Landing, Room, PlayerList, ShareLink, NameInput + router

**Files:**
- Create: `src/routes/Landing.svelte`, `src/routes/Room.svelte`, `src/routes/Game.svelte`, `src/components/PlayerList.svelte`, `src/components/ShareLink.svelte`, `src/components/NameInput.svelte`
- Modify: `src/App.svelte`, `src/main.ts`

**Interfaces:**
- Consumes: `roomStore`, `generateSalaId`, `assignName`, `sanitizeName`
- Produces: Navegación hash, UI lobby reactiva

- [ ] **Step 1: Implement Landing.svelte**

```svelte
<script lang="ts">
  import { generateSalaId } from '../lib/utils/id'
  import { assignName } from '../lib/utils/names'
  let name = assignName(1)
  function crear(){
    const id = generateSalaId()
    location.hash = `#/sala/${id}?host=1&name=${encodeURIComponent(name)}`
  }
</script>
<h1>Fiesta — Crea tu sala</h1>
<input bind:value={name} placeholder="Tu nombre" maxlength="20"/>
<button on:click={crear}>Crear sala</button>
```

- [ ] **Step 2: Implement ShareLink.svelte**

```svelte
<script lang="ts"> export let salaId:string
  $: link = `${location.origin}${import.meta.env.BASE_URL}#/sala/${salaId}`
  let copied=false
  function copy(){ navigator.clipboard.writeText(link); copied=true; setTimeout(()=>copied=false,1500)}
</script>
<div><input readonly value={link}/><button on:click={copy}>{copied?'¡Copiado!':'Copiar enlace'}</button></div>
```

- [ ] **Step 3: PlayerList + NameInput**

```svelte
<!-- PlayerList.svelte -->
<script lang="ts"> export let peers:any[]; export let hostId:string</script>
<ul>{#each peers as p}<li>{p.name} {p.id===hostId?'(Anfitrión)':''}</li>{/each}</ul>
```

- [ ] **Step 4: Room.svelte con lógica join/leave y lista**

Integrar `roomStore`, `onMount` parse hash `salaId` y `host` param, si `host=1` initRoom como host else peer.

- [ ] **Step 5: Update App.svelte router**

```svelte
<script lang="ts">
  import Landing from './routes/Landing.svelte'
  import Room from './routes/Room.svelte'
  let path = location.hash
  window.addEventListener('hashchange',()=> path=location.hash)
</script>
{#if path.startsWith('#/sala/')}
  <Room/>
{:else}
  <Landing/>
{/if}
```

- [ ] **Step 6: Verify manual**

Run: `npm run dev` → abrir `http://localhost:5173/` → crear sala → ver link `#/sala/xxxx` y lista

- [ ] **Step 7: Commit**

```bash
git add src/routes/ src/components/ src/App.svelte
git commit -m "feat: UI landing y lobby con share link"
```

---

### Task 5: Game Engine + Registry + Trivia demo

**Files:**
- Create: `src/lib/game/types.ts`, `src/lib/game/engine.ts`, `src/lib/game/registry.ts`, `src/lib/game/trivia/types.ts`, `src/lib/game/trivia/questions.ts`, `src/lib/game/trivia/engine.ts`, `src/lib/game/trivia/Trivia.svelte`
- Test: `tests/unit/engine.test.ts`

**Interfaces:**
- Consumes: `RoomState`
- Produces: `GameModule` interface, `triviaModule: GameModule<TriviaState,TriviaAction>`, `createInitialState`, `reducer`

- [ ] **Step 1: Write failing test para reducer trivia**

```ts
// tests/unit/engine.test.ts
import { describe,it,expect } from 'vitest'
import { createInitialState, reducer } from '../../src/lib/game/trivia/engine'
describe('trivia',()=>{
  it('startGame moves to pregunta',()=>{
    let s = createInitialState([{id:'a',name:'Jugador 1',joinTime:1}])
    s = reducer(s,{t:'startGame'},{isHost:true,peerId:'a'})
    expect(s.phase).toBe('pregunta')
    expect(s.preguntaIdx).toBe(0)
  })
  it('answer records',()=>{
    let s = createInitialState([{id:'a',name:'p1',joinTime:1},{id:'b',name:'p2',joinTime:2}])
    s = reducer(s,{t:'startGame'},{isHost:true,peerId:'a'})
    s = reducer(s,{t:'answer', opcion:2},{isHost:true,peerId:'b'})
    expect(s.respuestas['b']).toBe(2)
  })
})
```

- [ ] **Step 2: Run fail**

Run: `vitest run tests/unit/engine.test.ts` → FAIL

- [ ] **Step 3: Implement types y trivia**

```ts
// src/lib/game/types.ts
export interface GameModule<S,A> {
  id:string
  createInitialState(peers:any[]):S
  reducer(state:S, action:A, ctx:{isHost:boolean, peerId:string}):S
  Component:any
}
```

```ts
// src/lib/game/trivia/questions.ts
export const QUESTIONS=[{q:'¿Capital de España?', opciones:['Barcelona','Madrid','Valencia','Sevilla'], correcta:1}, ...10]
```

```ts
// src/lib/game/trivia/engine.ts
export function createInitialState(peers:any[]){return {phase:'lobby',preguntaIdx:0,respuestas:{},puntuaciones:Object.fromEntries(peers.map(p=>[p.id,0])),timer:20,version:0}}
export function reducer(state:any, action:any, ctx:any){
  if(action.t==='startGame' && ctx.isHost) return {...state, phase:'pregunta', preguntaIdx:0, respuestas:{}, timer:20, version:state.version+1}
  if(action.t==='answer' && state.phase==='pregunta') {
    if(state.respuestas[ctx.peerId]!==undefined) return state
    return {...state, respuestas:{...state.respuestas,[ctx.peerId]:action.opcion}, version:state.version+1}
  }
  // next, tick, etc
  return state
}
```

- [ ] **Step 4: Implement Trivia.svelte + registry**

```ts
// src/lib/game/registry.ts
import * as trivia from './trivia/engine'
import TriviaComp from './trivia/Trivia.svelte'
export const registry={ trivia: { module: trivia, Component: TriviaComp } }
export let currentGame='trivia'
```

- [ ] **Step 5: Implement Game.svelte que usa registry y gameStore**

Timer solo host: `if($roomStore.isHost && $gameStore.phase==='pregunta') setInterval=>tick`

- [ ] **Step 6: Run tests pass**

Run: `vitest run tests/unit/engine.test.ts` → PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/ tests/unit/engine.test.ts src/routes/Game.svelte
git commit -m "feat: trivia engine + registry + UI"
```

---

### Task 6: Integración P2P real + migración host + validaciones

**Files:**
- Modify: `src/lib/net/trysteroAdapter.ts`, `src/lib/net/room.ts`, `src/lib/stores/roomStore.ts`, `src/lib/stores/gameStore.ts`, `src/routes/Room.svelte`, `src/lib/game/engine.ts`
- Test: `tests/unit/room.test.ts` (host migration)

**Interfaces:**
- Consumes: Trystero `makeAction`, `onPeerJoin/Leave`
- Produces: `broadcast`, `handleStateSync`, `electNewHost()`

- [ ] **Step 1: Write test migración**

```ts
// tests/unit/room.test.ts - mock adapter
import { electNewHost } from '../../src/lib/net/room'
it('elects next peer when host leaves',()=>{
  expect(electNewHost(['a','b','c'], new Set(['b','c']))).toBe('b')
})
it('returns null if none',()=>{
  expect(electNewHost(['a'], new Set())).toBeNull()
})
```

- [ ] **Step 2: Run fail**

Run: `vitest run tests/unit/room.test.ts` → FAIL

- [ ] **Step 3: Implement trysteroAdapter real + room.ts completo**

```ts
// trysteroAdapter.ts real
import {joinRoom} from 'trystero/torrent'
export function joinTrystero(salaId:string){
  const config={appId:'wg_template_v1_'+salaId}
  const room = joinRoom(config, salaId)
  const [send, get] = room.makeAction('msg')
  return { send, get, onPeerJoin: room.onPeerJoin, onPeerLeave: room.onPeerLeave, leave: room.leave }
}
```

```ts
// room.ts
export function electNewHost(joinOrder:string[], connected:Set<string>){
  return joinOrder.find(id=>connected.has(id))||null
}
export function setupRoom(salaId:string, selfName:string, isHost:boolean){
  const {send,get,onPeerJoin,onPeerLeave}=joinTrystero(salaId)
  // hello, requestState, stateSync handlers, broadcast, heartbeat, host election on onPeerLeave
}
```

Integrar en `Room.svelte` onMount: `setupRoom(salaId, name, isHost)`

Host heartbeat: cada 2s `send({t:'stateSync', fullState:get(gameStore), version, hostId, peers, joinOrder})`

Migración: `onPeerLeave(id => { if(id===hostId){ newHost=electNewHost(...); if(newHost===selfId) isHost=true; }})`

- [ ] **Step 4: Run pass**

Run: `vitest run tests/unit/room.test.ts` → PASS + manual 2 pestañas

- [ ] **Step 5: Commit**

```bash
git add src/lib/net/ src/lib/stores/ src/routes/Room.svelte
git commit -m "feat: P2P integración + migración host"
```

---

### Task 7: GitHub Actions Pages + 404 fallback + README + polish

**Files:**
- Create: `.github/workflows/pages.yml`
- Modify: `README.md`, `vite.config.ts` (si falta base), `public/404.html`, `src/app.css`

**Interfaces:**
- Consumes: `dist/` build output
- Produces: deploy automático

- [ ] **Step 1: Escribir pages.yml**

```yaml
name: Deploy to Pages
on: { push: { branches: [main] }, workflow_dispatch: {} }
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run build
        env: { VITE_BASE: /wg_template/ }
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: README ES con 5 pasos crear nuevo juego**

Documentar `npm install`, `npm run dev`, crear `src/lib/game/miJuego/`, implementar `GameModule`, registrar en `registry.ts`, personalizar `questions.ts`.

Incluir sección "Cómo funciona sin servidor (Trystero)" y "Migrar a PeerJS".

- [ ] **Step 3: Polish CSS + 404.html final**

Verificar `vite preview` con `base`.

- [ ] **Step 4: Build final verify**

Run: `npm run build && npx vite preview --port 4173` → abrir 2 pestañas, probar flujo completo 20s

- [ ] **Step 5: Commit y push**

```bash
git add .github/ README.md public/404.html
git commit -m "feat: GH Pages workflow + docs"
```

---

## Self-Review Checklist

- [ ] Spec coverage: cada RF/RNF tiene task (RF1-2 T4, RF3 T2/T6, RF4 T4, RF5 T4/T6, RF6 T5, RF7 T6, RF8 T6, RF9 T5, RNF1 T7, RNF2 T1, RNF3 T1/T7, RNF4 T1, RNF5 T1)
- [ ] Placeholder scan: sin TBD/TODO, todos pasos con código concreto
- [ ] Type consistency: `Peer`, `RoomState`, `Msg`, `GameModule` coherentes entre T2-T6

---

## Execution Handoff

Plan complete y guardado en `docs/superpowers/plans/2026-09-04-wg-template-fiesta-implementation.md`. Dos opciones:

**1. Subagent-Driven (recomendado)** — despacho subagente por tarea, review entre tareas

**2. Inline Execution** — ejecución en esta sesión con checkpoints

¿Cuál eliges?

---

### Task 8: Devcontainer portable (EN CURSO — sin commitear)

**Files:**
- Create: `.devcontainer/devcontainer.json`
- Modify: `vite.config.ts` (`server/preview` con `host: true, strictPort: true`)

**Estado 2026-09-04:** archivos creados y validados (`JSON OK`), pendientes de `git add + commit + push`.
`.devcontainer/devcontainer.json` usa imagen `mcr.microsoft.com/devcontainers/typescript-node:22`, `postCreateCommand: npm ci`, forward `5173` (dev) + `4173` (preview), extensión `svelte.svelte-vscode`, **sin `features`** (el feature `github-cli` se eliminó el 2026-09-04: rompía el build con podman — `cp: cannot access '/tmp/build-features-src/github-cli_0': Permission denied`, ver `Zed.log` línea `docker buildx build failed`). `gh` se instala vía `.devcontainer/post-create.sh` (apt, solo si falta) y después corre `npm ci`; `postCreateCommand` invoca ese script.

- [x] **Step 1:** crear `.devcontainer/devcontainer.json`
- [x] **Step 2:** `vite.config.ts` con `host: true, strictPort: true`
- [x] **Step 3:** validar JSON
- [ ] **Step 4:** commit + push
- [ ] **Step 5:** reabrir en contenedor (Zed) y verificar `npm run dev/test/build` dentro

---

### Task 9: Bug pantalla negra en Pages (PENDIENTE — diagnosticar en contenedor)

**Síntoma:** `https://neikon.github.io/wg_template/` muestra solo el fondo oscuro (`app.css`), sin elementos.

**Hipótesis principal:** `src/main.ts` usa API legacy Svelte 4 (`new App({ target })`) pero el proyecto lleva Svelte 5.56, cuya API es `mount(App, { target })` desde `svelte`. El build y `svelte-check` pasan igual, pero el montaje falla en runtime.

**Pasos sugeridos:**
- [ ] **Step 1:** abrir la URL publicada, consola del navegador, anotar el error exacto
- [ ] **Step 2:** leer `src/main.ts` + versión `svelte` en `package.json`
- [ ] **Step 3:** migrar `main.ts` a `mount()` según docs de Svelte 5 (mantener `import './app.css'`)
- [ ] **Step 4:** `npm run check && npm run test && npm run build`, probar `vite preview` + 2 pestañas `#/sala/<id>`
- [ ] **Step 5:** commit + push, esperar run de Pages en success, re-verificar URL pública
