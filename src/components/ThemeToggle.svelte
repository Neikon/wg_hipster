<script lang="ts">
  import { theme, toggleTheme } from '../lib/stores/theme'
</script>

<button
  on:click={toggleTheme}
  aria-label={$theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
  title={$theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
  style="background:var(--card);color:var(--fg);border:1px solid var(--muted);padding:0.35rem 0.6rem;font-size:1rem;line-height:1"
>{$theme === 'light' ? '🌙' : '☀️'}</button>
