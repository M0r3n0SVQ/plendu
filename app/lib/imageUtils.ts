// Shared canvas helpers — used by anything that loads a photo (blob: or
// data: URL, both load the same way via <img>) and re-encodes it via canvas.

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'))
    img.src = url
  })
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen'))),
      'image/jpeg',
      quality
    )
  })
}

export type Exposure = 'oscura' | 'clara' | null

// Coarse average-luminance sample to flag photos that are clearly too dark
// or blown out before spending an API call on them. Draws the source canvas
// down to a tiny sample canvas first and reads *that* — getImageData on the
// full w×h canvas would allocate/copy the whole multi-MB pixel buffer just
// to average a few thousand of them, which the browser's own image scaling
// already does more cheaply (and more accurately: every source pixel
// contributes to the downsample, not just the ones a stride happens to land
// on). Deliberately skips blur detection: a simple sharpness heuristic (e.g.
// Laplacian variance) flags flat, low-texture garments — a plain black
// t-shirt — as "blurry" just as often as an actually blurry photo, which
// would be more annoying than useful.
export function estimateExposure(ctx: CanvasRenderingContext2D, w: number, h: number): Exposure {
  const SAMPLE = 40
  const sw = Math.max(1, Math.min(SAMPLE, w))
  const sh = Math.max(1, Math.min(SAMPLE, h))
  const sampleCanvas = document.createElement('canvas')
  sampleCanvas.width = sw
  sampleCanvas.height = sh
  const sampleCtx = sampleCanvas.getContext('2d')!
  sampleCtx.drawImage(ctx.canvas, 0, 0, sw, sh)
  const { data } = sampleCtx.getImageData(0, 0, sw, sh)
  let sum = 0
  const count = sw * sh
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }
  const avg = sum / count
  if (avg < 35)  return 'oscura'
  if (avg > 245) return 'clara'
  return null
}

interface CompressResult {
  base64: string
  exposure: Exposure
}

// Shared by compressImage and generateThumbnail below — both just scale an
// already-loaded image down to fit maxSize and draw it into a fresh canvas,
// only the target size/quality/output format differ per caller.
function scaledCanvas(img: HTMLImageElement, maxSize: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const scale = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight, 1)
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  return { canvas, ctx }
}

// ─── Image compression ────────────────────────────────────────────────────────
// Resize to max 1024px and encode as JPEG 0.82 before sending to the API.
// Reduces typical 3-5 MB photos to ~80-200 KB — 10-20× less data.
export function compressImage(file: File, maxDim = 1024, quality = 0.82): Promise<CompressResult> {
  return new Promise((resolve, reject) => {
    const tempUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(tempUrl)
      try {
        const { canvas, ctx } = scaledCanvas(img, maxDim)
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        const exposure = estimateExposure(ctx, canvas.width, canvas.height)
        // Release canvas memory
        canvas.width = 0
        canvas.height = 0
        resolve({ base64: dataUrl.split(',')[1], exposure }) // base64 part only
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(tempUrl)
      reject(new Error('Error al cargar la imagen'))
    }
    img.src = tempUrl
  })
}

// Generate a compact base64 thumbnail using canvas (survives page reloads).
// Doubles as the source photo for a historial-reopened ficha's "story image"
// share (buildStoryImage stretches it across a 1080-wide canvas), so 120px
// was too soft for that — 400px/0.75 stays well under
// sanitizeHistorialItem's 200KB-per-thumbnail cap (checked against a
// worst-case, maximally-noisy synthetic photo: ~82KB base64, vs. ~200KB
// allowed) while looking meaningfully sharper stretched to story size.
export function generateThumbnail(blobUrl: string, maxSize = 400): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const { canvas } = scaledCanvas(img, maxSize)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.75)
        canvas.width = 0
        canvas.height = 0
        resolve(dataUrl)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = blobUrl
  })
}

