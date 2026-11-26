// =========================================================
// Campus Lost & Found — student website (index.html)
// The admin dashboard lives separately in admin.html / admin.js
// =========================================================
import {
  signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  $, BOX_ICON, CLAIM_STATUS, DAY, OPEN_STATUSES, PIN_ICON, SETTINGS, STATUS, WA_ICON, allowed, app, auth, authMessage, closeAuth, compressImage, daysSince, db, emailAllowed, esc, firebaseConfig, formatDate, friendlyError, googleSignIn, isDataImage, isLongUnclaimed, itemLink, millis, needsVerification, optionList, revealScan, setAuthMode, setupBanner, signIn, sixDigitCode, thumb, tinyPreview, toast, waSecurityLink, waShareLink, withTimeout
} from "./core.js";

// Catch the "replaced some files but not index.html" mistake
if (!$("lostForm") || !$("categoryChips") || !$("authModal") || !$("page-gate") || !$("page-profile")) {
  setupBanner("index.html is out of date. Replace all the files together (index.html, style.css, core.js, app.js), then press Ctrl + Shift + R.");
}

// ---------- State ----------
const state = {
  user: null,
  isAdmin: false,
  items: [],
  itemsLoaded: false,
  myClaims: [],
  myReports: [],        // my "I lost something" reports
  allClaims: [],        // admin
  reports: [],          // admin: reported posts
  allLostReports: [],   // admin
  allUsers: [],         // admin: student profiles
  userSearch: "",
  profile: null,        // my student profile (users/{uid})
  profileLoaded: false,
  filter: "open",
  category: "All",
  location: "",
  search: "",
  photo: null,          // compressed data URL for the upload form
  adminTab: "overview",
  lastUploaded: null,
};
let unsubs = [];

// ---------- Dropdowns from settings ----------

