// ==========================================
// CONFIGURACIÓN DE TU PROYECTO DE SUPABASE
// ==========================================
// Reemplaza estos dos valores con los datos de tu proyecto en Supabase.
// Puedes encontrarlos en: Settings -> API en tu panel de control de Supabase.
const SUPABASE_URL = "https://hjifqjppjswfgqmartoz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqaWZxanBwanN3ZmdxbWFydG96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MDM0NzMsImV4cCI6MjA5NjE3OTQ3M30.fJltRIJSCacfup_YHxrbgPtk45Vgr8yogjO3n4I9H80";

// Global State variables
let state = {
    activeRole: 'paul', // 'paul' or 'emily'
    activeTab: 'paul-dashboard', // default tab
    records: [],
    tasks: [],
    dailyActivities: [],
    paulTodayActivities: [],
    paulRecentActivities: []
};

// Global chart instances
let paulChartInstance = null;
let emilyChartInstance = null;
let selectedFileMetadata = null; // Temp holder for file upload previews
let selectedRawFile = null; // Temp holder for the actual raw file object

// Initialize Supabase Client
let supabaseClient = null;
const isSupabaseConfigured = (SUPABASE_URL !== "TU_SUPABASE_URL" && SUPABASE_ANON_KEY !== "TU_SUPABASE_ANON_KEY");

if (window.supabase && isSupabaseConfigured) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// App Initialization
document.addEventListener("DOMContentLoaded", async () => {
    if (!isSupabaseConfigured) {
        showConfigWarning();
    }
    // Check if Emily is authenticated in sessionStorage
    const isEmilyLogged = sessionStorage.getItem("mindreg_emily_logged_in") === "true";
    state.activeRole = isEmilyLogged ? 'emily' : 'paul';
    state.activeTab = isEmilyLogged ? 'emily-dashboard' : 'paul-dashboard';

    await initDatabase();
    setDefaultDateInput();
    renderNavigation();
    navigateToTab(state.activeTab);
    lucide.createIcons();
});

// Show config warning modal overlay if keys are placeholder values
function showConfigWarning() {
    const warningDiv = document.createElement("div");
    warningDiv.style.position = "fixed";
    warningDiv.style.top = "1.5rem";
    warningDiv.style.left = "50%";
    warningDiv.style.transform = "translateX(-50%)";
    warningDiv.style.background = "#f59e0b";
    warningDiv.style.color = "#0b0f19";
    warningDiv.style.padding = "1rem 1.5rem";
    warningDiv.style.borderRadius = "8px";
    warningDiv.style.boxShadow = "0 8px 24px rgba(0,0,0,0.5)";
    warningDiv.style.zIndex = "2000";
    warningDiv.style.fontSize = "0.9rem";
    warningDiv.style.fontWeight = "600";
    warningDiv.style.textAlign = "center";
    warningDiv.style.maxWidth = "90%";
    warningDiv.innerHTML = `
        <span>⚠️ Supabase no está configurado. Abre el archivo <code>app.js</code> e ingresa tus credenciales en las líneas 5 y 6 para poder guardar tus datos en la nube.</span>
    `;
    document.body.appendChild(warningDiv);
}

// Sync data from Supabase Cloud
async function initDatabase() {
    // Check if Emily is authenticated in sessionStorage
    const isEmilyLogged = sessionStorage.getItem("mindreg_emily_logged_in") === "true";
    state.activeRole = isEmilyLogged ? 'emily' : 'paul';
    state.activeTab = isEmilyLogged ? 'emily-dashboard' : 'paul-dashboard';
    
    // Sync UI view theme class
    updateThemeClass();

    if (!supabaseClient) return;

    // Fetch data from Supabase
    try {
        // 1. Fetch records & consultations
        const { data: recordsData, error: recordsError } = await supabaseClient
            .from('records')
            .select('*');

        if (recordsError) throw recordsError;
        
        // Map database fields to frontend structure (snake_case -> camelCase)
        state.records = (recordsData || []).map(r => ({
            id: r.id,
            type: r.type,
            date: r.date,
            thought: r.thought,
            emotions: r.emotions,
            intensity: r.intensity,
            conduct: r.conduct,
            feedback: r.feedback,
            feedbackDate: r.feedback_date
        }));

        // 2. Fetch tasks
        const { data: tasksData, error: tasksError } = await supabaseClient
            .from('tasks')
            .select('*');

        if (tasksError) throw tasksError;

        // Map database tasks structure (snake_case -> camelCase)
        state.tasks = (tasksData || []).map(t => ({
            id: t.id,
            title: t.title,
            desc: t.desc,
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
    } catch (err) {
        console.error("Error sincronizando con Supabase:", err);
    }
}

function updateThemeClass() {
    const badgeText = document.getElementById('role-badge-text');

    if (state.activeRole === 'paul') {
        document.body.classList.remove('role-emily-theme');
        if (badgeText) badgeText.innerText = "Paul (Paciente) 🐢";
    } else {
        document.body.classList.add('role-emily-theme');
        if (badgeText) badgeText.innerText = "Psic. Emily Mejias";
    }
    renderAuthBar();
}

// Set current time in record form date picker
function setDefaultDateInput() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    
    const dateTimeLocal = `${yyyy}-${mm}-${dd}T${hh}:${min}`;
    const dateInput = document.getElementById("record-date");
    if (dateInput) dateInput.value = dateTimeLocal;
}

// Render dynamic tabs depending on the active role
function renderNavigation() {
    const navContainer = document.getElementById("nav-links-container");
    if (!navContainer) return;
    navContainer.innerHTML = "";

    const paulLinks = [
        { id: "paul-dashboard", label: "Mi Progreso", icon: "layout-dashboard" },
        { id: "paul-new-record", label: "Nuevo Registro", icon: "plus-circle" },
        { id: "paul-history", label: "Historial", icon: "history" },
        { id: "paul-tasks", label: "Mis Tareas", icon: "check-square" }
    ];

    const emilyLinks = [
        { id: "emily-dashboard", label: "Resumen Clínico", icon: "gauge" },
        { id: "emily-records", label: "Ver Registros de Paul", icon: "folder-heart" },
        { id: "emily-assign-task", label: "Asignar Tareas", icon: "clipboard-list" }
    ];

    const activeLinks = state.activeRole === 'paul' ? paulLinks : emilyLinks;

    activeLinks.forEach(link => {
        const btn = document.createElement("button");
        btn.id = `nav-tab-${link.id}`;
        btn.className = "nav-tab";
        btn.onclick = () => navigateToTab(link.id);
        btn.innerHTML = `<i data-lucide="${link.icon}"></i> ${link.label}`;
        navContainer.appendChild(btn);
    });

    lucide.createIcons();
}

// Handle switching between patient and therapist views
function switchRole(role) {
    state.activeRole = role;
    state.activeTab = role === 'paul' ? 'paul-dashboard' : 'emily-dashboard';
    
    updateThemeClass();
    renderNavigation();
    navigateToTab(state.activeTab);
}

// Render Session/Auth Bar in Header
function renderAuthBar() {
    const authBar = document.getElementById("session-auth-bar");
    if (!authBar) return;

    if (state.activeRole === 'paul') {
        authBar.innerHTML = `
            <span class="user-display-name" style="font-family: var(--font-heading); font-weight: 600; font-size: 0.95rem; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem;">
                <i data-lucide="user" style="width: 1.1rem; height: 1.1rem; color: var(--color-patient);"></i> Paul (Paciente) 🐢
            </span>
            <button id="btn-login-emily" class="btn btn-secondary btn-sm" onclick="showTherapistAuthModal()" style="padding: 0.4rem 0.85rem; font-size: 0.8rem; border-radius: var(--radius-sm);">
                <i data-lucide="lock" style="width: 0.9rem; height: 0.9rem; vertical-align: text-bottom; margin-right: 0.25rem;"></i> Acceso Psicóloga
            </button>
        `;
    } else {
        authBar.innerHTML = `
            <span class="user-display-name" style="font-family: var(--font-heading); font-weight: 600; font-size: 0.95rem; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem;">
                <i data-lucide="shield-check" style="width: 1.1rem; height: 1.1rem; color: var(--color-psy);"></i> Psic. Emily
            </span>
            <button id="btn-logout-emily" class="btn btn-secondary btn-sm" onclick="logoutEmily()" style="padding: 0.4rem 0.85rem; font-size: 0.8rem; border-radius: var(--radius-sm); border-color: rgba(13, 148, 136, 0.25); color: var(--color-psy);">
                <i data-lucide="log-out" style="width: 0.9rem; height: 0.9rem; vertical-align: text-bottom; margin-right: 0.25rem;"></i> Cerrar Sesión
            </button>
        `;
    }
    lucide.createIcons();
}

// --- THERAPIST PASSWORD AUTHENTICATION LOGIC ---

let isPasswordSet = false;
let storedPasswordHash = null;

// SHA-256 Hashing helper
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);                    
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// Check database to see if a password is set
async function checkStoredPassword() {
    if (!supabaseClient) return false;
    try {
        const { data, error } = await supabaseClient
            .from('app_config')
            .select('value')
            .eq('key', 'therapist_password')
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is code for 0 rows returned
            throw error;
        }

        if (data && data.value) {
            isPasswordSet = true;
            storedPasswordHash = data.value;
            return true;
        } else {
            isPasswordSet = false;
            storedPasswordHash = null;
            return false;
        }
    } catch (err) {
        console.error("Error al consultar contraseña en Supabase:", err);
        return false;
    }
}

