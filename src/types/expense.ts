export type PaymentMethod = 'cash' | 'credit' | 'debit' | string;

export interface Expense {
  id: string;
  tripId: string;
  userId: string;
  amount: number;
  currency: string;
  convertedAmount: number;
  exchangeRate: number;
  categoryId: string;
  note: string | null;
  paymentMethod: PaymentMethod | null;
  latitude: number | null;
  longitude: number | null;
  placeName: string | null;
  expenseDate: string;
  expenseTime: string;
  isRefund: boolean;
  isExcludedFromMetrics: boolean;
  spreadStartDate: string | null;
  spreadEndDate: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ExpensePhoto {
  id: string;
  expenseId: string;
  storagePath: string;
  localUri: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface ExpenseWithPhotos extends Expense {
  photos: ExpensePhoto[];
}
