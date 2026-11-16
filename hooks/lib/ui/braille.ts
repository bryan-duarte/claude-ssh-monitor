const BRAILLE_BASE = 0x2800
const TERMINAL_DEFAULT_COLOR = 0x01000000

const SPACE = 0x20
const DOTS_PER_CELL_X = 2
const DOTS_PER_CELL_Y = 4
const WORDS_PER_CELL = 3
const BASE64_CHUNK_BYTES = 8192
const BRAILLE_BITS: readonly (readonly [number, number])[] = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
]

type Cell = { codePoint: number; fg: number; bg: number }

export class BrailleCanvas {
  readonly cells: Cell[]
  readonly dotColumns: number
  readonly dotRows: number

  constructor(
    readonly columns: number,
    readonly rows: number,
    background: number = TERMINAL_DEFAULT_COLOR,
  ) {
    this.cells = Array.from({ length: columns * rows }, () => ({ codePoint: SPACE, fg: TERMINAL_DEFAULT_COLOR, bg: background }))
    this.dotColumns = columns * DOTS_PER_CELL_X
    this.dotRows = rows * DOTS_PER_CELL_Y
  }

  cellAt(column: number, row: number): Cell | undefined {
    const isInside = column >= 0 && row >= 0 && column < this.columns && row < this.rows
    return isInside ? this.cells[row * this.columns + column] : undefined
  }

  isEmpty(column: number, row: number): boolean {
    return this.cellAt(column, row)?.codePoint === SPACE
  }

  dot(x: number, y: number, fg: number): void {
    const cell = this.cellAt(Math.floor(x / DOTS_PER_CELL_X), Math.floor(y / DOTS_PER_CELL_Y))
    const bit = BRAILLE_BITS[y % DOTS_PER_CELL_Y]?.[x % DOTS_PER_CELL_X]
    if (!cell || bit === undefined) return
    const isBraille = cell.codePoint >= BRAILLE_BASE && cell.codePoint < BRAILLE_BASE + 0x100
    cell.codePoint = (isBraille ? cell.codePoint : BRAILLE_BASE) | bit
    cell.fg = fg
  }

  line(x0: number, y0: number, x1: number, y1: number, fgAt: (y: number) => number): void {
    const isOnDotGrid = [x0, y0, x1, y1].every(Number.isInteger)
    if (!isOnDotGrid) return
    const deltaX = Math.abs(x1 - x0)
    const deltaY = -Math.abs(y1 - y0)
    const stepX = x0 < x1 ? 1 : -1
    const stepY = y0 < y1 ? 1 : -1
    let error = deltaX + deltaY
    let x = x0
    let y = y0
    for (;;) {
      this.dot(x, y, fgAt(y))
      if (x === x1 && y === y1) return
      const doubledError = 2 * error
      if (doubledError >= deltaY) {
        error += deltaY
        x += stepX
      }
      if (doubledError <= deltaX) {
        error += deltaX
        y += stepY
      }
    }
  }

  fillBelow(dotX: number, dotY: number, bg: number): void {
    const column = Math.floor(dotX / DOTS_PER_CELL_X)
    for (let row = Math.floor(dotY / DOTS_PER_CELL_Y) + 1; row < this.rows; row++) {
      const cell = this.cellAt(column, row)
      if (cell) cell.bg = bg
    }
  }

  glyph(column: number, row: number, character: string, fg: number): void {
    const cell = this.cellAt(column, row)
    const codePoint = character.codePointAt(0)
    if (!cell || codePoint === undefined) return
    cell.codePoint = codePoint
    cell.fg = fg
  }

  pack(): string {
    const words = new Uint32Array(this.cells.length * WORDS_PER_CELL)
    this.cells.forEach((cell, index) => {
      words.set([cell.codePoint, cell.fg, cell.bg], index * WORDS_PER_CELL)
    })
    const bytes = new Uint8Array(words.buffer)
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_BYTES) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_BYTES))
    }
    return btoa(binary)
  }
}
