// =====================
// Custom Year Picker toggle
// =====================
const USE_CUSTOM_YEAR_PICKER = true;

// =====================
// 1) Add your Mapbox token
// =====================
mapboxgl.accessToken = "pk.eyJ1IjoicGNlbnRlciIsImEiOiJjbWp3djNpMDM1ZGFyM2dxeDQzM2t2dnEyIn0.dd2wiFOBBm9P5cYjItXY7A";

// =====================
// 2) Create map
// =====================
const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/light-v11",
  center: [0, 20],
  zoom: 1.2,
  maxZoom: 16,
  // cooperativeGestures: true, // optional: nicer mobile scrolling in embeds
});

// map.setProjection("mercator"); // Activate this to make the map flat

map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");

// Optional: silently catch map errors (no console spam)
map.on("error", () => {});

// =====================
// 3) Load GeoJSON + clustered layers
// =====================
map.on("load", () => {
  // If you ever see stale data, you can enable cache busting:
  // const geojsonUrl = "./data/stories.geojson?v=" + Date.now();
  const geojsonUrl = "./data/stories.geojson";

  // ---- Source ----
  map.addSource("stories", {
    type: "geojson",
    data: geojsonUrl,
    cluster: true,
    clusterMaxZoom: 10,
    clusterRadius: 50,
  });

  // ---------------------
  // CLUSTERS
  // ---------------------
  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "stories",
    filter: ["has", "point_count"],
    paint: {
      "circle-radius": [
        "step",
        ["get", "point_count"],
        16,
        50,
        22,
        200,
        28,
        1000,
        34,
        5000,
        40,
      ],
      "circle-color": [
        "step",
        ["get", "point_count"],
        "#88c0d0",
        50,
        "#5e81ac",
        200,
        "#4c566a",
        1000,
        "#2e3440",
      ],
      "circle-opacity": 0.85,
      "circle-stroke-width": 1,
      "circle-stroke-color": "rgba(0,0,0,0.15)",
    },
  });

  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "stories",
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count_abbreviated}",
      "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
      "text-size": 12,
    },
    paint: {
      "text-color": "#ffffff",
    },
  });

  // ---------------------
  // UNCLUSTERED POINTS
  // ---------------------
  map.addLayer({
    id: "unclustered-point",
    type: "circle",
    source: "stories",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": 5,
      "circle-color": "#d08770",
      "circle-stroke-width": 1,
      "circle-stroke-color": "rgba(0,0,0,0.25)",
    },
  });

  // ---------------------
  // YEAR FILTER (Custom picker v2, no search, works with clustering)
  // ---------------------
  const yearSelect = document.getElementById("yearFilter");

  // Custom picker elements
  const yearPicker = document.getElementById("yearPicker");
  const yearPickerBtn = document.getElementById("yearPickerBtn");
  const yearPickerLabel = document.getElementById("yearPickerLabel");
  const yearPickerPanel = document.getElementById("yearPickerPanel");
  const yearPickerList = document.getElementById("yearPickerList");

  let allGeojson = null;
  let availableYears = []; // includes "all" + years (desc)
  let currentYear = "all";

  function labelForYear(y) {
    return y === "all" ? "All" : y;
  }

  function setSourceToYear(selectedYear) {
    if (!allGeojson) return;

    const y = String(selectedYear || "all");
    const src = map.getSource("stories");
    if (!src) return;

    currentYear = y;

    if (y === "all") {
      src.setData(allGeojson);
      return;
    }

    src.setData({
      type: "FeatureCollection",
      features: allGeojson.features.filter((f) => {
        const fy = (f?.properties?.year ?? "").toString().trim();
        return fy === y;
      }),
    });
  }

  function buildYearsFromData(data) {
    const yearsSet = new Set();

    for (const f of data.features || []) {
      const y = f?.properties?.year;
      if (y && String(y).trim()) yearsSet.add(String(y).trim());
    }

    const sortedYearsDesc = Array.from(yearsSet).sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);

      // numeric sort desc if possible
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na;

      // fallback string desc
      return b.localeCompare(a);
    });

    availableYears = ["all", ...sortedYearsDesc];
  }

  // Native select fallback (hidden, but kept in sync)
  function populateNativeSelect() {
    if (!yearSelect) return;

    while (yearSelect.options.length > 1) yearSelect.remove(1);

    for (const y of availableYears) {
      if (y === "all") continue;
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      yearSelect.appendChild(opt);
    }

    yearSelect.value = currentYear;

    // bind only once
    if (!yearSelect.dataset.bound) {
      yearSelect.addEventListener("change", (e) => setSourceToYear(e.target.value));
      yearSelect.dataset.bound = "true";
    }
  }

  function renderPickerList() {
    if (!yearPickerList) return;

    yearPickerList.innerHTML = "";

    for (const y of availableYears) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "yearpicker-item";
      btn.setAttribute("role", "option");
      btn.dataset.value = y;
      btn.textContent = labelForYear(y);
      btn.setAttribute("aria-selected", y === currentYear ? "true" : "false");

      btn.addEventListener("click", () => {
        setSourceToYear(y);

        if (yearPickerLabel) yearPickerLabel.textContent = labelForYear(y);
        if (yearSelect) yearSelect.value = y;

        closePicker();
      });

      yearPickerList.appendChild(btn);
    }
  }

  function openPicker() {
    if (!yearPickerPanel) return;
    yearPickerPanel.hidden = false;
    if (yearPickerBtn) yearPickerBtn.setAttribute("aria-expanded", "true");
    renderPickerList();
  }

  function closePicker() {
    if (!yearPickerPanel) return;
    yearPickerPanel.hidden = true;
    if (yearPickerBtn) yearPickerBtn.setAttribute("aria-expanded", "false");
  }

  function initCustomPicker() {
    if (!yearPicker || !yearPickerBtn || !yearPickerPanel || !yearPickerLabel) return;

    yearPickerLabel.textContent = labelForYear(currentYear);

    // button toggle (bind once)
    if (!yearPickerBtn.dataset.bound) {
      yearPickerBtn.addEventListener("click", () => {
        const isOpen = yearPickerBtn.getAttribute("aria-expanded") === "true";
        if (isOpen) closePicker();
        else openPicker();
      });
      yearPickerBtn.dataset.bound = "true";
    }

    // close when clicking outside (bind once)
    if (!document.body.dataset.yearpickerBound) {
      document.addEventListener("click", (e) => {
        if (!yearPickerPanel || yearPickerPanel.hidden) return;
        if (yearPicker && !yearPicker.contains(e.target)) closePicker();
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closePicker();
      });

      document.body.dataset.yearpickerBound = "true";
    }

    renderPickerList();
  }

  // Load full GeoJSON once to populate UI + allow filtering via setData()
  fetch(geojsonUrl)
    .then((r) => r.json())
    .then((data) => {
      allGeojson = data;

      buildYearsFromData(data);

      // default selection
      setSourceToYear("all");

      // keep native select in sync (hidden)
      populateNativeSelect();

      if (USE_CUSTOM_YEAR_PICKER) {
        if (yearPicker) yearPicker.style.display = "";
        if (yearSelect) yearSelect.style.display = "none";
        initCustomPicker();
      } else {
        if (yearPicker) yearPicker.style.display = "none";
        if (yearSelect) yearSelect.style.display = "";
      }
    })
    .catch(() => {
      // If fetch fails, dropdown won't populate but the map still works.
    });

  // ---------------------
  // Interactions
  // ---------------------

  // Click cluster → zoom into it
  map.on("click", "clusters", (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
    if (!features.length) return;

    const clusterId = features[0].properties.cluster_id;

    map.getSource("stories").getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;
      map.easeTo({
        center: features[0].geometry.coordinates,
        zoom,
      });
    });
  });

  // Click point → popup
  map.on("click", "unclustered-point", (e) => {
    const feature = e.features?.[0];
    if (!feature) return;

    const props = feature.properties || {};

    const date = decodeEntities(props.date ?? "");
    const title = decodeEntities(props.title ?? "Story");
    const author = decodeEntities(props.author ?? "");
    const outlet = decodeEntities(props.outlet ?? "");
    const url = props.url ?? "#";
    const thumbnail = props.thumbnail ?? "";

    // Anti-meridian wrap fix
    const coordinates = feature.geometry.coordinates.slice();
    while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
      coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
    }

    const authorLine = author
      ? `<div class="popup-meta"><span class="popup-label">By</span> ${escapeHtml(author)}</div>`
      : "";

    const outletLine = outlet
      ? `<div class="popup-meta"><span class="popup-label">Outlet</span> ${escapeHtml(outlet)}</div>`
      : "";

    const thumbBlock = isProbablyUrl(thumbnail)
      ? `
        <a class="popup-thumb" href="${escapeAttr(thumbnail)}" target="_blank" rel="noopener noreferrer">
          <img src="${escapeAttr(thumbnail)}" alt="" loading="lazy" />
        </a>
      `
      : "";

    const popupHtml = `
      <div class="popup-date"><b>${escapeHtml(date)}</b></div>
      <div class="popup-title">${escapeHtml(title)}</div>
      ${authorLine}
      ${outletLine}
      ${thumbBlock}
      <a class="popup-link"
        href="${escapeAttr(url)}"
        target="_blank"
        rel="noopener noreferrer">
        Read story →
      </a>
    `;

    // Mobile-only: make Mapbox auto-pan keep popup in a "safe area"
    const isMobile = window.matchMedia("(max-width: 768px)").matches;

    let popupOptions = { offset: 12, closeButton: true };

    if (isMobile) {
      const overlayEl = document.querySelector(".map-overlay");
      const overlayH = overlayEl ? overlayEl.getBoundingClientRect().height : 0;

      popupOptions = {
        offset: 12,
        closeButton: true,
        autoPan: true,
        autoPanPadding: {
          top: Math.ceil(overlayH + 16), // ✅ keeps popup below your overlay
          right: 16,
          bottom: 16,
          left: 16,
        },
      };
    }

    new mapboxgl.Popup(popupOptions)
      .setLngLat(coordinates)
      .setHTML(popupHtml)
      .addTo(map);

  });

  // Cursor changes
  map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
  map.on("mouseenter", "unclustered-point", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "unclustered-point", () => (map.getCanvas().style.cursor = ""));
});

// ---------------------
// Helpers
// ---------------------
function decodeEntities(str) {
  if (str == null) return "";
  const textarea = document.createElement("textarea");
  textarea.innerHTML = String(str);
  return textarea.value;
}

function isProbablyUrl(s) {
  if (!s) return false;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Basic XSS-safe escaping
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(str) {
  return escapeHtml(str).replaceAll("`", "&#096;");
}
