// Parse a fetched menu into structured wine rows using the Claude API.
// Reuses vinappen's pattern: Opus 4.7 + forced JSON output. No web search here —
// we only extract what's literally on the menu (prices must be the listed prices).
import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-opus-4-7'

const SYSTEM_PROMPT = `You extract a restaurant's wine list into structured data. \
You are given the text (or PDF/image) of a menu. Return ONLY the wines that have a \
price, exactly as listed. Do not invent wines, prices, producers, or vintages — if a \
field is not stated on the menu, leave it null. Do not include food, cocktails, beer, \
spirits, or non-alcoholic drinks.

Prices: parse to a number in the menu's currency (assume SEK for Swedish restaurants \
unless stated otherwise). A wine may have a by-the-glass price (price_glass) and/or a \
by-the-bottle price (price_bottle). Many lists show only bottle prices — that is fine. \
If a single price is shown and the section is clearly "glas"/"by the glass", treat it as \
price_glass; otherwise treat a lone price as price_bottle.

type must be one of: rött, vitt, mousserande, rosé, orange, dessert, annat.`

const FORMAT = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      wines: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Wine name exactly as listed' },
            producer: { type: ['string', 'null'] },
            vintage: { type: ['integer', 'null'], description: 'Year, or null for NV/not stated' },
            type: { type: ['string', 'null'], description: 'One of: rött, vitt, mousserande, rosé, orange, dessert, annat' },
            country: { type: ['string', 'null'] },
            region: { type: ['string', 'null'] },
            grape: { type: ['string', 'null'] },
            price_glass: { type: ['number', 'null'] },
            price_bottle: { type: ['number', 'null'] },
            currency: { type: 'string' },
          },
          required: ['name', 'producer', 'vintage', 'type', 'country', 'region', 'grape', 'price_glass', 'price_bottle', 'currency'],
          additionalProperties: false,
        },
      },
      notes: { type: 'string', description: 'Anything notable: e.g. "only bottle prices", "looks truncated", "no wine list found"' },
    },
    required: ['wines', 'notes'],
    additionalProperties: false,
  },
}

// menu = output of fetchMenu(): { kind: 'pdf', mediaType, base64 } | { kind: 'text', text }
export async function extractWines(menu, restaurantName) {
  const client = new Anthropic({ maxRetries: 2, timeout: 180000 })

  const content = []
  if (menu.kind === 'pdf') {
    // URL source: the API fetches the PDF, keeping our request body tiny.
    content.push({ type: 'document', source: { type: 'url', url: menu.url } })
    content.push({ type: 'text', text: `This is the wine list for "${restaurantName}". Extract every priced wine.` })
  } else {
    content.push({ type: 'text', text: `Wine list / menu text for "${restaurantName}". Extract every priced wine:\n\n${menu.text}` })
  }

  const params = {
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: FORMAT },
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
  }

  const response = await client.messages.create(params)
  if (response.stop_reason === 'refusal') throw new Error('extraction refused')
  const block = response.content.find((b) => b.type === 'text')
  if (!block) throw new Error('no text returned from model')
  try {
    return JSON.parse(block.text)
  } catch {
    throw new Error('model returned incomplete JSON (try lowering input size or raising max_tokens)')
  }
}
