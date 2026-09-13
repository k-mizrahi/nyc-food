import { supabase } from './supabase'
import type {
  DefaultAction,
  ImportRow,
  KeepForm,
  List,
  Place,
} from './types'

const ROW_SELECT = 'id,source_file,row_num,title,note,url,cid::text,triage_status,place_id'
const PLACE_SELECT =
  'id,slug,name,status,in_nyc,cuisine,borough,neighborhood,rec_source,note_en,note_he,cid::text,gmaps_url'

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
}> {
  const [rows, listsRes, placesRes] = await Promise.all([
    fetchAllImportRows(),
    supabase.from('lists').select('*').order('name'),
    supabase.from('places').select(PLACE_SELECT),
  ])
  for (const res of [listsRes, placesRes]) {
    if (res.error) throw new Error(res.error.message)
  }
  return {
    rows,
    lists: listsRes.data as List[],
    places: placesRes.data as unknown as Place[],
  }
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
export async function keepGroup(
  rows: ImportRow[],
  form: KeepForm,
  listIdBySourceFile: Map<string, number>,
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
  }
  if (payload.name === '') throw new Error('name is required')

  let place: Place | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`
    const { data, error } = await supabase
      .from('places')
      .insert({ ...payload, slug })
      .select(PLACE_SELECT)
      .single()
    if (!error) {
      place = data as unknown as Place
      break
    }
    const slugCollision = error.code === '23505' && error.message.includes('places_slug_key')
    if (!slugCollision) throw new Error(error.message)
  }
  if (!place) throw new Error(`no free slug for '${base}' after 5 attempts`)

  await linkLists(place.id, rows, listIdBySourceFile)
  const updatedRows = await updateRows(
    rows.map((r) => r.id),
    { triage_status: 'kept', place_id: place.id },
  )
  return { place, updatedRows, merged: false }
}

export async function updatePlace(id: string, form: KeepForm): Promise<Place> {
  const patch = {
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
