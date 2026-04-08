/**
 * SESA FOUNDATION — Supabase Configuration
 * ==========================================
 * SETUP STEPS (see bottom of file for SQL):
 * 1. Go to https://supabase.com → Create project
 * 2. Project Settings → API → copy URL + anon key
 * 3. Paste them below
 * 4. In Supabase → SQL Editor → run the SQL at the bottom
 * 5. Authentication → Providers → enable Email + Google
 * ==========================================
 */

const SUPABASE_URL = 'https://zsquckkwuvmhhkxkytif.supabase.co';       // e.g. https://xyzxyz.supabase.co
const SUPABASE_ANON_KEY = 'sb_publishable_z6hOhpKQ3anEyyhsleF6Bw_TXq0xcTN';  // your anon / public key

// ── Init client ────────────────────────────────────────────
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ── Normalize user object (adds .uid and .displayName aliases) ── */
function normalizeUser(user) {
    if (!user) return null;
    return {
        ...user,
        uid: user.id,
        displayName: user.user_metadata?.full_name
            || user.user_metadata?.name
            || user.email?.split('@')[0]
            || 'User',
        email: user.email,
    };
}

/* ── Normalize registration row (snake_case → camelCase) ── */
function normalizeReg(r) {
    if (!r) return r;
    return {
        ...r,
        id: r.id,
        marathonId: r.marathon_id,
        marathonName: r.marathon_name,
        uid: r.user_id,
        submittedAt: r.submitted_at,
        emergencyContact: r.emergency_contact,
        medicalInfo: r.medical_info,
        exp: r.experience,
    };
}

/* ══════════════════════════════════════════
   AUTH
══════════════════════════════════════════ */
/** Subscribe to auth state. Callback receives a normalized user or null. */
function onAuthStateChange(cb) {
    // fire once with current session
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        cb(session ? normalizeUser(session.user) : null);
    });
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        cb(session ? normalizeUser(session.user) : null);
    });
}

async function getCurrentUser() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    return normalizeUser(user);
}

async function signUpUser(email, password, displayName) {
    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { full_name: displayName } },
    });
    if (error) throw { code: error.message, message: error.message };
    if (data.user) {
        await supabaseClient.from('profiles').upsert({
            id: data.user.id, name: displayName,
            email, role: 'user',
        });
    }
    return normalizeUser(data.user);
}

async function signInUser(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw { code: error.message, message: error.message };
    return normalizeUser(data.user);
}

async function signOutUser() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
}

/** Google OAuth — redirects the page (no popup) */
async function signInWithGoogle() {
    // Build a clean redirect URL (no query params) so it matches Supabase's
    // allowed redirect-URL list. The intended post-login destination is saved
    // in sessionStorage by the caller.
    const base = window.location.origin + window.location.pathname;
    const loginUrl = base.includes('login.html')
        ? base
        : base.substring(0, base.lastIndexOf('/') + 1) + 'login.html';

    const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: loginUrl,
        },
    });
    if (error) throw { code: error.message, message: error.message };
    // If the browser isn't redirected automatically, navigate manually
    if (data?.url) {
        window.location.href = data.url;
    }
}

async function sendPasswordReset(email) {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/login.html',
    });
    if (error) throw { code: error.message, message: error.message };
}

/* ══════════════════════════════════════════
   MARATHONS
══════════════════════════════════════════ */
async function getPublishedMarathons() {
    const { data, error } = await supabaseClient
        .from('marathons').select('*')
        .eq('status', 'published')
        .order('date', { ascending: true });
    if (error) throw error;
    return data || [];
}

async function getMarathon(id) {
    const { data, error } = await supabaseClient
        .from('marathons').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
}

