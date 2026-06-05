// ==========================================
// CONFIGURACIÓN DE TU PROYECTO DE SUPABASE
// ==========================================
const SUPABASE_URL = "https://qujqxafcznobkurpfsgc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1anF4YWZjem5vYmt1cnBmc2djIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NTk1NzUsImV4cCI6MjA5NjIzNTU3NX0.YP4R8QtE_kPEAB5FMePzX2lS6dT_Yz6oVohxND0X62s";

// Global State
let state = {
    activeRole: null, // 'patient' or 'therapist'
    activeTab: null, // current active UI section
    currentPatient: null, // logged-in patient (if family role)
    selectedPatientId: null, // selected patient for detail view (if therapist)
    patients: [], // all patients list (therapist only)
    records: [], // emotional logs and consultations for current view
    tasks: [], // tasks for current view
    dailyActivities: [], // daily checklist items
    parentReports: [] // parent reports
};

// Global chart instances
let familyChartInstance = null;
let therapistChartInstance = null;
let selectedFileMetadata = null;
let selectedRawFile = null;

// Initialize Supabase Client
let supabaseClient = null;
const isSupabaseConfigured = (SUPABASE_URL !== "TU_SUPABASE_URL" && SUPABASE_ANON_KEY !== "TU_SUPABASE_ANON_KEY");

if (window.supabase && isSupabaseConfigured) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// App Initialization
document.addEventListener("DOMContentLoaded", async () => {
    if (!isSupabaseConfigured) {
        alert("⚠️ Supabase no está configurado en app.js.");
        return;
    }
    
    // Check session storage for existing auth session
    const isTherapistLogged = sessionStorage.getItem("mindreg_therapist_logged_in") === "true";
    const savedPatientCode = sessionStorage.getItem("mindreg_patient_code");
    
    if (isTherapistLogged) {
        state.activeRole = 'therapist';
        state.activeTab = 'therapist-patients';
        document.body.className = "theme-therapist";
        showApp();
        await loadTherapistData();
    } else if (savedPatientCode) {
        const success = await attemptPatientLoginByCode(savedPatientCode);
        if (!success) {
            logout();
        }
    } else {
        showLoginScreen();
    }
    
    lucide.createIcons();
});

// UI Views toggling
function showLoginScreen() {
    document.getElementById("auth-screen").style.display = "flex";
    document.getElementById("main-app").style.display = "none";
    document.body.className = "theme-auth";
}

function showApp() {
    document.getElementById("auth-screen").style.display = "none";
    document.getElementById("main-app").style.display = "block";
}

// Switch between Family and Therapist Login Tabs
function switchAuthTab(role) {
    document.querySelectorAll(".auth-tab-btn").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".auth-form").forEach(form => form.classList.remove("active"));
    
    if (role === 'family') {
        document.getElementById("tab-btn-family").classList.add("active");
        document.getElementById("form-family-login").classList.add("active");
    } else {
        document.getElementById("tab-btn-therapist").classList.add("active");
        document.getElementById("form-therapist-login").classList.add("active");
        checkStoredPasswordSetup();
    }
}

// Check database to see if a password is set for the therapist
let isPasswordSet = false;
let storedPasswordHash = null;

async function checkStoredPasswordSetup() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('app_config')
            .select('value')
            .eq('key', 'therapist_password')
            .single();

        const confirmGroup = document.getElementById("therapist-confirm-group");
        const submitBtn = document.getElementById("btn-therapist-submit");

        if (data && data.value) {
            isPasswordSet = true;
            storedPasswordHash = data.value;
            if (confirmGroup) confirmGroup.style.display = "none";
            if (submitBtn) submitBtn.innerText = "Ingresar";
        } else {
            isPasswordSet = false;
            storedPasswordHash = null;
            if (confirmGroup) confirmGroup.style.display = "block";
            if (submitBtn) submitBtn.innerText = "Crear Contraseña";
        }
    } catch (err) {
        console.error("Error al consultar contraseña en Supabase:", err);
    }
}

// SHA-256 Hashing helper
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);                    
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// Handles login for Therapist
async function handleTherapistLogin(e) {
    e.preventDefault();
    const passwordInput = document.getElementById("therapist-password-input").value;
    const confirmInput = document.getElementById("therapist-confirm-input") ? document.getElementById("therapist-confirm-input").value : "";
    const errorEl = document.getElementById("therapist-login-error");
    
    if (errorEl) errorEl.style.display = "none";

    if (!isPasswordSet) {
        // First-time setup
        if (passwordInput !== confirmInput) {
            showError(errorEl, "Las contraseñas no coinciden.");
            return;
        }
        if (passwordInput.length < 4) {
            showError(errorEl, "La contraseña debe tener al menos 4 caracteres.");
            return;
        }
        const hashed = await sha256(passwordInput);
        try {
            const { error } = await supabaseClient
                .from('app_config')
                .upsert([{ key: 'therapist_password', value: hashed, updated_at: new Date().toISOString() }]);

            if (error) throw error;
            isPasswordSet = true;
            storedPasswordHash = hashed;
        } catch (err) {
            console.error(err);
            showError(errorEl, "No se pudo guardar la contraseña en Supabase.");
            return;
        }
    } else {
        const hashed = await sha256(passwordInput);
        if (hashed !== storedPasswordHash) {
            showError(errorEl, "Contraseña incorrecta.");
            return;
        }
    }

    sessionStorage.setItem("mindreg_therapist_logged_in", "true");
    state.activeRole = 'therapist';
    state.activeTab = 'therapist-patients';
    document.body.className = "theme-therapist";
    showApp();
    await loadTherapistData();
    navigateToTab(state.activeTab);
}

// Handles login for Families
async function handleFamilyLogin(e) {
    e.preventDefault();
    const code = document.getElementById("family-code-input").value.trim().toUpperCase();
    const errorEl = document.getElementById("family-login-error");
    if (errorEl) errorEl.style.display = "none";

    const success = await attemptPatientLoginByCode(code);
    if (!success) {
        showError(errorEl, "Código de paciente no encontrado.");
    }
}

async function attemptPatientLoginByCode(code) {
    if (!supabaseClient) return false;
    try {
        const { data, error } = await supabaseClient
            .from('patients')
            .select('*')
            .eq('access_code', code)
            .single();

        if (error || !data) return false;

        state.currentPatient = data;
        state.activeRole = 'patient';
        state.activeTab = 'family-dashboard';
        sessionStorage.setItem("mindreg_patient_code", code);
        
        // Dynamic theme depending on category/age
        if (data.category === 'child') {
            document.body.className = "theme-child";
        } else {
            document.body.className = "theme-adolescent";
        }
        
        showApp();
        await loadFamilyData();
        navigateToTab(state.activeTab);
        return true;
    } catch (err) {
        console.error(err);
        return false;
    }
}

function showError(element, message) {
    if (element) {
        element.innerText = message;
        element.style.display = "block";
    }
}

function logout() {
    sessionStorage.clear();
    state.activeRole = null;
    state.activeTab = null;
    state.currentPatient = null;
    state.selectedPatientId = null;
    location.reload();
}

// --- DATABASE FETCHES ---

async function loadTherapistData() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('patients')
            .select('*')
            .order('name');
        if (error) throw error;
        state.patients = data || [];
        renderPatientsList();
        renderNavigation();
    } catch (err) {
        console.error("Error al cargar pacientes:", err);
    }
}

async function loadFamilyData() {
    if (!supabaseClient || !state.currentPatient) return;
    try {
        // Fetch emotional logs
        const { data: recordsData, error: recordsError } = await supabaseClient
            .from('records')
            .select('*')
            .eq('patient_id', state.currentPatient.id);
        if (recordsError) throw recordsError;
        state.records = recordsData || [];

        // Fetch tasks
        const { data: tasksData, error: tasksError } = await supabaseClient
            .from('tasks')
            .select('*')
            .eq('patient_id', state.currentPatient.id);
        if (tasksError) throw tasksError;
        
        state.tasks = (tasksData || []).map(t => ({
            id: t.id,
            title: t.title,
            desc: t.desc,
            type: t.type,
            youtube_url: t.youtube_url,
            due: t.due,
            completed: t.completed,
            reply: t.reply,
            completedDate: t.completed_date,
            file: t.file_url ? {
                path: t.file_url,
                originalName: t.file_name,
                size: t.file_size
            } : null
        }));

        // Fetch daily activities
        await syncTodayActivities();

        renderNavigation();
    } catch (err) {
        console.error("Error al cargar datos de familia:", err);
    }
}

