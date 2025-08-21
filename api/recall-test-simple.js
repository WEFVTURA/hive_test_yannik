export const config = { runtime: 'edge' };

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  
  // Get API key
  const RECALL_KEY = process.env.RECALL_API_KEY || process.env.RECALL_KEY || process.env.RECALL || '';
  
  const result = {
    has_key: Boolean(RECALL_KEY),
    key_length: RECALL_KEY ? RECALL_KEY.length : 0,
    region: process.env.RECALL_REGION || 'us',
    attempts: []
  };
  
  if (!RECALL_KEY) {
    return new Response(JSON.stringify({
      error: 'No Recall API key found',
      ...result
    }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  
  // Try different endpoints
  const region = (process.env.RECALL_REGION || 'us').trim().toLowerCase();
  const bases = {
    'us': 'https://us-west-2.recall.ai',
    'eu': 'https://eu-west-1.recall.ai',
    'jp': 'https://ap-northeast-1.recall.ai',
    'payg': 'https://api.recall.ai'
  };
  const base = bases[region] || bases.us;
  
  // Test endpoints
  const endpoints = [
    `${base}/api/v1/bot/`,
    `${base}/api/v1/transcript/`,
    `${base}/api/v2/bot/`
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint + '?limit=1', {
        headers: {
          'Authorization': `Token ${RECALL_KEY}`,
          'Accept': 'application/json'
        }
      });
      
      const attempt = {
        endpoint,
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      };
      
      if (response.ok) {
        const data = await response.json();
        attempt.hasResults = 'results' in data;
        attempt.resultsCount = data.results ? data.results.length : 0;
        attempt.dataType = Array.isArray(data) ? 'array' : 'object';
        attempt.keys = Object.keys(data).slice(0, 5);
      } else {
        const errorText = await response.text().catch(() => '');
        attempt.error = errorText.slice(0, 100);
      }
      
      result.attempts.push(attempt);
    } catch (e) {
      result.attempts.push({
        endpoint,
        error: e.message
      });
    }
  }
  
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}