const ENDPOINT='https://script.google.com/macros/s/AKfycbyhhWXTyIM-KmUyvP0F0GRNEXhXgJgzmcAMaOCddvMAxLTV0n8Md8HkBMeizgu1yiZv/exec';
let currentUser=null, currentView='board', editingTaskId=null, editingProjectId=null, statusFilter='todas';
let _projects=[], _tasks=[], _usuarios=[];
let _saving=false;
const COL_CONFIG=[{id:'pendiente',label:'Pendiente',color:'#a8cc88'},{id:'en-progreso',label:'En progreso',color:'#d97c2a'},{id:'revision',label:'En revisión',color:'#8b4ed9'},{id:'completado',label:'Completado',color:'#5a9a32'}];
const TYPE_COLORS={evento:{bg:'var(--pur-bg)',color:'var(--purple)'},semanal:{bg:'var(--blue-bg)',color:'var(--blue)'},mensual:{bg:'var(--org-bg)',color:'var(--orange)'},directivos:{bg:'var(--red-bg)',color:'var(--red)'},institucional:{bg:'var(--accent-bg2)',color:'var(--accent-dark)'},interno:{bg:'var(--teal-bg)',color:'var(--teal)'},otro:{bg:'var(--surface2)',color:'var(--text3)'}};
const TAG_CLASSES=['tag-blue','tag-purple','tag-green','tag-orange','tag-teal','tag-red'];
async function api(action,data=null){
  const res=await fetch(ENDPOINT,{method:'POST',body:JSON.stringify({action,...(data||{})}),headers:{'Content-Type':'text/plain;charset=utf-8'}});
  return res.json();
}
function getProjects(){return _projects;}
function getTasks(){return _tasks;}
function saveProjects(p){_projects=[...p];}
function saveTasks(t){_tasks=[...t];}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function nowAR(){const d=new Date();d.setHours(d.getHours()-3);const[date,time]=d.toISOString().slice(0,19).split('T');const[y,m,day]=date.split('-');return`${day}/${m}/${y} ${time}`;}
async function loadData(){
  const[p,t,u]=await Promise.all([api('getProyectos'),api('getTareas'),api('getUsuarios')]);
  _projects=Array.isArray(p?.proyectos)?p.proyectos:[];
  _tasks=Array.isArray(t?.tareas)?t.tareas:[];
  _usuarios=Array.isArray(u?.usuarios)?u.usuarios:[];
}

/* ---- Multi-select de miembros ---- */
function toggleMembersDropdown(){
  const dd=document.getElementById('pMembersDropdown');
  if(!dd) return;
  dd.classList.toggle('hidden');
}
function buildMembersDropdown(selectedArr){
  const dd=document.getElementById('pMembersDropdown');
  if(!dd) return;
  dd.innerHTML=_usuarios.map(u=>{
    const checked=selectedArr.includes(u.nombre_apellido);
    return `<label class="multiselect-option"><input type="checkbox" value="${esc(u.nombre_apellido)}" ${checked?'checked':''} onchange="syncMembersValue()"> ${esc(u.nombre_apellido)}</label>`;
  }).join('');
}
function syncMembersValue(){
  const checks=[...document.querySelectorAll('#pMembersDropdown input[type=checkbox]:checked')];
  const vals=checks.map(c=>c.value);
  document.getElementById('pMembers').value=vals.join(', ');
  const ph=document.getElementById('pMembersPlaceholder');
  ph.textContent=vals.length?vals.join(', '):'— Seleccionar miembros —';
  ph.style.color=vals.length?'var(--text1)':'';
}
/* Cerrar dropdown al click fuera */
document.addEventListener('click',e=>{
  const wrap=document.getElementById('pMembersWrap');
  if(wrap&&!wrap.contains(e.target)){
    document.getElementById('pMembersDropdown')?.classList.add('hidden');
  }
});