// Renders navigation header options
function renderNavigation() {
    const navContainer = document.getElementById("nav-links-container");
    const roleBadge = document.getElementById("role-badge");
    const subtitle = document.getElementById("app-subtitle");
    
    if (!navContainer) return;
    navContainer.innerHTML = "";

    const therapistLinks = [
        { id: "therapist-patients", label: "Pacientes", icon: "users" }
    ];

    const familyLinks = [
        { id: "family-dashboard", label: "Mi Progreso", icon: "layout-dashboard" },
        { id: "family-new-record", label: "Registrar Emoción", icon: "smile" },
        { id: "family-history", label: "Historial", icon: "history" },
        { id: "family-tasks", label: "Tareas y Videos", icon: "video" },
        { id: "parent-observations", label: "Espacio Padres", icon: "heart-handshake" }
    ];

    const links = state.activeRole === 'therapist' ? therapistLinks : familyLinks;

    links.forEach(link => {
        const btn = document.createElement("button");
        btn.id = `nav-tab-${link.id}`;
        btn.className = "nav-tab";
        btn.onclick = () => navigateToTab(link.id);
        btn.innerHTML = `<i data-lucide="${link.icon}"></i> ${link.label}`;
        navContainer.appendChild(btn);
    });

    // Añadir botón de salir (Exit) al final de la barra de navegación
    const exitBtn = document.createElement("button");
    exitBtn.className = "nav-tab nav-exit-btn";
    exitBtn.style.color = "#f87171";
    exitBtn.onclick = logout;
    exitBtn.innerHTML = `<i data-lucide="log-out"></i> Salir`;
    navContainer.appendChild(exitBtn);

    if (roleBadge) {
        if (state.activeRole === 'therapist') {
            roleBadge.innerHTML = `<i data-lucide="shield-check"></i> <span>Psic. Daniela</span>`;
            if (subtitle) subtitle.innerText = " | Psic. Daniela";
        } else {
            const ageBadge = state.currentPatient.category === 'child' ? "Niño 🎈" : "Adolescente ⚡";
            roleBadge.innerHTML = `<i data-lucide="user"></i> <span>${state.currentPatient.name} (${ageBadge})</span>`;
            if (subtitle) subtitle.innerText = ` | ${state.currentPatient.name}`;
        }
    }

    renderAuthBar();
    lucide.createIcons();
}

function renderAuthBar() {
    const bar = document.getElementById("session-auth-bar");
    if (!bar) return;
    
    if (state.activeRole === 'therapist') {
        bar.innerHTML = `
            <span class="user-display-name" style="font-family: var(--font-heading); font-weight: 600; font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem;">
                <i data-lucide="user-check" style="color: var(--color-psy);"></i> Panel Clínico
            </span>
            <button class="btn btn-secondary btn-sm" onclick="logout()" style="padding: 0.4rem 0.85rem; font-size: 0.8rem;">
                <i data-lucide="log-out"></i> Salir
            </button>
        `;
    } else {
        bar.innerHTML = `
            <span class="user-display-name" style="font-family: var(--font-heading); font-weight: 600; font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem;">
                <i data-lucide="users" style="color: var(--color-patient);"></i> Familia
            </span>
            <button class="btn btn-secondary btn-sm" onclick="logout()" style="padding: 0.4rem 0.85rem; font-size: 0.8rem;">
                <i data-lucide="log-out"></i> Salir
            </button>
        `;
    }
    lucide.createIcons();
}

// Navigates between sections
async function navigateToTab(tabId) {
    // Security redirects
    if (state.activeRole === 'therapist' && !tabId.startsWith('therapist')) {
        tabId = 'therapist-patients';
    }
    if (state.activeRole === 'patient' && tabId.startsWith('therapist')) {
        tabId = 'family-dashboard';
    }

    state.activeTab = tabId;

    document.querySelectorAll(".content-section").forEach(sec => sec.classList.remove("active"));
    const activeSection = document.getElementById(`section-${tabId}`);
    if (activeSection) activeSection.classList.add("active");

    document.querySelectorAll(".nav-tab").forEach(tab => tab.classList.remove("active"));
    const activeTabBtn = document.getElementById(`nav-tab-${tabId}`);
    if (activeTabBtn) activeTabBtn.classList.add("active");

    // Re-fetch depending on tab
    if (state.activeRole === 'patient') {
        await loadFamilyData();
        if (tabId === 'family-dashboard') {
            renderFamilyDashboard();
        } else if (tabId === 'family-new-record') {
            setupNewRecordForm();
        } else if (tabId === 'family-history') {
            renderFamilyHistory();
        } else if (tabId === 'family-tasks') {
            renderFamilyTasks();
        } else if (tabId === 'parent-observations') {
            renderParentObservationsSection();
        }
    } else if (state.activeRole === 'therapist') {
        if (tabId === 'therapist-patients') {
            await loadTherapistData();
        } else if (tabId === 'therapist-patient-detail') {
            await loadSelectedPatientDetail(state.selectedPatientId);
        }
    }
}

// --- THERAPIST: PATIENTS LIST MANAGER ---