async function getAllMarathons() {
    const { data, error } = await supabaseClient
        .from('marathons').select('*')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

/** Create or update a marathon. Returns the saved row id. */
async function dbSaveMarathon(payload, id = null) {
    if (id) {
        const { data, error } = await supabaseClient
            .from('marathons')
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq('id', id).select().single();
        if (error) throw error;
        return data.id;
    } else {
        const { data, error } = await supabaseClient
            .from('marathons')
            .insert([{ ...payload }]).select().single();
        if (error) throw error;
        return data.id;
    }
}

/** Unpublish ALL currently published marathons (used before publishing a new one) */
async function dbUnpublishAll() {
    const { error } = await supabaseClient
        .from('marathons')
        .update({ status: 'draft' })
        .eq('status', 'published');
    if (error) throw error;
}

async function deleteMarathonDB(id) {
    const { error } = await supabaseClient
        .from('marathons').delete().eq('id', id);
    if (error) throw error;
}

/* ══════════════════════════════════════════
   REGISTRATIONS
══════════════════════════════════════════ */
async function submitRegistration(payload) {
    const row = {
        marathon_id: payload.marathonId,
        marathon_name: payload.marathonName,
        user_id: payload.uid,
        name: payload.name,
        email: payload.email,
        phone: payload.phone,
        dob: payload.dob || null,
        gender: payload.gender,
        city: payload.city,
        category: payload.category,
        tshirt: payload.tshirt,
        experience: payload.exp,
        emergency_contact: payload.emergencyContact,
        medical_info: payload.medicalInfo,
        status: 'pending',
    };
    const { data, error } = await supabaseClient
        .from('registrations').insert([row]).select().single();
    if (error) throw error;
    return data.id;
}

async function getUserRegistrations(uid) {
    const { data, error } = await supabaseClient
        .from('registrations').select('*')
        .eq('user_id', uid)
        .order('submitted_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(normalizeReg);
}

async function checkAlreadyRegistered(uid, marathonId) {
    const { count, error } = await supabaseClient
        .from('registrations').select('id', { count: 'exact', head: true })
        .eq('user_id', uid).eq('marathon_id', marathonId);
    if (error) throw error;
    return (count || 0) > 0;
}

async function getAllRegistrations(marathonId = null) {
    let q = supabaseClient.from('registrations').select('*')
        .order('submitted_at', { ascending: false });
    if (marathonId) q = q.eq('marathon_id', marathonId);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(normalizeReg);
}

async function updateRegistrationStatus(id, status) {
    const { error } = await supabaseClient
        .from('registrations').update({ status }).eq('id', id);
    if (error) throw error;
}

async function deleteRegistrationDB(id) {
    const { error } = await supabaseClient
        .from('registrations').delete().eq('id', id);
    if (error) throw error;
}

async function getAllFoundationLeads() {
    if (typeof supabaseClient !== 'undefined') {
        try {
            const { data, error } = await supabaseClient.from('leads').select('*').order('submitted_at', { ascending: false });
            if (!error && data) return data;
        } catch(e) {}
    }
    const localLead = localStorage.getItem('sesa_pending_reg');
    if (localLead) {
        return [JSON.parse(localLead)];
    }
    return [];
}

async function getMarathonSpotCount(marathonId) {
    const { count, error } = await supabaseClient
        .from('registrations').select('id', { count: 'exact', head: true })
        .eq('marathon_id', marathonId);
    return error ? 0 : (count || 0);
}

/*
══════════════════════════════════════════════════════════════
  SUPABASE SQL SETUP
  Copy everything below and run it in:
  Supabase Dashboard → SQL Editor → New query → Run
══════════════════════════════════════════════════════════════

-- 1. Profiles table (stores user info)
create table if not exists public.profiles (
  id         uuid references auth.users on delete cascade primary key,
  name       text,
  email      text,
  role       text default 'user',
  created_at timestamptz default now()
);

-- 2. Marathons table (admin manages this)
create table if not exists public.marathons (
  id          uuid default gen_random_uuid() primary key,
  name        text not null,
  date        timestamptz,
  location    text,
  distance    text,
  capacity    integer,
  fee         numeric default 0,
  organiser   text default 'Sesa Foundation',
  description text,
  image       text,
  status      text default 'draft',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- 3. Registrations table (users sign up for events)
create table if not exists public.registrations (
  id                uuid default gen_random_uuid() primary key,
  marathon_id       uuid references public.marathons(id) on delete set null,
  marathon_name     text,
  user_id           uuid references auth.users(id) on delete cascade,
  name              text,
  email             text,
  phone             text,
  dob               date,
  gender            text,
  city              text,
  category          text,
  tshirt            text,
  experience        text,
  emergency_contact jsonb,
  medical_info      text,
  status            text default 'pending',
  submitted_at      timestamptz default now()
);

-- 4. Enable Row Level Security
alter table public.profiles     enable row level security;
alter table public.marathons    enable row level security;
alter table public.registrations enable row level security;

-- 5. RLS Policies

-- Profiles: users manage their own
create policy "Users can read own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- Marathons: anyone can read published; anyone can manage (for admin PIN portal)
create policy "Anyone can read published marathons"
  on public.marathons for select using (status = 'published');
create policy "Admin anon can manage marathons"
  on public.marathons for all using (true) with check (true);

-- Registrations: users insert their own; users read their own; admin reads all
create policy "Users can register"
  on public.registrations for insert with check (auth.uid() = user_id);
create policy "Users can read own registrations"
  on public.registrations for select using (auth.uid() = user_id);
create policy "Admin can read all registrations"
  on public.registrations for select using (true);
create policy "Admin can update registrations"
  on public.registrations for update using (true);
create policy "Admin can delete registrations"
  on public.registrations for delete using (true);

══════════════════════════════════════════════════════════════
*/
