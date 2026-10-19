// Seattle Public Library checkout dashboard.
// All data is loaded at runtime from dashboard_data/*.csv (never embedded here).
// The CSV files are written by the Python scripts in ../scripts/ (see PROVENANCE.md).

const DATA_DIR = "dashboard_data/";
const FILES = {
  annual: "annual_digital_physical_share.csv",
  materialDigital: "digital_material_type_shares_by_year.csv",
  materialPhysical: "physical_material_type_shares_by_year.csv",
  titlesDigital: "digital_top_sampled_titles_by_year.csv",
  titlesPhysical: "physical_top_sampled_titles_by_year.csv",
};

// Duke palette (Session 2 duke-figures skill)
const COLORS = {
  Physical: "#012169", // Duke Navy
  Digital: "#C84E00",  // Copper
  // All series colors have at least 3:1 contrast with the white background (WCAG 1.4.11).
  types: ["#012169", "#C84E00", "#0577B1", "#1D6363", "#993399"], // Navy, Copper, Shale Blue, Magnolia, Ironweed
  other: "#666666", // Graphite
  ink: "#262626",
  muted: "#5c5c5c",
  grid: "#E5E5E5",
};
const TOP_TYPES = 5;

const numberFormat = new Intl.NumberFormat("en-US");
const state = { matClass: "Digital", matView: "stacked", titleClass: "Digital", titleYear: null };
const charts = {};
let data = {};
let raceTimer = null;

// ---------- Loading ----------

function loadCsv(fileName) {
  return fetch(DATA_DIR + fileName).then(function (response) {
    if (!response.ok) {
      throw new Error("Could not load " + fileName + " (HTTP " + response.status + ")");
    }
    return response.text();
  }).then(function (text) {
    const parsed = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true });
    return parsed.data;
  });
}

function setStatus(message, isError) {
  const status = document.getElementById("load-status");
  status.textContent = message;
  status.classList.toggle("error", Boolean(isError));
}

// ---------- Shared helpers ----------

