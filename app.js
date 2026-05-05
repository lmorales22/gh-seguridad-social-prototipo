const STORAGE_KEY = "gh-seguridad-social-v1";

const state = {
  data: null,
  view: "dashboard",
  selectedWorkerId: null,
  filters: {
    search: "",
    month: "",
    contractor: "",
    eps: "",
  },
};

const monthNames = {
  "01": "Enero",
  "02": "Febrero",
  "03": "Marzo",
  "04": "Abril",
  "05": "Mayo",
  "06": "Junio",
  "07": "Julio",
  "08": "Agosto",
  "09": "Septiembre",
  "10": "Octubre",
  "11": "Noviembre",
  "12": "Diciembre",
};

const viewTitles = {
  dashboard: "Resumen operativo",
  activos: "Trabajadores activos",
  liquidacion: "Liquidación mensual",
  meses: "Novedades por mes",
  historial: "Historial de retirados",
  base: "Base de datos",
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function documentKey(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[.\-\s]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

function workerIdFromCedula(cedula) {
  const key = documentKey(cedula);
  return key ? `w-${key}` : `w-${crypto.randomUUID()}`;
}

function loadData() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed.workers) && Array.isArray(parsed.events)) {
        return ensureDataShape(parsed);
      }
    } catch (error) {
      console.warn("No se pudo leer localStorage", error);
    }
  }
  return ensureDataShape(clone(window.SEED_DATA ?? { workers: [], events: [], settings: {} }));
}

