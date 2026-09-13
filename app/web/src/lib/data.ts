import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type {
  DefaultAction,
  ImportRow,
  KeepForm,
  List,
  Place,
  PlaceTag,
  Resolved,
  Tag,
} from './types'

const ROW_SELECT = 'id,source_file,row_num,title,note,url,cid::text,triage_status,place_id'
const PLACE_SELECT =
  'id,slug,name,status,in_nyc,cuisine,borough,neighborhood,rec_source,note_en,note_he,cid::text,gmaps_url,google_place_id,address,lat,lng'

// Supabase caps every request at 1,000 rows server-side regardless of the
// requested range, so all rows are fetched in pages until the count is met.
async function fetchAllImportRows(): Promise<ImportRow[]> {
  const PAGE = 1000
  const rows: ImportRow[] = []
  let total: number | null = null
  for (let from = 0; total === null || rows.length < total; from += PAGE) {
    const { data, error, count } = await supabase
      .from('import_rows')
      .select(ROW_SELECT, { count: 'exact' })
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    if (count === null) throw new Error('import_rows fetch returned no count')
    total = count
    const page = data as unknown as ImportRow[]
    if (page.length === 0 && rows.length < total) {
      throw new Error(`fetched ${rows.length} of ${total} import_rows — empty page at ${from}`)
    }
    rows.push(...page)
  }
  if (rows.length !== total) {
    throw new Error(`fetched ${rows.length} of ${total} import_rows`)
  }
  return rows
}

export async function fetchAll(): Promise<{
  rows: ImportRow[]
  lists: List[]
  places: Place[]
  tags: Tag[]
  placeTags: PlaceTag[]
}> {
  const [rows, listsRes, placesRes, tagsRes, placeTagsRes] = await Promise.all([
    fetchAllImportRows(),
    supabase.from('lists').select('*').order('name'),
    supabase.from('places').select(PLACE_SELECT),
    supabase.from('tags').select('*').order('label_en'),
    supabase.from('place_tags').select('place_id,tag_id', { count: 'exact' }),
  ])
  for (const res of [listsRes, placesRes, tagsRes, placeTagsRes]) {
    if (res.error) throw new Error(res.error.message)
  }
  const placeTags = placeTagsRes.data as PlaceTag[]
  if (placeTagsRes.count !== null && placeTags.length !== placeTagsRes.count) {
    throw new Error(`fetched ${placeTags.length} of ${placeTagsRes.count} place_tags`)
  }
  return {
    rows,
    lists: listsRes.data as List[],
    places: placesRes.data as unknown as Place[],
    tags: tagsRes.data as Tag[],
    placeTags,
  }
}

// Calls the resolve-place Edge Function, which holds the Google key and can
// expand maps.app.goo.gl short links server-side. Owner JWT enforced there.
export async function resolvePlace(input: {
  query?: string
  url?: string
}): Promise<Resolved | null> {
  const { data, error } = await supabase.functions.invoke('resolve-place', { body: input })
  if (error) {
    let detail = error.message
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null)
      if (body?.error) detail = body.error
    }
    throw new Error(detail)
  }
  return data.match as Resolved | null
}

// Slug keeps letters of any script (Hebrew labels are fine); a 23505 means the
// tag already exists under this slug — return it instead of failing.
export async function createTag(label: string): Promise<Tag> {
  const trimmed = label.trim()
  const slug = trimmed
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  if (!slug) throw new Error(`cannot derive a slug from '${label}'`)
  const { data, error } = await supabase
    .from('tags')
    .insert({ slug, label_en: trimmed })
    .select('*')
    .single()
  if (!error) return data as Tag
  if (error.code !== '23505') throw new Error(error.message)
  const { data: existing, error: exError } = await supabase
    .from('tags')
    .select('*')
    .eq('slug', slug)
    .single()
  if (exError) throw new Error(exError.message)
  return existing as Tag
}

