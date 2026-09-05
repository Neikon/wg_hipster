<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { sanitizeName } from '../lib/utils/names'
  export let value: string = ''
  let error=''
  const dispatch = createEventDispatcher()
  function onInput(e:Event){
    const v = (e.target as HTMLInputElement).value
    value=v
    const s = sanitizeName(v)
    if (v && !s) error='Nombre 2-20 caracteres (letras/números/_- )'
    else error=''
  }
  function save(){
    const s = sanitizeName(value)
    if (!s){ error='Nombre inválido'; return}
    dispatch('save', s)
  }
</script>
<div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
  <input value={value} on:input={onInput} placeholder="Tu nombre" maxlength="20" style="flex:1" />
  <button on:click={save} disabled={!!error || !sanitizeName(value)}>Guardar</button>
</div>
{#if error}<p style="color:var(--error);font-size:0.9rem">{error}</p>{/if}