function ensureDataShape(data) {
  data.workers ||= [];
  data.events ||= [];
  data.settings ||= {};
  data.settings.closedMonths ||= [];
  data.settings.defaultMonth ||= latestMonth(data.events) ?? currentMonthKey();
  return data;
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function latestMonth(events) {
  return [...new Set(events.map((event) => event.month).filter(Boolean))].sort().at(-1);
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(monthKey) {
  if (!monthKey || !monthKey.includes("-")) return monthKey || "Sin mes";
  const [year, month] = monthKey.split("-");
  return `${monthNames[month] ?? month} ${year}`;
}

function getMonths() {
  return [...new Set([state.data.settings.defaultMonth, ...state.data.events.map((event) => event.month)])]
    .filter(Boolean)
    .sort()
    .reverse();
}

function parseDateLike(value, fallbackMonth) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00`);
  if (fallbackMonth && String(value).trim()) return new Date(`${fallbackMonth}-28T12:00:00`);
  return null;
}

function monthStartDate(monthKey) {
  if (!monthKey?.includes("-")) return null;
  return new Date(`${monthKey}-01T12:00:00`);
}

function dateInputValue(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")) ? value : "";
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }
  return value;
}

function fullName(worker) {
  return [worker.nombres, worker.apellidos].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function workerEvents(workerId) {
  return state.data.events
    .filter((event) => event.workerId === workerId)
    .sort((a, b) => {
      const aDate = parseDateLike(a.retiro?.fecha || a.ingreso?.fecha, a.month)?.getTime() ?? 0;
      const bDate = parseDateLike(b.retiro?.fecha || b.ingreso?.fecha, b.month)?.getTime() ?? 0;
      return aDate - bDate;
    });
}

function workerMovementRecords(workerId) {
  return workerEvents(workerId)
    .flatMap((event) => {
      const records = [];
      if (event.ingreso?.fecha) {
        records.push({ type: "ingreso", date: parseDateLike(event.ingreso.fecha, event.month), event });
      }
      if (event.retiro?.fecha) {
        records.push({ type: "retiro", date: parseDateLike(event.retiro.fecha, event.month), event });
      }
      return records;
    })
    .filter((record) => record.date)
    .sort((a, b) => a.date - b.date);
}

function isWorkerActiveBeforeMonth(worker, monthKey) {
  const start = monthStartDate(monthKey);
  const records = workerMovementRecords(worker.id);
  const before = records.filter((record) => record.date < start);
  if (before.length) return before.at(-1).type === "ingreso";
  if (records.length) return false;
  return !normalize(worker.estadoManual).includes("inactivo");
}

function deriveWorker(worker) {
  const events = workerEvents(worker.id);
  const latestIngreso = [...events]
    .filter((event) => event.ingreso?.fecha)
    .sort((a, b) => (parseDateLike(a.ingreso.fecha, a.month)?.getTime() ?? 0) - (parseDateLike(b.ingreso.fecha, b.month)?.getTime() ?? 0))
    .at(-1);
  const latestRetiro = [...events]
    .filter((event) => event.retiro?.fecha)
    .sort((a, b) => (parseDateLike(a.retiro.fecha, a.month)?.getTime() ?? 0) - (parseDateLike(b.retiro.fecha, b.month)?.getTime() ?? 0))
    .at(-1);
  const ingresoTime = parseDateLike(latestIngreso?.ingreso?.fecha, latestIngreso?.month)?.getTime() ?? 0;
  const retiroTime = parseDateLike(latestRetiro?.retiro?.fecha, latestRetiro?.month)?.getTime() ?? 0;
  const manuallyInactive = normalize(worker.estadoManual).includes("inactivo");
  const active = latestRetiro ? ingresoTime > retiroTime : !manuallyInactive;
  const currentEvent = events.at(-1);
  const selectedEvent = events.find((event) => event.month === state.filters.month);
  const pending = events.some(eventHasPending);

  return {
    events,
    latestIngreso,
    latestRetiro,
    currentEvent,
    selectedEvent,
    active,
    pending,
    status: active ? (events.length ? "active" : "base") : "retired",
    statusLabel: active ? (events.length ? "Vigente" : "Vigente base") : "Retirado",
  };
}

function eventHasPending(event) {
  return Boolean(
    (event.ingreso?.fecha && (!event.ingreso.arlOk || !event.ingreso.epsOk || !event.ingreso.pilaOk)) ||
      (event.retiro?.fecha && (!event.retiro.arlOk || !event.retiro.epsOk || !event.retiro.pilaOk)),
  );
}

function eventReadyForPila(event) {
  const ingresoReady = !event.ingreso?.fecha || (event.ingreso.arlOk && event.ingreso.epsOk);
  const retiroReady = !event.retiro?.fecha || (event.retiro.arlOk && event.retiro.epsOk);
  return ingresoReady && retiroReady;
}

function selectedMonthEvents() {
  return state.data.events.filter((event) => event.month === state.filters.month);
}

function selectedMonthEventForWorker(workerId) {
  return state.data.events.find((event) => event.month === state.filters.month && event.workerId === workerId);
}

function getWorker(workerId) {
  return state.data.workers.find((worker) => worker.id === workerId);
}

function getEventWorker(event) {
  return getWorker(event.workerId) ?? {};
}

function getFilteredWorkers(mode = "all") {
  const search = normalize(state.filters.search);
  return state.data.workers
    .map((worker) => ({ worker, derived: deriveWorker(worker) }))
    .filter(({ worker, derived }) => {
      if (mode === "active" && !derived.active) return false;
      if (mode === "retired" && derived.active) return false;
      if (state.filters.contractor) {
        const currentContractor = derived.currentEvent?.contratista || worker.contratista;
        if (currentContractor !== state.filters.contractor) return false;
      }
      if (state.filters.eps) {
        const currentEps = derived.currentEvent?.eps || worker.eps;
        if (currentEps !== state.filters.eps) return false;
      }
      if (!search) return true;
      const haystack = normalize([
        fullName(worker),
        worker.cedula,
        worker.eps,
        worker.pension,
        worker.contratista,
        worker.obra,
        worker.telefono,
      ].join(" "));
      return haystack.includes(search);
    })
    .sort((a, b) => fullName(a.worker).localeCompare(fullName(b.worker), "es"));
}

function buildSettlementRows(monthKey = state.filters.month) {
  const eventMap = new Map(selectedMonthEvents().map((event) => [event.workerId, event]));
  const search = normalize(state.filters.search);
  return state.data.workers
    .map((worker) => {
      const event = eventMap.get(worker.id) || null;
      const carryover = isWorkerActiveBeforeMonth(worker, monthKey);
      const hasMonthNovelty = Boolean(event?.ingreso?.fecha || event?.retiro?.fecha);
      if (!carryover && !hasMonthNovelty) return null;
      const derived = deriveWorker(worker);
      const monthRetired = Boolean(event?.retiro?.fecha);
      const monthEntered = Boolean(event?.ingreso?.fecha);
      const category = carryover && hasMonthNovelty ? "Viene vigente + novedad" : carryover ? "Viene vigente" : "Novedad del mes";
      const liquidationStatus = monthRetired ? "Retirado en el mes" : monthEntered ? "Ingreso del mes" : "Activo anterior";
      return { worker, derived, event, carryover, hasMonthNovelty, monthRetired, monthEntered, category, liquidationStatus };
    })
    .filter(Boolean)
    .filter((row) => {
      const worker = row.worker;
      const event = row.event;
      if (state.filters.contractor && (event?.contratista || worker.contratista) !== state.filters.contractor) return false;
      if (state.filters.eps && (event?.eps || worker.eps) !== state.filters.eps) return false;
      if (!search) return true;
      return normalize([
        fullName(worker),
        worker.cedula,
        worker.eps,
        worker.pension,
        worker.contratista,
        worker.obra,
        event?.obra,
        event?.contratista,
        row.category,
        row.liquidationStatus,
      ].join(" ")).includes(search);
    })
    .sort((a, b) => {
      if (a.monthRetired !== b.monthRetired) return Number(b.monthRetired) - Number(a.monthRetired);
      if (a.hasMonthNovelty !== b.hasMonthNovelty) return Number(b.hasMonthNovelty) - Number(a.hasMonthNovelty);
      return fullName(a.worker).localeCompare(fullName(b.worker), "es");
    });
}

function buildMonthHistory(selectedMonth = state.filters.month) {
  return getMonths()
    .filter((month) => month <= selectedMonth)
    .sort()
    .map((month) => {
      const events = state.data.events.filter((event) => event.month === month);
      const eventWorkerIds = new Set(events.filter((event) => event.ingreso?.fecha || event.retiro?.fecha).map((event) => event.workerId));
      const carryover = state.data.workers.filter((worker) => isWorkerActiveBeforeMonth(worker, month)).length;
      const retired = events.filter((event) => event.retiro?.fecha).length;
      const entered = events.filter((event) => event.ingreso?.fecha).length;
      const totalToLiquidate = new Set([
        ...state.data.workers.filter((worker) => isWorkerActiveBeforeMonth(worker, month)).map((worker) => worker.id),
        ...eventWorkerIds,
      ]).size;
      return { month, carryover, entered, retired, novedades: eventWorkerIds.size, totalToLiquidate };
    });
}

function metrics() {
  const workers = state.data.workers.map((worker) => ({ worker, derived: deriveWorker(worker) }));
  const monthEvents = selectedMonthEvents();
  const settlementRows = buildSettlementRows();
  const active = workers.filter(({ derived }) => derived.active).length;
  const retired = workers.length - active;
  const epsRetiro = monthEvents.filter((event) => event.retiro?.fecha && !event.retiro.epsOk).length;
  const ingresoPendiente = monthEvents.filter((event) => event.ingreso?.fecha && (!event.ingreso.arlOk || !event.ingreso.epsOk)).length;
  const pilaPendiente = monthEvents.filter((event) => eventHasPending(event) || !eventReadyForPila(event)).length;
  return { active, retired, epsRetiro, ingresoPendiente, pilaPendiente, total: workers.length, monthEvents, settlementRows };
}

function render() {
  $("#pageTitle").textContent = viewTitles[state.view];
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
  syncFilterControls();
  renderDatalists();

  if (state.view === "dashboard") renderDashboard();
  if (state.view === "activos") renderWorkerTableView("active");
  if (state.view === "liquidacion") renderLiquidationView();
  if (state.view === "meses") renderMonthView();
  if (state.view === "historial") renderWorkerTableView("retired");
  if (state.view === "base") renderWorkerTableView("all");

  renderDetailPanel();
  refreshIcons();
}

function syncFilterControls() {
  const months = getMonths();
  if (!state.filters.month || !months.includes(state.filters.month)) {
    state.filters.month = state.data.settings.defaultMonth || months[0] || currentMonthKey();
  }

  $("#searchInput").value = state.filters.search;
  fillSelect($("#monthSelect"), months.map((month) => [month, monthLabel(month)]), state.filters.month);
  fillSelect($("#contractorSelect"), [["", "Todos"]].concat(uniqueOptions("contractor")), state.filters.contractor);
  fillSelect($("#epsSelect"), [["", "Todas"]].concat(uniqueOptions("eps")), state.filters.eps);
  $("#seedMeta").textContent = `${state.data.workers.length} trabajadores, ${state.data.events.length} novedades`;
}

function uniqueOptions(kind) {
  const values = new Set();
  state.data.workers.forEach((worker) => {
    if (kind === "contractor" && worker.contratista) values.add(worker.contratista);
    if (kind === "eps" && worker.eps) values.add(worker.eps);
  });
  state.data.events.forEach((event) => {
    if (kind === "contractor" && event.contratista) values.add(event.contratista);
    if (kind === "eps" && event.eps) values.add(event.eps);
  });
  return [...values].sort((a, b) => a.localeCompare(b, "es")).map((value) => [value, value]);
}

function fillSelect(select, options, value) {
  select.innerHTML = options.map(([optionValue, label]) => `<option value="${escapeHtml(optionValue)}">${escapeHtml(label)}</option>`).join("");
  select.value = value;
}

function renderDatalists() {
  fillDatalist("#epsOptions", uniqueOptions("eps").map(([value]) => value));
  fillDatalist("#contractorOptions", uniqueOptions("contractor").map(([value]) => value));
  fillDatalist("#pensionOptions", [
    ...new Set(state.data.workers.map((worker) => worker.pension).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "es")));
}

function fillDatalist(selector, values) {
  $(selector).innerHTML = values.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
}

function renderDashboard() {
  const stats = metrics();
  const activeWorkers = getFilteredWorkers("active").slice(0, 8);
  const pendingEvents = stats.monthEvents.filter(eventHasPending).slice(0, 8);
  const epsRows = buildEpsRows(stats.monthEvents);
  const closed = state.data.settings.closedMonths.includes(state.filters.month);

  $("#content").innerHTML = `
    <section class="kpi-grid">
      ${kpi("Trabajadores vigentes", stats.active, "active")}
      ${kpi(`A liquidar ${monthLabel(state.filters.month)}`, stats.settlementRows.length, "base")}
      ${kpi("Retirados históricos", stats.retired, "retired")}
      ${kpi("Novedades sin cerrar", stats.pilaPendiente, stats.pilaPendiente ? "pending" : "active")}
    </section>

    <section class="split-layout">
      <div class="panel table-panel">
        <div class="panel-header">
          <div>
            <h2>Activos visibles</h2>
            <p>${monthLabel(state.filters.month)} · ${activeWorkers.length} en vista rápida</p>
          </div>
          <button class="ghost-button" type="button" data-action="view-active">
            <i data-lucide="arrow-right"></i>
            <span>Ver activos</span>
          </button>
        </div>
        ${workerTable(activeWorkers)}
      </div>

      <div class="panel">
        <div class="panel-header">
          <div>
            <h2>Preparación PILA</h2>
            <p>${closed ? "Mes marcado como liquidado" : "Mes abierto para novedades"}</p>
          </div>
          <button class="ghost-button" type="button" data-action="view-liquidation">
            <i data-lucide="clipboard-check"></i>
            <span>Liquidación</span>
          </button>
        </div>
        <div class="progress-list">
          ${progressRow("ARL ingresos", completion(stats.monthEvents, "ingreso", "arlOk"))}
          ${progressRow("EPS ingresos", completion(stats.monthEvents, "ingreso", "epsOk"))}
          ${progressRow("EPS retiros", completion(stats.monthEvents, "retiro", "epsOk"))}
          ${progressRow("PILA", completion(stats.monthEvents, "ingreso", "pilaOk", true))}
        </div>
      </div>
    </section>

    <section class="split-layout">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h2>Novedades pendientes</h2>
            <p>${pendingEvents.length ? "Revisar antes de liquidar" : "Sin pendientes en este mes"}</p>
          </div>
        </div>
        <div class="list-stack">
          ${pendingEvents.length ? pendingEvents.map(workItem).join("") : emptyRow("No hay pendientes para el mes seleccionado.")}
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <div>
            <h2>EPS del mes</h2>
            <p>Ingresos y retiros por entidad</p>
          </div>
        </div>
        <div class="progress-list">
          ${epsRows.length ? epsRows.map((row) => progressRow(row.eps, row.percent, `${row.done}/${row.total}`)).join("") : emptyRow("No hay novedades con EPS en este mes.")}
        </div>
      </div>
    </section>
  `;
}

function renderLiquidationView() {
  const rows = buildSettlementRows();
  const monthEvents = selectedMonthEvents();
  const history = buildMonthHistory();
  const carryoverCount = rows.filter((row) => row.carryover).length;
  const noveltyCount = rows.filter((row) => row.hasMonthNovelty).length;
  const retiredCount = rows.filter((row) => row.monthRetired).length;
  const pendingCount = monthEvents.filter(eventHasPending).length;

  $("#content").innerHTML = `
    <section class="kpi-grid">
      ${kpi("Total a liquidar", rows.length, "base")}
      ${kpi("Vienen activos", carryoverCount, "active")}
      ${kpi("Con novedad del mes", noveltyCount, "pending")}
      ${kpi("Retirados del mes", retiredCount, retiredCount ? "retired" : "active")}
    </section>

    <section class="split-layout">
      <div class="panel table-panel">
        <div class="panel-header">
          <div>
            <h2>Base de liquidación</h2>
            <p>${monthLabel(state.filters.month)} · vigentes anteriores + novedades del mes</p>
          </div>
          <span class="mini-chip ${pendingCount ? "warn" : "ok"}">${pendingCount ? `${pendingCount} pendientes` : "Lista para revisar"}</span>
        </div>
        ${rows.length ? settlementTable(rows) : emptyState("No hay trabajadores para liquidar con los filtros actuales.")}
      </div>

      <div class="panel">
        <div class="panel-header">
          <div>
            <h2>Historial mensual</h2>
            <p>Cómo llega cada mes a la liquidación</p>
          </div>
        </div>
        <div class="month-history">
          ${history.map(monthHistoryItem).join("")}
        </div>
      </div>
    </section>
  `;
}

function kpi(label, value, tone) {
  return `
    <article class="kpi">
      <span>${escapeHtml(label)}</span>
      <strong>${value}</strong>
      <small class="status-chip ${tone}"><span class="dot"></span>${tone === "pending" ? "Revisar" : "Al día"}</small>
    </article>
  `;
}

function completion(events, type, field, includeBoth = false) {
  const relevant = events.filter((event) => event[type]?.fecha);
  const total = relevant.length;
  if (!total) return 100;
  if (includeBoth) {
    const all = events.flatMap((event) => [event.ingreso?.fecha ? event.ingreso : null, event.retiro?.fecha ? event.retiro : null]).filter(Boolean);
    return all.length ? Math.round((all.filter((item) => item[field]).length / all.length) * 100) : 100;
  }
  return Math.round((relevant.filter((event) => event[type]?.[field]).length / total) * 100);
}

function progressRow(label, percent, detail) {
  const pct = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
  return `
    <div class="progress-row">
      <div class="progress-head">
        <span>${escapeHtml(label)}</span>
        <strong>${detail || `${pct}%`}</strong>
      </div>
      <div class="bar"><span style="width:${pct}%"></span></div>
    </div>
  `;
}

function buildEpsRows(events) {
  const map = new Map();
  events.forEach((event) => {
    const eps = event.eps || getEventWorker(event).eps || "Sin EPS";
    if (!map.has(eps)) map.set(eps, { eps, total: 0, done: 0 });
    const row = map.get(eps);
    if (event.ingreso?.fecha) {
      row.total += 1;
      if (event.ingreso.epsOk) row.done += 1;
    }
    if (event.retiro?.fecha) {
      row.total += 1;
      if (event.retiro.epsOk) row.done += 1;
    }
  });
  return [...map.values()]
    .filter((row) => row.total)
    .map((row) => ({ ...row, percent: Math.round((row.done / row.total) * 100) }))
    .sort((a, b) => a.percent - b.percent || a.eps.localeCompare(b.eps, "es"))
    .slice(0, 8);
}

function renderWorkerTableView(mode) {
  const rows = getFilteredWorkers(mode);
  const title = mode === "active" ? "Trabajadores vigentes" : mode === "retired" ? "Retirados" : "Base completa";
  const subtitle =
    mode === "active"
      ? "No arrastra personas retiradas visualmente"
      : mode === "retired"
        ? "Conserva el historial sin mezclarlo con la operación diaria"
        : "Incluye vigentes, retirados y registros semilla";

  $("#content").innerHTML = `
    <section class="panel table-panel">
      <div class="panel-header">
        <div>
          <h2>${title}</h2>
          <p>${rows.length} registros · ${monthLabel(state.filters.month)}</p>
        </div>
        <span class="mini-chip ${mode === "retired" ? "bad" : "ok"}">${subtitle}</span>
      </div>
      ${rows.length ? workerTable(rows) : emptyState("No hay trabajadores con los filtros actuales.")}
    </section>
  `;
}

function workerTable(rows) {
  return `
    <table class="worker-table">
      <thead>
        <tr>
          <th>Trabajador</th>
          <th>Ubicación</th>
          <th>Seguridad social</th>
          <th>Última novedad</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(({ worker, derived }) => workerRow(worker, derived)).join("")}
      </tbody>
    </table>
  `;
}

function settlementTable(rows) {
  return `
    <table class="worker-table settlement-table">
      <thead>
        <tr>
          <th>Trabajador</th>
          <th>Origen</th>
          <th>Novedad del mes</th>
          <th>Días estimados</th>
          <th>Seguridad social</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(settlementRow).join("")}
      </tbody>
    </table>
  `;
}

function settlementRow(row) {
  const worker = row.worker;
  const event = row.event;
  const novedades = [
    event?.ingreso?.fecha ? `Ingreso ${formatDate(event.ingreso.fecha)}` : null,
    event?.retiro?.fecha ? `Retiro ${formatDate(event.retiro.fecha)}` : null,
  ].filter(Boolean);
  const days = event ? computePilaDays(event, state.filters.month) : 30;
  const tone = row.monthRetired ? "retired" : row.hasMonthNovelty ? "pending" : "active";
  return `
    <tr data-worker-id="${escapeHtml(worker.id)}">
      <td>
        <div class="worker-name">
          <strong>${escapeHtml(fullName(worker) || "Sin nombre")}</strong>
          <span class="muted">${escapeHtml(worker.cedula || "Sin cédula")}</span>
        </div>
      </td>
      <td>
        <strong>${escapeHtml(row.category)}</strong>
        <div class="muted">${escapeHtml(event?.obra || worker.obra || "Sin obra")} · ${escapeHtml(event?.contratista || worker.contratista || "Sin contratista")}</div>
      </td>
      <td>
        <strong>${escapeHtml(novedades.join(" · ") || "Sin novedad")}</strong>
        <div class="muted">${row.monthRetired ? "Se liquida aunque ya no esté activo" : row.monthEntered ? "Ingreso dentro del mes" : "Pasa del mes anterior"}</div>
      </td>
      <td><strong>${days}</strong><div class="muted">Convención 30 días</div></td>
      <td>
        <strong>${escapeHtml(event?.eps || worker.eps || "Sin EPS")}</strong>
        <div class="muted">${escapeHtml(event?.pension || worker.pension || "Sin pensión")}</div>
      </td>
      <td>
        <button class="status-chip ${tone}" type="button" data-action="select-worker" data-worker-id="${escapeHtml(worker.id)}">
          <span class="dot"></span>${escapeHtml(row.liquidationStatus)}
        </button>
      </td>
    </tr>
  `;
}

function monthHistoryItem(item) {
  const selected = item.month === state.filters.month;
  return `
    <article class="month-history-item ${selected ? "selected" : ""}">
      <div>
        <strong>${escapeHtml(monthLabel(item.month))}</strong>
        <span class="muted">${selected ? "Mes a liquidar" : "Corte histórico"}</span>
      </div>
      <div class="month-history-stats">
        <span><strong>${item.totalToLiquidate}</strong> a liquidar</span>
        <span><strong>${item.carryover}</strong> vienen activos</span>
        <span><strong>${item.entered}</strong> ingresos</span>
        <span><strong>${item.retired}</strong> retiros</span>
      </div>
    </article>
  `;
}

function workerRow(worker, derived) {
  const currentEvent = derived.currentEvent;
  const latestText = currentEvent
    ? `${monthLabel(currentEvent.month)} · ${currentEvent.ingreso?.fecha ? `Ingreso ${formatDate(currentEvent.ingreso.fecha)}` : "Sin ingreso"}${currentEvent.retiro?.fecha ? ` · Retiro ${formatDate(currentEvent.retiro.fecha)}` : ""}`
    : "Sin novedades mensuales";
  const statusTone = derived.pending ? "pending" : derived.status;
  return `
    <tr data-worker-id="${escapeHtml(worker.id)}">
      <td>
        <div class="worker-name">
          <strong>${escapeHtml(fullName(worker) || "Sin nombre")}</strong>
          <span class="muted">${escapeHtml(worker.cedula || "Sin cédula")}</span>
        </div>
      </td>
      <td>
        <strong>${escapeHtml(currentEvent?.obra || worker.obra || "Sin obra")}</strong>
        <div class="muted">${escapeHtml(currentEvent?.contratista || worker.contratista || "Sin contratista")}</div>
      </td>
      <td>
        <strong>${escapeHtml(currentEvent?.eps || worker.eps || "Sin EPS")}</strong>
        <div class="muted">${escapeHtml(currentEvent?.pension || worker.pension || "Sin pensión")}</div>
      </td>
      <td><span class="muted">${escapeHtml(latestText)}</span></td>
      <td>
        <button class="status-chip ${statusTone}" type="button" data-action="select-worker" data-worker-id="${escapeHtml(worker.id)}">
          <span class="dot"></span>${derived.pending ? "Pendiente" : derived.statusLabel}
        </button>
      </td>
    </tr>
  `;
}

function renderMonthView() {
  const events = selectedMonthEvents()
    .filter((event) => {
      const worker = getEventWorker(event);
      if (state.filters.contractor && (event.contratista || worker.contratista) !== state.filters.contractor) return false;
      if (state.filters.eps && (event.eps || worker.eps) !== state.filters.eps) return false;
      if (!state.filters.search) return true;
      return normalize([fullName(worker), worker.cedula, event.obra, event.contratista, event.eps].join(" ")).includes(normalize(state.filters.search));
    })
    .sort((a, b) => fullName(getEventWorker(a)).localeCompare(fullName(getEventWorker(b)), "es"));
  const closed = state.data.settings.closedMonths.includes(state.filters.month);

  $("#content").innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>${monthLabel(state.filters.month)}</h2>
          <p>${events.length} novedades registradas · ${closed ? "liquidado" : "abierto"}</p>
        </div>
        <button class="ghost-button" type="button" data-action="toggle-month">
          <i data-lucide="${closed ? "lock-open" : "lock"}"></i>
          <span>${closed ? "Reabrir mes" : "Marcar liquidado"}</span>
        </button>
      </div>
      ${events.length ? `<div class="event-grid">${events.map(eventCard).join("")}</div>` : emptyState("Este mes todavía no tiene novedades.")}
    </section>
  `;
}