async function addPlaceTags(placeId: string, tagIds: number[]): Promise<void> {
  if (tagIds.length === 0) return
  const { error } = await supabase
    .from('place_tags')
    .upsert(
      tagIds.map((tag_id) => ({ place_id: placeId, tag_id, source: 'owner' })),
      { onConflict: 'place_id,tag_id', ignoreDuplicates: true },
    )
  if (error) throw new Error(error.message)
}

export async function syncPlaceTags(
  placeId: string,
  nextIds: number[],
  prevIds: number[],
): Promise<void> {
  const next = new Set(nextIds)
  const removed = prevIds.filter((id) => !next.has(id))
  if (removed.length > 0) {
    const { error } = await supabase
      .from('place_tags')
      .delete()
      .eq('place_id', placeId)
      .in('tag_id', removed)
    if (error) throw new Error(error.message)
  }
  await addPlaceTags(placeId, nextIds)
}

export async function setDefaultAction(listId: number, action: DefaultAction): Promise<void> {
  const { error, data } = await supabase
    .from('lists')
    .update({ default_action: action })
    .eq('id', listId)
    .select('id')
  if (error) throw new Error(error.message)
  if (data.length !== 1) throw new Error(`default_action update touched ${data.length} rows`)
}

async function updateRows(
  ids: number[],
  patch: Partial<Pick<ImportRow, 'triage_status' | 'place_id'>>,
): Promise<ImportRow[]> {
  const { data, error } = await supabase
    .from('import_rows')
    .update(patch)
    .in('id', ids)
    .select(ROW_SELECT)
  if (error) throw new Error(error.message)
  const updated = data as unknown as ImportRow[]
  if (updated.length !== ids.length) {
    throw new Error(`update touched ${updated.length} of ${ids.length} rows`)
  }
  return updated
}

export async function dropRows(ids: number[]): Promise<ImportRow[]> {
  return updateRows(ids, { triage_status: 'dropped' })
}

export async function restoreRows(ids: number[]): Promise<ImportRow[]> {
  return updateRows(ids, { triage_status: 'pending', place_id: null })
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function emptyToNull(s: string): string | null {
  const t = s.trim()
  return t === '' ? null : t
}

async function linkLists(
  placeId: string,
  rows: ImportRow[],
  listIdBySourceFile: Map<string, number>,
): Promise<void> {
  const listIds = [...new Set(rows.map((r) => r.source_file))].map((sf) => {
    const id = listIdBySourceFile.get(sf)
    if (id === undefined) throw new Error(`no list for source_file '${sf}'`)
    return id
  })
  const { error } = await supabase
    .from('place_lists')
    .upsert(
      listIds.map((list_id) => ({ place_id: placeId, list_id })),
      { onConflict: 'place_id,list_id', ignoreDuplicates: true },
    )
  if (error) throw new Error(error.message)
}

// Keep a CID group: create the place, link its source lists, mark rows kept.
// If a place with this CID already exists (interrupted undo, re-import), the
// rows merge into it and its fields are left untouched.
// Slug collisions retry with a numeric suffix; any other error surfaces raw.
async function insertPlaceWithSlugRetry(
  payload: Record<string, unknown>,
  base: string,
): Promise<Place> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`
    const { data, error } = await supabase
      .from('places')
      .insert({ ...payload, slug })
      .select(PLACE_SELECT)
      .single()
    if (!error) return data as unknown as Place
    const slugCollision = error.code === '23505' && error.message.includes('places_slug_key')
    if (!slugCollision) throw new Error(error.message)
  }
  throw new Error(`no free slug for '${base}' after 5 attempts`)
}

// Quick-add: create a place directly from a resolved Google match (no import
// rows involved). CID comes from the pasted link when it had one.
export async function quickAddPlace(
  form: KeepForm,
  resolved: Resolved | null,
  cid: string | null,
): Promise<Place> {
  const base =
    slugify(form.name) || (cid ? `place-${cid}` : `place-${crypto.randomUUID().slice(0, 8)}`)
  const payload = {
    name: form.name.trim(),
    status: form.status,
    in_nyc: form.in_nyc,
    cuisine: emptyToNull(form.cuisine),
    borough: emptyToNull(form.borough),
    neighborhood: emptyToNull(form.neighborhood),
    rec_source: emptyToNull(form.rec_source),
    note_en: emptyToNull(form.note_en),
    note_he: emptyToNull(form.note_he),
    cid,
    gmaps_url: cid ? `https://maps.google.com/?cid=${cid}` : resolved?.expanded_url ?? null,
    ...resolvedPatch(resolved),
  }
  if (payload.name === '') throw new Error('name is required')
  const place = await insertPlaceWithSlugRetry(payload, base)
  await addPlaceTags(place.id, form.tagIds)
  return place
}

