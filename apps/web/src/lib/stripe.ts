import Stripe from 'stripe';
import { privateEnv } from '~/config/privateEnv';

// Stripe is optional for personal use without subscriptions
export const stripe = privateEnv.STRIPE_SECRET_KEY
  ? new Stripe(privateEnv.STRIPE_SECRET_KEY, {
      apiVersion: '2025-12-15.clover',
    })
  : null;
