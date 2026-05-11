// Typed errors thrown by query mutations so the UI can recognize them and
// surface specific i18n-friendly copy. instanceof works across the local
// import graph; the UI layer catches and matches on these.

export class SettlementAttributedError extends Error {
  constructor(message = 'Expense has an attributed settlement; reverse it first') {
    super(message);
    this.name = 'SettlementAttributedError';
  }
}