// Modals management for therapist login
async function showTherapistAuthModal() {
    const modal = document.getElementById("modal-therapist-auth");
    const desc = document.getElementById("auth-modal-desc");
    const confirmGroup = document.getElementById("pwd-confirm-group");
    const submitBtn = document.getElementById("btn-auth-submit");
    const errorMsg = document.getElementById("auth-error-msg");

    if (errorMsg) errorMsg.style.display = "none";
    const form = document.getElementById("form-therapist-auth");
    if (form) form.reset();

    if (modal) modal.classList.add("active");

    if (desc) desc.innerText = "Cargando configuración de seguridad...";
    if (submitBtn) submitBtn.disabled = true;

    const hasPassword = await checkStoredPassword();
    if (submitBtn) submitBtn.disabled = false;

    if (hasPassword) {
        if (desc) desc.innerText = "Ingresa la contraseña para ingresar al panel clínico.";
        if (confirmGroup) confirmGroup.style.display = "none";
        if (submitBtn) submitBtn.innerText = "Ingresar";
    } else {
        if (desc) desc.innerHTML = `<span style="color: var(--color-psy); font-weight: 600;">Es la primera vez que ingresas.</span> Define una contraseña de acceso para la Psicóloga. Esta contraseña no podrá ser vista por el paciente.`;
        if (confirmGroup) confirmGroup.style.display = "block";
        if (submitBtn) submitBtn.innerText = "Crear Contraseña";
    }
}

function closeTherapistAuthModal() {
    const modal = document.getElementById("modal-therapist-auth");
    if (modal) modal.classList.remove("active");
}

async function handleTherapistAuth(e) {
    e.preventDefault();
    const errorMsg = document.getElementById("auth-error-msg");
    if (errorMsg) errorMsg.style.display = "none";

    const passwordInput = document.getElementById("therapist-password-input").value;
    const confirmInput = document.getElementById("therapist-password-confirm") ? document.getElementById("therapist-password-confirm").value : "";

    const hasPassword = isPasswordSet;

    if (!hasPassword) {
        // First-time setting up password
        if (passwordInput !== confirmInput) {
            if (errorMsg) {
                errorMsg.innerText = "Las contraseñas no coinciden.";
                errorMsg.style.display = "block";
            }
            return;
        }
        if (passwordInput.length < 4) {
            if (errorMsg) {
                errorMsg.innerText = "La contraseña debe tener al menos 4 caracteres.";
                errorMsg.style.display = "block";
            }
            return;
        }

        const hashed = await sha256(passwordInput);
        if (supabaseClient) {
            try {
                const { error } = await supabaseClient
                    .from('app_config')
                    .upsert([{ key: 'therapist_password', value: hashed, updated_at: new Date().toISOString() }]);

                if (error) throw error;

                isPasswordSet = true;
                storedPasswordHash = hashed;
            } catch (err) {
                console.error("Error al guardar contraseña en Supabase:", err);
                if (errorMsg) {
                    errorMsg.innerText = "Error al guardar contraseña en la nube.";
                    errorMsg.style.display = "block";
                }
                return;
            }
        }
    } else {
        // Checking existing password
        const hashed = await sha256(passwordInput);
        if (hashed !== storedPasswordHash) {
            if (errorMsg) {
                errorMsg.innerText = "Contraseña incorrecta.";
                errorMsg.style.display = "block";
            }
            return;
        }
    }

    // Auth success: login and switch role
    sessionStorage.setItem("mindreg_emily_logged_in", "true");
    closeTherapistAuthModal();
    switchRole('emily');
}

function logoutEmily() {
    sessionStorage.removeItem("mindreg_emily_logged_in");
    switchRole('paul');
}

// Modals management for password changing
function showChangePasswordModal() {
    const modal = document.getElementById("modal-change-password");
    const errorMsg = document.getElementById("change-pwd-error-msg");
    const successMsg = document.getElementById("change-pwd-success-msg");

    if (errorMsg) errorMsg.style.display = "none";
    if (successMsg) successMsg.style.display = "none";
    const form = document.getElementById("form-change-password");
    if (form) form.reset();

    if (modal) modal.classList.add("active");
}

function closeChangePasswordModal() {
    const modal = document.getElementById("modal-change-password");
    if (modal) modal.classList.remove("active");
}

async function handleChangePasswordSubmit(e) {
    e.preventDefault();
    const errorMsg = document.getElementById("change-pwd-error-msg");
    const successMsg = document.getElementById("change-pwd-success-msg");

    if (errorMsg) errorMsg.style.display = "none";
    if (successMsg) successMsg.style.display = "none";

    const currentPwd = document.getElementById("change-pwd-current").value;
    const newPwd = document.getElementById("change-pwd-new").value;
    const confirmPwd = document.getElementById("change-pwd-confirm").value;

    const currentHashed = await sha256(currentPwd);

    // Refresh storing check
    await checkStoredPassword();
    if (currentHashed !== storedPasswordHash) {
        if (errorMsg) {
            errorMsg.innerText = "La contraseña actual es incorrecta.";
            errorMsg.style.display = "block";
        }
        return;
    }

    if (newPwd !== confirmPwd) {
        if (errorMsg) {
            errorMsg.innerText = "Las nuevas contraseñas no coinciden.";
            errorMsg.style.display = "block";
        }
        return;
    }

    if (newPwd.length < 4) {
        if (errorMsg) {
            errorMsg.innerText = "La nueva contraseña debe tener al menos 4 caracteres.";
            errorMsg.style.display = "block";
        }
        return;
    }

    const newHashed = await sha256(newPwd);

    if (supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('app_config')
                .upsert([{ key: 'therapist_password', value: newHashed, updated_at: new Date().toISOString() }]);

            if (error) throw error;

            storedPasswordHash = newHashed;
            if (successMsg) {
                successMsg.innerText = "¡Contraseña actualizada con éxito!";
                successMsg.style.display = "block";
            }
            setTimeout(() => {
                closeChangePasswordModal();
            }, 1200);
        } catch (err) {
            console.error("Error al actualizar la contraseña:", err);
            if (errorMsg) {
                errorMsg.innerText = "Error al guardar en la nube.";
                errorMsg.style.display = "block";
            }
        }
    }
}

