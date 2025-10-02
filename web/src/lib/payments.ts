import { loadStripe } from '@stripe/stripe-js';
import type { Stripe, StripeCardElement } from '@stripe/stripe-js';
import { STRIPE_PUBLISHABLE_KEY } from '../config';

// Initialize Stripe with the configured publishable key
// Add validation to prevent loading with invalid keys
let stripePromise: Promise<Stripe | null> | null = null;

if (STRIPE_PUBLISHABLE_KEY && STRIPE_PUBLISHABLE_KEY.startsWith('pk_')) {
  stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
} else {
  console.warn('Invalid Stripe publishable key:', STRIPE_PUBLISHABLE_KEY);
}

export function getStripePromise(): Promise<Stripe | null> | null {
  return stripePromise;
}

export interface PaymentResult {
  success: boolean;
  coins_added?: number;
  new_balance?: number;
  transaction_id?: string;
  error?: string;
}

export async function processPayment(packageId: string): Promise<PaymentResult> {
  try {
    // Create payment intent
    const intentResponse = await fetch('/api/payments/create-intent', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package_id: packageId })
    });

    if (!intentResponse.ok) {
      const errorData = await intentResponse.json().catch(() => ({}));
      return { success: false, error: errorData.error || `HTTP ${intentResponse.status}: Payment intent creation failed` };
    }

    const intentData = await intentResponse.json();
    const client_secret = intentData.client_secret;

    if (!client_secret) {
      return { success: false, error: 'No payment intent received from server' };
    }

    // For demo purposes, we'll simulate a successful payment
    // In production, you would use Stripe Elements to collect card details
    
    // Simulate payment processing delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Extract payment intent ID from client secret
    const payment_intent_id = client_secret.includes('_secret_') ? 
      client_secret.split('_secret_')[0] : client_secret;

    // Confirm the payment
    const confirmResponse = await fetch('/api/payments/confirm', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        payment_intent_id: payment_intent_id
      })
    });

    if (!confirmResponse.ok) {
      const errorData = await confirmResponse.json().catch(() => ({}));
      return { success: false, error: errorData.error || `HTTP ${confirmResponse.status}: Payment confirmation failed` };
    }

    const result = await confirmResponse.json();
    return {
      success: true,
      coins_added: result.coins_added,
      new_balance: result.new_balance,
      transaction_id: result.transaction_id
    };

  } catch (error) {
    console.error('Payment processing error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Payment processing failed' 
    };
  }
}

// Real Stripe Elements integration (for production)
export async function processRealPayment(packageId: string, cardElement: StripeCardElement): Promise<PaymentResult> {
  try {
    if (!stripePromise) {
      return { success: false, error: 'Stripe not initialized - invalid publishable key' };
    }
    
    const stripe = await stripePromise;
    if (!stripe) {
      return { success: false, error: 'Stripe failed to load' };
    }

    // Create payment intent
    const intentResponse = await fetch('/api/payments/create-intent', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package_id: packageId })
    });

    if (!intentResponse.ok) {
      const error = await intentResponse.json();
      return { success: false, error: error.error || 'Payment intent creation failed' };
    }

    const { client_secret } = await intentResponse.json();

    // Confirm payment with Stripe
    const { error, paymentIntent } = await stripe.confirmCardPayment(client_secret, {
      payment_method: {
        card: cardElement,
      }
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (paymentIntent?.status === 'succeeded') {
      // Confirm with our backend
      const confirmResponse = await fetch('/api/payments/confirm', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          payment_intent_id: paymentIntent.id 
        })
      });

      if (!confirmResponse.ok) {
        const error = await confirmResponse.json();
        return { success: false, error: error.error || 'Payment confirmation failed' };
      }

      const result = await confirmResponse.json();
      return {
        success: true,
        coins_added: result.coins_added,
        new_balance: result.new_balance,
        transaction_id: result.transaction_id
      };
    }

    return { success: false, error: 'Payment was not completed' };

  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Payment processing failed' 
    };
  }
}