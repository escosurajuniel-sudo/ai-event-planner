const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let supabaseClient;
let session;
let profile = {};
let settings = {};
let events = [];
let currentEvent = null;
let history = [];
let busy = false;
let lastFailed = "";
let saveTimer;

const defaults = {
  theme: "system",
  density: "comfortable",
  currency: "PHP",
  ai_detail_level: "balanced",
  planning_preferences: "",
  event_reminders: true,
  planning_reminders: false,
  reminder_time: "09:00",
};

// ========================================
// UTILITIES
// ========================================

function toast(msg, type = "ok") {
  const el = $("#toast");
  if (!el) return;

  el.textContent = msg;
  el.className = `toast ${type}`;
  el.hidden = false;

  clearTimeout(el._t);

  el._t = setTimeout(() => {
    el.hidden = true;
  }, 3200);
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function inline(text) {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(
      /(?<!\*)\*([^*\n]+?)\*(?!\*)/g,
      "<em>$1</em>"
    );
}

function markdown(text) {
  let out = "";
  let ul = false;
  let ol = false;

  const close = () => {
    if (ul) {
      out += "</ul>";
      ul = false;
    }

    if (ol) {
      out += "</ol>";
      ol = false;
    }
  };

  for (const raw of escapeHtml(text).split("\n")) {
    const line = raw.trim();

    if (!line) {
      close();
      continue;
    }

    if (/^#{1,3}\s/.test(line)) {
      close();

      const level = line.match(/^#+/)[0].length;

      out += `<h${level}>${inline(
        line.replace(/^#{1,3}\s/, "")
      )}</h${level}>`;

      continue;
    }

    if (/^[-*]\s/.test(line)) {
      if (ol) {
        out += "</ol>";
        ol = false;
      }

      if (!ul) {
        out += "<ul>";
        ul = true;
      }

      out += `<li>${inline(
        line.replace(/^[-*]\s/, "")
      )}</li>`;

      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      if (ul) {
        out += "</ul>";
        ul = false;
      }

      if (!ol) {
        out += "<ol>";
        ol = true;
      }

      out += `<li>${inline(
        line.replace(/^\d+\.\s/, "")
      )}</li>`;

      continue;
    }

    close();

    out += `<p>${inline(line)}</p>`;
  }

  close();

  return out;
}

function initials(name) {
  return (
    (name || session?.user?.email || "U")
      .split(/[\s@]+/)
      .slice(0, 2)
      .map((x) => x[0]?.toUpperCase())
      .join("") || "U"
  );
}

// ========================================
// THEME
// ========================================

function applyTheme() {
  let theme = settings.theme || "system";

  if (theme === "system") {
    theme = matchMedia("(prefers-color-scheme: dark)")
      .matches
      ? "dark"
      : "light";
  }

  document.documentElement.dataset.theme = theme;

  document.documentElement.dataset.density =
    settings.density || "comfortable";

  if ($("#themeBtn")) {
    $("#themeBtn").textContent =
      theme === "dark" ? "☀" : "☾";
  }
}

// ========================================
// AUTH SCREEN
// ========================================

function showAuth() {
  session = null;

  if ($("#appView")) {
    $("#appView").hidden = true;
  }

  if ($("#authView")) {
    $("#authView").hidden = false;
  }

  showLogin();
}

function showLogin() {
  const loginTab = $('[data-auth-tab="login"]');
  const signupTab = $('[data-auth-tab="signup"]');

  const loginForm = $("#loginForm");
  const signupForm = $("#signupForm");

  loginTab?.classList.add("active");
  signupTab?.classList.remove("active");

  if (loginForm) {
    loginForm.hidden = false;
    loginForm.style.display = "";
  }

  if (signupForm) {
    signupForm.hidden = true;
    signupForm.style.display = "none";
  }

  if ($("#authMessage")) {
    $("#authMessage").textContent = "";
  }
}

function showSignup() {
  const loginTab = $('[data-auth-tab="login"]');
  const signupTab = $('[data-auth-tab="signup"]');

  const loginForm = $("#loginForm");
  const signupForm = $("#signupForm");

  signupTab?.classList.add("active");
  loginTab?.classList.remove("active");

  if (signupForm) {
    signupForm.hidden = false;
    signupForm.style.display = "";
  }

  if (loginForm) {
    loginForm.hidden = true;
    loginForm.style.display = "none";
  }

  if ($("#authMessage")) {
    $("#authMessage").textContent = "";
  }
}

// ========================================
// INITIALIZE SUPABASE
// ========================================

async function init() {
  try {
    const response = await fetch("/api/config");

    if (!response.ok) {
      throw new Error(
        "Unable to load Planify AI configuration."
      );
    }

    const config = await response.json();

    if (
      !config.supabaseUrl ||
      !config.supabaseAnonKey
    ) {
      $("#authMessage").textContent =
        "Supabase is not configured yet. Add SUPABASE_URL and SUPABASE_ANON_KEY to your .env file.";
      return;
    }

    if (!window.supabase) {
      throw new Error(
        "Supabase JavaScript library failed to load."
      );
    }

    // Create the Supabase client
    supabaseClient = window.supabase.createClient(
      config.supabaseUrl,
      config.supabaseAnonKey
    );

    // Restore existing login session
    const { data, error } =
      await supabaseClient.auth.getSession();

    if (error) {
      throw error;
    }

    session = data.session;

    // Watch login/logout state
    supabaseClient.auth.onAuthStateChange(
      (_event, newSession) => {
        session = newSession;

        if (!newSession) {
          showAuth();
        }
      }
    );

    // Open app if already logged in
    if (session) {
      await enterApp();
    } else {
      showAuth();
    }
  } catch (error) {
    console.error(
      "Planify AI initialization error:",
      error
    );

    if ($("#authMessage")) {
      $("#authMessage").textContent =
        "Could not initialize Planify AI: " +
        error.message;
    }
  }
}

// ========================================
// ENTER APPLICATION
// ========================================

async function enterApp() {
  if (!session?.user) {
    console.error(
      "enterApp called without a valid session."
    );
    return;
  }

  try {
    // Show application immediately after successful login
    $("#authView").hidden = true;
    $("#appView").hidden = false;

    await ensureUserRows();

    await Promise.all([
      loadProfile(),
      loadSettings(),
      loadEvents(),
    ]);

    renderIdentity();
    applyTheme();
    renderEvents();

    showView("dashboard");
  } catch (error) {
    console.error(
      "Failed to enter Planify AI:",
      error
    );

    // Do NOT send the user back to the login screen
    // just because loading profile/settings/events failed.
    $("#authView").hidden = true;
    $("#appView").hidden = false;

    showView("dashboard");

    toast(
      "Logged in, but some account data could not be loaded: " +
        error.message,
      "error"
    );
  }
}

// ========================================
// USER DATABASE ROWS
// ========================================

async function ensureUserRows() {
  if (!session?.user) return;

  const uid = session.user.id;

  const { error: profileError } =
    await supabaseClient.from("profiles").upsert(
      {
        id: uid,

        full_name:
          session.user.user_metadata?.full_name || "",

        display_name:
          session.user.user_metadata?.full_name || "",
      },
      {
        onConflict: "id",
        ignoreDuplicates: true,
      }
    );

  if (profileError) {
    console.error(
      "Profile creation error:",
      profileError
    );
  }

  const { error: settingsError } =
    await supabaseClient.from("user_settings").upsert(
      {
        user_id: uid,
        ...defaults,
      },
      {
        onConflict: "user_id",
        ignoreDuplicates: true,
      }
    );

  if (settingsError) {
    console.error(
      "Settings creation error:",
      settingsError
    );
  }
}

async function loadProfile() {
  const { data, error } = await supabaseClient
  .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (error) {
    console.error(error);
  }

  profile = data || {};
}

async function loadSettings() {
  const { data, error } = await supabaseClient
    .from("user_settings")
    .select("*")
    .eq("user_id", session.user.id)
    .single();

  if (error) {
    console.error("Load settings error:", error);
  }

  settings = {
    ...defaults,
    ...(data || {}),
  };
}

async function loadEvents() {
  const { data, error } = await supabaseClient
    .from("events")
    .select("*")
    .order("updated_at", {
      ascending: false,
    });

  if (error) {
    toast(error.message, "error");
    return;
  }

  events = data || [];
}

// ========================================
// USER IDENTITY
// ========================================

function renderIdentity() {
  const name =
    profile.display_name ||
    profile.full_name ||
    session.user.email.split("@")[0];

  $("#miniName").textContent = name;
  $("#miniEmail").textContent =
    session.user.email;

  $("#miniAvatar").textContent =
    initials(name);

  $("#welcomeName").textContent =
    `${name}, what are we planning next?`;

  $("#profileAvatar").textContent =
    initials(name);

  $("#profileFullName").value =
    profile.full_name || "";

  $("#profileDisplayName").value =
    profile.display_name || "";

  $("#profilePicture").value =
    profile.avatar_url || "";

  $("#profileEmail").value =
    session.user.email;

  $("#accountEmail").textContent =
    session.user.email;

  $("#accountId").textContent =
    session.user.id;

  fillSettings();
}

// ========================================
// EVENT CARDS
// ========================================

function eventCard(event) {
  const date = event.event_date
    ? new Date(
        event.event_date + "T00:00:00"
      ).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Date not set";

  const budget =
    event.budget != null
      ? `${settings.currency === "USD" ? "$" : "₱"}${Number(
          event.budget
        ).toLocaleString()}`
      : "Budget not set";

  return `
    <article class="event-item" data-id="${event.id}">
      <div class="event-icon">
        ${escapeHtml(
          (event.event_type || "E")[0].toUpperCase()
        )}
      </div>

      <div class="event-meta">
        <span class="event-status">
          ${escapeHtml(event.status || "Planning")}
        </span>

        <h3>
          ${escapeHtml(
            event.title ||
              event.event_type ||
              "Untitled event"
          )}
        </h3>

        <p>
          ${escapeHtml(date)}
          ·
          ${escapeHtml(
            event.location || "Location not set"
          )}
        </p>

        <div>
          <span>
            ${
              event.guest_count
                ? Number(
                    event.guest_count
                  ).toLocaleString() +
                  " guests"
                : "Guests not set"
            }
          </span>

          <span>${budget}</span>
        </div>
      </div>

      <button
        class="open-event"
        data-open="${event.id}"
        type="button"
      >
        Continue →
      </button>
    </article>
  `;
}

function emptyEvents() {
  return `
    <div class="empty-state">
      <div>P</div>

      <h3>No events yet</h3>

      <p>
        Create your first event and Planify AI
        will save it to your account.
      </p>

      <button
        class="primary-btn empty-create"
        type="button"
      >
        Create event
      </button>
    </div>
  `;
}

function renderEvents() {
  $("#recentEvents").innerHTML =
    events.length
      ? events
          .slice(0, 3)
          .map(eventCard)
          .join("")
      : emptyEvents();

  $("#allEvents").innerHTML =
    events.length
      ? events.map(eventCard).join("")
      : emptyEvents();

  $$("[data-open]").forEach((button) => {
    button.onclick = () =>
      openEvent(button.dataset.open);
  });

  $$(".empty-create").forEach((button) => {
    button.onclick = createEvent;
  });
}

// ========================================
// PAGE NAVIGATION
// ========================================

function showView(name) {
  $$(".view-page").forEach((view) => {
    view.hidden = true;
  });

  const target = $(`#${name}View`);

  if (target) {
    target.hidden = false;
  }

  $$(".nav-btn[data-view]").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.view === name
    );
  });

  const titles = {
    dashboard: "Dashboard",
    events: "My Events",
    planner: "AI Planner",
    settings: "Settings",
  };

  $("#pageTitle").textContent =
    titles[name] || "Planify AI";

  document.body.classList.remove("nav-open");
}

