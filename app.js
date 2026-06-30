// ──────────────────────────────────────────────────────────────────────────
// QUIZ LIVE — app logic
// Uses Firebase Realtime Database for cross-device sync.
// ──────────────────────────────────────────────────────────────────────────

let role = null, myName = null, sessionCode = null, activeHostTab = 'build';
let localQs = [];
let liveState = null;
let selQ = null;
let sessionRef = null; // firebase ref for the active session
let myDeviceId = localStorage.getItem('quiz_device_id') || (()=>{
  const id = 'd_'+Math.random().toString(36).slice(2,10);
  localStorage.setItem('quiz_device_id', id);
  return id;
})();

// Check Firebase config is filled in
window.addEventListener('DOMContentLoaded', ()=>{
  try{
    if(!firebaseConfig || firebaseConfig.apiKey === 'YOUR_API_KEY'){
      document.getElementById('setup-banner').style.display='block';
    }
  } catch(e){
    document.getElementById('setup-banner').style.display='block';
  }
});

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if(id==='s-host-setup') loadMySessions();
}
function closeModal(id){ document.getElementById(id).style.display='none'; }
function mk(tag,cls,attrs){
  const el=document.createElement(tag);
  if(cls) el.className=cls;
  if(attrs) Object.entries(attrs).forEach(([k,v])=>{ if(k==='ariaHidden') el.setAttribute('aria-hidden',v); else el[k]=v; });
  return el;
}
function setTxt(id,v){ const e=document.getElementById(id); if(e) e.textContent=v; }
function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.style.display='block';
  clearTimeout(t._t); t._t=setTimeout(()=>{ t.style.display='none'; }, 2500);
}

// ── BLANK SESSION SHAPE ───────────────────────────────────────────────────
function blankLive(code, name){
  return {
    code, name: name||'Quiz', status:'waiting', currentQ:-1,
    questions:[], participants:{}, answers:{}, revealAnswers:false, created: Date.now()
  };
}

// ── SESSION CREATION (HOST) ───────────────────────────────────────────────
async function createSession(){
  const btn = document.getElementById('create-session-btn');
  const errEl = document.getElementById('create-session-err');
  if(errEl) errEl.textContent = '';
  if(btn){ btn.disabled = true; btn.textContent = 'Creating…'; }

  try{
    if(typeof db === 'undefined' || !db){
      throw new Error('Firebase database is not initialized — check firebase-config.js');
    }

    const name = (document.getElementById('session-name-input').value||'').trim() || 'Quiz';
    const code = String(Math.floor(100000 + Math.random()*900000));
    const state = blankLive(code, name);

    await db.ref('sessions/'+code).set(state);

    const mine = JSON.parse(localStorage.getItem('quiz_my_sessions')||'[]');
    mine.unshift({code, name, created: Date.now()});
    localStorage.setItem('quiz_my_sessions', JSON.stringify(mine.slice(0,10)));

    openHostSession(code, state);
  } catch(e){
    console.error('createSession failed:', e);
    if(errEl) errEl.textContent = 'Failed to create session: ' + (e.message || e);
  } finally {
    if(btn){ btn.disabled = false; btn.textContent = 'Create session'; }
  }
}

async function resumeSession(code){
  const snap = await db.ref('sessions/'+code).get();
  if(!snap.exists()){ showToast('Session not found — it may have expired'); return; }
  openHostSession(code, snap.val());
}

function openHostSession(code, state){
  sessionCode = code;
  liveState = state;
  localQs = state.questions || [];
  role = 'host';
  document.getElementById('h-session-name').textContent = state.name;
  document.getElementById('h-code-inline').textContent = code;
  showScreen('s-host');
  renderQList();
  hTab('run');
  attachSessionListener(code);
}

function loadMySessions(){
  const el = document.getElementById('my-sessions-list');
  const mine = JSON.parse(localStorage.getItem('quiz_my_sessions')||'[]');
  if(!mine.length){ el.innerHTML = '<p class="sub">No previous sessions.</p>'; return; }
  el.innerHTML = '';
  mine.forEach(s=>{
    const row = mk('div'); row.style.cssText='display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)';
    const info = mk('div'); info.style.flex='1';
    info.innerHTML = `<div style="font-weight:500">${s.name}</div><div style="font-size:12px;color:var(--text-muted)">Code: ${s.code} · ${new Date(s.created).toLocaleDateString()}</div>`;
    const btn = mk('button','sml pri'); btn.textContent='Resume'; btn.onclick=()=>resumeSession(s.code);
    row.appendChild(info); row.appendChild(btn); el.appendChild(row);
  });
}

