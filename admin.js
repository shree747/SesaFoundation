/* ══════════════════════════════════════════════
   SESA FOUNDATION — ADMIN PORTAL JAVASCRIPT
   Supabase Postgres + localStorage fallback
══════════════════════════════════════════════ */

/* ── SUPABASE AVAILABILITY ────────────────── */
const SUPABASE_OK = (typeof supabaseClient !== 'undefined');

/* ── CONSTANTS & STATE ────────────────────── */
const LS = {
    marathons  : 'sesa_marathons',
    registrations: 'sesa_registrations',
    activity   : 'sesa_activity',
    pin        : 'sesa_admin_pin',
    published  : 'sesa_published_marathon',
};

const DEFAULT_PIN = '1234';

let state = {
    marathons     : [],
    registrations : [],
    activity      : [],
    currentPage   : 'dashboard',
    pendingAction : null,
    editId        : null,
};

/* ── UTILS ────────────────────────────────── */
function lsLoad(key, fallback = []) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
}
function lsSave(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function fmtDate(val) {
    if (!val) return '—';
    const d = new Date(val);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
        + ' ' + d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
}

function fmtRelative(val) {
    if (!val) return '—';
    const diff = Date.now() - new Date(val).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    buildParticles();
    startClock();
    loadAllFromLS(); // always preload from LS; refreshAll() will overwrite with live data
});

function loadAllFromLS() {
    state.marathons     = lsLoad(LS.marathons,     []);
    state.registrations = lsLoad(LS.registrations, []);
    state.activity      = lsLoad(LS.activity,      []);
    refreshBadges();
}

/* ── PARTICLES ────────────────────────────── */
function buildParticles() {
    const wrap = document.getElementById('particles');
    if (!wrap) return;
    for (let i = 0; i < 22; i++) {
        const el = document.createElement('span');
        el.style.cssText = `left:${Math.random()*100}%;width:${Math.random()*4+1}px;height:${Math.random()*4+1}px;animation-delay:${Math.random()*8}s;animation-duration:${Math.random()*6+5}s;background:${Math.random()>0.5?'#ff003c':'#ffd700'};opacity:${Math.random()*0.4};`;
        wrap.appendChild(el);
    }
}

/* ── CLOCK ────────────────────────────────── */
function startClock() {
    const el = document.getElementById('topbar-time');
    if (!el) return;
    const tick = () => el.textContent = new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    tick();
    setInterval(tick, 1000);
}

/* ══════════════════════════════════════════
   PIN LOGIN
══════════════════════════════════════════ */
let pinBuffer = '';

function enterPin(digit) {
    if (pinBuffer.length >= 4) return;
    pinBuffer += digit;
    updateDots();
    if (pinBuffer.length === 4) setTimeout(checkPin, 280);
}

function deletePin() { pinBuffer = pinBuffer.slice(0, -1); updateDots(); }

function updateDots() {
    for (let i = 0; i < 4; i++)
        document.getElementById(`d${i}`)?.classList.toggle('filled', i < pinBuffer.length);
}

function checkPin() {
    const correct = lsLoad(LS.pin, DEFAULT_PIN);
    if (pinBuffer === correct) {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app').classList.add('visible');
        refreshAll();
        logActivity('Admin logged in', 'green');
    } else {
        pinBuffer = ''; updateDots();
        const card = document.getElementById('login-card');
        card?.classList.add('shake');
        card?.addEventListener('animationend', () => card.classList.remove('shake'), { once:true });
        const err = document.getElementById('pin-error');
        err?.classList.add('visible');
        setTimeout(() => err?.classList.remove('visible'), 2200);
    }
}

function logout() {
    pinBuffer = ''; updateDots();
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.remove('visible');
}

/* ══════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════ */
const PAGE_TITLES = {
    dashboard:'Dashboard', marathons:'Marathon Events',
    registrations:'Registrations', settings:'Settings',
};

function navigate(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`page-${page}`)?.classList.add('active');
    document.getElementById(`nav-${page}`)?.classList.add('active');
    document.getElementById('topbar-title').textContent = PAGE_TITLES[page] || page;
    state.currentPage = page;
    document.getElementById('sidebar')?.classList.remove('open');

    if (page === 'dashboard')     renderDashboard();
    if (page === 'marathons')     renderMarathonTable();
    if (page === 'registrations') renderRegistrations();
}