function fillSelects() {
  $("category").innerHTML = `<option value="">Choose a category</option>` + optionList(SETTINGS.categories);
  $("lCategory").innerHTML = `<option value="">Choose a category</option>` + optionList(SETTINGS.categories);
  const locs = optionList([...SETTINGS.locations, "Other"]);
  $("location").innerHTML = `<option value="">Choose a place</option>` + locs;
  $("lLocation").innerHTML = `<option value="">Not sure</option>` + locs;
  $("categoryChips").innerHTML = ["All", ...SETTINGS.categories]
    .map((c) => `<button class="chip${c === "All" ? " active" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
}
fillSelects();

function bindOther(selectId, otherId) {
  $(selectId).addEventListener("change", () => {
    const isOther = $(selectId).value === "Other";
    $(otherId).classList.toggle("hidden", !isOther);
    if (isOther) $(otherId).focus();
  });
}
bindOther("location", "locationOther");
bindOther("lLocation", "lLocationOther");
const readLocation = (selectId, otherId) =>
  $(selectId).value === "Other" ? $(otherId).value.trim() : $(selectId).value;

$("category").addEventListener("change", () => {
  if (SETTINGS.sensitiveCategories.includes($("category").value)) $("hidePhoto").checked = true;
});


// ---------- Routing ----------
const PAGES = ["home", "lost", "found", "report-lost", "mine", "gate", "profile"];
// Everything except the home page needs you to be signed in
const NEEDS_SIGN_IN = ["lost", "found", "report-lost", "mine", "profile"];
const profileComplete = (p) => !!(p && p.name && p.matric && p.department && p.level && p.phone);
const ALIASES = { "my-claims": "mine" };

function showPage() {
  let hash = location.hash.slice(1) || "home";
  let openId = null;
  if (hash.startsWith("item-")) { openId = hash.slice(5); hash = "lost"; }
  let page = ALIASES[hash] || hash;
  if (!PAGES.includes(page) || page === "gate") page = "home";
  let gated = false;
  if (NEEDS_SIGN_IN.includes(page) && !state.user) {
    gated = true;
    $("gateText").textContent = openId
      ? "Someone shared a found item with you. Sign in to see it and claim it if it's yours."
      : "Campus Lost & Found is for students and staff. Sign in to see found items, report something you lost or found, and check your claims.";
    page = "gate";
  }
  // Signed in but profile not filled in yet: send them to "Complete your profile" first
  if (state.user && state.profileLoaded && !profileComplete(state.profile) && NEEDS_SIGN_IN.includes(page) && page !== "profile") {
    state.afterProfile = location.hash || "#home";
    page = "profile";
  }
  if (page === "profile") fillProfileForm();
  if (page !== "found") $("foundSuccess").classList.add("hidden");
  if (!openId && !$("modal").classList.contains("hidden")) { $("modal").classList.add("hidden"); document.body.style.overflow = ""; }
  PAGES.forEach((p) => $("page-" + p).classList.toggle("hidden", p !== page));
  document.querySelectorAll("[data-link]").forEach((a) => a.classList.toggle("active", a.dataset.link === page));
  $("nav").classList.remove("open");
  $("menuBtn").setAttribute("aria-expanded", "false");
  if (!openId) window.scrollTo(0, 0);
  state.currentPage = page;
  // Pop up the sign-in window once we know the person isn't signed in
  if (gated && state.authReady && $("authModal").classList.contains("hidden")) signIn();
  if (page === "mine") markMatchesSeen();
  render();
  if (openId) state.pendingOpen = openId;
  tryPendingOpen();
}
function tryPendingOpen() {
  if (state.pendingOpen && state.items.some((i) => i.id === state.pendingOpen)) {
    openItem(state.pendingOpen);
    state.pendingOpen = null;
  }
}
window.addEventListener("hashchange", showPage);

$("menuBtn").addEventListener("click", () => {
  const open = $("nav").classList.toggle("open");
  $("menuBtn").setAttribute("aria-expanded", String(open));
});


$("signOutBtn").addEventListener("click", async () => {
  // Go home first, so the sign-in window doesn't pop straight back up
  if (location.hash && location.hash !== "#home") {
    history.replaceState(null, "", "#home");
    showPage();
  }
  await signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
  // School email only
  if (user && !emailAllowed(user.email)) {
    authMessage(`Please sign in with your school email (${allowed.map((d) => "@" + d).join(" or ")}).`, "bad");
    toast(`Please sign in with your school email (${allowed.map((d) => "@" + d).join(" or ")}).`);
    await signOut(auth);
    return;
  }
  // Unconfirmed email accounts are treated as signed out
  if (needsVerification(user)) user = null;
  if (user) closeAuth();

  state.user = user;
  state.isAdmin = false;
  state.myClaims = []; state.myReports = []; state.allClaims = []; state.reports = []; state.allLostReports = [];
  state.profile = null; state.profileLoaded = false; state.allUsers = [];
  unsubs.forEach((u) => u()); unsubs = [];

  $("signInBtn").classList.toggle("hidden", !!user);
  $("userBox").classList.toggle("hidden", !user);
  document.querySelectorAll(".signed-in-only").forEach((el) => el.classList.toggle("hidden", !user));
  document.querySelectorAll(".signed-out-only").forEach((el) => el.classList.toggle("hidden", !!user));

  // Found items are only loaded for signed-in people
  stopItems();
  if (user) startItems();

  if (user) {
    $("userName").textContent = (state.profile?.name || user.displayName)?.split(" ")[0] || user.email?.split("@")[0] || "Account";
    $("userName").title = "Your user ID: " + user.uid;
    $("userPhoto").src = user.photoURL || "";
    $("userPhoto").classList.toggle("hidden", !user.photoURL);

    try { state.isAdmin = (await getDoc(doc(db, "admins", user.uid))).exists(); } catch { state.isAdmin = false; }
    await loadProfile(user);

    const listen = (q, key) => unsubs.push(onSnapshot(q,
      (snap) => { state[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() })); render(); },
      (err) => console.error(key, err)));

    listen(query(collection(db, "claims"), where("claimantUid", "==", user.uid)), "myClaims");
    listen(query(collection(db, "lostReports"), where("uid", "==", user.uid)), "myReports");
  }

  state.authReady = true;
  showPage();
});



// ---------- Student profiles (users/{uid}) ----------
async function loadProfile(user) {
  const ref = doc(db, "users", user.uid);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      // First sign-in: save the basics we already know
      await setDoc(ref, {
        uid: user.uid,
        email: user.email || "",
        name: user.displayName || "",
        provider: user.providerData[0]?.providerId === "password" ? "email" : "google",
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });
    } else {
      updateDoc(ref, { lastLoginAt: serverTimestamp() }).catch(() => {});
    }
    unsubs.push(onSnapshot(ref, (s) => {
      state.profile = s.exists() ? s.data() : null;
      if (state.user) $("userName").textContent = (state.profile?.name || state.user.displayName || state.user.email || "Account").split(/[ @]/)[0];
      render();
    }, (err) => console.error("profile", err)));
    state.profile = (await getDoc(ref)).data() || null;
  } catch (err) {
    console.error("profile", err);
    toast(friendlyError(err));
  }
  state.profileLoaded = true;
}

function fillProfileForm() {
  const p = state.profile || {};
  const complete = profileComplete(p);
  $("profileTitle").textContent = complete ? "My profile" : "Complete your profile";
  $("profileIntro").textContent = complete
    ? "Your details are used to fill in your claims automatically. Only you and campus security can see them."
    : "Before you continue, tell us who you are. It takes 30 seconds, and it's only seen by you and campus security.";
  $("pName").value = p.name || state.user?.displayName || "";
  $("pMatric").value = p.matric || "";
  $("pLevel").value = p.level || "";
  $("pDept").value = p.department || "";
  $("pPhone").value = p.phone || "";
  $("pEmail").value = state.user?.email || "";
  $("profileMsg").textContent = "";
}

$("profileForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = (id) => $(id).value.trim();
  const msg = $("profileMsg");
  if (!v("pName") || !v("pMatric") || !v("pLevel") || !v("pDept") || !v("pPhone")) {
    msg.textContent = "Please fill in every field marked *.";
    return;
  }
  if (v("pPhone").replace(/\D/g, "").length < 10) { msg.textContent = "Please enter a valid phone number."; return; }
  const btn = $("profileSubmit");
  btn.disabled = true;
  msg.textContent = "Saving…";
  try {
    await withTimeout(updateDoc(doc(db, "users", state.user.uid), {
      name: v("pName"), matric: v("pMatric"), level: v("pLevel"),
      department: v("pDept"), phone: v("pPhone"), updatedAt: serverTimestamp(),
    }));
    state.profile = { ...(state.profile || {}), name: v("pName"), matric: v("pMatric"), level: v("pLevel"), department: v("pDept"), phone: v("pPhone") };
    msg.textContent = "";
    toast("Profile saved.");
    const next = state.afterProfile;
    state.afterProfile = null;
    if (next && next !== "#profile") { location.hash = next.slice(1) || "home"; showPage(); }
  } catch (err) {
    msg.textContent = friendlyError(err);
  } finally {
    btn.disabled = false;
  }
});

// ---------- Items (signed-in only) ----------
let unsubItems = null;
function startItems() {
  unsubItems = onSnapshot(
    query(collection(db, "items"), orderBy("createdAt", "desc")),
    (snap) => {
      state.items = snap.docs.map((d) => ({ id: d.id, ...d.data(), category: d.data().category || "Other" }));
      state.itemsLoaded = true;
      render();
      tryPendingOpen();
    },
    (err) => {
      state.itemsLoaded = true;
      $("itemGrid").innerHTML = `<div class="empty">Couldn't load items. ${esc(friendlyError(err))}</div>`;
    }
  );
}
function stopItems() {
  unsubItems?.();
  unsubItems = null;
  state.items = [];
  state.itemsLoaded = false;
}

