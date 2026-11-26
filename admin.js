// =========================================================
// Campus Lost & Found — ADMIN dashboard (admin.html)
// Not linked from the student website. Only people in the Firestore
// "admins" collection can see anything (the database rules enforce it).
// =========================================================
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, doc, getDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  $, BOX_ICON, CLAIM_STATUS, DAY, OPEN_STATUSES, PIN_ICON, SETTINGS, STATUS, WA_ICON, allowed, app, auth, authMessage, closeAuth, compressImage, daysSince, db, emailAllowed, esc, firebaseConfig, formatDate, friendlyError, googleSignIn, isDataImage, isLongUnclaimed, itemLink, millis, needsVerification, optionList, revealScan, setAuthMode, setupBanner, signIn, sixDigitCode, thumb, tinyPreview, toast, waSecurityLink, waShareLink, withTimeout
} from "./core.js";

// ---------- State ----------
const state = {
  user: null,
  isAdmin: false,
  items: [],
  allClaims: [],
  reports: [],
  allLostReports: [],
  allUsers: [],
  adminTab: "overview",
  userSearch: "",
};
let unsubs = [];

// ---------- Which screen to show ----------
function showScreen(name) {
  ["adminLoading", "adminSignedOut", "adminDenied", "adminMain"].forEach((id) => $(id).classList.toggle("hidden", id !== name));
}

$("signOutBtn").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (user && !emailAllowed(user.email)) {
    toast(`Please sign in with your school email (${allowed.map((d) => "@" + d).join(" or ")}).`);
    await signOut(auth);
    return;
  }
  if (needsVerification(user)) user = null;
  if (user) closeAuth();

  unsubs.forEach((u) => u()); unsubs = [];
  Object.assign(state, { user, isAdmin: false, items: [], allClaims: [], reports: [], allLostReports: [], allUsers: [] });

  $("signInBtn").classList.toggle("hidden", !!user);
  $("userBox").classList.toggle("hidden", !user);
  if (!user) { showScreen("adminSignedOut"); return; }

  $("userName").textContent = user.displayName?.split(" ")[0] || user.email?.split("@")[0] || "Account";
  $("userPhoto").src = user.photoURL || "";
  $("userPhoto").classList.toggle("hidden", !user.photoURL);

  showScreen("adminLoading");
  try { state.isAdmin = (await getDoc(doc(db, "admins", user.uid))).exists(); } catch { state.isAdmin = false; }
  if (!state.isAdmin) {
    $("deniedEmail").textContent = user.email || "";
    $("deniedUid").textContent = user.uid;
    showScreen("adminDenied");
    return;
  }

  showScreen("adminMain");
  const listen = (q, key) => unsubs.push(onSnapshot(q,
    (snap) => {
      state[key] = snap.docs.map((d) => ({ id: d.id, ...d.data(), ...(key === "items" ? { category: d.data().category || "Other" } : {}) }));
      renderAdmin();
    },
    (err) => { console.error(key, err); toast(friendlyError(err)); }));
  listen(query(collection(db, "items"), orderBy("createdAt", "desc")), "items");
  listen(query(collection(db, "claims"), orderBy("createdAt", "desc")), "allClaims");
  listen(collection(db, "reports"), "reports");
  listen(collection(db, "lostReports"), "allLostReports");
  listen(collection(db, "users"), "allUsers");
  renderAdmin();
});

$("copyUid").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("deniedUid").textContent); toast("User ID copied"); } catch { toast("Select the ID and copy it"); }
});