async function navigateToTab(tabId) {
    // Security check: restrict clinical tabs to Emily
    const therapistTabs = ['emily-dashboard', 'emily-records', 'emily-assign-task'];
    if (therapistTabs.includes(tabId) && state.activeRole !== 'emily') {
        tabId = 'paul-dashboard';
    }
    state.activeTab = tabId;
    
    // Hide all sections
    document.querySelectorAll(".content-section").forEach(sec => {
        sec.classList.remove("active");
    });

    // Show selected section
    const targetSection = document.getElementById(`section-${tabId}`);
    if (targetSection) {
        targetSection.classList.add("active");
    }

    // Update active class on tab buttons
    document.querySelectorAll(".nav-tab").forEach(tab => {
        tab.classList.remove("active");
    });
    const activeBtn = document.getElementById(`nav-tab-${tabId}`);
    if (activeBtn) {
        activeBtn.classList.add("active");
    }

    // Re-fetch data on active navigation if Supabase is set
    if (supabaseClient) {
        try {
            if (tabId === 'paul-dashboard' || tabId === 'emily-dashboard' || tabId === 'paul-history' || tabId === 'emily-records') {
                const { data } = await supabaseClient.from('records').select('*');
                if (data) {
                    state.records = data.map(r => ({
                        id: r.id,
                        type: r.type,
                        date: r.date,
                        thought: r.thought,
                        emotions: r.emotions,
                        intensity: r.intensity,
                        conduct: r.conduct,
                        feedback: r.feedback,
                        feedbackDate: r.feedback_date
                    }));
                }
            }
            if (tabId === 'paul-tasks' || tabId === 'emily-assign-task' || tabId === 'paul-dashboard' || tabId === 'emily-dashboard') {
                const { data } = await supabaseClient.from('tasks').select('*');
                if (data) {
                    state.tasks = data.map(t => ({
                        id: t.id,
                        title: t.title,
                        desc: t.desc,
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
                }
            }
        } catch (e) {
            console.warn("Error auto-sincronizando con Supabase:", e.message);
        }
    }

    // Custom tab trigger renders
    if (tabId === 'paul-dashboard') {
        await syncTodayActivities();
        renderPaulDashboard();
    } else if (tabId === 'paul-history') {
        renderPaulHistory();
    } else if (tabId === 'paul-new-record') {
        setDefaultDateInput();
        updateIntensityDisplay(50);
        document.getElementById("form-self-record").reset();
        const otherGroup = document.getElementById("group-other-emotion");
        if (otherGroup) otherGroup.style.display = "none";
        const otherInput = document.getElementById("record-emotion-other-text");
        if (otherInput) otherInput.required = false;
        document.getElementById("record-intensity").value = 50;
    } else if (tabId === 'paul-tasks') {
        renderPaulTasks();
    } else if (tabId === 'emily-dashboard') {
        await syncEmilyRecentActivities();
        renderEmilyDashboard();
    } else if (tabId === 'emily-records') {
        renderEmilyRecords();
    } else if (tabId === 'emily-assign-task') {
        renderEmilyTasksPanel();
    }
}

// --- PACIENT FLOW (PAUL) ---

// Updates label for intensity slider
function updateIntensityDisplay(val) {
    const display = document.getElementById("intensity-value-display");
    if (display) {
        display.innerText = val + "%";
    }
}

// Save emotional record directly to Supabase table
async function saveSelfRecord(e) {
    e.preventDefault();

    const dateVal = document.getElementById("record-date").value;
    const thoughtVal = document.getElementById("record-thought").value;
    const intensityVal = parseInt(document.getElementById("record-intensity").value);
    const conductVal = document.getElementById("record-conduct").value;
    
    // Get checked emotions
    const emotionsChecked = [];
    document.querySelectorAll("input[name='emotions']:checked").forEach(checkbox => {
        emotionsChecked.push(checkbox.value);
    });

    const otherCheckbox = document.getElementById("checkbox-emotion-other");
    if (otherCheckbox && otherCheckbox.checked) {
        const otherVal = document.getElementById("record-emotion-other-text").value.trim();
        if (otherVal) {
            emotionsChecked.push(otherVal);
        }
    }

    if (emotionsChecked.length === 0) {
        alert("Por favor, selecciona al menos una emoción.");
        return;
    }

    const newRecord = {
        id: "rec-" + Date.now(),
        type: "record",
        date: dateVal,
        thought: thoughtVal,
        emotions: emotionsChecked,
        intensity: intensityVal,
        conduct: conductVal,
        feedback: null
    };

    if (supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('records')
                .insert([{
                    id: newRecord.id,
                    type: newRecord.type,
                    date: newRecord.date,
                    thought: newRecord.thought,
                    emotions: newRecord.emotions,
                    intensity: newRecord.intensity,
                    conduct: newRecord.conduct
                }]);

            if (error) throw error;
        } catch (err) {
            console.error("Error guardando en Supabase:", err);
            alert("No se pudo guardar el autorregistro en la nube. Se guardará de forma local temporalmente.");
        }
    }

    state.records.push(newRecord);
    navigateToTab('paul-dashboard');
}

// Populate stats & render chart on Paul's dashboard
function renderPaulDashboard() {
    // 1. Stats Counter
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthlyRecords = state.records.filter(r => {
        if (r.type !== 'record') return false;
        const rDate = new Date(r.date);
        return rDate.getMonth() === currentMonth && rDate.getFullYear() === currentYear;
    });

    document.getElementById("paul-stat-count").innerText = monthlyRecords.length;

    // 2. Average intensity
    const totalIntensity = monthlyRecords.reduce((sum, r) => sum + r.intensity, 0);
    const avgIntensity = monthlyRecords.length > 0 ? Math.round(totalIntensity / monthlyRecords.length) : 0;
    document.getElementById("paul-stat-avg-intensity").innerText = avgIntensity + "%";

    // 3. Render mini tasks checklist
    renderPaulMiniTasks();

    // Render daily activities
    renderDailyActivities();

    // 4. Render Evolution Chart
    renderChart('chart-paul-evolution', 'paul');
}

// Display top 3 tasks on Patient Dashboard
function renderPaulMiniTasks() {
    const container = document.getElementById("paul-mini-tasks-container");
    container.innerHTML = "";

    const pendingTasks = state.tasks.filter(t => !t.completed).slice(0, 3);

    if (pendingTasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state-mini">
                <p style="font-size: 0.85rem; color: var(--text-secondary);">🎉 ¡No tienes tareas pendientes asignadas!</p>
            </div>
        `;
        return;
    }

    pendingTasks.forEach(task => {
        const item = document.createElement("div");
        item.className = "mini-task-item";
        
        const dueText = formatFriendlyDate(task.due);
        item.innerHTML = `
            <span class="task-dot"></span>
            <div style="flex-grow: 1;">
                <div style="font-weight: 500; font-size: 0.85rem;">${task.title}</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">Límite: ${dueText}</div>
            </div>
        `;
        container.appendChild(item);
    });
}

// Render patient Tasks view
function renderPaulTasks() {
    const container = document.getElementById("paul-tasks-container");
    container.innerHTML = "";

    if (state.tasks.length === 0) {
        container.innerHTML = `
            <div class="card empty-state" style="grid-column: 1/-1;">
                <i data-lucide="check-square"></i>
                <h3>No hay tareas</h3>
                <p>La Psic. Emily aún no ha asignado tareas en el sistema.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    const sortedTasks = [...state.tasks].sort((a, b) => a.completed - b.completed);

    sortedTasks.forEach(task => {
        const card = document.createElement("div");
        card.className = `card task-card ${task.completed ? 'completed' : ''}`;
        
        const dueText = formatFriendlyDate(task.due);
        
        let replyBtnHTML = "";
        let submissionHTML = "";
        
        if (!task.completed) {
            replyBtnHTML = `
                <button class="btn btn-primary" onclick="openTaskReplyModal('${task.id}', '${task.title.replace(/'/g, "\\'")}')">
                    <i data-lucide="file-up"></i> Entregar Tarea
                </button>
            `;
        } else {
            let fileHTML = "";
            if (task.file) {
                fileHTML = `
                    <div style="margin-top: 0.65rem; display: flex; flex-direction: column; gap: 0.25rem;">
                        <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Archivo Adjunto:</span>
                        <a href="${task.file.path}" download="${task.file.originalName}" target="_blank" class="file-attachment-tag">
                            <i data-lucide="paperclip"></i> ${task.file.originalName} (${task.file.size})
                        </a>
                    </div>
                `;
            }

            submissionHTML = `
                <div class="task-reply-submission">
                    <span class="submission-header">Tu Respuesta:</span>
                    <p class="submission-content">${task.reply}</p>
                    ${fileHTML}
                    <span style="font-size:0.75rem; color:var(--text-muted); display:block; margin-top:0.5rem;">
                        Entregado el ${formatDateTimeString(task.completedDate)}
                    </span>
                </div>
            `;
        }

        card.innerHTML = `
            <div>
                <div class="task-card-header">
                    <div class="task-title-group">
                        <h3>${task.title}</h3>
                        <span class="task-due-date">Fecha límite: ${dueText}</span>
                    </div>
                    <span class="task-status-badge ${task.completed ? 'completed' : ''}">
                        ${task.completed ? 'Completada' : 'Pendiente'}
                    </span>
                </div>
                <p class="task-desc-text" style="margin-top: 1rem; margin-bottom: 1rem;">${task.desc}</p>
                ${submissionHTML}
            </div>
            <div style="margin-top: 1rem;">
                ${replyBtnHTML}
            </div>
        `;
        
        container.appendChild(card);
    });

    lucide.createIcons();
}

// Open / Close Consultation Modal
function openConsultationModal() {
    const modal = document.getElementById("modal-consultation");
    modal.classList.add("active");
    
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    document.getElementById("consultation-date").value = `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function closeConsultationModal() {
    document.getElementById("modal-consultation").classList.remove("active");
    document.getElementById("form-consultation").reset();
}

// Save consultation details via Supabase
async function saveConsultation(e) {
    e.preventDefault();

    const dateVal = document.getElementById("consultation-date").value;
    const notesVal = document.getElementById("consultation-notes").value;

    const newConsultation = {
        id: "con-" + Date.now(),
        type: "consultation",
        date: dateVal,
        notes: notesVal
    };

    if (supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('records')
                .insert([{
                    id: newConsultation.id,
                    type: newConsultation.type,
                    date: newConsultation.date,
                    notes: newConsultation.notes
                }]);

            if (error) throw error;
        } catch (err) {
            console.error("Error guardando consulta en Supabase:", err);
            alert("No se pudo guardar la consulta en la nube.");
        }
    }

    state.records.push(newConsultation);
    closeConsultationModal();
    if (state.activeRole === 'paul') {
        renderPaulDashboard();
    } else {
        renderEmilyDashboard();
    }
}

// Open / Close Task Reply Modal
function openTaskReplyModal(id, title) {
    document.getElementById("reply-task-id").value = id;
    document.getElementById("reply-task-title").innerHTML = `Asignación: <strong>${title}</strong>`;
    document.getElementById("modal-task-reply").classList.add("active");
}

function closeTaskReplyModal() {
    document.getElementById("modal-task-reply").classList.remove("active");
    document.getElementById("form-task-reply").reset();
    removeSelectedFile();
}

// Upload file to Supabase Storage Bucket and update task row
async function saveTaskReply(e) {
    e.preventDefault();

    const taskId = document.getElementById("reply-task-id").value;
    const replyVal = document.getElementById("reply-content").value;
    const fileInput = document.getElementById("reply-file");

    let fileMetadata = null;

    if (supabaseClient) {
        try {
            // Process file upload if file is selected
            if (fileInput && fileInput.files[0]) {
                const file = fileInput.files[0];
                const fileExt = file.name.split('.').pop();
                const uniqueFileName = `${Date.now()}_${Math.round(Math.random() * 1E6)}.${fileExt}`;
                const sizeText = (file.size / 1024).toFixed(1) + " KB";
                
                // Upload to Supabase Storage Bucket 'task-attachments'
                const { data: uploadData, error: uploadError } = await supabaseClient.storage
                    .from('task-attachments')
                    .upload(uniqueFileName, file);

                if (uploadError) throw uploadError;

                // Get public URL of uploaded file
                const { data: urlData } = supabaseClient.storage
                    .from('task-attachments')
                    .getPublicUrl(uniqueFileName);

                fileMetadata = {
                    path: urlData.publicUrl,
                    originalName: file.name,
                    size: sizeText
                };
            }

            // Update task in database
            const { error } = await supabaseClient
                .from('tasks')
                .update({
                    completed: true,
                    reply: replyVal,
                    completed_date: new Date().toISOString(),
                    file_url: fileMetadata ? fileMetadata.path : null,
                    file_name: fileMetadata ? fileMetadata.originalName : null,
                    file_size: fileMetadata ? fileMetadata.size : null
                })
                .eq('id', taskId);

            if (error) throw error;

            // Sync state
            const taskIndex = state.tasks.findIndex(t => t.id === taskId);
            if (taskIndex !== -1) {
                state.tasks[taskIndex].completed = true;
                state.tasks[taskIndex].reply = replyVal;
                state.tasks[taskIndex].completedDate = new Date().toISOString();
                state.tasks[taskIndex].file = fileMetadata;
            }
        } catch (err) {
            console.error("Error al subir archivo o guardar respuesta en Supabase:", err);
            alert("No se pudo subir el archivo o entregar la tarea en Supabase.");
            return;
        }
    } else {
        // Fallback local state update if supabase is not connected
        const taskIndex = state.tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
            state.tasks[taskIndex].completed = true;
            state.tasks[taskIndex].reply = replyVal;
            state.tasks[taskIndex].completedDate = new Date().toISOString();
            state.tasks[taskIndex].file = selectedFileMetadata ? {
                path: "#",
                originalName: selectedFileMetadata.name,
                size: selectedFileMetadata.size
            } : null;
        }
    }

    closeTaskReplyModal();
    renderPaulTasks();
}

// File Attachment Event Handlers (Preview before uploading)
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

// Render Patient's records history
function renderPaulHistory(filteredRecords = null) {
    const feedContainer = document.getElementById("paul-records-feed");
    feedContainer.innerHTML = "";

    const recordsToRender = filteredRecords || [...state.records].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (recordsToRender.length === 0) {
        feedContainer.innerHTML = `
            <div class="card empty-state">
                <i data-lucide="folder-open"></i>
                <h3>No hay registros</h3>
                <p>No se encontraron autorregistros con los filtros aplicados.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    recordsToRender.forEach(item => {
        const card = document.createElement("div");
        
        if (item.type === 'record') {
            card.className = "card record-card";
            
            let emotionsChips = "";
            item.emotions.forEach(emo => {
                const emotionClass = "emo-" + emo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                emotionsChips += `<span class="emotion-chip size-small ${emotionClass}">${emo}</span> `;
            });

            const intensityClass = item.intensity >= 80 ? 'high-intensity' : '';
            
            let feedbackHTML = "";
            if (item.feedback) {
                feedbackHTML = `
                    <div class="record-feedback-section">
                        <div class="feedback-card-content">
                            <div class="feedback-header">
                                <span><i data-lucide="message-square"></i> Psic. Emily Mejias</span>
                                <span>${formatDateTimeString(item.feedbackDate)}</span>
                            </div>
                            <p class="feedback-text">${item.feedback}</p>
                        </div>
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="record-card-header">
                    <div class="record-type-date">
                        <span class="record-title-badge record-badge"><i data-lucide="clipboard-signature"></i> Autorregistro</span>
                        <span class="record-date-str">${formatDateTimeString(item.date)}</span>
                    </div>
                    <span class="record-intensity-badge ${intensityClass}">Intensidad: ${item.intensity}%</span>
                </div>
                <div class="record-card-body">
                    <div class="thought-box">
                        <span class="box-title"><i data-lucide="brain"></i> Pensamiento Automático</span>
                        <p class="thought-text">"${item.thought}"</p>
                    </div>
                    <div class="record-emotions-row">
                        <span class="emotions-label">Emociones:</span>
                        <div class="emotions-list">${emotionsChips}</div>
                    </div>
                    <div class="conduct-box">
                        <span class="box-title"><i data-lucide="activity"></i> Conducta resultante</span>
                        <p class="conduct-text">${item.conduct}</p>
                    </div>
                    ${feedbackHTML}
                </div>
            `;
        } else {
            card.className = "card record-card consultation-type";
            const notesText = item.notes ? item.notes : "Sin notas adicionales.";

            card.innerHTML = `
                <div class="record-card-header">
                    <div class="record-type-date">
                        <span class="record-title-badge consultation-badge"><i data-lucide="calendar-heart"></i> Consulta Psicológica</span>
                        <span class="record-date-str">${formatDateTimeString(item.date)}</span>
                    </div>
                </div>
                <div class="record-card-body">
                    <div class="clinical-notes-box" style="border-color: rgba(244,63,94,0.2); background: rgba(244,63,94,0.02)">
                        <span class="box-title" style="color: var(--color-accent)"><i data-lucide="sticky-note"></i> Apuntes de Sesión</span>
                        <p class="notes-text">${notesText}</p>
                    </div>
                </div>
            `;
        }
        
        feedContainer.appendChild(card);
    });

    lucide.createIcons();
}

// Handle search queries and filters on Patient view
function applyFilters() {
    const searchVal = document.getElementById("filter-search").value.toLowerCase();
    const emotionVal = document.getElementById("filter-emotion").value;
    const minIntensityVal = parseInt(document.getElementById("filter-intensity-min").value);
    const dateFromVal = document.getElementById("filter-date-from").value;
    const dateToVal = document.getElementById("filter-date-to").value;

    const filtered = state.records.filter(item => {
        if (item.type === 'record') {
            const matchesText = item.thought.toLowerCase().includes(searchVal) || item.conduct.toLowerCase().includes(searchVal);
            if (!matchesText) return false;
            
            if (emotionVal && !item.emotions.includes(emotionVal)) return false;
            if (item.intensity < minIntensityVal) return false;
        } else {
            const matchesText = item.notes.toLowerCase().includes(searchVal);
            if (!matchesText) return false;
            
            if (emotionVal) return false;
            if (minIntensityVal > 0) return false;
        }

        if (dateFromVal) {
            const dateItem = new Date(item.date);
            const dateFrom = new Date(dateFromVal + "T00:00");
            if (dateItem < dateFrom) return false;
        }

        if (dateToVal) {
            const dateItem = new Date(item.date);
            const dateTo = new Date(dateToVal + "T23:59");
            if (dateItem > dateTo) return false;
        }

        return true;
    });

    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
    renderPaulHistory(filtered);
}

// Reset patient filters
function resetFilters() {
    document.getElementById("filter-search").value = "";
    document.getElementById("filter-emotion").value = "";
    document.getElementById("filter-intensity-min").value = 0;
    document.getElementById("filter-intensity-min").nextElementSibling.innerText = "0%";
    document.getElementById("filter-date-from").value = "";
    document.getElementById("filter-date-to").value = "";
    
    applyFilters();
}

// Export logs database to CSV format
function exportDataCSV() {
    if (state.records.length === 0) {
        alert("No hay registros para exportar.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "Tipo,Fecha y Hora,Pensamiento Automatico / Notas,Intensidad,Emociones,Conducta\n";

    const sorted = [...state.records].sort((a, b) => new Date(a.date) - new Date(b.date));

    sorted.forEach(r => {
        let type = r.type === 'record' ? 'Autorregistro' : 'Consulta';
        let date = formatDateTimeString(r.date).replace(/,/g, '');
        let content = r.type === 'record' ? r.thought : r.notes;
        let intensity = r.type === 'record' ? r.intensity : 'N/A';
        let emotions = r.type === 'record' ? r.emotions.join('|') : 'N/A';
        let conduct = r.type === 'record' ? r.conduct : 'N/A';

        content = `"${content.replace(/"/g, '""')}"`;
        if (conduct !== 'N/A') {
            conduct = `"${conduct.replace(/"/g, '""')}"`;
        }

        csvContent += `${type},${date},${content},${intensity},${emotions},${conduct}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `mindreg_reporte_${PaulUrdanetaDateSlug()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function PaulUrdanetaDateSlug() {
    const d = new Date();
    return `${d.getFullYear()}_${d.getMonth()+1}_${d.getDate()}`;
}

// --- THERAPIST FLOW (EMILY) ---

// Render clinician profile header and quick summary metrics
function renderEmilyDashboard() {
    const totalRecords = state.records.filter(r => r.type === 'record').length;
    document.getElementById("emily-stat-records-count").innerText = totalRecords;

    const totalIntensity = state.records.filter(r => r.type === 'record').reduce((sum, r) => sum + r.intensity, 0);
    const avgIntensity = totalRecords > 0 ? Math.round(totalIntensity / totalRecords) : 0;
    document.getElementById("emily-stat-alert-intensity").innerText = avgIntensity + "%";

    const completedTasks = state.tasks.filter(t => t.completed).length;
    document.getElementById("emily-stat-tasks-done").innerText = `${completedTasks}/${state.tasks.length}`;

    const consultations = state.records.filter(r => r.type === 'consultation').sort((a,b) => new Date(b.date) - new Date(a.date));
    const consultationsCountEl = document.getElementById("emily-consultations-count");
    const lastConsultationDateEl = document.getElementById("emily-last-consultation-date");

    if (consultationsCountEl) consultationsCountEl.innerText = consultations.length;
    
    if (consultations.length > 0) {
        if (lastConsultationDateEl) lastConsultationDateEl.innerText = formatDateTimeString(consultations[0].date);
    } else {
        if (lastConsultationDateEl) lastConsultationDateEl.innerText = "No registrada";
    }

    renderChart('chart-emily-evolution', 'emily');
    renderEmilyRecentRegistries();
    renderEmilyRecentActivities();
}

// Assign and save new therapists tasks in Supabase
async function saveAssignedTask(e) {
    e.preventDefault();

    const title = document.getElementById("task-title").value;
    const desc = document.getElementById("task-desc").value;
    const due = document.getElementById("task-due").value;

    const newTask = {
        id: "task-" + Date.now(),
        title: title,
        desc: desc,
        due: due,
        completed: false,
        reply: null
    };

    if (supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('tasks')
                .insert([{
                    id: newTask.id,
                    title: newTask.title,
                    desc: newTask.desc,
                    due: newTask.due,
                    completed: false
                }]);

            if (error) throw error;
        } catch (err) {
            console.error("Error guardando tarea en Supabase:", err);
            alert("No se pudo asignar la tarea en la nube.");
        }
    }

    state.tasks.push(newTask);
    document.getElementById("form-assign-task").reset();
    renderEmilyTasksPanel();
}

// Render Emily's tasks control panel
function renderEmilyTasksPanel() {
    const container = document.getElementById("emily-assigned-tasks-container");
    container.innerHTML = "";

    if (state.tasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i data-lucide="clipboard-list"></i>
                <p>Aún no has asignado ninguna tarea a Paul.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    const sorted = [...state.tasks].sort((a, b) => new Date(b.due) - new Date(a.due));

    sorted.forEach(task => {
        const row = document.createElement("div");
        row.className = "assigned-task-row";
        
        let statusBadge = `<span class="task-status-badge">Pendiente</span>`;
        let submissionHTML = "";

        if (task.completed) {
            statusBadge = `<span class="task-status-badge completed">Entregada</span>`;
            
            let fileHTML = "";
            if (task.file) {
                fileHTML = `
                    <div style="margin-top: 0.65rem; display: flex; flex-direction: column; gap: 0.25rem;">
                        <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Archivo Adjunto:</span>
                        <a href="${task.file.path}" download="${task.file.originalName}" target="_blank" class="file-attachment-tag">
                            <i data-lucide="paperclip"></i> ${task.file.originalName} (${task.file.size})
                        </a>
                    </div>
                `;
            }

            submissionHTML = `
                <div class="task-reply-submission" style="margin-top: 0.75rem; border-color: rgba(16,185,129,0.15); background: rgba(16,185,129,0.01);">
                    <span class="submission-header" style="color: var(--color-psy)">Respuesta de Paul:</span>
                    <p class="submission-content" style="font-size: 0.85rem;">"${task.reply}"</p>
                    ${fileHTML}
                    <span style="font-size: 0.7rem; color: var(--text-muted); display:block; margin-top:0.35rem;">
                        Entregado: ${formatDateTimeString(task.completedDate)}
                    </span>
                </div>
            `;
        }

        row.innerHTML = `
            <div class="assigned-task-row-header">
                <div>
                    <h4>${task.title}</h4>
                    <span style="font-size: 0.75rem; color: var(--text-muted);">Límite: ${formatFriendlyDate(task.due)}</span>
                </div>
                ${statusBadge}
            </div>
            <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4;">${task.desc}</p>
            ${submissionHTML}
        `;

        container.appendChild(row);
    });

    lucide.createIcons();
}

// Render Emily's records viewer
function renderEmilyRecords(filteredRecords = null) {
    const feedContainer = document.getElementById("emily-records-feed");
    feedContainer.innerHTML = "";

    const recordsToRender = filteredRecords || [...state.records].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (recordsToRender.length === 0) {
        feedContainer.innerHTML = `
            <div class="card empty-state">
                <i data-lucide="search-code"></i>
                <h3>Búsqueda vacía</h3>
                <p>No hay registros clínicos que coincidan con los filtros.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    recordsToRender.forEach(item => {
        const card = document.createElement("div");
        
        if (item.type === 'record') {
            card.className = "card record-card";
            
            let emotionsChips = "";
            item.emotions.forEach(emo => {
                const emotionClass = "emo-" + emo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                emotionsChips += `<span class="emotion-chip size-small ${emotionClass}">${emo}</span> `;
            });

            const intensityClass = item.intensity >= 80 ? 'high-intensity' : '';
            
            let feedbackActionHTML = "";
            if (item.feedback) {
                feedbackActionHTML = `
                    <div class="record-feedback-section">
                        <div class="feedback-card-content" style="border-color: rgba(16, 185, 129, 0.35); background: rgba(16, 185, 129, 0.05)">
                            <div class="feedback-header">
                                <span><i data-lucide="message-square"></i> Tu Comentario Clínico</span>
                                <span>${formatDateTimeString(item.feedbackDate)}</span>
                            </div>
                            <p class="feedback-text">${item.feedback}</p>
                            <button class="btn btn-text text-teal" style="font-size: 0.75rem; margin-top: 0.25rem;" onclick="openClinicalCommentModal('${item.id}', '${item.feedback.replace(/'/g, "\\'")}')">
                                <i data-lucide="edit-3" style="width:0.8rem; height:0.8rem;"></i> Editar Comentario
                            </button>
                        </div>
                    </div>
                `;
            } else {
                feedbackActionHTML = `
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
                        <span class="record-title-badge record-badge"><i data-lucide="clipboard-signature"></i> Autorregistro</span>
                        <span class="record-date-str">${formatDateTimeString(item.date)}</span>
                    </div>
                    <span class="record-intensity-badge ${intensityClass}">Intensidad: ${item.intensity}%</span>
                </div>
                <div class="record-card-body">
                    <div class="thought-box">
                        <span class="box-title"><i data-lucide="brain"></i> Pensamiento Automático</span>
                        <p class="thought-text">"${item.thought}"</p>
                    </div>
                    <div class="record-emotions-row">
                        <span class="emotions-label">Emociones:</span>
                        <div class="emotions-list">${emotionsChips}</div>
                    </div>
                    <div class="conduct-box">
                        <span class="box-title"><i data-lucide="activity"></i> Conducta</span>
                        <p class="conduct-text">${item.conduct}</p>
                    </div>
                    ${feedbackActionHTML}
                </div>
            `;
        } else {
            card.className = "card record-card consultation-type";
            const notesText = item.notes ? item.notes : "Sin notas adicionales.";

            card.innerHTML = `
                <div class="record-card-header">
                    <div class="record-type-date">
                        <span class="record-title-badge consultation-badge"><i data-lucide="calendar-heart"></i> Consulta Psicológica</span>
                        <span class="record-date-str">${formatDateTimeString(item.date)}</span>
                    </div>
                </div>
                <div class="record-card-body">
                    <div class="clinical-notes-box" style="border-color: rgba(244,63,94,0.2); background: rgba(244,63,94,0.02)">
                        <span class="box-title" style="color: var(--color-accent)"><i data-lucide="sticky-note"></i> Apuntes de Sesión</span>
                        <p class="notes-text">${notesText}</p>
                    </div>
                </div>
            `;
        }
        
        feedContainer.appendChild(card);
    });

    lucide.createIcons();
}

// Search and filter records for psychologist panel
function applyFiltersEmily() {
    const searchVal = document.getElementById("emily-filter-search").value.toLowerCase();
    const emotionVal = document.getElementById("emily-filter-emotion").value;
    const minIntensityVal = parseInt(document.getElementById("emily-filter-intensity-min").value);
    const typeVal = document.getElementById("emily-filter-type").value;

    const filtered = state.records.filter(item => {
        if (typeVal === 'records' && item.type !== 'record') return false;
        if (typeVal === 'consultations' && item.type !== 'consultation') return false;

        if (item.type === 'record') {
            const matchesText = item.thought.toLowerCase().includes(searchVal) || item.conduct.toLowerCase().includes(searchVal);
            if (!matchesText) return false;
            
            if (emotionVal && !item.emotions.includes(emotionVal)) return false;
            if (item.intensity < minIntensityVal) return false;
        } else {
            const matchesText = item.notes.toLowerCase().includes(searchVal);
            if (!matchesText) return false;
            
            if (emotionVal) return false;
            if (minIntensityVal > 0) return false;
        }

        return true;
    });

    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
    renderEmilyRecords(filtered);
}

// Reset filters in psychologist view
function resetFiltersEmily() {
    document.getElementById("emily-filter-search").value = "";
    document.getElementById("emily-filter-emotion").value = "";
    document.getElementById("emily-filter-intensity-min").value = 0;
    document.getElementById("emily-filter-intensity-min").nextElementSibling.innerText = "0%";
    document.getElementById("emily-filter-type").value = "all";
    
    applyFiltersEmily();
}

// Open / Close Clinical feedback modal
function openClinicalCommentModal(recordId, existingText = "") {
    document.getElementById("comment-record-id").value = recordId;
    document.getElementById("clinical-comment-content").value = existingText;
    document.getElementById("modal-clinical-comment").classList.add("active");
}

function closeClinicalCommentModal() {
    document.getElementById("modal-clinical-comment").classList.remove("active");
    document.getElementById("form-clinical-comment").reset();
}

// Save Clinical comment feedback via Supabase Update
async function saveClinicalComment(e) {
    e.preventDefault();

    const recordId = document.getElementById("comment-record-id").value;
    const commentVal = document.getElementById("clinical-comment-content").value;

    if (supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('records')
                .update({
                    feedback: commentVal,
                    feedback_date: new Date().toISOString()
                })
                .eq('id', recordId);

            if (error) throw error;

            // Sync state
            const recordIndex = state.records.findIndex(r => r.id === recordId);
            if (recordIndex !== -1) {
                state.records[recordIndex].feedback = commentVal;
                state.records[recordIndex].feedbackDate = new Date().toISOString();
            }
        } catch (err) {
            console.error("Error guardando comentario clínico en Supabase:", err);
            alert("No se pudo guardar la retroalimentación clínica.");
            return;
        }
    }

    closeClinicalCommentModal();
    renderEmilyRecords();
    renderEmilyDashboard();
}

// --- DYNAMIC DUAL GRAPHS (Chart.js implementation) ---

// Sorts and structures historical points to display inside the Chart.js grid
function renderChart(canvasId, role) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (role === 'paul' && paulChartInstance) {
        paulChartInstance.destroy();
    } else if (role === 'emily' && emilyChartInstance) {
        emilyChartInstance.destroy();
    }

    const chronologicalItems = [...state.records].sort((a, b) => new Date(a.date) - new Date(b.date));

    const labels = [];
    const intensityData = [];
    const consultationData = [];

    chronologicalItems.forEach(item => {
        const dateObj = new Date(item.date);
        const dayLabel = `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;
        labels.push(dayLabel);

        if (item.type === 'record') {
            intensityData.push(item.intensity);
            consultationData.push(null);
        } else {
            intensityData.push(null);
            consultationData.push({
                x: labels.length - 1,
                y: 100,
                notes: item.notes
            });
        }
    });

    const activeColor = role === 'paul' ? '#6366f1' : '#10b981';
    const accentColor = '#f43f5e';

    const chartConfig = {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Intensidad Emocional',
                    data: intensityData,
                    borderColor: activeColor,
                    backgroundColor: role === 'paul' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 3,
                    tension: 0.35,
                    pointBackgroundColor: activeColor,
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    spanGaps: true,
                },
                {
                    label: 'Día de Consulta',
                    data: consultationData,
                    borderColor: accentColor,
                    backgroundColor: accentColor,
                    pointStyle: 'rectRot',
                    pointRadius: 8,
                    pointHoverRadius: 10,
                    showLine: false,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#1f2937',
                    titleColor: '#ffffff',
                    titleFont: { family: 'Outfit', weight: 'bold' },
                    bodyFont: { family: 'Inter' },
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            const datasetIndex = context.datasetIndex;
                            if (datasetIndex === 0) {
                                return ` Intensidad: ${context.parsed.y}%`;
                            } else {
                                const rawPoint = context.dataset.data[context.dataIndex];
                                return [
                                    ` [CONSULTA PSICOLÓGICA]`,
                                    ` Nota: ${rawPoint.notes ? rawPoint.notes.substring(0, 30) + '...' : 'Sin notas'}`
                                ];
                            }
                        }
                    }
                }
            },
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#94a3b8',
                        font: { family: 'Inter' },
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#94a3b8',
                        font: { family: 'Inter' }
                    }
                }
            }
        }
    };

    const ctx = canvas.getContext('2d');
    const newChart = new Chart(ctx, chartConfig);

    if (role === 'paul') {
        paulChartInstance = newChart;
    } else {
        emilyChartInstance = newChart;
    }
}