// ---------- Matching lost reports to found items ----------
const STOP = new Set("the and with for from this that have has was were are its it's his her my our your their a an of in on at to is by or black white".split(" "));
const words = (s) => new Set(String(s || "").toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length > 2 && !STOP.has(w)) || []);

function findMatches(report) {
  if (report.status !== "open") return [];
  const rWords = words(report.title + " " + report.description);
  const lostAt = report.lostDate ? new Date(report.lostDate + "T00:00:00").getTime() - 2 * DAY : 0;
  return state.items.filter((it) => {
    if (!["available", "pending"].includes(it.status)) return false;
    if (it.foundDate && new Date(it.foundDate + "T23:59:59").getTime() < lostAt) return false;
    const iWords = words(it.title + " " + it.description);
    let shared = 0;
    rWords.forEach((w) => { if (iWords.has(w)) shared++; });
    const sameCat = report.category && report.category === it.category && report.category !== "Other";
    const samePlace = report.location && report.location === it.location;
    return (sameCat && (shared >= 1 || samePlace)) || shared >= 2;
  });
}

const SEEN_KEY = "seenMatches";
const getSeen = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY)) || []); } catch { return new Set(); } };
function allMatchKeys() {
  const keys = [];
  state.myReports.forEach((r) => findMatches(r).forEach((it) => keys.push(r.id + ":" + it.id)));
  return keys;
}
function markMatchesSeen() {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...getSeen(), ...allMatchKeys()])])); } catch {}
}

