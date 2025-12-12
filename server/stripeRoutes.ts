import type { Express, Request, Response } from 'express';
import { stripeService } from './stripeService';
import { stripeStorage } from './stripeStorage';
import { getUncachableStripeClient, getStripePublishableKey } from './stripeClient';
import { storage } from './storage';

export function registerStripeRoutes(app: Express) {
  app.get('/api/stripe/publishable-key', async (req: Request, res: Response) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error: any) {
      console.error('Error getting publishable key:', error);
      res.status(500).json({ error: 'Failed to get Stripe configuration' });
    }
  });

  app.get('/api/stripe/products', async (req: Request, res: Response) => {
    try {
      const products = await stripeStorage.listProducts();
      res.json({ data: products });
    } catch (error: any) {
      console.error('Error listing products:', error);
      res.status(500).json({ error: 'Failed to list products' });
    }
  });

  app.get('/api/stripe/products-with-prices', async (req: Request, res: Response) => {
    try {
      const rows = await stripeStorage.listProductsWithPrices();

      const productsMap = new Map();
      for (const row of rows as any[]) {
        if (!productsMap.has(row.product_id)) {
          productsMap.set(row.product_id, {
            id: row.product_id,
            name: row.product_name,
            description: row.product_description,
            active: row.product_active,
            metadata: row.product_metadata,
            prices: []
          });
        }
        if (row.price_id) {
          productsMap.get(row.product_id).prices.push({
            id: row.price_id,
            unit_amount: row.unit_amount,
            currency: row.currency,
            recurring: row.recurring,
            active: row.price_active,
            metadata: row.price_metadata,
          });
        }
      }

      res.json({ data: Array.from(productsMap.values()) });
    } catch (error: any) {
      console.error('Error listing products with prices:', error);
      res.status(500).json({ error: 'Failed to list products' });
    }
  });

  app.post('/api/stripe/create-checkout-session', async (req: Request, res: Response) => {
    try {
      const { priceId, orderId, successUrl, cancelUrl } = req.body;

      if (!priceId) {
        return res.status(400).json({ error: 'Price ID is required' });
      }

      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const stripe = await getUncachableStripeClient();

      let customerId: string | undefined;
      const dbUser = await storage.getUser(user.claims.sub);
      if (dbUser?.stripeCustomerId) {
        customerId = dbUser.stripeCustomerId;
      } else {
        const customer = await stripe.customers.create({
          email: user.claims.email,
          name: user.claims.name || user.claims.email,
          metadata: { userId: user.claims.sub },
        });
        customerId = customer.id;
        await storage.updateUser(user.claims.sub, { stripeCustomerId: customer.id });
      }

      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'payment',
        success_url: successUrl || `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl || `${baseUrl}/payment/cancel`,
        metadata: { orderId: orderId || '' },
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch (error: any) {
      console.error('Error creating checkout session:', error);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  app.post('/api/stripe/create-payment-intent', async (req: Request, res: Response) => {
    try {
      const { amount, currency = 'usd', orderId } = req.body;

      if (!amount) {
        return res.status(400).json({ error: 'Amount is required' });
      }

      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const stripe = await getUncachableStripeClient();

      let customerId: string | undefined;
      const dbUser = await storage.getUser(user.claims.sub);
      if (dbUser?.stripeCustomerId) {
        customerId = dbUser.stripeCustomerId;
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency,
        customer: customerId,
        metadata: { orderId: orderId || '', userId: user.claims.sub },
      });

      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error: any) {
      console.error('Error creating payment intent:', error);
      res.status(500).json({ error: 'Failed to create payment intent' });
    }
  });

  app.get('/api/stripe/checkout-session/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      res.json({ session });
    } catch (error: any) {
      console.error('Error retrieving session:', error);
      res.status(500).json({ error: 'Failed to retrieve session' });
    }
  });
}
