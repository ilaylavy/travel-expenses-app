export interface ExchangeRate {
  id: string;
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  fetchedDate: string;
  createdAt: string;
}