function eventCard(event) {
  const worker = getEventWorker(event);
  const pending = eventHasPending(event);
  return `
    <article class="event-card" data-worker-id="${escapeHtml(event.workerId)}">
      <header>
        <div>
          <h3>${escapeHtml(fullName(worker) || "Trabajador sin base")}</h3>
          <span class="muted">${escapeHtml(worker.cedula || "")}</span>
        </div>
        <button class="status-chip ${pending ? "pending" : "active"}" type="button" data-action="select-worker" data-worker-id="${escapeHtml(event.workerId)}">
          <span class="dot"></span>${pending ? "Pendiente" : "Listo"}
        </button>
      </header>
      <div class="muted">${escapeHtml(event.obra || worker.obra || "Sin obra")} · ${escapeHtml(event.contratista || worker.contratista || "Sin contratista")}</div>
      <div class="check-cluster">
        ${event.ingreso?.fecha ? checkChip(`Ingreso ${formatDate(event.ingreso.fecha)}`, event.ingreso.arlOk && event.ingreso.epsOk) : ""}
        ${event.retiro?.fecha ? checkChip(`Retiro ${formatDate(event.retiro.fecha)}`, event.retiro.arlOk && event.retiro.epsOk) : ""}
        ${checkChip("PILA", Boolean((!event.ingreso?.fecha || event.ingreso.pilaOk) && (!event.retiro?.fecha || event.retiro.pilaOk)))}
      </div>
    </article>
  `;
}

