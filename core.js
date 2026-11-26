// =========================================================
// Campus Lost & Found — shared code (used by index.html AND admin.html)
// Firebase setup, helpers, sign-in window, scroll animation
// =========================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { SETTINGS } from "./settings.js";
export { SETTINGS, firebaseConfig };

try { localStorage.removeItem("theme"); } catch {}
window.__appStarted = true;                     // tells the page the code loaded
document.documentElement.classList.add("js");   // enables the scroll animation styles

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// ---------- Helpers ----------
export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const STATUS = {
  available: "Waiting for owner",
  pending: "Claim submitted",
  ready: "Ready for pickup",
  returned: "Returned",
  archived: "Archived",
};
export const CLAIM_STATUS = { pending: "Under review", approved: "Approved", collected: "Collected", rejected: "Not approved" };
export const OPEN_STATUSES = ["available", "pending", "ready"];
export const DAY = 86400000;

export const BOX_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/></svg>`;
export const WA_ICON = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.2-.4.2-.4.7-1.3a.5.5 0 000-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.8 11.9 11.9 0 004.6 4c1.7.7 2.4.8 3.2.6a2.8 2.8 0 001.8-1.3 2.3 2.3 0 00.2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>`;

export const PIN_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>`;

export const isDataImage = (p) => typeof p === "string" && p.startsWith("data:image/");
export const millis = (ts) => (ts?.toMillis ? ts.toMillis() : typeof ts === "number" ? ts : Date.now());
export const daysSince = (ts) => Math.floor((Date.now() - millis(ts)) / DAY);
export const isLongUnclaimed = (it) =>
  ["available", "pending"].includes(it.status) && daysSince(it.createdAt) >= SETTINGS.longUnclaimedDays;

export function thumb(it, extraClass = "", extra = "") {
  const photo = it?.photo;
  const priv = it?.photoHidden;
  return `<div class="thumb ${priv ? "private" : ""} ${extraClass}">${extra}${
    isDataImage(photo) ? `<img src="${esc(photo)}" alt="" loading="lazy">` : BOX_ICON}${
    priv ? `<span class="private-tag">🔒 Hidden for privacy</span>` : ""}</div>`;
}

export function formatDate(value) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value + "T12:00:00") : value.toDate ? value.toDate() : new Date(value);
  if (isNaN(d)) return esc(value);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function toast(message) {
  const t = $("toast");
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 6000);
}

export function friendlyError(err) {
  console.error(err);
  const code = err?.code || "";
  const host = location.hostname;
  const messages = {
    "permission-denied": "You don't have permission to do that. (Did you publish the new firestore.rules?)",
    "auth/popup-closed-by-user": "Sign-in was cancelled.",
    "auth/cancelled-popup-request": "Sign-in was cancelled.",
    "auth/unauthorized-domain": `Firebase blocked "${host}". Add it in Firebase → Authentication → Settings → Authorized domains.`,
    "auth/operation-not-allowed": "This sign-in method is turned off. Enable it in Firebase → Authentication → Sign-in method.",
    "auth/configuration-not-found": "Authentication isn't set up. In Firebase, open Authentication and click Get started, then enable Google.",
    "auth/invalid-api-key": "The apiKey in firebase-config.js is wrong. Copy it again from Firebase project settings.",
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "The apiKey in firebase-config.js is wrong. Copy it again from Firebase project settings.",
    "auth/network-request-failed": "Network error. Check your internet connection.",
    "timeout": "Saving is taking too long. Check your internet connection and try again.",
    "auth/invalid-credential": "Wrong email or password.",
    "auth/wrong-password": "Wrong email or password.",
    "auth/user-not-found": "Wrong email or password.",
    "auth/invalid-login-credentials": "Wrong email or password.",
    "auth/email-already-in-use": "An account with this email already exists. Sign in instead, or use \"Forgot password\". If you used Google before, use Continue with Google.",
    "auth/weak-password": "Password is too short. Use at least 6 characters.",
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/missing-password": "Please type your password.",
    "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  };
  return messages[code] || `Something went wrong${code ? " (" + code + ")" : ""}. Check your connection and try again.`;
}

export function setupBanner(text) {
  let b = document.getElementById("setupBanner");
  if (!b) {
    b = document.createElement("div");
    b.id = "setupBanner";
    b.className = "setup-banner";
    document.body.prepend(b);
  }
  b.textContent = text;
}
if (firebaseConfig.apiKey.startsWith("PASTE")) {
  setupBanner("Setup needed: open firebase-config.js and paste your own Firebase config. Sign-in and saving won't work until you do.");
}

// Don't wait forever if Firestore can't save
export function withTimeout(promise, ms = 25000) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject({ code: "timeout" }), ms))]);
}

// Shrink a photo so it uploads fast and fits in a Firestore document.
export async function compressImage(file, maxSize = 900) {
  const bitmap = await createImageBitmap(file);
  let scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  let quality = 0.72;
  let dataUrl = "";
  for (let i = 0; i < 6; i++) {
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length < 250_000) break;   // ~180 KB
    scale *= 0.8;
    quality = Math.max(0.45, quality - 0.08);
  }
  return dataUrl;
}

// A tiny, unreadable version of a photo, shown blurred to the public
export function tinyPreview(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 20;
      c.height = Math.max(1, Math.round(20 * img.height / img.width));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.5));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export function sixDigitCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, "0");
}

export const itemLink = (id) => `${location.origin}${location.pathname}#item-${id}`;
export const waShareLink = (it) => "https://wa.me/?text=" + encodeURIComponent(
  `Found on campus: ${it.title} (found at ${it.location}${it.foundDate ? ", " + formatDate(it.foundDate) : ""}). Is it yours? Claim it here: ${itemLink(it.id)}`);
