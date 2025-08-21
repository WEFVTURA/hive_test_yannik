# Deploying to Vercel

Environment variables (Project → Settings → Environment Variables):
- SUPABASE_URL
- SUPABASE_ANON_KEY

Optional (serverless functions):
- RECALL_API_TOKEN (meeting bot)
- SUPABASE_SERVICE_ROLE_KEY (webhooks/functions that write)
- ASSEMBLYAI_API_KEY (audio transcription)

Vercel config: `vercel.json` has SPA rewrites.

Notes:
- The app uses Supabase auth; first load shows a signup/login panel if not authenticated.
- Settings modal includes a Log out button.