// Used to open the photo editor on the already-compressed image (~80-200KB,
// per compressImage's comment) rather than the original multi-MB upload —
// re-encoding a full-resolution original on every rotate/crop step risks
// coming back over the 5MB cap and having the edit silently rejected.
export function base64ToBlobUrl(base64: string, mime: string): string {
  const bytes = atob(base64)
  const buf = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i)
  return URL.createObjectURL(new Blob([buf], { type: mime }))
}

// Greedy word-wrap for canvas text — ctx must already have .font set.
// Truncates with an ellipsis if the text still overflows maxLines.
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (current && ctx.measureText(test).width > maxWidth) {
      lines.push(current)
      current = word
      if (lines.length === maxLines) break
    } else {
      current = test
    }
  }
  if (lines.length < maxLines && current) lines.push(current)

  const consumedChars = lines.join(' ').length
  if (lines.length === maxLines && consumedChars < text.length) {
    let last = lines[maxLines - 1]
    while (last.length > 0 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1).trimEnd()
    }
    lines[maxLines - 1] = `${last}…`
  }
  return lines
}

const STORY_W = 1080
const STORY_H = 1920

interface StoryImageOptions {
  photoUrl: string | null
  titulo: string
  precio: number
}

// Composites a 9:16 story-ready image (photo + título + precio) for sharing
// outside Vinted. Fixed dark/gold branding regardless of the app's own
// light/dark toggle — this is an exported artifact, not part of the UI.
export async function buildStoryImage({ photoUrl, titulo, precio }: StoryImageOptions): Promise<Blob> {
  await document.fonts.ready
  const canvas = document.createElement('canvas')
  canvas.width = STORY_W
  canvas.height = STORY_H
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#080808'
  ctx.fillRect(0, 0, STORY_W, STORY_H)

  if (photoUrl) {
    try {
      const img = await loadImage(photoUrl)
      const scale = Math.max(STORY_W / img.naturalWidth, STORY_H / img.naturalHeight)
      const dw = img.naturalWidth * scale
      const dh = img.naturalHeight * scale
      ctx.drawImage(img, (STORY_W - dw) / 2, (STORY_H - dh) / 2, dw, dh)
    } catch { /* keep the plain dark background if the photo fails to load */ }
  }

  const scrim = ctx.createLinearGradient(0, STORY_H * 0.55, 0, STORY_H)
  scrim.addColorStop(0, 'rgba(8,8,8,0)')
  scrim.addColorStop(1, 'rgba(8,8,8,0.94)')
  ctx.fillStyle = scrim
  ctx.fillRect(0, STORY_H * 0.55, STORY_W, STORY_H * 0.45)

  const displayFont = (getComputedStyle(document.documentElement).getPropertyValue('--font-display') || 'serif').trim()
  const monoFont = (getComputedStyle(document.documentElement).getPropertyValue('--font-mono') || 'monospace').trim()
  const TEXT = '#f2ede4'
  const ACCENT = '#b8965a'

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = TEXT
  ctx.font = `600 38px ${displayFont}`
  ctx.fillText('Plendu', 72, 1290)
  const markW = ctx.measureText('Plendu').width
  ctx.fillStyle = ACCENT
  ctx.beginPath()
  ctx.arc(72 + markW + 16, 1276, 6, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = TEXT
  ctx.font = `700 62px ${displayFont}`
  const lines = wrapText(ctx, titulo, STORY_W - 144, 3)
  let y = 1400
  for (const line of lines) {
    ctx.fillText(line, 72, y)
    y += 74
  }

  ctx.fillStyle = ACCENT
  ctx.font = `500 88px ${monoFont}`
  ctx.fillText(`${precio}€`, 72, y + 56)

  const blob = await canvasToBlob(canvas, 0.92)
  // Same cleanup as compressImage/generateThumbnail above — this canvas is
  // larger than either of theirs (1080x1920 vs a small thumbnail), so
  // leaving its backing buffer for the GC to reclaim on its own schedule
  // matters more here.
  canvas.width = 0
  canvas.height = 0
  return blob
}
