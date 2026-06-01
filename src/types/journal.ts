// Trip Journal entity + row types.
// Row types mirror the local SQLite shape (booleans as 0/1, timestamps as
// ISO-8601 strings). Entity types are the camelCase domain shape used by
// React components and stores.

export interface JournalPhotoEntryRow {
  id: string;
  trip_id: string;
  user_id: string;
  occurred_at: string;          // ISO-8601 with timezone
  caption: string | null;
  is_private: number;           // 0 or 1
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  moment_id: string | null;
}

export interface JournalPhotoEntry {
  id: string;
  tripId: string;
  userId: string;
  occurredAt: string;
  caption: string | null;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  momentId: string | null;
}

export interface JournalPhotoRow {
  id: string;
  entry_id: string;
  storage_path: string;
  local_uri: string | null;
  sort_order: number;
  exif_taken_at: string | null;
  created_at: string;
}

export interface JournalPhoto {
  id: string;
  entryId: string;
  storagePath: string;
  localUri: string | null;
  sortOrder: number;
  exifTakenAt: string | null;
  createdAt: string;
}

// Photo entry with its file children attached — what the UI actually
// renders in the timeline.
export interface JournalPhotoEntryWithPhotos extends JournalPhotoEntry {
  photos: JournalPhoto[];
}

export interface JournalDayRow {
  id: string;
  trip_id: string;
  day_date: string;                            // YYYY-MM-DD
  location: string | null;
  cover_photo_entry_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface JournalDay {
  id: string;
  tripId: string;
  dayDate: string;
  location: string | null;
  coverPhotoEntryId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// Aggregate row for the chapter (All-days) view. Computed across multiple
// tables — see queries/journalDays.
export interface DaySummary {
  dayDate: string;
  dayIndex: number;                  // 1-based day-in-trip
  photoCount: number;
  voiceCount: number;
  expenseCount: number;
  totalConvertedAmount: number;      // in trip.home_currency
  coverStoragePath: string | null;
  effectiveLocation: string | null;
  momentTitles: string[];            // up to 3 titles for the All Days chip strip
  momentCount: number;
}

export interface JournalMomentRow {
  id: string;
  trip_id: string;
  day_date: string;                            // YYYY-MM-DD
  title: string | null;
  cover_photo_entry_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface JournalMoment {
  id: string;
  tripId: string;
  dayDate: string;
  title: string | null;
  coverPhotoEntryId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// Moment with member metadata attached — what the UI renders. Members
// reference timeline items by their kind+id pair so the consumer can fetch
// full bodies from the per-day query results.
export interface JournalMomentWithMemberIds extends JournalMoment {
  memberIds: Array<{ kind: 'photo' | 'voice' | 'expense'; id: string }>;
}