// --- FORMAT DATE HELPERS ---

function formatFriendlyDate(dateStr) {
    if (!dateStr) return "Sin fecha";
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    
    const year = parts[0];
    const monthIndex = parseInt(parts[1]) - 1;
    const day = parseInt(parts[2]);

    const months = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    return `${day} de ${months[monthIndex]}, ${year}`;
}

function formatDateTimeString(dateTimeStr) {
    if (!dateTimeStr) return "Sin fecha";
    const date = new Date(dateTimeStr);
    if (isNaN(date.getTime())) return dateTimeStr;

    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');

    return `${dd}/${mm}/${yyyy} a las ${hh}:${min} hs`;
}

// --- DAILY ACTIVITIES LOGIC ---

function getTodayLocalDateStr() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

async function syncTodayActivities() {
    const todayStr = getTodayLocalDateStr();
    state.dailyActivities = [];

    if (!supabaseClient) return;

    try {
        const { data, error } = await supabaseClient
            .from('daily_activities')
            .select('*')
            .eq('date', todayStr);

        if (error) throw error;

        if (data) {
            state.dailyActivities = data;
        }
    } catch (err) {
        console.error("Error sincronizando actividades diarias:", err);
    }
}

async function handleAddDailyActivity(e) {
    e.preventDefault();
    const input = document.getElementById("daily-activity-input");
    if (!input) return;
    const content = input.value.trim();
    if (!content) return;

    const todayStr = getTodayLocalDateStr();
    const newActivity = {
        id: "act-" + Date.now(),
        date: todayStr,
        content: content,
        completed: false
    };

    // Guardar localmente inmediato para UX instantánea
    state.dailyActivities.push(newActivity);
    renderDailyActivities();
    input.value = "";

    // Guardar en Supabase
    if (supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('daily_activities')
                .insert([newActivity]);

            if (error) throw error;
        } catch (err) {
            console.error("Error guardando actividad en Supabase:", err);
            alert("No se pudo guardar la actividad en la nube.");
        }
    }
}

