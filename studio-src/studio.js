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

init();