function renderPatientsList() {
    const container = document.getElementById("patients-list-container");
    if (!container) return;
    container.innerHTML = "";

    if (state.patients.length === 0) {
        container.innerHTML = `
            <div class="card empty-state" style="grid-column: 1/-1;">
                <i data-lucide="users"></i>
                <h3>No hay pacientes registrados</h3>
                <p>Haz clic en "Registrar Paciente" para añadir la primera ficha.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    state.patients.forEach(patient => {
        const card = document.createElement("div");
        card.className = "card patient-card";
        card.onclick = () => {
            state.selectedPatientId = patient.id;
            navigateToTab('therapist-patient-detail');
        };

        const badgeClass = patient.category === 'child' ? 'child' : 'adolescent';
        const badgeLabel = patient.category === 'child' ? 'Niño' : 'Adolescente';

        card.innerHTML = `
            <div class="patient-card-header">
                <h3>${patient.name}</h3>
                <span class="patient-badge ${badgeClass}">${badgeLabel} - ${patient.age} años</span>
            </div>
            <div class="patient-card-body">
                <span><i data-lucide="key" class="header-icon" style="width: 0.85rem; display:inline; vertical-align:text-bottom;"></i> Código: <strong class="code-badge">${patient.access_code}</strong></span>
                <span>Representante: <strong>${patient.parent_name}</strong></span>
                <span>Contacto: <strong>${patient.parent_email || 'No registrado'}</strong></span>
            </div>
        `;
        container.appendChild(card);
    });

    lucide.createIcons();
}

// --- THERAPIST: PATIENT DETAIL WORKFLOW ---

let detailSubTab = 'records'; // default detail view

function switchDetailTab(subTab) {
    detailSubTab = subTab;
    document.querySelectorAll(".detail-tab").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".detail-sub-section").forEach(sec => sec.classList.remove("active"));

    // Find clicked tab and section
    const buttons = document.querySelectorAll(".detail-tab");
    if (subTab === 'records') {
        buttons[0].classList.add("active");
        document.getElementById("detail-records-container").classList.add("active");
    } else if (subTab === 'parent_reports') {
        buttons[1].classList.add("active");
        document.getElementById("detail-parent-reports-container").classList.add("active");
    } else {
        buttons[2].classList.add("active");
        document.getElementById("detail-tasks-container").classList.add("active");
    }
}

async function loadSelectedPatientDetail(patientId) {
    if (!supabaseClient || !patientId) return;

    const patient = state.patients.find(p => p.id === patientId);
    if (!patient) return;

    // Render profile header details
    const headerInfo = document.getElementById("detail-profile-info");
    const badgeLabel = patient.category === 'child' ? 'Niño 🎈' : 'Adolescente ⚡';
    if (headerInfo) {
        headerInfo.innerHTML = `
            <div class="patient-title-group">
                <h2><i data-lucide="user"></i> ${patient.name}</h2>
                <span class="patient-badge ${patient.category}">${badgeLabel} • ${patient.age} años • Código: <strong class="code-badge">${patient.access_code}</strong></span>
            </div>
            <div style="font-size: 0.9rem; color: var(--text-secondary); text-align: right;">
                <div>Padre/Tutor: <strong>${patient.parent_name}</strong></div>
                <div>Correo: <strong>${patient.parent_email || 'Sin correo'}</strong></div>
            </div>
        `;
    }

    try {
        // Fetch patient specific records
        const { data: recordsData } = await supabaseClient
            .from('records')
            .select('*')
            .eq('patient_id', patientId);
            
        // Map records
        const mappedRecords = recordsData || [];
        
        // Fetch patient specific tasks
        const { data: tasksData } = await supabaseClient
            .from('tasks')
            .select('*')
            .eq('patient_id', patientId);
            
        // Sync daily activities
        const { data: actData } = await supabaseClient
            .from('daily_activities')
            .select('*')
            .eq('patient_id', patientId)
            .eq('date', getTodayLocalDateStr());

        // Populate detail panels
        renderTherapistPatientSubFeeds(mappedRecords, tasksData || [], actData || []);
        renderChart('chart-therapist-patient-detail', 'therapist', mappedRecords);
    } catch (err) {
        console.error("Error cargando ficha de paciente:", err);
    }
    lucide.createIcons();
}

function renderTherapistPatientSubFeeds(records, tasks, activities) {
    // 1. Records feed (Only emotional records & consultations)
    const recordsFeed = document.getElementById("detail-records-feed");
    recordsFeed.innerHTML = "";
    const emotionalLogs = records.filter(r => r.type === 'record' || r.type === 'consultation')
                                  .sort((a, b) => new Date(b.date) - new Date(a.date));

    if (emotionalLogs.length === 0) {
        recordsFeed.innerHTML = `<p style="padding: 1.5rem; text-align: center; color: var(--text-muted);">No hay registros clínicos.</p>`;
    } else {
        emotionalLogs.forEach(item => {
            const card = document.createElement("div");
            if (item.type === 'record') {
                card.className = "card record-card";
                let emotionsHTML = (item.emotions || []).map(emo => {
                    return `<span class="emotion-chip size-small">${getEmotionEmoji(emo)} ${emo}</span>`;
                }).join(" ");

                let feedbackSection = "";
                if (item.feedback) {
                    feedbackSection = `
                        <div class="record-feedback-section">
                            <div class="feedback-card-content">
                                <div class="feedback-header">
                                    <span>Tu Orientación:</span>
                                    <span>${formatDateTimeString(item.feedback_date)}</span>
                                </div>
                                <p class="feedback-text">${item.feedback}</p>
                                <button class="btn btn-text text-teal" style="font-size: 0.75rem; margin-top: 0.25rem;" onclick="openClinicalCommentModal('${item.id}', '${item.feedback.replace(/'/g, "\\'")}')">
                                    Editar comentario
                                </button>
                            </div>
                        </div>
                    `;
                } else {
                    feedbackSection = `
                        <div class="record-feedback-section" style="display:flex; justify-content: flex-end;">
                            <button class="btn btn-secondary" onclick="openClinicalCommentModal('${item.id}')">
                                <i data-lucide="message-circle-plus" class="text-teal"></i> Dejar Orientación Clínica
                            </button>
                        </div>
                    `;
                }

                card.innerHTML = `
                    <div class="record-card-header">
                        <div class="record-type-date">
                            <span class="record-title-badge record-badge"><i data-lucide="clipboard-signature"></i> Registro de Paciente</span>
                            <span class="record-date-str">${formatDateTimeString(item.date)}</span>
                        </div>
                        <span class="record-intensity-badge">Intensidad: ${item.intensity}%</span>
                    </div>
                    <div class="record-card-body">
                        <div class="thought-box">
                            <span class="box-title"><i data-lucide="brain"></i> Detonante / Pensamiento</span>
                            <p class="thought-text">"${item.thought_or_trigger}"</p>
                        </div>
                        <div class="record-emotions-row">
                            <span class="emotions-label">Emociones:</span>
                            <div class="emotions-list">${emotionsHTML}</div>
                        </div>
                        <div class="conduct-box">
                            <span class="box-title"><i data-lucide="activity"></i> Conducta</span>
                            <p class="conduct-text">${item.conduct || 'No registrada'}</p>
                        </div>
                        ${feedbackSection}
                    </div>
                `;
            } else {
                card.className = "card record-card consultation-type";
                card.innerHTML = `
                    <div class="record-card-header">
                        <div class="record-type-date">
                            <span class="record-title-badge consultation-badge"><i data-lucide="calendar-heart"></i> Consulta de Terapia</span>
                            <span class="record-date-str">${formatFriendlyDate(item.date)}</span>
                        </div>
                    </div>
                    <div class="record-card-body">
                        <div class="clinical-notes-box">
                            <span class="box-title"><i data-lucide="sticky-note"></i> Notas Clínicas</span>
                            <p class="notes-text">${item.notes || 'Sin anotaciones.'}</p>
                        </div>
                    </div>
                `;
            }
            recordsFeed.appendChild(card);
        });
    }

    // 2. Parent reports feed
    const reportsFeed = document.getElementById("detail-parent-reports-feed");
    reportsFeed.innerHTML = "";
    const parentLogs = records.filter(r => r.type === 'parent_report')
                               .sort((a, b) => new Date(b.date) - new Date(a.date));

    if (parentLogs.length === 0) {
        reportsFeed.innerHTML = `<p style="padding: 1.5rem; text-align: center; color: var(--text-muted);">No hay reportes de observaciones de los padres.</p>`;
    } else {
        parentLogs.forEach(report => {
            const card = document.createElement("div");
            card.className = "card record-card parent-report-card";
            
            // Build tags
            let tagsHTML = "";
            if (report.emotions && Array.isArray(report.emotions)) {
                tagsHTML = `<div class="report-tags">` + report.emotions.map(t => `<span class="report-tag">${t}</span>`).join("") + `</div>`;
            }

            card.innerHTML = `
                <div class="record-card-header">
                    <div class="record-type-date">
                        <span class="record-title-badge" style="color: #a78bfa;"><i data-lucide="users"></i> Observación de Padres</span>
                        <span class="record-date-str">${formatFriendlyDate(report.date)}</span>
                    </div>
                </div>
                <div class="record-card-body">
                    ${tagsHTML}
                    <div class="thought-box" style="border-color: rgba(167, 139, 250, 0.25);">
                        <span class="box-title" style="color: #c084fc;"><i data-lucide="align-left"></i> Notas del Hogar</span>
                        <p class="thought-text">${report.notes}</p>
                    </div>
                </div>
            `;
            reportsFeed.appendChild(card);
        });
    }

    // 3. Tasks feed
    const tasksFeed = document.getElementById("detail-tasks-feed");
    tasksFeed.innerHTML = "";
    const sortedTasks = tasks.sort((a, b) => new Date(b.due) - new Date(a.due));

    if (sortedTasks.length === 0) {
        tasksFeed.innerHTML = `<p style="padding: 1.5rem; text-align: center; color: var(--text-muted);">No hay tareas asignadas.</p>`;
    } else {
        sortedTasks.forEach(task => {
            const card = document.createElement("div");
            card.className = "card record-card";
            card.style.borderLeftColor = task.completed ? 'var(--color-psy)' : 'var(--color-warning)';
            
            let status = task.completed ? `<span class="task-status-badge completed">Completada</span>` : `<span class="task-status-badge">Pendiente</span>`;
            let replyHTML = "";
            if (task.completed) {
                let attachmentHTML = "";
                if (task.file_url) {
                    attachmentHTML = `
                        <div style="margin-top: 0.5rem;">
                            <a href="${task.file_url}" download="${task.file_name}" target="_blank" class="file-attachment-tag">
                                <i data-lucide="paperclip"></i> ${task.file_name} (${task.file_size})
                            </a>
                        </div>
                    `;
                }
                replyHTML = `
                    <div class="task-reply-submission" style="margin-top: 0.75rem;">
                        <span class="submission-header">Respuesta de la Familia:</span>
                        <p class="submission-content">${task.reply}</p>
                        ${attachmentHTML}
                    </div>
                `;
            }

            let youtubeEmbedHTML = "";
            if (task.type === 'video' && task.youtube_url) {
                const embedUrl = getYouTubeEmbedUrl(task.youtube_url);
                if (embedUrl) {
                    youtubeEmbedHTML = `
                        <div class="youtube-player-container" style="margin-top: 0.5rem;">
                            <iframe src="${embedUrl}" allowfullscreen></iframe>
                        </div>
                    `;
                }
            }

            card.innerHTML = `
                <div class="record-card-header">
                    <div class="record-type-date">
                        <span class="record-title-badge" style="color: var(--text-secondary);"><i data-lucide="${task.type === 'video' ? 'video' : 'clipboard-list'}"></i> ${task.title}</span>
                        <span class="record-date-str">Límite: ${formatFriendlyDate(task.due)}</span>
                    </div>
                    ${status}
                </div>
                <div class="record-card-body">
                    <p style="font-size: 0.9rem; color: var(--text-secondary);">${task.desc}</p>
                    ${youtubeEmbedHTML}
                    ${replyHTML}
                </div>
            `;
            tasksFeed.appendChild(card);
        });
    }

    // 4. Daily Activities for Detail Page
    const actContainer = document.getElementById("therapist-activities-container");
    if (actContainer) {
        actContainer.innerHTML = "";
        if (activities.length === 0) {
            actContainer.innerHTML = `<p style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 0.5rem 0;">No hay hábitos diarios programados.</p>`;
        } else {
            activities.forEach(act => {
                const item = document.createElement("div");
                item.className = "daily-habit-item";
                item.style.padding = "0.4rem 0.75rem";
                item.style.borderRadius = "var(--radius-sm)";
                item.innerHTML = `
                    <span style="font-size: 0.85rem; flex-grow: 1; ${act.completed ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">${act.content}</span>
                    <button class="btn btn-text btn-sm" onclick="deletePatientActivity('${act.id}')" style="color: var(--color-accent); padding: 0.1rem 0.35rem;"><i data-lucide="trash-2" style="width: 0.8rem; height: 0.8rem;"></i></button>
                `;
                actContainer.appendChild(item);
            });
        }
    }
    lucide.createIcons();
}

