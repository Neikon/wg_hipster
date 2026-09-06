<script lang="ts">
  import { generateSalaId } from '../lib/utils/id'
  import { assignName, sanitizeName } from '../lib/utils/names'
  import ThemeToggle from '../components/ThemeToggle.svelte'
  let name = assignName(1)
  let error=''
  function crear(){
    const s = sanitizeName(name)
    if (!s){ error='Nombre 2-20 caracteres'; return }
    const id = generateSalaId()
    location.hash = `#/sala/${id}?host=1&name=${encodeURIComponent(s)}`
  }
  function onInput(e:Event){
    name = (e.target as HTMLInputElement).value
    const s = sanitizeName(name)
    error = name && !s ? 'Nombre inválido' : ''
  }
</script>
<div class="container">
  <div class="card" style="text-align:center">
    <div style="display:flex;justify-content:flex-end"><ThemeToggle /></div>
    <h1>🎉 wg_hipster</h1>
    <p class="muted">Crea una sala, comparte el enlace y juega sin servidor</p>
    <div style="margin:1.5rem 0;display:grid;gap:0.8rem;max-width:360px;margin-left:auto;margin-right:auto">
      <input value={name} on:input={onInput} placeholder="Tu nombre" maxlength="20" />
      {#if error}<span style="color:var(--error);font-size:0.9rem">{error}</span>{/if}
      <button on:click={crear} disabled={!!error || !sanitizeName(name)}>Crear sala</button>
    </div>
    <p class="muted" style="font-size:0.85rem">1–20 jugadores · Adivina la canción · Sin registro</p>
  </div>
  <div style="margin-top:1rem" class="muted">
    <small>wg_hipster · Svelte + Trystero (P2P). El enlace contiene el id de la sala.</small>
  </div>
</div>
