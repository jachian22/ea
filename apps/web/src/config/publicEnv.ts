export const publicEnv = {
  STRIPE_PUBLISHABLE_KEY: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,
  APP_URL: import.meta.env.VITE_APP_URL || 'http://localhost:3000',
  STRIPE_BASIC_PRICE_ID: import.meta.env.VITE_STRIPE_BASIC_PRICE_ID,
  STRIPE_PRO_PRICE_ID: import.meta.env.VITE_STRIPE_PRO_PRICE_ID,
  R2_ENDPOINT: import.meta.env.VITE_R2_ENDPOINT!,
  R2_BUCKET: import.meta.env.VITE_R2_BUCKET!,

  // Google OAuth for Gmail/Calendar integration
  GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID,
  GOOGLE_OAUTH_REDIRECT_URI: import.meta.env.VITE_GOOGLE_OAUTH_REDIRECT_URI,
};