// ── CODE / QR MODAL ───────────────────────────────────────────────────────
function showCodeModal(){
  document.getElementById('modal-code').style.display='flex';
  document.getElementById('modal-code-display').textContent = sessionCode;
  const qrEl = document.getElementById('modal-qr');
  qrEl.innerHTML='';
  try{
    new QRCode(qrEl, {
      text: window.location.href.split('?')[0] + '?join=' + sessionCode,
      width:180, height:180, colorDark:'#000', colorLight:'#fff', correctLevel: QRCode.CorrectLevel.M
    });
  } catch(e){ qrEl.innerHTML = '<p class="sub">QR unavailable</p>'; }
  updateCodeModal();
}
function updateCodeModal(){
  if(!liveState) return;
  const parts = Object.keys(liveState.participants||{});
  document.getElementById('modal-pcount-display').textContent = parts.length+' participant'+(parts.length!==1?'s':'')+' joined';
  document.getElementById('modal-plist').innerHTML = parts.map(n=>`<div class="plist-item">${n}</div>`).join('');
}

// ── HOST TABS ──────────────────────────────────────────────────────────────
function hTab(t){
  activeHostTab = t;
  ['build','run','lb'].forEach(x=>{
    document.getElementById('ht-'+x).classList.toggle('on', x===t);
    document.getElementById('hp-'+x).style.display = x===t ? '' : 'none';
  });
  if(t==='run' && liveState) renderRunPanel(true);
  if(t==='lb'  && liveState) renderLB('h-lb', null);
}

// ── QUESTION BUILDER ───────────────────────────────────────────────────────
function renderQList(){
  const el = document.getElementById('qlist');
  const cnt = document.getElementById('qcount');
  if(cnt) cnt.textContent = localQs.length ? `(${localQs.length})` : '';
  if(!localQs.length){ el.innerHTML = '<p class="sub">No questions yet.</p>'; return; }
  el.innerHTML = '';
  localQs.forEach((q,i)=>{
    const d = mk('div', 'qrow'+(selQ===i?' sel':''));
    const num = mk('span','',{style:'font-size:13px;color:var(--text-muted);min-width:20px'}); num.textContent = i+1;
    const txt = mk('span','',{style:'flex:1;font-size:15px'}); txt.innerHTML = q.text || '<em style="color:var(--text-muted)">Untitled</em>';
    const ts  = mk('span','',{style:'font-size:13px;color:var(--text-muted)'}); ts.textContent = q.timeLimit+'s';
    const del = mk('button','sml',{style:'color:var(--danger)'}); del.textContent='Delete';
    del.onclick = e=>{ e.stopPropagation(); delQ(i); };
    d.appendChild(num); d.appendChild(txt);
    if(q.img){ const tag=mk('span','',{style:'font-size:12px;color:var(--text-muted)'}); tag.textContent='📷'; d.appendChild(tag); }
    d.appendChild(ts); d.appendChild(del);
    d.onclick = ()=>openEditor(i);
    el.appendChild(d);
  });
}

function delQ(i){
  localQs.splice(i,1);
  if(selQ===i || selQ>=localQs.length){ selQ=null; document.getElementById('qeditor').innerHTML=''; }
  renderQList();
}
function addQ(){
  localQs.push({id:Date.now(), text:'', choices:['','','',''], correct:0, img:null, timeLimit:20});
  renderQList();
  openEditor(localQs.length-1);
}