function baseTextStyle() {
  return { fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif", color: COLORS.ink };
}

function makeChart(elementId) {
  const chart = echarts.init(document.getElementById(elementId), null, { renderer: "svg" });
  charts[elementId] = chart;
  return chart;
}

function setPressed(attribute, value) {
  document.querySelectorAll("[" + attribute + "]").forEach(function (button) {
    button.setAttribute("aria-pressed", String(button.getAttribute(attribute) === value));
  });
}

// ---------- KPIs + annual share ----------

function renderAnnual() {
  const completeYears = data.annual.filter(function (row) { return row.complete_year === true || row.complete_year === "True"; });
  const years = completeYears.map(function (row) { return row.year; });
  const latest = completeYears[completeYears.length - 1];

  // First complete year with more digital than physical checkouts
  const crossover = completeYears.find(function (row) { return row.digital_checkouts > row.physical_checkouts; });
  // Peak physical year
  let peak = completeYears[0];
  completeYears.forEach(function (row) { if (row.physical_checkouts > peak.physical_checkouts) { peak = row; } });
  const first = completeYears[0];

  document.getElementById("kpi-share").textContent = latest.digital_share_pct.toFixed(1) + "%";
  document.getElementById("kpi-share-label").textContent = "Digital share of checkouts in " + latest.year;
  document.getElementById("kpi-cross").textContent = crossover ? String(crossover.year) : "none";
  document.getElementById("kpi-peak").textContent = (peak.physical_checkouts / 1e6).toFixed(1) + "M";
  document.getElementById("kpi-peak-label").textContent = "Physical checkouts at their peak (" + peak.year + ")";

  document.getElementById("share-finding").textContent =
    "Digital went from " + first.digital_share_pct.toFixed(1) + "% of checkouts in " + first.year +
    " to " + latest.digital_share_pct.toFixed(1) + "% in " + latest.year +
    (crossover ? ", and passed physical for the first time in " + crossover.year + "." : ".");

  const chart = makeChart("share-chart");
  chart.setOption({
    textStyle: baseTextStyle(),
    grid: { left: 56, right: 92, top: 32, bottom: 40 },
    tooltip: {
      trigger: "axis",
      valueFormatter: function (value) { return value.toFixed(1) + "%"; },
    },
    xAxis: { type: "category", data: years, axisLabel: { fontSize: 14 }, axisLine: { lineStyle: { color: COLORS.ink } } },
    yAxis: {
      type: "value", min: 0, max: 100,
      axisLabel: { fontSize: 14, formatter: "{value}%" }, splitLine: { lineStyle: { color: COLORS.grid } },
    },
    series: ["Physical", "Digital"].map(function (usageClass) {
      const column = usageClass === "Physical" ? "physical_share_pct" : "digital_share_pct";
      return {
        name: usageClass,
        type: "line",
        data: completeYears.map(function (row) { return row[column]; }),
        lineStyle: { width: 4, color: COLORS[usageClass], type: usageClass === "Physical" ? "solid" : "solid" },
        itemStyle: { color: COLORS[usageClass] },
        symbol: usageClass === "Physical" ? "circle" : "rect",
        symbolSize: 9,
        endLabel: { show: true, formatter: "{a}", fontSize: 15, fontWeight: "bold", color: COLORS[usageClass] },
        markLine: usageClass === "Digital" && crossover ? {
          silent: true, symbol: "none",
          lineStyle: { color: COLORS.muted, type: "dashed", width: 1.5 },
          label: { formatter: crossover.year + ": digital passes physical", color: COLORS.muted, fontSize: 13 },
          data: [{ xAxis: String(crossover.year) }],
        } : undefined,
      };
    }),
  });
}

// ---------- Material types ----------

function materialRows(usageClass) {
  return usageClass === "Digital" ? data.materialDigital : data.materialPhysical;
}

// Pick the largest types by total sampled checkouts across all years (a display choice, not a new statistic).
function topTypes(rows) {
  const totals = {};
  rows.forEach(function (row) {
    totals[row.materialtype] = (totals[row.materialtype] || 0) + row.sampled_checkouts;
  });
  return Object.keys(totals).sort(function (a, b) { return totals[b] - totals[a]; }).slice(0, TOP_TYPES);
}

// Reshape the long CSV rows into {type: [share per year]} for the chart, grouping small types as "Other types".
function sharesByType(rows, years, types) {
  const byType = {};
  types.concat(["Other types"]).forEach(function (type) { byType[type] = years.map(function () { return 0; }); });
  rows.forEach(function (row) {
    const yearIndex = years.indexOf(row.year);
    const key = types.indexOf(row.materialtype) >= 0 ? row.materialtype : "Other types";
    byType[key][yearIndex] += row.checkout_share_pct;
  });
  Object.keys(byType).forEach(function (type) {
    byType[type] = byType[type].map(function (value) { return Math.round(value * 100) / 100; });
  });
  return byType;
}

function topTypePerYear(rows) {
  const best = {};
  rows.forEach(function (row) {
    if (!best[row.year] || row.checkout_share_pct > best[row.year].checkout_share_pct) { best[row.year] = row; }
  });
  return best;
}

function renderMaterialFinding() {
  const rows = materialRows(state.matClass);
  const best = topTypePerYear(rows);
  const years = Object.keys(best).map(Number).sort(function (a, b) { return a - b; });

  // Find the year the leading type changed most recently, and how long the current leader has led.
  const latestLeader = best[years[years.length - 1]].materialtype;
  let firstYearOfStreak = years[years.length - 1];
  for (let i = years.length - 1; i >= 0; i--) {
    if (best[years[i]].materialtype === latestLeader) { firstYearOfStreak = years[i]; } else { break; }
  }
  const firstLeader = best[years[0]].materialtype;
  const latestShare = best[years[years.length - 1]].checkout_share_pct;

  let text;
  if (firstLeader !== latestLeader) {
    text = state.matClass + ": " + firstLeader + " led in " + years[0] + ", but " + latestLeader +
      " has been the most borrowed type every year since " + firstYearOfStreak +
      " (" + latestShare.toFixed(1) + "% of sampled checkouts in " + years[years.length - 1] + ").";
  } else {
    text = state.matClass + ": " + latestLeader + " was the most borrowed type in every year from " + years[0] +
      " to " + years[years.length - 1] + ", reaching " + latestShare.toFixed(1) + "% of sampled checkouts in " +
      years[years.length - 1] + ".";
  }
  document.getElementById("mat-finding").textContent = text;
}

function renderMaterialStacked() {
  const rows = materialRows(state.matClass);
  const years = Array.from(new Set(rows.map(function (row) { return row.year; }))).sort(function (a, b) { return a - b; });
  const types = topTypes(rows);
  const byType = sharesByType(rows, years, types);
  const seriesNames = types.concat(["Other types"]);

  charts["mat-chart"].setOption({
    textStyle: baseTextStyle(),
    animationDuration: 500,
    grid: { left: 56, right: 16, top: 56, bottom: 40 },
    legend: { top: 0, left: 0, textStyle: { fontSize: 14 }, itemWidth: 16, itemHeight: 12 },
    tooltip: {
      trigger: "axis", axisPointer: { type: "shadow" },
      valueFormatter: function (value) { return value.toFixed(1) + "%"; },
    },
    xAxis: { type: "category", data: years, axisLabel: { fontSize: 14 } },
    yAxis: { type: "value", max: 100, axisLabel: { fontSize: 14, formatter: "{value}%" }, splitLine: { lineStyle: { color: COLORS.grid } } },
    series: seriesNames.map(function (type, index) {
      return {
        name: type, type: "bar", stack: "share", barWidth: "70%",
        data: byType[type],
        itemStyle: { color: index < TOP_TYPES ? COLORS.types[index] : COLORS.other, borderColor: "#fff", borderWidth: 1 },
        emphasis: { focus: "series" },
      };
    }),
  }, true);
  document.getElementById("mat-chart").setAttribute("aria-label",
    "Stacked bar chart of " + state.matClass.toLowerCase() + " material type shares by year, " + years[0] + " to " + years[years.length - 1]);
}

function renderMaterialRace() {
  const rows = materialRows(state.matClass);
  const years = Array.from(new Set(rows.map(function (row) { return row.year; }))).sort(function (a, b) { return a - b; });
  const types = topTypes(rows);
  const byType = sharesByType(rows, years, types);
  const names = types.concat(["Other types"]);
  const colorFor = {};
  names.forEach(function (name, index) { colorFor[name] = index < TOP_TYPES ? COLORS.types[index] : COLORS.other; });

  function frame(yearIndex) {
    return {
      yAxis: { data: names },
      series: [{ data: names.map(function (name) { return byType[name][yearIndex]; }) }],
      graphic: [{ type: "text", right: 24, bottom: 52, style: { text: String(years[yearIndex]), font: "bold 56px system-ui, sans-serif", fill: "rgba(1,33,105,0.18)" } }],
    };
  }

  charts["mat-chart"].setOption({
    textStyle: baseTextStyle(),
    grid: { left: 120, right: 64, top: 16, bottom: 40 },
    tooltip: { valueFormatter: function (value) { return value.toFixed(1) + "%"; } },
    xAxis: { type: "value", max: 100, axisLabel: { fontSize: 14, formatter: "{value}%" }, splitLine: { lineStyle: { color: COLORS.grid } } },
    yAxis: { type: "category", inverse: true, data: names, axisLabel: { fontSize: 14 }, animationDuration: 300, animationDurationUpdate: 300 },
    series: [{
      type: "bar", realtimeSort: true, name: "Share",
      data: names.map(function (name) { return byType[name][0]; }),
      itemStyle: { color: function (params) { return colorFor[params.name]; } },
      label: { show: true, position: "right", fontSize: 14, valueAnimation: true, formatter: function (p) { return p.value.toFixed(1) + "%"; } },
    }],
    animationDuration: 0,
    animationDurationUpdate: 900,
    animationEasing: "linear",
    animationEasingUpdate: "linear",
  }, true);
  charts["mat-chart"].setOption(frame(0));

  // Respect the "reduce motion" setting: show the latest year without animating.
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    charts["mat-chart"].setOption(frame(years.length - 1));
    return;
  }

  let yearIndex = 0;
  raceTimer = setInterval(function () {
    yearIndex += 1;
    if (yearIndex >= years.length) { clearInterval(raceTimer); raceTimer = null; return; }
    charts["mat-chart"].setOption(frame(yearIndex));
  }, 1000);
  document.getElementById("mat-chart").setAttribute("aria-label",
    "Animated bar chart race of " + state.matClass.toLowerCase() + " material type shares, one year at a time");
}

