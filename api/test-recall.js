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

  try {
  // Test multiple endpoint patterns and auth formats
  const testVariants = [
    { url: `${base}/api/v1/transcript/?page=1`, auth: `Token ${RECALL_KEY}` },
    { url: `${base}/api/v1/transcript/?page=1`, auth: `Bearer ${RECALL_KEY}` },
    { url: `${base}/api/v1/transcript/?page=1`, auth: `${RECALL_KEY}` },
    { url: `${base}/api/v1/transcripts/?page=1`, auth: `Token ${RECALL_KEY}` },
    { url: `${base}/api/v1/bot/?page=1`, auth: `Token ${RECALL_KEY}` },
    { url: `${base}/api/v1/bot/?page=1`, auth: `Bearer ${RECALL_KEY}` }
  ];
  
  const results = [];
  
  for (const variant of testVariants) {
    try {
      const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      };
      
      // Add authorization header
      if (variant.auth.includes('Token') || variant.auth.includes('Bearer')) {
        headers['Authorization'] = variant.auth;
      } else {
        // Try direct API key
        headers['Authorization'] = variant.auth;
      }
      
      const response = await fetch(variant.url, { headers });

      const status = response.status;
      const statusText = response.statusText;
      const responseHeaders = {};
      
      // Capture important headers
      ['content-type', 'location', 'x-ratelimit-remaining'].forEach(h => {
        const val = response.headers.get(h);
        if (val) responseHeaders[h] = val;
      });

      let body = '';
      let transcripts = [];
      let isJson = false;
      
      try {
        const text = await response.text();
        body = text;
        
        if (response.ok && responseHeaders['content-type']?.includes('application/json')) {
          const data = JSON.parse(text);
          transcripts = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
          isJson = true;
        }
      } catch (e) {
        body = 'Failed to read response body: ' + e.message;
      }

      results.push({
        variant: `${variant.auth.split(' ')[0]} ${variant.url}`,
        status,
        statusText,
        headers: responseHeaders,
        bodySnippet: body.substring(0, 200),
        transcriptCount: transcripts.length,
        isJson,
        success: response.ok && isJson && transcripts.length > 0
      });
      
      // If we found a working variant, stop testing
      if (response.ok && isJson && transcripts.length > 0) break;
      
    } catch (error) {
      results.push({
        variant: `${variant.auth.split(' ')[0]} ${variant.url}`,
        error: error.message
      });
    }
  }

  return new Response(JSON.stringify({
    api_key_length: RECALL_KEY.length,
    region_used: region,
    base_url: base,
    results,
    summary: {
      working_variants: results.filter(r => r.success).length,
      total_tested: results.length
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
      base_url: base
    }, null, 2), { 
      status: 500, 
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
}
