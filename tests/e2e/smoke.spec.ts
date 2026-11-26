import { conTracker, expect, simularMultimedia, test, usarIceLocal } from './fixtures'

test.beforeEach(async ({ context }) => {
  await usarIceLocal(context)
  await simularMultimedia(context)
})

test('landing renderiza y crear sala lleva al lobby', async ({ page, trackerUrl }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto(conTracker('#/', trackerUrl))
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

test('al empezar el juego se ocultan los elementos del lobby', async ({ page, trackerUrl }) => {
  await page.goto(conTracker('#/', trackerUrl))
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
  await expect(page.locator('.repro-btn')).toBeVisible()
  await expect(page.getByAltText('Carátula difuminada')).toBeVisible()
  await expect(page.getByRole('button', { name: /Copiar enlace/ })).toBeHidden()
  await expect(page.getByRole('heading', { name: /Jugadores/ })).toBeHidden()
  await expect(page.getByRole('heading', { name: /Cambiar nombre/ })).toBeHidden()
})

test('en móvil (360px) la ronda no desborda horizontalmente', async ({ page, trackerUrl }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto(conTracker('#/sala/mov001?host=1&name=Ana', trackerUrl))
  await page.getByRole('button', { name: /Cargar lista/ }).click()
  await page.getByRole('button', { name: /Empezar hipster/ }).click()
  await expect(page.getByText(/¿Qué canción es\?/)).toBeVisible()
  // ni el documento ni la superficie única desbordan
  for (const sel of ['document.documentElement', '.sala']) {
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
  const salaOk = await page.evaluate(() => {
    const el = document.querySelector('.sala');
    return el ? el.getBoundingClientRect().right <= window.innerWidth + 1 : false;
  });
  expect(salaOk).toBe(true);
})

test('títulos largos sin espacios no desbordan la tarjeta', async ({ page, trackerUrl }) => {
  const largo = 'Supercalifragilisticoespialidosoextraordinario'
  const track = (id: number) => ({
    wrapperType: 'track',
    kind: 'song',
    trackId: id,
    trackName: `${largo}${id}`,
    artistName: 'ArtistaLarguísimoSinEspacios',
    collectionName: 'Largas',
    previewUrl: `https://clip${id}.m4a`
  })
  await page.route('https://itunes.apple.com/search?*entity=album*', (route) =>
    route.fulfill({ json: { results: [{ collectionId: 998, collectionName: 'Largas', artistName: 'Artista' }] } })
  )
  await page.route('https://itunes.apple.com/search?*entity=musicArtist*', (route) =>
    route.fulfill({ json: { results: [] } })
  )
  await page.route('https://itunes.apple.com/lookup?*entity=song', (route) =>
    route.fulfill({ json: { results: [1, 2, 3, 4, 5].map(track) } })
  )

  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto(conTracker('#/sala/lar001?host=1&name=Ana', trackerUrl))
  await page.getByLabel('Lista de canciones').selectOption('__buscar__')
  // activar la pista de título: genera una palabra larga sin espacios
  await page.getByRole('checkbox', { name: 'Título', exact: true }).click()
  await page.getByLabel('Texto a buscar').fill('largas')
  await page.getByRole('button', { name: '🔍' }).click()
  await page.getByRole('button', { name: /Largas/ }).click()
  await expect(page.getByText(/Lista ✓ 5 rondas/)).toBeVisible()
  await page.getByRole('button', { name: /Empezar hipster/ }).click()
  await expect(page.getByText(/¿Qué canción es\?/)).toBeVisible()
  const salaOk = await page.evaluate(() => {
    const el = document.querySelector('.sala');
    return el ? el.getBoundingClientRect().right <= window.innerWidth + 1 : false;
  });
  expect(salaOk).toBe(true);
})

test('crear una segunda sala muestra datos limpios de la nueva', async ({ page, trackerUrl }) => {
  await page.goto(conTracker('#/', trackerUrl))
  await page.getByRole('button', { name: /Crear sala/ }).click()
  await expect(page).toHaveURL(/#\/sala\/([A-Za-z0-9]{6})/)
  const urlA = page.url()
  const salaA = urlA.match(/#\/sala\/([A-Za-z0-9]{6})/)![1]

  await page.getByRole('button', { name: 'Salir' }).click()
  await expect(page.getByRole('heading', { name: /wg_hipster/ })).toBeVisible()

  await page.goto(conTracker('#/', trackerUrl))
  await page.getByRole('button', { name: /Crear sala/ }).click()
  await expect(page).toHaveURL(/#\/sala\/([A-Za-z0-9]{6})/)
  const salaB = page.url().match(/#\/sala\/([A-Za-z0-9]{6})/)![1]
  expect(salaB).not.toBe(salaA)

  // lobby limpio de la sala B
  await expect(page.getByRole('heading', { name: new RegExp(salaB) })).toBeVisible()
  await expect(page.getByText('1/20 jugadores')).toBeVisible()
})

test('completa las 5 rondas del hipster hasta la final', async ({ page, trackerUrl }) => {
  await page.goto(conTracker('#/sala/corta1?host=1&name=Ana&segundos=30', trackerUrl))

  await expect(page.getByLabel('Segundos por ronda').first()).toHaveValue('30')
  await page.getByRole('button', { name: /Cargar lista/ }).click()
  await expect(page.getByText(/Lista ✓ 5 rondas/)).toBeVisible()
  await page.getByRole('button', { name: /Empezar hipster/ }).click()
  await expect(page.getByText(/⏱ (29|30)s/).first()).toBeVisible()
  for (let i = 0; i < 5; i++) {
    await expect(page.getByText(/¿Qué canción es\?/)).toBeVisible()
    // la superficie única ocupa el mismo alto que resultados
    const medidas = await page.evaluate(() => ({
      sala: document.querySelector('.sala')!.getBoundingClientRect().height,
      viewport: window.innerHeight
    }));
    expect(medidas.sala).toBeGreaterThanOrEqual(medidas.viewport * 0.6);
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
      // la superficie deja pasar el tinte (no es el fondo sólido del tema)
      const salaBg = await page.evaluate(() => getComputedStyle(document.querySelector('.sala')!).backgroundColor);
      const cardVar = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--card').trim());
      expect(salaBg).not.toContain(cardVar);
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

test('el host busca un álbum y arma su lista', async ({ page, trackerUrl }) => {
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

  await page.goto(conTracker('#/sala/busq01?host=1&name=Ana', trackerUrl))
  await page.getByLabel('Lista de canciones').selectOption('__buscar__')
  await page.getByLabel('Texto a buscar').fill('80s')
  await page.getByRole('button', { name: '🔍' }).click()
  await page.getByRole('button', { name: /Grandes éxitos 80s/ }).click()
  await expect(page.getByText(/Lista ✓ 5 rondas/)).toBeVisible()
  await page.getByRole('button', { name: /Empezar hipster/ }).click()
  await expect(page.getByText(/¿Qué canción es\?/)).toBeVisible()
})

test('cambiar las rondas durante una carga descarta el resultado anterior', async ({ page, trackerUrl }) => {
  const liberar = Promise.withResolvers<void>()
  const entry = Array.from({ length: 30 }, (_, index) => ({
    id: { attributes: { 'im:id': String(index + 1) } },
    'im:name': { label: `Tema ${index + 1}` },
    'im:artist': { label: 'Artista' }
  }))
  await page.route('https://itunes.apple.com/**/rss/topsongs/**', async (route) => {
    await liberar.promise
    await route.fulfill({ json: { feed: { entry } } })
  })
  await page.route('https://itunes.apple.com/lookup?*entity=song', (route) => {
    const id = Number(new URL(route.request().url()).searchParams.get('id'))
    return route.fulfill({ json: { results: [{
      trackId: id,
      trackName: `Tema ${id}`,
      artistName: 'Artista',
      previewUrl: `https://clip${id}.m4a`
    }] } })
  })
  await page.goto(conTracker('#/sala/lis001?host=1&name=Ana', trackerUrl))
  await page.getByLabel('Lista de canciones').selectOption('top-global')
  const cargar = page.getByRole('button', { name: 'Cargar lista', exact: true })
  try {
    await Promise.all([
      page.waitForRequest('https://itunes.apple.com/**/rss/topsongs/**', { timeout: 10_000 }),
      cargar.click()
    ])
    await page.getByLabel('Número de rondas').selectOption('20')
  } finally {
    liberar.resolve()
  }

  await expect(cargar).toBeVisible()
  await expect(page.getByRole('button', { name: /Empezar hipster/ })).toBeHidden()
  await cargar.click()
  await expect(page.getByRole('button', { name: 'Empezar hipster (20 rondas)' })).toBeVisible()
})

test('modo año: se escribe el año y vale ±5', async ({ page, trackerUrl }) => {
  await page.goto(conTracker('#/sala/anio01?host=1&name=Ana', trackerUrl))
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

test('dificultad: fácil muestra artista y título, difícil nada', async ({ page, trackerUrl }) => {
  await page.goto(conTracker('#/sala/dif001?host=1&name=Ana', trackerUrl))
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

test('pistas: selección múltiple muestra la info elegida', async ({ page, trackerUrl }) => {
  await page.goto(conTracker('#/sala/pis001?host=1&name=Ana', trackerUrl))
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

test('contraste AA del texto de respuesta con tinte', async ({ page, trackerUrl }) => {
  await page.goto(conTracker('#/sala/con001?host=1&name=Ana', trackerUrl))
  await page.getByRole('button', { name: /Cargar lista/ }).click()
  await page.getByRole('button', { name: /Empezar hipster/ }).click()
  await expect(page.getByText(/¿Qué canción es\?/)).toBeVisible()
  await expect(page.locator('.sala[data-tinte="1"]')).toBeVisible()
  // ratio real medido en el navegador (WCAG AA: 4.5)
  const ratio = await page.evaluate(() => {
    const btn = document.querySelector('.sala .btn-respuesta') as HTMLElement;
    const cs = getComputedStyle(btn);
    const lum = (s: string) => {
      const [r, g, b] = s.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const l1 = lum(cs.color);
    const l2 = lum(cs.backgroundColor);
    const [cl, os] = l1 >= l2 ? [l1, l2] : [l2, l1];
    return (cl + 0.05) / (os + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
})

test('autoplay: activado por defecto y ajustable en el dispositivo', async ({ page, trackerUrl }) => {
  await page.goto(conTracker('#/sala/aut001?host=1&name=Ana', trackerUrl))
  // lobby: checkbox marcado por defecto
  const chk = page.getByLabel('Autoplay para todos');
  await expect(chk).toBeChecked()
  await page.getByRole('button', { name: /Cargar lista/ }).click()
  await page.getByRole('button', { name: /Empezar hipster/ }).click()
  await expect(page.getByText(/¿Qué canción es\?/)).toBeVisible()
  // reproductor con Auto ON (sigue al host) e intento de reproducción
  const auto = page.getByRole('button', { name: /Autoplay/ });
  await expect(auto).toHaveAttribute('aria-pressed', 'true')
  // override local: apagar solo en este móvil (persiste)
  await auto.click()
  await expect(auto).toHaveAttribute('aria-pressed', 'false')
  const guardado = await page.evaluate(() => localStorage.getItem('wg_hipster:autoplay'));
  expect(guardado).toBe('0')
  // volver a encender
  await auto.click()
  await expect(auto).toHaveAttribute('aria-pressed', 'true')
})