async function doLogin(){
  const usuario=document.getElementById('loginUsuario').value.trim();
  const password=document.getElementById('loginPassword').value;
  const errEl=document.getElementById('loginError');
  errEl.style.display='none';
  if(!usuario||!password){errEl.textContent='Ingresá usuario y contraseña.';errEl.style.display='block';return;}
  const btn=document.getElementById('loginBtn');
  btn.disabled=true;btn.textContent='Ingresando...';
  try{
    const res=await api('login',{usuario,contrasena:password});
    if(res.ok){
      currentUser=res.user;
      localStorage.setItem('ce_session',JSON.stringify(currentUser));
      document.getElementById('loginScreen').classList.add('hidden');
      document.getElementById('loadingScreen').classList.remove('hidden');
      await loadData();
      document.getElementById('loadingScreen').classList.add('hidden');
      applySession();
    }else{
      errEl.textContent=res.error||'Usuario o contraseña incorrectos.';
      errEl.style.display='block';
    }
  }catch(e){
    errEl.textContent='Error de conexión. Intentá de nuevo.';
    errEl.style.display='block';
  }finally{
    btn.disabled=false;btn.textContent='Ingresar al gestor →';
  }
}
function applySession(){
  document.getElementById('loginScreen').classList.add('hidden');
  // restaurar botones siempre antes de aplicar restricciones del rol
  document.getElementById('btnNuevaTarea').classList.remove('hidden');
  document.querySelectorAll('#topbarActions .btn').forEach(b=>b.classList.remove('hidden'));
  const displayName=currentUser.nombre_apellido||currentUser.usuario;
  const ini=displayName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('sidebarAvatar').textContent=ini;
  document.getElementById('sidebarName').textContent=displayName;
  document.getElementById('sidebarRole').textContent=currentUser.rol||'—';
  const carrEl=document.getElementById('sidebarCarrera');
  if(carrEl) carrEl.textContent=currentUser.carrera||'';
  if(currentUser.rol==='Lector'){
    document.getElementById('btnNuevaTarea').classList.add('hidden');
    document.querySelectorAll('#topbarActions .btn:not(.btn-primary)').forEach(b=>b.classList.add('hidden'));
  }
  renderAll();
}
function logout(){
  localStorage.removeItem('ce_session');
  currentUser=null;_projects=[];_tasks=[];_usuarios=[];
  document.getElementById('btnNuevaTarea').classList.remove('hidden');
  document.querySelectorAll('#topbarActions .btn').forEach(b=>b.classList.remove('hidden'));
  document.getElementById('sidebarAvatar').textContent='?';
  document.getElementById('sidebarName').textContent='—';
  document.getElementById('sidebarRole').textContent='—';
  const carrEl=document.getElementById('sidebarCarrera');
  if(carrEl) carrEl.textContent='';
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('loginUsuario').value='';
  document.getElementById('loginPassword').value='';
}

function switchView(view,el){
  currentView=view;
  statusFilter='todas';
  document.querySelectorAll('.nav-item-filter').forEach(i=>i.classList.remove('active'));
  document.getElementById('filtersBar').style.display='';
  document.getElementById('statsRow').style.display='';
  const si=document.getElementById('searchInput');if(si) si.placeholder=view==='projects'?'🔍  Buscar proyectos...':'🔍  Buscar tareas...';
  document.querySelectorAll('.nav-item-view').forEach(i=>i.classList.remove('active'));
  if(el) el.classList.add('active');
  document.getElementById('viewBoard').classList.toggle('hidden',view!=='board');
  document.getElementById('viewList').classList.toggle('hidden',view!=='list');
  document.getElementById('viewProjects').classList.toggle('hidden',view!=='projects');
  const t={board:['Tablero','Vista kanban · todos los proyectos'],list:['Lista de tareas','Vista tabular completa'],projects:['Proyectos','Resumen general de proyectos'],trabados:['Proyectos trabados','Pausados por causas externas']};
  document.getElementById('viewTrabados').classList.toggle('hidden',view!=='trabados');
  document.getElementById('pageTitle').textContent=t[view][0];
  document.getElementById('pageSub').textContent=t[view][1];
  renderAll();
}
function filterByStatus(st,el){
  statusFilter=st;
  document.querySelectorAll('.nav-item-filter').forEach(i=>i.classList.remove('active'));
  if(el) el.classList.add('active');
  const esTrabada = st==='trabada';
  document.getElementById('filtersBar').style.display = esTrabada ? 'none' : '';
  document.getElementById('statsRow').style.display   = esTrabada ? 'none' : '';
  renderAll();
}

function getFiltered(){
  const tasks=getTasks();
  const projects=getProjects();
  const trabadoIds=new Set(projects.filter(p=>p.trabado).map(p=>p.id));
  const search=(document.getElementById('searchInput')?.value||'').toLowerCase().trim();
  const proj=document.getElementById('filterProject')?.value||'';
  const prio=document.getElementById('filterPriority')?.value||'';
  const assi=document.getElementById('filterAssignee')?.value||'';
  const sort=document.getElementById('filterSort')?.value||'newest';
  const result=tasks.filter(t=>{
    if(trabadoIds.has(t.projectId)) return false; // excluir tareas de proyectos trabados
    if(search&&!t.title.toLowerCase().includes(search)&&!(t.description||'').toLowerCase().includes(search)&&!(t.tags||'').toLowerCase().includes(search)) return false;
    if(proj&&t.projectId!==proj) return false;
    if(prio&&t.priority!==prio) return false;
    if(assi&&(t.assignee||'').trim()!==assi.trim()) return false;
    if(statusFilter!=='todas'&&t.status!==statusFilter) return false;
    return true;
  });
  result.sort((a,b)=>sort==='oldest'?a.id.localeCompare(b.id):b.id.localeCompare(a.id));
  return result;
}

