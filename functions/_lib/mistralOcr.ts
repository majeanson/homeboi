import type { Env } from './env'

// Mistral OCR — an OPTIONAL, high-accuracy CLOUD reader for recipe photos. It's a
// real OCR service (not a generative model), markedly better than the on-device
// Tesseract read on the dense small glyphs recipes live on — decimal commas, vulgar
// fractions — including handwriting. Billed per page, pay-as-you-go (free
// "Experiment" tier for testing); off unless MISTRAL_API_KEY is set, so the
// on-device read (src/lib/ocr.ts) stays the free/private default. The image leaves
// the device, so the endpoint that calls this (recipe-ocr) also gates on the
// household AI switch.
//
// Returns the page MARKDOWN (faithful text), which then flows through the SAME
// structuring path (parsePastedRecipe / structureRecipe) as paste- and on-device
// reads — the engine is swappable, the rest of the pipeline is shared.
const ENDPOINT = 'https://api.mistral.ai/v1/ocr'
const MODEL = 'mistral-ocr-latest'
// Exported for the read report (the verify panel names the reader that was used).
export const MISTRAL_OCR_MODEL = MODEL

// btoa needs a binary string; build it in chunks so a multi-MB image doesn't blow
// the argument-count limit of String.fromCharCode(...).
function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

// Read a recipe photo with Mistral OCR → the joined page markdown. Returns '' on
// key-unset / any failure (network, non-200, bad shape) so the caller degrades to
// the on-device read — the same "never block the flow" posture as ocrImage.
export async function mistralOcr(env: Env, bytes: Uint8Array): Promise<string> {
  if (!env.MISTRAL_API_KEY || bytes.length === 0) return ''
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.MISTRAL_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        // The client resizes/encodes; we forward the bytes as a JPEG data URI.
        document: { type: 'image_url', image_url: `data:image/jpeg;base64,${toBase64(bytes)}` },
      }),
    })
    if (!res.ok) return ''
    const data = (await res.json()) as { pages?: { markdown?: unknown }[] }
    const pages = Array.isArray(data.pages) ? data.pages : []
    return pages
      .map((p) => (typeof p?.markdown === 'string' ? p.markdown : ''))
      .filter(Boolean)
      .join('\n\n')
      .trim()
  } catch {
    return ''
  }
}
