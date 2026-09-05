import type { TriviaCategoria } from './types'

export interface TriviaQuestion {
  q: string
  opciones: readonly [string, string, string, string]
  correcta: number
  categoria: Exclude<TriviaCategoria, 'todas'>
}

export const QUESTIONS: readonly TriviaQuestion[] = [
  { q: '¿Capital de España?', opciones: ['Barcelona','Madrid','Valencia','Sevilla'], correcta: 1, categoria: 'geografia' },
  { q: '¿Cuántos lados tiene un hexágono?', opciones: ['5','6','7','8'], correcta: 1, categoria: 'ciencia' },
  { q: '¿Elemento químico Au?', opciones: ['Plata','Oro','Aluminio','Argón'], correcta: 1, categoria: 'ciencia' },
  { q: '¿Año de la llegada a la Luna?', opciones: ['1967','1969','1971','1973'], correcta: 1, categoria: 'cultura' },
  { q: '¿Río más largo del mundo?', opciones: ['Nilo','Amazonas','Yangtsé','Misisipi'], correcta: 1, categoria: 'geografia' },
  { q: '¿Autor de Don Quijote?', opciones: ['Lope de Vega','Cervantes','Quevedo','Góngora'], correcta: 1, categoria: 'cultura' },
  { q: '¿Planeta más grande?', opciones: ['Tierra','Marte','Júpiter','Saturno'], correcta: 2, categoria: 'ciencia' },
  { q: '¿Idioma con más hablantes nativos?', opciones: ['Inglés','Mandarín','Español','Hindi'], correcta: 1, categoria: 'cultura' },
  { q: '¿Cuántos jugadores tiene un equipo de fútbol en el campo?', opciones: ['9','10','11','12'], correcta: 2, categoria: 'deportes' },
  { q: '¿Color de la mezcla azul + amarillo?', opciones: ['Verde','Naranja','Morado','Marrón'], correcta: 0, categoria: 'cultura' }
]

export const CATEGORIAS: ReadonlyArray<{ id: TriviaCategoria; nombre: string }> = [
  { id: 'todas', nombre: 'Todas' },
  { id: 'geografia', nombre: 'Geografía' },
  { id: 'ciencia', nombre: 'Ciencia' },
  { id: 'cultura', nombre: 'Cultura' },
  { id: 'deportes', nombre: 'Deportes' }
]

export function questionsFor(categoria: TriviaCategoria): readonly TriviaQuestion[] {
  return categoria === 'todas' ? QUESTIONS : QUESTIONS.filter(q => q.categoria === categoria)
}