function renderMatchAlerts() {
  if (state.currentPage === "mine") markMatchesSeen();
  const seen = getSeen();
  const keys = allMatchKeys();
  const unseen = keys.filter((k) => !seen.has(k)).length;
  document.querySelectorAll("[data-match-dot]").forEach((d) => d.classList.toggle("hidden", !state.user || !unseen));
  const banner = $("matchBanner");
  banner.classList.toggle("hidden", !state.user || !keys.length);
  banner.textContent = keys.length === 1
    ? "We found 1 possible match for something you lost. Tap to check it."
    : `We found ${keys.length} possible matches for things you lost. Tap to check them.`;
}

// ---------- Render ----------
function render() {
  renderHome();
  renderGrid();
  renderGates();
  renderMine();
  renderMatchAlerts();
  revealScan();
}

function renderHome() {
  const visible = state.items.filter((i) => i.status !== "archived");
  const waiting = visible.filter((i) => OPEN_STATUSES.includes(i.status)).length;
  const returned = visible.filter((i) => i.status === "returned").length;
  $("statTotal").textContent = state.itemsLoaded ? visible.length : "–";
  $("statWaiting").textContent = state.itemsLoaded ? waiting : "–";
  $("statReturned").textContent = state.itemsLoaded ? returned : "–";

  const recent = state.items.filter((i) => OPEN_STATUSES.includes(i.status)).slice(0, 3);
  $("recentList").innerHTML = !state.itemsLoaded
    ? `<p class="muted small">Loading…</p>`
    : recent.length
      ? recent.map((it) => `
          <button class="recent-item" data-open="${esc(it.id)}">
            ${thumb(it)}
            <div><strong>${esc(it.title)}</strong><span>${esc(it.location)} · ${formatDate(it.foundDate)}</span></div>
          </button>`).join("")
      : `<p class="muted small">No items yet. Found something? <a href="#found"><b>Report it</b></a>.</p>`;
}

function renderGrid() {
  // location dropdown: settings + any custom places used in items
  const used = [...new Set(state.items.map((i) => i.location).filter(Boolean))];
  const places = [...new Set([...SETTINGS.locations, ...used])].sort();
  $("locationFilter").innerHTML = `<option value="">All locations</option>` + optionList(places, state.location);

  if (!state.itemsLoaded) { $("itemGrid").innerHTML = `<div class="empty">Loading items…</div>`; return; }
  const q = state.search;
  const list = state.items.filter((it) => {
    if (state.filter === "open" && !OPEN_STATUSES.includes(it.status)) return false;
    if (state.filter === "returned" && it.status !== "returned") return false;
    if (state.category !== "All" && it.category !== state.category) return false;
    if (state.location && it.location !== state.location) return false;
    return !q || [it.title, it.location, it.description, it.keptAt, it.category].join(" ").toLowerCase().includes(q);
  });
  if (!list.length) {
    $("itemGrid").innerHTML = `<div class="empty">${
      state.items.length ? "No items match. Try another category, place or word."
        : "No items have been reported yet."}<br><a class="btn btn-primary" href="#found">Report a found item</a></div>`;
    return;
  }
  $("itemGrid").innerHTML = list.map((it, i) => `
    <button class="card reveal" style="--d:${(i % 4) * 70}ms" data-reveal-key="card-${esc(it.id)}" data-open="${esc(it.id)}">
      ${thumb(it, "", `<span class="badge ${esc(it.status)}">${STATUS[it.status] || STATUS.available}</span>${
        isLongUnclaimed(it) ? `<span class="badge old">Long unclaimed</span>` : ""}`)}
      <div class="card-body">
        <h3>${esc(it.title)}</h3>
        <div class="meta"><span class="loc">${PIN_ICON}${esc(it.location)}</span><span>${esc(it.category)} · ${formatDate(it.foundDate)}</span></div>
      </div>
    </button>`).join("");
}

$("search").addEventListener("input", (e) => { state.search = e.target.value.trim().toLowerCase(); renderGrid(); });
$("locationFilter").addEventListener("change", (e) => { state.location = e.target.value; renderGrid(); });
$("categoryChips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  state.category = chip.dataset.cat;
  document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
  renderGrid();
});
$("filterTabs").addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  state.filter = tab.dataset.filter;
  document.querySelectorAll("#filterTabs .tab").forEach((t) => t.classList.toggle("active", t === tab));
  renderGrid();
});
document.addEventListener("click", (e) => {
  const opener = e.target.closest("[data-open]");
  if (opener) openItem(opener.dataset.open);
});

// ---------- Item modal + claim ----------
function canSeePrivate(it) {
  if (!state.user) return false;
  return state.isAdmin || it.postedBy === state.user.uid ||
    state.myClaims.some((c) => c.itemId === it.id && ["approved", "collected"].includes(c.status));
}

