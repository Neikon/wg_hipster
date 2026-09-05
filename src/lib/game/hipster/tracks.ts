import type { HipsterTrack } from './types'

// Fixture de prueba: 5 canciones verificadas con previewUrl vivo de iTunes (2026-09-05).
// Sin fetch en la prueba: el host construye las rondas desde aquí.
export const TRACKS: readonly HipsterTrack[] = [
  {
    trackId: 1499378607,
    titulo: 'Blinding Lights',
    artista: 'The Weeknd',
    album: 'After Hours',
    anio: 2019,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/19/d6/60/19d660ff-e3a9-8377-15a3-ce4b28e89cac/mzaf_18422426156481158187.plus.aac.p.m4a',
    artworkUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/61/e7/3f/61e73f94-018d-5f50-50ec-8521952bc72e/20UM1IM11629.rgb.jpg/100x100bb.jpg'
  },
  {
    trackId: 1440768615,
    titulo: 'Bohemian Rhapsody',
    artista: 'Queen',
    album: 'Greatest Hits',
    anio: 1975,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/8f/11/52/8f1152a9-fd5f-0021-f546-b97579c22ec3/mzaf_3962258993076347789.plus.aac.p.m4a',
    artworkUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/4d/08/2a/4d082a9e-7898-1aa1-a02f-339810058d9e/14DMGIM05632.rgb.jpg/100x100bb.jpg'
  },
  {
    trackId: 1440855823,
    titulo: 'Waka Waka (This Time for Africa)',
    artista: 'Shakira',
    album: 'Listen Up! The Official 2010 FIFA World Cup Album',
    anio: 2010,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/98/88/e5/9888e55d-4daf-0e96-480b-a38259013586/mzaf_9048311608369053538.plus.aac.p.m4a',
    artworkUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/3e/3a/73/3e3a73da-e19e-b26c-ec19-9da6a5da93fa/mzi.ixhiugev.jpg/100x100bb.jpg'
  },
  {
    trackId: 1440806823,
    titulo: 'Get Lucky',
    artista: 'Daft Punk',
    album: 'Random Access Memories',
    anio: 2013,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/57/a5/85/57a585aa-f1bc-7619-881b-f8a04a5541d5/mzaf_6906185026678279401.plus.aac.p.m4a',
    artworkUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/e8/43/5f/e8435ffa-b6b9-b171-40ab-4ff3959ab661/886443919266.jpg/100x100bb.jpg'
  },
  {
    trackId: 1422648513,
    titulo: 'Dancing Queen',
    artista: 'ABBA',
    album: 'ABBA Gold: Greatest Hits',
    anio: 1976,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/ec/b1/63/ecb163bc-aff2-4dd2-d40b-c044f0b9fa4d/mzaf_4358783485405794088.plus.aac.p.m4a',
    artworkUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/61/e7/3f/61e73f94-018d-5f50-50ec-8521952bc72e/20UM1IM11629.rgb.jpg/100x100bb.jpg'
  }
]

export function label(t: HipsterTrack): string {
  return `${t.titulo} – ${t.artista}`
}

/** Pista del título: primera letra de cada palabra + guiones (p. ej. "B_______ L_____"). */
export function pistaTitulo(titulo: string): string {
  return titulo
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      const letras = [...w]
      const primera = letras[0] ?? ''
      const resto = letras
        .slice(1)
        .map((ch) => (/[\p{L}\p{N}]/u.test(ch) ? '_' : ch))
        .join('')
      return primera + resto
    })
    .join(' ')
}