// Suggest child/adolescent based on age input
function suggestCategoryByAge(age) {
    const categorySelect = document.getElementById("patient-category");
    if (!categorySelect || !age) return;
    const val = parseInt(age);
    if (val < 12) {
        categorySelect.value = "child";
    } else {
        categorySelect.value = "adolescent";
    }
}

// Generate random access code
function generateRandomAccessCode() {
    const nameInput = document.getElementById("patient-name").value.trim();
    const ageInput = document.getElementById("patient-age").value.trim();
    const codeInput = document.getElementById("patient-access-code");
    
    if (!codeInput) return;
    
    let base = "PAC";
    if (nameInput) {
        base = nameInput.split(" ")[0].substring(0, 5).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }
    const suffix = ageInput ? ageInput : Math.floor(100 + Math.random() * 900);
    codeInput.value = `${base}${suffix}${Math.floor(Math.random() * 10)}`;
}

// Modals management
function openNewPatientModal() {
    document.getElementById("modal-new-patient").classList.add("active");
    document.getElementById("form-new-patient").reset();
}
function closeNewPatientModal() {
    document.getElementById("modal-new-patient").classList.remove("active");
}

async function saveNewPatient(e) {
    e.preventDefault();
    const name = document.getElementById("patient-name").value.trim();
    const age = parseInt(document.getElementById("patient-age").value);
    const category = document.getElementById("patient-category").value;
    const accessCode = document.getElementById("patient-access-code").value.trim().toUpperCase();
    const parentName = document.getElementById("patient-parent-name").value.trim();
    const parentEmail = document.getElementById("patient-parent-email").value.trim();

    const newPatient = {
        id: "pat-" + Date.now(),
        name,
        age,
        category,
        access_code: accessCode,
        parent_name: parentName,
        parent_email: parentEmail
    };

    try {
        const { error } = await supabaseClient
            .from('patients')
            .insert([newPatient]);

        if (error) throw error;
        closeNewPatientModal();
        await loadTherapistData();
    } catch (err) {
        console.error(err);
        alert("Error al registrar paciente. Revisa que el código único no esté repetido.");
    }
}

// Assign Tasks
function openAssignTaskModal() {
    document.getElementById("modal-assign-task").classList.add("active");
    document.getElementById("form-assign-task").reset();
    toggleYoutubeUrlField('exercise');
}
function closeAssignTaskModal() {
    document.getElementById("modal-assign-task").classList.remove("active");
}

function toggleYoutubeUrlField(type) {
    const field = document.getElementById("group-youtube-url");
    if (field) {
        field.style.display = type === 'video' ? 'block' : 'none';
        document.getElementById("task-youtube-url").required = type === 'video';
    }
}

async function saveAssignedTask(e) {
    e.preventDefault();
    const title = document.getElementById("task-title").value.trim();
    const desc = document.getElementById("task-desc").value.trim();
    const type = document.getElementById("task-type").value;
    const youtubeUrl = type === 'video' ? document.getElementById("task-youtube-url").value.trim() : null;
    const due = document.getElementById("task-due").value;

    const newTask = {
        id: "task-" + Date.now(),
        patient_id: state.selectedPatientId,
        title,
        desc,
        type,
        youtube_url: youtubeUrl,
        due,
        completed: false
    };

    try {
        const { error } = await supabaseClient
            .from('tasks')
            .insert([newTask]);
        if (error) throw error;
        closeAssignTaskModal();
        await loadSelectedPatientDetail(state.selectedPatientId);
    } catch (err) {
        console.error(err);
        alert("Error al asignar tarea.");
    }
}

// Log clinical consultations
function openConsultationModal() {
    document.getElementById("modal-consultation").classList.add("active");
    document.getElementById("form-consultation").reset();
    
    // set default date
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    document.getElementById("consultation-date").value = `${yyyy}-${mm}-${dd}`;
}
function closeConsultationModal() {
    document.getElementById("modal-consultation").classList.remove("active");
}

async function saveConsultation(e) {
    e.preventDefault();
    const dateVal = document.getElementById("consultation-date").value;
    const notesVal = document.getElementById("consultation-notes").value.trim();

    const newConsultation = {
        id: "con-" + Date.now(),
        patient_id: state.selectedPatientId,
        type: 'consultation',
        date: dateVal,
        notes: notesVal
    };

    try {
        const { error } = await supabaseClient
            .from('records')
            .insert([newConsultation]);
        if (error) throw error;
        closeConsultationModal();
        await loadSelectedPatientDetail(state.selectedPatientId);
    } catch (err) {
        console.error(err);
        alert("Error al guardar consulta.");
    }
}

// Adding Daily Activities from Therapist detail panel
async function handleAddPatientActivity(e) {
    e.preventDefault();
    const input = document.getElementById("therapist-activity-input");
    if (!input) return;
    const content = input.value.trim();
    if (!content) return;

    const newActivity = {
        id: "act-" + Date.now(),
        patient_id: state.selectedPatientId,
        date: getTodayLocalDateStr(),
        content: content,
        completed: false
    };

    try {
        const { error } = await supabaseClient
            .from('daily_activities')
            .insert([newActivity]);
        if (error) throw error;
        input.value = "";
        await loadSelectedPatientDetail(state.selectedPatientId);
    } catch (err) {
        console.error(err);
    }
}

async function deletePatientActivity(actId) {
    try {
        const { error } = await supabaseClient
            .from('daily_activities')
            .delete()
            .eq('id', actId);
        if (error) throw error;
        await loadSelectedPatientDetail(state.selectedPatientId);
    } catch (err) {
        console.error(err);
    }
}

// Open Feedback Modal
function openClinicalCommentModal(recordId, existingText = "") {
    document.getElementById("comment-record-id").value = recordId;
    document.getElementById("clinical-comment-content").value = existingText;
    document.getElementById("modal-clinical-comment").classList.add("active");
}
function closeClinicalCommentModal() {
    document.getElementById("modal-clinical-comment").classList.remove("active");
}

async function saveClinicalComment(e) {
    e.preventDefault();
    const recordId = document.getElementById("comment-record-id").value;
    const commentVal = document.getElementById("clinical-comment-content").value.trim();

    try {
        const { error } = await supabaseClient
            .from('records')
            .update({
                feedback: commentVal,
                feedback_date: new Date().toISOString()
            })
            .eq('id', recordId);

        if (error) throw error;
        closeClinicalCommentModal();
        await loadSelectedPatientDetail(state.selectedPatientId);
    } catch (err) {
        console.error(err);
        alert("Error al guardar comentario clínico.");
    }
}

// --- FAMILY WORKFLOWS ---