async function toggleActivityState(id, completed) {
    const activity = state.dailyActivities.find(a => a.id === id);
    if (activity) {
        activity.completed = completed;
    }

    // Estilo visual inmediato
    const itemDiv = document.getElementById(`activity-item-${id}`);
    if (itemDiv) {
        if (completed) {
            itemDiv.classList.add('completed');
        } else {
            itemDiv.classList.remove('completed');
        }
    }

    // Supabase update
    if (supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('daily_activities')
                .update({ completed: completed })
                .eq('id', id);

            if (error) throw error;
        } catch (err) {
            console.error("Error actualizando estado de actividad:", err);
        }
    }
}

async function deleteDailyActivity(id) {
    // Eliminar del estado local
    state.dailyActivities = state.dailyActivities.filter(a => a.id !== id);
    renderDailyActivities();

    // Supabase delete
    if (supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('daily_activities')
                .delete()
                .eq('id', id);

            if (error) throw error;
        } catch (err) {
            console.error("Error eliminando actividad de Supabase:", err);
        }
    }
}

function renderDailyActivities() {
    const container = document.getElementById("daily-activities-container");
    if (!container) return;
    container.innerHTML = "";

    if (state.dailyActivities.length === 0) {
        container.innerHTML = `
            <div class="empty-state-mini" style="text-align: center; padding: 1rem; border: 1px dashed var(--border-color); border-radius: var(--radius-sm); width: 100%;">
                <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0;">No has registrado actividades hoy todavía. ¡Comienza agregando una arriba!</p>
            </div>
        `;
        return;
    }

    state.dailyActivities.forEach(act => {
        const item = document.createElement("div");
        item.id = `activity-item-${act.id}`;
        item.className = `daily-habit-item ${act.completed ? 'completed' : ''}`;
        item.style.display = "flex";
        item.style.alignItems = "center";
        item.style.justifyContent = "space-between";
        item.style.gap = "0.5rem";

        item.innerHTML = `
            <label class="habit-checkbox-label" style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; flex-grow: 1;">
                <input type="checkbox" onchange="toggleActivityState('${act.id}', this.checked)" ${act.completed ? 'checked' : ''}>
                <span>${act.content}</span>
            </label>
            <button onclick="deleteDailyActivity('${act.id}')" class="btn btn-text" style="color: var(--color-accent); padding: 0.25rem 0.5rem; background: transparent; border: none; cursor: pointer;" title="Eliminar">
                <i data-lucide="trash-2" style="width: 0.9rem; height: 0.9rem;"></i>
            </button>
        `;
        container.appendChild(item);
    });

    lucide.createIcons();
}

