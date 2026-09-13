import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import type { Plugin, Connect } from 'vite'
import react from '@vitejs/plugin-react'

const NYC_BOUNDS = {
  low: { latitude: 40.4774, longitude: -74.2591 },
  high: { latitude: 40.9176, longitude: -73.7003 },
}

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.addressComponents',
].join(',')

interface AddressComponent {
  longText?: string
  shortText?: string
  types?: string[]
}

function componentOf(comps: AddressComponent[], type: string): string | null {
  return comps.find((c) => c.types?.includes(type))?.longText ?? null
}

// Dev-only proxy so GOOGLE_MAPS_API_KEY never reaches the browser: the key is
// read from the repo-root .env at server start and the outbound Google call
// happens here. Field mask is Essentials+Pro only — never Enterprise.
function placesProxy(): Plugin {
  return {
    name: 'places-proxy',
    configureServer(server) {
      const env = loadEnv('development', path.resolve(__dirname, '../..'), '')
      const key = env.GOOGLE_MAPS_API_KEY

      const handler: Connect.NextHandleFunction = (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'POST only' }))
          return
        }
        if (!key) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'GOOGLE_MAPS_API_KEY missing from repo-root .env' }))
          return
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { query } = JSON.parse(body) as { query?: string }
            if (!query?.trim()) throw new Error('query is required')
            const apiRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': key,
                'X-Goog-FieldMask': FIELD_MASK,
              },
              body: JSON.stringify({
                textQuery: query.trim(),
                locationBias: { rectangle: NYC_BOUNDS },
                pageSize: 1,
                languageCode: 'en',
              }),
            })
            const payload = await apiRes.json()
            if (!apiRes.ok) {
              throw new Error(`Places API ${apiRes.status}: ${JSON.stringify(payload)}`)
            }
            const place = payload.places?.[0]
            if (!place) {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ match: null }))
              return
            }
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
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                match: {
                  google_place_id: place.id,
                  name: place.displayName?.text ?? null,
                  address: place.formattedAddress ?? null,
                  lat: place.location?.latitude ?? null,
                  lng: place.location?.longitude ?? null,
                  borough,
                  neighborhood: componentOf(comps, 'neighborhood'),
                },
              }),
            )
          } catch (e) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: (e as Error).message }))
          }
        })
      }

      server.middlewares.use('/api/resolve-place', handler)
    },
  }
}

export default defineConfig({
  plugins: [react(), placesProxy()],
})