function openItem(id) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  const mine = state.myClaims.find((c) => c.itemId === id);
  const isPoster = state.user && it.postedBy === state.user.uid;
  const canManage = state.isAdmin || isPoster;

  let claimSection = "";
  if (it.status === "returned") {
    claimSection = `<p class="notice ok">This item has been returned to its owner.</p>`;
  } else if (it.status === "archived") {
    claimSection = `<p class="notice">This item was archived after being unclaimed for a long time. Ask at ${esc(it.keptAt)} if it's yours.</p>`;
  } else if (mine) {
    claimSection = mine.status === "approved"
      ? `<div class="pickup-code"><div><strong>Your pickup code</strong><br><span class="small muted">Show this and your student ID at ${esc(it.keptAt)}</span></div><b>${esc(mine.pickupCode)}</b></div>`
      : `<p class="notice">You submitted proof on ${formatDate(mine.createdAt)}. Status: <b>${CLAIM_STATUS[mine.status] || "Under review"}</b>. Check <a href="#mine"><b>My stuff</b></a> for updates.</p>`;
  } else if (it.status === "ready") {
    claimSection = `<p class="notice">A claim for this item has been approved and it's waiting to be collected.</p>`;
  } else if (!state.user) {
    claimSection = `<div class="signin-gate"><p>Is this yours? Sign in to submit proof.</p><button class="btn btn-dark" data-signin>Sign in with Google</button></div>`;
  } else if (isPoster) {
    claimSection = `<p class="notice">You uploaded this item. Thanks for handing it in!</p>`;
  } else {
    claimSection = `
      <form class="claim-form" id="claimForm" novalidate>
        <h3>Is this yours? Prove it.</h3>
        <div class="field">
          <label for="cProof">Proof of ownership *</label>
          <textarea id="cProof" maxlength="600" required placeholder="Describe something that isn't in the photo: what's inside, a scratch or sticker, the lock screen, a name written on it…"></textarea>
        </div>
        <div class="field">
          <label for="cPhoto">Supporting photo (optional)</label>
          <input type="file" id="cPhoto" accept="image/*">
          <small>e.g. an old photo of you with the item, or its receipt or box.</small>
        </div>
        <div class="field-row">
          <div class="field"><label for="cName">Full name *</label><input id="cName" maxlength="80" required value="${esc(state.profile?.name || state.user.displayName || "")}"></div>
          <div class="field"><label for="cSid">Matric / student ID *</label><input id="cSid" maxlength="40" required value="${esc(state.profile?.matric || "")}"></div>
        </div>
        <div class="field">
          <label for="cContact">Phone number *</label>
          <input id="cContact" maxlength="40" required type="tel" value="${esc(state.profile?.phone || "")}">
          <small>Only the people reviewing claims can see your details.</small>
        </div>
        <div class="form-foot">
          <button class="btn btn-primary" type="submit">Submit proof</button>
          <span class="form-msg" id="claimMsg"></span>
        </div>
      </form>`;
  }

  const showReport = state.user && !isPoster && !state.isAdmin;
  $("modalBox").innerHTML = `
    <div id="modalMedia">${thumb(it, "modal-media")}</div>
    <div class="modal-body">
      <div class="modal-top">
        <span class="badge ${esc(it.status)}">${STATUS[it.status] || STATUS.available}</span>
        ${isLongUnclaimed(it) ? `<span class="badge old">Long unclaimed</span>` : ""}
        <button class="close-btn" data-close aria-label="Close">×</button>
      </div>
      <h2 id="modalTitle">${esc(it.title)}</h2>
      ${it.description ? `<p style="margin:0">${esc(it.description)}</p>` : ""}
      <div class="details">
        <div><span>Found at</span><strong>${esc(it.location)}</strong></div>
        <div><span>Date found</span><strong>${formatDate(it.foundDate)}</strong></div>
        <div><span>Collect from</span><strong>${esc(it.keptAt)}</strong></div>
      </div>
      <div class="actions">
        <span class="badge">${esc(it.category)}</span>
        ${OPEN_STATUSES.includes(it.status) ? `<a class="btn btn-sm wa-btn" href="${esc(waShareLink(it))}" target="_blank" rel="noopener">${WA_ICON} Share on WhatsApp</a>` : ""}
      </div>
      ${claimSection}
      ${canManage ? `
        <div class="actions">
          ${it.status !== "returned"
            ? `<button class="btn btn-outline btn-sm" data-act="returned">Mark as returned</button>`
            : `<button class="btn btn-outline btn-sm" data-act="available">Mark as not returned</button>`}
          <button class="btn btn-red btn-sm" data-act="delete">Delete item</button>
        </div>` : ""}
      ${showReport ? `
        <div class="report-box" id="reportBox">
          <button class="link-btn" data-act="report-open">Report this post</button>
        </div>` : ""}
    </div>`;
  $("modal").classList.remove("hidden");
  $("modal").dataset.id = id;
  document.body.style.overflow = "hidden";

  const form = $("claimForm");
  if (form) form.addEventListener("submit", (e) => { e.preventDefault(); submitClaim(it); });

  // Load the full photo for people allowed to see a hidden one
  if (it.photoHidden && canSeePrivate(it)) {
    getDoc(doc(db, "privatePhotos", it.id)).then((snap) => {
      const p = snap.data()?.photo;
      if (isDataImage(p) && $("modal").dataset.id === id) {
        $("modalMedia").innerHTML = thumb({ photo: p }, "modal-media");
      }
    }).catch((err) => console.error(err));
  }
}