function checkChip(label, ok) {
  return `<span class="mini-chip ${ok ? "ok" : "warn"}">${escapeHtml(label)}</span>`;
}

function workItem(event) {
  const worker = getEventWorker(event);
  const reasons = [];
  if (event.ingreso?.fecha && !event.ingreso.arlOk) reasons.push("ARL ingreso");
  if (event.ingreso?.fecha && !event.ingreso.epsOk) reasons.push("EPS ingreso");
  if (event.ingreso?.fecha && !event.ingreso.pilaOk) reasons.push("PILA ingreso");
  if (event.retiro?.fecha && !event.retiro.arlOk) reasons.push("ARL retiro");
  if (event.retiro?.fecha && !event.retiro.epsOk) reasons.push("EPS retiro");
  if (event.retiro?.fecha && !event.retiro.pilaOk) reasons.push("PILA retiro");
  return `
    <article class="work-item">
      <div>
        <strong>${escapeHtml(fullName(worker) || "Trabajador sin base")}</strong>
        <div class="muted">${escapeHtml(reasons.join(" · "))}</div>
      </div>
      <button class="ghost-button" type="button" data-action="select-worker" data-worker-id="${escapeHtml(event.workerId)}">
        <i data-lucide="panel-right-open"></i>
        <span>Detalle</span>
      </button>
    </article>
  `;
}