export const waSecurityLink = (claim, it) => SETTINGS.securityWhatsApp
  ? `https://wa.me/${SETTINGS.securityWhatsApp.replace(/\D/g, "")}?text=` + encodeURIComponent(
      `Hello, my claim for "${it?.title || claim.itemTitle}" on Campus Lost & Found was approved. When can I come to ${it?.keptAt || "collect it"}? My name is ${claim.name}.`)
  : null;

export const optionList = (values, selected = "") =>
  values.map((v) => `<option value="${esc(v)}"${v === selected ? " selected" : ""}>${esc(v)}</option>`).join("");



// ---------- Auth ----------
export const allowed = SETTINGS.allowedEmailDomains.map((d) => d.toLowerCase().replace(/^@/, ""));
export const emailAllowed = (email) => !allowed.length || allowed.some((d) => (email || "").toLowerCase().endsWith("@" + d));

// ----- Sign-in window (Google or email + password) -----
let authMode = "signin";

export function authMessage(text, kind = "") {
  const m = $("authMsg");
  m.textContent = text || "";
  m.className = "auth-msg" + (kind ? " " + kind : "") + (text ? "" : " hidden");
}

export function setAuthMode(mode) {
  authMode = mode;
  const titles = { signin: "Sign in", signup: "Create an account", reset: "Reset your password" };
  const buttons = { signin: "Sign in", signup: "Create account", reset: "Send reset link" };
  $("authTitle").textContent = titles[mode];
  $("authSubmit").textContent = buttons[mode];
  $("nameField").classList.toggle("hidden", mode !== "signup");
  $("passField").classList.toggle("hidden", mode === "reset");
  $("passHint").classList.toggle("hidden", mode !== "signup");
  $("authPass").autocomplete = mode === "signup" ? "new-password" : "current-password";
  $("authTabs").classList.toggle("hidden", mode === "reset");
  $("forgotBtn").classList.toggle("hidden", mode !== "signin");
  $("backBtn").classList.toggle("hidden", mode !== "reset");
  document.querySelectorAll("[data-auth-mode]").forEach((t) => t.classList.toggle("active", t.dataset.authMode === mode));
  authMessage("");
}

export function signIn() {
  if (firebaseConfig.apiKey.startsWith("PASTE")) { toast("Paste your Firebase config into firebase-config.js first."); return; }
  setAuthMode("signin");
  $("authModal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setTimeout(() => $("authEmail").focus(), 50);
}
export function closeAuth() {
  $("authModal").classList.add("hidden");
  if ($("modal").classList.contains("hidden")) document.body.style.overflow = "";
}

export async function googleSignIn() {
  const provider = new GoogleAuthProvider();
  // Always show Google's account chooser (so you can switch accounts)
  provider.setCustomParameters({ prompt: "select_account", ...(allowed.length === 1 ? { hd: allowed[0] } : {}) });
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    if (err?.code === "auth/popup-blocked" || err?.code === "auth/operation-not-supported-in-this-environment") {
      try { await signInWithRedirect(auth, provider); return; } catch (e) { err = e; }
    }
    authMessage(friendlyError(err), "bad");
    if (err?.code === "auth/unauthorized-domain") setupBanner(friendlyError(err));
  }
}

// Email accounts must click the link in their inbox before they can use the site
export const needsVerification = (user) =>
  user && !user.emailVerified && user.providerData.some((p) => p.providerId === "password");