function openEditor(i){
  selQ = i; renderQList();
  const q = localQs[i];
  const ed = document.getElementById('qeditor'); ed.innerHTML='';
  const card = mk('div','card');

  const title = mk('h2'); title.textContent = 'Question '+(i+1); card.appendChild(title);

  appendLabel(card,'Question text',{marginTop:'14px'});
  const ta = mk('textarea'); ta.id='ed-text'; ta.placeholder='Type your question…'; ta.value=q.text||''; card.appendChild(ta);

  appendLabel(card,'Image (optional)',{marginTop:'16px'});
  const dz = mk('div','drop-zone');
  dz.innerHTML = '<div style="font-size:14px;color:var(--text-secondary)">Click to upload an image</div><div style="font-size:12px;color:var(--text-muted);margin-top:4px">JPG, PNG, GIF — max 700 KB recommended</div>';
  dz.onclick = ()=>{ const fi=document.getElementById('img-file-input'); fi.value=''; fi.onchange=e=>handleImg(i,e); fi.click(); };
  card.appendChild(dz);
  const prev = mk('div'); prev.id='img-preview-'+i; prev.style.marginTop='8px';
  if(q.img) buildImgPreview(prev, q.img, i);
  card.appendChild(prev);

  appendLabel(card,'Answer choices — tick the correct one',{marginTop:'16px'});
  q.choices.forEach((c,ci)=>{
    const row = mk('div','row mt1');
    const radio = mk('input'); radio.type='radio'; radio.name='correct_'+i; radio.value=ci; radio.checked=(q.correct===ci); radio.style.cssText='width:auto;flex:none;accent-color:var(--accent-strong)';
    const lbl = mk('span'); lbl.style.cssText='font-weight:600;min-width:20px;font-size:14px;color:var(--text-secondary)'; lbl.textContent=String.fromCharCode(65+ci);
    const inp = mk('input'); inp.type='text'; inp.value=c||''; inp.placeholder='Choice '+(ci+1); inp.id='ch_'+i+'_'+ci; inp.style.flex='1';
    row.appendChild(radio); row.appendChild(lbl); row.appendChild(inp); card.appendChild(row);
  });

  appendLabel(card,'Time limit (seconds)',{marginTop:'16px'});
  const ti = mk('input'); ti.type='number'; ti.id='ed-time'; ti.value=q.timeLimit; ti.min=5; ti.max=120; ti.style.width='100px'; card.appendChild(ti);

  const sr = mk('div','row mt3');
  const sb = mk('button','pri'); sb.textContent='Save question'; sb.onclick=()=>saveQ(i);
  const sm = mk('span'); sm.id='save-q-msg'; sm.style.cssText='font-size:13px;color:var(--success)';
  sr.appendChild(sb); sr.appendChild(sm); card.appendChild(sr);
  ed.appendChild(card);
}

function appendLabel(parent, text, extraStyle){
  const l = mk('label'); l.textContent = text;
  if(extraStyle) Object.assign(l.style, extraStyle);
  parent.appendChild(l);
}
function buildImgPreview(container, src, i){
  container.innerHTML = '';
  const im = mk('img','qimg'); im.src = src; im.alt='question image'; container.appendChild(im);
  const cb = mk('button','sml red'); cb.style.marginTop='8px'; cb.textContent='Remove image';
  cb.onclick = ()=>clearImg(i); container.appendChild(cb);
}

function handleImg(i, e){
  const file = e.target.files[0]; if(!file) return;
  if(file.size > 1.5*1024*1024){
    alert('Image must be under 1.5 MB. Firebase Realtime Database stores data as text, so large images can slow things down — consider compressing the image first.');
    return;
  }
  const reader = new FileReader();
  reader.onload = ev=>{
    localQs[i].img = ev.target.result;
    const prev = document.getElementById('img-preview-'+i);
    if(prev) buildImgPreview(prev, ev.target.result, i);
    renderQList();
  };
  reader.readAsDataURL(file);
}
function clearImg(i){
  localQs[i].img = null;
  const prev = document.getElementById('img-preview-'+i); if(prev) prev.innerHTML='';
  renderQList();
}
function saveQ(i){
  const q = localQs[i];
  q.text = (document.getElementById('ed-text')?.value||'').trim();
  q.timeLimit = parseInt(document.getElementById('ed-time')?.value) || 20;
  const radio = document.querySelector('input[name="correct_'+i+'"]:checked');
  q.correct = radio ? parseInt(radio.value) : 0;
  for(let ci=0; ci<4; ci++) q.choices[ci] = (document.getElementById('ch_'+i+'_'+ci)?.value||'').trim();
  renderQList();
  const msg = document.getElementById('save-q-msg');
  if(msg){ msg.textContent='Saved!'; setTimeout(()=>{ if(msg) msg.textContent=''; }, 1800); }
}

