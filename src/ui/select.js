// Lightweight Shadcn-like custom select (progressive enhancement)
// Enhances native <select> elements with an accessible, styled dropdown without breaking forms

/**
 * Enhance all <select> elements inside the given root. Idempotent.
 * - Keeps the original <select> for value/state and events
 * - Renders a trigger button and a dropdown menu for consistent styling
 */
export function enhanceSelects(root = document){
  try{
    const selects = Array.from(root.querySelectorAll('select')).filter(s=>!s.__enhanced);
    for (const sel of selects){
      enhanceOne(sel);
    }
  }catch{}
}

function enhanceOne(selectEl){
  selectEl.__enhanced = true;
  // Container
  const container = document.createElement('div');
  container.className = 'ui-select';
  // Preserve width
  const computedWidth = getComputedStyle(selectEl).width;
  if (computedWidth && computedWidth !== 'auto'){ container.style.width = computedWidth; }

  // Trigger
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'ui-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const caret = document.createElement('span'); caret.className='ui-select-caret'; caret.textContent='▾';

  const label = document.createElement('span');
  label.className = 'ui-select-label';
  function syncLabel(){
    const opt = selectEl.options[selectEl.selectedIndex];
    label.textContent = opt ? opt.textContent : '';
  }
  syncLabel();
  trigger.appendChild(label); trigger.appendChild(caret);

  // Menu
  const menu = document.createElement('div');
  menu.className = 'ui-select-menu';
  menu.setAttribute('role','listbox');

  function rebuildMenu(){
    menu.innerHTML = '';
    Array.from(selectEl.options).forEach((opt, idx)=>{
      const item = document.createElement('div');
      item.className = 'ui-option';
      item.setAttribute('role','option');
      item.setAttribute('data-value', opt.value);
      item.textContent = opt.textContent;
      if (opt.selected){ item.setAttribute('aria-selected','true'); }
      item.addEventListener('click', ()=>{
        selectEl.value = opt.value;
        selectEl.dispatchEvent(new Event('change', { bubbles:true }));
        close();
      });
      menu.appendChild(item);
    });
  }
  rebuildMenu();

  function open(){ 
    container.classList.add('open'); 
    trigger.setAttribute('aria-expanded','true'); 
    positionMenu();
    window.addEventListener('scroll', positionMenu, true);
    window.addEventListener('resize', positionMenu);
  }
  function close(){ 
    container.classList.remove('open'); 
    trigger.setAttribute('aria-expanded','false'); 
    syncSelection(); 
    window.removeEventListener('scroll', positionMenu, true);
    window.removeEventListener('resize', positionMenu);
  }
  function toggle(){ if(container.classList.contains('open')) close(); else open(); }
  function syncSelection(){
    syncLabel();
    const val = selectEl.value;
    menu.querySelectorAll('.ui-option').forEach(el=>{
      const on = el.getAttribute('data-value')===val; el.setAttribute('aria-selected', on?'true':'false');
    });
  }
  function positionMenu(){
    try{
      const r = trigger.getBoundingClientRect();
      // Use fixed positioning so the menu can escape overflow/stacking
      menu.style.position = 'fixed';
      menu.style.minWidth = Math.max(r.width, 160) + 'px';
      const vpH = window.innerHeight || document.documentElement.clientHeight;
      const spaceBelow = vpH - r.bottom;
      const spaceAbove = r.top;
      const openUp = spaceBelow < 220 && spaceAbove > spaceBelow; // prefer up if below is tight
      const maxH = Math.min(280, (openUp ? spaceAbove : spaceBelow) - 12);
      menu.style.maxHeight = (maxH>120?maxH:120) + 'px';
      if (openUp){
        container.classList.add('drop-up');
        menu.style.top = 'auto';
        menu.style.bottom = (vpH - r.top + 6) + 'px';
      } else {
        container.classList.remove('drop-up');
        menu.style.bottom = 'auto';
        menu.style.top = (r.bottom + 6) + 'px';
      }
      // Horizontal clamping
      let left = r.left;
      const vpW = window.innerWidth || document.documentElement.clientWidth;
      const menuW = Math.max(r.width, 160);
      if (left + menuW + 12 > vpW){ left = Math.max(12, vpW - menuW - 12); }
      menu.style.left = left + 'px';
    }catch{}
  }

  trigger.addEventListener('click', toggle);
  document.addEventListener('click', (e)=>{ if(!container.contains(e.target)) close(); });
  selectEl.addEventListener('change', syncSelection);

  // Hide native select and insert UI
  selectEl.style.position = 'absolute';
  selectEl.style.opacity = '0';
  selectEl.style.pointerEvents = 'none';
  selectEl.style.inset = '0 auto auto 0';

  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.style.display = 'inline-block';
  wrapper.style.width = computedWidth || 'auto';

  const parent = selectEl.parentNode;
  // If wrapped in legacy .select-wrap, mark it to suppress its caret
  if (parent && parent.classList && parent.classList.contains('select-wrap')){
    parent.classList.add('select-wrap--enhanced');
  }
  parent.insertBefore(wrapper, selectEl);
  wrapper.appendChild(selectEl);
  container.appendChild(trigger);
  container.appendChild(menu);
  wrapper.appendChild(container);

  // Mutation observer: reflect dynamic option changes
  const mo = new MutationObserver(()=>{ rebuildMenu(); syncSelection(); });
  mo.observe(selectEl, { childList:true, subtree:true, attributes:true });
}

// Global initializer with MutationObserver to catch late-mounted selects (modals/routes)
export function initSelectEnhancer(){
  enhanceSelects(document);
  try{
    const obs = new MutationObserver((muts)=>{
      for (const m of muts){
        if (m.addedNodes && m.addedNodes.length){
          m.addedNodes.forEach(n=>{ if (n.nodeType===1) enhanceSelects(n); });
        }
      }
    });
    obs.observe(document.documentElement, { childList:true, subtree:true });
  }catch{}
}