// ========================================
// CREATE EVENT
// ========================================

async function createEvent() {
  if (!session) return;

 // LINE 655
const { data, error } = await supabaseClient
  .from("events")
    .insert({
      user_id: session.user.id,
      title: "New Event",
      status: "Planning",
    })
    .select()
    .single();

  if (error) {
    toast(error.message, "error");
    return;
  }

  events.unshift(data);

  renderEvents();

  await openEvent(data.id, true);
}

// ========================================
// OPEN EVENT
// ========================================

async function openEvent(id, isNew = false) {
  let event =
    events.find((item) => item.id === id);

  if (!event) {
   // LINE 686
const { data, error } = await supabaseClient
  .from("events")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      toast(error.message, "error");
      return;
    }

    event = data;
  }

  if (!event) {
    toast("Event not found.", "error");
    return;
  }

  currentEvent = event;

const { data, error } = await supabaseClient
  .from("messages")
    .select("role,content,created_at")
    .eq("event_id", id)
    .order("created_at", {
      ascending: true,
    });

  if (error) {
    toast(error.message, "error");
    return;
  }

  history = (data || []).map((message) => ({
    role: message.role,
    content: message.content,
  }));

  renderPlanner();
  showView("planner");

  if (isNew || !history.length) {
    renderWelcome();
  }
}

