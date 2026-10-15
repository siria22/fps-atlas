import type { Database } from './database.types.ts'

type Enums = Database['public']['Enums']

export type EvidenceLevel = Enums['evidence_level']
export type LocationPrecision = Enums['location_precision']
export type Era = Enums['era']
export type SubmissionStatus = Enums['submission_status']
