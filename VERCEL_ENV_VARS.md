# Vercel Environment Variables

These are the environment variables used in your Vercel deployment:

## Currently Set in Your Vercel

```
SUPABASE_URL=[set]
SUPABASE_ANON_KEY=[set]
SUPABASE_SERVICE_ROLE_KEY=[set]
SERVICE_KEY=[set]
OPEN_AI_API=[set] ← OpenAI API key
MISTRAL=[set] ← Mistral API key  
PERPLEXITY=[set] ← Perplexity API key
RECALL_API_KEY=[set]
RECALL_WEBHOOK_SECRET=[set]
RECALL_REGION=[set]
```

## Missing - Need to Add

```
DEEPGRAM_API_KEY=[your-deepgram-key]
```

Add this in your Vercel dashboard for Deepgram transcription to work.

## Notes

- In Vercel, environment variables are automatically exposed to the build process
- Do NOT use the `VITE_` prefix in Vercel - that's only for local development
- The app will check for both versions (with and without VITE_ prefix) to support all environments
- All keys should be added as plain text values, not wrapped in quotes

## Local Development

For local development, create a `.env.local` file with the `VITE_` prefix:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_OPENAI_API_KEY=...
VITE_MISTRAL_API_KEY=...
VITE_DEEPGRAM_API_KEY=...
VITE_PERPLEXITY=...
```