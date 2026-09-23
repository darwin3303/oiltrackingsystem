const $ = id => document.getElementById(id);

function toDDMMYYYY(iso){
  if(!iso) return "—";
  // Postgres DATE columns come back from the API as a full ISO timestamp
  // (e.g. "2026-09-23T00:00:00.000Z"), so strip any time part first.
  const datePart = String(iso).split("T")[0];
  const [y,m,d] = datePart.split("-");
  if(!y || !m || !d) return "—";
  return `${d}-${m}-${y}`;
}

// ---------- Theme toggle ----------
function applyTheme(theme){
  document.documentElement.setAttribute("data-theme", theme);
  $("themeToggle").textContent = theme === "dark" ? "☀️" : "🌙";
  localStorage.setItem("oilTrackerTheme", theme);
}
(function initTheme(){
  const saved = localStorage.getItem("oilTrackerTheme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (prefersDark ? "dark" : "light"));
})();
$("themeToggle").addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "dark" ? "light" : "dark");
});

// ---------- PWA: service worker + install prompt ----------
if("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  $("installBtn").classList.remove("hidden");
});
$("installBtn").addEventListener("click", async () => {
  if(!deferredInstallPrompt) return;
  $("installBtn").classList.add("hidden");
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
});
window.addEventListener("appinstalled", () => {
  $("installBtn").classList.add("hidden");
  deferredInstallPrompt = null;
});

// ---------- Connection status ----------
async function checkStatus(){
  const pill = $("statusPill");
  try{
    const res = await fetch("/api/health");
    if(res.ok){
      pill.textContent = "● Connected";
      pill.className = "status-pill status-ok";
    } else {
      pill.textContent = "● Database error";
      pill.className = "status-pill status-error";
    }
  }catch(e){
    pill.textContent = "● Backend unreachable";
    pill.className = "status-pill status-error";
  }
}
checkStatus();
setInterval(checkStatus, 30000);

// ---------- Tabs ----------
function showTab(tab){
  $("panelEntry").classList.toggle("hidden", tab !== "entry");
  $("panelRecords").classList.toggle("hidden", tab !== "records");
  $("panelReminders").classList.toggle("hidden", tab !== "reminders");
  $("panelSettings").classList.toggle("hidden", tab !== "settings");
  $("tabBtnEntry").classList.toggle("active", tab === "entry");
  $("tabBtnRecords").classList.toggle("active", tab === "records");
  $("tabBtnReminders").classList.toggle("active", tab === "reminders");
  $("tabBtnSettings").classList.toggle("active", tab === "settings");
  if(tab === "records") refreshRecords();
  if(tab === "reminders") refreshReminders();
  if(tab === "settings") refreshSummary();
}
$("tabBtnEntry").addEventListener("click", () => showTab("entry"));
$("tabBtnRecords").addEventListener("click", () => showTab("records"));
$("tabBtnReminders").addEventListener("click", () => showTab("reminders"));
$("tabBtnSettings").addEventListener("click", () => showTab("settings"));

// ---------- Next service preview ----------
function addMonths(iso, months){
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0,10);
}
function updatePreview(){
  const sd = $("serviceDate").value;
  const odo = parseFloat($("odometer").value);
  if(!sd || isNaN(odo)){
    $("nextDateValue").textContent = "—";
    $("nextOdoValue").textContent = "—";
    return;
  }
  const nextDate = addMonths(sd, 6);
  const nextOdo = odo + 5000;
  $("nextDateValue").textContent = toDDMMYYYY(nextDate);
  $("nextOdoValue").textContent = `${nextOdo.toLocaleString()} km`;
}
$("serviceDate").addEventListener("input", updatePreview);
$("odometer").addEventListener("input", updatePreview);

// ---------- Lookup lists (oil grades, technicians, vehicle makes) ----------
async function loadList(endpoint){
  const res = await fetch(`/api/${endpoint}`);
  if(!res.ok) throw new Error("failed to load " + endpoint);
  return res.json();
}
function fillSelect(sel, items, emptyLabel){
  const current = sel.value;
  if(items.length === 0){
    sel.innerHTML = `<option value="">${emptyLabel}</option>`;
    return;
  }
  sel.innerHTML = items.map(i => `<option value="${i.name}">${i.name}</option>`).join("");
  if(items.some(i => i.name === current)) sel.value = current;
}
function renderItemList(ul, items, endpoint, emptyText){
  if(items.length === 0){
    ul.innerHTML = `<li class="empty" style="border:none;background:none;">${emptyText}</li>`;
    return;
  }
  ul.innerHTML = items.map(i => `
    <li>
      <span>${i.name}</span>
      <button data-id="${i.id}" data-endpoint="${endpoint}" class="delItem">Remove</button>
    </li>`).join("");
}