function renderFamilyDashboard() {
    // Welcoming
    const welcome = document.getElementById("family-welcome-card");
    if (welcome) {
        welcome.innerHTML = `
            <div class="card-glow"></div>
            <h2>¡Hola, ${state.currentPatient.name}!</h2>
            <p>Tu bienestar emocional es muy importante. Aquí puedes realizar tus registros diarios y ver los videos y tareas que comparte tu psicóloga.</p>
            <div class="quick-actions">
                <button class="btn btn-primary" onclick="navigateToTab('family-new-record')">
                    <i data-lucide="plus-circle"></i> Registrar Estado de Hoy
                </button>
                <button class="btn btn-secondary" onclick="logout()" style="background: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.2); color: #f87171;">
                    <i data-lucide="log-out"></i> Salir del Portal
                </button>
            </div>
        `;
    }

    // Stats
    const totalRecords = state.records.filter(r => r.type === 'record').length;
    document.getElementById("family-stat-count").innerText = totalRecords;

    const totalIntensity = state.records.filter(r => r.type === 'record').reduce((sum, r) => sum + r.intensity, 0);
    const avgIntensity = totalRecords > 0 ? Math.round(totalIntensity / totalRecords) : 0;
    
    const intensityTitle = document.getElementById("family-intensity-title");
    if (intensityTitle) {
        intensityTitle.innerText = state.currentPatient.category === 'child' ? "Frecuencia de Emoción Fuerte" : "Intensidad Promedio";
    }
    document.getElementById("family-stat-avg-intensity").innerText = avgIntensity + "%";

    // Checklist
    renderDailyActivities();

    // Pending Tasks
    renderFamilyMiniTasks();

    // Chart
    renderChart('chart-family-evolution', 'paul', state.records);
    lucide.createIcons();
}

function renderDailyActivities() {
    const container = document.getElementById("family-activities-container");
    if (!container) return;
    container.innerHTML = "";

    if (state.dailyActivities.length === 0) {
        container.innerHTML = `
            <div class="empty-state-mini" style="text-align: center; padding: 1rem; border: 1px dashed var(--border-color); border-radius: var(--radius-sm); width: 100%;">
                <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0;">No hay actividades programadas para hoy.</p>
            </div>
        `;
        return;
    }

    state.dailyActivities.forEach(act => {
        const item = document.createElement("div");
        item.id = `activity-item-${act.id}`;
        item.className = `daily-habit-item ${act.completed ? 'completed' : ''}`;
        
        item.innerHTML = `
            <label class="habit-checkbox-label" style="display: flex; align-items: center; gap: 0.85rem; cursor: pointer; flex-grow: 1;">
                <input type="checkbox" onchange="toggleActivityState('${act.id}', this.checked)" ${act.completed ? 'checked' : ''}>
                <span>${act.content}</span>
            </label>
        `;
        container.appendChild(item);
    });
}

async function toggleActivityState(id, completed) {
    const activity = state.dailyActivities.find(a => a.id === id);
    if (activity) {
        activity.completed = completed;
    }
    const itemDiv = document.getElementById(`activity-item-${id}`);
    if (itemDiv) {
        if (completed) itemDiv.classList.add('completed');
        else itemDiv.classList.remove('completed');
    }

    try {
        await supabaseClient
            .from('daily_activities')
            .update({ completed })
            .eq('id', id);
    } catch (err) {
        console.error(err);
    }
}

async function syncTodayActivities() {
    if (!supabaseClient || !state.currentPatient) return;
    try {
        const { data } = await supabaseClient
            .from('daily_activities')
            .select('*')
            .eq('patient_id', state.currentPatient.id)
            .eq('date', getTodayLocalDateStr());
        state.dailyActivities = data || [];
    } catch (err) {
        console.error(err);
    }
}

function renderFamilyMiniTasks() {
    const container = document.getElementById("family-mini-tasks-container");
    if (!container) return;
    container.innerHTML = "";

    const pending = state.tasks.filter(t => !t.completed).slice(0, 3);

    if (pending.length === 0) {
        container.innerHTML = `
            <div class="empty-state-mini">
                <p style="font-size: 0.85rem; color: var(--text-secondary);">🎉 ¡No tienes tareas pendientes!</p>
            </div>
        `;
        return;
    }

    pending.forEach(task => {
        const item = document.createElement("div");
        item.className = "mini-task-item";
        item.innerHTML = `
            <span class="task-dot"></span>
            <div style="flex-grow: 1;">
                <div style="font-weight: 500; font-size: 0.85rem;">${task.title}</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">Límite: ${formatFriendlyDate(task.due)}</div>
            </div>
        `;
        container.appendChild(item);
    });
}

// Setup emotional recording fields dynamically based on patient category (age)
let childSelectedEmotion = "";

function setupNewRecordForm() {
    const childFields = document.getElementById("child-record-fields");
    const adolescentFields = document.getElementById("adolescent-record-fields");
    const desc = document.getElementById("record-form-desc");
    
    // Set default date
    const dateInput = document.getElementById("record-date");
    if (dateInput) dateInput.value = getTodayLocalDateStr();

    // Reset forms
    document.getElementById("form-self-record").reset();
    childSelectedEmotion = "";
    document.querySelectorAll(".emoji-selector-btn").forEach(btn => btn.classList.remove("active"));
    setChildIntensity(50, document.querySelectorAll(".child-rating-star")[1]);

    if (state.currentPatient.category === 'child') {
        childFields.style.display = "block";
        adolescentFields.style.display = "none";
        desc.innerText = "Registra cómo se ha sentido el niño/a hoy. Puedes pedirle que elija el emoji correspondiente.";
    } else {
        childFields.style.display = "none";
        adolescentFields.style.display = "block";
        desc.innerText = "Completa este registro cognitivo-conductual sobre lo que experimentaste hoy.";
        updateIntensityDisplay(50);
    }
}

