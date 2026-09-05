<script lang="ts">
  import qrcode from 'qrcode-generator'
  export let salaId: string
  let copied=false
  let showQR=false
  $: link = typeof location !== 'undefined'
    ? `${location.origin}${import.meta.env.BASE_URL}#/sala/${salaId}`
    : ''
  $: qrUrl = (()=>{ try {
    const qr = qrcode(0, 'M')
    qr.addData(link)
    qr.make()
    return qr.createDataURL(8, 0)
  } catch { return '' } })()
  async function copy(){
    try{ await navigator.clipboard.writeText(link); copied=true; setTimeout(()=>copied=false,1500)}catch{ prompt('Copia el enlace:', link)}
  }
</script>
<div class="card" style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
  <input readonly value={link} style="flex:1;min-width:200px" />
  <button on:click={copy}>{copied ? '¡Copiado!' : 'Copiar enlace'}</button>
  <button on:click={()=>showQR=!showQR} style="background:var(--muted)">{showQR ? 'Ocultar QR' : 'Ver QR'}</button>
</div>
{#if showQR && qrUrl}
  <div class="card" style="margin-top:0.6rem;text-align:center">
    <img src={qrUrl} alt="QR para unirse a la sala {salaId}" style="width:min(70vw,260px);height:auto;image-rendering:pixelated" />
    <p class="muted" style="margin-top:0.4rem">Escanea para unirte a la sala <code>{salaId}</code></p>
  </div>
{/if}