// ========================================
// PLANNER WELCOME
// ========================================

function renderWelcome() {
  $("#messages").innerHTML = `
    <div class="welcome-card">

      <div class="welcome-mark">P</div>

      <span class="eyebrow">
        NEW EVENT
      </span>

      <h3>
        What are we celebrating?
      </h3>

      <p>
        Start with the event type or tell me
        everything you already know.
      </p>

      <div class="quick-prompts">

        <button
          type="button"
          data-prompt="Help me plan an 18th birthday debut."
        >
          🎂 18th Birthday
        </button>

        <button
          type="button"
          data-prompt="Help me plan a graduation celebration."
        >
          🎓 Graduation
        </button>

        <button
          type="button"
          data-prompt="Help me plan a wedding reception."
        >
          💍 Wedding
        </button>

        <button
          type="button"
          data-prompt="Help me plan a corporate event."
        >
          💼 Corporate
        </button>

      </div>
    </div>
  `;

  bindPrompts();
}

// ========================================
// RENDER PLANNER
// ========================================

function renderPlanner() {
  if (!currentEvent) return;

  $("#plannerTitle").textContent =
    currentEvent.title ||
    currentEvent.event_type ||
    "New event";

  const map = {
    event_type: "detailTypeInput",
    event_date: "detailDateInput",
    location: "detailLocationInput",
    guest_count: "detailGuestsInput",
    budget: "detailBudgetInput",
    theme: "detailThemeInput",
  };

  Object.entries(map).forEach(
    ([key, id]) => {
      const element = $("#" + id);

      if (element) {
        element.value =
          currentEvent[key] ?? "";
      }
    }
  );

  renderProgress();

  $("#messages").innerHTML = "";

  history.forEach((message) => {
    addMessage(
      message.role,
      message.content
    );
  });

  if (!history.length) {
    renderWelcome();
  }
}

