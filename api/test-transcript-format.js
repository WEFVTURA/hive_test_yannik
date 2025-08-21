export const config = { runtime: 'edge' };

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  // Get one of the Recall transcripts to analyze the structure
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

  try {
    // Get a Recall transcript
    const notesResp = await fetch(`${SUPABASE_URL}/rest/v1/notes?select=*&title=ilike.%Recall%&limit=1`, { 
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } 
    });
    
    const notes = await notesResp.json();
    const note = notes[0];
    
    if (!note) {
      return new Response(JSON.stringify({ error: 'No Recall transcript found' }), { 
        status: 404, 
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // Analyze the content structure
    let analysis = {
      title: note.title,
      contentLength: note.content?.length || 0,
      contentType: typeof note.content,
      isValidJSON: false,
      structure: 'unknown',
      sample: note.content?.substring(0, 500) || ''
    };

    try {
      const parsed = JSON.parse(note.content);
      analysis.isValidJSON = true;
      analysis.topLevelType = Array.isArray(parsed) ? 'array' : 'object';
      analysis.keys = Array.isArray(parsed) ? 'array_items' : Object.keys(parsed).slice(0, 10);
      
      if (Array.isArray(parsed) && parsed.length > 0) {
        analysis.firstItemKeys = Object.keys(parsed[0] || {});
        analysis.hasTextProperty = parsed.some(item => item.text);
        analysis.hasWordsProperty = parsed.some(item => item.words);
      } else if (parsed.words) {
        analysis.hasWordsArray = true;
        analysis.wordsCount = parsed.words?.length || 0;
      }
    } catch (e) {
      analysis.parseError = e.message;
    }

    return new Response(JSON.stringify(analysis, null, 2), { 
      status: 200, 
      headers: { ...cors, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
}
