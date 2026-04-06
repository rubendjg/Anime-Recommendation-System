/** RGB strings for CSS custom properties driving hero backdrop gradients */

export type HeroPaletteCss = {
  glow: string
  mid: string
  deep: string
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      default:
        h = (r - g) / d + 4
    }
    h /= 6
  }
  return [h, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ]
}

function boostSaturation(r: number, g: number, b: number, factor: number): [number, number, number] {
  const [h, s, l] = rgbToHsl(r, g, b)
  return hslToRgb(h, Math.min(1, s * factor), l)
}

function rgba(r: number, g: number, b: number, a: number) {
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`
}

/**
 * Samples the poster (downscaled) and returns gradient stops biased toward saturated pixels.
 * Requires CORS-safe image URL (MAL CDN sends Access-Control-Allow-Origin: *).
 */
export function extractHeroPaletteFromImageUrl(
  imageUrl: string,
): Promise<HeroPaletteCss | null> {
  const url = typeof imageUrl === 'string' ? imageUrl.trim() : ''
  if (!url || url.startsWith('/')) return Promise.resolve(null)

  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => {
      try {
        const w = 56
        const h = 84
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          resolve(null)
          return
        }

        const sw = img.naturalWidth
        const sh = img.naturalHeight
        if (sw < 8 || sh < 8) {
          resolve(null)
          return
        }

        const scale = Math.max(w / sw, h / sh)
        const dw = sw * scale
        const dh = sh * scale
        const ox = (w - dw) / 2
        const oy = (h - dh) / 2
        ctx.drawImage(img, ox, oy, dw, dh)

        const { data } = ctx.getImageData(0, 0, w, h)
        let r = 0
        let g = 0
        let b = 0
        let wt = 0

        for (let i = 0; i + 2 < data.length; i += 16) {
          const R = data[i]
          const G = data[i + 1]
          const B = data[i + 2]
          const lum = (0.299 * R + 0.587 * G + 0.114 * B) / 255
          if (lum > 0.93 || lum < 0.05) continue
          const mx = Math.max(R, G, B)
          const mn = Math.min(R, G, B)
          const sat = mx === 0 ? 0 : (mx - mn) / mx
          const wgt = sat * sat + 0.12
          r += R * wgt
          g += G * wgt
          b += B * wgt
          wt += wgt
        }

        if (wt < 0.5) {
          resolve(null)
          return
        }

        r /= wt
        g /= wt
        b /= wt

        const [br, bg, bb] = boostSaturation(r, g, b, 1.48)
        const [h0, s0, l0] = rgbToHsl(br, bg, bb)

        const glowRgb = hslToRgb(h0, Math.min(1, s0 * 1.18), Math.min(0.56, l0 * 1.12 + 0.16))
        const deepRgb = hslToRgb(h0, Math.min(1, s0 * 1.08), Math.max(0.1, l0 * 0.38))

        resolve({
          glow: rgba(glowRgb[0], glowRgb[1], glowRgb[2], 0.72),
          mid: rgba(br, bg, bb, 0.55),
          deep: rgba(deepRgb[0], deepRgb[1], deepRgb[2], 0.72),
        })
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}