function renderAll(){
  if(!currentUser) return;
  updateProjectSelect();
  updateAssigneeSelect();
  updateStats();
  if(currentView==='board') renderBoard();
  if(currentView==='list') renderList();
  if(currentView==='projects') renderProjects();
  if(currentView==='trabados') renderTrabados();
  updateTrabadosCount();
}

/* Puebla los selects de responsable en ambos modales con _usuarios */
function populateUserSelects(currentAssignee, currentOwner){
  const opts='<option value="">— Seleccionar —</option>'+_usuarios.map(u=>`<option value="${esc(u.nombre_apellido)}">${esc(u.nombre_apellido)}</option>`).join('');
  const tA=document.getElementById('tAssignee');
  if(tA){ tA.innerHTML=opts; if(currentAssignee) tA.value=currentAssignee; }
  const pO=document.getElementById('pOwner');
  if(pO){ pO.innerHTML=opts; if(currentOwner) pO.value=currentOwner; }
}

/* Solo actualiza los selects de proyecto (filtro + modal), sin tocar el de responsable */
function updateProjectSelect(){
  const projects=getProjects();
  const tasks=getTasks();

  const ps=document.getElementById('filterProject');
  const cp=ps.value;
  ps.innerHTML='<option value="">Todos los proyectos</option>';
  projects.filter(p=>!p.trabado).forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;if(p.id===cp)o.selected=true;ps.appendChild(o);});

  const tp=document.getElementById('tProject');
  if(tp){const c=tp.value;tp.innerHTML='<option value="">Sin proyecto</option>';projects.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;if(p.id===c)o.selected=true;tp.appendChild(o);});}

  document.getElementById('cnt-board').textContent=tasks.length;
  document.getElementById('cnt-list').textContent=tasks.length;
  document.getElementById('cnt-projects').textContent=projects.length;
}

/* Actualiza el select de responsable preservando la selección actual */
function updateAssigneeSelect(){
  const tasks=getTasks();
  const as=document.getElementById('filterAssignee');
  const ca=as.value; // guardar antes de tocar el DOM
  const assignees=[...new Set(tasks.map(t=>(t.assignee||'').trim()).filter(Boolean))].sort();
  as.innerHTML='<option value="">Cualquier responsable</option>';
  assignees.forEach(a=>{
    const o=document.createElement('option');
    o.value=a; o.textContent=a;
    if(a===ca) o.selected=true;
    as.appendChild(o);
  });
}

/* Llamado solo al abrir el modal de tarea, para sincronizar proyectos disponibles */
function updateFilters(){ updateProjectSelect(); updateAssigneeSelect(); }
function updateStats(){
  const t=getTasks();
  document.getElementById('statActivas').textContent=t.filter(x=>x.status==='en-progreso'||x.status==='pendiente').length;
  document.getElementById('statCompletadas').textContent=t.filter(x=>x.status==='completado').length;
  document.getElementById('statProyectos').textContent=getProjects().filter(p=>!p.trabado).length;
}

function renderBoard(){
  const filtered=getFiltered(),projects=getProjects(),board=document.getElementById('kanbanBoard');
  board.innerHTML='';
  COL_CONFIG.forEach(col=>{
    const ct=filtered.filter(t=>t.status===col.id);
    const div=document.createElement('div');div.className='column';
    div.innerHTML=`<div class="column-header"><div class="column-dot" style="background:${col.color}"></div><span class="column-name">${col.label}</span><span class="column-count">${ct.length}</span></div><div class="column-body">${ct.length===0?'<div style="font-size:11px;color:var(--text4);text-align:center;padding:10px;font-family:var(--mono)">vacío</div>':''}${ct.map(t=>taskCardHTML(t,projects)).join('')}${currentUser?.rol==='Editor'?`<button class="add-task-btn" onclick="openTaskModal('${col.id}')">+ agregar tarea</button>`:''}</div>`;
    board.appendChild(div);
  });
}
function taskCardHTML(t,projects){
  const proj=projects.find(p=>p.id===t.projectId);
  const today=new Date().toISOString().slice(0,10);
  const overdue=t.due&&t.due<today&&t.status!=='completado';
  const tags=(t.tags||'').split(',').map(s=>s.trim()).filter(Boolean);
  const ini=t.assignee?t.assignee.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase():'?';
  return `<div class="task-card priority-${t.priority}" onclick="openDetail('${t.id}')">
    <div class="task-title">${esc(t.title)}</div>
    ${proj?`<div class="task-project">◈ ${esc(proj.name)}</div>`:''}
    <div class="task-meta">
      <div class="task-tags"><span class="status-badge p-${t.priority}">${t.priority}</span>${tags.slice(0,2).map((tag,i)=>`<span class="tag ${TAG_CLASSES[i%TAG_CLASSES.length]}">${esc(tag)}</span>`).join('')}</div>
      ${t.assignee?`<div class="assignee-dot">${ini}</div>`:''}
    </div>
    ${t.due?`<div class="task-date ${overdue?'overdue':''}">📅 ${fmtDate(t.due)}${overdue?' · vencida':''}</div>`:''}
    ${t.status==='completado'&&t.completedAt?`<div style="font-size:10px;color:var(--accent);font-family:var(--mono);margin-top:4px">✓ completada ${t.completedAt.slice(0,10)}</div>`:t.createdAt?`<div style="font-size:10px;color:var(--text4);font-family:var(--mono);margin-top:4px">creada ${t.createdAt.includes('T')?new Date(t.createdAt).toLocaleDateString('es-AR'):t.createdAt.slice(0,10)}</div>`:''}
  </div>`;
}

