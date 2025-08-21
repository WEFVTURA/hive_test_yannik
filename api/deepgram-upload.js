export const config = { runtime: 'edge' };

export default async function handler(req){
  const cors = {
    'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });
  try{
    const ct = req.headers.get('Content-Type')||'';
    let directBody = null; let useUrl = '';
    if (ct.startsWith('multipart/form-data')){
      const form = await req.formData();
      const file = form.get('file');
      if (!file) return new Response(JSON.stringify({ error:'file missing' }), { status:400, headers:{...cors,'Content-Type':'application/json'} });
      directBody = file;
    } else {
      const j = await req.json().catch(()=>({}));
      useUrl = j?.url||'';
      if (!useUrl) return new Response(JSON.stringify({ error:'file missing' }), { status:400, headers:{...cors,'Content-Type':'application/json'} });
    }
    const hdrAuth = req.headers.get('authorization') || '';
    const inlineKey = hdrAuth.toLowerCase().startsWith('bearer ') ? hdrAuth.slice(7).trim() : '';
    const apiKey = inlineKey || process.env.DEEPGRAM_API_KEY || '';
    if (!apiKey) return new Response(JSON.stringify({ error:'DEEPGRAM_API_KEY missing' }), { status:500, headers:{...cors,'Content-Type':'application/json'} });

    // Optional callback to save transcript via webhook
    let callback = '';
    try{
      if (useUrl){
        const jbody = await req.json().catch(()=>null);
        const spaceId = jbody?.space_id || '';
        const title = (jbody?.title||'Audio').toString().slice(0,120);
        const proto = req.headers.get('x-forwarded-proto') || 'https';
        const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
        if (spaceId && host){ callback = `&callback=${encodeURIComponent(`${proto}://${host}/api/deepgram-webhook?space_id=${encodeURIComponent(spaceId)}&title=${encodeURIComponent(title)}`)}`; }
      }
    }catch{}

    // Enhanced Deepgram parameters for better transcription
    const params = new URLSearchParams({
      model: 'nova-2',  // Latest model
      smart_format: 'true',
      punctuate: 'true',
      paragraphs: 'true',
      diarize: 'true',  // Speaker identification
      utterances: 'true',  // Speaker turns
      language: 'en',
      filler_words: 'false',
      numerals: 'true'
    });
    
    // Build endpoint with callback if present
    const endpoint = `https://api.deepgram.com/v1/listen?${params.toString()}${callback}`;
    const headers = { 
      Authorization: `Token ${apiKey}`
    };
    
    let requestBody;
    
    // Handle URL vs direct file upload
    if (useUrl) {
      headers['Content-Type'] = 'application/json';
      requestBody = JSON.stringify({ url: useUrl });
    } else if (directBody) {
      headers['Content-Type'] = 'audio/*';
      requestBody = directBody;
    }
    
    const r = await fetch(endpoint, { 
      method: 'POST', 
      headers,
      body: requestBody
    });
    const j = await r.json().catch(()=>({}));
    if (!r.ok) return new Response(JSON.stringify({ error: j?.error || 'deepgram_failed' }), { status:r.status, headers:{...cors,'Content-Type':'application/json'} });
    // Enhanced response handling with speaker diarization
    let responseData = {};
    
    // Check for transcript in various formats
    const channel = j?.results?.channels?.[0];
    const alternative = channel?.alternatives?.[0];
    
    if (alternative) {
      // Get main transcript
      responseData.text = alternative.transcript || '';
      
      // Get paragraphs with speaker info if available
      if (alternative.paragraphs?.paragraphs) {
        responseData.paragraphs = alternative.paragraphs.paragraphs;
        responseData.formatted_transcript = alternative.paragraphs.transcript || responseData.text;
      }
      
      // Get utterances for speaker turns
      if (j?.results?.utterances) {
        responseData.utterances = j.results.utterances;
        
        // Format transcript with speakers
        const speakerTranscript = j.results.utterances
          .map(u => `Speaker ${u.speaker}: ${u.transcript}`)
          .join('\n\n');
        
        if (speakerTranscript) {
          responseData.speaker_transcript = speakerTranscript;
        }
      }
      
      // Include metadata
      responseData.metadata = j?.metadata || {};
      
      return new Response(JSON.stringify(responseData), { 
        status: 200, 
        headers: {...cors, 'Content-Type': 'application/json'} 
      });
    }
    
    // Job accepted for async processing
    return new Response(JSON.stringify({ 
      accepted: true, 
      request_id: j?.request_id || j?.id || j?.metadata?.request_id || null 
    }), { 
      status: 202, 
      headers: {...cors, 'Content-Type': 'application/json'} 
    });
  }catch{
    return new Response(JSON.stringify({ error:'bad_request' }), { status:400, headers:{...cors,'Content-Type':'application/json'} });
  }
}


