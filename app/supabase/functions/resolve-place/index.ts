// resolve-place — owner-only Edge Function replacing the dev-server proxy.
// Accepts { url } (any Google Maps link, incl. maps.app.goo.gl short links —
// expanded server-side, which a browser cannot do cross-origin) and/or
// { query } (free-text name). Runs places:searchText with an NYC bias (or a
// tight circle around coordinates found in the link) and returns one match.
// Field mask is Essentials+Pro only — Enterprise fields are banned by spec.
// Deployed with --no-verify-jwt (new-style publishable keys aren't JWTs);
// auth is enforced here instead: the caller's token must resolve to the owner.
import { createClient } from 'npm:@supabase/supabase-js@2'

const OWNER_EMAIL = 'mizrahi.kobi@gmail.com'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.addressComponents',
].join(',')

const NYC_RECT = {
  rectangle: {
    low: { latitude: 40.4774, longitude: -74.2591 },
    high: { latitude: 40.9176, longitude: -73.7003 },
  },
}

interface AddressComponent {
  longText?: string
  shortText?: string
  types?: string[]
}

function componentOf(comps: AddressComponent[], type: string): string | null {
  return comps.find((c) => c.types?.includes(type))?.longText ?? null
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  )
  const { data: userData, error: userError } = await supa.auth.getUser(token)
  if (userError || userData.user?.email !== OWNER_EMAIL) {
    return json(401, { error: 'owner only' })
  }

  const key = Deno.env.get('GOOGLE_MAPS_API_KEY')
  if (!key) return json(500, { error: 'GOOGLE_MAPS_API_KEY secret not set' })

  let input: { url?: string; query?: string }
  try {
    input = await req.json()
  } catch {
    return json(400, { error: 'JSON body required' })
  }

  let name = (input.query ?? '').trim()
  let cid: string | null = null
  let expandedUrl: string | null = null
  let bias: unknown = NYC_RECT

  if (input.url?.trim()) {
    const followed = await fetch(input.url.trim(), { redirect: 'follow' })
    expandedUrl = followed.url
    const decoded = decodeURIComponent(expandedUrl)

    const ftid = decoded.match(/!1s0x[0-9a-f]+:(0x[0-9a-f]+)/)
    if (ftid) cid = BigInt(ftid[1]).toString()
    const cidParam = decoded.match(/[?&]cid=(\d+)/)
    if (!cid && cidParam) cid = cidParam[1]

    if (!name) {
      const placeSeg = decoded.match(/\/maps\/place\/([^/]+)\//)
      if (placeSeg) name = placeSeg[1].replace(/\+/g, ' ').trim()
    }

    const at = decoded.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
    if (at) {
      bias = {
        circle: {
          center: { latitude: Number(at[1]), longitude: Number(at[2]) },
          radius: 2000,
        },
      }
    }
  }

  if (!name) {
    return json(400, {
      error: 'no place name found in the link — paste the name as text instead',
    })
  }

  const apiRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: name,
      locationBias: bias,
      pageSize: 1,
      languageCode: 'en',
    }),
  })
  const payload = await apiRes.json()
  if (!apiRes.ok) {
    return json(502, { error: `Places API ${apiRes.status}: ${JSON.stringify(payload)}` })
  }

  const place = payload.places?.[0]
  if (!place) return json(200, { match: null })

  const comps: AddressComponent[] = place.addressComponents ?? []
  let borough = componentOf(comps, 'sublocality_level_1')
  if (borough === 'The Bronx') borough = 'Bronx'
  if (
    !borough &&
    componentOf(comps, 'locality') === 'New York' &&
    comps.find((c) => c.types?.includes('administrative_area_level_1'))?.shortText === 'NY'
  ) {
    borough = 'Manhattan'
  }

  return json(200, {
    match: {
      google_place_id: place.id,
      name: place.displayName?.text ?? null,
      address: place.formattedAddress ?? null,
      lat: place.location?.latitude ?? null,
      lng: place.location?.longitude ?? null,
      borough,
      neighborhood: componentOf(comps, 'neighborhood'),
      cid,
      expanded_url: expandedUrl,
    },
  })
})