function renderList(){
  const filtered=getFiltered(),projects=getProjects(),body=document.getElementById('listBody');
  if(!filtered.length){body.innerHTML=`<tr><td colspan="7"><div class="empty"><div class="empty-icon">○</div>Sin tareas que mostrar</div></td></tr>`;return;}
  body.innerHTML=filtered.map(t=>{
    const proj=projects.find(p=>p.id===t.projectId);
    const today=new Date().toISOString().slice(0,10);
    const overdue=t.due&&t.due<today&&t.status!=='completado';
    const createdStr=t.createdAt?(t.createdAt.includes('T')?new Date(t.createdAt).toLocaleDateString('es-AR'):t.createdAt.slice(0,10)):'—';
    return `<tr><td class="task-name-cell" onclick="openDetail('${t.id}')">${esc(t.title)}</td><td>${proj?esc(proj.name):'<span style="color:var(--text4)">—</span>'}</td><td><span class="status-badge s-${t.status}">${statusLabel(t.status)}</span></td><td><span class="status-badge p-${t.priority}">${t.priority}</span></td><td>${t.assignee?esc(t.assignee):'<span style="color:var(--text4)">—</span>'}</td><td style="${overdue?'color:var(--red);font-weight:500':''}">${t.due?fmtDate(t.due):'—'}</td><td style="font-size:12px;color:var(--text4);font-family:var(--mono)">${createdStr}</td></tr>`;
  }).join('');
}

function toggleProjectStatus(projId,e){
  e.stopPropagation();
  if(currentUser?.rol!=='Editor') return;
  const projects=getProjects();
  const idx=projects.findIndex(p=>p.id===projId);
  if(idx===-1) return;
  const wasCompleted=projects[idx].status==='completado';
  projects[idx].status=wasCompleted?'activo':'completado';
  if(!wasCompleted&&!projects[idx].completedAt) projects[idx].completedAt=nowAR();
  else if(wasCompleted) projects[idx].completedAt='';
  saveProjects(projects);
  api('saveProyecto',{proyecto:projects[idx]}).then(r=>{if(!r?.ok)showToast(r?.error||'Error guardando proyecto','error');}).catch(()=>showToast('Error de conexión','error'));
  renderAll();
}