// ========================================
// CHAT MESSAGE
// ========================================

function addMessage(role, text) {
  $(".welcome-card")?.remove();

  const row =
    document.createElement("div");

  row.className =
    `message-row ${
      role === "user" ? "user" : "bot"
    }`;

  if (role !== "user") {
    row.innerHTML =
      '<div class="avatar">P</div>';
  }

  const bubble =
    document.createElement("div");

  bubble.className = "bubble";
  bubble.innerHTML = markdown(text);

  row.appendChild(bubble);

  $("#messages").appendChild(row);

  $("#messages").scrollTop =
    $("#messages").scrollHeight;
}

function typing(on) {
  $("#typing")?.remove();

  if (!on) return;

  const div =
    document.createElement("div");

  div.id = "typing";
  div.className = "message-row bot";

  div.innerHTML = `
    <div class="avatar">P</div>

    <div class="bubble">
      <span class="dots">
        <i></i>
        <i></i>
        <i></i>
      </span>
    </div>
  `;

  $("#messages").appendChild(div);

  $("#messages").scrollTop =
    $("#messages").scrollHeight;
}

// ========================================
// EVENT PROGRESS
// ========================================

function renderProgress() {
  const keys = [
    "event_type",
    "event_date",
    "location",
    "guest_count",
    "budget",
    "theme",
  ];

  const completed = keys.filter(
    (key) =>
      currentEvent?.[key] !== null &&
      currentEvent?.[key] !== "" &&
      currentEvent?.[key] !== undefined
  ).length;

  $("#progressText").textContent =
    `${completed}/6`;

  $("#progressBar").style.width =
    `${(completed / 6) * 100}%`;
}

// ========================================
// EXTRACT EVENT DETAILS
// ========================================

