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

// Same as toDDMMYYYY but slash-separated, for the WhatsApp message template.
function toDDMMYYYYSlash(iso){
  if(!iso) return "—";
  const datePart = String(iso).split("T")[0];
  const [y,m,d] = datePart.split("-");
  if(!y || !m || !d) return "—";
  return `${d}/${m}/${y}`;
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

// ---------- Returning customer: previous service history for the plate being entered ----------
let plateHistoryDebounce;
async function checkPlateHistory(){
  const plate = $("plate").value.trim();
  const box = $("plateHistoryBox");
  if(!plate){
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  try{
    const res = await fetch(`/api/records/by-plate/${encodeURIComponent(plate)}`);
    const records = await res.json();
    if(!records.length){
      box.classList.add("hidden");
      box.innerHTML = "";
      return;
    }
    // Autofill customer name/phone from the most recent visit — only into
    // fields the user hasn't already typed something into.
    const latest = records[0];
    if(!$("customerName").value.trim() && latest.customer_name) $("customerName").value = latest.customer_name;
    if(!$("customerPhone").value.trim() && latest.customer_phone) $("customerPhone").value = latest.customer_phone;

    box.innerHTML = `<div class="plate-history-title">Returning vehicle — full history below (${records.length} previous service${records.length===1?"":"s"})</div>`
      + renderHistoryCards(records);
    box.classList.remove("hidden");
  }catch(e){
    box.classList.add("hidden");
  }
}
$("plate").addEventListener("input", () => {
  clearTimeout(plateHistoryDebounce);
  plateHistoryDebounce = setTimeout(checkPlateHistory, 400);
});

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
  window.__engineGrades = grades;
  renderItemList($("gradeList"), grades, "oil_grades", "No oil grades added yet.");
  if($("oilType").value === "Engine Oil") fillSelect($("oilGrade"), grades, "Add a grade in Settings first");
}
async function refreshAtfGrades(){
  const grades = await loadList("atf_grades");
  window.__atfGrades = grades;
  renderItemList($("atfGradeList"), grades, "atf_grades", "No ATF grades added yet.");
  if($("oilType").value === "ATF") fillSelect($("oilGrade"), grades, "Add a grade in Settings first");
}
async function refreshCvtGrades(){
  const grades = await loadList("cvt_grades");
  window.__cvtGrades = grades;
  renderItemList($("cvtGradeList"), grades, "cvt_grades", "No CVT fluid grades added yet.");
  if($("oilType").value === "CVT Fluid") fillSelect($("oilGrade"), grades, "Add a grade in Settings first");
}
async function refreshManualGrades(){
  const grades = await loadList("manual_transmission_grades");
  window.__manualGrades = grades;
  renderItemList($("manualGradeList"), grades, "manual_transmission_grades", "No manual transmission grades added yet.");
  if($("oilType").value === "Manual Transmission Oil") fillSelect($("oilGrade"), grades, "Add a grade in Settings first");
}
function gradesForCurrentOilType(){
  const type = $("oilType").value;
  if(type === "ATF") return window.__atfGrades || [];
  if(type === "CVT Fluid") return window.__cvtGrades || [];
  if(type === "Manual Transmission Oil") return window.__manualGrades || [];
  return window.__engineGrades || [];
}
$("oilType").addEventListener("change", () => {
  fillSelect($("oilGrade"), gradesForCurrentOilType(), "Add a grade in Settings first");
});
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
  await Promise.all([refreshGrades(), refreshAtfGrades(), refreshCvtGrades(), refreshManualGrades(), refreshTechnicians(), refreshMakes()]);
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
wireAdd("addAtfGradeBtn", "newAtfGrade", "atf_grades", refreshAtfGrades);
wireAdd("addCvtGradeBtn", "newCvtGrade", "cvt_grades", refreshCvtGrades);
wireAdd("addManualGradeBtn", "newManualGrade", "manual_transmission_grades", refreshManualGrades);
wireAdd("addTechnicianBtn", "newTechnician", "technicians", refreshTechnicians);
wireAdd("addMakeBtn", "newMake", "vehicle_makes", refreshMakes);

// ---------- Service records (Records tab) ----------
async function loadRecords(search){
  const url = search ? `/api/records?search=${encodeURIComponent(search)}` : "/api/records";
  const res = await fetch(url);
  if(!res.ok) throw new Error("failed to load records");
  return res.json();
}

// ---------- WhatsApp message links ----------
// Converts a locally-entered Sri Lankan number (e.g. "077 123 4567") into
// the digits-only, country-code-prefixed format wa.me requires.
function toWhatsAppNumber(phone){
  if(!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if(!digits) return null;
  if(digits.startsWith("0")) digits = "94" + digits.slice(1);
  else if(!digits.startsWith("94")) digits = "94" + digits;
  return digits;
}

function buildWhatsAppLink(r, comps){
  const waNumber = toWhatsAppNumber(r.customer_phone);
  if(!waNumber) return null;

  const greetingName = (r.customer_name && r.customer_name.trim()) || "Sir/Madam";
  const componentLines = comps.length
    ? comps.map(c => `- ${c}`).join("\n")
    : `- No additional components changed`;

  const message = [
    `Dear ${greetingName},`,
    ``,
    `Thank you for choosing *Nandana Auto Electricals & Spare Parts* for your vehicle service.`,
    ``,
    `*Service Details*`,
    ``,
    `Service Date: ${toDDMMYYYYSlash(r.service_date)}`,
    `Odometer Reading: ${(r.odometer||0).toLocaleString()} km`,
    `${r.oil_type || "Engine Oil"} Grade: ${r.oil_grade || "N/A"}`,
    `Components Changed:`,
    componentLines,
    ``,
    `*Expected Next Service:* ${toDDMMYYYYSlash(r.next_service_date)} or ${(r.next_odometer||0).toLocaleString()} km`,
    ``,
    `We recommend completing the next service on or before the above date or mileage to maintain the vehicle's performance and reliability.`,
    ``,
    `We would also appreciate your continued support.`,
    ``,
    `*Follow us on Facebook:* https://www.facebook.com/profile.php?id=61581431322976&mibextid=wwXIfr&mibextid=wwXIfr`,
    ``,
    `*Leave us a Google Review:* https://share.google/KbDKx8eHPUr5VBWz7`,
    ``,
    `Thank you for choosing *Nandana Auto Electricals & Spare Parts*. We appreciate your trust and look forward to serving you again.`,
    ``,
    `Best regards,`,
    `*Nandana Auto Electricals & Spare Parts*`,
  ].join("\n");

  return `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
}

function compsFor(r){
  const c = [];
  if(r.comp_oil_filter) c.push("Oil Filter");
  if(r.comp_cabin_filter) c.push("Cabin Filter");
  if(r.comp_engine_filter) c.push("Engine Filter");
  return c;
}

// Renders a set of past service records as attractive cards (used for the
// returning-customer preview in Service Entry, and the per-vehicle history
// panel in Service Records). Each card can send its own WhatsApp message.
function renderHistoryCards(records){
  if(!records.length) return `<p class="empty">No previous service history for this vehicle.</p>`;
  return `<div class="history-cards">` + records.map(r => {
    const comps = compsFor(r);
    const compHtml = comps.length
      ? comps.map(c => `<span class="tag">${c}</span>`).join("")
      : `<span class="history-sub">No extra components changed</span>`;
    const waLink = buildWhatsAppLink(r, comps);
    const waButton = waLink
      ? `<a class="waBtn waBtn-sm" href="${waLink}" target="_blank" rel="noopener">WhatsApp</a>`
      : `<span class="waBtn waBtn-sm waBtn-disabled" title="No phone number on file">WhatsApp</span>`;
    return `<div class="history-card">
      <div class="history-card-top">
        <span class="history-date">${toDDMMYYYY(r.service_date)}</span>
        ${waButton}
      </div>
      <div class="history-grid">
        <div class="history-field"><span class="history-label">Odometer</span><span class="history-value">${(r.odometer||0).toLocaleString()} km</span></div>
        <div class="history-field"><span class="history-label">Oil Type</span><span class="history-value">${r.oil_type||"Engine Oil"}</span></div>
        <div class="history-field"><span class="history-label">Oil Grade</span><span class="history-value">${r.oil_grade||"—"}</span></div>
        <div class="history-field"><span class="history-label">Qty Used</span><span class="history-value">${r.oil_qty ?? "—"} L</span></div>
        <div class="history-field"><span class="history-label">Technician</span><span class="history-value">${r.technician||"—"}</span></div>
      </div>
      <div class="history-components">${compHtml}</div>
      <div class="history-next">
        <span>Next expected: <b>${toDDMMYYYY(r.next_service_date)}</b> · <b>${(r.next_odometer||0).toLocaleString()} km</b></span>
      </div>
    </div>`;
  }).join("") + `</div>`;
}

function renderRecords(records){
  const list = $("recordsList");
  if(records.length === 0){
    list.innerHTML = `<p class="empty">No matching service records.</p>`;
    return;
  }
  list.innerHTML = records.map(r => {
    const comps = compsFor(r);
    const compHtml = comps.length ? comps.map(c=>`<span class="tag">${c}</span>`).join("") : `<span class="record-sub">No extra components changed</span>`;
    const vehicle = [r.vehicle_make, r.vehicle_model].filter(Boolean).join(" ") || "—";
    const waLink = buildWhatsAppLink(r, comps);
    const waButton = waLink
      ? `<a class="waBtn" href="${waLink}" target="_blank" rel="noopener">WhatsApp</a>`
      : `<span class="waBtn waBtn-disabled" title="No phone number on file">WhatsApp</span>`;
    return `<div class="record-card">
      <div class="record-card-top">
        <span class="record-plate">${r.plate||""}</span>
        <div class="record-actions">
          <button class="historyBtn" data-plate="${r.plate||""}" data-id="${r.id}">History</button>
          ${waButton}
          <button data-id="${r.id}" class="delRecord">Delete</button>
        </div>
      </div>
      <div class="record-sub">${r.customer_name||"—"} &nbsp;·&nbsp; ${r.customer_phone||"—"} &nbsp;·&nbsp; ${vehicle}</div>

      <div class="record-grid">
        <div class="record-field"><span class="record-label">Service Date</span><span class="record-value">${toDDMMYYYY(r.service_date)}</span></div>
        <div class="record-field"><span class="record-label">Odometer</span><span class="record-value">${(r.odometer||0).toLocaleString()} km</span></div>
        <div class="record-field"><span class="record-label">Oil Type</span><span class="record-value">${r.oil_type||"Engine Oil"}</span></div>
        <div class="record-field"><span class="record-label">Oil Grade</span><span class="record-value">${r.oil_grade||"—"}</span></div>
        <div class="record-field"><span class="record-label">Qty Used</span><span class="record-value">${r.oil_qty ?? "—"} L</span></div>
        <div class="record-field"><span class="record-label">Technician</span><span class="record-value">${r.technician||"—"}</span></div>
      </div>

      <div class="record-components">${compHtml}</div>

      <div class="record-next">
        <div class="record-next-stat">
          <span class="record-next-label">Next Service</span>
          <span class="record-next-value">${toDDMMYYYY(r.next_service_date)}</span>
        </div>
        <div class="record-next-stat">
          <span class="record-next-label">Next Odometer</span>
          <span class="record-next-value">${(r.next_odometer||0).toLocaleString()} km</span>
        </div>
      </div>

      <div class="record-history hidden" id="history-${r.id}"></div>
    </div>`;
  }).join("");
  list.querySelectorAll(".delRecord").forEach(btn => {
    btn.addEventListener("click", async () => {
      await fetch(`/api/records/${btn.dataset.id}`, { method: "DELETE" });
      await refreshRecords();
      await refreshSummary();
      await refreshReminders();
    });
  });
  list.querySelectorAll(".historyBtn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const box = $(`history-${btn.dataset.id}`);
      const isHidden = box.classList.contains("hidden");
      if(!isHidden){
        box.classList.add("hidden");
        return;
      }
      if(!box.dataset.loaded){
        box.innerHTML = `<span class="empty">Loading history…</span>`;
        box.classList.remove("hidden");
        try{
          const res = await fetch(`/api/records/by-plate/${encodeURIComponent(btn.dataset.plate)}`);
          const all = await res.json();
          const others = all.filter(x => String(x.id) !== String(btn.dataset.id));
          box.innerHTML = `<div class="record-history-title">Full service history for ${btn.dataset.plate} (${others.length} other record${others.length===1?"":"s"})</div>` + renderHistoryCards(others);
          box.dataset.loaded = "1";
        }catch(e){
          box.innerHTML = `<span class="empty">Could not load history.</span>`;
        }
      } else {
        box.classList.remove("hidden");
      }
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

// ---------- Usage summary (Settings tab) — one sector per oil type ----------
const OIL_TYPE_ORDER = ["Engine Oil", "ATF", "CVT Fluid", "Manual Transmission Oil"];
const OIL_TYPE_LABELS = {
  "Engine Oil": "Engine Oil",
  "ATF": "Automatic Transmission Fluid (ATF)",
  "CVT Fluid": "CVT Fluid",
  "Manual Transmission Oil": "Manual Transmission Oil",
};

function renderSummary(entries){
  const box = $("summarySections");
  if(!entries || entries.length === 0){
    box.innerHTML = `<p class="empty">No oil grade data yet.</p>`;
    return;
  }

  const byType = {};
  entries.forEach(e => {
    const type = e.oil_type || "Engine Oil";
    if(!byType[type]) byType[type] = [];
    byType[type].push(e);
  });

  // Known types first, in a fixed order; anything unexpected (e.g. old
  // data) is appended afterwards under its own label.
  const orderedTypes = [
    ...OIL_TYPE_ORDER.filter(t => byType[t]),
    ...Object.keys(byType).filter(t => !OIL_TYPE_ORDER.includes(t)),
  ];

  box.innerHTML = orderedTypes.map(type => {
    const rows = byType[type];
    const max = Math.max(...rows.map(e => Number(e.count)));
    const bars = rows.map(e => {
      const count = Number(e.count);
      const qty = Number(e.total_qty || 0);
      return `
      <div class="bar-row">
        <span class="bar-name">${e.name}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(count/max*100).toFixed(0)}%"></div></div>
        <span class="bar-stats">${count} service${count===1?"":"s"} &nbsp;·&nbsp; ${qty.toFixed(1)} L used</span>
      </div>`;
    }).join("");
    return `<div class="summary-sector">
      <h3 class="summary-sector-title">${OIL_TYPE_LABELS[type] || type}</h3>
      ${bars}
    </div>`;
  }).join("");
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

function buildReminderWhatsAppLink(r){
  const waNumber = toWhatsAppNumber(r.customer_phone);
  if(!waNumber) return null;
  const greetingName = (r.customer_name && r.customer_name.trim()) || "Sir/Madam";
  const message = [
    `Dear ${greetingName},`,
    ``,
    `This is a friendly reminder from *Nandana Auto Electricals & Spare Parts* that your vehicle's next oil change is due.`,
    ``,
    `*Expected Service:* ${toDDMMYYYYSlash(r.next_service_date)} or ${(r.next_odometer||0).toLocaleString()} km`,
    ``,
    `Please visit us at your convenience to keep your vehicle running smoothly.`,
    ``,
    `Best regards,`,
    `*Nandana Auto Electricals & Spare Parts*`,
  ].join("\n");
  return `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
}

function renderReminders(records){
  const list = $("remindersList");
  const badge = $("reminderCount");
  if(records.length === 0){
    list.innerHTML = `<p class="empty">No vehicles due soon — nothing within 7 days or overdue.</p>`;
    badge.classList.add("hidden");
    return;
  }
  badge.textContent = records.length;
  badge.classList.remove("hidden");
  list.innerHTML = records.map(r => {
    const vehicle = [r.vehicle_make, r.vehicle_model].filter(Boolean).join(" ") || "—";
    const d = daysBetween(r.next_service_date);
    const overdue = d < 0;
    const status = overdue
      ? `<span class="badge-overdue">${Math.abs(d)} day${Math.abs(d)===1?"":"s"} overdue</span>`
      : `<span class="badge-soon">Due in ${d} day${d===1?"":"s"}</span>`;
    const waLink = buildReminderWhatsAppLink(r);
    const waButton = waLink
      ? `<a class="waBtn waBtn-sm" href="${waLink}" target="_blank" rel="noopener">WhatsApp</a>`
      : `<span class="waBtn waBtn-sm waBtn-disabled" title="No phone number on file">WhatsApp</span>`;
    return `<div class="reminder-card ${overdue ? "overdue" : "soon"}">
      <div class="reminder-card-top">
        <span class="reminder-plate">${r.plate||""}</span>
        <div class="reminder-actions">${status} ${waButton}</div>
      </div>
      <div class="reminder-card-body">
        <div class="reminder-info">
          <span class="reminder-customer">${r.customer_name||"—"}</span>
          <span class="reminder-sub">${r.customer_phone||"—"} &nbsp;·&nbsp; ${vehicle}</span>
        </div>
        <div class="reminder-next">
          <div class="reminder-next-stat">
            <span class="reminder-next-label">Next Service</span>
            <span class="reminder-next-value">${toDDMMYYYY(r.next_service_date)}</span>
          </div>
          <div class="reminder-next-stat">
            <span class="reminder-next-label">Next Odometer</span>
            <span class="reminder-next-value">${(r.next_odometer||0).toLocaleString()} km</span>
          </div>
        </div>
      </div>
    </div>`;
  }).join("");
}

async function refreshReminders(){
  try{
    const res = await fetch("/api/reminders");
    const records = await res.json();
    renderReminders(records);
  }catch(e){
    $("remindersList").innerHTML = `<p class="empty">Could not load reminders.</p>`;
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
    oil_type: $("oilType").value,
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
    $("oilType").value = "Engine Oil";
    fillSelect($("oilGrade"), gradesForCurrentOilType(), "Add a grade in Settings first");
    $("plateHistoryBox").classList.add("hidden");
    $("plateHistoryBox").innerHTML = "";
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
    await Promise.all([refreshGrades(), refreshAtfGrades(), refreshCvtGrades(), refreshManualGrades(), refreshTechnicians(), refreshMakes()]);
    await refreshRecords();
    await refreshSummary();
    await refreshReminders();
  }catch(e){
    $("recordsList").innerHTML = `<p class="empty">Could not load data from the server.</p>`;
  }
})();
