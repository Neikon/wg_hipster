<script lang="ts">
  export let src: string
  export let etiqueta = 'Clip musical'
  /** Default de la partida (sincronizado, lo fija el host). */
  export let autoplayDefault = true

  const CLAVE = 'wg_hipster:autoplay'

  let audio: HTMLAudioElement | null = null
  let sonando = false
  let actual = 0
  let total = 0
  // Decisión individual del móvil (null = seguir al host). Persiste por dispositivo.
  let override: boolean | null = leerOverride()

  function leerOverride(): boolean | null {
    try {
      const v = localStorage.getItem(CLAVE)
      return v === '1' ? true : v === '0' ? false : null
    } catch {
      return null
    }
  }

  function guardarOverride(v: boolean | null) {
    override = v
    try {
      if (v === null) localStorage.removeItem(CLAVE)
      else localStorage.setItem(CLAVE, v ? '1' : '0')
    } catch {
      // solo memoria
    }
  }

  $: efectivo = override ?? autoplayDefault

  // Si el host cambia el default, se borra la decisión local: todos vuelven a seguirle.
  let ultimoDefault = autoplayDefault
  $: if (autoplayDefault !== ultimoDefault) {
    ultimoDefault = autoplayDefault
    guardarOverride(null)
  }

  function fmt(s: number): string {
    if (!Number.isFinite(s) || s < 0) return '0:00'
    const m = Math.floor(s / 60)
    const r = Math.floor(s % 60)
    return `${m}:${r.toString().padStart(2, '0')}`
  }

  async function intentarPlay() {
    if (!audio || !efectivo) return
    try {
      await audio.play()
    } catch {
      // navegador sin gesto aún (típico iOS en la primera): queda en ▶
      sonando = false
    }
  }

  // Al montar cada ronda (el padre usa {#key src}) se intenta autoplay.
  $: if (audio && src) {
    void intentarPlay()
  }

  async function alternar() {
    if (!audio) return
    try {
      if (sonando) audio.pause()
      else await audio.play()
    } catch {
      sonando = false
    }
  }

  function saltar(e: Event) {
    if (!audio || !Number.isFinite(audio.duration)) return
    audio.currentTime = Number((e.target as HTMLInputElement).value)
  }
</script>

<div class="repro" role="group" aria-label={etiqueta}>
  <!-- Sin 'controls': la UI es nuestra -->
  <audio
    bind:this={audio}
    {src}
    preload="metadata"
    on:timeupdate={()=> audio && (actual = audio.currentTime)}
    on:loadedmetadata={()=> audio && (total = audio.duration)}
    on:play={()=> (sonando = true)}
    on:pause={()=> (sonando = false)}
    on:ended={()=> (sonando = false)}
  ></audio>
  <button
    on:click={alternar}
    aria-label={sonando ? 'Pausar' : 'Reproducir'}
    class="repro-btn"
  >{sonando ? '⏸' : '▶'}</button>
  <span class="repro-tiempo" aria-hidden="true">{fmt(actual)}</span>
  <input
    type="range"
    min="0"
    max={Math.max(1, Math.floor(total))}
    step="1"
    value={Math.floor(actual)}
    on:change={saltar}
    aria-label="Posición del clip"
    class="repro-barra"
  />
  <span class="repro-tiempo" aria-hidden="true">{fmt(total)}</span>
  <button
    on:click={()=>guardarOverride(!(override ?? autoplayDefault))}
    aria-label={`Autoplay ${efectivo ? 'activado' : 'desactivado'}`}
    aria-pressed={efectivo}
    title={override === null ? 'Autoplay: sigue al anfitrión' : 'Autoplay: decisión propia'}
    class="repro-auto"
    class:on={efectivo}
  >Auto</button>
</div>

<style>
  .repro {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    margin-top: 1rem;
    background: var(--bg);
    border: 1px solid var(--muted);
    border-radius: 12px;
    padding: 0.5rem 0.8rem;
  }
  .repro audio { display: none }
  .repro-btn {
    font-size: 1.3rem;
    width: 56px;
    height: 56px;
    padding: 0;
    border-radius: 20px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .repro-tiempo { font-size: 0.85rem; color: var(--muted); min-width: 2.6em; text-align: center; white-space: nowrap; flex-shrink: 0 }
  .repro-barra { flex: 1 1 auto; width: 0; min-width: 0; accent-color: var(--accent); }
  .repro-auto {
    font-size: 0.75rem;
    padding: 0.3rem 0.6rem;
    min-height: 0;
    flex-shrink: 0;
    background: var(--muted);
    opacity: 0.75;
  }
  .repro-auto.on { background: var(--accent); opacity: 1 }
</style>
