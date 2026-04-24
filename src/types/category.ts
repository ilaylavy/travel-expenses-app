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
