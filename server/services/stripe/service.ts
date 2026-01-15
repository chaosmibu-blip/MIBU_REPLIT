import { stripeStorage } from './storage';
import { getUncachableStripeClient } from './client';

export class StripeService {
  async createCustomer(email: string, userId: string, name?: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.customers.create({
      email,
      name,
      metadata: { userId },
    });
  }

  async createCheckoutSession(
    customerId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
    metadata?: Record<string, string>
  ) {
    const stripe = await getUncachableStripeClient();
    return await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
    });
  }

  async createPaymentIntent(
    amount: number,
    currency: string,
    customerId?: string,
    metadata?: Record<string, string>
  ) {
    const stripe = await getUncachableStripeClient();
    return await stripe.paymentIntents.create({
      amount,
      currency,
      customer: customerId,
      metadata,
    });
  }

  async getProduct(productId: string) {
    return await stripeStorage.getProduct(productId);
  }

  async listProducts() {
    return await stripeStorage.listProducts();
  }

  async listProductsWithPrices() {
    return await stripeStorage.listProductsWithPrices();
  }

  async getSubscription(subscriptionId: string) {
    return await stripeStorage.getSubscription(subscriptionId);
  }
}

export const stripeService = new StripeService();
