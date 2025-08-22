// Enhanced webhook that automatically associates bots with users via meeting URL
export const config = { runtime: 'edge' };

function jres(obj, status, cors){ 
  return new Response(JSON.stringify(obj), { 
    status, 
    headers:{ ...(cors||{}), 'Content-Type':'application/json' } 
  }); 
}

export default async function handler(req){
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jres({ error:'Method not allowed' }, 405, cors);
  
  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_KEY || '';
  
  try {
    const data = await req.json();
    
    // Extract bot_id and meeting_url from webhook data
    const bot_id = data.data?.bot_id || data.bot_id;
    const meeting_url = data.data?.meeting_url || data.meeting_url || data.data?.meeting_metadata?.url;
    const transcript = data.data?.transcript || data.transcript;
    const title = data.data?.title || data.title || 'Meeting Transcript';
    
    if (!bot_id || !transcript) {
      return jres({ error: 'Missing bot_id or transcript' }, 400, cors);
    }
    
    // Step 1: Find user associated with this meeting URL
    let userId = null;
    
    if (meeting_url) {
      // Check if any user has sent a bot to this meeting URL recently
      const urlCheckResp = await fetch(`${SUPABASE_URL}/rest/v1/meeting_urls?select=user_id&url=eq.${encodeURIComponent(meeting_url)}&order=created_at.desc&limit=1`, {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`
        }
      });
      
      if (urlCheckResp.ok) {
        const urlData = await urlCheckResp.json();
        if (urlData?.[0]?.user_id) {
          userId = urlData[0].user_id;
        }
      }
    }
    
    // Step 2: If we found a user, automatically create bot mapping
    if (userId) {
      // Create or update bot mapping
      await fetch(`${SUPABASE_URL}/rest/v1/recall_bots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          bot_id: bot_id,
          user_id: userId,
          meeting_url: meeting_url,
          created_at: new Date().toISOString()
        })
      });
    }
    
    // Step 3: Get user's Meetings space (or create it)
    let spaceId = null;
    
    if (userId) {
      // Look for user's Meetings space
      const spaceResp = await fetch(`${SUPABASE_URL}/rest/v1/spaces?select=id&name=eq.Meetings&owner_id=eq.${userId}&limit=1`, {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`
        }
      });
      
      if (spaceResp.ok) {
        const spaces = await spaceResp.json();
        if (spaces?.[0]?.id) {
          spaceId = spaces[0].id;
        }
      }
      
      // Create space if it doesn't exist
      if (!spaceId) {
        const createResp = await fetch(`${SUPABASE_URL}/rest/v1/spaces`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            name: 'Meetings',
            description: 'Meeting transcripts',
            owner_id: userId,
            settings: { auto_import: true }
          })
        });
        
        if (createResp.ok) {
          const created = await createResp.json();
          spaceId = created?.[0]?.id || created?.id;
        }
      }
    }
    
    // Step 4: Save transcript with proper owner_id and metadata
    const noteData = {
      title: title,
      content: JSON.stringify(transcript), // Store as JSON for rich formatting
      owner_id: userId,
      space_id: spaceId,
      metadata: {
        bot_id: bot_id,
        meeting_url: meeting_url,
        webhook_received: new Date().toISOString(),
        auto_claimed: userId ? true : false
      }
    };
    
    const saveResp = await fetch(`${SUPABASE_URL}/rest/v1/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(noteData)
    });
    
    if (!saveResp.ok) {
      const error = await saveResp.text();
      return jres({ 
        error: 'Failed to save transcript', 
        details: error,
        debug: { userId, spaceId, bot_id }
      }, 500, cors);
    }
    
    const saved = await saveResp.json();
    
    return jres({
      success: true,
      note_id: saved?.[0]?.id || saved?.id,
      auto_claimed: userId ? true : false,
      user_id: userId,
      message: userId ? 
        'Transcript saved and automatically associated with user' : 
        'Transcript saved but no user association found'
    }, 200, cors);
    
  } catch(e) {
    return jres({ 
      error: 'Webhook processing failed', 
      details: e.message 
    }, 500, cors);
  }
}