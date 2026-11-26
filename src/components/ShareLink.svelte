<script lang="ts">
  import { qrParaSala } from '../lib/utils/qr'
  import { DEFAULT_GAME_ID } from '../lib/game/registry'
  import { signalingParams, type Estrategia, type SupaConf } from '../lib/net/signaling'
  import { trackerOverrides } from '../lib/net/transport'
  export let salaId: string
  export let juegoId: string = DEFAULT_GAME_ID
  export let estrategia: Estrategia = 'torrent'
  export let supa: SupaConf | null = null
  export let hostTransportId = ''
  let copied=false
  let showQR=false
  $: {
    const q = signalingParams(estrategia, supa)
    if (juegoId && juegoId !== DEFAULT_GAME_ID) q.set('juego', juegoId)
    if (hostTransportId) q.set('anfitrion', hostTransportId)
    if (estrategia === 'torrent') {
      for (const tracker of trackerOverrides()) q.append('tracker', tracker)
    }
    link = `${location.origin}${location.pathname}#/sala/${salaId}?${q}`
  }
  let link = ''
  $: qrUrl = showQR ? qrParaSala(link) : ''
  async function copy(){
    try{ await navigator.clipboard.writeText(link); copied=true; setTimeout(()=>copied=false,1500)}catch{ prompt('Copia el enlace:', link)}
  }
</script>
<div style="display:grid;gap:0.6rem">
  <input readonly value={link} aria-label="Enlace de la sala" style="width:100%" />
  <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
    <button on:click={copy} style="flex:1;min-width:140px">{copied ? '¡Copiado!' : 'Copiar enlace'}</button>
    <button on:click={()=>showQR=!showQR} style="flex:1;min-width:140px;background:var(--muted)">{showQR ? 'Ocultar QR' : 'Ver QR'}</button>
  </div>
</div>
{#if showQR && qrUrl}
  <div class="card" style="margin-top:0.6rem;text-align:center">
    <img src={qrUrl} alt="QR para unirse a la sala {salaId}" style="width:min(70vw,260px);height:auto;image-rendering:pixelated" />
    <p class="muted" style="margin-top:0.4rem">Escanea para unirte a la sala <code>{salaId}</code></p>
  </div>
{/if}