// ── SAVE / LOAD QUIZ (stored locally in browser, per-host) ───────────────
function showSaveModal(){
  document.getElementById('modal-save').style.display='flex';
  document.getElementById('save-name').value='';
  document.getElementById('save-err').textContent='';
  setTimeout(()=>document.getElementById('save-name').focus(),50);
}
function showLoadModal(){
  document.getElementById('modal-load').style.display='flex';
  renderSavedList();
}
function doSaveQuiz(){
  const name = (document.getElementById('save-name').value||'').trim();
  if(!name){ document.getElementById('save-err').textContent='Enter a name'; return; }
  if(!localQs.length){ document.getElementById('save-err').textContent='No questions to save'; return; }
  const all = JSON.parse(localStorage.getItem('quiz_saved_quizzes')||'{}');
  all[name] = { questions: JSON.parse(JSON.stringify(localQs)), saved: new Date().toLocaleString() };
  localStorage.setItem('quiz_saved_quizzes', JSON.stringify(all));
  closeModal('modal-save');
  showToast(`"${name}" saved`);
}
function renderSavedList(){
  const el = document.getElementById('quiz-list-modal');
  const all = JSON.parse(localStorage.getItem('quiz_saved_quizzes')||'{}');
  const names = Object.keys(all);
  if(!names.length){ el.innerHTML = '<p class="sub">No saved quizzes yet.</p>'; return; }
  el.innerHTML = '';
  names.forEach(name=>{
    const entry = all[name];
    const row = mk('div'); row.style.cssText='display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border)';
    const info = mk('div'); info.style.flex='1';
    info.innerHTML = `<div style="font-weight:500">${name}</div><div style="font-size:12px;color:var(--text-muted)">${entry.questions.length} questions · ${entry.saved}</div>`;
    const lb = mk('button','sml pri'); lb.textContent='Load'; lb.onclick=()=>loadQuiz(name, entry);
    const db_ = mk('button','sml'); db_.style.color='var(--danger)'; db_.textContent='Delete';
    db_.onclick = ()=>{ delete all[name]; localStorage.setItem('quiz_saved_quizzes', JSON.stringify(all)); renderSavedList(); };
    row.appendChild(info); row.appendChild(lb); row.appendChild(db_); el.appendChild(row);
  });
}
function loadQuiz(name, entry){
  localQs = JSON.parse(JSON.stringify(entry.questions));
  selQ = null;
  document.getElementById('qeditor').innerHTML='';
  renderQList();
  closeModal('modal-load');
  showToast(`Loaded "${name}"`);
}

