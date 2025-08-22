# How to Map Your Existing Recall Bots

If you're not seeing your transcripts, it's likely because your bots were created before we implemented the user mapping system. Here's how to fix it:

## Why This Happens
- We implemented user isolation for security (each user only sees their own transcripts)
- Bots created before this system don't have user mappings
- Without a mapping, the system doesn't know the bot belongs to you

## Solution: Map Your Bots

### Step 1: Find Your Bot IDs
Your bot IDs are visible in:
- The Recall.ai dashboard
- The webhook payloads you receive
- The meeting recording URLs

Bot IDs look like: `e4b22b2d-d490-4874-a086-322922f07950`

### Step 2: Create Mappings

Use the `/api/recall-setup-mappings` endpoint to claim your bots:

```javascript
// Example API call
fetch('/api/recall-setup-mappings', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    bot_ids: [
      'bot-id-1',
      'bot-id-2',
      'bot-id-3'
    ]
  })
})
```

### Step 3: Verify
After mapping, your transcripts will appear in:
- Meetings Hub
- Transcript List
- API responses

## For Administrators

To manually map bots in Supabase:

```sql
-- Map a specific bot to a user
INSERT INTO recall_bots (bot_id, user_id, created_at)
VALUES ('BOT_ID_HERE', 'USER_UUID_HERE', now())
ON CONFLICT (bot_id) DO UPDATE SET user_id = EXCLUDED.user_id;

-- Map multiple bots to a user
INSERT INTO recall_bots (bot_id, user_id, created_at)
SELECT bot_id, 'USER_UUID_HERE', now()
FROM (VALUES 
  ('bot-id-1'),
  ('bot-id-2'),
  ('bot-id-3')
) AS t(bot_id)
ON CONFLICT (bot_id) DO UPDATE SET user_id = EXCLUDED.user_id;
```

## Security Note
This mapping system ensures:
- Users can only see their own transcripts
- No user can access another user's data
- All data remains isolated per user

## Need Help?
If you're having trouble finding your bot IDs or creating mappings, check:
1. Your Recall.ai dashboard for bot IDs
2. The Debug button in Meetings Hub to see your current mappings
3. Contact support with your bot IDs for assistance