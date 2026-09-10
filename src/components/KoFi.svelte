<script lang="ts">
  /** Píldora sutil de apoyo: no interfiere con el juego. */
  const URL = 'https://ko-fi.com/ulisesrp'
</script>

<a class="kofi" href={URL} target="_blank" rel="noopener" aria-label="Invítame a un café en ko-fi">☕ Invítame a un café</a>

<style>
  .kofi {
    display: block;
    width: fit-content;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--accent);
    /* Fallback sin color-mix (navegadores viejos): tarjeta + borde muted. */
    background: var(--card);
    border: 1px solid var(--muted);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    border-radius: 999px;
    padding: 0.35rem 0.9rem;
    margin: 0.8rem auto 0;
    text-decoration: none;
    transition: background-color 0.15s ease;
  }
  .kofi:hover {
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    color: var(--accent);
  }
</style>
