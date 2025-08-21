# Recall.ai Integration Setup Guide

## Overview
This guide provides complete instructions for setting up Recall.ai integration with the Central Brain application to automatically capture, transcribe, and import meeting recordings.

## Prerequisites
- Recall.ai account with API access
- Vercel deployment for the Central Brain app
- Supabase database configured

## Environment Variables Required

Add these to your Vercel project settings under Environment Variables:

### 1. Recall API Key
- **Variable Name:** `RECALL_API_KEY`
- **Value:** Your Recall API key (starts with 8 alphanumeric characters)
- **Example:** `ddde771aa2...` (40 characters total)

### 2. Recall Region
- **Variable Name:** `RECALL_REGION`
- **Value:** Your Recall region (`us`, `eu`, `jp`, or `payg`)
- **Default:** `us`
- **Region URLs:**
  - US: `https://us-west-2.recall.ai`
  - EU: `https://eu-west-1.recall.ai`
  - JP: `https://ap-northeast-1.recall.ai`
  - Pay-as-you-go: `https://api.recall.ai`

### 3. Webhook Secret
- **Variable Name:** `RECALL_WEBHOOK_SECRET`
- **Value:** `whsec_INSMUH2INT3aO/de7Gj3DEVs5syoHa2R` (or your generated secret)
- **Purpose:** Validates webhook signatures from Recall

### 4. Supabase Configuration
- **SUPABASE_URL:** Your Supabase project URL
- **SUPABASE_SERVICE_ROLE_KEY:** Service role key with full database access

## Webhook Configuration in Recall.ai

### 1. Set up Webhook Endpoint
In your Recall.ai dashboard:
1. Navigate to Webhooks settings
2. Add new webhook URL: `https://shared-brain.vercel.app/api/recall-webhook`
3. Add the webhook secret (same as `RECALL_WEBHOOK_SECRET`)
4. Enable events:
   - `transcript.done` - Primary event for completed transcripts
   - `bot.done` - When bot finishes recording
   - `recording.done` - When recording processing completes

### 2. Webhook Event Flow
When a meeting ends:
1. Recall sends `transcript.done` event to webhook
2. Webhook handler fetches transcript from Recall API
3. Downloads actual transcript from S3 URL
4. Saves formatted transcript to Supabase

## API Integration Features

### Available Endpoints

#### 1. `/api/recall-webhook` (POST)
- Receives webhook events from Recall
- Automatically processes and saves transcripts
- Verifies webhook signatures

#### 2. `/api/recall-bot-list` (GET)
- Lists all bots with their recordings
- Fetches transcripts from download URLs
- Shows transcript preview and metadata

#### 3. `/api/recall-transcript-list` (GET)
- Direct transcript listing endpoint
- Fetches from `/api/v1/transcript/`
- Downloads content from S3 URLs

#### 4. `/api/transcript-import-direct` (POST)
- Manual import endpoint
- Saves transcripts to Supabase
- Creates/uses "Meetings" space

#### 5. `/api/test-recall-auth` (GET)
- Tests API key permissions
- Verifies endpoint access
- Debug connection issues

## Understanding Recall's Data Structure

### Key Points:
1. **Transcripts are NOT inline** - They're stored as download URLs in S3
2. **Download URLs are temporary** - They include AWS signatures with expiration
3. **Multiple data locations** - Transcripts can be in:
   - `data.download_url` (primary location)
   - `transcript_url` field
   - Bot's transcript endpoint

### Transcript Data Flow:
```
Bot Recording → Recall Processing → S3 Storage → Download URL in API → Fetch & Parse → Save to Supabase
```

## UI Features in Central Brain

### Meetings Hub Buttons:
1. **Transcript List** - View all transcripts from API
2. **Bot List** - View all bots and their recordings
3. **Test Auth** - Verify API connection and permissions
4. **Debug** - See raw API responses

### Import Process:
1. Click "Bot List" or "Transcript List"
2. View available transcripts with previews
3. Click "Import Transcript" on desired recording
4. Transcript saves to Meetings space in Supabase
5. Redirects to Meetings Hub to view

## Troubleshooting

### No Transcripts Showing:
1. Check API key is correct in Vercel
2. Verify region setting matches your Recall account
3. Use "Test Auth" button to check permissions
4. Check if transcripts have `data.download_url` field

### Import Fails:
1. Check Supabase environment variables
2. Verify SERVICE_ROLE_KEY has write permissions
3. Check browser console for specific error
4. Ensure "Meetings" space can be created

### Webhook Not Working:
1. Verify webhook secret in Vercel matches Recall
2. Check webhook URL is correct
3. Look at Vercel function logs for errors
4. Test with `/api/recall-webhook-test` endpoint

## Testing the Integration

### 1. Test API Connection:
```bash
curl https://shared-brain.vercel.app/api/test-recall-auth
```

### 2. Test Webhook:
```bash
curl -X GET https://shared-brain.vercel.app/api/recall-webhook-test
```

### 3. List Available Transcripts:
```bash
curl https://shared-brain.vercel.app/api/recall-bot-list
```

## Important Notes

### Security:
- Never expose API keys in frontend code
- Always verify webhook signatures
- Use service role key only in backend

### Rate Limits:
- Bot List limits to 30 bots to avoid timeout
- Transcript List paginates up to 10 pages
- Download URLs expire after ~1 hour

### Data Format:
Transcripts are parsed from various formats:
- Array of segments with speaker/text
- Segments object with nested data
- Direct transcript string
- Words array that needs joining

## Complete Setup Checklist

- [ ] Add RECALL_API_KEY to Vercel
- [ ] Add RECALL_REGION to Vercel (if not US)
- [ ] Add RECALL_WEBHOOK_SECRET to Vercel
- [ ] Configure webhook URL in Recall dashboard
- [ ] Enable transcript.done event in Recall
- [ ] Verify Supabase env vars are set
- [ ] Test with "Test Auth" button
- [ ] Create test recording in Recall
- [ ] Verify transcript appears in Bot List
- [ ] Test import to Meetings space
- [ ] Check webhook logs for automatic imports

## Support

### Debug Information:
When reporting issues, provide:
1. Output from "Test Auth" button
2. Browser console errors during import
3. Vercel function logs
4. Webhook test results

### Common Error Messages:
- "No Recall API key configured" - Add RECALL_API_KEY
- "Failed to fetch spaces" - Check Supabase credentials
- "No transcript content" - Transcript not ready or wrong endpoint
- "Download failed" - S3 URL expired or network issue

## API Key Permissions Required
Your Recall API key needs access to:
- List bots (`/api/v1/bot/`)
- Get bot details (`/api/v1/bot/{id}/`)
- List transcripts (`/api/v1/transcript/`)
- Access download URLs (S3 signed URLs)

## Contact
For Recall.ai specific issues, contact their support with your account email (villagai@fvtura.com).
For integration issues, check the browser console and Vercel logs for detailed error messages.