// ---------- Item details window (admin view) ----------
function viewItem(id) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  const claims = state.allClaims.filter((c) => c.itemId === id);
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
        <div><span>Kept at</span><strong>${esc(it.keptAt)}</strong></div>
      </div>
      <p class="small muted" style="margin:0">${esc(it.category)} · uploaded ${formatDate(it.createdAt)} by ${esc(state.allUsers.find((u) => u.uid === it.postedBy)?.name || "unknown")}${it.returnedTo ? ` · returned to ${esc(it.returnedTo)}` : ""}</p>
      ${claims.length ? `<div class="notice small"><b>${claims.length} claim${claims.length > 1 ? "s" : ""}:</b> ${claims.map((c) => `${esc(c.name)} (${CLAIM_STATUS[c.status] || c.status})`).join(", ")}</div>` : ""}
      <div class="actions">
        ${it.status !== "returned"
          ? `<button class="btn btn-outline btn-sm" data-act="returned">Mark as returned</button>`
          : `<button class="btn btn-outline btn-sm" data-act="available">Mark as not returned</button>`}
        <button class="btn btn-red btn-sm" data-act="delete">Delete item</button>
      </div>
    </div>`;
  $("modal").classList.remove("hidden");
  $("modal").dataset.id = id;
  document.body.style.overflow = "hidden";
  if (it.photoHidden) {
    getDoc(doc(db, "privatePhotos", it.id)).then((snap) => {
      const p = snap.data()?.photo;
      if (isDataImage(p) && $("modal").dataset.id === id) $("modalMedia").innerHTML = thumb({ photo: p }, "modal-media");
    }).catch(() => {});
  }
}
function closeModal() {
  $("modal").classList.add("hidden");
  document.body.style.overflow = "";
}
document.addEventListener("click", (e) => {
  const v = e.target.closest("[data-view]");
  if (v) viewItem(v.dataset.view);
});
$("modal").addEventListener("click", async (e) => {
  if (e.target === $("modal") || e.target.closest("[data-close]")) return closeModal();
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const id = $("modal").dataset.id;
  try {
    if (btn.dataset.act === "delete") {
      if (btn.dataset.sure !== "1") { btn.dataset.sure = "1"; btn.textContent = "Tap again to delete"; return; }
      await deleteItem(id);
      toast("Item deleted");
    } else {
      await updateDoc(doc(db, "items", id), { status: btn.dataset.act });
      toast(btn.dataset.act === "returned" ? "Marked as returned" : "Item is listed again");
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
  state.reports.filter((r) => r.itemId === id).forEach((r) => deleteDoc(doc(db, "reports", r.id)).catch(() => {}));
}

// ---------- Admin ----------
$("adminTabs").addEventListener("click", (e) => {
  const tab = e.target.closest("[data-admin-tab]");
  if (!tab) return;
  state.adminTab = tab.dataset.adminTab;
  document.querySelectorAll("#adminTabs .tab").forEach((t) => t.classList.toggle("active", t === tab));
  renderAdmin();
});

function renderAdmin() {
  if (!state.isAdmin) return;
  const pending = state.allClaims.filter((c) => c.status === "pending");
  const approved = state.allClaims.filter((c) => c.status === "approved");
  const reportsByItem = {};
  state.reports.forEach((r) => (reportsByItem[r.itemId] ??= []).push(r));
  const old = state.items.filter(isLongUnclaimed).sort((a, b) => millis(a.createdAt) - millis(b.createdAt));

  const setCount = (id, n) => { $(id).textContent = n ? n : ""; };
  setCount("cntClaims", pending.length);
  setCount("cntPickup", approved.length);
  setCount("cntReports", Object.keys(reportsByItem).length);
  setCount("cntOld", old.length);
  const todo = pending.length + Object.keys(reportsByItem).length;
  document.title = (todo ? `(${todo}) ` : "") + "Admin · Campus Lost & Found";
  const panel = $("adminPanel");
  const tab = state.adminTab;
  if (tab === "overview") panel.innerHTML = adminOverview(pending, approved, reportsByItem, old);
  if (tab === "claims") panel.innerHTML = adminClaims(pending);
  if (tab === "pickup") panel.innerHTML = adminPickup(approved);
  if (tab === "reports") panel.innerHTML = adminReports(reportsByItem);
  if (tab === "old") panel.innerHTML = adminOld(old);
  if (tab === "users") {
    if (!$("userSearch")) {
      panel.innerHTML = `
        <div class="users-tools">
          <div class="search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg>
            <input id="userSearch" type="search" placeholder="Search name, matric, department, email…" aria-label="Search students">
          </div>
          <button class="btn btn-outline btn-sm" data-users-csv>Download CSV (Excel)</button>
        </div>
        <p class="muted small" id="userCount"></p>
        <div id="usersList"></div>`;
      $("userSearch").value = state.userSearch;
      $("userSearch").addEventListener("input", (e) => { state.userSearch = e.target.value.trim().toLowerCase(); renderUsersList(); });
    }
    renderUsersList();
  }
}

function filteredUsers() {
  const q = state.userSearch;
  return [...state.allUsers]
    .sort((a, b) => millis(b.createdAt) - millis(a.createdAt))
    .filter((u) => !q || [u.name, u.matric, u.department, u.email, u.phone, u.level].join(" ").toLowerCase().includes(q));
}

function renderUsersList() {
  const list = filteredUsers();
  $("userCount").textContent = `${list.length} of ${state.allUsers.length} people`;
  if (!state.allUsers.length) { $("usersList").innerHTML = `<div class="empty">Nobody has signed in yet.</div>`; return; }
  if (!list.length) { $("usersList").innerHTML = `<div class="empty">No one matches that search.</div>`; return; }
  $("usersList").innerHTML = `
    <div class="table-wrap"><table class="users-table">
      <thead><tr><th>Name</th><th>Matric / staff no.</th><th>Department · level</th><th>Phone</th><th>Joined</th><th>Last sign-in</th><th>Posted</th><th>Claims</th></tr></thead>
      <tbody>${list.map((u) => `
        <tr>
          <td><b>${esc(u.name || "(no name yet)")}</b><span class="sub">${esc(u.email)} · ${esc(u.provider || "")}</span></td>
          <td data-l="Matric">${esc(u.matric || "—")}</td>
          <td data-l="Department">${esc(u.department || "—")}${u.level ? `<span class="sub">${esc(u.level)}</span>` : ""}</td>
          <td data-l="Phone">${esc(u.phone || "—")}</td>
          <td data-l="Joined">${u.createdAt ? formatDate(u.createdAt) : "—"}</td>
          <td data-l="Last sign-in">${u.lastLoginAt ? formatDate(u.lastLoginAt) : "—"}</td>
          <td class="num" data-l="Items posted">${state.items.filter((i) => i.postedBy === u.uid).length}</td>
          <td class="num" data-l="Claims">${state.allClaims.filter((c) => c.claimantUid === u.uid).length}</td>
        </tr>`).join("")}</tbody>
    </table></div>`;
}

function downloadUsersCsv() {
  const cell = (v) => {
    let t = String(v ?? "");
    if (/^[=+\-@]/.test(t)) t = "'" + t;          // stop Excel treating text as a formula
    return `"${t.replace(/"/g, '""')}"`;
  };
  const date = (ts) => (ts ? new Date(millis(ts)).toISOString().slice(0, 10) : "");
  const rows = [["Name", "Email", "Sign-in method", "Matric / staff no.", "Department", "Level", "Phone", "Joined", "Last sign-in", "Items posted", "Claims"]];
  filteredUsers().forEach((u) => rows.push([
    u.name, u.email, u.provider, u.matric, u.department, u.level, u.phone, date(u.createdAt), date(u.lastLoginAt),
    state.items.filter((i) => i.postedBy === u.uid).length, state.allClaims.filter((c) => c.claimantUid === u.uid).length,
  ]));
  const csv = "\ufeff" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `students-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function adminOverview(pending, approved, reportsByItem, old) {
  const live = state.items.filter((i) => i.status !== "archived");
  const weekAgo = Date.now() - 7 * DAY;
  const thisWeek = state.items.filter((i) => millis(i.createdAt) >= weekAgo).length;
  const returnedWeek = state.items.filter((i) => i.status === "returned" && millis(i.returnedAt) >= weekAgo).length;
  const waiting = live.filter((i) => OPEN_STATUSES.includes(i.status));
  const returned = live.filter((i) => i.status === "returned").length;
  const rate = live.length ? Math.round((returned / live.length) * 100) : 0;
  const openLost = state.allLostReports.filter((r) => r.status === "open").length;
  const oldest = [...waiting].sort((a, b) => millis(a.createdAt) - millis(b.createdAt)).slice(0, 5);
  const byCat = {};
  waiting.forEach((i) => { byCat[i.category] = (byCat[i.category] || 0) + 1; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCat = Math.max(1, ...cats.map((c) => c[1]));

  return `
    <div class="kpis">
      <div class="kpi"><strong>${thisWeek}</strong><span>Items reported this week</span></div>
      <div class="kpi"><strong>${returnedWeek}</strong><span>Returned this week</span></div>
      <div class="kpi"><strong>${waiting.length}</strong><span>Waiting for owners</span></div>
      <div class="kpi"><strong>${rate}%</strong><span>Return rate (all time)</span><div class="bar"><i style="width:${rate}%"></i></div></div>
      <div class="kpi ${pending.length ? "alert" : ""}"><strong>${pending.length}</strong><span>Claims to review</span></div>
      <div class="kpi"><strong>${approved.length}</strong><span>Awaiting pickup</span></div>
      <div class="kpi ${Object.keys(reportsByItem).length ? "alert" : ""}"><strong>${Object.keys(reportsByItem).length}</strong><span>Reported posts</span></div>
      <div class="kpi"><strong>${openLost}</strong><span>Open lost reports</span></div>
    </div>
    <div class="admin-grid">
      <div class="panel">
        <h3>Oldest unclaimed items</h3>
        ${oldest.length ? oldest.map((it) => `
          <button class="mini-row" data-view="${esc(it.id)}">${thumb(it)}
            <div><strong>${esc(it.title)}</strong><span>${daysSince(it.createdAt)} days · ${esc(it.keptAt)}</span></div>
          </button>`).join("") : `<p class="muted small">Nothing waiting. 🎉</p>`}
      </div>
      <div class="panel">
        <h3>Waiting items by category</h3>
        ${cats.length ? cats.map(([c, n]) => `
          <div style="margin-bottom:10px"><div class="row-top"><span class="small">${esc(c)}</span><b class="small">${n}</b></div>
          <div class="bar" style="margin-top:4px"><i style="width:${(n / maxCat) * 100}%;background:var(--accent)"></i></div></div>`).join("")
          : `<p class="muted small">No items waiting.</p>`}
        ${old.length ? `<p class="small" style="margin-top:14px"><b>${old.length}</b> item${old.length > 1 ? "s have" : " has"} been unclaimed for over ${SETTINGS.longUnclaimedDays} days. See <b>Long unclaimed</b>.</p>` : ""}
      </div>
    </div>`;
}

function adminClaims(pending) {
  const byItem = {};
  pending.forEach((c) => (byItem[c.itemId] ??= []).push(c));
  const ids = Object.keys(byItem);
  if (!ids.length) return `<div class="empty">No claims waiting for review. 🎉</div>`;
  return `<div class="list">${ids.map((itemId) => {
    const it = state.items.find((i) => i.id === itemId);
    return `
      <div class="row-card">
        ${thumb(it)}
        <div>
          <div class="row-top"><h3>${esc(it?.title || byItem[itemId][0].itemTitle)}</h3>${it ? `<span class="badge ${esc(it.status)}">${STATUS[it.status]}</span>` : ""}</div>
          ${it ? `<p class="muted small" style="margin:0">${esc(it.category)} · found at ${esc(it.location)} · kept at ${esc(it.keptAt)}</p>
                  ${it.description ? `<p class="small" style="margin:6px 0 0">${esc(it.description)}</p>` : ""}` : `<p class="muted small">This item was deleted.</p>`}
          ${byItem[itemId].map((c) => `
            <div class="claim">
              <div><b>${esc(c.name)}</b> <span class="muted small">· ID ${esc(c.studentId)} · ${esc(c.contact)} · ${formatDate(c.createdAt)}</span></div>
              <div class="proof"><b>Proof:</b> ${esc(c.proof)}</div>
              ${isDataImage(c.proofPhoto) ? `<img src="${esc(c.proofPhoto)}" alt="Proof photo">` : ""}
              <div class="actions">
                <button class="btn btn-green btn-sm" data-approve="${esc(c.id)}">Approve &amp; send pickup code</button>
                <button class="btn btn-red btn-sm" data-reject="${esc(c.id)}">Reject</button>
              </div>
            </div>`).join("")}
          ${it ? `<div class="actions" style="margin-top:12px"><button class="btn btn-outline btn-sm" data-view="${esc(it.id)}">Open item</button></div>` : ""}
        </div>
      </div>`;
  }).join("")}</div>`;
}

function adminPickup(approved) {
  if (!approved.length) return `<div class="empty">No items waiting to be collected.</div>`;
  return `<p class="muted">When the student comes to collect, ask for their 6-digit pickup code and student ID, then type the code here.</p>
    <div class="list">${approved.map((c) => {
      const it = state.items.find((i) => i.id === c.itemId);
      return `
        <div class="row-card">
          ${thumb(it)}
          <div>
            <div class="row-top"><h3>${esc(it?.title || c.itemTitle)}</h3><span class="badge ready">Ready for pickup</span></div>
            <p class="muted small" style="margin:0">For <b>${esc(c.name)}</b> · ID ${esc(c.studentId)} · ${esc(c.contact)} · kept at ${esc(it?.keptAt || "")}</p>
            <div class="code-input" style="margin-top:12px">
              <input inputmode="numeric" maxlength="6" placeholder="000000" data-code-for="${esc(c.id)}" aria-label="Pickup code for ${esc(c.name)}">
              <button class="btn btn-green btn-sm" data-handover="${esc(c.id)}">Confirm handover</button>
            </div>
          </div>
        </div>`;
    }).join("")}</div>`;
}

function adminReports(reportsByItem) {
  const ids = Object.keys(reportsByItem);
  if (!ids.length) return `<div class="empty">No reported posts.</div>`;
  return `<div class="list">${ids.map((itemId) => {
    const it = state.items.find((i) => i.id === itemId);
    const reasons = {};
    reportsByItem[itemId].forEach((r) => { reasons[r.reason] = (reasons[r.reason] || 0) + 1; });
    return `
      <div class="row-card">
        ${thumb(it)}
        <div>
          <div class="row-top"><h3>${esc(it?.title || reportsByItem[itemId][0].itemTitle)}</h3><span class="badge rejected">${reportsByItem[itemId].length} report${reportsByItem[itemId].length > 1 ? "s" : ""}</span></div>
          <p class="small" style="margin:0">${Object.entries(reasons).map(([r, n]) => `${esc(r)}${n > 1 ? ` (${n})` : ""}`).join(" · ")}</p>
          <div class="actions" style="margin-top:12px">
            ${it ? `<button class="btn btn-outline btn-sm" data-view="${esc(it.id)}">Open item</button>
                    <button class="btn btn-red btn-sm" data-remove-item="${esc(itemId)}">Delete post</button>` : `<span class="muted small">Item already deleted.</span>`}
            <button class="btn btn-outline btn-sm" data-dismiss="${esc(itemId)}">Dismiss reports</button>
          </div>
        </div>
      </div>`;
  }).join("")}</div>`;
}

function adminOld(old) {
  if (!old.length) return `<div class="empty">No items have been unclaimed for over ${SETTINGS.longUnclaimedDays} days.</div>`;
  return `<p class="muted">Unclaimed for over ${SETTINGS.longUnclaimedDays} days. Archive them once they're donated or disposed of; they'll be hidden from the main list.</p>
    <div class="list">${old.map((it) => `
      <div class="row-card">
        ${thumb(it)}
        <div>
          <div class="row-top"><h3>${esc(it.title)}</h3><span class="badge old">${daysSince(it.createdAt)} days</span></div>
          <p class="muted small" style="margin:0">${esc(it.category)} · found ${formatDate(it.foundDate)} at ${esc(it.location)} · kept at ${esc(it.keptAt)}</p>
          <div class="actions" style="margin-top:12px">
            <button class="btn btn-outline btn-sm" data-view="${esc(it.id)}">Open item</button>
            <button class="btn btn-dark btn-sm" data-archive="${esc(it.id)}">Archive (donated / disposed)</button>
          </div>
        </div>
      </div>`).join("")}</div>`;
}

$("adminPanel").addEventListener("click", async (e) => {
  if (e.target.closest("[data-users-csv]")) { downloadUsersCsv(); return; }
  const get = (attr) => e.target.closest(`[${attr}]`)?.getAttribute(attr);
  const approveId = get("data-approve"), rejectId = get("data-reject"), handoverId = get("data-handover");
  const removeId = get("data-remove-item"), dismissId = get("data-dismiss"), archiveId = get("data-archive");
  try {
    if (approveId) {
      const claim = state.allClaims.find((c) => c.id === approveId);
      const item = state.items.find((i) => i.id === claim.itemId);
      const code = sixDigitCode();
      await updateDoc(doc(db, "claims", claim.id), { status: "approved", pickupCode: code, approvedAt: serverTimestamp() });
      if (item) await updateDoc(doc(db, "items", item.id), { status: "ready", approvedClaimId: claim.id });
      if (item?.photoHidden) await updateDoc(doc(db, "privatePhotos", item.id), { allowed: arrayUnion(claim.claimantUid) }).catch(() => {});
      // Other claims for the same item are rejected
      await Promise.all(state.allClaims
        .filter((c) => c.itemId === claim.itemId && c.id !== claim.id && c.status === "pending")
        .map((c) => updateDoc(doc(db, "claims", c.id), { status: "rejected" })));
      toast(`Approved. ${claim.name} can now see pickup code ${code} on the website under My stuff.`);
    }
    if (rejectId) {
      const claim = state.allClaims.find((c) => c.id === rejectId);
      await updateDoc(doc(db, "claims", claim.id), { status: "rejected" });
      const othersPending = state.allClaims.some((c) => c.itemId === claim.itemId && c.id !== claim.id && c.status === "pending");
      const item = state.items.find((i) => i.id === claim.itemId);
      if (!othersPending && item?.status === "pending") await updateDoc(doc(db, "items", item.id), { status: "available" });
      toast("Claim rejected");
    }
    if (handoverId) {
      const claim = state.allClaims.find((c) => c.id === handoverId);
      const typed = document.querySelector(`[data-code-for="${CSS.escape(handoverId)}"]`).value.replace(/\D/g, "");
      if (typed !== claim.pickupCode) { toast("That code doesn't match. Don't hand over the item."); return; }
      await updateDoc(doc(db, "claims", claim.id), { status: "collected", collectedAt: serverTimestamp() });
      await updateDoc(doc(db, "items", claim.itemId), { status: "returned", returnedTo: claim.name, returnedAt: serverTimestamp() });
      toast(`Code correct ✓ Item handed to ${claim.name}.`);
    }
    if (removeId) {
      const btn = e.target.closest("[data-remove-item]");
      if (btn.dataset.sure !== "1") { btn.dataset.sure = "1"; btn.textContent = "Tap again to delete"; return; }
      await deleteItem(removeId);
      toast("Post deleted");
    }
    if (dismissId) {
      await Promise.all(state.reports.filter((r) => r.itemId === dismissId).map((r) => deleteDoc(doc(db, "reports", r.id))));
      toast("Reports dismissed");
    }
    if (archiveId) {
      await updateDoc(doc(db, "items", archiveId), { status: "archived", archivedAt: serverTimestamp() });
      toast("Item archived");
    }
  } catch (err) { toast(friendlyError(err)); }
});

// ---------- Start ----------
$("year").textContent = new Date().getFullYear();
