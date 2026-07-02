// ──────────────────────────────────────────────────────────────────────────
// QUIZ LIVE — app logic
// Uses Firebase Realtime Database for cross-device sync.
// ──────────────────────────────────────────────────────────────────────────

let role = null, myName = null, sessionCode = null, activeHostTab = 'build';
let localQs = [];
let currentQuizName = null; // tracks the name of the currently loaded/saved quiz for auto-save
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
function exportQuizPDF(){
  if(!localQs.length){ showToast('No questions to export'); return; }

  const sessionName = document.getElementById('h-session-name')?.textContent || 'Quiz';
  const letters = ['A','B','C','D','E','F'];

  const rows = localQs.map((q,i)=>{
    const choices = q.choices.filter(c=>c);
    const choiceItems = choices.map((c,ci)=>
      `<span class="choice-item"><span class="letter">${letters[ci]}</span>${c}</span>`
    ).join('');

    return `
      <div class="question-block">
        <div class="question-row">
          <div class="question-left">
            <div class="question-header">
              <span class="q-num">Q${i+1}</span>
              <span class="q-text">${q.text || '(no question text)'}</span>
            </div>
            <div class="choices-row">${choiceItems}</div>
          </div>
          <div class="mark-cell"><div class="mark-box"></div></div>
        </div>
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>${sessionName} — Quiz Sheet</title>
<style>
  *{ box-sizing:border-box; margin:0; padding:0; }
  body{ font-family: Arial, Helvetica, sans-serif; font-size:13px; color:#111; padding:28px 32px; }
  h1{ font-size:20px; font-weight:700; margin-bottom:4px; }
  .subtitle{ font-size:12px; color:#666; margin-bottom:24px; }
  .question-block{ margin-bottom:12px; page-break-inside:avoid; border:1px solid #ddd; border-radius:6px; overflow:hidden; }
  .question-row{ display:flex; align-items:center; gap:0; }
  .question-left{ flex:1; padding:10px 14px; }
  .question-header{ display:flex; align-items:flex-start; gap:10px; margin-bottom:7px; }
  .q-num{ font-weight:700; font-size:14px; color:#185fa5; white-space:nowrap; min-width:28px; }
  .q-text{ font-weight:600; font-size:14px; line-height:1.4; }
  .choices-row{ display:flex; flex-wrap:wrap; gap:6px 24px; padding-left:38px; }
  .choice-item{ display:inline-flex; align-items:center; gap:6px; font-size:13px; }
  .letter{ display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:50%; background:#e8e8e8; font-size:11px; font-weight:700; flex-shrink:0; }
  .mark-cell{ width:56px; min-width:56px; border-left:1px solid #ddd; display:flex; align-items:center; justify-content:center; align-self:stretch; }
  .mark-box{ width:32px; height:32px; border:2px solid #bbb; border-radius:4px; }
  .participant-name{ margin-top:28px; display:flex; align-items:center; gap:12px; font-size:13px; }
  .name-line{ flex:1; border-bottom:1.5px solid #888; height:24px; }
  .score-box{ border:1.5px solid #888; border-radius:4px; padding:4px 16px; font-size:13px; white-space:nowrap; }
  @media print{
    body{ padding:18px 22px; }
    @page{ margin:1.2cm; size:A4; }
    .question-block{ page-break-inside:avoid; }
  }
</style>
</head>
<body>
  <h1>${sessionName}</h1>
  <div class="subtitle">Quiz sheet · ${new Date().toLocaleDateString()} · ${localQs.length} question${localQs.length!==1?'s':''}</div>
  <div class="participant-name">
    <span>Name:</span><div class="name-line"></div>
    <div class="score-box">Score: &nbsp;&nbsp;&nbsp;&nbsp; / ${localQs.length}</div>
  </div>
  <div style="margin-top:22px">${rows}</div>
</body>
</html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(()=>{
    // suppress the about:blank URL from the print footer
    win.document.title = sessionName;
    win.print();
  }, 400);
}

function exportHostPDF(){
  if(!localQs.length){ showToast('No questions to export'); return; }

  const sessionName = document.getElementById('h-session-name')?.textContent || 'Quiz';
  const letters = ['A','B','C','D','E','F'];

  const rows = localQs.map((q,i)=>{
    const choices = q.choices.filter(c=>c);

    const imgHtml = q.img
      ? `<img src="${q.img}" alt="question image" style="max-width:100%;max-height:180px;object-fit:contain;display:block;margin:10px 0;border-radius:6px"/>`
      : '';

    const choiceRows = choices.map((c,ci)=>{
      const isCorrect = ci === q.correct;
      return `<tr style="${isCorrect?'background:#eaf3de;':''}">
        <td style="padding:7px 14px;border-bottom:1px solid #eee;display:flex;align-items:center;gap:10px">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${isCorrect?'#3B6D11':'#e8e8e8'};color:${isCorrect?'#fff':'#111'};font-size:12px;font-weight:700;flex-shrink:0">${letters[ci]}</span>
          <span style="${isCorrect?'font-weight:700;color:#27500a':''}"> ${c}</span>
          ${isCorrect?'<span style="margin-left:auto;font-size:12px;color:#27500a;background:#c6e9a0;border-radius:10px;padding:1px 8px;white-space:nowrap">✓ correct</span>':''}
        </td>
      </tr>`;
    }).join('');

    return `
      <div style="margin-bottom:20px;page-break-inside:avoid;border:1px solid #ddd;border-radius:8px;overflow:hidden">
        <div style="background:#f0f4ff;padding:10px 14px;border-bottom:1px solid #ddd;display:flex;align-items:flex-start;gap:10px">
          <span style="font-weight:700;font-size:15px;color:#185fa5;min-width:30px">Q${i+1}</span>
          <span style="font-weight:600;font-size:15px;line-height:1.4">${q.text||'(no question text)'}</span>
          <span style="margin-left:auto;font-size:11px;color:#888;white-space:nowrap;padding-top:2px">${q.timeLimit}s</span>
        </div>
        ${imgHtml ? `<div style="padding:0 14px">${imgHtml}</div>` : ''}
        <table style="width:100%;border-collapse:collapse">
          <tbody>${choiceRows}</tbody>
        </table>
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>${sessionName} — Host Answer Sheet</title>
<style>
  *{ box-sizing:border-box; margin:0; padding:0; }
  body{ font-family:Arial,Helvetica,sans-serif; font-size:13px; color:#111; padding:28px 32px; }
  h1{ font-size:20px; font-weight:700; margin-bottom:4px; }
  .subtitle{ font-size:12px; color:#666; margin-bottom:24px; }
  @media print{
    body{ padding:18px 22px; }
    @page{ margin:1.2cm; size:A4; }
  }
</style>
</head>
<body>
  <h1>${sessionName} — Host Answer Sheet</h1>
  <div class="subtitle">Confidential · ${new Date().toLocaleDateString()} · ${localQs.length} question${localQs.length!==1?'s':''}</div>
  <div>${rows}</div>
</body>
</html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(()=>{ win.document.title = sessionName+' — Host Answer Sheet'; win.print(); }, 400);
}

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
  if(!libraryPassphraseHash){
    const proceed = confirm(
      "You haven't unlocked a quiz library passphrase yet.\n\n" +
      "Any quiz you save during this session will only be saved on this device, not shared with other hosts.\n\n" +
      "Click OK to continue anyway, or Cancel to go back and unlock a passphrase first."
    );
    if(!proceed) return;
  }

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

    // write session metadata to root, waiting state to state subnode
    await db.ref('sessions/'+code).set({ code, name, created: Date.now() });
    const waitingState = { status:'waiting', currentQ:-1, answers:{}, participants:{}, revealAnswers:false };
    await db.ref('sessions/'+code+'/state').set(waitingState);

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
  // fetch existing questions if the quiz was previously started
  try{
    const qsnap = await db.ref('sessions/'+code+'/questions').get();
    if(qsnap.exists()) localQs = qsnap.val();
  } catch(e){ console.warn('Could not load questions', e); }
}

function openHostSession(code, rootData){
  sessionCode = code;
  // liveState is built from the state subnode; for a new session that's the waiting state
  liveState = { status:'waiting', currentQ:-1, answers:{}, participants:{},
                revealAnswers:false, name: rootData.name||'Quiz', code };
  localQs = [];
  role = 'host';
  document.getElementById('h-session-name').textContent = state.name;
  document.getElementById('h-code-inline').textContent = code;
  showScreen('s-host');
  renderQList();
  hTab('build');
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
    const delBtn = mk('button','sml'); delBtn.style.color='var(--danger)'; delBtn.textContent='Remove';
    delBtn.onclick = ()=>removeMySession(s.code, s.name);
    row.appendChild(info); row.appendChild(btn); row.appendChild(delBtn); el.appendChild(row);
  });
  if(mine.length > 1){
    const clearRow = mk('div'); clearRow.className='mt1';
    const clearBtn = mk('button','sml'); clearBtn.style.color='var(--danger)'; clearBtn.textContent='Clear all';
    clearBtn.onclick = clearAllMySessions;
    clearRow.appendChild(clearBtn); el.appendChild(clearRow);
  }
}

// Permanently deletes the session from Firebase (so no one can rejoin with
// that code anymore) and removes it from this device's resume list.
async function removeMySession(code, name){
  const ok = confirm(`Permanently delete "${name||code}"?\n\nThis removes it from your list and deletes the session data from the database — anyone with the code will no longer be able to join or resume it. This can't be undone.`);
  if(!ok) return;

  try{
    await db.ref('sessions/'+code).remove();
  } catch(e){
    console.error('Failed to delete session from Firebase', e);
    showToast('Could not delete from the database — removed from your list only.');
  }

  const mine = JSON.parse(localStorage.getItem('quiz_my_sessions')||'[]');
  const filtered = mine.filter(s=>s.code !== code);
  localStorage.setItem('quiz_my_sessions', JSON.stringify(filtered));
  loadMySessions();
}

async function clearAllMySessions(){
  const mine = JSON.parse(localStorage.getItem('quiz_my_sessions')||'[]');
  const ok = confirm(`Permanently delete all ${mine.length} session${mine.length!==1?'s':''} in this list?\n\nThis deletes their data from the database too — no one will be able to rejoin or resume them. This can't be undone.`);
  if(!ok) return;

  for(const s of mine){
    try{ await db.ref('sessions/'+s.code).remove(); }
    catch(e){ console.error('Failed to delete session', s.code, e); }
  }

  localStorage.setItem('quiz_my_sessions', '[]');
  loadMySessions();
  showToast('All sessions deleted');
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
let dragSrcIndex = null;

function renderQList(){
  const el = document.getElementById('qlist');
  const cnt = document.getElementById('qcount');
  if(cnt) cnt.textContent = localQs.length ? `(${localQs.length})` : '';
  if(!localQs.length){ el.innerHTML = '<p class="sub">No questions yet.</p>'; return; }
  el.innerHTML = '';
  localQs.forEach((q,i)=>{
    const d = mk('div', 'qrow'+(selQ===i?' sel':''));
    d.draggable = true;
    d.dataset.index = i;

    // drag handle
    const handle = mk('span'); handle.textContent = '⠿';
    handle.title = 'Drag to reorder';
    handle.style.cssText = 'color:var(--text-muted);cursor:grab;font-size:16px;padding-right:4px;flex-shrink:0';

    const num = mk('span','',{style:'font-size:13px;color:var(--text-muted);min-width:20px'}); num.textContent = i+1;
    const txt = mk('span','',{style:'flex:1;font-size:15px'}); txt.innerHTML = q.text || '<em style="color:var(--text-muted)">Untitled</em>';
    const ts  = mk('span','',{style:'font-size:13px;color:var(--text-muted)'}); ts.textContent = q.timeLimit+'s';
    const del = mk('button','sml',{style:'color:var(--danger)'}); del.textContent='Delete';
    del.onclick = e=>{ e.stopPropagation(); delQ(i); };

    d.appendChild(handle); d.appendChild(num); d.appendChild(txt);
    if(q.img){ const tag=mk('span','',{style:'font-size:12px;color:var(--text-muted)'}); tag.textContent='📷'; d.appendChild(tag); }
    d.appendChild(ts); d.appendChild(del);
    d.onclick = ()=>openEditor(i);

    // drag events
    d.addEventListener('dragstart', e=>{
      dragSrcIndex = i;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(()=>d.style.opacity='0.4', 0);
    });
    d.addEventListener('dragend', ()=>{
      d.style.opacity='1';
      el.querySelectorAll('.qrow').forEach(r=>r.classList.remove('drag-over'));
    });
    d.addEventListener('dragover', e=>{
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.querySelectorAll('.qrow').forEach(r=>r.classList.remove('drag-over'));
      d.classList.add('drag-over');
    });
    d.addEventListener('dragleave', ()=>d.classList.remove('drag-over'));
    d.addEventListener('drop', e=>{
      e.preventDefault(); e.stopPropagation();
      d.classList.remove('drag-over');
      const destIndex = parseInt(d.dataset.index);
      if(dragSrcIndex === null || dragSrcIndex === destIndex) return;
      // reorder
      const moved = localQs.splice(dragSrcIndex, 1)[0];
      localQs.splice(destIndex, 0, moved);
      // keep the editor open on the moved question
      if(selQ === dragSrcIndex) selQ = destIndex;
      else if(selQ !== null){
        if(dragSrcIndex < selQ && destIndex >= selQ) selQ--;
        else if(dragSrcIndex > selQ && destIndex <= selQ) selQ++;
      }
      dragSrcIndex = null;
      renderQList();
      if(selQ !== null) openEditor(selQ);
    });

    el.appendChild(d);
  });
}

function delQ(i){
  localQs.splice(i,1);
  if(selQ===i || selQ>=localQs.length){ selQ=null; document.getElementById('qeditor').innerHTML=''; }
  renderQList();
}
function addQ(){
  localQs.push({id:Date.now(), text:'', choices:['','','',''], correct:0, img:null, timeLimit:25});
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
  const choicesWrap = mk('div'); choicesWrap.id='choices-wrap-'+i;
  card.appendChild(choicesWrap);
  renderChoiceRows(choicesWrap, q, i);

  const choiceBtnRow = mk('div','row mt1');
  const addChoiceBtn = mk('button','sml');
  addChoiceBtn.textContent = 'Add choice';
  addChoiceBtn.onclick = ()=>{
    if(q.choices.length >= 6){ showToast('Maximum 6 choices'); return; }
    syncChoicesFromInputs(q, i);
    q.choices.push('');
    renderChoiceRows(choicesWrap, q, i);
  };
  const removeChoiceBtn = mk('button','sml');
  removeChoiceBtn.textContent = 'Remove choice';
  removeChoiceBtn.onclick = ()=>{
    if(q.choices.length <= 2){ showToast('Minimum 2 choices'); return; }
    syncChoicesFromInputs(q, i);
    q.choices.pop();
    if(q.correct >= q.choices.length) q.correct = q.choices.length - 1;
    renderChoiceRows(choicesWrap, q, i);
  };
  choiceBtnRow.appendChild(addChoiceBtn); choiceBtnRow.appendChild(removeChoiceBtn);
  card.appendChild(choiceBtnRow);

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

function renderChoiceRows(container, q, i){
  container.innerHTML = '';
  q.choices.forEach((c,ci)=>{
    const row = mk('div','row mt1');
    const radio = mk('input'); radio.type='radio'; radio.name='correct_'+i; radio.value=ci; radio.checked=(q.correct===ci); radio.style.cssText='width:auto;flex:none;accent-color:var(--accent-strong)';
    const lbl = mk('span'); lbl.style.cssText='font-weight:600;min-width:20px;font-size:14px;color:var(--text-secondary)'; lbl.textContent=String.fromCharCode(65+ci);
    const inp = mk('input'); inp.type='text'; inp.value=c||''; inp.placeholder='Choice '+(ci+1); inp.id='ch_'+i+'_'+ci; inp.style.flex='1';
    row.appendChild(radio); row.appendChild(lbl); row.appendChild(inp); container.appendChild(row);
  });
}

function syncChoicesFromInputs(q, i){
  // pulls whatever is currently typed into the inputs back into q.choices
  // before we change the array length, so in-progress edits aren't lost
  for(let ci=0; ci<q.choices.length; ci++){
    const val = document.getElementById('ch_'+i+'_'+ci)?.value;
    if(val !== undefined) q.choices[ci] = val;
  }
}
function buildImgPreview(container, src, i){
  container.innerHTML = '';
  const im = mk('img','qimg'); im.src = src; im.alt='question image'; container.appendChild(im);
  const cb = mk('button','sml red'); cb.style.marginTop='8px'; cb.textContent='Remove image';
  cb.onclick = ()=>clearImg(i); container.appendChild(cb);
}

function handleImg(i, e){
  const file = e.target.files[0]; if(!file) return;
  if(file.size > 10*1024*1024){ alert('Image must be under 10 MB'); return; }

  const reader = new FileReader();
  reader.onload = ev=>{
    const img = new Image();
    img.onload = ()=>{
      // scale down so the longest edge is at most 1200px
      const MAX = 1200;
      let w = img.width, h = img.height;
      if(w > MAX || h > MAX){
        if(w > h){ h = Math.round(h * MAX/w); w = MAX; }
        else      { w = Math.round(w * MAX/h); h = MAX; }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);

      // compress to JPEG at 75% quality — good visual quality, much smaller file
      const compressed = canvas.toDataURL('image/jpeg', 0.75);

      const origKB   = Math.round(file.size / 1024);
      const newKB    = Math.round((compressed.length * 3/4) / 1024);
      console.log(`Image compressed: ${origKB}KB → ${newKB}KB`);

      localQs[i].img = compressed;
      const prev = document.getElementById('img-preview-'+i);
      if(prev){
        buildImgPreview(prev, compressed, i);
        // show compression result to the host
        const info = mk('div'); info.style.cssText='font-size:12px;color:var(--text-muted);margin-top:4px';
        info.textContent = `Compressed from ${origKB}KB to ${newKB}KB`;
        prev.appendChild(info);
      }
      renderQList();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}
function clearImg(i){
  localQs[i].img = null;
  const prev = document.getElementById('img-preview-'+i); if(prev) prev.innerHTML='';
  renderQList();
}
async function saveQ(i){
  const q = localQs[i];
  q.text = (document.getElementById('ed-text')?.value||'').trim();
  q.timeLimit = parseInt(document.getElementById('ed-time')?.value) || 25;
  const radio = document.querySelector('input[name="correct_'+i+'"]:checked');
  q.correct = radio ? parseInt(radio.value) : 0;
  for(let ci=0; ci<q.choices.length; ci++) q.choices[ci] = (document.getElementById('ch_'+i+'_'+ci)?.value||'').trim();
  renderQList();

  const msg = document.getElementById('save-q-msg');

  // auto-sync to the library if a quiz is currently open under a name
  if(currentQuizName && libraryPassphraseHash){
    if(msg){ msg.textContent='Saving…'; }
    try{
      const key = encodeKey(currentQuizName);
      const base = `savedQuizzes/${libraryPassphraseHash}/${key}`;
      // update meta count and write just this question's node
      await db.ref(`${base}/meta`).update({ name: currentQuizName, count: localQs.length, saved: new Date().toLocaleString() });
      await db.ref(`${base}/questions/${i}`).set(JSON.parse(JSON.stringify(q)));
      if(msg){ msg.textContent='Saved!'; setTimeout(()=>{ if(msg) msg.textContent=''; }, 1800); }
    } catch(e){
      console.error('auto-sync failed', e);
      if(msg){ msg.textContent='Saved locally (sync failed)'; setTimeout(()=>{ if(msg) msg.textContent=''; }, 2500); }
    }
  } else if(currentQuizName && !libraryPassphraseHash){
    // update localStorage
    const all = JSON.parse(localStorage.getItem('quiz_saved_quizzes')||'{}');
    if(all[currentQuizName]){
      all[currentQuizName].questions = JSON.parse(JSON.stringify(localQs));
      all[currentQuizName].saved = new Date().toLocaleString();
      localStorage.setItem('quiz_saved_quizzes', JSON.stringify(all));
    }
    if(msg){ msg.textContent='Saved!'; setTimeout(()=>{ if(msg) msg.textContent=''; }, 1800); }
  } else {
    // no quiz name yet — just confirm the question was saved in memory
    if(msg){ msg.textContent='Saved! (use Save quiz to store permanently)'; setTimeout(()=>{ if(msg) msg.textContent=''; }, 2500); }
  }
}

// ── SAVE / LOAD QUIZ — shared library, scoped by a passphrase ────────────
// Quizzes are stored in Firebase under savedQuizzes/{passphraseHash}/...
// so anyone who enters the same passphrase, on any device, sees the same
// library. If no passphrase has been unlocked, we fall back to a private
// per-browser localStorage library so the feature still works solo.

let libraryPassphraseHash = null; // null = no shared library unlocked yet

// simple, non-cryptographic hash — good enough to scope a Firebase path,
// not intended as real security
async function hashPassphrase(text){
  const normalized = text.trim().toLowerCase();
  if(window.crypto && window.crypto.subtle){
    try{
      const enc = new TextEncoder().encode(normalized);
      const buf = await crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,32);
    } catch(e){ /* fall through to simple hash below */ }
  }
  // fallback for non-HTTPS contexts where crypto.subtle is unavailable
  let h = 0;
  for(let i=0; i<normalized.length; i++){ h = ((h<<5)-h+normalized.charCodeAt(i))|0; }
  return 'h'+Math.abs(h).toString(16);
}

async function unlockLibrary(){
  const input = document.getElementById('library-passphrase');
  const status = document.getElementById('library-status');
  const phrase = (input.value||'').trim();
  if(!phrase){
    libraryPassphraseHash = null;
    status.textContent = 'No passphrase set — saved quizzes will only be available on this device.';
    status.style.color = 'var(--text-muted)';
    return;
  }
  status.textContent = 'Unlocking…';
  try{
    libraryPassphraseHash = await hashPassphrase(phrase);
    localStorage.setItem('quiz_library_passphrase', phrase); // remember on this device so it persists across reloads
    const snap = await db.ref('savedQuizzes/'+libraryPassphraseHash).get();
    const count = snap.exists() ? Object.keys(snap.val()).length : 0;
    status.textContent = `Unlocked — ${count} saved quiz${count!==1?'zes':''} found for this passphrase.`;
    status.style.color = 'var(--success)';
  } catch(e){
    console.error('unlockLibrary failed', e);
    status.textContent = 'Could not reach the database — check your connection.';
    status.style.color = 'var(--danger)';
  }
}

// restore a previously-used passphrase automatically on page load
window.addEventListener('DOMContentLoaded', async ()=>{
  const saved = localStorage.getItem('quiz_library_passphrase');
  if(saved){
    const input = document.getElementById('library-passphrase');
    if(input) input.value = saved;
    try{ libraryPassphraseHash = await hashPassphrase(saved); } catch(e){}
  }
});

function showSaveModal(){
  document.getElementById('modal-save').style.display='flex';
  document.getElementById('save-name').value='';
  const err = document.getElementById('save-err');
  err.textContent = libraryPassphraseHash
    ? ''
    : 'No passphrase unlocked — this will save to this device only. Set a passphrase in "Your quiz library" to share across devices.';
  err.style.color = libraryPassphraseHash ? 'var(--danger)' : 'var(--text-muted)';
  setTimeout(()=>document.getElementById('save-name').focus(),50);
}
function showLoadModal(){
  document.getElementById('modal-load').style.display='flex';
  document.getElementById('quiz-list-modal').innerHTML =
    '<p class="sub" style="display:flex;align-items:center;gap:8px"><span style="display:inline-block;width:14px;height:14px;border:2px solid var(--border-strong);border-top-color:var(--accent-strong);border-radius:50%;animation:spin .7s linear infinite"></span> Loading your quizzes…</p>';
  renderSavedList();
}

async function doSaveQuiz(){
  const name = (document.getElementById('save-name').value||'').trim();
  const err = document.getElementById('save-err');
  if(!name){ err.textContent='Enter a name'; err.style.color='var(--danger)'; return; }
  if(!localQs.length){ err.textContent='No questions to save'; err.style.color='var(--danger)'; return; }

  const saveBtn = document.querySelector('#modal-save button.pri');
  if(saveBtn){ saveBtn.disabled=true; saveBtn.textContent='Saving…'; }

  if(libraryPassphraseHash){
    try{
      const key = encodeKey(name);
      const base = `savedQuizzes/${libraryPassphraseHash}/${key}`;

      // write meta first, then clear old questions, then write each question separately
      await db.ref(`${base}/meta`).set({ name, saved: new Date().toLocaleString(), count: localQs.length });
      await db.ref(`${base}/questions`).remove();
      const questionUpdates = {};
      localQs.forEach((q, i)=>{
        questionUpdates[`${base}/questions/${i}`] = JSON.parse(JSON.stringify(q));
      });
      await db.ref().update(questionUpdates);

      closeModal('modal-save');
      showToast('Quiz saved');
      currentQuizName = name;
    } catch(e){
      console.error('doSaveQuiz (shared) failed', e);
      err.textContent = 'Could not save to the shared library: ' + (e.message||e);
      err.style.color = 'var(--danger)';
    }
  } else {
    // localStorage fallback — blob is fine here, no concurrent-write risk
    const all = JSON.parse(localStorage.getItem('quiz_saved_quizzes')||'{}');
    all[name] = { questions: JSON.parse(JSON.stringify(localQs)), saved: new Date().toLocaleString() };
    localStorage.setItem('quiz_saved_quizzes', JSON.stringify(all));
    closeModal('modal-save');
    showToast('Quiz saved');
    currentQuizName = name;
  }

  if(saveBtn){ saveBtn.disabled=false; saveBtn.textContent='Save'; }
}

// Firebase keys can't contain ".", "#", "$", "[", "]", "/" — sanitize names
function encodeKey(name){
  return encodeURIComponent(name).replace(/\./g,'%2E');
}

async function renderSavedList(){
  const el = document.getElementById('quiz-list-modal');
  el.innerHTML = '<p class="sub" style="display:flex;align-items:center;gap:8px"><span style="display:inline-block;width:14px;height:14px;border:2px solid var(--border-strong);border-top-color:var(--accent-strong);border-radius:50%;animation:spin .7s linear infinite"></span> Loading your quizzes…</p>';

  if(libraryPassphraseHash){
    try{
      // only fetch meta nodes — fast, no question data downloaded yet
      const snap = await db.ref(`savedQuizzes/${libraryPassphraseHash}`).get();
      if(!snap.exists()){ renderSavedListInto(el, {}, true); return; }
      const all = {};
      snap.forEach(child=>{
        const val = child.val();
        if(!val) return;
        if(val.meta){
          // new per-question format
          all[child.key] = { meta: val.meta };
        } else if(val.questions){
          // old blob format — synthesise a meta object from what's there
          all[child.key] = { meta: {
            name: decodeURIComponent(child.key.replace(/%2E/g,'.')),
            saved: val.saved || '',
            count: Array.isArray(val.questions) ? val.questions.length : Object.keys(val.questions).length
          }, _oldFormat: true, _questions: val.questions };
        }
      });
      renderSavedListInto(el, all, true);
    } catch(e){
      console.error('renderSavedList (shared) failed', e);
      el.innerHTML = '<p class="sub" style="color:var(--danger)">Could not load the shared library: '+(e.message||e)+'</p>';
    }
  } else {
    const all = JSON.parse(localStorage.getItem('quiz_saved_quizzes')||'{}');
    renderSavedListInto(el, all, false);
  }
}

function renderSavedListInto(el, all, isShared){
  const keys = Object.keys(all);
  el.innerHTML = '';
  if(isShared){
    const hint = mk('p','sub'); hint.style.marginBottom='8px';
    hint.textContent = 'Showing quizzes saved under your current passphrase.';
    el.appendChild(hint);
  }
  if(!keys.length){
    const empty = mk('p','sub'); empty.textContent='No saved quizzes yet.'; el.appendChild(empty); return;
  }
  keys.forEach(rawKey=>{
    const entry = all[rawKey];
    const isNewFormat = !!entry.meta;
    const displayName  = isNewFormat
      ? (entry.meta.name || decodeURIComponent(rawKey.replace(/%2E/g,'.').replace(/%20/g,' ')))
      : decodeURIComponent(rawKey.replace(/%2E/g,'.'));
    const count        = isNewFormat ? entry.meta.count : (entry.questions?.length || 0);
    const savedDate    = isNewFormat ? entry.meta.saved : entry.saved;

    const row = mk('div'); row.style.cssText='display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border)';
    const info = mk('div'); info.style.flex='1';
    info.innerHTML = `<div style="font-weight:500">${displayName}</div><div style="font-size:12px;color:var(--text-muted)">${count} question${count!==1?'s':''} · ${savedDate||''}</div>`;

    const lb = mk('button','sml pri'); lb.textContent='Load';
    lb.onclick = ()=> isShared
      ? (entry._oldFormat ? loadOldFormatQuiz(entry._questions, displayName) : loadSharedQuiz(rawKey, displayName, lb))
      : loadLocalQuiz(displayName, entry);

    const delBtn = mk('button','sml'); delBtn.style.color='var(--danger)'; delBtn.textContent='Delete';
    delBtn.onclick = async ()=>{
      if(!confirm(`Delete "${displayName}"?`)) return;
      if(isShared){
        await db.ref(`savedQuizzes/${libraryPassphraseHash}/${rawKey}`).remove();
      } else {
        const stored = JSON.parse(localStorage.getItem('quiz_saved_quizzes')||'{}');
        delete stored[rawKey];
        localStorage.setItem('quiz_saved_quizzes', JSON.stringify(stored));
      }
      renderSavedList();
    };
    row.appendChild(info); row.appendChild(lb); row.appendChild(delBtn); el.appendChild(row);
  });
}

async function loadSharedQuiz(rawKey, displayName, btn){
  if(btn){ btn.disabled=true; btn.textContent='Loading…'; }
  try{
    const snap = await db.ref(`savedQuizzes/${libraryPassphraseHash}/${rawKey}/questions`).get();
    if(!snap.exists()){ showToast('No questions found for this quiz'); return; }
    const val = snap.val();
    // Firebase returns numeric-keyed children as an object — sort and convert to array
    const questions = Array.isArray(val)
      ? val
      : Object.keys(val).sort((a,b)=>Number(a)-Number(b)).map(k=>val[k]);
    localQs = questions.filter(Boolean);
    selQ = null;
    currentQuizName = displayName;
    document.getElementById('qeditor').innerHTML='';
    renderQList();
    closeModal('modal-load');
    showToast(`Loaded "${displayName}"`);
  } catch(e){
    console.error('loadSharedQuiz failed', e);
    showToast('Could not load quiz: ' + (e.message||e));
  } finally {
    if(btn){ btn.disabled=false; btn.textContent='Load'; }
  }
}

function loadLocalQuiz(name, entry){
  localQs = JSON.parse(JSON.stringify(entry.questions));
  selQ = null;
  currentQuizName = name;
  document.getElementById('qeditor').innerHTML='';
  renderQList();
  closeModal('modal-load');
  showToast(`Loaded "${name}"`);
}

function loadOldFormatQuiz(questions, displayName){
  const val = questions;
  const arr = Array.isArray(val)
    ? val
    : Object.keys(val).sort((a,b)=>Number(a)-Number(b)).map(k=>val[k]);
  localQs = arr.filter(Boolean);
  selQ = null;
  currentQuizName = displayName;
  document.getElementById('qeditor').innerHTML='';
  renderQList();
  closeModal('modal-load');
  showToast(`Loaded "${displayName}"`);
}

// returns the questions array from the right source depending on role
function getQuestions(){ return (role==='host' ? localQs : (liveState.questions||[])); }

// ── RUN PANEL ──────────────────────────────────────────────────────────────
let lastHostTimerQ = -1;

function renderRunPanel(full){
  const s = liveState; if(!s) return;
  const pcount = Object.keys(s.participants||{}).length;
  const ans = s.answers?.[s.currentQ] || {};
  const acount = Object.keys(ans).length;

  setTxt('r-pcount', pcount);
  setTxt('r-qnum', s.currentQ>=0 ? `${s.currentQ+1}/${getQuestions().length}` : '—');
  setTxt('r-resp', s.currentQ>=0 ? acount : '—');
  const rb = document.getElementById('r-badge'); if(rb){ rb.className='badge '+s.status; rb.textContent=s.status; }

  const pb = document.getElementById('ht-pbadge');
  if(pb){ if(pcount>0){ pb.style.display='inline'; pb.textContent=pcount; } else pb.style.display='none'; }

  if(document.getElementById('modal-code').style.display==='flex') updateCodeModal();

  if(!full){ if(s.status==='active') updateResponseCount(); return; }

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
    const q = getQuestions()[s.currentQ];
    if(q){
      const card = mk('div','card');
      if(q.img){ const im=mk('img','qimg'); im.src=q.img; im.alt=''; card.appendChild(im); }
      const qt = mk('div'); qt.style.cssText = `font-size:18px;font-weight:600;margin-top:${q.img?'12px':'0'}`; qt.textContent = q.text||'(no text)'; card.appendChild(qt);
      const qm = mk('div'); qm.style.cssText = 'font-size:13px;color:var(--text-muted);margin-top:8px'; qm.textContent = `Question ${s.currentQ+1} of ${getQuestions().length}`; card.appendChild(qm);
      const timerEl = mk('div'); timerEl.id='r-timer'; timerEl.style.cssText='font-size:28px;font-weight:700;margin-top:10px;color:var(--accent)'; card.appendChild(timerEl);

      const ansForQ = s.answers?.[s.currentQ] || {};
      const totalAns = Object.keys(ansForQ).length;
      const counts = {};
      Object.values(ansForQ).forEach(a=>{ counts[a] = (counts[a]||0) + 1; });

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
        if(s.revealAnswers){
          const pct = totalAns ? Math.round(((counts[ci]||0) / totalAns) * 100) : 0;
          const pctEl = mk('span'); pctEl.style.cssText='margin-left:auto;font-size:13px;color:var(--text-muted)';
          pctEl.textContent = `${pct}% (${counts[ci]||0})`;
          ab.appendChild(pctEl);
        }
        if(isCorrect){ const ck=mk('span'); ck.style.marginLeft=s.revealAnswers?'8px':'auto'; ck.textContent='✓'; ab.appendChild(ck); }
        card.appendChild(ab);
      });
      qd.appendChild(card);
    }
    const rv = mk('button'); rv.textContent='Reveal answers'; rv.disabled = s.revealAnswers; rv.onclick=doReveal; ctrl.appendChild(rv);
    const nx = mk('button','pri'); nx.textContent='Next question'; nx.disabled = !s.revealAnswers || (s.currentQ >= getQuestions().length-1); nx.onclick=doNext; ctrl.appendChild(nx);
    const en = mk('button','red'); en.textContent='End quiz'; en.onclick=doEnd; ctrl.appendChild(en);
    if(s.revealAnswers){
      clearTimerInterval();
    } else if(lastHostTimerQ !== s.currentQ){
      lastHostTimerQ = s.currentQ;
      startHostTimer(q.timeLimit, s.questionStartedAt, s.currentQ);
    } else {
      tickTimer('r-timer', q.timeLimit, s.questionStartedAt || Date.now());
    }

  } else { // done
    qd.innerHTML = '<div class="card" style="color:var(--success);font-size:17px;font-weight:600">Quiz finished!</div>';
    const rs = mk('button'); rs.textContent='New round';
    rs.onclick = async ()=>{
      if(confirm('Reset scores and start again?')){
        const fresh = { status:'waiting', currentQ:-1, answers:{}, participants:{}, revealAnswers:false };
        await stateRef().set(fresh);
      }
    };
    ctrl.appendChild(rs);
  }
}

function updateResponseCount(){
  const s = liveState; if(!s || s.currentQ<0) return;
  const ans = s.answers?.[s.currentQ] || {};
  setTxt('r-resp', Object.keys(ans).length);
}

// ── COUNTDOWN TIMER (host + participant) ──────────────────────────────────
let timerInterval = null;
let autoRevealFiredForQ = -1; // guards against firing doReveal more than once per question

function clearTimerInterval(){
  if(timerInterval){ clearInterval(timerInterval); timerInterval = null; }
}

function startHostTimer(timeLimit, startedAt, questionIndex){
  clearTimerInterval();
  if(!startedAt) startedAt = Date.now();
  tickTimer('r-timer', timeLimit, startedAt, ()=>{
    // only the host auto-triggers the reveal, and only once per question
    if(autoRevealFiredForQ !== questionIndex){
      autoRevealFiredForQ = questionIndex;
      doReveal();
    }
  });
  timerInterval = setInterval(()=>tickTimer('r-timer', timeLimit, startedAt, ()=>{
    if(autoRevealFiredForQ !== questionIndex){
      autoRevealFiredForQ = questionIndex;
      doReveal();
    }
  }), 1000);
}

function startParticipantTimer(timeLimit, startedAt){
  clearTimerInterval();
  if(!startedAt) startedAt = Date.now();
  tickTimer('p-timer', timeLimit, startedAt);
  timerInterval = setInterval(()=>tickTimer('p-timer', timeLimit, startedAt), 1000);
}

function tickTimer(elId, timeLimit, startedAt, onExpire){
  const el = document.getElementById(elId);
  if(!el){ clearTimerInterval(); return; }
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  const remaining = Math.max(0, timeLimit - elapsed);
  el.textContent = remaining + 's';
  el.style.color = remaining <= 5 ? 'var(--danger)' : 'var(--accent)';
  if(remaining <= 0){
    clearTimerInterval();
    if(onExpire) onExpire();
  }
}

// ── QUIZ CONTROL — write to Firebase, listener updates everyone ──────────
// Questions (with base64 images) go to sessions/{code}/questions — written ONCE.
// All live control data goes to sessions/{code}/state — tiny, syncs fast.

function stateRef(){ return db.ref('sessions/'+sessionCode+'/state'); }
function questionsRef(){ return db.ref('sessions/'+sessionCode+'/questions'); }

async function startQuiz(){
  if(!localQs.length){ alert('Add questions first'); return; }
  // write questions once — never included in live state syncs again
  await questionsRef().set(localQs.map(q=>JSON.parse(JSON.stringify(q))));
  // write lightweight live state
  const activeState = {
    status:'active', currentQ:0, answers:{},
    participants: liveState.participants || {},
    revealAnswers:false, questionStartedAt:Date.now(),
    questionCount: localQs.length
  };
  await stateRef().set(activeState);
  lastHostTimerQ = -1;
  lastTimerQ = -1;
  autoRevealFiredForQ = -1;
}

async function doReveal(){
  if(!sessionRef) return;
  // fetch fresh state and answers to avoid stale-cache scoring errors
  const snap = await stateRef().get();
  const s = snap.val();
  if(!s) return;
  if(s.revealAnswers) { liveState = {...liveState, ...s}; return; }

  // correct answer index lives in localQs (host) or liveState.questions (participant)
  const questions = localQs.length ? localQs : (liveState.questions||[]);
  const q = questions[s.currentQ];
  if(!q) return;

  const ans = s.answers?.[s.currentQ] || {};
  s.participants = s.participants || {};
  Object.entries(ans).forEach(([name,a])=>{
    if(Number(a) === Number(q.correct)){
      if(!s.participants[name]) s.participants[name] = {score:0};
      s.participants[name].score = (s.participants[name].score||0) + 1;
    }
  });
  s.revealAnswers = true;
  liveState = {...liveState, ...s};
  await stateRef().set(s);
}

async function doNext(){
  const s = liveState;
  const qCount = s.questionCount || (localQs.length || 0);
  if(s.currentQ >= qCount-1) return;
  s.currentQ++;
  s.revealAnswers = false;
  s.questionStartedAt = Date.now();
  lastHostTimerQ = -1;
  lastTimerQ = -1;
  await stateRef().set(s);
}

async function doEnd(){
  liveState.status = 'done';
  await stateRef().set(liveState);
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

  const rootSnap = await db.ref('sessions/'+code).get();
  if(!rootSnap.exists()){ err.textContent='Session not found — check the code'; return; }
  const root = rootSnap.val();

  const stateSnap = await db.ref('sessions/'+code+'/state').get();
  // state subnode always exists now (written on session creation); fall back gracefully
  const state = stateSnap.exists() ? stateSnap.val() : { status:'waiting', participants:{} };
  const participants = state.participants || {};

  if(Object.keys(participants).length >= 50 && !participants[name]){
    err.textContent = 'Session is full (50 max)'; return;
  }

  await db.ref(`sessions/${code}/state/participants/${name}`).set({
    score: participants[name]?.score || 0,
    joined: Date.now()
  });

  myName = name; sessionCode = code; role = 'participant';
  document.getElementById('p-name-hdr').textContent = name;
  document.getElementById('p-session-hdr').textContent = '· ' + (root.name||'Quiz');

  // pre-fetch questions now so the first render is instant
  // (images won't be re-downloaded on every state update)
  liveState = { ...state, questions:[] };
  try{
    const qsnap = await db.ref('sessions/'+code+'/questions').get();
    if(qsnap.exists()) liveState.questions = qsnap.val();
  } catch(e){ console.warn('Could not pre-fetch questions', e); }

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
let lastTimerQ = -1;
let pViewDebounce = null;

function renderPViewDebounced(){
  // coalesce rapid Firebase events (e.g. many participants answering at once)
  // into a single render 100ms later
  clearTimeout(pViewDebounce);
  pViewDebounce = setTimeout(renderPView, 100);
}

function renderPView(){
  const s = liveState; if(!s) return;
  const el = document.getElementById('p-main'); if(!el) return;

  if(s.status==='waiting'){
    clearTimerInterval();
    el.innerHTML = `<div class="card"><div style="font-size:17px;font-weight:600">Waiting for host to start…</div><p class="sub" style="margin-top:6px">You're in! Sit tight.</p></div>`;
    return;
  }
  if(s.status==='done'){
    clearTimerInterval();
    const sorted = Object.entries(s.participants||{}).sort((a,b)=>(b[1].score||0)-(a[1].score||0));
    const pos = sorted.findIndex(([nm])=>nm===myName) + 1;
    const sc = s.participants?.[myName]?.score || 0;
    el.innerHTML = `<div class="card"><div style="font-size:19px;font-weight:600;color:var(--success)">Quiz complete!</div><div style="margin-top:10px;font-size:16px">You finished <strong>#${pos}</strong> with <strong>${sc} point${sc!==1?'s':''}</strong></div></div>`;
    const lbWrap = mk('div'); lbWrap.className='mt2';
    const lbTitle = mk('h2'); lbTitle.textContent='Final leaderboard'; lbWrap.appendChild(lbTitle);
    const lbList = mk('div'); lbList.id='p-lb-final'; lbWrap.appendChild(lbList);
    el.appendChild(lbWrap);
    renderLB('p-lb-final', myName);
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
  if(!reveal){
    const timerEl = mk('div'); timerEl.id='p-timer'; timerEl.style.cssText='font-size:24px;font-weight:700;margin-top:8px;color:var(--accent)'; card.appendChild(timerEl);
  } else {
    clearTimerInterval();
  }
  el.appendChild(card);

  if(!reveal && lastTimerQ !== s.currentQ){
    lastTimerQ = s.currentQ;
    startParticipantTimer(q.timeLimit, s.questionStartedAt);
  } else if(!reveal){
    // re-render happened but timer already running — just make sure the element exists with current value
    tickTimer('p-timer', q.timeLimit, s.questionStartedAt || Date.now());
  }

  const ansForQ = s.answers?.[s.currentQ] || {};
  const totalAns = Object.keys(ansForQ).length;
  const counts = {};
  Object.values(ansForQ).forEach(a=>{ counts[a] = (counts[a]||0) + 1; });

  q.choices.forEach((c,i)=>{
    if(!c) return;
    let cls = 'ans-btn';
    if(answered && myAns===i) cls += ' picked';
    if(reveal && i===q.correct) cls += ' correct';
    if(reveal && answered && myAns===i && myAns!==q.correct) cls += ' wrong';
    const btn = mk('button', cls);
    const lt = mk('span','cletter'); lt.textContent = String.fromCharCode(65+i); btn.appendChild(lt);
    const lb = mk('span'); lb.textContent = c; lb.style.flex='1'; btn.appendChild(lb);
    if(reveal){
      const pct = totalAns ? Math.round(((counts[i]||0) / totalAns) * 100) : 0;
      const pctEl = mk('span'); pctEl.style.cssText='font-size:13px;opacity:0.85';
      pctEl.textContent = pct + '%';
      btn.appendChild(pctEl);
    }
    if(reveal && i===q.correct){ const ck=mk('span'); ck.style.marginLeft='4px'; ck.textContent='✓'; btn.appendChild(ck); }
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
  await db.ref(`sessions/${sessionCode}/state/answers/${s.currentQ}/${myName}`).set(idx);
}

// ── REALTIME LISTENER — replaces polling entirely ─────────────────────────
// ── REALTIME LISTENER ─────────────────────────────────────────────────────
let sessionListener = null; // named function reference so we can remove it precisely

function attachSessionListener(code){
  if(sessionRef && sessionListener){
    sessionRef.off('value', sessionListener);
  }

  // sessionRef points to the full session for one-off reads/writes (join, delete etc)
  sessionRef = db.ref('sessions/'+code);

  // but the live listener only watches the lightweight 'state' subnode —
  // questions (with images) are fetched once separately and never re-synced
  const watchRef = db.ref('sessions/'+code+'/state');

  sessionListener = async function(snap){
    const s = snap.val();
    // s can be null before the quiz starts if state subnode isn't written yet — treat as waiting
    const incoming = s || { status:'waiting', currentQ:-1, answers:{}, participants:{}, revealAnswers:false };

    // merge incoming state with existing liveState so we preserve the questions array
    liveState = { ...liveState, ...incoming };
    liveState.participants = incoming.participants || {};
    liveState.answers      = incoming.answers      || {};

    // fetch questions once if we don't have them yet (participant joining mid-quiz)
    if((!liveState.questions || !liveState.questions.length) && incoming.status === 'active'){
      try{
        const qsnap = await db.ref('sessions/'+code+'/questions').get();
        if(qsnap.exists()) liveState.questions = qsnap.val();
      } catch(e){ console.warn('Could not fetch questions', e); }
    }

    if(role==='host'){
      if(s.currentQ !== lastHostTimerQ && !s.revealAnswers){
        autoRevealFiredForQ = -1;
      }
      if(activeHostTab==='run') renderRunPanel(true);
      else if(activeHostTab==='lb') renderLB('h-lb', null);
      const pb = document.getElementById('ht-pbadge');
      const pcount = Object.keys(s.participants).length;
      if(pb){ if(pcount>0){ pb.style.display='inline'; pb.textContent=pcount; } else pb.style.display='none'; }
      if(document.getElementById('modal-code').style.display==='flex') updateCodeModal();
    } else if(role==='participant'){
      if(s.currentQ !== lastTimerQ && !s.revealAnswers){
        lastTimerQ = -1;
      }
      const ps = document.getElementById('p-sync');
      if(ps){ ps.textContent='● live'; ps.style.color='var(--success)'; }
      renderPViewDebounced();
    }
  };

  watchRef.on('value', sessionListener, err=>{
    console.error('Firebase listener error', err);
    const ps = document.getElementById('p-sync');
    if(ps){ ps.textContent='● connection error'; ps.style.color='var(--danger)'; }
  });
}
