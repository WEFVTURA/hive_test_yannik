export const config = { runtime: 'edge' };

async function json(res, status=200, cors){ return new Response(JSON.stringify(res), { status, headers:{ ...(cors||{}), 'Content-Type':'application/json' } }); }

export default async function handler(req){
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-recall-signature',
    'Access-Control-Max-Age': '86400'
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  // Read raw body first so we can verify signature if provided
  let rawBody = '';
  try{ rawBody = await req.text(); }catch{}

  // Webhook signature verification (Svix format)
  let signatureValid = false;
  try{
    const providedSig = req.headers.get('svix-signature') || req.headers.get('x-recall-signature') || '';
    const secret = process.env.RECALL_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET || '';
    
    if (secret && providedSig && rawBody){
      // Handle Svix webhook format
      if (providedSig.startsWith('v1,')) {
        const timestamp = req.headers.get('svix-timestamp') || '';
        const msgId = req.headers.get('svix-id') || '';
        
        // Svix format: sign(msg_id.timestamp.body)
        const signedContent = `${msgId}.${timestamp}.${rawBody}`;
        const enc = new TextEncoder();
        
        // Remove 'whsec_' prefix to get base64 key
        const actualKey = secret.replace('whsec_', '');
        const keyBytes = Uint8Array.from(atob(actualKey), c => c.charCodeAt(0));
        
        const key = await crypto.subtle.importKey('raw', keyBytes, { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
        const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(signedContent));
        const computedSig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
        
        // Extract signatures from header (format: v1,s1=sig1 s2=sig2)
        const sigs = providedSig.split(' ').filter(p => p.includes('=')).map(p => p.split('=')[1]);
        signatureValid = sigs.some(s => s === computedSig);
      } else {
        // Fallback to simple HMAC
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
        const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
        const sigHex = Array.from(new Uint8Array(sigBuf)).map(b=>b.toString(16).padStart(2,'0')).join('');
        signatureValid = sigHex === providedSig.toLowerCase();
      }
    }
  }catch(e){
    console.log('Signature verification error:', e.message);
  }

  let body={};
  try{ body = rawBody ? JSON.parse(rawBody) : {}; }catch{ return json({ error:'bad_json' }, 400, cors); }
  
  // Log webhook for debugging
  console.log('Webhook received:', { 
    event: body?.event, 
    has_data: Boolean(body?.data),
    has_transcript: Boolean(body?.data?.transcript),
    has_bot: Boolean(body?.data?.bot)
  });
  
  // Support multiple event shapes
  const eventName = String(body?.event || '').toLowerCase();
  const status = String(body?.status || '').toLowerCase();
  
  // Handle all transcript and recording events to capture data
  const relevantEvents = [
    'transcript.done', 'transcript.processing',
    'recording.done', 'recording.processing',
    'bot.done', 'bot.call_ended'
  ];
  
  const isRelevant = relevantEvents.some(e => eventName.includes(e)) || status === 'completed';
  
  // For now, log and save ALL events for debugging
  if (!eventName) { 
    return json({ ok:true, ignored:true, reason: 'no_event' }, 200, cors); 
  }

  // Accept multiple env names to match different deployments
  const RECALL_KEY = process.env.RECALL_API_KEY || process.env.RECALL_KEY || process.env.RECALL || '';
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SERVICE_KEY || '';
  if (!SUPABASE_URL || !SERVICE_KEY){ return json({ error:'supabase_env_missing', present:{ SUPABASE_URL: Boolean(SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY: Boolean(SERVICE_KEY) } }, 500, cors); }

  // Extract bot and recording IDs from webhook payload
  const botId = body?.data?.bot?.id || body?.bot?.id || '';
  const recordingId = body?.data?.recording?.id || body?.recording?.id || '';
  const transcriptId = body?.data?.transcript?.id || body?.transcript?.id || '';
  
  // Fetch transcript text - for transcript.done events, we need to fetch from API
  let text = body?.transcript_text || body?.data?.transcript_text || '';
  let title = '';
  
  try{
    // For transcript.done events, fetch the actual transcript from the bot
    if (eventName === 'transcript.done' && botId && RECALL_KEY){
      const region = (process.env.RECALL_REGION || 'us').trim().toLowerCase();
      const regionBases = {
        'us': 'https://us-west-2.recall.ai',
        'eu': 'https://eu-west-1.recall.ai', 
        'jp': 'https://ap-northeast-1.recall.ai',
        'payg': 'https://api.recall.ai'
      };
      const base = regionBases[region] || regionBases.us;
      
      // Fetch bot details which should include the transcript
      const botUrl = `${base}/api/v1/bot/${botId}/`;
      const botResp = await fetch(botUrl, {
        headers: { 'Authorization': `Token ${RECALL_KEY}` }
      });
      
      if (botResp.ok) {
        const botData = await botResp.json();
        
        // Extract meeting title
        title = botData.meeting_metadata?.title || botData.meeting_url || `Meeting ${new Date().toLocaleDateString()}`;
        
        // Extract transcript
        if (botData.transcript) {
          if (Array.isArray(botData.transcript)) {
            text = botData.transcript.map(seg => {
              const speaker = seg.speaker || `Speaker ${seg.speaker_id || 'Unknown'}`;
              const words = seg.words ? seg.words.map(w => w.text || w.word || w).join(' ') : (seg.text || '');
              return `${speaker}: ${words}`;
            }).join('\n\n');
          } else if (typeof botData.transcript === 'string') {
            text = botData.transcript;
          }
        }
        
        // If no transcript in bot data, try the transcript endpoint
        if (!text) {
          const transcriptUrl = `${base}/api/v1/bot/${botId}/transcript/`;
          const tResp = await fetch(transcriptUrl, {
            headers: { 'Authorization': `Token ${RECALL_KEY}` }
          });
          
          if (tResp.ok) {
            const tData = await tResp.json();
            if (Array.isArray(tData)) {
              text = tData.map(seg => 
                `${seg.speaker || 'Unknown'}: ${seg.text || seg.words?.map(w => w.text).join(' ') || ''}`
              ).join('\n\n');
            } else if (typeof tData === 'string') {
              text = tData;
            }
          }
        }
      }
    }
    
    if (!text && (body?.transcript_url || body?.data?.transcript_url)){
      const r = await fetch(String(body?.transcript_url || body?.data?.transcript_url));
      text = await r.text();
    } else if (!text && RECALL_KEY && transcriptId){
      // Try multiple host/path variants and auth header styles
      // Recall keys are region-scoped: US/EU/JP/Pay-as-you-go
      const region = (process.env.RECALL_REGION || 'us').trim().toLowerCase();
      const regionBases = {
        'us': 'https://us-west-2.recall.ai',
        'eu': 'https://eu-west-1.recall.ai', 
        'jp': 'https://ap-northeast-1.recall.ai',
        'payg': 'https://api.recall.ai'
      };
      const base = regionBases[region] || regionBases.us;
      const urls = [`${base}/v1/transcripts/${transcriptId}`, `${base}/api/v1/transcripts/${transcriptId}`];
      const headersList = [ { Authorization:`Token ${RECALL_KEY}` }, { 'X-Api-Key': RECALL_KEY } ];
      for (const u of urls){
        for (const hdrs of headersList){
          try{
            const r = await fetch(u, { headers: hdrs });
            const j = await r.json().catch(()=>({}));
            text = j?.text || j?.transcript || '';
            if (text) break;
          }catch{}
        }
        if (text) break;
      }
    }
  }catch{}

  // Use title from bot data or webhook
  if (!title) {
    title = body?.meeting_title || body?.data?.meeting_title || body?.recording?.id || body?.id || `Meeting ${new Date().toLocaleString()}`;
  }
  
  // Add event type to title for debugging
  title = `[${eventName}] ${title}`;
  
  let spaceId = '';
  try{
    const q = await fetch(`${SUPABASE_URL}/rest/v1/spaces?select=id&name=eq.Meetings`, { headers:{ apikey:SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}` } });
    const arr = await q.json().catch(()=>[]);
    if (Array.isArray(arr) && arr.length) spaceId = arr[0].id;
    else {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/spaces`, { method:'POST', headers:{ 'Content-Type':'application/json', apikey:SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}` }, body: JSON.stringify({ name:'Meetings', visibility:'private' }) });
      const created = await r.json().catch(()=>({}));
      spaceId = created?.[0]?.id || created?.id || '';
    }
  }catch{}

  // Save webhook data even if no transcript yet (for debugging and tracking)
  let saved = false;
  let noteId = '';
  
  try{
    // For transcript.done events with text, save the transcript
    if (eventName === 'transcript.done' && text) {
      const saveResp = await fetch(`${SUPABASE_URL}/rest/v1/notes`, { 
        method:'POST', 
        headers:{ 
          'Content-Type':'application/json', 
          apikey:SERVICE_KEY, 
          Authorization:`Bearer ${SERVICE_KEY}`,
          'Prefer': 'return=representation'
        }, 
        body: JSON.stringify({ 
          space_id: spaceId||null, 
          title: title.replace('[transcript.done]', '[Recall]'), 
          content: text 
        }) 
      });
      
      if (saveResp.ok) {
        const savedData = await saveResp.json();
        noteId = savedData?.[0]?.id || savedData?.id || '';
        saved = true;
      }
    }
    // For other events, save minimal tracking info
    else if (eventName && botId) {
      const trackingContent = `Event: ${eventName}\nBot ID: ${botId}\nRecording ID: ${recordingId}\nTimestamp: ${new Date().toISOString()}\n\nWaiting for transcript...`;
      
      // Check if we already have a note for this bot
      const existingResp = await fetch(
        `${SUPABASE_URL}/rest/v1/notes?select=id&space_id=eq.${spaceId}&title=ilike.%${botId}%`, 
        { headers:{ apikey:SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}` } }
      );
      const existing = await existingResp.json().catch(() => []);
      
      if (existing.length === 0 && eventName !== 'transcript.processing') {
        // Create a placeholder note for tracking
        await fetch(`${SUPABASE_URL}/rest/v1/notes`, { 
          method:'POST', 
          headers:{ 
            'Content-Type':'application/json', 
            apikey:SERVICE_KEY, 
            Authorization:`Bearer ${SERVICE_KEY}` 
          }, 
          body: JSON.stringify({ 
            space_id: spaceId||null, 
            title: `[Tracking] ${title} (${botId})`, 
            content: trackingContent 
          }) 
        });
      }
    }
  }catch(e){
    console.error('Failed to save webhook data:', e);
  }

  return json({ 
    ok: true, 
    event: eventName,
    bot_id: botId,
    space_id: spaceId, 
    saved: saved,
    has_transcript: Boolean(text),
    note_id: noteId
  }, 200, cors);
}