function resolvedPatch(resolved: Resolved | null | undefined) {
  if (!resolved) return {}
  return {
    google_place_id: resolved.google_place_id,
    address: resolved.address,
    lat: resolved.lat,
    lng: resolved.lng,
    refreshed_at: new Date().toISOString(),
  }
}

export async function keepGroup(
  rows: ImportRow[],
  form: KeepForm,
  listIdBySourceFile: Map<string, number>,
  resolved?: Resolved | null,
): Promise<{ place: Place; updatedRows: ImportRow[]; merged: boolean }> {
  const cid = rows[0].cid
  const base = slugify(form.name) || (cid ? `place-${cid}` : `place-row-${rows[0].id}`)
  const gmapsUrl = cid ? `https://maps.google.com/?cid=${cid}` : rows[0].url

  if (cid) {
    const { data: existing, error: exError } = await supabase
      .from('places')
      .select(PLACE_SELECT)
      .eq('cid', cid)
      .maybeSingle()
    if (exError) throw new Error(exError.message)
    if (existing) {
      const place = existing as unknown as Place
      await linkLists(place.id, rows, listIdBySourceFile)
      await addPlaceTags(place.id, form.tagIds)
      const updatedRows = await updateRows(
        rows.map((r) => r.id),
        { triage_status: 'kept', place_id: place.id },
      )
      return { place, updatedRows, merged: true }
    }
  }

  const payload = {
    name: form.name.trim(),
    status: form.status,
    in_nyc: form.in_nyc,
    cuisine: emptyToNull(form.cuisine),
    borough: emptyToNull(form.borough),
    neighborhood: emptyToNull(form.neighborhood),
    rec_source: emptyToNull(form.rec_source),
    note_en: emptyToNull(form.note_en),
    note_he: emptyToNull(form.note_he),
    cid,
    gmaps_url: gmapsUrl,
    ...resolvedPatch(resolved),
  }
  if (payload.name === '') throw new Error('name is required')

  const place = await insertPlaceWithSlugRetry(payload, base)

  await linkLists(place.id, rows, listIdBySourceFile)
  await addPlaceTags(place.id, form.tagIds)
  const updatedRows = await updateRows(
    rows.map((r) => r.id),
    { triage_status: 'kept', place_id: place.id },
  )
  return { place, updatedRows, merged: false }
}

export async function updatePlace(
  id: string,
  form: KeepForm,
  resolved?: Resolved | null,
): Promise<Place> {
  const patch = {
    ...resolvedPatch(resolved),
    name: form.name.trim(),
    status: form.status,
    in_nyc: form.in_nyc,
    cuisine: emptyToNull(form.cuisine),
    borough: emptyToNull(form.borough),
    neighborhood: emptyToNull(form.neighborhood),
    rec_source: emptyToNull(form.rec_source),
    note_en: emptyToNull(form.note_en),
    note_he: emptyToNull(form.note_he),
  }
  if (patch.name === '') throw new Error('name is required')
  const { data, error } = await supabase
    .from('places')
    .update(patch)
    .eq('id', id)
    .select(PLACE_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as Place
}

// Undo a keep: delete the place (place_lists cascades), reset rows to pending.
export async function undoKeep(placeId: string, rowIds: number[]): Promise<ImportRow[]> {
  const restored = await restoreRows(rowIds)
  const { error } = await supabase.from('places').delete().eq('id', placeId)
  if (error) throw new Error(error.message)
  return restored
}