function closeModal() {
  $("modal").classList.add("hidden");
  document.body.style.overflow = "";
  if (location.hash.startsWith("#item-")) history.replaceState(null, "", "#lost");
}

$("modal").addEventListener("click", async (e) => {
  if (e.target === $("modal") || e.target.closest("[data-close]")) return closeModal();
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const id = $("modal").dataset.id;
  const act = btn.dataset.act;

  if (act === "report-open") {
    $("reportBox").innerHTML = `
      <select class="select" id="reportReason">
        <option>Fake or joke post</option><option>Spam / advert</option>
        <option>Inappropriate photo or text</option><option>Item isn't really there</option><option>Other</option>
      </select>
      <button class="btn btn-red btn-sm" data-act="report-send">Send report</button>`;
    return;
  }
  if (act === "report-send") {
    const it = state.items.find((i) => i.id === id);
    try {
      await withTimeout(setDoc(doc(db, "reports", `${id}_${state.user.uid}`), {
        itemId: id, itemTitle: it?.title || "", reason: $("reportReason").value,
        reporterUid: state.user.uid, createdAt: serverTimestamp(),
      }));
      $("reportBox").innerHTML = `<span class="small muted">Thanks, security will take a look.</span>`;
    } catch (err) {
      $("reportBox").innerHTML = `<span class="small muted">${err?.code === "permission-denied" ? "You've already reported this post." : esc(friendlyError(err))}</span>`;
    }
    return;
  }

  try {
    if (act === "delete") {
      if (btn.dataset.sure !== "1") { btn.dataset.sure = "1"; btn.textContent = "Tap again to delete"; return; }
      await deleteItem(id);
      toast("Item deleted");
    } else {
      await updateDoc(doc(db, "items", id), { status: act });
      toast(act === "returned" ? "Marked as returned" : "Item is listed again");
    }
    closeModal();
  } catch (err) { toast(friendlyError(err)); }
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("authModal").classList.contains("hidden")) closeAuth(); else closeModal();
});

async function deleteItem(id) {
  const it = state.items.find((i) => i.id === id);
  await deleteDoc(doc(db, "items", id));
  if (it?.photoHidden) deleteDoc(doc(db, "privatePhotos", id)).catch(() => {});
}

async function submitClaim(item) {
  const v = (id) => $(id).value.trim();
  const msg = $("claimMsg");
  if (!v("cProof") || !v("cName") || !v("cSid") || !v("cContact")) {
    msg.textContent = "Please fill in every field marked *.";
    return;
  }
  msg.textContent = "Submitting…";
  try {
    const file = $("cPhoto").files[0];
    const proofPhoto = file ? await compressImage(file, 800) : null;
    await withTimeout(addDoc(collection(db, "claims"), {
      itemId: item.id,
      itemTitle: item.title,
      claimantUid: state.user.uid,
      name: v("cName"),
      studentId: v("cSid"),
      contact: v("cContact"),
      proof: v("cProof"),
      proofPhoto,
      status: "pending",
      createdAt: serverTimestamp(),
    }));
    if (item.status === "available") {
      await updateDoc(doc(db, "items", item.id), { status: "pending" });
    }
    toast("Proof submitted! You'll see the result under My stuff.");
    closeModal();
  } catch (err) {
    msg.textContent = friendlyError(err);
  }
}

// ---------- Sign-in gates ----------
function renderGates() {
  const signedIn = !!state.user;
  const success = !$("foundSuccess").classList.contains("hidden");
  $("foundGate").classList.toggle("hidden", signedIn);
  $("foundForm").classList.toggle("hidden", !signedIn || success);
  $("lostGate").classList.toggle("hidden", signedIn);
  $("lostForm").classList.toggle("hidden", !signedIn);
}