function renderProjects(){
  const allProjects=getProjects(),tasks=getTasks(),grid=document.getElementById('projectsGrid');
  const search=(document.getElementById('searchInput')?.value||'').toLowerCase().trim();
  const projects=allProjects.filter(p=>!p.trabado&&(!search||p.name.toLowerCase().includes(search)||(p.description||'').toLowerCase().includes(search)||(p.type||'').toLowerCase().includes(search)||(p.owner||'').toLowerCase().includes(search)));
  if(!projects.length){grid.innerHTML=`<div class="empty"><div class="empty-icon">◈</div>${search?'Sin resultados para "'+search+'"':'No hay proyectos activos'}</div>`;return;}
  const today=new Date().toISOString().slice(0,10);
  grid.innerHTML=projects.map(p=>{
    const pt=tasks.filter(t=>t.projectId===p.id);
    const done=pt.filter(t=>t.status==='completado').length;
    const pct=pt.length?Math.round(done/pt.length*100):0;
    const members=(p.members||'').split(',').map(s=>s.trim()).filter(Boolean);
    const col=TYPE_COLORS[p.type]||TYPE_COLORS.otro;
    const isCompleted=p.status==='completado';
    const isOverdue=p.end&&p.end<today&&!isCompleted;
    const cardStyle=isCompleted?'opacity:0.55;':'';
    const completedBtn=currentUser?.rol==='Editor'
      ?`<button class="btn" style="font-size:11px;padding:3px 10px;margin-top:8px;${isCompleted?'color:var(--accent);border-color:var(--accent)':''}" onclick="toggleProjectStatus('${p.id}',event)">${isCompleted?'↩ Reactivar':'✓ Completar'}</button>`
      :'';
    return `<div class="project-card" style="${cardStyle}" onclick="openProjectDetail('${p.id}')">
      <div class="project-card-header">
        <div class="project-name">${esc(p.name)}</div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
          ${isOverdue?`<span style="font-size:10px;padding:2px 7px;background:var(--red-bg);color:var(--red);border-radius:5px;font-family:var(--mono);border:1px solid rgba(217,79,79,0.2)">vencido</span>`:''}
          ${isCompleted?`<span style="font-size:10px;padding:2px 7px;background:var(--accent-bg2);color:var(--accent-dark);border-radius:5px;font-family:var(--mono);border:1px solid var(--border2)">✓ completado</span>`:''}
          <div class="project-type-badge" style="background:${col.bg};color:${col.color}">${p.type}</div>
        </div>
      </div>
      ${p.description?`<div class="project-desc">${esc(p.description).slice(0,100)}${p.description.length>100?'…':''}</div>`:''}
      <div class="project-progress"><div class="progress-label"><span>Progreso</span><span>${done}/${pt.length} tareas · ${pct}%</span></div><div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div></div>
      <div class="project-footer">
        <div class="project-members">${members.slice(0,4).map(m=>`<div class="member-dot">${m.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}</div>`).join('')}${members.length>4?`<div class="member-dot">+${members.length-4}</div>`:''}</div>
        <div class="project-tasks-count">${pt.length} tarea${pt.length!==1?'s':''}</div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px">
        <div style="font-size:10px;color:var(--text4);font-family:var(--mono)">${isCompleted&&p.completedAt?`✓ completado ${p.completedAt.slice(0,10)}`:p.createdAt?`creado ${p.createdAt.slice(0,10)}`:''}</div>
        ${completedBtn}
      </div>
    </div>`;
  }).join('');
}

function updateTrabadosCount(){
  const n=getProjects().filter(p=>p.trabado).length;
  const el=document.getElementById('cnt-trabados');
  if(el) el.textContent=n;
}