// --- CLINICAL FILTER: NEW REGISTRIES SINCE LAST CONSULTATION ---

function renderEmilyRecentRegistries() {
    const container = document.getElementById("emily-recent-registries-container");
    const badge = document.getElementById("emily-recent-registries-badge");
    if (!container) return;

    container.innerHTML = "";

    // 1. Encontrar la última consulta
    const consultations = state.records
        .filter(r => r.type === 'consultation')
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    let lastConsultationDate = null;
    let friendlyDate = "No registrada";
    if (consultations.length > 0) {
        lastConsultationDate = new Date(consultations[0].date);
        friendlyDate = formatDateTimeString(consultations[0].date);
    }

    // 2. Filtrar registros nuevos de Paul
    const recentRecords = state.records.filter(r => {
        if (r.type !== 'record') return false;
        if (!lastConsultationDate) return true;
        return new Date(r.date) > lastConsultationDate;
    }).sort((a, b) => new Date(b.date) - new Date(a.date)); // nuevos primero

    if (badge) {
        badge.innerText = `${recentRecords.length} nuevos`;
        if (recentRecords.length > 0) {
            badge.style.background = "rgba(16, 185, 129, 0.15)";
            badge.style.color = "#34d399";
        } else {
            badge.style.background = "rgba(255, 255, 255, 0.05)";
            badge.style.color = "var(--text-secondary)";
        }
    }

    if (recentRecords.length === 0) {
        container.innerHTML = `
            <div class="empty-state-mini" style="text-align: center; padding: 1.5rem; background: rgba(255, 255, 255, 0.01); border: 1px dashed var(--border-color); border-radius: var(--radius-md);">
                <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0;">🎉 Paul no tiene autorregistros nuevos desde la última sesión (${friendlyDate}).</p>
            </div>
        `;
        return;
    }

    recentRecords.forEach(item => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "recent-registry-item card";
        itemDiv.style.background = "rgba(255, 255, 255, 0.01)";
        itemDiv.style.padding = "1rem";
        itemDiv.style.borderRadius = "var(--radius-md)";
        itemDiv.style.border = "1px solid var(--border-color)";

        let emotionsChips = "";
        item.emotions.forEach(emo => {
            const emotionClass = "emo-" + emo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            emotionsChips += `<span class="emotion-chip size-small ${emotionClass}" style="font-size: 0.7rem; padding: 0.15rem 0.4rem;">${emo}</span> `;
        });

        const intensityClass = item.intensity >= 80 ? 'high-intensity' : '';
        
        let feedbackHTML = "";
        let actionBtnHTML = `
            <button class="btn btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="openClinicalCommentModal('${item.id}')">
                <i data-lucide="message-square" style="width: 0.85rem; height: 0.85rem; vertical-align: text-bottom; margin-right: 0.25rem;"></i> Retroalimentar
            </button>
        `;

        if (item.feedback) {
            feedbackHTML = `
                <div style="margin-top: 0.75rem; padding: 0.65rem; background: rgba(16, 185, 129, 0.05); border-left: 3px solid #10b981; border-radius: 4px; font-size: 0.85rem;">
                    <strong style="color: #34d399; display: block; margin-bottom: 0.25rem;">Tu Retroalimentación:</strong>
                    <p style="margin: 0; color: var(--text-secondary); font-style: italic;">"${item.feedback}"</p>
                </div>
            `;
            actionBtnHTML = `
                <button class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="openClinicalCommentModal('${item.id}', '${item.feedback.replace(/'/g, "\\'")}')">
                    <i data-lucide="edit-3" style="width: 0.85rem; height: 0.85rem; vertical-align: text-bottom; margin-right: 0.25rem;"></i> Editar Comentario
                </button>
            `;
        }

        itemDiv.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem;">
                <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">${formatDateTimeString(item.date)}</span>
                <span class="record-intensity-badge ${intensityClass}" style="font-size: 0.75rem; padding: 0.15rem 0.4rem;">Intensidad: ${item.intensity}%</span>
            </div>
            <div style="margin-bottom: 0.5rem;">
                <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 0.25rem;">Pensamiento Automático:</span>
                <p style="margin: 0; font-size: 0.85rem; font-style: italic; color: var(--text-secondary);">"${item.thought}"</p>
            </div>
            <div style="margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Emociones:</span>
                <div>${emotionsChips}</div>
            </div>
            <div style="margin-bottom: 0.75rem;">
                <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 0.25rem;">Conducta:</span>
                <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary);">${item.conduct}</p>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; border-top: 1px solid rgba(255, 255, 255, 0.05); padding-top: 0.75rem;">
                ${actionBtnHTML}
            </div>
            ${feedbackHTML}
        `;
        container.appendChild(itemDiv);
    });

    lucide.createIcons();
}

async function syncEmilyRecentActivities() {
    state.paulRecentActivities = [];

    if (!supabaseClient) return;

    try {
        const { data, error } = await supabaseClient
            .from('daily_activities')
            .select('*');

        if (error) throw error;

        if (data) {
            // 1. Encontrar la última consulta
            const consultations = state.records
                .filter(r => r.type === 'consultation')
                .sort((a, b) => new Date(b.date) - new Date(a.date));

            let lastConsultationDate = null;
            if (consultations.length > 0) {
                const lastDateStr = consultations[0].date.split('T')[0];
                lastConsultationDate = new Date(lastDateStr);
            }

            // 2. Filtrar actividades desde esa fecha (inclusive)
            state.paulRecentActivities = data.filter(act => {
                if (!lastConsultationDate) return true; // Mostrar todo si no hay consulta
                const actDate = new Date(act.date);
                return actDate >= lastConsultationDate;
            });
        }
    } catch (err) {
        console.error("Error sincronizando actividades de Paul:", err);
    }
}

function renderEmilyRecentActivities() {
    const container = document.getElementById("emily-activities-container");
    if (!container) return;
    container.innerHTML = "";

    if (state.paulRecentActivities.length === 0) {
        container.innerHTML = `
            <div class="empty-state-mini" style="text-align: center; padding: 1rem; border: 1px dashed var(--border-color); border-radius: var(--radius-sm); width: 100%;">
                <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0;">Paul no ha registrado actividades desde la última consulta.</p>
            </div>
        `;
        return;
    }

    // Agrupar actividades por fecha
    const grouped = {};
    state.paulRecentActivities.forEach(act => {
        if (!grouped[act.date]) {
            grouped[act.date] = [];
        }
        grouped[act.date].push(act);
    });

    // Ordenar fechas en orden descendente (más recientes primero)
    const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

    sortedDates.forEach(dateStr => {
        const activities = grouped[dateStr];
        const completedCount = activities.filter(act => act.completed).length;
        const totalCount = activities.length;

        const dateSection = document.createElement("div");
        dateSection.className = "grouped-date-section";

        const friendlyDate = formatFriendlyDate(dateStr);
        const dayOfWeek = getDayOfWeekName(dateStr);
        const fullDateTitle = `${dayOfWeek}, ${friendlyDate}`;
        
        let itemsHTML = "";
        activities.forEach(act => {
            itemsHTML += `
                <div class="daily-habit-item ${act.completed ? 'completed' : ''}" style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.65rem 0.85rem; margin-bottom: 0.5rem; background: rgba(255, 255, 255, 0.55); border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
                    <div class="habit-text-wrapper" style="display: flex; align-items: center; gap: 0.65rem; flex-grow: 1; margin: 0; color: var(--text-primary);">
                        <i data-lucide="${act.completed ? 'check-circle-2' : 'circle'}" style="width: 1rem; height: 1rem; color: ${act.completed ? 'var(--color-psy)' : 'var(--text-muted)'}; flex-shrink: 0;"></i>
                        <span style="font-size: 0.85rem; font-weight: 500; ${act.completed ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">${act.content}</span>
                    </div>
                    <span class="task-status-badge ${act.completed ? 'completed' : ''}" style="font-size: 0.65rem; padding: 0.15rem 0.45rem; white-space: nowrap; font-weight: 600;">
                        ${act.completed ? 'Hecho' : 'Pendiente'}
                    </span>
                </div>
            `;
        });

        // The accordion item HTML
        dateSection.innerHTML = `
            <button class="grouped-date-header" onclick="toggleAccordionSection(this)">
                <span class="header-left">
                    <i data-lucide="chevron-right" class="accordion-chevron"></i>
                    <span class="header-title">${fullDateTitle}</span>
                </span>
                <span class="task-status-badge completed" style="background: rgba(13, 148, 136, 0.1); color: var(--color-psy); font-size: 0.75rem; padding: 0.25rem 0.5rem; border: 1px solid rgba(13, 148, 136, 0.15); font-weight: 600;">
                    ${completedCount}/${totalCount} completadas
                </span>
            </button>
            <div class="grouped-date-items">
                <div style="padding-top: 0.25rem; padding-bottom: 0.5rem;">
                    ${itemsHTML}
                </div>
            </div>
        `;
        container.appendChild(dateSection);
    });

    lucide.createIcons();
}

// Global/window helper functions for accordion and weekdays
window.toggleAccordionSection = function(btn) {
    btn.classList.toggle("active");
    const content = btn.nextElementSibling;
    if (content.classList.contains("expanded")) {
        content.classList.remove("expanded");
        content.style.maxHeight = null;
    } else {
        content.classList.add("expanded");
        content.style.maxHeight = content.scrollHeight + "px";
    }
};

window.getDayOfWeekName = function(dateStr) {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return "";
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    const days = [
        "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"
    ];
    return days[date.getDay()];
};

window.toggleOtherEmotionInput = function(checkbox) {
    const group = document.getElementById("group-other-emotion");
    if (group) {
        group.style.display = checkbox.checked ? "block" : "none";
        const input = document.getElementById("record-emotion-other-text");
        if (input) {
            if (checkbox.checked) {
                input.focus();
                input.required = true;
            } else {
                input.value = "";
                input.required = false;
            }
        }
    }
};
