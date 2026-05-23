// =====================
// Custom Year Picker toggle
// =====================
const USE_CUSTOM_YEAR_PICKER = true;
const FOCUS_OPTIONS = [
  "all",
  "Human Rights",
  "Peace and Conflict",
  "Climate and Environment",
  "Global Health",
  "Information and Artificial Intelligence",
];
const FOCUS_COLORS = {
  "Human Rights": "#76CABD",
  "Peace and Conflict": "#B95B90",
  "Climate and Environment": "#EFB604",
  "Global Health": "#112C4E",
  "Information and Artificial Intelligence": "#F47E52",
};

// =====================
// 1) Add your Mapbox token
// =====================
mapboxgl.accessToken = "pk.eyJ1IjoicGNlbnRlciIsImEiOiJjbWp3djNpMDM1ZGFyM2dxeDQzM2t2dnEyIn0.dd2wiFOBBm9P5cYjItXY7A";

// =====================
// 2) Create map (robust init + fallback)
// =====================
let map = null;
let mapFailed = false;

try {
  map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/light-v11",
    center: [0, 20],
    zoom: 1.2,
    maxZoom: 16,
  });

  map.addControl(
    new mapboxgl.NavigationControl({ showCompass: true }),
    "top-right"
  );

  // Optional: silently catch map errors (no console spam)
  map.on("error", () => {});
} catch (err) {
  mapFailed = true;

  const fallback = document.getElementById("webgl-fallback");
  if (fallback) fallback.hidden = false;

  console.error("Mapbox failed to initialize:", err);
}

