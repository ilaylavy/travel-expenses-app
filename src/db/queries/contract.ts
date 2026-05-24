// Cross-platform query contracts. Each interface here describes the public
// surface of one query module; the .native.ts and .web.ts implementations
// each end with `const _check: <Iface> = { fn1, fn2, ... };` so tsc catches
// signature drift between the two variants the moment it happens.

import type { Category, CreateCategoryInput, UpdateCategoryInput } from '@/types/category';
import type { ExchangeRate } from '@/types/exchangeRate';
import type {
  CreateExpenseInput,
  CreateSplitInput,
  Expense,
  ExpensePhoto,
  ExpenseSplit,
  ExpenseWithPhotos,
  RecentNoteSuggestion,
  UpdateExpenseInput,
} from '@/types/expense';
import type {
  DaySummary,
  JournalDay,
  JournalMoment,
  JournalPhotoEntryWithPhotos,
} from '@/types/journal';
import type { Profile, UpdateProfileInput } from '@/types/profile';
import type {
  CreateSettlementInput,
  SettlementPayment,
} from '@/types/settlement';
import type {
  CreateTripInput,
  PendingInvite,
  Trip,
  TripMember,
  TripWithStats,
  UpdateTripInput,
} from '@/types/trip';
import type { VoiceClip } from '@/types/voice';

// -----------------------------------------------------------------------------
// expenses
// -----------------------------------------------------------------------------
export interface ExpenseQueries {
  listExpensesForTrip: (tripId: string) => Promise<ExpenseWithPhotos[]>;
  getExpense: (id: string) => Promise<ExpenseWithPhotos | null>;
  createExpense: (input: CreateExpenseInput) => Promise<ExpenseWithPhotos>;
  updateExpense: (input: UpdateExpenseInput) => Promise<Expense>;
  softDeleteExpense: (id: string) => Promise<void>;
}

// -----------------------------------------------------------------------------
// expense_splits
// -----------------------------------------------------------------------------
export interface ExpenseSplitsQueries {
  getSplitsForExpense: (expenseId: string) => Promise<ExpenseSplit[]>;
  getSplitsForTrip: (tripId: string) => Promise<ExpenseSplit[]>;
  createSplits: (expenseId: string, splits: CreateSplitInput[]) => Promise<ExpenseSplit[]>;
  updateSplits: (expenseId: string, splits: CreateSplitInput[]) => Promise<ExpenseSplit[]>;
  deleteSplits: (expenseId: string) => Promise<void>;
}

// -----------------------------------------------------------------------------
// expense_photos — only the read side is shared across platforms. Native
// also exports insertPhoto/photoToPayload/rowToPhoto/setPhotoStoragePath/
// getPhotoById for the sync engine; those are not in the contract because
// the web variant has no SQLite to write to.
// -----------------------------------------------------------------------------
export interface ExpensePhotosQueries {
  listPhotosForExpense: (expenseId: string) => Promise<ExpensePhoto[]>;
  // Delete a single photo from a saved expense. Removes the row from the
  // local DB (native) / Postgres (web), enqueues / executes the R2 object
  // delete, and cleans up the on-device file copy when present.
  deletePhoto: (photo: ExpensePhoto) => Promise<void>;
}

// -----------------------------------------------------------------------------
// settlement_payments
// -----------------------------------------------------------------------------
export interface SettlementsQueries {
  listSettlementsForTrip: (tripId: string) => Promise<SettlementPayment[]>;
  listSettlementsForPair: (
    tripId: string,
    userA: string,
    userB: string,
  ) => Promise<SettlementPayment[]>;
  createSettlement: (input: CreateSettlementInput) => Promise<SettlementPayment>;
  deleteSettlement: (id: string) => Promise<void>;
}