// ---------- Report found (upload) ----------
function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
$("foundDate").value = today();
$("lDate").value = today();

$("photoInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $("foundMsg").textContent = "Preparing photo…";
  try {
    state.photo = await compressImage(file);
    $("photoPreview").src = state.photo;
    $("photoPreview").classList.remove("hidden");
    $("photoEmpty").classList.add("hidden");
    $("foundMsg").textContent = "";
  } catch {
    $("foundMsg").textContent = "";
    toast("That photo couldn't be read. Try a JPG or PNG.");
  }
});

$("foundForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = (id) => $(id).value.trim();
  const msg = $("foundMsg");
  const location_ = readLocation("location", "locationOther");
  if (!v("title") || !v("category") || !location_ || !v("foundDate") || !v("keptAt")) {
    msg.textContent = "Please fill in the fields marked *.";
    return;
  }
  if (!state.user) { msg.textContent = "Please sign in first."; return; }

  const btn = $("foundSubmit");
  btn.disabled = true;
  msg.textContent = "Saving…";
  try {
    const hide = $("hidePhoto").checked && !!state.photo;
    const ref = doc(collection(db, "items"));
    const item = {
      title: v("title"),
      category: v("category"),
      location: location_,
      foundDate: v("foundDate"),
      keptAt: v("keptAt"),
      description: v("description"),
      photo: hide ? await tinyPreview(state.photo) : state.photo,
      photoHidden: hide,
      status: "available",
      postedBy: state.user.uid,
      createdAt: serverTimestamp(),
    };
    if (hide) {
      await withTimeout(setDoc(doc(db, "privatePhotos", ref.id), { photo: state.photo, postedBy: state.user.uid, allowed: [] }));
    }
    await withTimeout(setDoc(ref, item));

    // "Saved!" screen
    state.lastUploaded = { id: ref.id, ...item };
    $("successItem").innerHTML = `${thumb(item)}<div><strong>${esc(item.title)}</strong><span>${esc(item.location)} · kept at ${esc(item.keptAt)}</span></div>`;
    $("shareUploaded").href = waShareLink(state.lastUploaded);
    $("foundForm").reset();
    $("foundDate").value = today();
    $("locationOther").classList.add("hidden");
    state.photo = null;
    $("photoPreview").classList.add("hidden");
    $("photoEmpty").classList.remove("hidden");
    msg.textContent = "";
    $("foundSuccess").classList.remove("hidden");
    renderGates();
    window.scrollTo(0, 0);
  } catch (err) {
    msg.textContent = friendlyError(err);
  } finally {
    btn.disabled = false;
  }
});
$("uploadAnother").addEventListener("click", () => { $("foundSuccess").classList.add("hidden"); renderGates(); window.scrollTo(0, 0); });
$("viewUploaded").addEventListener("click", () => {
  const id = state.lastUploaded?.id;
  $("foundSuccess").classList.add("hidden");
  location.hash = id ? "item-" + id : "lost";
});

// ---------- Report lost ----------
$("lostForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = (id) => $(id).value.trim();
  const msg = $("lostMsg");
  if (!v("lTitle") || !v("lCategory") || !v("lDate")) { msg.textContent = "Please fill in the fields marked *."; return; }
  if (!state.user) { msg.textContent = "Please sign in first."; return; }
  const btn = $("lostSubmit");
  btn.disabled = true;
  msg.textContent = "Saving…";
  try {
    await withTimeout(addDoc(collection(db, "lostReports"), {
      uid: state.user.uid,
      title: v("lTitle"),
      category: v("lCategory"),
      lostDate: v("lDate"),
      location: readLocation("lLocation", "lLocationOther"),
      description: v("lDescription"),
      status: "open",
      createdAt: serverTimestamp(),
    }));
    $("lostForm").reset();
    $("lDate").value = today();
    $("lLocationOther").classList.add("hidden");
    msg.textContent = "";
    toast("Saved! We'll flag it under My stuff when a matching item is uploaded.");
    location.hash = "mine";
  } catch (err) {
    msg.textContent = friendlyError(err);
  } finally {
    btn.disabled = false;
  }
});

