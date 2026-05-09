export interface Category {
  id: string;
  name: string;
  emoji: string;
  color: string;
  sortOrder: number;
  tripId: string | null;
  createdBy: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

// Raw SQLite row shape for the category table.
export interface CategoryRow {
  id: string;
  name: string;
  emoji: string;
  color: string;
  sort_order: number;
  trip_id: string | null;
  created_by: string | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
}
