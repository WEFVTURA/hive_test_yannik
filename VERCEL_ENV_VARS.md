# Vercel Environment Variables

Add these environment variables in your Vercel project settings:

## Required for Core Functionality

```
SUPABASE_URL=https://lmrnnfjuytygomdfujhs.supabase.co
SUPABASE_ANON_KEY=[your-anon-key]
SUPABASE_SERVICE_ROLE_KEY=[your-service-key]
```

## API Keys (without VITE_ prefix)

```
OPENAI_API_KEY=[your-openai-key]
MISTRAL_API_KEY=[your-mistral-key]
DEEPGRAM_API_KEY=[your-deepgram-key]
PERPLEXITY_API_KEY=[your-perplexity-key]
RECALL_KEY=[your-recall-key]
```

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