function parseDetails(text) {
  if (!currentEvent) return;

  const original = text.trim();
  const lower = original.toLowerCase();

  if (!currentEvent.event_type) {
    const types = [
      "wedding",
      "birthday",
      "debut",
      "graduation",
      "corporate",
      "anniversary",
      "seminar",
      "conference",
      "reunion",
      "christening",
      "baby shower",
      "party",
    ];

    const found = types.find((type) =>
      lower.includes(type)
    );

    if (found) {
      currentEvent.event_type =
        found.replace(
          /\b\w/g,
          (character) =>
            character.toUpperCase()
        );
    }
  }

  const guests = original.match(
    /(\d{1,4})\s*(?:guests?|people|persons?|attendees?)/i
  );

  if (guests) {
    currentEvent.guest_count =
      Number(guests[1]);
  }

  const budget =
    original.match(
      /(?:₱|php\s*)\s*([\d,]+(?:\.\d+)?\s*[kKmM]?)/i
    ) ||
    original.match(
      /budget(?:\s+of|\s+is|:)?\s*([\d,]+\s*[kKmM]?)/i
    );

  if (budget) {
    let raw = budget[1].replaceAll(",", "");
    let amount = parseFloat(raw);

    if (/k/i.test(raw)) {
      amount *= 1000;
    }

    if (/m/i.test(raw)) {
      amount *= 1000000;
    }

    if (Number.isFinite(amount)) {
      currentEvent.budget =
        Math.round(amount);
    }
  }

  const theme = original.match(
    /(?:theme(?:\s+is|:)?|themed|style(?:\s+is|:)?)\s+([A-Za-z][A-Za-z -]{2,40})(?=[,.]|$)/i
  );

  if (theme) {
    currentEvent.theme =
      theme[1].trim();
  }

  if (
    currentEvent.event_type &&
    (!currentEvent.title ||
      currentEvent.title === "New Event")
  ) {
    currentEvent.title =
      currentEvent.event_type;
  }

  renderPlannerFields();
  scheduleSave();
}

function renderPlannerFields() {
  if (!currentEvent) return;

  $("#plannerTitle").textContent =
    currentEvent.title || "New event";

  $$("[data-field]").forEach(
    (element) => {
      if (
        document.activeElement !== element
      ) {
        element.value =
          currentEvent[
            element.dataset.field
          ] ?? "";
      }
    }
  );

  renderProgress();
}

// ========================================
// AUTO SAVE
// ========================================

function scheduleSave() {
  clearTimeout(saveTimer);

  $("#saveState").textContent =
    "Saving…";

  saveTimer = setTimeout(
    saveEvent,
    550
  );
}

async function saveEvent() {
  if (!currentEvent) return;

  const payload = {
    title:
      currentEvent.title ||
      currentEvent.event_type ||
      "New Event",

    event_type:
      currentEvent.event_type || null,

    event_date:
      currentEvent.event_date || null,

    location:
      currentEvent.location || null,

    guest_count:
      currentEvent.guest_count
        ? Number(
            currentEvent.guest_count
          )
        : null,

    budget:
      currentEvent.budget !== "" &&
      currentEvent.budget != null
        ? Number(currentEvent.budget)
        : null,

    theme:
      currentEvent.theme || null,

    status:
      currentEvent.status ||
      "Planning",

    updated_at:
      new Date().toISOString(),
  };

  const { data, error } =
await supabaseClient
  .from("events")
      .update(payload)
      .eq("id", currentEvent.id)
      .select()
      .single();

  if (error) {
    $("#saveState").textContent =
      "Save failed";

    toast(error.message, "error");

    return;
  }

  currentEvent = {
    ...currentEvent,
    ...data,
  };

  const index =
    events.findIndex(
      (item) =>
        item.id === data.id
    );

  if (index >= 0) {
    events[index] = data;
  }

  events.sort(
    (a, b) =>
      new Date(b.updated_at) -
      new Date(a.updated_at)
  );

  $("#saveState").textContent =
    "Saved ✓";

  setTimeout(() => {
    $("#saveState").textContent = "";
  }, 1800);

  renderEvents();
}

// ========================================
// SEND MESSAGE TO GEMINI
// ========================================

async function sendMessage(message) {
  if (
    busy ||
    !currentEvent ||
    !message.trim()
  ) {
    return;
  }

  busy = true;

  $("#sendBtn").disabled = true;
  $("#errorBanner").hidden = true;

  const clean = message.trim();

  lastFailed = clean;

  parseDetails(clean);

  addMessage("user", clean);

  $("#messageInput").value = "";

  typing(true);

  const before = [...history];

  try {
    // Save user message
    const { error: saveError } =
      await supabaseClient
        .from("messages")
        .insert({
          event_id: currentEvent.id,
          user_id: session.user.id,
          role: "user",
          content: clean,
        });

    if (saveError) {
      throw saveError;
    }

    // Get current Supabase access token
    const {
      data: sessionData,
      error: sessionError,
    } = await supabaseClient.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    const token =
      sessionData.session?.access_token;

    if (!token) {
      throw new Error(
        "Your login session expired. Please log in again."
      );
    }

    // Send message to Planify AI backend / Gemini
    const response = await fetch(
      "/api/chat",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },

        body: JSON.stringify({
          message: clean,
          history: before,
          event: currentEvent,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
          "Something went wrong."
      );
    }

    typing(false);

    addMessage(
      "assistant",
      data.reply
    );

    // Save AI response
    const { error: assistantSaveError } =
      await supabaseClient
        .from("messages")
        .insert({
          event_id: currentEvent.id,
          user_id: session.user.id,
          role: "assistant",
          content: data.reply,
        });

    if (assistantSaveError) {
      throw assistantSaveError;
    }

    history.push(
      {
        role: "user",
        content: clean,
      },
      {
        role: "assistant",
        content: data.reply,
      }
    );

    lastFailed = "";

    await saveEvent();
  } catch (error) {
    typing(false);

    console.error(
      "Planify AI chat error:",
      error
    );

    $("#errorText").textContent =
      error.message;

    $("#errorBanner").hidden =
      false;
  } finally {
    busy = false;

    $("#sendBtn").disabled =
      false;

    $("#messageInput").focus();
  }
}
// ========================================
// DELETE EVENT
// ========================================