function renderMaterial() {
  if (raceTimer) { clearInterval(raceTimer); raceTimer = null; }
  renderMaterialFinding();
  if (state.matView === "race") { renderMaterialRace(); } else { renderMaterialStacked(); }
}

function renderMaterialGrid() {
  const digitalBest = topTypePerYear(data.materialDigital);
  const physicalBest = topTypePerYear(data.materialPhysical);
  const years = Object.keys(digitalBest).map(Number).sort(function (a, b) { return a - b; });
  const tableRows = years.map(function (year) {
    return {
      year: year,
      digitalType: digitalBest[year].materialtype,
      digitalShare: digitalBest[year].checkout_share_pct,
      physicalType: physicalBest[year] ? physicalBest[year].materialtype : "",
      physicalShare: physicalBest[year] ? physicalBest[year].checkout_share_pct : null,
    };
  });
  const percent = function (params) { return params.value == null ? "" : params.value.toFixed(1) + "%"; };
  agGrid.createGrid(document.getElementById("mat-grid"), {
    rowData: tableRows,
    columnDefs: [
      { field: "year", headerName: "Year", maxWidth: 110, sort: "asc" },
      { field: "digitalType", headerName: "Digital: top type" },
      { field: "digitalShare", headerName: "Digital share", valueFormatter: percent, type: "rightAligned" },
      { field: "physicalType", headerName: "Physical: top type" },
      { field: "physicalShare", headerName: "Physical share", valueFormatter: percent, type: "rightAligned" },
    ],
    defaultColDef: { flex: 1, minWidth: 120, sortable: true, resizable: true },
  });
}