// =====================
// 3) Load GeoJSON + clustered layers
// =====================
if (!mapFailed && map) {
  map.on("load", () => {
    const geojsonUrl = "./data/stories2.geojson";

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
          "#76CABD",
          50,
          "#336173",
          200,
          "#112C4E",
          1000,
          "#000000",
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
        "circle-color": "#F47E52",
        "circle-stroke-width": 1,
        "circle-stroke-color": "rgba(0,0,0,0.25)",
      },
    });

    // ---------------------
    // Filters
    // ---------------------
    const focusSelect = document.getElementById("focusFilter");
    const focusPickerBtn = document.getElementById("focusPickerBtn");
    const focusPickerLabel = document.getElementById("focusPickerLabel");
    const focusPickerPanel = document.getElementById("focusPickerPanel");
    const focusPickerList = document.getElementById("focusPickerList");

    const yearSelect = document.getElementById("yearFilter");
    const yearPickerBtn = document.getElementById("yearPickerBtn");
    const yearPickerLabel = document.getElementById("yearPickerLabel");
    const yearPickerPanel = document.getElementById("yearPickerPanel");
    const yearPickerList = document.getElementById("yearPickerList");

    let allGeojson = null;
    let availableYears = [];
    let currentFocus = "all";
    let currentYear = "all";

    function labelForValue(value) {
      return value === "all" ? "All" : value;
    }

    function renderFocusLabel(target, focus) {
      if (!target) return;

      target.textContent = "";

      const label = document.createElement("span");
      label.className = "focus-option-label";

      if (focus !== "all") {
        const marker = document.createElement("span");
        marker.className = "focus-marker";
        marker.style.backgroundColor = FOCUS_COLORS[focus] || "transparent";
        marker.setAttribute("aria-hidden", "true");
        label.appendChild(marker);
      }

      label.append(document.createTextNode(labelForValue(focus)));
      target.appendChild(label);
    }

    function featureMatchesFocus(feature, selectedFocus) {
      if (selectedFocus === "all") return true;

      const focus = (feature?.properties?.focus ?? "").toString().trim();
      if (!focus) return false;

      return focus
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .includes(selectedFocus);
    }

    function featureMatchesYear(feature, selectedYear) {
      if (selectedYear === "all") return true;

      const year = (feature?.properties?.year ?? "").toString().trim();
      return year === selectedYear;
    }

    function applyFilters() {
      if (!allGeojson) return;

      const src = map.getSource("stories");
      if (!src) return;

      src.setData({
        type: "FeatureCollection",
        features: allGeojson.features.filter((f) => {
          return (
            featureMatchesFocus(f, currentFocus) &&
            featureMatchesYear(f, currentYear)
          );
        }),
      });
    }

    function setSourceToFocus(selectedFocus) {
      currentFocus = String(selectedFocus || "all");
      applyFilters();
    }

    function setSourceToYear(selectedYear) {
      currentYear = String(selectedYear || "all");
      applyFilters();
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
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na;
        return b.localeCompare(a);
      });

      availableYears = ["all", ...sortedYearsDesc];
    }

    function populateFocusSelect() {
      if (!focusSelect) return;

      while (focusSelect.options.length > 1) focusSelect.remove(1);

      for (const focus of FOCUS_OPTIONS) {
        if (focus === "all") continue;
        const opt = document.createElement("option");
        opt.value = focus;
        opt.textContent = focus;
        focusSelect.appendChild(opt);
      }

      focusSelect.value = currentFocus;

      if (!focusSelect.dataset.bound) {
        focusSelect.addEventListener("change", (e) =>
          setSourceToFocus(e.target.value)
        );
        focusSelect.dataset.bound = "true";
      }
    }

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

      if (!yearSelect.dataset.bound) {
        yearSelect.addEventListener("change", (e) =>
          setSourceToYear(e.target.value)
        );
        yearSelect.dataset.bound = "true";
      }
    }

    function renderFocusPickerList() {
      if (!focusPickerList) return;
      focusPickerList.innerHTML = "";

      for (const focus of FOCUS_OPTIONS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "yearpicker-item";
        btn.setAttribute(
          "aria-selected",
          focus === currentFocus ? "true" : "false"
        );
        renderFocusLabel(btn, focus);

        btn.addEventListener("click", () => {
          setSourceToFocus(focus);
          renderFocusLabel(focusPickerLabel, focus);
          if (focusSelect) focusSelect.value = focus;
          closePicker(focusPickerPanel, focusPickerBtn);
        });

        focusPickerList.appendChild(btn);
      }
    }

    function renderYearPickerList() {
      if (!yearPickerList) return;
      yearPickerList.innerHTML = "";

      for (const y of availableYears) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "yearpicker-item";
        btn.textContent = labelForValue(y);
        btn.setAttribute(
          "aria-selected",
          y === currentYear ? "true" : "false"
        );

        btn.addEventListener("click", () => {
          setSourceToYear(y);
          if (yearPickerLabel) yearPickerLabel.textContent = labelForValue(y);
          if (yearSelect) yearSelect.value = y;
          closePicker(yearPickerPanel, yearPickerBtn);
        });

        yearPickerList.appendChild(btn);
      }
    }

    function openPicker(panel, button, renderList) {
      if (!panel) return;
      panel.hidden = false;
      if (button) button.setAttribute("aria-expanded", "true");
      if (typeof renderList === "function") renderList();
    }

    function closePicker(panel, button) {
      if (!panel) return;
      panel.hidden = true;
      if (button) button.setAttribute("aria-expanded", "false");
    }

    function closeAllPickers() {
      closePicker(focusPickerPanel, focusPickerBtn);
      closePicker(yearPickerPanel, yearPickerBtn);
    }

    function bindPickerToggle(button, panel, renderList) {
      if (!button || button.dataset.bound) return;

      button.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!panel) return;

        const isOpen = !panel.hidden;
        if (isOpen) closePicker(panel, button);
        else {
          closeAllPickers();
          openPicker(panel, button, renderList);
        }
      });
      button.dataset.bound = "true";
    }

    function bindPanelStopPropagation(panel) {
      if (!panel || panel.dataset.bound) return;
      panel.addEventListener("click", (e) => e.stopPropagation());
      panel.dataset.bound = "true";
    }

    bindPickerToggle(focusPickerBtn, focusPickerPanel, renderFocusPickerList);
    bindPickerToggle(yearPickerBtn, yearPickerPanel, renderYearPickerList);

    bindPanelStopPropagation(focusPickerPanel);
    bindPanelStopPropagation(yearPickerPanel);

    if (!document.body.dataset.pickerDocBound) {
      document.addEventListener("click", () => closeAllPickers());
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeAllPickers();
      });
      document.body.dataset.pickerDocBound = "true";
    }


    fetch(geojsonUrl)
      .then((r) => r.json())
      .then((data) => {
        allGeojson = data;

        buildYearsFromData(data);

        // default selection
        setSourceToFocus("all");
        setSourceToYear("all");

        populateFocusSelect();
        populateNativeSelect();

        renderFocusLabel(focusPickerLabel, "all");
        if (focusPickerBtn) focusPickerBtn.setAttribute("aria-expanded", "false");
        if (focusPickerPanel) focusPickerPanel.hidden = true;

        if (yearPickerLabel) yearPickerLabel.textContent = "All";
        if (yearPickerBtn) yearPickerBtn.setAttribute("aria-expanded", "false");
        if (yearPickerPanel) yearPickerPanel.hidden = true;

        if (USE_CUSTOM_YEAR_PICKER) {
          renderFocusPickerList();
          renderYearPickerList();
        }
      })
      .catch(() => {
        // If fetch fails, dropdown won't populate but the map still works.
      });


    // ---------------------
    // Interactions
    // ---------------------
    map.on("click", "clusters", (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["clusters"],
      });
      if (!features.length) return;

      const clusterId = features[0].properties.cluster_id;
      map
        .getSource("stories")
        .getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          map.easeTo({
            center: features[0].geometry.coordinates,
            zoom,
          });
        });
    });

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

      const coordinates = feature.geometry.coordinates.slice();
      while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
        coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
      }

      const popupHtml = `
        <div class="popup-date"><b>${escapeHtml(date)}</b></div>
        <div class="popup-title">${escapeHtml(title)}</div>
        ${
          author
            ? `<div class="popup-meta"><span class="popup-label">By:</span> ${escapeHtml(
                author
              )}</div>`
            : ""
        }
        ${
          outlet
            ? `<div class="popup-meta"><span class="popup-label">Outlet:</span> ${escapeHtml(
                outlet
              )}</div>`
            : ""
        }
        ${
          isProbablyUrl(thumbnail)
            ? `<a class="popup-thumb" href="${escapeAttr(
                url
              )}" target="_blank" rel="noopener noreferrer">
                <img src="${escapeAttr(
                  thumbnail
                )}" loading="lazy" decoding="async" />
              </a>`
            : ""
        }
        <a class="popup-link" href="${escapeAttr(
          url
        )}" target="_blank" rel="noopener noreferrer">
          Read story →
        </a>
      `;

      new mapboxgl.Popup({ offset: 12 })
        .setLngLat(coordinates)
        .setHTML(popupHtml)
        .addTo(map);
    });
  });
}

// =====================
// Helpers
// =====================
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