async function deleteCurrent() {
  if (!currentEvent) return;

  const confirmed = confirm(
    `Delete “${
      currentEvent.title ||
      "this event"
    }” and its conversation? This cannot be undone.`
  );

  if (!confirmed) return;

  const { error } =
    await supabaseClient
  .from("events")
      .delete()
      .eq(
        "id",
        currentEvent.id
      );

  if (error) {
    toast(error.message, "error");
    return;
  }

  events = events.filter(
    (event) =>
      event.id !==
      currentEvent.id
  );

  currentEvent = null;
  history = [];

  renderEvents();
  showView("events");

  toast("Event deleted.");
}

// ========================================
// EXPORT PLAN
// ========================================

function exportPlan() {
  if (!currentEvent) return;

  const currencySymbol =
    settings.currency === "USD"
      ? "$"
      : "₱";

  const text =
`Planify AI — EVENT PLAN

Event: ${currentEvent.event_type || "Not set"}
Date: ${currentEvent.event_date || "Not set"}
Location: ${currentEvent.location || "Not set"}
Guests: ${currentEvent.guest_count || "Not set"}
Budget: ${
  currentEvent.budget != null
    ? currencySymbol +
      Number(
        currentEvent.budget
      ).toLocaleString()
    : "Not set"
}
Theme: ${currentEvent.theme || "Not set"}

CONVERSATION

${history
  .map(
    (message) =>
      `${
        message.role === "user"
          ? "YOU"
          : "Planify AI"
      }:

${message.content}`
  )
  .join("\n\n")}`;

  const blob = new Blob(
    [text],
    {
      type: "text/plain",
    }
  );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;

  link.download =
    (
      currentEvent.title ||
      "Planify AI-event"
    )
      .replace(
        /[^a-z0-9]+/gi,
        "-"
      )
      .toLowerCase() +
    ".txt";

  link.click();

  URL.revokeObjectURL(url);
}

// ========================================
// SETTINGS
// ========================================

function fillSettings() {
  $$('input[name="theme"]').forEach(
    (input) => {
      input.checked =
        input.value ===
        settings.theme;
    }
  );

  $$('input[name="density"]').forEach(
    (input) => {
      input.checked =
        input.value ===
        settings.density;
    }
  );

  $("#currency").value =
    settings.currency || "PHP";

  $("#detailLevel").value =
    settings.ai_detail_level ||
    "balanced";

  $("#planningPrefs").value =
    settings.planning_preferences ||
    "";

  $("#eventReminders").checked =
    !!settings.event_reminders;

  $("#planningReminders").checked =
    !!settings.planning_reminders;

  $("#reminderTime").value =
    (
      settings.reminder_time ||
      "09:00"
    ).slice(0, 5);
}

async function saveSettings(patch) {
  const { data, error } =
    await supabaseClient
  .from("user_settings")
      .update({
        ...patch,

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "user_id",
        session.user.id
      )
      .select()
      .single();

  if (error) {
    toast(error.message, "error");
    return;
  }

  settings = {
    ...settings,
    ...data,
  };

  applyTheme();

  toast("Settings saved.");
}

// ========================================
// QUICK PROMPTS
// ========================================

function bindPrompts() {
  $$("[data-prompt]").forEach(
    (button) => {
      button.onclick = () =>
        sendMessage(
          button.dataset.prompt
        );
    }
  );
}

// ========================================
// AUTH TAB BUTTONS
// ========================================

const loginTab =
  $('[data-auth-tab="login"]');

const signupTab =
  $('[data-auth-tab="signup"]');

if (loginTab) {
  loginTab.type = "button";

  loginTab.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      showLogin();
    }
  );
}

