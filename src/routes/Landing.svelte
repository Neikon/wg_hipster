<script lang="ts">
  import { generateSalaId } from '../lib/utils/id'
  import { assignName, sanitizeName } from '../lib/utils/names'
  import { DEFAULT_CONFIG } from '../lib/game/hipster/engine'
  let name = assignName(1)
  let segundos = DEFAULT_CONFIG.segundos
  let error=''
  function crear(){
    const s = sanitizeName(name)
    if (!s){ error='Nombre 2-20 caracteres'; return }
    const seg = Math.max(5, Math.min(300, Math.trunc(segundos) || DEFAULT_CONFIG.segundos))
    const id = generateSalaId()
    location.hash = `#/sala/${id}?host=1&name=${encodeURIComponent(s)}&segundos=${seg}`
  }
  function onInput(e:Event){
    name = (e.target as HTMLInputElement).value
    const s = sanitizeName(name)
    error = name && !s ? 'Nombre inválido' : ''
  }
</script>
<div class="container">
  <div class="card" style="text-align:center">
    <h1>🎉 wg_hipster</h1>
    <p class="muted">Crea una sala, comparte el enlace y juega sin servidor</p>
    <div style="margin:1.5rem 0;display:grid;gap:0.8rem;max-width:360px;margin-left:auto;margin-right:auto">
      <input value={name} on:input={onInput} placeholder="Tu nombre" maxlength="20" />
      {#if error}<span style="color:var(--error);font-size:0.9rem">{error}</span>{/if}
      <label style="display:grid;gap:0.35rem;text-align:left;color:var(--muted);font-size:0.9rem">
        Segundos por ronda
        <input type="number" min="5" max="300" bind:value={segundos} />
      </label>
      <button on:click={crear} disabled={!!error || !sanitizeName(name)}>Crear sala</button>
    </div>
    <p class="muted" style="font-size:0.85rem">1–20 jugadores · Adivina la canción · Sin registro</p>
  </div>
  <div style="margin-top:1rem" class="muted">
    <small>wg_hipster · Svelte + Trystero (P2P). El enlace contiene el id de la sala.</small>
  </div>
</div>
