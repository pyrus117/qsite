import {
  acceptInvite, getUser, handleAuthCallback, login, logout,
} from "@netlify/identity";

const $ = (id) => document.getElementById(id);
let currentUser = null;

export function rolesOf(user) {
  return user?.appMetadata?.roles ?? user?.app_metadata?.roles ?? [];
}

export async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function showToast(msg, isError = false) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.toggle("error", isError);
  t.hidden = false;
  setTimeout(() => { t.hidden = true; }, 5000);
}

function show(user) {
  currentUser = user;
  $("loading").hidden = true;
  $("view-login").hidden = !!user;
  $("user-bar").hidden = !user;
  $("view-composer").hidden = !user;
  const isAdmin = user && rolesOf(user).includes("admin");
  $("view-admin").hidden = !isAdmin;
  if (user) {
    $("user-email").textContent = user.email;
    $("post-date").value = new Date().toISOString().slice(0, 10);
    if (isAdmin) window.renderAdmin?.();   // defined in the admin module
  }
}

async function readImageAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Could not read the image file"));
    r.readAsDataURL(file);
  });
}

async function publishManualPost(ev) {
  ev.preventDefault();
  const btn = $("publish-btn");
  btn.disabled = true;
  try {
    let imageName = null;
    const file = $("post-image").files[0];
    if (file) {
      const data = await readImageAsBase64(file);
      const up = await api("/api/images", {
        method: "POST",
        body: JSON.stringify({ filename: file.name, data }),
      });
      imageName = up.filename;
    }
    const { idea } = await api("/api/ideas", {
      method: "POST",
      body: JSON.stringify({
        source: "manual",
        title: $("post-title").value,
        body: $("post-body").value,
        image: imageName,
        imageAlt: $("post-image-alt").value || null,
        link: $("post-link").value || null,
        linkLabel: $("post-link-label").value || null,
      }),
    });
    await api(`/api/ideas/${idea.id}/publish`, {
      method: "POST",
      body: JSON.stringify({ date: $("post-date").value }),
    });
    showToast("Published — the site will update in a minute or two.");
    $("composer-form").reset();
  } catch (e) {
    showToast(e.message, true);
  } finally {
    btn.disabled = false;
  }
}

async function init() {
  let inviteToken = null;
  try {
    const result = await handleAuthCallback();
    if (result?.type === "invite") inviteToken = result.token;
  } catch (e) {
    showToast(e.message, true);
  }

  if (inviteToken) {
    $("loading").hidden = true;
    $("view-login").hidden = false;
    $("login-form").hidden = true;
    $("invite-form").hidden = false;
    $("invite-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        const user = await acceptInvite(inviteToken, $("invite-password").value);
        $("login-form").hidden = false;
        $("invite-form").hidden = true;
        show(user);
      } catch (e) { showToast(e.message, true); }
    });
    return;
  }

  show(await getUser());

  $("login-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      show(await login($("login-email").value, $("login-password").value));
    } catch (e) {
      showToast(e.status === 401 ? "Wrong email or password." : e.message, true);
    }
  });
  $("logout-btn").addEventListener("click", async () => { await logout(); show(null); });
  $("composer-form").addEventListener("submit", publishManualPost);
}

// ── Admin: AI pipeline queue ─────────────────────────────────────
const STATUS_COLOR = {
  pending: "#8A8171", researching: "#D9A45B", drafting: "#7BA7D9",
  reflecting: "#9D7BD8", ready: "#8FBF6F", approved: "#5FB8B8",
  published: "#2e7d32", failed: "#b3261e",
};

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "onclick") node.addEventListener("click", v);
    else if (k === "hidden") node.hidden = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

async function ideaActions(idea) {
  const actions = [];
  const act = (label, fn) => el("button", { type: "button", onclick: async (ev) => {
    ev.target.disabled = true;
    try { await fn(); await window.renderAdmin(); }
    catch (e) { showToast(e.message, true); ev.target.disabled = false; }
  }}, label);

  if (idea.status === "ready") {
    actions.push(act("Approve & publish", async () => {
      await api(`/api/ideas/${idea.id}`, { method: "PATCH", body: JSON.stringify({ status: "approved" }) });
      await api(`/api/ideas/${idea.id}/publish`, { method: "POST", body: JSON.stringify({}) });
      showToast("Published — the site will update in a minute or two.");
    }));
  }
  if (idea.status === "failed") {
    actions.push(act("Retry", () =>
      api(`/api/ideas/${idea.id}`, { method: "PATCH", body: JSON.stringify({ status: "pending" }) })));
  }
  return actions;
}