// ── RUN PANEL ──────────────────────────────────────────────────────────────
function renderRunPanel(full){
  const s = liveState; if(!s) return;
  const pcount = Object.keys(s.participants||{}).length;
  const ans = s.answers?.[s.currentQ] || {};
  const acount = Object.keys(ans).length;

  setTxt('r-pcount', pcount);
  setTxt('r-qnum', s.currentQ>=0 ? `${s.currentQ+1}/${s.questions.length}` : '—');
  setTxt('r-resp', s.currentQ>=0 ? acount : '—');
  const rb = document.getElementById('r-badge'); if(rb){ rb.className='badge '+s.status; rb.textContent=s.status; }

  const pb = document.getElementById('ht-pbadge');
  if(pb){ if(pcount>0){ pb.style.display='inline'; pb.textContent=pcount; } else pb.style.display='none'; }

  if(document.getElementById('modal-code').style.display==='flex') updateCodeModal();

  if(!full){ if(s.status==='active') renderChart(); return; }

  const ctrl = document.getElementById('r-ctrl');
  const qd = document.getElementById('r-qdisplay');
  const ch = document.getElementById('r-chart');
  ctrl.innerHTML=''; qd.innerHTML=''; if(ch) ch.innerHTML='';

  if(s.status==='waiting'){
    qd.innerHTML = '<p class="sub">Share your code with participants, then start the quiz once everyone has joined.</p>';
    const b = mk('button','pri'); b.textContent='Start quiz'; b.disabled = !localQs.length; b.onclick=startQuiz; ctrl.appendChild(b);
    const sc = mk('button'); sc.textContent='Show code'; sc.onclick=showCodeModal; ctrl.appendChild(sc);
    if(!localQs.length){
      const hint = mk('div'); hint.style.cssText='width:100%;font-size:13px;color:var(--warning);margin-top:8px';
      hint.textContent = 'Add at least one question in the Build tab before you can start.';
      ctrl.appendChild(hint);
    }

  } else if(s.status==='active'){
    const q = s.questions[s.currentQ];
    if(q){
      const card = mk('div','card');
      if(q.img){ const im=mk('img','qimg'); im.src=q.img; im.alt=''; card.appendChild(im); }
      const qt = mk('div'); qt.style.cssText = `font-size:18px;font-weight:600;margin-top:${q.img?'12px':'0'}`; qt.textContent = q.text||'(no text)'; card.appendChild(qt);
      const qm = mk('div'); qm.style.cssText = 'font-size:13px;color:var(--text-muted);margin-top:8px'; qm.textContent = `Question ${s.currentQ+1} of ${s.questions.length} · ${q.timeLimit}s`; card.appendChild(qm);
      q.choices.forEach((c,ci)=>{
        if(!c) return;
        const isCorrect = s.revealAnswers && ci===q.correct;
        const ab = mk('div','host-choice');
        ab.style.background = isCorrect ? 'var(--success-bg)' : 'var(--surface)';
        ab.style.borderColor = isCorrect ? 'var(--success-strong)' : 'var(--border)';
        ab.style.color = isCorrect ? 'var(--success)' : 'var(--text)';
        ab.style.fontWeight = isCorrect ? '600' : '400';
        const lt = mk('span'); lt.style.fontWeight='600'; lt.textContent = String.fromCharCode(65+ci)+'.'; ab.appendChild(lt);
        const ct = mk('span'); ct.textContent = c; ab.appendChild(ct);
        if(isCorrect){ const ck=mk('span'); ck.style.marginLeft='auto'; ck.textContent='✓'; ab.appendChild(ck); }
        card.appendChild(ab);
      });
      qd.appendChild(card);
    }
    const rv = mk('button'); rv.textContent='Reveal answers'; rv.disabled = s.revealAnswers; rv.onclick=doReveal; ctrl.appendChild(rv);
    const nx = mk('button','pri'); nx.textContent='Next question'; nx.disabled = (s.currentQ >= s.questions.length-1); nx.onclick=doNext; ctrl.appendChild(nx);
    const en = mk('button','red'); en.textContent='End quiz'; en.onclick=doEnd; ctrl.appendChild(en);
    renderChart();

  } else { // done
    qd.innerHTML = '<div class="card" style="color:var(--success);font-size:17px;font-weight:600">Quiz finished!</div>';
    const rs = mk('button'); rs.textContent='New round';
    rs.onclick = ()=>{
      if(confirm('Reset scores and start again?')){
        const reset = blankLive(s.code, s.name);
        reset.questions = s.questions;
        sessionRef.set(reset);
      }
    };
    ctrl.appendChild(rs);
  }
}

function renderChart(){
  const s = liveState; if(!s || s.currentQ<0) return;
  const q = s.questions[s.currentQ]; const el = document.getElementById('r-chart'); if(!q || !el) return;
  const counts = [0,0,0,0];
  const ans = s.answers?.[s.currentQ] || {};
  Object.values(ans).forEach(a=>{ if(typeof a==='number' && a>=0 && a<4) counts[a]++; });
  const total = Object.keys(ans).length;
  el.innerHTML = `<p class="sub">${total} response${total!==1?'s':''}</p>`;
  q.choices.forEach((c,i)=>{
    if(!c) return;
    const pct = total ? Math.round(counts[i]/total*100) : 0;
    const ok = s.revealAnswers && i===q.correct;
    el.innerHTML += `<div style="margin-top:12px">
      <div style="display:flex;justify-content:space-between;font-size:14px">
        <span style="${ok?'color:var(--success);font-weight:600':''}">${String.fromCharCode(65+i)}. ${c}${ok?' ✓':''}</span>
        <span style="color:var(--text-muted)">${counts[i]} (${pct}%)</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="background:${ok?'var(--success-strong)':'var(--accent-strong)'};width:${pct}%"></div></div>
    </div>`;
  });
}

// ── QUIZ CONTROL — write to Firebase, listener updates everyone ──────────
async function startQuiz(){
  liveState.questions = JSON.parse(JSON.stringify(localQs));
  liveState.status = 'active';
  liveState.currentQ = 0;
  liveState.answers = {};
  liveState.revealAnswers = false;
  await sessionRef.set(liveState);
}