async function refreshGrades(){
  const grades = await loadList("oil_grades");
  fillSelect($("oilGrade"), grades, "Add a grade in Settings first");
  renderItemList($("gradeList"), grades, "oil_grades", "No oil grades added yet.");
}
async function refreshTechnicians(){
  const technicians = await loadList("technicians");
  fillSelect($("technician"), technicians, "Add a technician in Settings first");
  renderItemList($("technicianList"), technicians, "technicians", "No technicians added yet.");
}
async function refreshMakes(){
  const makes = await loadList("vehicle_makes");
  fillSelect($("vehicleMake"), makes, "Add a make in Settings first");
  renderItemList($("makeList"), makes, "vehicle_makes", "No vehicle makes added yet.");
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".delItem");
  if(!btn) return;
  await fetch(`/api/${btn.dataset.endpoint}/${btn.dataset.id}`, { method: "DELETE" });
  await Promise.all([refreshGrades(), refreshTechnicians(), refreshMakes()]);
});

function wireAdd(btnId, inputId, endpoint, refreshFn){
  $(btnId).addEventListener("click", async () => {
    const val = $(inputId).value.trim();
    if(!val) return;
    await fetch(`/api/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: val }),
    });
    $(inputId).value = "";
    await refreshFn();
  });
}
wireAdd("addGradeBtn", "newGrade", "oil_grades", refreshGrades);
wireAdd("addTechnicianBtn", "newTechnician", "technicians", refreshTechnicians);
wireAdd("addMakeBtn", "newMake", "vehicle_makes", refreshMakes);

// ---------- Service records (Records tab) ----------
async function loadRecords(search){
  const url = search ? `/api/records?search=${encodeURIComponent(search)}` : "/api/records";
  const res = await fetch(url);
  if(!res.ok) throw new Error("failed to load records");
  return res.json();
}

function renderRecords(records){
  const body = $("recordsBody");
  if(records.length === 0){
    body.innerHTML = `<tr><td colspan="13" class="empty">No matching service records.</td></tr>`;
    return;
  }
  body.innerHTML = records.map(r => {
    const comps = [];
    if(r.comp_oil_filter) comps.push("Oil Filter");
    if(r.comp_cabin_filter) comps.push("Cabin Filter");
    if(r.comp_engine_filter) comps.push("Engine Filter");
    const compHtml = comps.length ? comps.map(c=>`<span class="tag">${c}</span>`).join("") : "—";
    const vehicle = [r.vehicle_make, r.vehicle_model].filter(Boolean).join(" ") || "—";
    return `<tr>
      <td>${r.plate||""}</td>
      <td>${r.customer_name||""}</td>
      <td>${r.customer_phone||"—"}</td>
      <td>${vehicle}</td>
      <td>${toDDMMYYYY(r.service_date)}</td>
      <td>${(r.odometer||0).toLocaleString()} km</td>
      <td>${r.oil_grade||""}</td>
      <td>${r.oil_qty ?? ""}</td>
      <td>${r.technician||""}</td>
      <td>${compHtml}</td>
      <td>${toDDMMYYYY(r.next_service_date)}</td>
      <td>${(r.next_odometer||0).toLocaleString()} km</td>
      <td class="row-actions"><button data-id="${r.id}" class="delRecord">Delete</button></td>
    </tr>`;
  }).join("");
  body.querySelectorAll(".delRecord").forEach(btn => {
    btn.addEventListener("click", async () => {
      await fetch(`/api/records/${btn.dataset.id}`, { method: "DELETE" });
      await refreshRecords();
      await refreshSummary();
      await refreshReminders();
    });
  });
}

async function refreshRecords(){
  const search = $("recordsSearch").value.trim();
  const records = await loadRecords(search);
  renderRecords(records);
}

let searchDebounce;
$("recordsSearch").addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(refreshRecords, 250);
});

// ---------- Usage summary (Settings tab) ----------
function renderSummary(entries){
  const box = $("summaryBars");
  if(!entries || entries.length === 0){
    box.innerHTML = `<p class="empty">No oil grade data yet.</p>`;
    return;
  }
  const max = Math.max(...entries.map(e => Number(e.count)));
  box.innerHTML = entries.map(e => `
    <div class="bar-row">
      <span>${e.name}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(Number(e.count)/max*100).toFixed(0)}%"></div></div>
      <span>${e.count}</span>
    </div>`).join("");
}

async function refreshSummary(){
  const summary = await fetch("/api/summary/oil-grades").then(r => r.json());
  renderSummary(summary);
}

// ---------- Reminders ----------
function daysBetween(iso){
  const today = new Date();
  today.setHours(0,0,0,0);
  const datePart = String(iso).split("T")[0];
  const target = new Date(datePart + "T00:00:00");
  return Math.round((target - today) / 86400000);
}

function renderReminders(records){
  const body = $("remindersBody");
  const badge = $("reminderCount");
  if(records.length === 0){
    body.innerHTML = `<tr><td colspan="7" class="empty">No vehicles due soon — nothing within 7 days or overdue.</td></tr>`;
    badge.classList.add("hidden");
    return;
  }
  badge.textContent = records.length;
  badge.classList.remove("hidden");
  body.innerHTML = records.map(r => {
    const vehicle = [r.vehicle_make, r.vehicle_model].filter(Boolean).join(" ") || "—";
    const d = daysBetween(r.next_service_date);
    const status = d < 0
      ? `<span class="badge-overdue">${Math.abs(d)} day${Math.abs(d)===1?"":"s"} overdue</span>`
      : `<span class="badge-soon">Due in ${d} day${d===1?"":"s"}</span>`;
    return `<tr>
      <td>${r.plate||""}</td>
      <td>${r.customer_name||""}</td>
      <td>${r.customer_phone||"—"}</td>
      <td>${vehicle}</td>
      <td>${toDDMMYYYY(r.next_service_date)}</td>
      <td>${(r.next_odometer||0).toLocaleString()} km</td>
      <td>${status}</td>
    </tr>`;
  }).join("");
}

async function refreshReminders(){
  try{
    const res = await fetch("/api/reminders");
    const records = await res.json();
    renderReminders(records);
  }catch(e){
    $("remindersBody").innerHTML = `<tr><td colspan="7" class="empty">Could not load reminders.</td></tr>`;
  }
}

// ---------- Save new record ----------
$("saveBtn").addEventListener("click", async () => {
  const plate = $("plate").value.trim();
  const serviceDate = $("serviceDate").value;
  const odometer = parseFloat($("odometer").value);

  if(!plate || !serviceDate || isNaN(odometer)){
    $("saveStatus").textContent = "Please fill in plate, service date and odometer at minimum.";
    return;
  }

  const payload = {
    plate,
    customer_name: $("customerName").value.trim(),
    customer_phone: $("customerPhone").value.trim(),
    vehicle_make: $("vehicleMake").value,
    vehicle_model: $("vehicleModel").value.trim(),
    service_date: serviceDate,
    odometer,
    oil_grade: $("oilGrade").value,
    oil_qty: $("oilQty").value ? parseFloat($("oilQty").value) : null,
    technician: $("technician").value,
    comp_oil_filter: $("compOilFilter").checked,
    comp_cabin_filter: $("compCabinFilter").checked,
    comp_engine_filter: $("compEngineFilter").checked,
  };

  $("saveStatus").textContent = "Saving…";
  try{
    const res = await fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if(!res.ok) throw new Error("save failed");
    $("saveStatus").textContent = "Saved.";
    ["plate","customerName","customerPhone","vehicleModel","serviceDate","odometer","oilQty"].forEach(id => $(id).value = "");
    $("compOilFilter").checked = false;
    $("compCabinFilter").checked = false;
    $("compEngineFilter").checked = false;
    updatePreview();
    await refreshRecords();
    await refreshSummary();
    await refreshReminders();
    setTimeout(() => $("saveStatus").textContent = "", 2500);
  }catch(e){
    $("saveStatus").textContent = "Could not save — please try again.";
  }
});

// ---------- Init ----------
(async function init(){
  try{
    await Promise.all([refreshGrades(), refreshTechnicians(), refreshMakes()]);
    await refreshRecords();
    await refreshSummary();
    await refreshReminders();
  }catch(e){
    $("recordsBody").innerHTML = `<tr><td colspan="13" class="empty">Could not load data from the server.</td></tr>`;
  }
})();
