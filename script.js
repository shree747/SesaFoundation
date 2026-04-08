/* ══════════════════════════════════════════════
   SESA FOUNDATION — PUBLIC SITE SCRIPT
   Handles: navbar auth state, dynamic marathon
            countdown from Supabase, register btn
══════════════════════════════════════════════ */

/* ── AUTH STATE TRACKING ──────────────────── */
let _currentUser = null;

const SUPABASE_OK = (typeof supabaseClient !== 'undefined');

// Subscribe to auth changes and update navbar
onAuthStateChange(user => {
    _currentUser = user;
    renderNavUser(user);
});

/* ── NAVBAR AUTH STATE ──────────────────────── */
function renderNavUser(user) {
    const area = document.getElementById('nav-user-area');
    if (!area) return;

    if (user) {
        const initials = (user.displayName || user.email || 'U')
            .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        area.innerHTML = `
            <a href="profile.html" class="user-pill" title="My Profile">
                <div class="user-avatar">${initials}</div>
                <span class="user-pill-name">${user.displayName ? user.displayName.split(' ')[0] : 'My Profile'}</span>
            </a>`;
    } else {
        area.innerHTML = `
            <a href="login.html?redirect=index.html" class="btn-login">Sign In</a>
            <a href="#join" class="btn-primary">Join Now</a>`;
    }
}

/* ── MARATHON HUB — DYNAMIC DATA ──────────── */
async function loadPublishedMarathon() {
    // Try Supabase first
    if (SUPABASE_OK) {
        try {
            const events = await getPublishedMarathons();
            if (events.length > 0) {
                applyMarathonToUI(events[0]);
                return;
            }
        } catch (e) {
            console.warn('Supabase read failed, falling back to localStorage.');
        }
    }

    // Fallback: admin localStorage bridge
    try {
        const stored = JSON.parse(localStorage.getItem('sesa_published_marathon'));
        if (stored && stored.name) {
            applyMarathonToUI(stored);
            return;
        }
    } catch (_) {}

    showNoMarathonUI();
}

function showNoMarathonUI() {
    const nameEl = document.getElementById('marathon-event-name');
    const descEl = document.getElementById('marathon-event-desc');
    const metaEl = document.getElementById('marathon-event-meta');
    const btn    = document.getElementById('register-btn');

    if (nameEl) nameEl.textContent = 'No Upcoming Marathon';
    if (descEl) descEl.textContent = 'Stay tuned for our next event announcement. Follow our updates!';
    if (metaEl) metaEl.style.display = 'none';
    if (btn)    btn.style.display = 'none';

    const label = document.getElementById('countdown-label');
    if (label) label.textContent = 'RACE SCHEDULE UPDATING';

    ['cd-d','cd-h','cd-m','cd-s'].forEach(id => {
        const d = document.getElementById(id);
        if (d) d.textContent = '--';
    });
}

function applyMarathonToUI(ev) {
    const nameEl = document.getElementById('marathon-event-name');
    const descEl = document.getElementById('marathon-event-desc');
    const metaEl = document.getElementById('marathon-event-meta');

    if (nameEl) nameEl.textContent = ev.name || 'Sesa Cup Marathon';
    if (descEl) descEl.textContent = ev.description || 'Register today and secure your starting position.';

    if (metaEl) {
        const locEl  = document.getElementById('meta-location');
        const distEl = document.getElementById('meta-distance');
        const feeEl  = document.getElementById('meta-fee');
        if (locEl  && ev.location) locEl.textContent  = '📍 ' + ev.location;
        if (distEl && ev.distance) distEl.textContent = '🏃 ' + ev.distance;
        if (feeEl) feeEl.textContent = ev.fee && ev.fee > 0
            ? '💳 ₹' + Number(ev.fee).toLocaleString('en-IN')
            : '💳 Free Entry';
        metaEl.style.display = 'block';
    }

    // Attach marathon ID to register button
    const btn = document.getElementById('register-btn');
    if (btn && ev.id) btn.setAttribute('data-marathon-id', ev.id);

    // Countdown
    if (ev.date) {
        const label = document.getElementById('countdown-label');
        if (label) label.textContent = 'NEXT RACE STARTING IN';
        startCountdown(new Date(ev.date).getTime());
    }
}

/* ── REGISTER BUTTON ──────────────────────── */
function handleRegisterClick() {
    const btn = document.getElementById('register-btn');
    const mid = btn ? btn.getAttribute('data-marathon-id') : '';
    const idParam = mid ? `?id=${mid}` : '';

    if (_currentUser) {
        window.location.href = `register.html${idParam}`;
    } else {
        window.location.href = `login.html?redirect=register.html${idParam}`;
    }
}

/* ── COUNTDOWN LOGIC ──────────────────────── */
let countdownInterval = null;

function startCountdown(targetMs) {
    if (countdownInterval) clearInterval(countdownInterval);

    function tick() {
        const diff = targetMs - Date.now();
        if (diff < 0) {
            clearInterval(countdownInterval);
            const timerEl = document.querySelector('.timer');
            if (timerEl) timerEl.innerHTML = '<span style="font-size:1.2rem;color:var(--gold)">🏁 RACE HAS STARTED!</span>';
            return;
        }
        const days    = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours   = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        const el = id => document.getElementById(id);
        if (el('days'))  el('days').textContent  = String(days).padStart(2, '0');
        if (el('hours')) el('hours').textContent = String(hours).padStart(2, '0');
        if (el('mins'))  el('mins').textContent  = String(minutes).padStart(2, '0');
        if (el('secs'))  el('secs').textContent  = String(seconds).padStart(2, '0');
    }

    tick();
    countdownInterval = setInterval(tick, 1000);
}

/* ── CONTACT / JOIN FORM ──────────────────── */
const contactForm = document.getElementById('contact-form');
if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn  = e.target.querySelector('button[type="submit"]');
        const orig = btn.innerHTML;
        btn.innerHTML = 'Sending…';
        btn.disabled  = true;

        const name     = document.getElementById('name')?.value    || '';
        const email    = document.getElementById('email')?.value   || '';
        const interest = document.getElementById('interest')?.value || '';

        if (SUPABASE_OK) {
            try {
                const { error } = await supabaseClient.from('leads').insert([{
                    name, email, interest,
                    submitted_at : new Date().toISOString(),
                    source       : 'public_form',
                }]);
                if (error) throw error;
            } catch (_) {
                localStorage.setItem('sesa_pending_reg', JSON.stringify({ name, email, interest }));
            }
        } else {
            localStorage.setItem('sesa_pending_reg', JSON.stringify({ name, email, interest }));
        }

        setTimeout(() => {
            btn.innerHTML = '🎉 Welcome to the Foundation!';
            btn.style.background  = '#00b341';
            btn.style.borderColor = '#00b341';
            e.target.reset();
            setTimeout(() => {
                btn.innerHTML = orig;
                btn.style.background  = '';
                btn.style.borderColor = '';
                btn.disabled = false;
            }, 3000);
        }, 900);
    });
}

/* ── INIT ─────────────────────────────────── */
loadPublishedMarathon();