async function ideaCard(idea) {
  const card = el("div", { class: "idea-card" },
    el("h3", {}, idea.title),
    el("span", { class: "status-chip", style: `background:${STATUS_COLOR[idea.status] ?? "#666"}` }, idea.status),
  );
  if (idea.error) card.append(el("p", { class: "idea-error" }, `Error: ${idea.error}`));

  if (["ready", "approved", "published", "failed"].includes(idea.status)) {
    const details = el("details", { class: "draft-view" }, el("summary", {}, "Latest draft"));
    details.addEventListener("toggle", async () => {
      if (!details.open || details.dataset.loaded) return;
      details.dataset.loaded = "1";
      try {
        const { drafts } = await api(`/api/ideas/${idea.id}`);
        const latest = drafts[0];
        if (!latest) { details.append(el("p", {}, "No draft yet.")); return; }
        const bodyBox = el("textarea", { rows: "12", style: "width:100%" });
        bodyBox.value = latest.body ?? "";
        const titleBox = el("input", { type: "text", style: "width:100%" });
        titleBox.value = latest.title ?? idea.title;
        details.append(
          latest.reflectionNotes ? el("p", {}, `Reflection: ${latest.reflectionNotes}`) : "",
          el("label", {}, "Title", titleBox),
          el("label", {}, "Body", bodyBox),
          idea.status === "ready"
            ? el("button", { type: "button", onclick: async (ev) => {
                ev.target.disabled = true;
                try {
                  await api(`/api/ideas/${idea.id}/drafts`, {
                    method: "POST",
                    body: JSON.stringify({ title: titleBox.value, body: bodyBox.value }),
                  });
                  showToast("Edits saved as a new draft version.");
                } catch (e) { showToast(e.message, true); }
                ev.target.disabled = false;
              }}, "Save edits")
            : "",
          latest.brief ? el("details", {}, el("summary", {}, "Research brief"), el("pre", { style: "white-space:pre-wrap" }, latest.brief)) : "",
        );
      } catch (e) { details.append(el("p", { class: "idea-error" }, e.message)); }
    });
    card.append(details);
  }

  card.append(...await ideaActions(idea));
  return card;
}

window.renderAdmin = async function renderAdmin() {
  const root = $("view-admin");
  root.replaceChildren(el("h1", {}, "AI pipeline"));

  const intake = el("form", { id: "intake-form" },
    el("label", {}, "Idea title", el("input", { type: "text", id: "idea-title", required: "true", maxlength: "255" })),
    el("label", {}, "Notes / angle (optional)", el("textarea", { id: "idea-notes", rows: "3" })),
    el("button", { type: "submit" }, "Queue for research"),
  );
  intake.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      await api("/api/ideas", { method: "POST", body: JSON.stringify({
        source: "agent",
        title: $("idea-title").value,
        notes: $("idea-notes").value || null,
      })});
      showToast("Queued — the runner will pick it up next poll.");
      await window.renderAdmin();
    } catch (e) { showToast(e.message, true); }
  });
  root.append(intake, el("p", { id: "runner-status" }, "Runner: checking…"));

  try {
    const { ideas, runnerLastSeen } = await api("/api/ideas");
    const mins = runnerLastSeen ? Math.round((Date.now() - new Date(runnerLastSeen)) / 60000) : null;
    $("runner-status").textContent =
      mins === null ? "Runner: never seen — is your PC on?" :
      mins <= 3 ? "Runner: online" : `Runner: last seen ${mins} min ago`;
    for (const idea of ideas) root.append(await ideaCard(idea));
    if (!ideas.length) root.append(el("p", {}, "No ideas yet — queue one above."));
  } catch (e) {
    root.append(el("p", { class: "idea-error" }, e.message));
  }
};

init();