async function doReveal(){
  const s = liveState;
  s.revealAnswers = true;
  const q = s.questions[s.currentQ];
  const ans = s.answers?.[s.currentQ] || {};
  Object.entries(ans).forEach(([name,a])=>{
    if(a === q.correct){
      if(!s.participants[name]) s.participants[name] = {score:0};
      s.participants[name].score = (s.participants[name].score||0) + 1;
    }
  });
  await sessionRef.set(s);
}

async function doNext(){
  const s = liveState;
  if(s.currentQ >= s.questions.length-1) return;
  s.currentQ++;
  s.revealAnswers = false;
  await sessionRef.set(s);
}

async function doEnd(){
  liveState.status = 'done';
  await sessionRef.set(liveState);
}

function renderLB(elId, highlightName){
  const el = document.getElementById(elId); if(!el || !liveState) return;
  const sorted = Object.entries(liveState.participants||{}).sort((a,b)=>(b[1].score||0)-(a[1].score||0));
  if(!sorted.length){ el.innerHTML = '<p class="sub">No participants yet.</p>'; return; }
  const medals = ['🥇','🥈','🥉'];
  el.innerHTML = sorted.map(([name,p],i)=>`
    <div class="lb-row${name===highlightName?' me':''}">
      <span style="font-size:20px;min-width:30px">${medals[i]||i+1}</span>
      <span style="flex:1;font-weight:600">${name}${name===highlightName?' <span style="font-size:12px;color:var(--accent)">(you)</span>':''}</span>
      <span style="font-weight:600;color:var(--accent)">${p.score||0} pt${(p.score||0)!==1?'s':''}</span>
    </div>`).join('');
}

// ── JOIN (PARTICIPANT) ─────────────────────────────────────────────────────
async function doJoin(){
  const code = (document.getElementById('join-code').value||'').trim();
  const name = (document.getElementById('join-name').value||'').trim();
  const err = document.getElementById('join-err');
  err.textContent='';
  if(!code || code.length!==6){ err.textContent='Enter the 6-digit code'; return; }
  if(!name){ err.textContent='Enter your name'; return; }

  const snap = await db.ref('sessions/'+code).get();
  if(!snap.exists()){ err.textContent='Session not found — check the code'; return; }
  const s = snap.val();

  const participants = s.participants || {};
  if(Object.keys(participants).length >= 50 && !participants[name]){
    err.textContent = 'Session is full (50 max)'; return;
  }

  await db.ref(`sessions/${code}/participants/${name}`).set({
    score: participants[name]?.score || 0,
    joined: Date.now()
  });

  myName = name; sessionCode = code; role = 'participant';
  document.getElementById('p-name-hdr').textContent = name;
  document.getElementById('p-session-hdr').textContent = '· ' + s.name;
  showScreen('s-part');
  attachSessionListener(code);
}

// auto-fill code from ?join=XXXXXX in URL (from QR code scan)
window.addEventListener('DOMContentLoaded', ()=>{
  const params = new URLSearchParams(window.location.search);
  const joinCode = params.get('join');
  if(joinCode){
    showScreen('s-join');
    document.getElementById('join-code').value = joinCode.replace(/[^0-9]/g,'').slice(0,6);
    document.getElementById('join-name').focus();
  }
});

// ── PARTICIPANT VIEW ───────────────────────────────────────────────────────
function pTab(t){
  ['quiz','lb'].forEach(x=>{
    document.getElementById('pt-'+x).classList.toggle('on', x===t);
    document.getElementById('pp-'+x).style.display = x===t ? '' : 'none';
  });
  if(t==='lb') renderLB('p-lb', myName);
}

