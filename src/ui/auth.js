export function renderAuth(root){
	root.innerHTML = `
	  <div style="display:grid; place-items:center; min-height:60vh">
	    <div class="panel" style="width:min(420px,92vw); padding:18px; border-radius:12px; display:grid; gap:12px">
	      <div style="font-weight:700; font-size:18px">Welcome to HIve</div>
	      <div class="field"><label>Email</label><input id="authEmail" placeholder="you@company.com" /></div>
	      <div class="field"><label>Password</label><input id="authPass" type="password" placeholder="********" /></div>
	      <div class="muted" id="authMsg" style="font-size:12px"></div>
	      <div style="display:flex; gap:8px; justify-content:flex-end">
	        <button class="button" id="loginBtn">Log in</button>
	        <button class="button primary" id="signupBtn">Create account</button>
	      </div>
	    </div>
	  </div>
	`;
	(async()=>{
	  const { auth_signIn, auth_signUp } = await import('../lib/supabase.js');
	  const emailEl = root.querySelector('#authEmail');
	  const passEl = root.querySelector('#authPass');
	  const msg = root.querySelector('#authMsg');
	  async function doAuth(kind){
	    const email = (emailEl?.value||'').trim();
	    const password = passEl?.value||'';
	    if (!email || !password){ msg.textContent='Enter email and password'; return; }
	    try{
	      if (kind==='login'){
	        await auth_signIn(email,password);
	        location.reload();
	      } else {
	        const res = await auth_signUp(email,password);
	        msg.textContent = 'Account created. If email confirmation is required, please check your inbox.';
	      }
	    }catch(e){
	      const errMsg = (e && (e.message||e.error_description||e.error)) || 'Auth failed';
	      msg.textContent = errMsg;
	      if (/confirm/i.test(errMsg) || /SMTP/i.test(errMsg) || /signups.*disabled/i.test(errMsg)){
	        msg.textContent = errMsg + ' — Owner: in Supabase, enable email/password signups and either configure SMTP or disable email confirmations.';
	      }
	    }
	  }
	  root.querySelector('#loginBtn')?.addEventListener('click', ()=>doAuth('login'));
	  root.querySelector('#signupBtn')?.addEventListener('click', ()=>doAuth('signup'));
	})();
}


