export function initModals(){
  const html = `
  <div class="modal-scrim" id="modalScrim" aria-hidden="true" style="position:fixed; inset:0; display:none; align-items:center; justify-content:center; background:rgba(0,0,0,.5); z-index:100">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle" style="width:min(520px, 92vw); background:#141821; border:1px solid #1f2430; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,.35); overflow:hidden">
      <div class="modal-head" style="display:flex; align-items:center; justify-content:space-between; padding:12px 14px; background:#0d1016; border-bottom:1px solid #1f2430">
        <div id="modalTitle">Modal</div>
        <button class="button ghost" id="modalClose">Close</button>
      </div>
      <div class="modal-body" id="modalBody" style="padding:14px"></div>
      <div class="modal-actions" style="display:flex; justify-content:flex-end; gap:8px; padding:12px 14px; border-top:1px solid #1f2430">
        <button class="button ghost" id="modalCancel">Cancel</button>
        <button class="button" id="modalOk">OK</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

export function openModalWithExtractor(title, bodyHtml, extractor){
  const scrim = document.getElementById('modalScrim');
  const body = document.getElementById('modalBody');
  const titleEl = document.getElementById('modalTitle');
  const ok = document.getElementById('modalOk');
  const cancel = document.getElementById('modalCancel');
  const close = document.getElementById('modalClose');
  titleEl.textContent = title;
  body.innerHTML = bodyHtml;
  scrim.classList.add('modal-show');
  scrim.style.display = 'flex';
  scrim.setAttribute('aria-hidden','false');
  return new Promise((resolve)=>{
    function cleanup(res){
      // Move focus away before hiding (prevents aria-hidden warning)
      const active = document.activeElement;
      if (active && typeof active.blur === 'function') active.blur();
      if (document.body && typeof document.body.focus === 'function') document.body.focus();
      scrim.classList.remove('modal-show');
      scrim.style.display = 'none';
      scrim.setAttribute('aria-hidden','true');
      ok.onclick = cancel.onclick = close.onclick = null;
      resolve(res);
    }
    ok.onclick = ()=>{ try{ const values = extractor ? extractor(body) : null; cleanup({ ok:true, values }); } catch(e){ alert(e?.message||e); } };
    cancel.onclick = ()=>cleanup({ ok:false });
    close.onclick = ()=>cleanup({ ok:false });
  });
}

export function openListModal(title, items, renderItem){
  const scrim = document.getElementById('modalScrim');
  const titleEl = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');
  const ok = document.getElementById('modalOk');
  const cancel = document.getElementById('modalCancel');
  const close = document.getElementById('modalClose');
  titleEl.textContent = title;
  body.innerHTML = `<div id="listContainer" style="display:grid; gap:8px"></div>`;
  const listRoot = body.querySelector('#listContainer');
  listRoot.innerHTML = items.map(renderItem).join('');
  scrim.classList.add('modal-show');
  scrim.style.display = 'flex';
  scrim.setAttribute('aria-hidden','false');
  return new Promise((resolve)=>{
    function cleanup(res){ scrim.classList.remove('modal-show'); scrim.style.display='none'; scrim.setAttribute('aria-hidden','true'); ok.onclick = cancel.onclick = close.onclick = null; resolve(res); }
    ok.onclick = ()=>cleanup({ ok:false });
    cancel.onclick = ()=>cleanup({ ok:false });
    close.onclick = ()=>cleanup({ ok:false });
  });
}
