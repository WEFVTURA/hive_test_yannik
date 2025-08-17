import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export function util_getEnv(key, promptLabel){
  const winVal = window[key];
  if (winVal) return winVal;
  const lsKey = `HIve_${key}`;
  const fromLs = localStorage.getItem(lsKey);
  if (fromLs) return fromLs;
  // No prompt in modular app; return empty string
  return '';
}

let cachedClient = null;
export function getSupabase(){
  if (cachedClient) return cachedClient;
  const url = util_getEnv('SUPABASE_URL', 'SUPABASE_URL');
  const anon = util_getEnv('SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
  if (!url || !anon) throw new Error('Supabase URL/ANON KEY missing');
  cachedClient = createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true } });
  return cachedClient;
}

// DB helpers
export async function db_listSpaces(){
  const sb = getSupabase();
  const { data, error } = await sb.from('spaces').select('*').order('created_at', { ascending: true });
  if (error) throw error; return data;
}
export async function db_getSpace(id){
  const sb = getSupabase();
  const { data, error } = await sb.from('spaces').select('*').eq('id', id).single();
  if (error) throw error; return data;
}
export async function db_createSpace(name){
  const sb = getSupabase();
  const { data, error } = await sb.from('spaces').insert({ name }).select('*').single();
  if (error) throw error; return data;
}
export async function db_updateSpace(id, fields){
  const sb = getSupabase();
  const { data, error } = await sb.from('spaces').update({ ...fields }).eq('id', id).select('*').single();
  if (error) throw error; return data;
}
export async function db_shareSpace(spaceId, email){
  const sb = getSupabase();
  const { data, error } = await sb.from('space_shares').insert({ space_id: spaceId, email }).select('*').single();
  if (error) throw error; return data;
}
export async function db_listShares(spaceId){
  const sb = getSupabase();
  const { data, error } = await sb.from('space_shares').select('*').eq('space_id', spaceId).order('created_at', { ascending:false });
  if (error) throw error; return data||[];
}
export async function db_listFiles(spaceId){
  const sb = getSupabase();
  const { data, error } = await sb.from('files').select('*').eq('space_id', spaceId).order('created_at', { ascending: true });
  if (error) throw error; return data;
}
export async function db_listNotes(spaceId){
  const sb = getSupabase();
  const { data, error } = await sb.from('notes').select('*').eq('space_id', spaceId).order('updated_at', { ascending: false });
  if (error) throw error; return data;
}
export async function db_createNote(spaceId){
  const sb = getSupabase();
  const { data, error } = await sb.from('notes').insert({ space_id: spaceId, title: 'Untitled', content: '' }).select('*').single();
  if (error) throw error; return data;
}
export async function db_updateNote(id, fields){
  const sb = getSupabase();
  const { data, error } = await sb.from('notes').update({ ...fields }).eq('id', id).select('*').single();
  if (error) throw error; return data;
}
export async function db_deleteNote(id){
  const sb = getSupabase();
  const { error } = await sb.from('notes').delete().eq('id', id);
  if (error) throw error;
}

// Chat history (Supabase)
export async function db_listChats(){
  const sb = getSupabase();
  const { data, error } = await sb.from('chats').select('*').order('updated_at', { ascending:false });
  if (error) throw error; return data||[];
}
export async function db_saveChat(row){
  const sb = getSupabase();
  const base = { title: row.title||'Untitled chat', scope: row.scope||'ALL', model: row.model||'Mistral', messages: row.messages||[] };
  if (row.id){
    const { data, error } = await sb.from('chats').update({ ...base, updated_at: new Date().toISOString() }).eq('id', row.id).select('*').single();
    if (error) throw error; return data;
  }
  const { data, error } = await sb.from('chats').insert({ ...base }).select('*').single();
  if (error) throw error; return data;
}
export async function db_deleteChat(id){
  const sb = getSupabase();
  const { error } = await sb.from('chats').delete().eq('id', id);
  if (error) throw error;
}