// -----------------------------------------------------------------------------
// trips
// -----------------------------------------------------------------------------
export interface TripQueries {
  listTrips: (currentUserId?: string) => Promise<Trip[]>;
  listTripsWithStats: (currentUserId?: string) => Promise<TripWithStats[]>;
  getTrip: (id: string, currentUserId?: string) => Promise<Trip | null>;
  listTripMembers: (tripId: string) => Promise<TripMember[]>;
  createTrip: (input: CreateTripInput) => Promise<Trip>;
  updateTrip: (input: UpdateTripInput) => Promise<Trip>;
  updateMemberBudget: (tripId: string, userId: string, budget: number | null) => Promise<void>;
  softDeleteTrip: (id: string) => Promise<void>;
  setTripCoverPhoto: (tripId: string, storagePath: string | null) => Promise<void>;
}

// -----------------------------------------------------------------------------
// trip_members
// -----------------------------------------------------------------------------
export interface TripMembersQueries {
  getExistingMember: (tripId: string, userId: string) => Promise<TripMember | null>;
  inviteMember: (tripId: string, userId: string) => Promise<TripMember>;
  acceptInvite: (memberId: string) => Promise<TripMember>;
  removeMember: (memberId: string) => Promise<void>;
  declineInvite: (memberId: string) => Promise<void>;
  leaveTrip: (tripId: string, userId: string) => Promise<void>;
  listPendingInvitesForUser: (userId: string) => Promise<PendingInvite[]>;
}

// -----------------------------------------------------------------------------
// categories
// -----------------------------------------------------------------------------
export interface CategoryQueries {
  listAllCategories: () => Promise<Category[]>;
  listCategoriesForTrip: (tripId: string) => Promise<Category[]>;
  getCategory: (id: string) => Promise<Category | null>;
  createCategory: (input: CreateCategoryInput) => Promise<Category>;
  updateCategory: (input: UpdateCategoryInput) => Promise<Category>;
  reorderCategories: (orderedIds: string[]) => Promise<void>;
  deleteCategoryIfEmpty: (id: string) => Promise<boolean>;
  // Returns the number of seeded rows. On web there is no local DB to seed,
  // so the implementation just resolves to 0.
  seedDefaultCategoriesIfNeeded: () => Promise<number>;
}

// -----------------------------------------------------------------------------
// profiles
// -----------------------------------------------------------------------------
export interface ProfileQueries {
  getProfileName: (userId: string) => Promise<string | null>;
  getProfile: (userId: string) => Promise<Profile | null>;
  updateProfile: (input: UpdateProfileInput) => Promise<Profile>;
}

// -----------------------------------------------------------------------------
// exchange_rates — the dbOverride parameter on upsertRate is native-only
// (it lets the sync engine reuse a transactional handle). The contract uses
// the simpler signature; native overloads it locally without breaking the
// _check assignment.
// -----------------------------------------------------------------------------
export interface ExchangeRateQueries {
  getCachedRate: (base: string, target: string, date: string) => Promise<ExchangeRate | null>;
  getLatestRate: (base: string, target: string) => Promise<ExchangeRate | null>;
  upsertRate: (
    base: string,
    target: string,
    rate: number,
    date: string,
  ) => Promise<ExchangeRate>;
}

// -----------------------------------------------------------------------------
// expense analytics
// -----------------------------------------------------------------------------
export interface ExpenseAnalyticsQueries {
  getRecentNotes: (
    tripId: string,
    currentUserId: string,
    limit?: number,
  ) => Promise<RecentNoteSuggestion[]>;
  lastUsedPaymentMethodForTrip: (tripId: string) => Promise<string | null>;
  categoryUsageForTrip: (
    tripId: string,
  ) => Promise<Map<string, { count: number; lastUsed: string }>>;
}

