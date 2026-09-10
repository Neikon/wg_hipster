# Sala fantasma P2P — diagnóstico, causa raíz y arreglos (2026-09-09/10)

Sala que funciona para los de dentro pero a la que nadie nuevo puede entrar:
el invitado se queda en «Conectando con la sala… reintentando» (1/20, solo se
ve a sí mismo) para siempre. Reproducido en producción con 3–4 jugadores y con
una pestaña recargada en la misma máquina.

## 1. Síntomas observados (producción, `neikon.github.io/wg_hipster`)

- 2 navegadores en un PC (Ethernet) en sala `4oesxu`: se ven (2/20), los
  renombres se propagan. La malla de datos está viva.
- Un móvil (5G y WiFi, Firefox y Chrome) no entra: «Conectando… reintentando»
  eterno. Hacía un rato sí se podía entrar.
- Recargar la pestaña invitada del PC la manda al mismo limbo: ya no es cosa
  del móvil, es la señalización.
- Con el build con vigía: sala `rm1oom`, 2 tabs con **«Señalización: 4/4
  trackers»** y un 3.er tab también con 4/4 pero atascado en 1/20. Sockets
  abiertos pero nadie entra.

## 2. Diagnóstico en directo (con la sala viva)

Sonda del enjambre replicando Trystero al byte (`info_hash = sha1-base36
("Trystero@<appId>@<salaId>")[:20]`, verificado contra su propio `crypto.js`):

- Anuncio manual al tracker + lectura de `complete/incomplete`, y escucha de
  ofertas 70–100 s.
- Resultado: enjambre **vacío** en los 3 trackers útiles (solo la propia
  sonda), 0 ofertas, con 2 tabs en malla y un 3.º con 4 sockets abiertos.
  Probado con `appId` actual y antiguo (`wg_template_v1_`): vacíos ambos.
- El bundle desplegado se descargó y comprobó: mismos 6 trackers, mismo
  `appId`, mismo flujo de reconexión que este repo. No era un despliegue viejo.

Conclusión intermedia: nadie anunciaba pese a tener los sockets abiertos.
Los reintentos a nivel de protocolo (requestState/heartbeat/rejoin) no podían
funcionar: el problema estaba debajo, en el anuncio.

## 3. Causas

### 3.1. Causa raíz: fuga del offer pool de Trystero 0.20.1 (torrent strategy)

Cada `announce` crea 10 ofertas (`RTCPeerConnection` vivas con ICE activo)
por tracker y las guarda en un mapa que **se reemplaza en el siguiente
announce sin destruir la hornada anterior** (`node_modules/trystero/src/
torrent.js`, `subscribe` → `announce`); la rama de respuesta usa la oferta
pero **tampoco borra su entrada**. ~40 conexiones fugadas por ciclo y pestaña.
A los minutos el navegador degrada/falla al crear más y deja de anunciar:
sockets abiertos, malla viva, enjambre caducado → sala fantasma. Las pestañas
recién abiertas mueren igual en minutos si el enjambre ya está vacío.
El pool es global a la página (cierre del módulo strategy): `leave()` +
`join()` (botón Reintentar, watchdog) **no lo sanea**; solo una recarga
(contexto JS nuevo) lo hace. Por eso ningún reintento previo sirvió.

### 3.2. Agravantes

- **Backoff sin tope** en `makeSocket` (`utils.js`: `*= 2` sin techo, solo se
  resetea con `onopen`): tras rachas de fallo, la reconexión espera decenas
  de minutos.
- **La mitad de los trackers, muertos**: sonda real 2026-09-09 → `btorrent.xyz`
  (rechazada), `webtorrent.io` (sin DNS), `files.fm` (403) caídos;
  `webtorrent.dev` y `ftorrent` conectan pero no retransmiten bien;
  solo `openwebtorrent.com` retransmite de forma fiable. En internet público
  solo existen ~3 trackers `wss` (la lista diaria ngosang/trackerslist trae un
  único `wss` en `best.txt`; el resto son udp/http, inservibles en navegador),
  así que la app depende en la práctica de un operador.

