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

export interface Place {
  id: string
  slug: string
  name: string
  status: PlaceStatus
  in_nyc: boolean
  cuisine: string | null
  borough: string | null
  neighborhood: string | null
  rec_source: string | null
  note_en: string | null
  note_he: string | null
  cid: string | null
  gmaps_url: string | null
}

export interface Tag {
  id: number
  slug: string
  label_en: string
  label_he: string | null
}

export interface PlaceTag {
  place_id: string
  tag_id: number
}

export interface KeepForm {
  name: string
  status: PlaceStatus
  in_nyc: boolean
  tagIds: number[]
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
