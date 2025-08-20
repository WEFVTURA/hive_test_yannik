export const config = { runtime: 'edge' };

export default async function handler(req){
  const cors = {
    'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  
  const RECALL_KEY = process.env.RECALL_API_KEY || '';
  const region = (process.env.RECALL_REGION || 'us').trim().toLowerCase();
  
  if (!RECALL_KEY) {
    return new Response(JSON.stringify({ error: 'RECALL_API_KEY not set' }), { 
      status: 500, 
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  // Region-specific base URLs
  const regionBases = {
    'us': 'https://us-west-2.recall.ai',
    'eu': 'https://eu-west-1.recall.ai', 
    'jp': 'https://ap-northeast-1.recall.ai',
    'payg': 'https://api.recall.ai'
  };
  
  const base = regionBases[region] || regionBases.us;
  const testUrl = `${base}/v1/transcripts?limit=5`;
  
  try {
    const response = await fetch(testUrl, {
      headers: {
        'Authorization': `Token ${RECALL_KEY}`,
        'Accept': 'application/json'
      }
    });

    const status = response.status;
    const statusText = response.statusText;
    const headers = {};
    
    // Capture important headers
    ['content-type', 'location', 'x-ratelimit-remaining'].forEach(h => {
      const val = response.headers.get(h);
      if (val) headers[h] = val;
    });

    let body = '';
    let transcripts = [];
    
    try {
      const text = await response.text();
      body = text;
      
      if (response.ok) {
        const data = JSON.parse(text);
        transcripts = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
      }
    } catch (e) {
      body = 'Failed to read response body: ' + e.message;
    }

    return new Response(JSON.stringify({
      success: response.ok,
      api_key_length: RECALL_KEY.length,
      region_used: region,
      base_url: base,
      test_url: testUrl,
      response: {
        status,
        statusText,
        headers,
        bodySnippet: body.substring(0, 500),
        transcriptCount: transcripts.length,
        firstTranscript: transcripts[0] || null
      }
    }, null, 2), { 
      status: 200, 
      headers: { ...cors, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Request failed',
      message: error.message,
      api_key_length: RECALL_KEY.length,
      region_used: region,
      base_url: base,
      test_url: testUrl
    }, null, 2), { 
      status: 500, 
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
}