## 4. Arreglos (commits `5eca7a6` y `0b2209c`)

| Archivo | Cambio |
|---|---|
| `src/lib/net/transport.ts` | Podados los 3 trackers muertos; dentro `open.ftorrent.com:443`. Quedan 4 URLs verificadas. Hook test-only `?tracker=` intacto. |
| `src/lib/net/trysteroAdapter.ts` | Nuevo `relayStatus()` (sockets abiertos/total, sin tocar la red). Hook `?lagMs=&lossPct=` intacto. |
| `scripts/patch-trystero.js` (+ `postinstall`) | **Causa raíz**: destruye la hornada anterior al re-anunciar y borra del mapa la oferta usada en una respuesta (no mata conexiones vivas). Idempotente y estricto (falla si trystero ≠ 0.20.1 o cambia su código). |
| `src/routes/Room.svelte` | Línea `Señalización: X/Y trackers` en el lobby; aviso rojo de fantasma al host con botón Recargar (el host no se re-conecta solo: `leave()+join()` provocaría migración caótica); rejoin rápido del invitado si 0 trackers; **recarga dura topada ×2** si sigue sin sync tras 30 s (sanea el pool global; se resetea al sincronizar). |
| `tests/unit/transport.test.ts` | Umbral ≥2 trackers verificados (no 5), `relayRedundancy = min(5, N)`, tests del override `?tracker=`. |
| `tests/e2e/multijugador.spec.ts` | Ver §5. |

No se toca el protocolo `SyncNode`: con canal existente converge siempre
(probado hasta 1500 ms + 30 % de pérdida + host lento).

## 5. Pruebas

`tests/e2e/multijugador.spec.ts` — N Chromiums con WebRTC real contra un
tracker BitTorrent local (`bittorrent-tracker` devDep, inyectado vía
`?tracker=`; STUN/ICE/data channels de producción). Uniones escalonadas
(como el 4.º móvil de la fiesta) y en ráfaga; el fallo vuelca el conteo de
cada jugador para ver quién queda en limbo:

- 5/10/15/20 escalonado + 15 en ráfaga + 8 con mitad lenta (600 ms + 15 %) ✅
- 15 con 1500 ms + 30 % + host lento (puntual) ✅
- 5 vía trackers públicos (`E2E_PUBLIC`, bajo demanda) ✅
- **Envejecido** (`E2E_AGE_MIN`/`E2E_AGE_N`, opt-in por lento): sala de
  **9 min + invitado tardío converge** (9.1 min en local) ✅
- Vars: `E2E_PEERS`, `E2E_BURST`, `E2E_SLOW`, `E2E_PUBLIC`, `E2E_JOIN_GAP_MS`,
  `E2E_CONVERGE_MS`, `E2E_LAG_MS`, `E2E_LOSS_PCT`, `E2E_SLOW_HOST`.

Unitarios 70/70, `check` limpio. Nota: una corrida dio un flake en ráfaga-15
por carga que pasó al repetir (no sistemático).

## 6. Re-diagnosticar si vuelve a pasar

1. Mirar la línea `Señalización: X/Y`. `0/Y` → la señalización está muerta
   (red o trackers), no es el juego.
2. F12 → Consola/Red: errores `wss://tracker…` dicen qué tracker falla desde
   esa red.
3. Censo del enjambre: anunciar al tracker con el `info_hash` de §2 y leer
   `complete/incomplete`; 0 con tabs dentro = nadie anuncia (fuga de vuelta
   o sockets medio-abiertos tras el NAT).

## 7. Deuda y seguimiento

- El host solo se cura a mano (botón Recargar); un re-anuncio automático del
  host provocaría migración de host y parpadeo del roster. Si vuelve el
  fantasma con host, valorar `leave()+join()` con supresión del primer
  `broadcastState` vacío.
- Prueba roja completa pendiente: `E2E_AGE_MIN=25` sin el parche (lento).
- Si `openwebtorrent` cae, no hay fallback público: solo ~3 `wss` existen.
  Vigilar la lista con sonda periódica, no con `best.txt` (casi sin `wss`).