function selectChildEmotion(name, emoji, btn) {
    document.querySelectorAll(".emoji-selector-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    childSelectedEmotion = name;
    document.getElementById("child-selected-emotion").value = name;
}

function setChildIntensity(val, btn) {
    document.querySelectorAll(".child-rating-star").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("child-intensity-value").value = val;
}

function updateIntensityDisplay(val) {
    const display = document.getElementById("intensity-value-display");
    if (display) display.innerText = val + "%";
}

async function saveSelfRecord(e) {
    e.preventDefault();
    const dateVal = document.getElementById("record-date").value;
    
    let emotions = [];
    let intensity = 50;
    let thought = "";
    let conduct = "";

    if (state.currentPatient.category === 'child') {
        if (!childSelectedEmotion) {
            alert("Por favor selecciona cómo te sientes hoy (elige un emoji).");
            return;
        }
        emotions = [childSelectedEmotion];
        intensity = parseInt(document.getElementById("child-intensity-value").value);
        thought = document.getElementById("child-thought").value.trim();
        conduct = document.getElementById("child-conduct").value.trim();
    } else {
        // Adolescent inputs
        document.querySelectorAll("input[name='emotions']:checked").forEach(checkbox => {
            emotions.push(checkbox.value);
        });
        const otherCheckbox = document.getElementById("checkbox-emotion-other");
        if (otherCheckbox && otherCheckbox.checked) {
            const otherVal = document.getElementById("record-emotion-other-text").value.trim();
            if (otherVal) emotions.push(otherVal);
        }
        if (emotions.length === 0) {
            alert("Selecciona al menos una emoción.");
            return;
        }
        intensity = parseInt(document.getElementById("record-intensity").value);
        thought = document.getElementById("record-thought").value.trim();
        conduct = document.getElementById("record-conduct").value.trim();
    }

    const newRecord = {
        id: "rec-" + Date.now(),
        patient_id: state.currentPatient.id,
        type: 'record',
        date: dateVal,
        thought_or_trigger: thought,
        emotions: emotions,
        intensity: intensity,
        conduct: conduct
    };

    try {
        const { error } = await supabaseClient
            .from('records')
            .insert([newRecord]);
        if (error) throw error;
        navigateToTab('family-dashboard');
    } catch (err) {
        console.error(err);
        alert("Error al guardar registro.");
    }
}

// --- FAMILY HISTORY & CSV EXPORTS ---

function renderFamilyHistory(filtered = null) {
    const feed = document.getElementById("family-records-feed");
    if (!feed) return;
    feed.innerHTML = "";

    const items = filtered || [...state.records].filter(r => r.type === 'record' || r.type === 'consultation')
                                                 .sort((a,b) => new Date(b.date) - new Date(a.date));

    if (items.length === 0) {
        feed.innerHTML = `
            <div class="card empty-state">
                <i data-lucide="folder-open"></i>
                <h3>No hay registros</h3>
                <p>No se encontraron registros emocionales en tu historial.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    items.forEach(item => {
        const card = document.createElement("div");
        if (item.type === 'record') {
            card.className = "card record-card";
            let emotionsChips = (item.emotions || []).map(emo => {
                return `<span class="emotion-chip size-small">${getEmotionEmoji(emo)} ${emo}</span>`;
            }).join(" ");

            let feedbackHTML = "";
            if (item.feedback) {
                feedbackHTML = `
                    <div class="record-feedback-section">
                        <div class="feedback-card-content">
                            <div class="feedback-header">
                                <span><i data-lucide="message-square"></i> Orientación de Psic. Daniela:</span>
                                <span>${formatDateTimeString(item.feedback_date)}</span>
                            </div>
                            <p class="feedback-text">${item.feedback}</p>
                        </div>
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="record-card-header">
                    <div class="record-type-date">
                        <span class="record-title-badge record-badge"><i data-lucide="clipboard-signature"></i> Mi Registro Diario</span>
                        <span class="record-date-str">${formatDateTimeString(item.date)}</span>
                    </div>
                    <span class="record-intensity-badge">Intensidad: ${item.intensity}%</span>
                </div>
                <div class="record-card-body">
                    <div class="thought-box">
                        <span class="box-title"><i data-lucide="brain"></i> Detonante / Qué pensó</span>
                        <p class="thought-text">"${item.thought_or_trigger}"</p>
                    </div>
                    <div class="record-emotions-row">
                        <span class="emotions-label">Emociones:</span>
                        <div class="emotions-list">${emotionsChips}</div>
                    </div>
                    <div class="conduct-box">
                        <span class="box-title"><i data-lucide="activity"></i> Qué hizo</span>
                        <p class="thought-text">${item.conduct || 'No registrado'}</p>
                    </div>
                    ${feedbackHTML}
                </div>
            `;
        } else {
            card.className = "card record-card consultation-type";
            card.innerHTML = `
                <div class="record-card-header">
                    <div class="record-type-date">
                        <span class="record-title-badge consultation-badge"><i data-lucide="calendar-heart"></i> Consulta de Terapia</span>
                        <span class="record-date-str">${formatFriendlyDate(item.date)}</span>
                    </div>
                </div>
                <div class="record-card-body">
                    <p style="font-size: 0.95rem; color: var(--text-secondary); font-style:italic;">Asististe a consulta con tu psicóloga este día.</p>
                </div>
            `;
        }
        feed.appendChild(card);
    });
    lucide.createIcons();
}

function applyFamilyFilters() {
    const search = document.getElementById("filter-search").value.toLowerCase();
    const emotion = document.getElementById("filter-emotion").value;
    const fromDate = document.getElementById("filter-date-from").value;
    const toDate = document.getElementById("filter-date-to").value;

    const filtered = state.records.filter(r => {
        if (r.type !== 'record' && r.type !== 'consultation') return false;

        if (r.type === 'record') {
            const matchesText = r.thought_or_trigger.toLowerCase().includes(search) || (r.conduct || '').toLowerCase().includes(search);
            if (!matchesText) return false;
            if (emotion && !r.emotions.includes(emotion)) return false;
        }

        if (fromDate && new Date(r.date) < new Date(fromDate + "T00:00")) return false;
        if (toDate && new Date(r.date) > new Date(toDate + "T23:59")) return false;

        return true;
    });

    renderFamilyHistory(filtered);
}

function resetFamilyFilters() {
    document.getElementById("filter-search").value = "";
    document.getElementById("filter-emotion").value = "";
    document.getElementById("filter-date-from").value = "";
    document.getElementById("filter-date-to").value = "";
    renderFamilyHistory();
}

function exportFamilyCSV() {
    const logs = state.records.filter(r => r.type === 'record' || r.type === 'consultation');
    if (logs.length === 0) return;

    let csv = "data:text/csv;charset=utf-8,\uFEFF";
    csv += "Tipo,Fecha,Detonante/Pensamiento,Intensidad,Emociones,Conducta\n";

    logs.sort((a,b) => new Date(a.date) - new Date(b.date)).forEach(r => {
        const type = r.type === 'record' ? 'Registro' : 'Consulta';
        const date = r.date;
        const trigger = r.type === 'record' ? `"${r.thought_or_trigger.replace(/"/g, '""')}"` : 'Consulta';
        const intensity = r.type === 'record' ? r.intensity + "%" : 'N/A';
        const emo = r.type === 'record' ? (r.emotions || []).join("|") : 'N/A';
        const conduct = r.type === 'record' ? `"${(r.conduct || '').replace(/"/g, '""')}"` : 'N/A';

        csv += `${type},${date},${trigger},${intensity},${emo},${conduct}\n`;
    });

    const encoded = encodeURI(csv);
    const link = document.createElement("a");
    link.href = encoded;
    link.download = `mindreg_reporte_${state.currentPatient.name.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- FAMILY TASKS & YOUTUBE PLAYER EMBEDS ---

function getYouTubeVideoId(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function renderFamilyTasks() {
    const container = document.getElementById("family-tasks-container");
    if (!container) return;
    container.innerHTML = "";

    if (state.tasks.length === 0) {
        container.innerHTML = `
            <div class="card empty-state" style="grid-column: 1/-1;">
                <i data-lucide="video"></i>
                <h3>No hay tareas o videos</h3>
                <p>Tu psicóloga aún no ha asignado actividades para el hogar.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    state.tasks.forEach(task => {
        const card = document.createElement("div");
        card.className = `card task-card ${task.completed ? 'completed' : ''}`;
        
        let statusLabel = task.completed ? `<span class="task-status-badge completed">Completada</span>` : `<span class="task-status-badge">Pendiente</span>`;
        
        let actionBtn = "";
        let submission = "";

        if (!task.completed) {
            if (task.type === 'video') {
                actionBtn = `
                    <button class="btn btn-secondary btn-full-width" id="btn-submit-task-${task.id}" disabled style="opacity: 0.65; cursor: not-allowed; border-color: rgba(125,125,125,0.15);">
                        <i data-lucide="lock"></i> Mira el video completo para desbloquear entrega
                    </button>
                `;
            } else {
                actionBtn = `
                    <button class="btn btn-primary" onclick="openTaskReplyModal('${task.id}', '${task.title.replace(/'/g, "\\'")}', false)">
                        <i data-lucide="file-up"></i> Entregar Actividad
                    </button>
                `;
            }
        } else {
            let fileHTML = "";
            if (task.file) {
                fileHTML = `
                    <div style="margin-top: 0.5rem;">
                        <a href="${task.file.path}" download="${task.file.originalName}" target="_blank" class="file-attachment-tag">
                            <i data-lucide="paperclip"></i> ${task.file.originalName} (${task.file.size})
                        </a>
                    </div>
                `;
            }
            submission = `
                <div class="task-reply-submission">
                    <span class="submission-header">Tu Respuesta:</span>
                    <p class="submission-content">${task.reply}</p>
                    ${fileHTML}
                    <span style="font-size: 0.7rem; color: var(--text-muted); display: block; margin-top: 0.5rem;">
                        Entregado el ${formatDateTimeString(task.completedDate)}
                    </span>
                </div>
            `;
        }

        let youtubeHTML = "";
        if (task.type === 'video' && task.youtube_url) {
            const videoId = getYouTubeVideoId(task.youtube_url);
            if (videoId) {
                if (task.completed) {
                    youtubeHTML = `
                        <div class="youtube-player-container" style="margin-top: 0.5rem; margin-bottom: 0.5rem;">
                            <iframe src="https://www.youtube.com/embed/${videoId}" allowfullscreen></iframe>
                        </div>
                    `;
                } else {
                    youtubeHTML = `
                        <div class="youtube-player-container" style="margin-top: 0.5rem; margin-bottom: 0.5rem;">
                            <div id="yt-player-${task.id}" class="yt-player-placeholder" data-video-id="${videoId}" data-task-id="${task.id}"></div>
                        </div>
                    `;
                }
            }
        }

        card.innerHTML = `
            <div>
                <div class="task-card-header">
                    <div class="task-title-group">
                        <h3>${task.title}</h3>
                        <span class="task-due-date">Límite: ${formatFriendlyDate(task.due)}</span>
                    </div>
                    ${statusLabel}
                </div>
                <p class="task-desc-text" style="margin-top: 0.75rem; margin-bottom: 0.75rem;">${task.desc}</p>
                ${youtubeHTML}
                ${submission}
            </div>
            <div style="margin-top: 0.5rem;">
                ${actionBtn}
            </div>
        `;
        container.appendChild(card);
    });

    lucide.createIcons();
    initializeYouTubePlayers();
}

