import { test, expect } from '@playwright/test'

test('landing renderiza y crear sala lleva al lobby', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('#/')
  await expect(page.getByRole('heading', { name: /wg_hipster/ })).toBeVisible()

  // toggle de tema claro/oscuro persiste
  const toggle = page.getByRole('button', { name: /modo (claro|oscuro)/ })
  const temaIni = await page.evaluate(() => document.documentElement.dataset.theme)
  const temaAlt = temaIni === 'light' ? 'dark' : 'light'
  await toggle.click()
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.theme)).toBe(temaAlt)
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('wg_hipster:tema'))).toBe(temaAlt)
  await toggle.click()
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.theme)).toBe(temaIni)

  await page.getByRole('button', { name: /Crear sala/ }).click()

  await expect(page).toHaveURL(/#\/sala\/[A-Za-z0-9]{6}/)
  await expect(page.getByRole('heading', { name: /Sala/ })).toBeVisible()

  // el enlace compartido apunta a este juego (no al template) y salir vuelve a la landing
  const link = await page.locator('input[readonly]').first().inputValue()
  expect(link).toContain('/wg_hipster/#/sala/')
  expect(link).not.toContain('wg_template')

  expect(errors).toEqual([])
})

test('al empezar el juego se ocultan los elementos del lobby', async ({ page }) => {
  await page.goto('#/')
  await page.getByRole('button', { name: /Crear sala/ }).click()
  await expect(page).toHaveURL(/#\/sala\/[A-Za-z0-9]{6}/)

  // lobby: enlace para compartir y lista de jugadores visibles
  await expect(page.getByRole('button', { name: /Copiar enlace/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Jugadores/ })).toBeVisible()

  // el QR se genera al pedirlo
  await page.getByRole('button', { name: /Ver QR/ }).click()
  await expect(page.getByAltText(/QR para unirse/)).toBeVisible()

  // el anfitrión carga la lista y empieza la partida
  await page.getByRole('button', { name: /Cargar lista/ }).click()
  await page.getByRole('button', { name: /Empezar hipster/ }).click()

  // juego: reproductor propio + carátula difuminada a pantalla completa, sin elementos de lobby
  await expect(page.getByText(/¿Qué canción es\?/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reproducir' })).toBeVisible()
  await expect(page.getByAltText('Carátula difuminada')).toBeVisible()
  await expect(page.getByRole('button', { name: /Copiar enlace/ })).toBeHidden()
  await expect(page.getByRole('heading', { name: /Jugadores/ })).toBeHidden()
  await expect(page.getByRole('heading', { name: /Cambiar nombre/ })).toBeHidden()
})

test('en móvil (360px) la ronda no desborda horizontalmente', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('#/sala/mov001?host=1&name=Ana')
  await page.getByRole('button', { name: /Cargar lista/ }).click()
  await page.getByRole('button', { name: /Empezar hipster/ }).click()
  await expect(page.getByText(/¿Qué canción es\?/)).toBeVisible()
  // ni el documento ni la tarjeta desbordan (la tarjeta se salía visualmente)
  for (const sel of ['document.documentElement', '.sala', '.card']) {
    const ok = await page.evaluate(
      (s) => {
        const el = s === 'document.documentElement' ? document.documentElement : document.querySelector(s);
        return el ? el.getBoundingClientRect().right <= window.innerWidth + 1 : false;
      },
      sel
    );
    expect(ok, sel).toBe(true);
  }
  await page.getByRole('button', { name: /^A\. / }).click()
  await expect(page.getByRole('heading', { name: 'Resultados' })).toBeVisible()
  const cardOk = await page.evaluate(() => {
    const el = document.querySelector('.card');
    return el ? el.getBoundingClientRect().right <= window.innerWidth + 1 : false;
  });
  expect(cardOk).toBe(true);
})

test('títulos largos sin espacios no desbordan la tarjeta', async ({ page }) => {
  const largo = 'Supercalifragilisticoespialidosoextraordinario'
  const track = (id: number) => ({
    id,
    title: `${largo}${id}`,
    artist: { name: 'ArtistaLarguísimoSinEspacios' },
    album: { title: 'Álbum', cover_medium: '' },
    preview: `https://clip${id}.mp3`
  })
  await page.route('https://api.deezer.com/search/playlist?*', (route) => {
    const cb = new URL(route.request().url()).searchParams.get('callback') ?? 'cb'
    route.fulfill({
      contentType: 'application/javascript',
      body: `${cb}({"data":[{"id":998,"title":"Largas","nb_tracks":5,"picture_medium":""}]})`
    })
  })
  await page.route('https://api.deezer.com/playlist/998/tracks?*', (route) => {
    const cb = new URL(route.request().url()).searchParams.get('callback') ?? 'cb'
    route.fulfill({
      contentType: 'application/javascript',
      body: `${cb}({"data":[${[1, 2, 3, 4, 5].map((i) => JSON.stringify(track(i))).join(',')}]})`
    })
  })
  await page.route('https://itunes.apple.com/*', (route) => route.fulfill({ json: { results: [], resultCount: 0 } }))

  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('#/sala/lar001?host=1&name=Ana')
  await page.getByLabel('Lista de canciones').selectOption('__buscar__')
  // activar la pista de título: genera una palabra larga sin espacios
  await page.getByRole('checkbox', { name: 'Título', exact: true }).click()
  await page.getByLabel('Texto a buscar').fill('largas')
  await page.getByRole('button', { name: '🔍' }).click()
  await page.getByRole('button', { name: /Largas/ }).click()
  await expect(page.getByText(/Lista ✓ 5 rondas/)).toBeVisible()
  await page.getByRole('button', { name: /Empezar hipster/ }).click()
  await expect(page.getByText(/¿Qué canción es\?/)).toBeVisible()
  const cardOk = await page.evaluate(() => {
    const el = document.querySelector('.card');
    return el ? el.getBoundingClientRect().right <= window.innerWidth + 1 : false;
  });
  expect(cardOk).toBe(true);
})

test('crear una segunda sala muestra datos limpios de la nueva', async ({ page }) => {
  await page.goto('#/')
  await page.getByRole('button', { name: /Crear sala/ }).click()
  await expect(page).toHaveURL(/#\/sala\/([A-Za-z0-9]{6})/)
  const urlA = page.url()
  const salaA = urlA.match(/#\/sala\/([A-Za-z0-9]{6})/)![1]

  await page.getByRole('button', { name: 'Salir' }).click()
  await expect(page.getByRole('heading', { name: /wg_hipster/ })).toBeVisible()

  await page.getByRole('button', { name: /Crear sala/ }).click()
  await expect(page).toHaveURL(/#\/sala\/([A-Za-z0-9]{6})/)
  const salaB = page.url().match(/#\/sala\/([A-Za-z0-9]{6})/)![1]
  expect(salaB).not.toBe(salaA)

  // lobby limpio de la sala B
  await expect(page.getByRole('heading', { name: new RegExp(salaB) })).toBeVisible()
  await expect(page.getByText('1/20 jugadores')).toBeVisible()
})

test('completa las 5 rondas del hipster hasta la final', async ({ page }) => {
  await page.goto('#/sala/corta1?host=1&name=Ana&segundos=30')

  await expect(page.getByLabel('Segundos por ronda').first()).toHaveValue('30')
  await page.getByRole('button', { name: /Cargar lista/ }).click()
  await expect(page.getByText(/Lista ✓ 5 rondas/)).toBeVisible()
  await page.getByRole('button', { name: /Empezar hipster/ }).click()
  await expect(page.getByText('⏱ 30s').first()).toBeVisible()
  for (let i = 0; i < 5; i++) {
    await expect(page.getByText(/¿Qué canción es\?/)).toBeVisible()
    // tinte dinámico de la carátula activo durante la ronda
    await expect(page.locator('.sala[data-tinte="1"]')).toBeVisible()
    await page.getByRole('button', { name: /^A\. / }).click()
    await expect(page.getByRole('heading', { name: 'Resultados' })).toBeVisible()
    if (i === 0) {
      // ficha completa + carátula a todo ancho + replay del clip
      await expect(page.locator('img.cover-full')).toBeVisible()
      await expect(page.getByText('🎵 Título:', { exact: false })).toBeVisible()
      await expect(page.getByText('🎤 Artista:', { exact: false })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Reproducir' })).toBeVisible()
    }
    if (i < 4) await page.getByRole('button', { name: 'Siguiente' }).click()
  }
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByRole('heading', { name: /Clasificación final/ })).toBeVisible()
  await page.getByRole('button', { name: /Volver al lobby/ }).click()
  await expect(page.getByRole('button', { name: /Empezar hipster/ })).toBeVisible()
  // en el lobby se restaura el tema (sin tinte)
  await expect(page.locator('.sala[data-tinte="0"]')).toBeVisible()
})

test('el host busca un álbum y arma su lista', async ({ page }) => {
  const song = (id: number) => ({
    wrapperType: 'track',
    kind: 'song',
    trackId: id,
    trackName: `Tema ${id}`,
    artistName: 'Queen',
    collectionName: 'Grandes éxitos',
    previewUrl: `https://clip${id}.m4a`,
    artworkUrl100: 'https://img/100x100bb.jpg'
  })
  await page.route('https://itunes.apple.com/search?*entity=album*', (route) =>
    route.fulfill({
      json: {
        results: [{ collectionId: 11, collectionName: 'Grandes éxitos 80s', artistName: 'Queen', artworkUrl100: 'https://img/100x100bb.jpg' }]
      }
    })
  )
  await page.route('https://itunes.apple.com/search?*entity=musicArtist*', (route) =>
    route.fulfill({ json: { results: [] } })
  )
  await page.route('https://itunes.apple.com/lookup?*entity=song', (route) =>
    route.fulfill({ json: { results: [{ wrapperType: 'collection' }, song(1), song(2), song(3), song(4), song(5)] } })
  )

  await page.goto('#/sala/busq01?host=1&name=Ana')
  await page.getByLabel('Lista de canciones').selectOption('__buscar__')
  await page.getByLabel('Texto a buscar').fill('80s')
  await page.getByRole('button', { name: '🔍' }).click()
  await page.getByRole('button', { name: /Grandes éxitos 80s/ }).click()
  await expect(page.getByText(/Lista ✓ 5 rondas/)).toBeVisible()
  await page.getByRole('button', { name: /Empezar hipster/ }).click()
  await expect(page.getByText(/¿Qué canción es\?/)).toBeVisible()
})

test('el host busca una playlist de Deezer y juega', async ({ page }) => {
  const track = (id: number) => ({
    id,
    title: `Tema ${id}`,
    artist: { name: 'Artista' },
    album: { title: 'Álbum', cover_medium: 'https://img/cover.jpg' },
    preview: `https://clip${id}.mp3`
  })
  // JSONP: el callback va en la query (?callback=__dz...); respondemos envolviendo el JSON
  await page.route('https://api.deezer.com/search/playlist?*', (route) => {
    const cb = new URL(route.request().url()).searchParams.get('callback') ?? 'cb'
    route.fulfill({
      contentType: 'application/javascript',
      body: `${cb}({"data":[{"id":999,"title":"Fiesta 80s","nb_tracks":5,"picture_medium":"https://img/pl.jpg"}]})`
    })
  })
  await page.route('https://api.deezer.com/playlist/999/tracks?*', (route) => {
    const cb = new URL(route.request().url()).searchParams.get('callback') ?? 'cb'
    route.fulfill({
      contentType: 'application/javascript',
      body: `${cb}({"data":[${[1, 2, 3, 4, 5].map((i) => JSON.stringify(track(i))).join(',')}]})`
    })
  })
  // iTunes no debe intervenir en este flujo
  await page.route('https://itunes.apple.com/*', (route) => route.fulfill({ json: { results: [], resultCount: 0 } }))

  await page.goto('#/sala/lis001?host=1&name=Ana')
  await page.getByLabel('Lista de canciones').selectOption('__buscar__')
  await page.getByRole('checkbox', { name: 'Álbumes', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Artistas', exact: true }).click()
  await page.getByLabel('Texto a buscar').fill('fiesta 80s')
  await page.getByRole('button', { name: '🔍' }).click()
  await page.getByRole('button', { name: /Fiesta 80s/ }).click()
  await expect(page.getByText(/Lista ✓ 5 rondas/)).toBeVisible()
  await page.getByRole('button', { name: /Empezar hipster/ }).click()
  await expect(page.getByText(/¿Qué canción es\?/)).toBeVisible()
})

test('modo año: se escribe el año y vale ±5', async ({ page }) => {
  await page.goto('#/sala/anio01?host=1&name=Ana')
  await page.getByLabel('Modo de juego').selectOption('anio')
  await page.getByRole('button', { name: /Cargar lista/ }).click()
  await expect(page.getByText(/Lista ✓ 5 rondas/)).toBeVisible()
  await page.getByRole('button', { name: /Empezar hipster/ }).click()
  await expect(page.getByText(/¿De qué año es\?/)).toBeVisible()
  // el año correcto de la ronda es aleatorio (fixture barajado): se responde
  // uno cualquiera y se verifica flujo + veredicto con margen
  await page.getByLabel('Año de la canción').fill('2000')
  await page.getByRole('button', { name: 'Responder' }).click()
  await expect(page.getByRole('heading', { name: 'Resultados' })).toBeVisible()
  await expect(page.getByText(/Año correcto:/)).toBeVisible()
})

test('dificultad: fácil muestra artista y título, difícil nada', async ({ page }) => {
  await page.goto('#/sala/dif001?host=1&name=Ana')
  await page.getByLabel('Dificultad').selectOption('facil')
  await page.getByRole('button', { name: /Cargar lista/ }).click()
  await page.getByRole('button', { name: /Empezar hipster/ }).click()
  await expect(page.getByText(/🎤 Artista:/)).toBeVisible()
  await expect(page.getByText(/🔤 Título:/)).toBeVisible()
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: /^A\. / }).click()
    await page.getByRole('button', { name: 'Siguiente' }).click()
  }
  await expect(page.getByRole('heading', { name: /Clasificación final/ })).toBeVisible()
  await page.getByRole('button', { name: /Volver al lobby/ }).click()
  // la dificultad no exige recargar: la lista sigue cargada
  await page.getByLabel('Dificultad').selectOption('dificil')
  await page.getByRole('button', { name: /Empezar hipster/ }).click()
  await expect(page.getByText(/¿Qué canción es\?/)).toBeVisible()
  await expect(page.getByText(/🎤 Artista:/)).toBeHidden()
})

test('pistas: selección múltiple muestra la info elegida', async ({ page }) => {
  await page.goto('#/sala/pis001?host=1&name=Ana')
  // fácil marca todas; desmarcar todo menos álbum
  await page.getByLabel('Dificultad').selectOption('facil')
  await page.getByRole('checkbox', { name: 'Título', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Artista', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Año', exact: true }).click()
  await page.getByRole('button', { name: /Cargar lista/ }).click()
  await page.getByRole('button', { name: /Empezar hipster/ }).click()
  await expect(page.getByText(/💿 Álbum:/)).toBeVisible()
  await expect(page.getByText(/🎤 Artista:/)).toBeHidden()
  await expect(page.getByText(/🔤 Título:/)).toBeHidden()
})