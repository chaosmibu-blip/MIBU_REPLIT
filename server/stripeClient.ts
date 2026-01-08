import Stripe from 'stripe';

let connectionSettings: any;
let stripeAvailable = false;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken || !hostname) {
    console.log('[Stripe] Connector token or hostname not available, Stripe disabled');
    return null;
  }

  const connectorName = 'stripe';
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';

  try {
    const url = new URL(`https://${hostname}/api/v2/connection`);
    url.searchParams.set('include_secrets', 'true');
    url.searchParams.set('connector_names', connectorName);
    url.searchParams.set('environment', targetEnvironment);

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    });

    const data = await response.json();
    
    connectionSettings = data.items?.[0];

    if (!connectionSettings || (!connectionSettings.settings.publishable || !connectionSettings.settings.secret)) {
      console.log(`[Stripe] ${targetEnvironment} connection not configured, Stripe disabled`);
      return null;
    }

    stripeAvailable = true;
    return {
      publishableKey: connectionSettings.settings.publishable,
      secretKey: connectionSettings.settings.secret,
    };
  } catch (error) {
    console.log('[Stripe] Failed to get credentials, Stripe disabled:', error);
    return null;
  }
}

export function isStripeAvailable() {
  return stripeAvailable;
}

export async function checkStripeAvailability() {
  const creds = await getCredentials();
  return creds !== null;
}

export async function getUncachableStripeClient() {
  const creds = await getCredentials();
  if (!creds) {
    return null;
  }

  return new Stripe(creds.secretKey, {
    apiVersion: '2025-11-17.clover',
  });
}

export async function getStripePublishableKey() {
  const creds = await getCredentials();
  return creds?.publishableKey || null;
}

export async function getStripeSecretKey() {
  const creds = await getCredentials();
  return creds?.secretKey || null;
}

let stripeSync: any = null;

export async function getStripeSync() {
  if (!stripeSync) {
    const secretKey = await getStripeSecretKey();
    if (!secretKey) {
      return null;
    }
    
    const { StripeSync } = await import('stripe-replit-sync');

    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
        ssl: {
          rejectUnauthorized: false,
        },
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}
