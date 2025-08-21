export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  
  const RECALL_KEY = process.env.RECALL_API_KEY || process.env.RECALL_KEY || process.env.RECALL || '';
  const region = (process.env.RECALL_REGION || 'us').trim().toLowerCase();
  
  const regionBases = {
    'us': 'https://us-west-2.recall.ai',
    'eu': 'https://eu-west-1.recall.ai', 
    'jp': 'https://ap-northeast-1.recall.ai',
    'payg': 'https://api.recall.ai'
  };
  const base = regionBases[region] || regionBases.us;
  
  const results = {
    env_check: {
      has_recall_key: Boolean(RECALL_KEY),
      key_length: RECALL_KEY.length,
      key_prefix: RECALL_KEY.substring(0, 8) + '...',
      region: region,
      base_url: base,
      webhook_secret: Boolean(process.env.RECALL_WEBHOOK_SECRET)
    },
    tests: []
  };
  
  if (!RECALL_KEY) {
    return Response.json({ error: 'No Recall API key configured', ...results }, { status: 500, headers: cors });
  }
  
  try {
    // Test 1: List bots
    const botsUrl = `${base}/api/v1/bot/?limit=1`;
    const botsResp = await fetch(botsUrl, {
      headers: {
        'Authorization': `Token ${RECALL_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    results.tests.push({
      name: 'List Bots',
      endpoint: '/api/v1/bot/',
      status: botsResp.status,
      ok: botsResp.ok
    });
    
    if (botsResp.ok) {
      const botsData = await botsResp.json();
      const bots = botsData.results || [];
      results.bot_count = botsData.count || bots.length;
      
      if (bots.length > 0) {
        const testBot = bots[0];
        results.sample_bot = {
          id: testBot.id,
          status: testBot.status,
          created_at: testBot.created_at
        };
        
        // Test 2: Get bot details
        const botDetailUrl = `${base}/api/v1/bot/${testBot.id}/`;
        const botDetailResp = await fetch(botDetailUrl, {
          headers: {
            'Authorization': `Token ${RECALL_KEY}`,
            'Accept': 'application/json'
          }
        });
        
        results.tests.push({
          name: 'Get Bot Details',
          endpoint: `/api/v1/bot/${testBot.id}/`,
          status: botDetailResp.status,
          ok: botDetailResp.ok
        });
        
        if (botDetailResp.ok) {
          const botDetail = await botDetailResp.json();
          results.bot_detail_fields = Object.keys(botDetail);
          results.has_transcript = 'transcript' in botDetail;
          results.has_recording_id = 'recording_id' in botDetail;
          
          // Test 3: Try transcript endpoint
          const transcriptUrl = `${base}/api/v1/bot/${testBot.id}/transcript/`;
          const transcriptResp = await fetch(transcriptUrl, {
            headers: {
              'Authorization': `Token ${RECALL_KEY}`,
              'Accept': 'application/json'
            }
          });
          
          results.tests.push({
            name: 'Get Bot Transcript',
            endpoint: `/api/v1/bot/${testBot.id}/transcript/`,
            status: transcriptResp.status,
            ok: transcriptResp.ok
          });
          
          if (transcriptResp.ok) {
            const tData = await transcriptResp.json();
            results.transcript_type = Array.isArray(tData) ? 'array' : typeof tData;
            if (Array.isArray(tData)) {
              results.transcript_length = tData.length;
              if (tData.length > 0) {
                results.transcript_sample = Object.keys(tData[0]);
              }
            }
          }
        }
      }
    }
    
    // Test 4: List transcripts
    const transcriptsUrl = `${base}/api/v1/transcript/?limit=1`;
    const transcriptsResp = await fetch(transcriptsUrl, {
      headers: {
        'Authorization': `Token ${RECALL_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    results.tests.push({
      name: 'List Transcripts',
      endpoint: '/api/v1/transcript/',
      status: transcriptsResp.status,
      ok: transcriptsResp.ok
    });
    
  } catch(e) {
    results.error = e.message;
  }
  
  return Response.json(results, { status: 200, headers: cors });
}