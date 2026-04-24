const required = (key: string, value: string | undefined): string => {
  if (!value) {
    // Allow dev to run, but warn loudly — app screens that need it will fail noisily.
    console.warn(`[config] Missing env var: ${key}`);
    return '';
  }
  return value;
};

export const config = {
  supabase: {
    url: required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
    anonKey: required('EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  },
  googleMapsApiKey: required(
    'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY',
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
  ),
  exchangeRates: {
    baseUrl: 'https://api.exchangerate.host',
    cacheTtlHours: 24,
  },
} as const;
