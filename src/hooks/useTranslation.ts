// Project-wide translation hook. Wraps react-i18next so every screen imports
// from a single path and we can layer app-specific behavior later
// (e.g. namespaces, type-safe keys).
export { useTranslation } from 'react-i18next';
