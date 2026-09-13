import { supabase } from './supabase'
import type {
  DefaultAction,
  ImportRow,
  KeepForm,
  List,
  PlaceLite,
} from './types'

const ROW_SELECT = 'id,source_file,row_num,title,note,url,cid::text,triage_status,place_id'

export async function fetchAll(): Promise<{
  rows: ImportRow[]
  lists: List[]
  places: PlaceLite[]
}> {
  const [rowsRes, listsRes, placesRes] = await Promise.all([
    supabase
      .from('import_rows')
      .select(ROW_SELECT, { count: 'exact' })
      .order('id')
      .range(0, 1999),
    supabase.from('lists').select('*').order('name'),
    supabase.from('places').select('id,cid::text,name,cuisine,borough'),
  ])
  for (const res of [rowsRes, listsRes, placesRes]) {
    if (res.error) throw new Error(res.error.message)
  }
  const rows = rowsRes.data as unknown as ImportRow[]
  if (rowsRes.count !== null && rows.length !== rowsRes.count) {
    throw new Error(`fetched ${rows.length} of ${rowsRes.count} import_rows — pagination bug`)
  }
  return {
    rows,
    lists: listsRes.data as List[],
    places: placesRes.data as unknown as PlaceLite[],
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

// Keep a CID group: create the place, link its source lists, mark rows kept.
// Slug collisions retry with a numeric suffix; any other error surfaces raw.
export async function keepGroup(
  rows: ImportRow[],
  form: KeepForm,
  listIdBySourceFile: Map<string, number>,
): Promise<{ place: PlaceLite; updatedRows: ImportRow[] }> {
  const cid = rows[0].cid
  const base = slugify(form.name) || (cid ? `place-${cid}` : `place-row-${rows[0].id}`)
  const gmapsUrl = cid ? `https://maps.google.com/?cid=${cid}` : rows[0].url

  const payload = {
    name: form.name.trim(),
    status: form.status,
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

  let place: PlaceLite | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`
    const { data, error } = await supabase
      .from('places')
      .insert({ ...payload, slug })
      .select('id,cid::text,name,cuisine,borough')
      .single()
    if (!error) {
      place = data as unknown as PlaceLite
      break
    }
    const slugCollision = error.code === '23505' && error.message.includes('places_slug_key')
    if (!slugCollision) throw new Error(error.message)
  }
  if (!place) throw new Error(`no free slug for '${base}' after 5 attempts`)

  const listIds = [...new Set(rows.map((r) => r.source_file))].map((sf) => {
    const id = listIdBySourceFile.get(sf)
    if (id === undefined) throw new Error(`no list for source_file '${sf}'`)
    return id
  })
  const { error: plError } = await supabase
    .from('place_lists')
    .insert(listIds.map((list_id) => ({ place_id: place!.id, list_id })))
  if (plError) throw new Error(plError.message)

  const updatedRows = await updateRows(
    rows.map((r) => r.id),
    { triage_status: 'kept', place_id: place.id },
  )
  return { place, updatedRows }
}

// Undo a keep: delete the place (place_lists cascades), reset rows to pending.
export async function undoKeep(placeId: string, rowIds: number[]): Promise<ImportRow[]> {
  const restored = await restoreRows(rowIds)
  const { error } = await supabase.from('places').delete().eq('id', placeId)
  if (error) throw new Error(error.message)
  return restored
}
