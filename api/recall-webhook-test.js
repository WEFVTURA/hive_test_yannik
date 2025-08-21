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
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-recall-signature, svix-signature, svix-id, svix-timestamp',
  };
  
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  
  // For GET requests, return webhook info
  if (req.method === 'GET') {
    return jres({
      webhook_url: 'https://shared-brain.vercel.app/api/recall-webhook',
      webhook_secret_env_var: 'RECALL_WEBHOOK_SECRET',
      secret_to_add: 'whsec_INSMUH2INT3aO/de7Gj3DEVs5syoHa2R',
      instructions: [
        '1. Go to Vercel Dashboard > Settings > Environment Variables',
        '2. Add new variable: RECALL_WEBHOOK_SECRET = whsec_INSMUH2INT3aO/de7Gj3DEVs5syoHa2R',
        '3. Configure Recall webhook to point to: https://shared-brain.vercel.app/api/recall-webhook',
        '4. Recall will send webhooks with signature in x-recall-signature or svix-signature header'
      ],
      current_env_vars: {
        has_RECALL_KEY: Boolean(process.env.RECALL_API_KEY || process.env.RECALL_KEY || process.env.RECALL),
        has_WEBHOOK_SECRET: Boolean(process.env.RECALL_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET),
        has_SUPABASE: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
      }
    }, 200, cors);
  }
  
  // For POST requests, verify webhook signature
  const rawBody = await req.text();
  const result = {
    headers_received: {},
    signature_verification: {},
    body_parsed: null,
    errors: []
  };
  
  // Capture relevant headers
  const headers = ['x-recall-signature', 'svix-signature', 'svix-id', 'svix-timestamp', 'content-type'];
  headers.forEach(h => {
    const value = req.headers.get(h);
    if (value) result.headers_received[h] = value;
  });
  
  // Try to parse body
  try {
    result.body_parsed = JSON.parse(rawBody);
  } catch(e) {
    result.errors.push('Failed to parse JSON body');
  }
  
  // Test signature verification with the provided secret
  const testSecret = 'whsec_INSMUH2INT3aO/de7Gj3DEVs5syoHa2R';
  const providedSig = req.headers.get('x-recall-signature') || req.headers.get('svix-signature') || '';
  
  if (providedSig) {
    // Svix signature format: v1,timestamp=t,signature1=s1,signature2=s2...
    if (providedSig.startsWith('v1,')) {
      // Parse Svix format
      const timestamp = req.headers.get('svix-timestamp') || '';
      const msgId = req.headers.get('svix-id') || '';
      
      result.signature_verification.type = 'svix';
      result.signature_verification.timestamp = timestamp;
      result.signature_verification.msg_id = msgId;
      
      // Svix uses HMAC-SHA256 with format: msg_id.timestamp.body
      const signedContent = `${msgId}.${timestamp}.${rawBody}`;
      const enc = new TextEncoder();
      
      // Remove 'whsec_' prefix for actual key
      const actualKey = testSecret.replace('whsec_', '');
      const keyBytes = Uint8Array.from(atob(actualKey), c => c.charCodeAt(0));
      
      try {
        const key = await crypto.subtle.importKey('raw', keyBytes, { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
        const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(signedContent));
        const computedSig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
        
        // Extract signatures from header
        const sigs = providedSig.split(' ').filter(p => p.includes('=')).map(p => p.split('=')[1]);
        
        result.signature_verification.computed = computedSig;
        result.signature_verification.provided = sigs;
        result.signature_verification.matches = sigs.some(s => s === computedSig);
      } catch(e) {
        result.signature_verification.error = e.message;
      }
    } else {
      // Simple HMAC verification
      result.signature_verification.type = 'simple_hmac';
      
      try {
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey('raw', enc.encode(testSecret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
        const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
        const sigHex = Array.from(new Uint8Array(sigBuf)).map(b=>b.toString(16).padStart(2,'0')).join('');
        
        result.signature_verification.computed = sigHex;
        result.signature_verification.provided = providedSig;
        result.signature_verification.matches = sigHex === providedSig.toLowerCase();
      } catch(e) {
        result.signature_verification.error = e.message;
      }
    }
  } else {
    result.signature_verification.error = 'No signature header found';
  }
  
  // Extract webhook data
  if (result.body_parsed) {
    result.webhook_data = {
      event: result.body_parsed.event,
      bot_id: result.body_parsed?.data?.bot?.id || result.body_parsed?.bot?.id,
      recording_id: result.body_parsed?.data?.recording?.id || result.body_parsed?.recording?.id,
      transcript_id: result.body_parsed?.data?.transcript?.id || result.body_parsed?.transcript?.id,
      has_transcript_data: Boolean(result.body_parsed?.data?.transcript || result.body_parsed?.transcript),
      status: result.body_parsed?.status || result.body_parsed?.data?.status
    };
  }
  
  return jres(result, 200, cors);
}