// ---------- Top titles ----------

function titleRows(usageClass) {
  return usageClass === "Digital" ? data.titlesDigital : data.titlesPhysical;
}

function shortTitle(title, maxLength) {
  // Display only: trim catalogue suffixes so labels fit. The full title is in the tooltip.
  let text = String(title).split(" / ")[0];
  text = text.replace(/\s*\[videorecording\]/i, "");
  text = text.replace(/\s*\(unabridged\)/gi, "");
  text = text.replace(/\s*:\s*a novel\.?$/i, "");
  text = text.trim();
  if (text.length > maxLength) { text = text.slice(0, maxLength - 1).trim() + "…"; }
  return text;
}

function mainTitle(title) {
  // The part of the title before any subtitle, for use in sentences.
  return shortTitle(title, 200).split(/\s*:\s*/)[0];
}

function cleanCreator(creator) {
  // Display only: physical records use catalogue form "Last, First, 1957-". Turn it into "First Last".
  if (!creator) { return ""; }
  let text = String(creator).replace(/,?\s*\d{4}-(\d{4})?\.?$/, "").trim();
  const parts = text.split(",");
  if (parts.length === 2) { text = parts[1].trim() + " " + parts[0].trim(); }
  return text;
}

function titleLabel(row, maxLength) {
  // Rank, short title and format, so editions such as e-book and audiobook can be told apart.
  return row.rank + ". " + shortTitle(row.title, maxLength) + " (" + String(row.materialtype).toLowerCase() + ")";
}

function renderTitlesFinding() {
  const rows = titleRows(state.titleClass).filter(function (row) { return row.rank === 1; });
  let best = rows[0];
  rows.forEach(function (row) { if (row.sampled_checkouts > best.sampled_checkouts) { best = row; } });
  const author = best.creator ? " by " + cleanCreator(best.creator) : "";
  document.getElementById("titles-finding").textContent =
    "Biggest #1 in the " + state.titleClass.toLowerCase() + " sample: " + mainTitle(best.title) + author +
    " in " + best.year + ", with " + numberFormat.format(best.sampled_checkouts) +
    " sampled checkouts, the highest of any yearly #1 from 2006 to 2025.";
}