$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("authEmail").value.trim();
  const pass = $("authPass").value;
  const name = $("authName").value.trim();
  const btn = $("authSubmit");
  if (!email) { authMessage("Please type your email.", "bad"); return; }
  if (authMode !== "reset" && !pass) { authMessage("Please type your password.", "bad"); return; }
  if (authMode === "signup" && !name) { authMessage("Please type your full name.", "bad"); return; }
  if (authMode !== "reset" && !emailAllowed(email)) {
    authMessage(`Please use your school email (${allowed.map((d) => "@" + d).join(" or ")}).`, "bad");
    return;
  }
  btn.disabled = true;
  authMessage("Please wait…");
  try {
    if (authMode === "signup") {
      const { user } = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(user, { displayName: name });
      await sendEmailVerification(user);
      await signOut(auth);
      setAuthMode("signin");
      $("authEmail").value = email;
      authMessage(`Account created! We sent a link to ${email}. Open it to confirm your email, then sign in here. (Check your spam folder too.)`, "ok");
    } else if (authMode === "signin") {
      const { user } = await signInWithEmailAndPassword(auth, email, pass);
      if (needsVerification(user)) {
        await sendEmailVerification(user).catch(() => {});
        await signOut(auth);
        authMessage(`Please confirm your email first. We've sent a new link to ${email}. Open it, then sign in again.`, "bad");
      }
      // Verified users: onAuthStateChanged closes this window
    } else {
      await sendPasswordResetEmail(auth, email);
      authMessage(`If an account exists for ${email}, a password reset link is on its way. Check your spam folder too.`, "ok");
    }
  } catch (err) {
    authMessage(friendlyError(err), "bad");
  } finally {
    btn.disabled = false;
  }
});

$("googleBtn").addEventListener("click", googleSignIn);
$("authTabs").addEventListener("click", (e) => { const t = e.target.closest("[data-auth-mode]"); if (t) setAuthMode(t.dataset.authMode); });
$("forgotBtn").addEventListener("click", () => setAuthMode("reset"));
$("backBtn").addEventListener("click", () => setAuthMode("signin"));
$("authModal").addEventListener("click", (e) => {
  if (e.target === $("authModal") || e.target.closest("[data-auth-close]")) closeAuth();
});

getRedirectResult(auth).catch((err) => toast(friendlyError(err)));
$("signInBtn").addEventListener("click", signIn);
document.addEventListener("click", (e) => { if (e.target.closest("[data-signin]")) signIn(); });

// ---------- Scroll animation: things fade up as they come into view ----------
const revealed = new Set();   // cards that already animated (so list updates don't replay it)
let revealObserver = null;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function showReveal(el) {
  el.classList.add("in");
  if (el.dataset.revealKey) revealed.add(el.dataset.revealKey);
  const delay = parseInt(getComputedStyle(el).getPropertyValue("--d")) || 0;
  // When the animation is done, go back to the element's normal styles (so hover effects stay snappy)
  setTimeout(() => el.classList.remove("reveal", "in"), 750 + delay);
}

export function revealScan() {
  const els = document.querySelectorAll(".reveal:not([data-rv])");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.remove("reveal"));
    return;
  }
  revealObserver ??= new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { showReveal(e.target); revealObserver.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  els.forEach((el) => {
    el.dataset.rv = "1";
    if (el.dataset.revealKey && revealed.has(el.dataset.revealKey)) { el.classList.remove("reveal"); return; }
    revealObserver.observe(el);
  });
}


// ---------- Install as an app on phones ----------
// Saves files for faster loading. Always fetches the newest version first.
if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

const isInstalled = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
let installPrompt = null;
const installBtn = document.getElementById("installBtn");

if (installBtn && !isInstalled()) {
  // Android / Chrome / Edge: the browser tells us when installing is possible
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e;
    installBtn.classList.remove("hidden");
  });
  // iPhone / iPad: Safari has no install button, so we show how to do it
  if (isIOS) installBtn.classList.remove("hidden");

  installBtn.addEventListener("click", async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      installPrompt = null;
      if (outcome === "accepted") installBtn.classList.add("hidden");
    } else if (isIOS) {
      toast("To install: tap the Share button (square with an arrow) at the bottom of Safari, then \"Add to Home Screen\".");
    }
  });
  window.addEventListener("appinstalled", () => {
    installBtn.classList.add("hidden");
    toast("Installed! You'll find CampusFound on your home screen.");
  });
}


