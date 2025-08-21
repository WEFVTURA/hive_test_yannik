// Simple progress overlay/toast
export function showProgress(options){
  const { id = `p_${Date.now()}`, label = 'Working…', determinate = true } = options||{};
  let host = document.querySelector('.toasts');
  if (!host){ host = document.createElement('div'); host.className='toasts'; document.body.appendChild(host); }
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('data-progress-id', id);
  el.innerHTML = `
    <div class="progress-row">
      <div class="progress-label">${label}</div>
      <div class="progress-perc" aria-live="polite">${determinate? '0%' : ''}</div>
    </div>
    <div class="progress-bar ${determinate? '' : 'indeterminate'}"><span style="width:0%"></span></div>
  `;
  host.appendChild(el);
  return id;
}

export function updateProgress(id, percent, label){
  const el = document.querySelector(`.toast[data-progress-id="${id}"]`);
  if (!el) return;
  if (typeof label === 'string'){ const l = el.querySelector('.progress-label'); if(l) l.textContent = label; }
  const bar = el.querySelector('.progress-bar');
  const span = el.querySelector('.progress-bar > span');
  const perc = el.querySelector('.progress-perc');
  if (bar) bar.classList.remove('indeterminate');
  if (span){ span.style.width = `${Math.max(0, Math.min(100, percent))}%`; }
  if (perc){ perc.textContent = `${Math.round(Math.max(0, Math.min(100, percent)))}%`; }
}

export function completeProgress(id, success=true, autohideMs=1500){
  const el = document.querySelector(`.toast[data-progress-id="${id}"]`);
  if (!el) return;
  updateProgress(id, 100);
  el.classList.add(success? 'success':'error');
  setTimeout(()=>{ try{ el.remove(); }catch{} }, autohideMs);
}