function renderDetailPanel() {
  const worker = state.selectedWorkerId ? getWorker(state.selectedWorkerId) : null;
  if (!worker) {
    $("#detailPanel").innerHTML = `
      <div class="detail-empty">
        <div>
          <i data-lucide="panel-right"></i>
          <p>Selecciona un trabajador para ver su base, novedades y estado mensual.</p>
        </div>
      </div>
    `;
    return;
  }

  const derived = deriveWorker(worker);
  const event = findOrCreateEvent(worker.id, state.filters.month, false);
  const visibleEvent = event ?? blankEvent(worker.id, state.filters.month);
  const currentStatus = derived.pending ? "pending" : derived.status;

  $("#detailPanel").innerHTML = `
    <div class="detail-card">
      <div class="detail-title">
        <div>
          <p class="eyebrow">${escapeHtml(worker.cedula || "Sin cédula")}</p>
          <h2>${escapeHtml(fullName(worker) || "Sin nombre")}</h2>
        </div>
        <span class="status-chip ${currentStatus}"><span class="dot"></span>${derived.pending ? "Pendiente" : derived.statusLabel}</span>
      </div>

      <section class="detail-section">
        <h3>Información base</h3>
        <dl class="fact-list">
          ${fact("Dirección", worker.direccion)}
          ${fact("Teléfono", worker.telefono)}
          ${fact("Correo", worker.correo || "Opcional")}
          ${fact("EPS", worker.eps)}
          ${fact("Pensión", worker.pension)}
          ${fact("Obra", visibleEvent.obra || worker.obra)}
          ${fact("Contratista", visibleEvent.contratista || worker.contratista)}
        </dl>
        <button class="ghost-button" type="button" data-action="edit-worker" data-worker-id="${escapeHtml(worker.id)}">
          <i data-lucide="square-pen"></i>
          <span>Editar base</span>
        </button>
      </section>

      <section class="detail-section">
        <h3>${monthLabel(state.filters.month)}</h3>
        ${eventEditor(visibleEvent)}
      </section>

      <section class="detail-section">
        <h3>Historial</h3>
        <div class="timeline">
          ${derived.events.length ? derived.events.map(timelineItem).join("") : '<span class="muted">Sin novedades mensuales registradas.</span>'}
        </div>
      </section>
    </div>
  `;
}

function eventEditor(event) {
  return `
    <div class="event-editor" data-worker-id="${escapeHtml(event.workerId)}">
      <div class="editor-group">
        <h4>Ingreso</h4>
        <label class="field">
          <span>Fecha</span>
          <input class="event-input" type="date" data-path="ingreso.fecha" value="${escapeHtml(dateInputValue(event.ingreso?.fecha))}" />
        </label>
        ${eventCheckbox("ARL hecha", "ingreso.arlOk", event.ingreso?.arlOk)}
        ${eventCheckbox("EPS hecha", "ingreso.epsOk", event.ingreso?.epsOk)}
        ${eventCheckbox("PILA lista", "ingreso.pilaOk", event.ingreso?.pilaOk)}
      </div>
      <div class="editor-group">
        <h4>Retiro</h4>
        <label class="field">
          <span>Fecha</span>
          <input class="event-input" type="date" data-path="retiro.fecha" value="${escapeHtml(dateInputValue(event.retiro?.fecha))}" />
        </label>
        ${eventCheckbox("ARL retirada", "retiro.arlOk", event.retiro?.arlOk)}
        ${eventCheckbox("EPS retirada", "retiro.epsOk", event.retiro?.epsOk)}
        ${eventCheckbox("PILA lista", "retiro.pilaOk", event.retiro?.pilaOk)}
      </div>
    </div>
  `;
}

function eventCheckbox(label, path, checked) {
  return `
    <label class="check-row">
      <input class="event-input" type="checkbox" data-path="${path}" ${checked ? "checked" : ""} />
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

function timelineItem(event) {
  const retired = Boolean(event.retiro?.fecha);
  return `
    <article class="timeline-item ${retired ? "retired" : "active"}">
      <strong>${monthLabel(event.month)}</strong>
      <span class="muted">${escapeHtml(event.obra || "Sin obra")} · ${escapeHtml(event.contratista || "Sin contratista")}</span>
      <span class="muted">${event.ingreso?.fecha ? `Ingreso ${formatDate(event.ingreso.fecha)}` : "Sin ingreso"}${event.retiro?.fecha ? ` · Retiro ${formatDate(event.retiro.fecha)}` : ""}</span>
    </article>
  `;
}

function fact(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "Sin dato")}</dd></div>`;
}

function emptyState(message) {
  return `<div class="empty-state"><p>${escapeHtml(message)}</p></div>`;
}

function emptyRow(message) {
  return `<article class="work-item"><div><strong>${escapeHtml(message)}</strong></div></article>`;
}