// ---------- Background saving ----------
// Firebase keeps a change on this device immediately and sends it to the server by itself.
// trackSave() shows a small "Sending…" label until the server has it, and warns before
// the page is closed so nothing is lost on a slow connection.
let pendingSaves = 0;
function updateSyncPill() {
  let pill = document.getElementById("syncPill");
  if (!pill) {
    pill = document.createElement("div");
    pill.id = "syncPill";
    pill.className = "sync-pill hidden";
    pill.setAttribute("role", "status");
    pill.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Sending… keep this page open</span>';
    document.body.appendChild(pill);
  }
  pill.classList.toggle("hidden", pendingSaves === 0);
}
window.addEventListener("beforeunload", (e) => {
  if (pendingSaves > 0) { e.preventDefault(); e.returnValue = ""; }
});
export function trackSave(promise, onError) {
  pendingSaves++;
  updateSyncPill();
  let done = false;
  // Still not confirmed after 12 seconds? Find out why and tell the person.
  const slowTimer = setTimeout(() => { if (!done) explainSlowSave(); }, 12000);
  promise
    .catch((err) => { console.error(err); if (onError) onError(err); })
    .finally(() => { done = true; clearTimeout(slowTimer); pendingSaves--; updateSyncPill(); });
  return promise;
}

// ---------- Connection check: can this website talk to the Firebase database? ----------
// Asks Google's database server directly and turns its answer into a plain-English fix.
export async function checkServer() {
  const host = location.hostname;
  // Ask as the signed-in person when possible: that gives the clearest answer
  const user = auth.currentUser;
  const path = user ? `users/${encodeURIComponent(user.uid)}` : "connectionCheck/ping";
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/(default)/documents/${path}?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
  let res, body = {};
  try {
    const headers = {};
    if (user) { try { headers.Authorization = "Bearer " + (await user.getIdToken()); } catch {} }
    res = await fetch(url, { cache: "no-store", headers });
    body = await res.json().catch(() => ({}));
  } catch {
    return { ok: false, text: "This device can't reach Google's database server. The network may be blocking it. Try a different Wi-Fi or mobile data, and turn off any VPN or ad-blocker." };
  }
  const err = body.error || {};
  const detail = `${err.message || ""} ${err.status || ""} ${JSON.stringify(err.details || "")}`;
  if (res.ok) return { ok: true };
  if (/REFERRER|referer/i.test(detail)) {
    return { ok: false, text: `Your Firebase API key is blocking this website. In Google Cloud → APIs & Services → Credentials → Browser key → Website restrictions, add ${location.protocol}//${host}/* and Save (it takes ~5 minutes).` };
  }
  if (/API_KEY_INVALID|API key not valid/i.test(detail)) {
    return { ok: false, text: "The apiKey in firebase-config.js is wrong. Copy it again from Firebase → Project settings → Your apps → Config." };
  }
  if (/SERVICE_DISABLED|has not been used|is disabled/i.test(detail)) {
    return { ok: false, text: "The Cloud Firestore API is turned off for this project. Open Firebase → Firestore Database once, or enable \"Cloud Firestore API\" in Google Cloud." };
  }
  if (res.status === 404 && /does not exist for project|database \(default\) does not exist/i.test(detail)) {
    return { ok: false, text: "The Firestore database hasn't been created. Go to Firebase → Build → Firestore Database → Create database (keep the ID as \"(default)\"), then publish your rules." };
  }
  if (/API_KEY_SERVICE_BLOCKED|are blocked/i.test(detail) || (user && /ACCESS_DENIED|Permission denied on the service/i.test(detail))) {
    return { ok: false, text: `Google is refusing your API key access to the database. In Google Cloud → APIs & Services → Credentials → Browser key: set "API restrictions" to "Don't restrict key" (or tick Cloud Firestore API), check that ${location.protocol}//${host}/* is under Website restrictions, then Save and wait ~5 minutes. Also make sure "Cloud Firestore API" is enabled.` };
  }
  if (user && res.status === 403 && /insufficient permissions/i.test(detail)) {
    return { ok: false, text: "The database is refusing your account. Publish the latest firestore.rules in Firebase → Firestore Database → Rules." };
  }
  // The normal, healthy answer: the server was reached and your security rules replied
  if (res.status === 403 && /insufficient permissions/i.test(detail)) return { ok: true };
  if (res.status === 404) return { ok: true };
  return { ok: false, text: `The database server answered with an error (${res.status}): ${err.message || "unknown"}` };
}

let slowExplained = false;
async function explainSlowSave() {
  if (slowExplained) return;
  slowExplained = true;
  const pillText = document.querySelector("#syncPill span:last-child");
  if (pillText) pillText.textContent = "Still sending… checking your connection";
  const result = await checkServer();
  if (result.ok) {
    if (pillText) pillText.textContent = "Slow connection… still sending, keep this page open";
  } else {
    if (pillText) pillText.textContent = "Can't reach the server (see the message at the top)";
    setupBanner(result.text);
    toast(result.text);
  }
}