function getYouTubeEmbedUrl(url) {
    if (!url) return null;
    let videoId = null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
        videoId = match[2];
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
}

// Reply Modal
function openTaskReplyModal(id, title, isVideo = false) {
    document.getElementById("reply-task-id").value = id;
    document.getElementById("reply-is-video").value = isVideo ? "true" : "false";
    document.getElementById("reply-task-title").innerHTML = `Actividad: <strong>${title}</strong>`;
    document.getElementById("modal-task-reply").classList.add("active");
    removeSelectedFile();
}

function closeTaskReplyModal() {
    document.getElementById("modal-task-reply").classList.remove("active");
    document.getElementById("form-task-reply").reset();
    removeSelectedFile();
}

function handleFileSelected(input) {
    const filePreview = document.getElementById("file-preview-container");
    const previewFilename = document.getElementById("preview-filename");
    const previewFilesize = document.getElementById("preview-filesize");
    
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const sizeInKB = Math.round(file.size / 1024);
        
        selectedFileMetadata = {
            name: file.name,
            size: sizeInKB + " KB",
            type: file.type
        };
        selectedRawFile = file;
        
        if (previewFilename) previewFilename.innerText = file.name;
        if (previewFilesize) previewFilesize.innerText = selectedFileMetadata.size;
        if (filePreview) filePreview.style.display = "flex";
        lucide.createIcons();
    }
}

function removeSelectedFile() {
    const fileInput = document.getElementById("reply-file");
    const filePreview = document.getElementById("file-preview-container");
    if (fileInput) fileInput.value = "";
    if (filePreview) filePreview.style.display = "none";
    selectedFileMetadata = null;
    selectedRawFile = null;
}

async function saveTaskReply(e) {
    e.preventDefault();
    const taskId = document.getElementById("reply-task-id").value;
    const replyVal = document.getElementById("reply-content").value.trim();
    
    let fileMetadata = null;

    try {
        if (selectedRawFile) {
            // Upload to Supabase Storage Bucket
            const fileExt = selectedRawFile.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.floor(Math.random() * 1000000)}.${fileExt}`;
            
            const { error: uploadError } = await supabaseClient.storage
                .from('task-attachments')
                .upload(fileName, selectedRawFile);

            if (uploadError) throw uploadError;

            const { data } = supabaseClient.storage
                .from('task-attachments')
                .getPublicUrl(fileName);

            fileMetadata = {
                path: data.publicUrl,
                originalName: selectedRawFile.name,
                size: selectedFileMetadata.size
            };
        }

        const isVideo = document.getElementById("reply-is-video").value === "true";
        const finalReply = isVideo ? `[Video 100% Visto] ${replyVal}` : replyVal;

        const { error } = await supabaseClient
            .from('tasks')
            .update({
                completed: true,
                reply: finalReply,
                completed_date: new Date().toISOString(),
                file_url: fileMetadata ? fileMetadata.path : null,
                file_name: fileMetadata ? fileMetadata.originalName : null,
                file_size: fileMetadata ? fileMetadata.size : null
            })
            .eq('id', taskId);

        if (error) throw error;
        closeTaskReplyModal();
        await loadFamilyData();
        renderFamilyTasks();
    } catch (err) {
        console.error(err);
        alert("Error al entregar la tarea.");
    }
}

// --- PORTAL DE PADRES (OBSERVACIONES DEL HOGAR) ---

function renderParentObservationsSection() {
    const dateInput = document.querySelector("#form-parent-report #report-date");
    if (dateInput) dateInput.value = getTodayLocalDateStr();
    
    document.getElementById("form-parent-report").reset();
    renderParentReportsList();
}

async function saveParentReport(e) {
    e.preventDefault();
    const dateVal = document.querySelector("#form-parent-report #report-date").value;
    const notesVal = document.getElementById("report-notes").value.trim();

    // Collect checklist categories checked
    const observedCategories = [];
    if (document.getElementById("check-sleep").checked) observedCategories.push("Sueño irregular");
    if (document.getElementById("check-eating").checked) observedCategories.push("Problemas de alimentación");
    if (document.getElementById("check-tantrum").checked) observedCategories.push("Rabieta/Desborde");
    if (document.getElementById("check-cooperation").checked) observedCategories.push("Buena disposición");
    if (document.getElementById("check-school").checked) observedCategories.push("Conflicto con tareas/escuela");
    if (document.getElementById("check-social").checked) observedCategories.push("Aislamiento/Discusiones");

    const newReport = {
        id: "rep-" + Date.now(),
        patient_id: state.currentPatient.id,
        type: 'parent_report',
        date: dateVal,
        emotions: observedCategories, // save categories in emotions field
        notes: notesVal
    };

    try {
        const { error } = await supabaseClient
            .from('records')
            .insert([newReport]);
        if (error) throw error;
        alert("Reporte guardado con éxito.");
        renderParentObservationsSection();
    } catch (err) {
        console.error(err);
        alert("Error al guardar reporte.");
    }
}

function renderParentReportsList() {
    const container = document.getElementById("parent-reports-container");
    if (!container) return;
    container.innerHTML = "";

    const reports = state.records.filter(r => r.type === 'parent_report')
                                 .sort((a,b) => new Date(b.date) - new Date(a.date));

    if (reports.length === 0) {
        container.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 2rem 0;">Aún no has registrado reportes diarios.</p>`;
        return;
    }

    reports.forEach(report => {
        const item = document.createElement("div");
        item.className = "card record-card parent-report-card";
        
        let tagsHTML = "";
        if (report.emotions && Array.isArray(report.emotions)) {
            tagsHTML = `<div class="report-tags">` + report.emotions.map(t => `<span class="report-tag">${t}</span>`).join("") + `</div>`;
        }

        item.innerHTML = `
            <div class="record-card-header">
                <span style="font-size: 0.85rem; font-weight: 700; color: var(--text-primary);"><i data-lucide="users"></i> Reporte del ${formatFriendlyDate(report.date)}</span>
            </div>
            <div class="record-card-body" style="gap: 0.5rem; margin-top: 0.25rem;">
                ${tagsHTML}
                <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.45;">${report.notes}</p>
            </div>
        `;
        container.appendChild(item);
    });
    lucide.createIcons();
}

// --- CHART RENDERING (Chart.js) ---