// -----------------------------------------------------------------------------
// journal_photo_entries (+ children)
// -----------------------------------------------------------------------------
export interface JournalPhotoEntriesQueries {
  listEntriesForDay: (
    tripId: string,
    dayDateISO: string,
  ) => Promise<JournalPhotoEntryWithPhotos[]>;
  createEntry: (input: {
    tripId: string;
    userId: string;
    occurredAt: string;
    caption: string | null;
    isPrivate: boolean;
    photos: Array<{
      localUri: string;
      sortOrder: number;
      exifTakenAt: string | null;
    }>;
  }) => Promise<JournalPhotoEntryWithPhotos>;
  updateEntryCaption: (entryId: string, caption: string | null) => Promise<void>;
  updateEntryOccurredAt: (entryId: string, occurredAtISO: string) => Promise<void>;
  updateEntryPrivacy: (entryId: string, isPrivate: boolean) => Promise<void>;
  softDeleteEntry: (entryId: string) => Promise<void>;
  countPhotosForTripDay: (tripId: string, dayDateISO: string) => Promise<number>;
  firstPhotoStoragePathForDay: (
    tripId: string,
    dayDateISO: string,
  ) => Promise<string | null>;
  // Returns the storage_path of the first (lowest sort_order) journal_photo
  // for a given photo entry. Used to resolve the cover image when a day or
  // moment has an explicit coverPhotoEntryId set.
  storagePathForEntry: (entryId: string) => Promise<string | null>;
}

// -----------------------------------------------------------------------------
// voice_clips
// -----------------------------------------------------------------------------
export interface VoiceClipsQueries {
  listClipsForDay: (
    tripId: string,
    dayDateISO: string,
  ) => Promise<VoiceClip[]>;
  createClip: (input: {
    tripId: string;
    userId: string;
    occurredAt: string;
    localUri: string;
    durationSec: number;
    isPrivate: boolean;
  }) => Promise<VoiceClip>;
  updateClipTranscript: (clipId: string, transcript: string | null) => Promise<void>;
  updateClipOccurredAt: (clipId: string, occurredAtISO: string) => Promise<void>;
  updateClipPrivacy: (clipId: string, isPrivate: boolean) => Promise<void>;
  softDeleteClip: (clipId: string) => Promise<void>;
  countClipsForTripDay: (tripId: string, dayDateISO: string) => Promise<number>;
}

// -----------------------------------------------------------------------------
// journal_days (lazy per-day metadata)
// -----------------------------------------------------------------------------
export interface JournalDaysQueries {
  getDayMetadata: (tripId: string, dayDateISO: string) => Promise<JournalDay | null>;
  setLocation: (tripId: string, dayDateISO: string, location: string | null) => Promise<JournalDay>;
  setCoverPhotoEntry: (
    tripId: string,
    dayDateISO: string,
    entryId: string | null,
  ) => Promise<JournalDay>;
  // Aggregate read for the chapter (All-days) view.
  listDaySummaries: (tripId: string, currentUserId: string) => Promise<DaySummary[]>;
}

// -----------------------------------------------------------------------------
// journal_moments
// -----------------------------------------------------------------------------
export interface JournalMomentsQueries {
  listMomentsForDay(tripId: string, dayDate: string): Promise<JournalMoment[]>;
  createMoment(input: {
    tripId: string;
    dayDate: string;
    title: string | null;
    coverPhotoEntryId: string | null;
    createdBy: string;
    memberIds: Array<{ kind: 'photo' | 'voice' | 'expense'; id: string }>;
  }): Promise<JournalMoment>;
  updateMomentTitle(momentId: string, title: string | null): Promise<void>;
  updateMomentCover(momentId: string, coverPhotoEntryId: string | null): Promise<void>;
  addMember(momentId: string, kind: 'photo' | 'voice' | 'expense', entryId: string): Promise<void>;
  removeMember(kind: 'photo' | 'voice' | 'expense', entryId: string): Promise<void>;
  /** Remove every member from a Moment and soft-delete the Moment itself. */
  deleteMoment(momentId: string): Promise<void>;
  /** Split a Moment after a specific member — kept-members stay; later-members
   *  move into a new Moment titled `${originalTitle ?? 'Untitled'} (2)`. */
  splitMomentAfter(
    momentId: string,
    afterMember: { kind: 'photo' | 'voice' | 'expense'; id: string },
  ): Promise<JournalMoment>;
}