function findOrCreateEvent(workerId, month, create = true) {
  let event = state.data.events.find((item) => item.workerId === workerId && item.month === month);
  if (!event && create) {
    const worker = getWorker(workerId) ?? {};
    event = blankEvent(workerId, month);
    event.obra = worker.obra || null;
    event.contratista = worker.contratista || null;
    event.eps = worker.eps || null;
    event.pension = worker.pension || null;
    state.data.events.push(event);
  }
  return event;
}

function blankEvent(workerId, month) {
  return {
    id: `${month}-${workerId}-${Date.now()}`,
    workerId,
    month,
    sourceSheet: "Dashboard",
    sourceCell: null,
    obra: null,
    contratista: null,
    eps: null,
    pension: null,
    ingreso: { fecha: null, arlOk: false, epsOk: false, pilaOk: false },
    retiro: { fecha: null, arlOk: false, epsOk: false, pilaOk: false },
  };
}

function updateEventPath(workerId, path, input) {
  const event = findOrCreateEvent(workerId, state.filters.month, true);
  const [group, field] = path.split(".");
  if (!event[group]) event[group] = {};
  event[group][field] = input.type === "checkbox" ? input.checked : input.value || null;
  saveData();
  render();
  toast("Novedad actualizada");
}

function openWorkerDialog(workerId = null) {
  const dialog = $("#workerDialog");
  const form = $("#workerForm");
  form.reset();
  const worker = workerId ? getWorker(workerId) : null;
  $("#dialogTitle").textContent = worker ? "Editar trabajador" : "Registrar trabajador";
  form.workerId.value = worker?.id || "";
  form.nombres.value = worker?.nombres || "";
  form.apellidos.value = worker?.apellidos || "";
  form.cedula.value = worker?.cedula || "";
  form.direccion.value = worker?.direccion || "";
  form.telefono.value = worker?.telefono || "";
  form.correo.value = worker?.correo || "";
  form.eps.value = worker?.eps || "";
  form.pension.value = worker?.pension || "";
  form.obra.value = worker?.obra || "";
  form.contratista.value = worker?.contratista || "";
  form.createIngreso.checked = !worker;
  form.ingresoFecha.value = new Date().toISOString().slice(0, 10);
  form.ingresoArl.checked = false;
  form.ingresoEps.checked = false;
  form.ingresoPila.checked = false;
  dialog.showModal();
  refreshIcons();
}

function saveWorkerFromForm(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  const existingId = values.workerId || workerIdFromCedula(values.cedula);
  let worker = getWorker(existingId);
  const existingByDoc = state.data.workers.find((item) => documentKey(item.cedula) === documentKey(values.cedula));
  if (!worker && existingByDoc) worker = existingByDoc;

  if (!worker) {
    worker = { id: existingId, source: { sheet: "Dashboard" } };
    state.data.workers.push(worker);
  }

  ["nombres", "apellidos", "cedula", "direccion", "telefono", "correo", "eps", "pension", "obra", "contratista"].forEach((field) => {
    worker[field] = values[field]?.trim() || null;
  });

  if (form.createIngreso.checked) {
    const event = findOrCreateEvent(worker.id, state.filters.month, true);
    event.obra = worker.obra;
    event.contratista = worker.contratista;
    event.eps = worker.eps;
    event.pension = worker.pension;
    event.ingreso.fecha = values.ingresoFecha || null;
    event.ingreso.arlOk = form.ingresoArl.checked;
    event.ingreso.epsOk = form.ingresoEps.checked;
    event.ingreso.pilaOk = form.ingresoPila.checked;
  }

  state.selectedWorkerId = worker.id;
  saveData();
  $("#workerDialog").close();
  render();
  toast("Trabajador guardado");
}

function toggleMonthClosed() {
  const month = state.filters.month;
  const closed = state.data.settings.closedMonths;
  if (closed.includes(month)) {
    state.data.settings.closedMonths = closed.filter((item) => item !== month);
    toast("Mes reabierto");
  } else {
    state.data.settings.closedMonths.push(month);
    toast("Mes marcado como liquidado");
  }
  saveData();
  render();
}

function previousMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function docParts(cedula) {
  const raw = String(cedula ?? "").toUpperCase().replace(/\./g, "").trim();
  const typeMatch = raw.match(/^(PT|PE|CE|TI|CC)\s*/);
  const docType = typeMatch?.[1] || "CC";
  const document = raw.replace(/^(PT|PE|CE|TI|CC)\s*/, "").replace(/[^A-Z0-9]/g, "");
  return {
    docType,
    document,
    key: docType === "CC" ? document : `${docType}${document}`,
  };
}

function planillaReferenceFor(worker) {
  const parts = docParts(worker.cedula);
  const employees = window.PLANILLA_REFERENCE?.employees || [];
  return employees.find((item) => item.key === parts.key || item.document === parts.document) || null;
}

function dateIsIso(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""));
}

function dateInMonth(value, month) {
  return dateIsIso(value) && value.startsWith(month);
}

function pilaDay(value) {
  if (!dateIsIso(value)) return null;
  return Math.min(30, Math.max(1, Number(value.slice(8, 10))));
}

function computePilaDays(event, month) {
  let start = 1;
  let end = 30;
  let hasMonthDate = false;
  if (dateInMonth(event.ingreso?.fecha, month)) {
    start = pilaDay(event.ingreso.fecha);
    hasMonthDate = true;
  }
  if (dateInMonth(event.retiro?.fecha, month)) {
    end = pilaDay(event.retiro.fecha);
    hasMonthDate = true;
  }
  if (!hasMonthDate) return 30;
  return Math.max(0, end - start + 1);
}

function planillaIssuesForNovedad(event, worker, ref, type) {
  const issues = [];
  const group = type === "ING" ? event.ingreso : event.retiro;
  const label = type === "ING" ? "ingreso" : "retiro";
  if (!group?.fecha) issues.push(`Sin fecha de ${label}`);
  if (group?.fecha && !dateIsIso(group.fecha)) issues.push(`Fecha de ${label} no normalizada`);
  if (group?.fecha && !dateInMonth(group.fecha, event.month)) issues.push(`${label} fuera del mes seleccionado`);
  if (type === "ING" && group?.fecha && !group.arlOk) issues.push("Ingreso sin ARL confirmada");
  if (type === "ING" && group?.fecha && !group.epsOk) issues.push("Ingreso sin EPS confirmada");
  if (type === "RET" && group?.fecha && !group.epsOk) issues.push("Retiro EPS pendiente");
  if (event.ingreso?.fecha && event.retiro?.fecha) {
    const ingresoTime = parseDateLike(event.ingreso.fecha, event.month)?.getTime() ?? 0;
    const retiroTime = parseDateLike(event.retiro.fecha, event.month)?.getTime() ?? 0;
    if (retiroTime && ingresoTime && retiroTime < ingresoTime) issues.push("Retiro anterior al ingreso");
  }
  if (!(event.eps || worker.eps)) issues.push("Sin EPS base");
  if (!ref) issues.push("Sin referencia en Planilla liquidacion para códigos");
  return issues;
}