function toggleSidebar() { document.getElementById('sidebar')?.classList.toggle('open'); }

/* ══════════════════════════════════════════
   REFRESH ALL
══════════════════════════════════════════ */
async function refreshAll() {
    if (SUPABASE_OK) {
        try {
            state.marathons     = await getAllMarathons();
            state.registrations = await getAllRegistrations();
        } catch (e) {
            console.warn('Supabase unavailable, using localStorage:', e.message);
            state.marathons     = lsLoad(LS.marathons,     []);
            state.registrations = lsLoad(LS.registrations, []);
        }
    } else {
        state.marathons     = lsLoad(LS.marathons,     []);
        state.registrations = lsLoad(LS.registrations, []);
    }
    state.activity = lsLoad(LS.activity, []);
    refreshBadges();
    renderDashboard();
    syncPublicSiteLS();
    loadFoundationLeads();
}

function refreshBadges() {
    document.getElementById('marathon-count-badge').textContent = state.marathons.length;
    document.getElementById('reg-count-badge').textContent      = state.registrations.length;
}

/* ══════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════ */
function renderDashboard() {
    const ms  = state.marathons;
    const rs  = state.registrations;
    const now = Date.now();

    document.getElementById('stat-total').textContent    = ms.length;
    document.getElementById('stat-active').textContent   = ms.filter(m => m.status === 'published').length;
    document.getElementById('stat-regs').textContent     = rs.length;
    document.getElementById('stat-upcoming').textContent = ms.filter(m => m.date && new Date(m.date).getTime() > now).length;

    // Activity log
    const al   = document.getElementById('activity-list');
    const acts = lsLoad(LS.activity, []);
    al.innerHTML = acts.length === 0
        ? `<div style="color:var(--text-dim);font-size:0.84rem;text-align:center;padding:2rem 0">No activity yet. Create your first marathon!</div>`
        : acts.slice(0, 8).map(a => `
            <div class="activity-item">
                <div class="a-dot ${a.color||'green'}"></div>
                <div><p>${a.msg}</p><time>${fmtRelative(a.ts)}</time></div>
            </div>`).join('');

    // Live preview card
    const pub  = ms.find(m => m.status === 'published');
    const wrap = document.getElementById('live-preview-wrap');
    if (pub) {
        wrap.style.display = 'block';
        document.getElementById('live-preview-content').innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1rem">
                <div><div style="font-size:0.7rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:0.3rem">Event</div><strong style="color:var(--text-main)">${pub.name}</strong></div>
                <div><div style="font-size:0.7rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:0.3rem">Date</div><span>${fmtDate(pub.date)}</span></div>
                <div><div style="font-size:0.7rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:0.3rem">Location</div><span>${pub.location||'—'}</span></div>
                <div><div style="font-size:0.7rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:0.3rem">Distance</div><span>${pub.distance}</span></div>
            </div>`;
    } else {
        wrap.style.display = 'none';
    }
    refreshBadges();
}

/* ══════════════════════════════════════════
   MARATHON TABLE
══════════════════════════════════════════ */
async function renderMarathonTable() {
    if (SUPABASE_OK) {
        try { state.marathons = await getAllMarathons(); }
        catch (_) {}
    }

    const query = (document.getElementById('marathon-search')?.value || '').toLowerCase();
    const sfilt = document.getElementById('status-filter')?.value || '';

    const rows = state.marathons.filter(m => {
        const q = !query || (m.name||'').toLowerCase().includes(query) || (m.location||'').toLowerCase().includes(query);
        const s = !sfilt || m.status === sfilt;
        return q && s;
    });

    const tbody = document.getElementById('marathon-tbody');
    const empty = document.getElementById('marathon-empty');
    const table = document.getElementById('marathon-table');

    if (rows.length === 0) { table.style.display = 'none'; empty.style.display = 'block'; return; }
    table.style.display = ''; empty.style.display = 'none';

    tbody.innerHTML = rows.map(m => {
        const isPub = m.status === 'published';
        return `
        <tr>
            <td data-label="Event"><div class="event-name"><strong>${m.name}</strong><span>${m.organiser||'Sesa Foundation'}</span></div></td>
            <td data-label="Date">${fmtDate(m.date)}</td>
            <td data-label="Location">${m.location||'—'}</td>
            <td data-label="Distance">${m.distance||'—'}</td>
            <td data-label="Capacity">${m.capacity ? Number(m.capacity).toLocaleString() : '∞'}</td>
            <td data-label="Status">
                <span class="badge badge-${m.status}">${capitalize(m.status)}</span>
                ${isPub ? '<span class="live-indicator" style="margin-left:0.4rem"><span class="live-dot"></span> Live</span>' : ''}
            </td>
            <td data-label="Actions"><div class="action-btns">
                <button class="btn btn-icon btn-outline" title="Edit" onclick="openEditModal('${m.id}')">✏️</button>
                ${isPub
                    ? `<button class="btn btn-icon btn-outline" title="Unpublish" onclick="togglePublish('${m.id}',false)">📴</button>`
                    : `<button class="btn btn-icon btn-green btn-sm" title="Publish" onclick="togglePublish('${m.id}',true)">📢</button>`}
                <button class="btn btn-icon btn-danger" title="Delete" onclick="deleteMarathon('${m.id}')">🗑️</button>
            </div></td>
        </tr>`;
    }).join('');
}

/* ── PUBLISH / UNPUBLISH ──────────────────── */
async function togglePublish(id, publish) {
    const m = state.marathons.find(x => x.id === id);
    if (!m) return;

    if (SUPABASE_OK) {
        try {
            if (publish) await dbUnpublishAll(); // unpublish others first
            await dbSaveMarathon({ status: publish ? 'published' : 'draft' }, id);
        } catch (e) { toast('❌ Supabase: ' + e.message, 'error'); return; }
    } else {
        state.marathons = state.marathons.map(x => ({
            ...x,
            status: x.id === id
                ? (publish ? 'published' : 'draft')
                : (publish && x.status === 'published' ? 'draft' : x.status),
        }));
        lsSave(LS.marathons, state.marathons);
    }

    await refreshAll();
    renderMarathonTable();
    toast(publish ? `✅ "${m.name}" is now LIVE!` : `📴 Event unpublished.`, publish ? 'success' : 'info');
    logActivity(`${publish ? 'Published' : 'Unpublished'}: ${m.name}`, publish ? 'green' : 'gold');
}

/* ── DELETE ───────────────────────────────── */
function deleteMarathon(id) {
    const m = state.marathons.find(x => x.id === id);
    openConfirm('🗑️', `Delete "${m?.name}"?`, 'This marathon event will be permanently removed.', 'Delete Event', async () => {
        if (SUPABASE_OK) {
            try { await deleteMarathonDB(id); }
            catch (e) { toast('❌ ' + e.message, 'error'); return; }
        } else {
            state.marathons = state.marathons.filter(x => x.id !== id);
            lsSave(LS.marathons, state.marathons);
        }
        await refreshAll(); renderMarathonTable();
        toast(`🗑️ "${m?.name}" deleted.`, 'error');
        logActivity(`Deleted: ${m?.name}`, 'red');
    });
}

/* ══════════════════════════════════════════
   CREATE / EDIT MODAL
══════════════════════════════════════════ */
function openCreateModal() {
    state.editId = null;
    document.getElementById('modal-title').textContent = '➕ Create Marathon Event';
    clearForm();
    document.getElementById('marathon-modal').classList.add('open');
}

function openEditModal(id) {
    const m = state.marathons.find(x => x.id === id);
    if (!m) return;
    state.editId = id;
    document.getElementById('modal-title').textContent = '✏️ Edit Marathon Event';
    fillForm(m);
    document.getElementById('marathon-modal').classList.add('open');
}

function closeModal() { document.getElementById('marathon-modal').classList.remove('open'); }

function clearForm() {
    ['f-name','f-date','f-location','f-capacity','f-organiser','f-desc','f-image'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const feeEl = document.getElementById('f-fee');
    if (feeEl) feeEl.value = '0';
    document.getElementById('f-distance').value = '10K';
    const r = document.querySelector('input[name="f-status"][value="draft"]');
    if (r) r.checked = true;
}

function fillForm(m) {
    document.getElementById('f-name').value      = m.name || '';
    document.getElementById('f-date').value      = m.date ? new Date(m.date).toISOString().slice(0,16) : '';
    document.getElementById('f-location').value  = m.location || '';
    document.getElementById('f-capacity').value  = m.capacity || '';
    document.getElementById('f-fee').value       = m.fee ?? 0;
    document.getElementById('f-organiser').value = m.organiser || '';
    document.getElementById('f-desc').value      = m.description || '';
    document.getElementById('f-image').value     = m.image || '';
    document.getElementById('f-distance').value  = m.distance || '10K';
    const r = document.querySelector(`input[name="f-status"][value="${m.status||'draft'}"]`);
    if (r) r.checked = true;
}

/* ── SAVE MARATHON (form handler) ──────────── */
async function handleSaveMarathon() {
    const name      = document.getElementById('f-name').value.trim();
    const date      = document.getElementById('f-date').value;
    const location  = document.getElementById('f-location').value.trim();
    const distance  = document.getElementById('f-distance').value;
    const capacity  = parseInt(document.getElementById('f-capacity').value) || null;
    const fee       = parseFloat(document.getElementById('f-fee').value) || 0;
    const organiser = document.getElementById('f-organiser').value.trim() || 'Sesa Foundation';
    const description = document.getElementById('f-desc').value.trim();
    const image     = document.getElementById('f-image').value.trim();
    const status    = document.querySelector('input[name="f-status"]:checked')?.value || 'draft';

    if (!name) { toast('Event name is required.', 'error'); return; }
    if (!date) { toast('Race date & time is required.', 'error'); return; }

    const record = { name, date, location, distance, capacity, fee, organiser, description, image, status };

    const saveBtn = document.querySelector('.modal-footer .btn-primary');
    if (saveBtn) { saveBtn.textContent = '⏳ Saving…'; saveBtn.disabled = true; }

    try {
        if (SUPABASE_OK) {
            if (status === 'published') await dbUnpublishAll();
            await dbSaveMarathon(record, state.editId || null);
        } else {
            if (state.editId) {
                state.marathons = state.marathons.map(m => m.id === state.editId ? { ...m, ...record } : m);
            } else {
                if (status === 'published')
                    state.marathons = state.marathons.map(m => m.status === 'published' ? { ...m, status:'draft' } : m);
                state.marathons.unshift({ id: uid(), created_at: new Date().toISOString(), ...record });
            }
            lsSave(LS.marathons, state.marathons);
        }

        logActivity(`${state.editId ? 'Updated' : 'Created'}: ${name}`, state.editId ? 'gold' : 'green');
        toast(`${state.editId ? '✅ Updated' : '🎉 Created'}: "${name}"`, 'success');
        await refreshAll(); renderMarathonTable(); closeModal();
    } catch (e) {
        toast('❌ Save failed: ' + e.message, 'error');
    } finally {
        if (saveBtn) { saveBtn.textContent = '💾 Save Event'; saveBtn.disabled = false; }
    }
}

/* ══════════════════════════════════════════
   REGISTRATIONS
══════════════════════════════════════════ */
async function renderRegistrations() {
    if (SUPABASE_OK) {
        try { state.registrations = await getAllRegistrations(); }
        catch (_) {}
    }

    const mf = document.getElementById('reg-marathon-filter')?.value || '';
    const sf = document.getElementById('reg-status-filter')?.value   || '';

    // Populate marathon dropdown
    const dd = document.getElementById('reg-marathon-filter');
    if (dd) {
        const cur = dd.value;
        dd.innerHTML = `<option value="">All Marathons</option>` +
            state.marathons.map(m => `<option value="${m.id}" ${cur===m.id?'selected':''}>${m.name}</option>`).join('');
        if (cur) dd.value = cur;
    }

    const rows = state.registrations.filter(r => {
        const matchM = !mf || r.marathonId === mf || r.marathon_id === mf;
        const matchS = !sf || r.status === sf;
        return matchM && matchS;
    });

    const tbody = document.getElementById('reg-tbody');
    const empty = document.getElementById('reg-empty');

    if (!rows.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    tbody.innerHTML = rows.map((r, i) => `
        <tr>
            <td data-label="#">${i+1}</td>
            <td data-label="Name"><strong>${r.name||'—'}</strong><br/><span style="font-size:0.76rem;color:var(--text-muted)">${r.category||''} ${r.tshirt?'/ '+r.tshirt:''}</span></td>
            <td data-label="Email"><a href="mailto:${r.email}" style="color:#00b3ff">${r.email||'—'}</a></td>
            <td data-label="Phone">${r.phone||'—'}</td>
            <td data-label="Marathon"><span style="font-size:0.82rem">${r.marathonName||r.marathon_name||'—'}</span></td>
            <td data-label="Submitted">${fmtDate(r.submittedAt||r.submitted_at)}</td>
            <td data-label="Status">
                <span class="badge ${r.status==='confirmed'?'badge-published':r.status==='cancelled'?'badge-cancelled':'badge-draft'}">${capitalize(r.status||'pending')}</span>
            </td>
            <td data-label="Actions"><div class="action-btns">
                ${r.status!=='confirmed'
                    ? `<button class="btn btn-green btn-sm" onclick="changeRegStatus('${r.id}','confirmed')">✅ Confirm</button>`
                    : `<button class="btn btn-outline btn-sm" onclick="changeRegStatus('${r.id}','pending')">⏳ Pending</button>`}
                <button class="btn btn-icon btn-danger" onclick="deleteReg('${r.id}')">🗑️</button>
            </div></td>
        </tr>`).join('');
}

async function changeRegStatus(id, status) {
    if (SUPABASE_OK) {
        try { await updateRegistrationStatus(id, status); }
        catch (e) { toast('❌ ' + e.message, 'error'); return; }
    } else {
        state.registrations = state.registrations.map(r => r.id === id ? { ...r, status } : r);
        lsSave(LS.registrations, state.registrations);
    }
    await renderRegistrations(); renderDashboard();
    toast(status === 'confirmed' ? '✅ Confirmed!' : '⏳ Marked pending.', status === 'confirmed' ? 'success' : 'info');
}

async function deleteReg(id) {
    if (SUPABASE_OK) {
        try { await deleteRegistrationDB(id); }
        catch (e) { toast('❌ ' + e.message, 'error'); return; }
    } else {
        state.registrations = state.registrations.filter(r => r.id !== id);
        lsSave(LS.registrations, state.registrations);
    }
    await renderRegistrations(); renderDashboard(); refreshBadges();
    toast('🗑️ Registration removed.', 'error');
}

function exportRegistrations() {
    if (!state.registrations.length) { toast('No registrations to export.', 'warning'); return; }
    const header = ['#','Name','Email','Phone','Marathon','Category','T-Shirt','Experience','City','Emergency Contact','Medical','Status','Submitted'];
    const body = state.registrations.map((r, i) => [
        i+1, r.name, r.email, r.phone||'',
        r.marathonName||r.marathon_name||'',
        r.category||'', r.tshirt||'', r.exp||r.experience||'', r.city||'',
        r.emergencyContact || r.emergency_contact
            ? JSON.stringify(r.emergencyContact || r.emergency_contact) : '',
        (r.medicalInfo||r.medical_info||'').replace(/,/g,' '),
        r.status||'pending', r.submittedAt||r.submitted_at||'',
    ].map(v => `"${v}"`).join(','));
    const csv = [header.join(','), ...body].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `sesa_registrations_${Date.now()}.csv`;
    a.click();
    toast('⬇ Exported!', 'success');
}

/* ══════════════════════════════════════════
   PUBLIC SITE SYNC (localStorage bridge)
══════════════════════════════════════════ */
function syncPublicSiteLS() {
    const pub = state.marathons.find(m => m.status === 'published');
    if (pub) {
        lsSave(LS.published, {
            id:pub.id, name:pub.name, date:pub.date,
            location:pub.location, distance:pub.distance,
            fee:pub.fee, organiser:pub.organiser, description:pub.description, image:pub.image,
        });
    } else {
        localStorage.removeItem(LS.published);
    }
}

/* ══════════════════════════════════════════
   SETTINGS
══════════════════════════════════════════ */
function changePin() {
    const inp = document.getElementById('new-pin');
    const val = inp.value.trim();
    if (!/^\d{4}$/.test(val)) { toast('PIN must be exactly 4 digits.', 'error'); return; }
    lsSave(LS.pin, val);
    inp.value = '';
    toast('🔐 PIN updated!', 'success');
    logActivity('Admin PIN changed', 'gold');
}

function confirmClearMarathons() {
    openConfirm('🗑️', 'Clear All Marathon Events?', 'All marathon data will be permanently deleted.', 'Clear All', async () => {
        if (SUPABASE_OK) {
            try {
                const all = await getAllMarathons();
                for (const m of all) await deleteMarathonDB(m.id);
            } catch (e) { toast('❌ ' + e.message, 'error'); return; }
        }
        lsSave(LS.marathons, []); localStorage.removeItem(LS.published);
        state.marathons = [];
        await refreshAll();
        toast('All marathon events cleared.', 'info'); logActivity('All marathons cleared', 'red');
    });
}

function confirmClearRegs() {
    openConfirm('🗑️', 'Clear All Registrations?', 'All registration records will be permanently deleted.', 'Clear All', async () => {
        if (SUPABASE_OK) {
            try {
                const all = await getAllRegistrations();
                for (const r of all) await deleteRegistrationDB(r.id);
            } catch (e) { toast('❌ ' + e.message, 'error'); return; }
        }
        lsSave(LS.registrations, []); state.registrations = [];
        await refreshAll();
        toast('All registrations cleared.', 'info'); logActivity('All registrations cleared', 'red');
    });
}

function confirmResetAll() {
    openConfirm('⚠️', 'Full Reset?', 'ALL admin data will be wiped. This cannot be undone.', 'Reset Everything', async () => {
        await confirmClearMarathons(); await confirmClearRegs();
        Object.values(LS).forEach(k => localStorage.removeItem(k));
        state = { marathons:[], registrations:[], activity:[], currentPage:'dashboard', pendingAction:null, editId:null };
        await refreshAll(); toast('🔄 Admin data fully reset.', 'warning');
    });
}

/* ══════════════════════════════════════════
   ACTIVITY LOG
══════════════════════════════════════════ */
function logActivity(msg, color = 'green') {
    const acts = lsLoad(LS.activity, []);
    acts.unshift({ msg, color, ts: new Date().toISOString() });
    if (acts.length > 60) acts.pop();
    lsSave(LS.activity, acts);
    state.activity = acts;
}

/* ══════════════════════════════════════════
   CONFIRM DIALOG
══════════════════════════════════════════ */
function openConfirm(icon, title, msg, btnLabel, cb) {
    document.getElementById('confirm-icon').textContent  = icon;
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent   = msg;
    document.getElementById('confirm-ok-btn').textContent= btnLabel;
    state.pendingAction = cb;
    document.getElementById('confirm-overlay').classList.add('open');
}
function closeConfirm() { state.pendingAction = null; document.getElementById('confirm-overlay').classList.remove('open'); }
function confirmAction() { if (state.pendingAction) state.pendingAction(); closeConfirm(); }

window.toggleNotifs = function() {
    const d = document.getElementById('notif-dropdown');
    d.style.display = d.style.display === 'none' ? 'block' : 'none';
};

async function loadFoundationLeads() {
    const leads = await getAllFoundationLeads();
    const badge = document.getElementById('notif-badge');
    const list = document.getElementById('notif-list');
    
    if (leads.length > 0) {
        badge.style.display = 'inline-block';
        badge.textContent = leads.length;
        list.innerHTML = leads.map(l => `
            <div style="background: rgba(255,255,255,0.05); padding: 0.8rem; border-radius: 8px; border-left: 3px solid var(--crimson);">
                <div style="font-weight:600; color: #fff; margin-bottom: 0.2rem">New Foundation Joiner</div>
                <div><strong>Name:</strong> ${l.name}</div>
                <div><strong>Email:</strong> ${l.email}</div>
                <div><strong>Interest:</strong> ${l.interest || 'General'}</div>
            </div>
        `).join('');
    } else {
        badge.style.display = 'none';
        list.innerHTML = '<div style="color:var(--text-muted); text-align:center;">No new leads.</div>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('confirm-overlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeConfirm(); });
    document.getElementById('marathon-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
});

/* ══════════════════════════════════════════
   TOAST
══════════════════════════════════════════ */
const TOAST_ICONS = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
function toast(msg, type = 'success', duration = 3800) {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="toast-icon">${TOAST_ICONS[type]||'➡️'}</span><span class="toast-msg">${msg}</span>`;
    container.appendChild(el);
    setTimeout(() => { el.classList.add('removing'); el.addEventListener('animationend', () => el.remove()); }, duration);
}