if (signupTab) {
  signupTab.type = "button";

  signupTab.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      showSignup();
    }
  );
}

// ========================================
// LOGIN
// ========================================

$("#loginForm")?.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    if (!supabaseClient) {
      $("#authMessage").textContent =
        "Supabase is not connected. Check your .env configuration.";
      return;
    }

    const email =
      $("#loginEmail").value.trim();

    const password =
      $("#loginPassword").value;

    $("#authMessage").textContent =
      "Signing in…";

    try {
      const { data, error } =
        await supabaseClient.auth
          .signInWithPassword({
            email,
            password,
          });

      if (error) {
        $("#authMessage").textContent =
          error.message;
        return;
      }

      if (!data.session) {
        $("#authMessage").textContent =
          "Unable to create login session.";
        return;
      }

      session = data.session;

      $("#authMessage").textContent = "";

      await enterApp();
    } catch (error) {
      console.error(
        "Login error:",
        error
      );

      $("#authMessage").textContent =
        error.message ||
        "Unable to log in. Please try again.";
    }
  }
);

// ========================================
// FORGOT PASSWORD
// ========================================

$("#forgotBtn")?.addEventListener(
  "click",
  async () => {
   if (!supabaseClient) {
      $("#authMessage").textContent =
        "Supabase is not connected.";

      return;
    }

    let email =
      $("#loginEmail").value.trim();

    if (!email) {
      email = prompt(
        "Enter the email address for your Planify AI account:"
      );
    }

    if (!email) return;

    try {
      const { error } =
        await supabaseClient.auth
          .resetPasswordForEmail(
            email,
            {
              redirectTo:
                window.location.origin,
            }
          );

      if (error) {
        $("#authMessage").textContent =
          error.message;

        return;
      }

      $("#authMessage").textContent =
        "Password reset email sent. Check your inbox.";
    } catch (error) {
      console.error(
        "Password reset error:",
        error
      );

      $("#authMessage").textContent =
        "Unable to send password reset email.";
    }
  }
);

// ========================================
// LOGOUT
// ========================================

async function logout() {
  if (!supabaseClient) return;

  await supabaseClient.auth.signOut();

  session = null;
  currentEvent = null;
  history = [];
  events = [];

  showAuth();
}

$("#logoutBtn")?.addEventListener(
  "click",
  logout
);

$("#securityLogout")?.addEventListener(
  "click",
  logout
);

// ========================================
// MAIN NAVIGATION
// ========================================

$$("[data-view]").forEach(
  (button) => {
    button.addEventListener(
      "click",
      () => {
        showView(
          button.dataset.view
        );
      }
    );
  }
);

$("#newEventNav")?.addEventListener(
  "click",
  createEvent
);

$("#heroCreate")?.addEventListener(
  "click",
  createEvent
);

$("#eventsCreate")?.addEventListener(
  "click",
  createEvent
);

$("#mobileMenu")?.addEventListener(
  "click",
  () => {
    document.body.classList.toggle(
      "nav-open"
    );
  }
);

// ========================================
// QUICK THEME BUTTON
// ========================================

$("#themeBtn")?.addEventListener(
  "click",
  () => {
    settings.theme =
      document.documentElement
        .dataset.theme === "dark"
        ? "light"
        : "dark";

    applyTheme();

    if (session) {
      saveSettings({
        theme: settings.theme,
      });
    }
  }
);

// ========================================
// CHAT FORM
// ========================================

$("#chatForm")?.addEventListener(
  "submit",
  (event) => {
    event.preventDefault();

    sendMessage(
      $("#messageInput").value
    );
  }
);

$("#messageInput")?.addEventListener(
  "keydown",
  (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      $("#chatForm")
        .requestSubmit();
    }
  }
);

$("#retryBtn")?.addEventListener(
  "click",
  () => {
    if (lastFailed) {
      sendMessage(lastFailed);
    }
  }
);

$("#deleteEventBtn")?.addEventListener(
  "click",
  deleteCurrent
);

$("#exportBtn")?.addEventListener(
  "click",
  exportPlan
);

// ========================================
// EVENT DETAILS AUTO SAVE
// ========================================