function officialPlanillaHeaders() {
  return [
    ["numero", "No."],
    ["tipoId", "Tipo ID"],
    ["noId", "No ID"],
    ["anio", "Año"],
    ["mes", "Mes"],
    ["tipoNovedad", "Tipo de Novedad"],
    ["valorTotal", "Valor Total"],
    ["ajustarValor", "Ajustar Valor de la Novedad"],
    ["aportesParafiscales", "Realizar Aportes Parafiscales"],
    ["inicial", "Inicial"],
    ["duracion", "Duración"],
    ["tipoIngresoRetiro", "Tipo de Ingreso o Retiro"],
    ["vstParafiscales", "La variacion de salario aplica para el IBC de Parafiscales"],
    ["vstSena", "La variacion de salario aplica para el IBC de SENA e ICBF"],
    ["ige100", "Cotizar los Días de la Incapacidad con el 100% del Salario"],
    ["tipoLicencia", "Tipo de Licencia"],
    ["tarifaPension", "Tarifa de Pensión"],
    ["tipoVacaciones", "Tipo de Vacaciones"],
    ["horasLaboradas", "Total Horas Laboradas Mes"],
    ["tipoLma", "Tipo de Licencia de Maternidad"],
  ];
}

function buildPlanillaRows() {
  const events = selectedMonthEvents()
    .filter((event) => event.ingreso?.fecha || event.retiro?.fecha)
    .sort((a, b) => fullName(getEventWorker(a)).localeCompare(fullName(getEventWorker(b)), "es"));

  let counter = 0;
  return events.flatMap((event) => {
    const worker = getEventWorker(event);
    const parts = docParts(worker.cedula);
    const ref = planillaReferenceFor(worker);
    const [year, month] = state.filters.month.split("-");
    const base = {
      tipoId: ref?.docType || parts.docType,
      noId: ref?.document || parts.document,
      anio: Number(year),
      mes: Number(month),
      valorTotal: 0,
      ajustarValor: "NO",
      aportesParafiscales: "NO",
      duracion: 0,
      tipoIngresoRetiro: "Todos los sistemas (ARL, AFP, CCF, EPS)",
      vstParafiscales: "SI",
      vstSena: "NO",
      ige100: "NO",
      tipoLicencia: "LICENCIA NO REMUNERADA",
      tarifaPension: "TARIFA DEL EMPLEADOR",
      tipoVacaciones: "VACACIONES",
      horasLaboradas: 0,
      tipoLma: "LICENCIA DE MATERNIDAD (LMA)",
      nombreCompleto: fullName(worker),
      obra: event.obra || worker.obra || "",
      contratista: event.contratista || worker.contratista || "",
      eps: event.eps || worker.eps || "",
      pension: event.pension || worker.pension || "",
      dias: computePilaDays(event, state.filters.month),
      codigoPension: ref?.pensionCode || "",
      codigoSalud: ref?.healthCode || "",
      codigoCcf: ref?.ccfCode || "",
      codigoArl: ref?.arlCode || "",
      ibcReferencia: ref?.healthIbc || ref?.pensionIbc || "",
    };

    const rows = [];
    if (event.ingreso?.fecha) {
      const issues = planillaIssuesForNovedad(event, worker, ref, "ING");
      rows.push({
        ...base,
        numero: ++counter,
        tipoNovedad: "INGRESO (ING)",
        inicial: pilaDay(event.ingreso.fecha) || 0,
        fechaCompleta: event.ingreso.fecha,
        estado: issues.length ? "REVISAR" : "OK",
        observaciones: issues.join(" | "),
      });
    }
    if (event.retiro?.fecha) {
      const issues = planillaIssuesForNovedad(event, worker, ref, "RET");
      rows.push({
        ...base,
        numero: ++counter,
        tipoNovedad: "RETIRO DE LA EMPRESA (RET)",
        inicial: pilaDay(event.retiro.fecha) || 0,
        fechaCompleta: event.retiro.fecha,
        estado: issues.length ? "REVISAR" : "OK",
        observaciones: issues.join(" | "),
      });
    }
    return rows;
  });
}

function validationHeaders() {
  return [
    ["numero", "No."],
    ["nombreCompleto", "Trabajador"],
    ["tipoId", "Tipo ID"],
    ["noId", "No ID"],
    ["tipoNovedad", "Novedad"],
    ["fechaCompleta", "Fecha completa"],
    ["dias", "Días cotizados estimados"],
    ["obra", "Obra"],
    ["contratista", "Contratista"],
    ["eps", "EPS"],
    ["pension", "Pensión"],
    ["codigoPension", "Código pensión"],
    ["codigoSalud", "Código salud"],
    ["codigoCcf", "Código CCF"],
    ["codigoArl", "Código ARL"],
    ["ibcReferencia", "IBC referencia"],
    ["estado", "Estado validación"],
    ["observaciones", "Observaciones"],
  ];
}

function settlementExportHeaders() {
  return [
    ["numero", "No."],
    ["tipoDocumento", "Tipo doc"],
    ["identificacion", "Identificación"],
    ["nombreCompleto", "Nombre"],
    ["obra", "Obra"],
    ["contratista", "Contratista"],
    ["eps", "EPS"],
    ["pension", "Pensión"],
    ["origen", "Origen liquidación"],
    ["ingreso", "Fecha ingreso"],
    ["retiro", "Fecha retiro"],
    ["dias", "Días estimados"],
    ["estado", "Estado"],
    ["pendientes", "Pendientes"],
  ];
}

function buildSettlementExportRows() {
  return buildSettlementRows().map((row, index) => {
    const worker = row.worker;
    const event = row.event;
    const parts = docParts(worker.cedula);
    const ref = planillaReferenceFor(worker);
    const pending = event
      ? [
          ...(event.ingreso?.fecha ? planillaIssuesForNovedad(event, worker, ref, "ING") : []),
          ...(event.retiro?.fecha ? planillaIssuesForNovedad(event, worker, ref, "RET") : []),
        ]
      : [];
    return {
      numero: index + 1,
      tipoDocumento: parts.docType,
      identificacion: parts.document,
      nombreCompleto: fullName(worker),
      obra: event?.obra || worker.obra || "",
      contratista: event?.contratista || worker.contratista || "",
      eps: event?.eps || worker.eps || "",
      pension: event?.pension || worker.pension || "",
      origen: row.category,
      ingreso: event?.ingreso?.fecha || "",
      retiro: event?.retiro?.fecha || "",
      dias: event ? computePilaDays(event, state.filters.month) : 30,
      estado: row.liquidationStatus,
      pendientes: pending.join(" | "),
    };
  });
}