function renderTrabados(){
  const projects=getProjects().filter(p=>p.trabado);
  const tasks=getTasks();
  const el=document.getElementById('trabadosContent');
  if(!projects.length){
    el.innerHTML=`<div class="empty"><div class="empty-icon">⏸</div>No hay proyectos trabados</div>`;
    return;
  }
  el.innerHTML=`
    <div style="background:var(--red-bg);border:1.5px solid rgba(217,79,79,0.25);border-radius:var(--radius-lg);padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
      <span style="font-size:18px">⏸</span>
      <div>
        <div style="font-weight:600;font-size:13px;color:var(--red)">Proyectos pausados por causas externas</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">Sus tareas están ocultas del tablero y las listas hasta que se reactiven.</div>
      </div>
    </div>
    <div class="projects-grid">
      ${projects.map(p=>{
        const pt=tasks.filter(t=>t.projectId===p.id);
        const members=(p.members||'').split(',').map(s=>s.trim()).filter(Boolean);
        const col=TYPE_COLORS[p.type]||TYPE_COLORS.otro;
        return `<div class="project-card" style="border-color:rgba(217,79,79,0.35);" onclick="openProjectDetail('${p.id}')">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
            <span style="font-size:11px;padding:2px 8px;background:var(--red-bg);color:var(--red);border-radius:5px;font-family:var(--mono);font-weight:500;border:1px solid rgba(217,79,79,0.2)">⏸ trabado</span>
            <div class="project-type-badge" style="background:${col.bg};color:${col.color}">${p.type}</div>
          </div>
          <div class="project-name" style="margin-bottom:6px">${esc(p.name)}</div>
          ${p.motivo?`<div style="font-size:12px;color:var(--red);background:var(--red-bg);padding:8px 10px;border-radius:var(--radius);margin-bottom:10px;line-height:1.5;font-style:italic">"${esc(p.motivo)}"</div>`:''}
          <div class="project-footer" style="margin-top:8px">
            <div class="project-members">${members.slice(0,4).map(m=>`<div class="member-dot">${m.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}</div>`).join('')}</div>
            <div class="project-tasks-count">${pt.length} tarea${pt.length!==1?'s':''} pausadas</div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

function toggleMotivo(){
  const checked=document.getElementById('pTrabado').checked;
  document.getElementById('motivoGroup').style.display=checked?'':'none';
}

function openTaskModal(preStatus){
  if(currentUser?.rol==='Lector') return;
  editingTaskId=null;
  document.getElementById('taskModalTitle').textContent='Nueva tarea';
  ['tTitle','tDesc','tTags','tNotes'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('tStatus').value=preStatus||'pendiente';
  document.getElementById('tPriority').value='media';
  document.getElementById('tDue').value='';
  updateFilters();
  document.getElementById('tProject').value='';
  // preseleccionar el nombre_apellido del usuario actual si está en _usuarios
  const myName=currentUser?.nombre_apellido||'';
  populateUserSelects(myName, null);
  document.getElementById('taskModal').classList.remove('hidden');
}
function openEditTaskModal(id){
  if(currentUser?.rol==='Lector') return;
  const t=getTasks().find(x=>x.id===id);if(!t) return;
  editingTaskId=id;
  document.getElementById('taskModalTitle').textContent='Editar tarea';
  document.getElementById('tTitle').value=t.title;
  document.getElementById('tDesc').value=t.description||'';
  document.getElementById('tStatus').value=t.status;
  document.getElementById('tPriority').value=t.priority;
  document.getElementById('tDue').value=t.due||'';
  document.getElementById('tTags').value=t.tags||'';
  document.getElementById('tNotes').value=t.notes||'';
  updateFilters();
  document.getElementById('tProject').value=t.projectId||'';
  populateUserSelects(t.assignee||'', null);
  document.getElementById('taskModal').classList.remove('hidden');
}
async function saveTask(){
  if(_saving) return;
  const title=document.getElementById('tTitle').value.trim();
  if(!title){showToast('El título es obligatorio','error');return;}
  const assignee=document.getElementById('tAssignee').value.trim();
  if(!assignee){showToast('El responsable es obligatorio','error');return;}
  _saving=true;
  const btn=document.querySelector('#taskModal .btn-primary');
  if(btn){btn.disabled=true;btn.textContent='Guardando...';}
  try{
    const task={id:editingTaskId||uid(),title,description:document.getElementById('tDesc').value.trim(),projectId:document.getElementById('tProject').value,status:document.getElementById('tStatus').value,priority:document.getElementById('tPriority').value,assignee,due:document.getElementById('tDue').value,tags:document.getElementById('tTags').value.trim(),notes:document.getElementById('tNotes').value.trim(),createdBy:currentUser.usuario,createdByName:currentUser.nombre_apellido||currentUser.usuario,updatedAt:nowAR()};
    let tasks=getTasks();
    const msgTarea=editingTaskId?'Tarea actualizada':'Tarea creada correctamente';
    if(editingTaskId){const idx=tasks.findIndex(t=>t.id===editingTaskId);task.createdAt=tasks[idx].createdAt;tasks[idx]=task;}
    else{task.createdAt=nowAR();tasks.push(task);}
    saveTasks(tasks);
    showToast(msgTarea);closeModal('taskModal');renderAll();
    try{const r=await api('saveTarea',{tarea:task});if(!r?.ok) showToast(r?.error||'Error al sincronizar con el servidor','error');}
    catch(e){showToast('Error de conexión al sincronizar','error');}
  }finally{
    _saving=false;
    if(btn){btn.disabled=false;btn.textContent='Guardar tarea';}
  }
}
function openProjectModal(){
  if(currentUser?.rol==='Lector') return;
  editingProjectId=null;
  document.getElementById('projModalTitle').textContent='Nuevo proyecto';
  ['pName','pDesc','pStart','pEnd'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('pMembers').value='';
  document.getElementById('pType').value='evento';
  document.getElementById('trabadoSection').classList.add('hidden');
  document.getElementById('btnDeleteProject').classList.add('hidden');
  document.getElementById('pTrabado').checked=false;
  document.getElementById('motivoGroup').style.display='none';
  if(document.getElementById('pMotivo')) document.getElementById('pMotivo').value='';
  populateUserSelects(null, null);
  buildMembersDropdown([]);
  syncMembersValue();
  document.getElementById('projectModal').classList.remove('hidden');
}
async function saveProject(){
  if(_saving) return;
  const name=document.getElementById('pName').value.trim();
  if(!name){showToast('El nombre es obligatorio','error');return;}
  const owner=document.getElementById('pOwner').value.trim();
  if(!owner){showToast('El responsable principal es obligatorio','error');return;}
  _saving=true;
  const btn=document.querySelector('#projectModal .btn-primary');
  if(btn){btn.disabled=true;btn.textContent='Guardando...';}
  try{
    const trabado=document.getElementById('pTrabado').checked;
    const projects=getProjects();
    const existing=editingProjectId?projects.find(p=>p.id===editingProjectId):null;
    const project={id:editingProjectId||uid(),name,description:document.getElementById('pDesc').value.trim(),type:document.getElementById('pType').value,owner,start:document.getElementById('pStart').value,end:document.getElementById('pEnd').value,members:document.getElementById('pMembers').value.trim(),trabado,motivo:trabado?document.getElementById('pMotivo').value.trim():'',status:existing?.status||'activo',completedAt:existing?.completedAt||'',createdAt:existing?.createdAt||nowAR()};
    const msgProyecto=editingProjectId?'Proyecto actualizado':'Proyecto creado';
    if(editingProjectId){projects[projects.findIndex(p=>p.id===editingProjectId)]=project;}
    else{projects.push(project);}
    saveProjects(projects);
    try{const r=await api('saveProyecto',{proyecto:project});if(!r?.ok){showToast(r?.error||'Error guardando proyecto','error');return;}}
    catch(e){showToast('Error de conexión','error');return;}
    showToast(msgProyecto);closeModal('projectModal');renderAll();
  }finally{
    _saving=false;
    if(btn){btn.disabled=false;btn.textContent='Guardar proyecto';}
  }
}
function openDetail(taskId){
  const t=getTasks().find(x=>x.id===taskId);if(!t) return;
  const proj=getProjects().find(p=>p.id===t.projectId);
  const today=new Date().toISOString().slice(0,10);
  const overdue=t.due&&t.due<today&&t.status!=='completado';
  document.getElementById('detailContent').innerHTML=`<div class="task-detail"><div><div class="detail-title">${esc(t.title)}</div>${(()=>{if(currentUser?.rol==='Editor')return`<div style="margin-top:8px"><select class="select" style="font-size:12px;padding:3px 8px" onchange="changeTaskProject('${t.id}',this.value)"><option value="">Sin proyecto</option>${getProjects().map(p=>`<option value="${p.id}"${p.id===t.projectId?' selected':''}>${esc(p.name)}</option>`).join('')}</select></div>`;return proj?`<div style="font-family:var(--mono);font-size:11px;color:var(--text3);margin-top:4px">◈ ${esc(proj.name)}</div>`:'';})()}</div>${t.description?`<div><div class="detail-label">descripción</div><div style="font-size:13px;line-height:1.6;color:var(--text2);background:var(--surface2);padding:12px;border-radius:var(--radius);border:1px solid var(--border)">${esc(t.description)}</div></div>`:''}<div><div class="detail-label">estado</div><div class="status-row">${['pendiente','en-progreso','revision','completado','trabada'].map(s=>`<button class="status-opt ${t.status===s?'selected':''}" data-val="${s}" onclick="changeStatus('${t.id}','${s}')">${statusLabel(s)}</button>`).join('')}</div></div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;"><div><div class="detail-label">prioridad</div><span class="status-badge p-${t.priority}">${t.priority}</span></div><div><div class="detail-label">responsable</div><span style="font-size:13px;font-weight:500">${t.assignee?esc(t.assignee):'—'}</span></div><div><div class="detail-label">vencimiento</div><span style="font-size:13px;font-weight:500;${overdue?'color:var(--red)':''}">${t.due?fmtDate(t.due)+(overdue?' · vencida':''):'—'}</span></div></div>${t.tags?`<div><div class="detail-label">etiquetas</div><div style="display:flex;gap:6px;flex-wrap:wrap">${t.tags.split(',').map((tag,i)=>`<span class="tag ${TAG_CLASSES[i%TAG_CLASSES.length]}">${esc(tag.trim())}</span>`).join('')}</div></div>`:''  }${t.notes?`<div><div class="detail-label">notas internas</div><div style="font-size:12px;color:var(--text2);background:var(--surface2);padding:12px;border-radius:var(--radius);border:1px solid var(--border);font-family:var(--mono);line-height:1.6">${esc(t.notes)}</div></div>`:''}<div style="font-size:11px;color:var(--text4);font-family:var(--mono);padding-top:4px">creada por ${esc(t.createdByName||((_usuarios.find(x=>x.usuario===t.createdBy)||{}).nombre_apellido)||t.createdBy||'?')} · ${t.createdAt?(t.createdAt.includes('T')?new Date(t.createdAt).toLocaleDateString('es-AR'):t.createdAt.slice(0,10)):''}${t.completedAt?` · <span style="color:var(--accent)">✓ completada ${t.completedAt.slice(0,10)}</span>`:''}</div></div>`;
  document.getElementById('detailFooter').innerHTML=currentUser?.rol==='Editor'?`<button class="btn btn-danger" onclick="deleteTask('${t.id}')">Eliminar</button><button class="btn btn-ghost" onclick="closeModal('detailModal')">Cerrar</button><button class="btn btn-primary" onclick="closeModal('detailModal');openEditTaskModal('${t.id}')">Editar tarea</button>`:`<button class="btn btn-ghost" onclick="closeModal('detailModal')">Cerrar</button>`;
  document.getElementById('detailModal').classList.remove('hidden');
}
function changeStatus(taskId,status){
  let tasks=getTasks();const idx=tasks.findIndex(t=>t.id===taskId);if(idx===-1) return;
  tasks[idx].status=status;
  if(status==='completado'&&!tasks[idx].completedAt) tasks[idx].completedAt=nowAR();
  else if(status!=='completado') tasks[idx].completedAt='';
  saveTasks(tasks);api('saveTarea',{tarea:tasks[idx]}).then(r=>{if(!r?.ok)showToast(r?.error||'Error guardando estado','error');}).catch(()=>showToast('Error de conexión','error'));openDetail(taskId);renderAll();
}
function changeTaskProject(taskId,projectId){
  let tasks=getTasks();const idx=tasks.findIndex(t=>t.id===taskId);if(idx===-1) return;
  tasks[idx].projectId=projectId;saveTasks(tasks);api('saveTarea',{tarea:tasks[idx]}).then(r=>{if(!r?.ok)showToast(r?.error||'Error guardando proyecto','error');}).catch(()=>showToast('Error de conexión','error'));openDetail(taskId);renderAll();
}
async function deleteTask(id){
  if(!confirm('¿Eliminar esta tarea? Esta acción no se puede deshacer.')) return;
  saveTasks(getTasks().filter(t=>t.id!==id));
  try{const r=await api('deleteTarea',{id});if(!r?.ok){showToast(r?.error||'Error eliminando tarea','error');return;}}
  catch(e){showToast('Error de conexión','error');return;}
  closeModal('detailModal');showToast('Tarea eliminada');renderAll();
}
async function deleteProject(){
  if(!editingProjectId) return;
  if(!confirm('¿Eliminar este proyecto? Sus tareas no se eliminarán automáticamente.')) return;
  saveProjects(getProjects().filter(p=>p.id!==editingProjectId));
  try{const r=await api('deleteProyecto',{id:editingProjectId});if(!r?.ok){showToast(r?.error||'Error eliminando proyecto','error');return;}}
  catch(e){showToast('Error de conexión','error');return;}
  closeModal('projectModal');showToast('Proyecto eliminado');renderAll();
}
function openProjectDetail(projId){
  if(currentUser?.rol!=='Editor') return;
  const p=getProjects().find(x=>x.id===projId);if(!p) return;
  editingProjectId=projId;
  document.getElementById('projModalTitle').textContent='Editar proyecto';
  document.getElementById('pName').value=p.name;
  document.getElementById('pDesc').value=p.description||'';
  document.getElementById('pType').value=p.type;
  document.getElementById('pStart').value=p.start||'';
  document.getElementById('pEnd').value=p.end||'';
  // poblar selects de usuarios
  populateUserSelects(null, p.owner||'');
  // poblar multiselect de miembros
  const selectedMembers=(p.members||'').split(',').map(s=>s.trim()).filter(Boolean);
  buildMembersDropdown(selectedMembers);
  syncMembersValue();
  // mostrar sección trabado solo al editar
  document.getElementById('trabadoSection').classList.remove('hidden');
  document.getElementById('btnDeleteProject').classList.remove('hidden');
  document.getElementById('pTrabado').checked=!!p.trabado;
  document.getElementById('motivoGroup').style.display=p.trabado?'':'none';
  document.getElementById('pMotivo').value=p.motivo||'';
  document.getElementById('projectModal').classList.remove('hidden');
}
function closeModal(id){document.getElementById(id).classList.add('hidden');}
function statusLabel(s){return{pendiente:'Pendiente','en-progreso':'En progreso',revision:'En revisión',completado:'Completado',trabada:'Trabada'}[s]||s;}
function fmtDate(d){if(!d) return'';const[y,m,day]=d.slice(0,10).split('-');return`${day}/${m}/${y}`;}
function esc(str){return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
let toastTimer;
function showToast(msg,type='success'){document.querySelector('.toast')?.remove();const t=document.createElement('div');t.className=`toast ${type}`;t.textContent=msg;document.body.appendChild(t);clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.remove(),2800);}
document.addEventListener('keydown',e=>{if(e.key==='Escape')['taskModal','projectModal','detailModal'].forEach(id=>document.getElementById(id).classList.add('hidden'));});
document.querySelectorAll('.modal-overlay').forEach(o=>{o.addEventListener('click',e=>{if(e.target===o)o.classList.add('hidden');});});
window.addEventListener('DOMContentLoaded',async()=>{
  const saved=localStorage.getItem('ce_session');
  if(saved){
    currentUser=JSON.parse(saved);
    document.getElementById('loadingScreen').classList.remove('hidden');
    try{await loadData();}catch(e){showToast('Error cargando datos','error');}
    document.getElementById('loadingScreen').classList.add('hidden');
    applySession();
  }else{
    document.getElementById('loginScreen').classList.remove('hidden');
  }
});
