# URGENT: Add These Environment Variables to Vercel

The API keys are not working because Vercel only exposes environment variables to the client if they have the `VITE_` prefix.

## Add these to your Vercel Dashboard NOW:

```
VITE_OPENAI_API_KEY=[copy value from OPEN_AI_API]
VITE_MISTRAL_API_KEY=[copy value from MISTRAL]
VITE_PERPLEXITY=[copy value from PERPLEXITY]
VITE_DEEPGRAM_API_KEY=d07d3f107acd0c8e6b9faf97ed1ff8295b900119
```

## Why this is needed:

1. Vercel keeps regular env vars on the server only (for security)
2. To expose them to the browser/client, they need `VITE_` prefix
3. Without this, the browser JavaScript can't access the API keys

## Steps:

1. Go to your Vercel project settings
2. Go to Environment Variables
3. Add each of the above variables
4. Copy the values from your existing variables:
   - Copy from `OPEN_AI_API` → paste to `VITE_OPENAI_API_KEY`
   - Copy from `MISTRAL` → paste to `VITE_MISTRAL_API_KEY`
   - Copy from `PERPLEXITY` → paste to `VITE_PERPLEXITY`
   - Add the Deepgram key as shown
5. Redeploy

This will fix the "API key not found" errors immediately.