function exportPlanillaXlsx() {
  const headers = officialPlanillaHeaders();
  const rows = buildPlanillaRows();
  const settlementRows = buildSettlementExportRows();
  if (!rows.length && !settlementRows.length) {
    toast("No hay trabajadores para exportar en este mes");
    return;
  }

  const meta = window.PLANILLA_REFERENCE?.meta || {};
  const novedades = [
    [],
    [],
    [],
    [],
    [],
    [],
    ["Identificación", "", "", "Periodo Pensión", "", "Novedad", "", "", "", "Días", "", "ING y RET", "VST", "", "IGE", "SLN", "", "VAC", "VHL", "LMA"],
    headers.map(([, label]) => label),
    ...rows.map((row) => headers.map(([key]) => row[key])),
  ];

  if (!window.XLSX) {
    exportPlanillaCsv(rows, headers);
    toast("XLSX no disponible; exporté CSV");
    return;
  }

  const worksheet = XLSX.utils.aoa_to_sheet(novedades);
  worksheet["!cols"] = headers.map(([, label]) => ({ wch: Math.max(12, Math.min(28, label.length + 4)) }));
  worksheet["!cols"][2] = { wch: 18 };
  worksheet["!cols"][5] = { wch: 30 };
  worksheet["!merges"] = [
    { s: { r: 6, c: 0 }, e: { r: 6, c: 2 } },
    { s: { r: 6, c: 3 }, e: { r: 6, c: 4 } },
    { s: { r: 6, c: 5 }, e: { r: 6, c: 8 } },
    { s: { r: 6, c: 9 }, e: { r: 6, c: 10 } },
    { s: { r: 6, c: 12 }, e: { r: 6, c: 13 } },
    { s: { r: 6, c: 15 }, e: { r: 6, c: 16 } },
  ];
  worksheet["!autofilter"] = { ref: `A8:T${rows.length + 8}` };
  const validation = [
    ["Validación dashboard"],
    ["Aportante", meta.aportante || "", "NIT", meta.nit || "", "DV", meta.dv || ""],
    ["Periodo pensión", previousMonthKey(state.filters.month), "Periodo salud", state.filters.month, "Fuente", meta.sourceFile || ""],
    [],
    validationHeaders().map(([, label]) => label),
    ...rows.map((row) => validationHeaders().map(([key]) => row[key])),
  ];
  const validationSheet = XLSX.utils.aoa_to_sheet(validation);
  validationSheet["!cols"] = validationHeaders().map(([, label]) => ({ wch: Math.max(14, Math.min(36, label.length + 4)) }));
  validationSheet["!cols"][17] = { wch: 62 };
  const settlementHeaders = settlementExportHeaders();
  const settlement = [
    ["Base de liquidación mensual"],
    ["Regla", "Vienen activos de meses anteriores + todas las novedades del mes seleccionado"],
    ["Mes", state.filters.month],
    [],
    settlementHeaders.map(([, label]) => label),
    ...settlementRows.map((row) => settlementHeaders.map(([key]) => row[key])),
  ];
  const settlementSheet = XLSX.utils.aoa_to_sheet(settlement);
  settlementSheet["!cols"] = settlementHeaders.map(([, label]) => ({ wch: Math.max(14, Math.min(34, label.length + 4)) }));
  settlementSheet["!cols"][3] = { wch: 34 };
  settlementSheet["!cols"][13] = { wch: 58 };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Novedades");
  XLSX.utils.book_append_sheet(workbook, settlementSheet, "Liquidacion");
  XLSX.utils.book_append_sheet(workbook, validationSheet, "Validacion");
  XLSX.writeFile(workbook, `planilla-novedades-${state.filters.month}.xlsx`);
}

function exportJson() {
  downloadFile(`seguridad-social-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state.data, null, 2), "application/json");
}

function exportPilaCsv() {
  const headers = officialPlanillaHeaders();
  const rows = buildPlanillaRows();
  if (!rows.length) {
    toast("No hay novedades para exportar en este mes");
    return;
  }
  const csv = [
    headers.map(([, label]) => label),
    ...rows.map((row) => headers.map(([key]) => row[key])),
  ].map((row) => row.map(csvCell).join(",")).join("\n");
  downloadFile(`pila-${state.filters.month}.csv`, csv, "text/csv;charset=utf-8");
}

function exportPlanillaCsv(rows, headers) {
  const csv = [
    headers.map(([, label]) => label),
    ...rows.map((row) => headers.map(([key]) => row[key])),
  ].map((row) => row.map(csvCell).join(",")).join("\n");
  downloadFile(`planilla-novedades-${state.filters.month}.csv`, csv, "text/csv;charset=utf-8");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      state.data = ensureDataShape(parsed);
      state.filters.month = state.data.settings.defaultMonth || latestMonth(state.data.events);
      saveData();
      render();
      toast("Datos importados");
    } catch (error) {
      toast("El JSON no se pudo importar");
    }
  };
  reader.readAsText(file);
}

function resetToSeed() {
  if (!confirm("¿Restaurar los datos semilla extraídos del Excel?")) return;
  state.data = ensureDataShape(clone(window.SEED_DATA));
  state.filters.month = state.data.settings.defaultMonth;
  state.selectedWorkerId = null;
  saveData();
  $("#workerDialog").close();
  render();
  toast("Datos restaurados");
}

function toast(message) {
  $(".toast")?.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), 2200);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function bindEvents() {
  $$(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      render();
    });
  });

  $("#searchInput").addEventListener("input", (event) => {
    state.filters.search = event.target.value;
    render();
  });
  $("#monthSelect").addEventListener("change", (event) => {
    state.filters.month = event.target.value;
    state.data.settings.defaultMonth = event.target.value;
    saveData();
    render();
  });
  $("#contractorSelect").addEventListener("change", (event) => {
    state.filters.contractor = event.target.value;
    render();
  });
  $("#epsSelect").addEventListener("change", (event) => {
    state.filters.eps = event.target.value;
    render();
  });
  $("#clearFiltersBtn").addEventListener("click", () => {
    state.filters.search = "";
    state.filters.contractor = "";
    state.filters.eps = "";
    render();
  });

  $("#newWorkerBtn").addEventListener("click", () => openWorkerDialog());
  $("#exportPlanillaBtn").addEventListener("click", exportPlanillaXlsx);
  $("#exportJsonBtn").addEventListener("click", exportJson);
  $("#exportPilaBtn").addEventListener("click", exportPilaCsv);
  $("#importJsonBtn").addEventListener("click", () => $("#jsonFileInput").click());
  $("#jsonFileInput").addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) importJson(file);
    event.target.value = "";
  });
  $("#resetDataBtn").addEventListener("click", resetToSeed);

  $("#workerForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveWorkerFromForm(event.currentTarget);
  });
  $$("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => $("#workerDialog").close()));

  document.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    const workerRowNode = event.target.closest("tr[data-worker-id], article[data-worker-id]");
    if (actionButton) {
      const action = actionButton.dataset.action;
      if (action === "select-worker") {
        state.selectedWorkerId = actionButton.dataset.workerId;
        render();
      }
      if (action === "edit-worker") openWorkerDialog(actionButton.dataset.workerId);
      if (action === "view-active") {
        state.view = "activos";
        render();
      }
      if (action === "view-liquidation") {
        state.view = "liquidacion";
        render();
      }
      if (action === "toggle-month") toggleMonthClosed();
      return;
    }
    if (workerRowNode?.dataset.workerId) {
      state.selectedWorkerId = workerRowNode.dataset.workerId;
      render();
    }
  });

  document.addEventListener("change", (event) => {
    const input = event.target.closest(".event-input");
    if (!input) return;
    const container = input.closest(".event-editor");
    updateEventPath(container.dataset.workerId, input.dataset.path, input);
  });
}

function init() {
  state.data = loadData();
  state.filters.month = state.data.settings.defaultMonth || latestMonth(state.data.events) || currentMonthKey();
  bindEvents();
  render();
}

init();
