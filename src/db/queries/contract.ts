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
