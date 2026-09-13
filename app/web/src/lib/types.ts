export type TriageStatus = 'pending' | 'kept' | 'dropped'
export type DefaultAction = 'keep' | 'drop' | 'review'
export type PlaceStatus = 'recommended' | 'want_to_try' | 'closed' | 'demoted'

// cid is numeric in Postgres but exceeds JS safe-integer range, so every
// query casts it to text (cid::text) and it stays a string end to end.
export interface ImportRow {
  id: number
  source_file: string
  row_num: number | null
  title: string | null
  note: string | null
  url: string | null
  cid: string | null
  triage_status: TriageStatus
  place_id: string | null
}

export interface List {
  id: number
  name: string
  description: string | null
  source_file: string
  default_action: DefaultAction
}

export interface PlaceLite {
  id: string
  cid: string | null
  name: string
  cuisine: string | null
  borough: string | null
}

export interface KeepForm {
  name: string
  status: PlaceStatus
  cuisine: string
  borough: string
  neighborhood: string
  rec_source: string
  note_en: string
  note_he: string
}

export type LastAction =
  | { type: 'keep'; rowIds: number[]; placeId: string; label: string }
  | { type: 'drop'; rowIds: number[]; label: string }