function renderChart(canvasId, role, customRecords = null) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (role === 'paul' && familyChartInstance) {
        familyChartInstance.destroy();
    } else if (role === 'therapist' && therapistChartInstance) {
        therapistChartInstance.destroy();
    }

    const sourceData = customRecords || state.records;
    // Filter out emotional records and consultations only
    const cleanLogs = sourceData.filter(r => r.type === 'record' || r.type === 'consultation')
                                .sort((a, b) => new Date(a.date) - new Date(b.date));

    const labels = [];
    const intensityData = [];
    const consultationsData = [];

    cleanLogs.forEach((item, idx) => {
        const dateObj = new Date(item.date);
        const dayLabel = `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;
        labels.push(dayLabel);

        if (item.type === 'record') {
            intensityData.push(item.intensity);
            consultationsData.push(null);
        } else {
            intensityData.push(null);
            consultationsData.push({
                x: idx,
                y: 100,
                notes: item.notes
            });
        }
    });

    const activeColor = role === 'paul' ? (state.currentPatient.category === 'child' ? '#fb8c00' : '#6366f1') : '#0d9488';
    const accentColor = '#f43f5e';

    const ctx = canvas.getContext('2d');
    
    // Create modern gradient area fill under the line
    let activeGradient = 'rgba(0, 0, 0, 0)';
    if (ctx) {
        const gradient = ctx.createLinearGradient(0, 0, 0, 240);
        if (role === 'paul') {
            if (state.currentPatient.category === 'child') {
                gradient.addColorStop(0, 'rgba(251, 140, 0, 0.22)');
                gradient.addColorStop(1, 'rgba(251, 140, 0, 0.00)');
            } else {
                gradient.addColorStop(0, 'rgba(99, 102, 241, 0.22)');
                gradient.addColorStop(1, 'rgba(99, 102, 241, 0.00)');
            }
        } else {
            gradient.addColorStop(0, 'rgba(13, 148, 136, 0.22)');
            gradient.addColorStop(1, 'rgba(13, 148, 136, 0.00)');
        }
        activeGradient = gradient;
    }

    const config = {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Intensidad / Bienestar',
                    data: intensityData,
                    borderColor: activeColor,
                    backgroundColor: activeGradient,
                    fill: true,
                    borderWidth: 3.5,
                    tension: 0.4, // smooth bezier curves
                    pointBackgroundColor: activeColor,
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 4.5,
                    pointHoverRadius: 7.5,
                    spanGaps: true
                },
                {
                    label: 'Consulta de Terapia',
                    data: consultationsData,
                    borderColor: accentColor,
                    backgroundColor: accentColor,
                    pointStyle: 'rectRot',
                    pointRadius: 8,
                    pointHoverRadius: 10,
                    showLine: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleFont: {
                        family: 'Plus Jakarta Sans',
                        size: 13,
                        weight: '700'
                    },
                    bodyFont: {
                        family: 'Plus Jakarta Sans',
                        size: 12
                    },
                    padding: 12,
                    cornerRadius: 10,
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            if (context.datasetIndex === 0) {
                                return ` Bienestar: ${context.parsed.y}%`;
                            } else {
                                const notes = context.raw.notes || "Consulta sin notas registradas";
                                return ` Consulta: ${notes}`;
                            }
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    border: {
                        display: false
                    },
                    ticks: {
                        font: {
                            family: role === 'paul' && state.currentPatient.category === 'child' ? 'Fredoka' : 'Plus Jakarta Sans',
                            weight: '600'
                        },
                        color: 'rgba(125, 125, 125, 0.5)'
                    }
                },
                y: {
                    min: 0,
                    max: 100,
                    grid: {
                        color: 'rgba(125, 125, 125, 0.05)',
                        drawBorder: false
                    },
                    border: {
                        display: false
                    },
                    ticks: {
                        callback: val => val + "%",
                        font: {
                            family: role === 'paul' && state.currentPatient.category === 'child' ? 'Fredoka' : 'Plus Jakarta Sans',
                            weight: '600'
                        },
                        color: 'rgba(125, 125, 125, 0.5)'
                    }
                }
            }
        }
    };

    const newChart = new Chart(ctx, config);

    if (role === 'paul') {
        familyChartInstance = newChart;
    } else {
        therapistChartInstance = newChart;
    }
}

// --- UTILITY DATE FORMATTERS ---

function getTodayLocalDateStr() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function formatFriendlyDate(dateStr) {
    if (!dateStr) return "Sin fecha";
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return `${parseInt(parts[2])} ${months[parseInt(parts[1]) - 1]} ${parts[0]}`;
}

function formatDateTimeString(str) {
    if (!str) return "Sin fecha";
    if (str.includes('T')) {
        const date = new Date(str);
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        const hh = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
    }
    const parts = str.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return str;
}

function getEmotionEmoji(emotion) {
    const map = {
        'Alegría': '😃',
        'Tristeza': '😢',
        'Ira': '😡',
        'Miedo': '😨',
        'Frustración': '😤',
        'Calma': '😌',
        'Ansiedad': '😰',
        'Culpa': '🥺',
        'Otro': '❓'
    };
    return map[emotion] || '⭐';
}

async function deleteCurrentPatient() {
    if (!state.selectedPatientId) return;
    
    const patient = state.patients.find(p => p.id === state.selectedPatientId);
    if (!patient) return;
    
    const confirmed = confirm(`¿Estás segura de que deseas eliminar al paciente ${patient.name}?\nEsta acción es permanente y borrará todos sus registros, tareas y reportes de padres.`);
    if (!confirmed) return;
    
    try {
        // Delete daily activities
        await supabaseClient
            .from('daily_activities')
            .delete()
            .eq('patient_id', state.selectedPatientId);
            
        // Delete tasks
        await supabaseClient
            .from('tasks')
            .delete()
            .eq('patient_id', state.selectedPatientId);
            
        // Delete records (emotional logs and consultations)
        await supabaseClient
            .from('records')
            .delete()
            .eq('patient_id', state.selectedPatientId);
            
        // Delete patient
        const { error } = await supabaseClient
            .from('patients')
            .delete()
            .eq('id', state.selectedPatientId);
            
        if (error) throw error;
        
        alert("Paciente eliminado correctamente.");
        state.selectedPatientId = null;
        navigateToTab('therapist-patients');
    } catch (err) {
        console.error("Error al eliminar paciente:", err);
        alert("Ocurrió un error al intentar eliminar al paciente.");
    }
}

// Window functions
window.deleteCurrentPatient = deleteCurrentPatient;
window.switchAuthTab = switchAuthTab;
window.handleFamilyLogin = handleFamilyLogin;
window.handleTherapistLogin = handleTherapistLogin;
window.switchDetailTab = switchDetailTab;
window.openNewPatientModal = openNewPatientModal;
window.closeNewPatientModal = closeNewPatientModal;
window.suggestCategoryByAge = suggestCategoryByAge;
window.generateRandomAccessCode = generateRandomAccessCode;
window.saveNewPatient = saveNewPatient;
window.openAssignTaskModal = openAssignTaskModal;
window.closeAssignTaskModal = closeAssignTaskModal;
window.toggleYoutubeUrlField = toggleYoutubeUrlField;
window.saveAssignedTask = saveAssignedTask;
window.openConsultationModal = openConsultationModal;
window.closeConsultationModal = closeConsultationModal;
window.saveConsultation = saveConsultation;
window.handleAddPatientActivity = handleAddPatientActivity;
window.deletePatientActivity = deletePatientActivity;
window.openClinicalCommentModal = openClinicalCommentModal;
window.closeClinicalCommentModal = closeClinicalCommentModal;
window.saveClinicalComment = saveClinicalComment;
window.toggleActivityState = toggleActivityState;
window.navigateToTab = navigateToTab;
window.selectChildEmotion = selectChildEmotion;
window.setChildIntensity = setChildIntensity;
window.saveSelfRecord = saveSelfRecord;
window.applyFamilyFilters = applyFamilyFilters;
window.resetFamilyFilters = resetFamilyFilters;
window.exportFamilyCSV = exportFamilyCSV;
window.openTaskReplyModal = openTaskReplyModal;
window.closeTaskReplyModal = closeTaskReplyModal;
window.handleFileSelected = handleFileSelected;
window.removeSelectedFile = removeSelectedFile;
window.saveTaskReply = saveTaskReply;
window.saveParentReport = saveParentReport;
window.logout = logout;

// YouTube Iframe API Integration
if (!window.YT) {
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    } else {
        document.head.appendChild(tag);
    }
}

// Global Callback for YouTube API
window.onYouTubeIframeAPIReady = function() {
    initializeYouTubePlayers();
};

function initializeYouTubePlayers() {
    if (typeof YT === 'undefined' || !YT.Player) return;
    
    document.querySelectorAll('.yt-player-placeholder').forEach(el => {
        const taskId = el.getAttribute('data-task-id');
        const videoId = el.getAttribute('data-video-id');
        
        if (el.tagName.toLowerCase() === 'iframe') return;

        new YT.Player(el.id, {
            videoId: videoId,
            playerVars: {
                'enablejsapi': 1,
                'origin': window.location.origin,
                'rel': 0,
                'modestbranding': 1
            },
            events: {
                'onStateChange': (event) => onPlayerStateChange(event, taskId)
            }
        });
    });
}

function onPlayerStateChange(event, taskId) {
    if (event.data === 0) { // YT.PlayerState.ENDED
        const btn = document.getElementById(`btn-submit-task-${taskId}`);
        if (btn) {
            btn.disabled = false;
            btn.className = "btn btn-primary btn-full-width";
            btn.style.opacity = "1";
            btn.style.cursor = "pointer";
            btn.style.borderColor = "";
            
            const task = state.tasks.find(t => t.id === taskId);
            const titleEscaped = task ? task.title.replace(/'/g, "\\'") : "";
            
            btn.innerHTML = `<i data-lucide="check-circle-2"></i> ¡Video Visto! Entregar Actividad`;
            btn.onclick = () => openTaskReplyModal(taskId, titleEscaped, true);
            lucide.createIcons();
        }
    }
}
