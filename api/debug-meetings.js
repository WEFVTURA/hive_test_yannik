export const config = { runtime: 'edge' };

export default async function handler(req){
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  
  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_KEY || '';
  
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Missing config' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
  
  const result = {
    spaces: [],
    meetings_space: null,
    notes: [],
    recall_notes: [],
    recent_imports: []
  };
  
  try {
    // Get all spaces
    const spacesResp = await fetch(`${SUPABASE_URL}/rest/v1/spaces?select=*`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    result.spaces = await spacesResp.json();
    
    // Find Meetings space
    const meetingsSpace = result.spaces.find(s => 
      s.name?.toLowerCase() === 'meetings' || 
      s.name?.toLowerCase().includes('meeting')
    );
    
    if (meetingsSpace) {
      result.meetings_space = meetingsSpace;
      
      // Get all notes in Meetings space
      const notesResp = await fetch(
        `${SUPABASE_URL}/rest/v1/notes?select=*&space_id=eq.${meetingsSpace.id}&order=created_at.desc`,
        { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
      );
      result.notes = await notesResp.json();
      
      // Filter for Recall notes
      result.recall_notes = result.notes.filter(n => 
        n.title?.toLowerCase().includes('recall') || 
        n.title?.toLowerCase().includes('[recall]')
      );
      
      // Get recently created notes (last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24*60*60*1000).toISOString();
      result.recent_imports = result.notes.filter(n => n.created_at > oneDayAgo);
    }
    
    // Check for duplicate titles
    const titleCounts = {};
    result.notes.forEach(n => {
      const title = n.title || 'Untitled';
      titleCounts[title] = (titleCounts[title] || 0) + 1;
    });
    result.duplicate_titles = Object.entries(titleCounts)
      .filter(([_, count]) => count > 1)
      .map(([title, count]) => ({ title, count }));
    
  } catch(e) {
    result.error = e.message;
  }
  
  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}