// ---------- My stuff ----------
function renderMine() {
  if (!state.user) {
    const gate = `<div class="signin-gate"><p>Sign in to see your lost reports and claims.</p><button class="btn btn-dark" data-signin>Sign in with Google</button></div>`;
    $("myReportsList").innerHTML = gate;
    $("myClaimsList").innerHTML = "";
    return;
  }

  // Lost reports with possible matches
  const reports = [...state.myReports].sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
  $("myReportsList").innerHTML = reports.length ? reports.map((r) => {
    const matches = findMatches(r);
    return `
      <div class="row-card" style="grid-template-columns:1fr">
        <div>
          <div class="row-top"><h3>${esc(r.title)}</h3><span class="badge ${esc(r.status)}">${r.status === "open" ? "Still looking" : "Closed"}</span></div>
          <p class="muted small" style="margin:0">${esc(r.category)} · lost ${formatDate(r.lostDate)}${r.location ? " · " + esc(r.location) : ""}</p>
          ${r.status === "open" ? (matches.length ? `
            <div class="matches"><strong>🔔 ${matches.length} possible match${matches.length > 1 ? "es" : ""}. Is one of these yours?</strong>
              ${matches.map((it) => `
                <button class="mini-row" data-open="${esc(it.id)}">${thumb(it)}
                  <div><strong>${esc(it.title)}</strong><span>${esc(it.location)} · ${formatDate(it.foundDate)} · ${STATUS[it.status]}</span></div>
                </button>`).join("")}
            </div>` : `<p class="small muted" style="margin:10px 0 0">No matches yet. We'll show them here when someone uploads a similar item.</p>`) : ""}
          <div class="actions" style="margin-top:12px">
            ${r.status === "open"
              ? `<button class="btn btn-outline btn-sm" data-report-close="${esc(r.id)}">I found it / close</button>`
              : `<button class="btn btn-outline btn-sm" data-report-reopen="${esc(r.id)}">Reopen</button>`}
            <button class="btn btn-red btn-sm" data-report-delete="${esc(r.id)}">Delete</button>
          </div>
        </div>
      </div>`;
  }).join("") : `<div class="empty">You haven't reported anything lost.<br><a class="btn btn-primary" href="#report-lost">Report a lost item</a></div>`;

  // Claims
  if (!state.myClaims.length) {
    $("myClaimsList").innerHTML = `<div class="empty">You haven't claimed anything yet.<br><a class="btn btn-primary" href="#lost">Browse found items</a></div>`;
    return;
  }
  const sorted = [...state.myClaims].sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
  $("myClaimsList").innerHTML = sorted.map((c) => {
    const it = state.items.find((i) => i.id === c.itemId);
    const wa = waSecurityLink(c, it);
    return `
      <div class="row-card">
        ${thumb(it)}
        <div>
          <div class="row-top"><h3>${esc(it?.title || c.itemTitle)}</h3><span class="badge ${esc(c.status)}">${CLAIM_STATUS[c.status] || "Under review"}</span></div>
          <p class="muted small" style="margin:0">Submitted ${formatDate(c.createdAt)}</p>
          ${c.status === "approved" ? `
            <div class="pickup-code">
              <div><strong>Your pickup code</strong><br><span class="small muted">Show this and your student ID at ${esc(it?.keptAt || "the collection point")}</span></div>
              <b>${esc(c.pickupCode)}</b>
            </div>
            ${wa ? `<div class="actions" style="margin-top:10px"><a class="btn btn-sm wa-btn" href="${esc(wa)}" target="_blank" rel="noopener">${WA_ICON} Message security</a></div>` : ""}` : ""}
          ${c.status === "collected" ? `<p class="notice ok small" style="margin-top:10px">Collected. Glad you got it back!</p>` : ""}
          ${c.status === "rejected" ? `<p class="small muted" style="margin:8px 0 0">Your proof didn't match. If you think this is a mistake, visit the collection point in person.</p>` : ""}
        </div>
      </div>`;
  }).join("");
}

$("myReportsList").addEventListener("click", async (e) => {
  const close = e.target.closest("[data-report-close]");
  const reopen = e.target.closest("[data-report-reopen]");
  const del = e.target.closest("[data-report-delete]");
  try {
    if (close) await updateDoc(doc(db, "lostReports", close.dataset.reportClose), { status: "closed" });
    if (reopen) await updateDoc(doc(db, "lostReports", reopen.dataset.reportReopen), { status: "open" });
    if (del) {
      if (del.dataset.sure !== "1") { del.dataset.sure = "1"; del.textContent = "Tap again to delete"; return; }
      await deleteDoc(doc(db, "lostReports", del.dataset.reportDelete));
      toast("Lost report deleted");
    }
  } catch (err) { toast(friendlyError(err)); }
});


// ---------- Start ----------
$("year").textContent = new Date().getFullYear();
showPage();