$$("[data-field]").forEach(
  (element) => {
    element.addEventListener(
      "input",
      () => {
        if (!currentEvent) return;

        currentEvent[
          element.dataset.field
        ] = element.value;

        if (
          element.dataset.field ===
            "event_type" &&
          (!currentEvent.title ||
            currentEvent.title ===
              "New Event")
        ) {
          currentEvent.title =
            element.value ||
            "New Event";
        }

        renderProgress();
        scheduleSave();
      }
    );
  }
);

// ========================================
// SETTINGS TABS
// ========================================

$$(".settings-tab").forEach(
  (button) => {
    button.addEventListener(
      "click",
      () => {
        $$(".settings-tab").forEach(
          (item) => {
            item.classList.toggle(
              "active",
              item === button
            );
          }
        );

        $$(".settings-pane").forEach(
          (pane) => {
            pane.hidden =
              pane.dataset.pane !==
              button.dataset.settings;
          }
        );
      }
    );
  }
);

// ========================================
// PROFILE SETTINGS
// ========================================

$("#profileForm")?.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    const patch = {
      full_name:
        $("#profileFullName")
          .value.trim(),

      display_name:
        $("#profileDisplayName")
          .value.trim(),

      avatar_url:
        $("#profilePicture")
          .value.trim() || null,

      updated_at:
        new Date().toISOString(),
    };

    const { data, error } =
      await supabaseClient
  .from("profiles")
        .update(patch)
        .eq(
          "id",
          session.user.id
        )
        .select()
        .single();

    if (error) {
      toast(
        error.message,
        "error"
      );

      return;
    }

    profile = data;

    renderIdentity();

    toast("Profile saved.");
  }
);

// ========================================
// APPEARANCE SETTINGS
// ========================================

$("#appearanceForm")?.addEventListener(
  "submit",
  (event) => {
    event.preventDefault();

    saveSettings({
      theme:
        $(
          'input[name="theme"]:checked'
        )?.value || "system",

      density:
        $(
          'input[name="density"]:checked'
        )?.value ||
        "comfortable",
    });
  }
);

// ========================================
// AI SETTINGS
// ========================================

$("#aiForm")?.addEventListener(
  "submit",
  (event) => {
    event.preventDefault();

    saveSettings({
      currency:
        $("#currency").value,

      ai_detail_level:
        $("#detailLevel").value,

      planning_preferences:
        $("#planningPrefs")
          .value.trim(),
    });
  }
);

// ========================================
// NOTIFICATION SETTINGS
// ========================================

$("#notificationsForm")
  ?.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();

      saveSettings({
        event_reminders:
          $("#eventReminders")
            .checked,

        planning_reminders:
          $("#planningReminders")
            .checked,

        reminder_time:
          $("#reminderTime")
            .value ||
          "09:00",
      });
    }
  );

// ========================================
// CHANGE PASSWORD
// ========================================

$("#passwordForm")?.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    const password =
      $("#newPassword").value;

    const confirmPassword =
      $("#confirmNewPassword")
        .value;

    if (
      password !==
      confirmPassword
    ) {
      toast(
        "Passwords do not match.",
        "error"
      );

      return;
    }

    if (password.length < 6) {
      toast(
        "Password must contain at least 6 characters.",
        "error"
      );

      return;
    }

    const { error } =
      await supabaseClient.auth
        .updateUser({
          password,
        });

    if (error) {
      toast(
        error.message,
        "error"
      );

      return;
    }

    event.target.reset();

    toast(
      "Password updated."
    );
  }
);

// ========================================
// DELETE Planify AI DATA
// ========================================

$("#deleteDataBtn")?.addEventListener(
  "click",
  async () => {
    const confirmed =
      confirm(
        "Permanently delete your Planify AI profile, settings, events and conversations?"
      );

    if (!confirmed) return;

    const confirmation =
      prompt(
        'Type DELETE to confirm:'
      );

    if (
      confirmation !== "DELETE"
    ) {
      return;
    }

    const uid =
      session.user.id;

    const { error } =
      await supabaseClient
  .from("profiles")
        .delete()
        .eq("id", uid);

    if (error) {
      toast(
        error.message,
        "error"
      );

      return;
    }

    toast(
      "Planify AI data deleted. Signing out…"
    );

    setTimeout(
      logout,
      900
    );
  }
);

// ========================================
// SYSTEM THEME CHANGE
// ========================================

matchMedia(
  "(prefers-color-scheme: dark)"
).addEventListener(
  "change",
  () => {
    if (
      settings.theme ===
      "system"
    ) {
      applyTheme();
    }
  }
);

// ========================================
// START Planify AI
// ========================================

showLogin();
init();