function renderTitles() {
  const rows = titleRows(state.titleClass)
    .filter(function (row) { return row.year === state.titleYear; })
    .sort(function (a, b) { return a.rank - b.rank; });
  renderTitlesFinding();
  // Narrow screens get shorter labels and a narrower label column.
  const isNarrow = document.getElementById("titles-chart").clientWidth < 600;
  const labelColumn = isNarrow ? 170 : 340;
  const maxTitleLength = isNarrow ? 14 : 36;
  charts["titles-chart"].setOption({
    textStyle: baseTextStyle(),
    animationDurationUpdate: 400,
    grid: { left: labelColumn, right: isNarrow ? 52 : 72, top: 8, bottom: 48 },
    tooltip: {
      trigger: "item",
      formatter: function (params) {
        const row = rows[params.dataIndex];
        const lines = [
          "<strong>#" + row.rank + " " + row.title + "</strong>",
          row.creator ? "By " + cleanCreator(row.creator) : "",
          row.materialtype + (row.publicationyear ? " · published " + row.publicationyear : ""),
          numberFormat.format(row.sampled_checkouts) + " sampled checkouts in " + row.sampled_months + " sampled months",
        ];
        return lines.filter(Boolean).join("<br>");
      },
      extraCssText: "max-width: 360px; white-space: normal;",
    },
    xAxis: { type: "value", name: "Sampled checkouts", nameLocation: "middle", nameGap: 28, nameTextStyle: { fontSize: 14 },
      // On narrow screens the bar labels already show the values, so the axis numbers are hidden.
      axisLabel: { show: !isNarrow, fontSize: 13 }, splitLine: { lineStyle: { color: COLORS.grid } } },
    yAxis: { type: "category", inverse: true, data: rows.map(function (row) { return titleLabel(row, maxTitleLength); }),
      axisLabel: { fontSize: isNarrow ? 12 : 14, width: labelColumn - 12, overflow: "truncate" } },
    series: [{
      type: "bar", data: rows.map(function (row) { return row.sampled_checkouts; }),
      itemStyle: { color: COLORS[state.titleClass], borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right", fontSize: 14, formatter: function (p) { return numberFormat.format(p.value); } },
      barMaxWidth: 30,
    }],
  }, true);
}

function fillYearSelect() {
  const years = Array.from(new Set(titleRows(state.titleClass).map(function (row) { return row.year; }))).sort(function (a, b) { return b - a; });
  const select = document.getElementById("title-year");
  select.innerHTML = "";
  years.forEach(function (year) {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = year;
    select.appendChild(option);
  });
  if (state.titleYear === null || years.indexOf(state.titleYear) < 0) { state.titleYear = years[0]; }
  select.value = state.titleYear;
}

// ---------- Wiring ----------

function wireControls() {
  document.querySelectorAll("[data-mat-class]").forEach(function (button) {
    button.addEventListener("click", function () {
      state.matClass = button.getAttribute("data-mat-class");
      setPressed("data-mat-class", state.matClass);
      renderMaterial();
    });
  });
  document.querySelectorAll("[data-mat-view]").forEach(function (button) {
    button.addEventListener("click", function () {
      state.matView = button.getAttribute("data-mat-view");
      setPressed("data-mat-view", state.matView);
      renderMaterial();
    });
  });
  document.querySelectorAll("[data-title-class]").forEach(function (button) {
    button.addEventListener("click", function () {
      state.titleClass = button.getAttribute("data-title-class");
      setPressed("data-title-class", state.titleClass);
      fillYearSelect();
      renderTitles();
    });
  });
  document.getElementById("title-year").addEventListener("change", function (event) {
    state.titleYear = Number(event.target.value);
    renderTitles();
  });
  window.addEventListener("resize", function () {
    Object.keys(charts).forEach(function (id) { charts[id].resize(); });
    renderTitles();
  });
}

Promise.all(Object.keys(FILES).map(function (key) {
  return loadCsv(FILES[key]).then(function (rows) { data[key] = rows; });
})).then(function () {
  setStatus("");
  renderAnnual();
  makeChart("mat-chart");
  renderMaterial();
  renderMaterialGrid();
  makeChart("titles-chart");
  fillYearSelect();
  renderTitles();
  wireControls();
}).catch(function (error) {
  setStatus(error.message + ". Open this page through a web server (for example: python -m http.server) rather than as a file.", true);
  console.error(error);
});