function renderPView(){
  const s = liveState; if(!s) return;
  const el = document.getElementById('p-main'); if(!el) return;

  if(s.status==='waiting'){
    el.innerHTML = `<div class="card"><div style="font-size:17px;font-weight:600">Waiting for host to start…</div><p class="sub" style="margin-top:6px">You're in! Sit tight.</p></div>`;
    return;
  }
  if(s.status==='done'){
    const sorted = Object.entries(s.participants||{}).sort((a,b)=>(b[1].score||0)-(a[1].score||0));
    const pos = sorted.findIndex(([nm])=>nm===myName) + 1;
    const sc = s.participants?.[myName]?.score || 0;
    el.innerHTML = `<div class="card"><div style="font-size:19px;font-weight:600;color:var(--success)">Quiz complete!</div><div style="margin-top:10px;font-size:16px">You finished <strong>#${pos}</strong> with <strong>${sc} point${sc!==1?'s':''}</strong></div></div>`;
    return;
  }

  const q = s.questions?.[s.currentQ];
  if(!q){ el.innerHTML = '<div class="card"><p class="sub">Loading question…</p></div>'; return; }

  const myAns = (s.answers?.[s.currentQ] || {})[myName];
  const answered = myAns !== undefined;
  const reveal = s.revealAnswers;

  el.innerHTML = '';
  const card = mk('div','card');
  if(q.img){ const im=mk('img','qimg'); im.src=q.img; im.alt='question image'; card.appendChild(im); }
  const qt = mk('div'); qt.style.cssText = `font-size:17px;font-weight:600;margin-top:${q.img?'12px':'0'}`; qt.textContent = q.text; card.appendChild(qt);
  const qm = mk('div'); qm.style.cssText = 'font-size:13px;color:var(--text-muted);margin-top:6px'; qm.textContent = `Question ${s.currentQ+1} of ${s.questions.length}`; card.appendChild(qm);
  el.appendChild(card);

  q.choices.forEach((c,i)=>{
    if(!c) return;
    let cls = 'ans-btn';
    if(answered && myAns===i) cls += ' picked';
    if(reveal && i===q.correct) cls += ' correct';
    if(reveal && answered && myAns===i && myAns!==q.correct) cls += ' wrong';
    const btn = mk('button', cls);
    const lt = mk('span','cletter'); lt.textContent = String.fromCharCode(65+i); btn.appendChild(lt);
    const lb = mk('span'); lb.textContent = c; btn.appendChild(lb);
    if(reveal && i===q.correct){ const ck=mk('span'); ck.style.marginLeft='auto'; ck.textContent='✓'; btn.appendChild(ck); }
    btn.disabled = (answered && !reveal) || reveal;
    btn.onclick = ()=>submitAns(i);
    el.appendChild(btn);
  });

  if(answered && !reveal){
    const m = mk('div'); m.style.cssText='margin-top:12px;font-size:14px;color:var(--success)';
    m.textContent='Answer locked in — waiting for host'; el.appendChild(m);
  }
  if(reveal){
    const ok = answered && myAns===q.correct;
    const m = mk('div'); m.style.cssText=`margin-top:12px;font-size:16px;font-weight:600;color:${ok?'var(--success)':'var(--danger)'}`;
    m.textContent = ok ? 'Correct! +1 point' : (answered ? 'Incorrect' : "You didn't answer in time");
    el.appendChild(m);
  }
}

async function submitAns(idx){
  const s = liveState; if(!s) return;
  if((s.answers?.[s.currentQ]||{})[myName] !== undefined) return;
  await db.ref(`sessions/${sessionCode}/answers/${s.currentQ}/${myName}`).set(idx);
}

// ── REALTIME LISTENER — replaces polling entirely ─────────────────────────
function attachSessionListener(code){
  if(sessionRef) sessionRef.off();
  sessionRef = db.ref('sessions/'+code);
  sessionRef.on('value', snap=>{
    const s = snap.val();
    if(!s) return;
    liveState = s;
    s.questions = s.questions || [];
    s.participants = s.participants || {};
    s.answers = s.answers || {};

    if(role==='host'){
      if(activeHostTab==='run') renderRunPanel(true);
      else if(activeHostTab==='lb') renderLB('h-lb', null);
      const pb = document.getElementById('ht-pbadge');
      const pcount = Object.keys(s.participants).length;
      if(pb){ if(pcount>0){ pb.style.display='inline'; pb.textContent=pcount; } else pb.style.display='none'; }
      if(document.getElementById('modal-code').style.display==='flex') updateCodeModal();
    } else if(role==='participant'){
      const ps = document.getElementById('p-sync'); if(ps){ ps.textContent='● live'; ps.style.color='var(--success)'; }
      if(document.getElementById('pt-quiz').classList.contains('on')) renderPView();
      else renderLB('p-lb', myName);
    }
  }, err=>{
    console.error('Firebase listener error', err);
    const ps = document.getElementById('p-sync'); if(ps){ ps.textContent='● connection error'; ps.style.color='var(--danger)'; }
  });
}
