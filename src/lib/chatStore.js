const KEY = 'hive_chats_v1';

function readAll(){
	try{ return JSON.parse(localStorage.getItem(KEY)||'[]'); }catch{ return []; }
}
function writeAll(list){ localStorage.setItem(KEY, JSON.stringify(list)); }
function genId(){ return `${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }

export function listChats(){ return readAll().sort((a,b)=> (b.updated_at||0)-(a.updated_at||0)); }
export function getChat(id){ return readAll().find(c=>c.id===id)||null; }
export function deleteChat(id){ writeAll(readAll().filter(c=>c.id!==id)); }
export function saveChat({ id, title, scope, model, messages }){
	const list = readAll();
	const now = Date.now();
	if (!id){ id = genId(); }
	const idx = list.findIndex(c=>c.id===id);
	const item = { id, title: title||'Untitled chat', scope: scope||'ALL', model: model||'Mistral', messages: messages||[], created_at: list[idx]?.created_at||now, updated_at: now };
	if (idx>=0) list[idx]=item; else list.unshift(item);
	writeAll(list);
	return item;
}
