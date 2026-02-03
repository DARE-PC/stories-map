// =====================
// Custom Year Picker toggle
// =====================
const USE_CUSTOM_YEAR_PICKER = true;

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
    // YEAR FILTER (custom picker)
    // ---------------------
    const yearSelect = document.getElementById("yearFilter");
    const yearPicker = document.getElementById("yearPicker");
    const yearPickerBtn = document.getElementById("yearPickerBtn");
    const yearPickerLabel = document.getElementById("yearPickerLabel");
    const yearPickerPanel = document.getElementById("yearPickerPanel");
    const yearPickerList = document.getElementById("yearPickerList");

    let allGeojson = null;
    let availableYears = [];
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
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na;
        return b.localeCompare(a);
      });

      availableYears = ["all", ...sortedYearsDesc];
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

    function renderPickerList() {
      if (!yearPickerList) return;
      yearPickerList.innerHTML = "";

      for (const y of availableYears) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "yearpicker-item";
        btn.textContent = labelForYear(y);
        btn.setAttribute(
          "aria-selected",
          y === currentYear ? "true" : "false"
        );

        btn.addEventListener("click", () => {
          setSourceToYear(y);
          if (yearPickerLabel) yearPickerLabel.textContent = labelForYear(y);
          if (yearSelect) yearSelect.value = y;
          yearPickerPanel.hidden = true;
        });

        yearPickerList.appendChild(btn);
      }
    }

        // --- Picker open/close behavior (MISSING in your current JS) ---
    function openPicker() {
      if (!yearPickerPanel) return;
      yearPickerPanel.hidden = false;
      if (yearPickerBtn) yearPickerBtn.setAttribute("aria-expanded", "true");
      renderPickerList(); // ensure list is up to date
    }

    function closePicker() {
      if (!yearPickerPanel) return;
      yearPickerPanel.hidden = true;
      if (yearPickerBtn) yearPickerBtn.setAttribute("aria-expanded", "false");
    }

    // Toggle on button click (bind once)
    if (yearPickerBtn && !yearPickerBtn.dataset.bound) {
      yearPickerBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!yearPickerPanel) return;

        const isOpen = !yearPickerPanel.hidden;
        if (isOpen) closePicker();
        else openPicker();
      });
      yearPickerBtn.dataset.bound = "true";
    }

    // Prevent clicks inside the panel from closing it
    if (yearPickerPanel && !yearPickerPanel.dataset.bound) {
      yearPickerPanel.addEventListener("click", (e) => e.stopPropagation());
      yearPickerPanel.dataset.bound = "true";
    }

    // Close when clicking outside
    if (!document.body.dataset.yearpickerDocBound) {
      document.addEventListener("click", () => closePicker());
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closePicker();
      });
      document.body.dataset.yearpickerDocBound = "true";
    }


    fetch(geojsonUrl)
      .then((r) => r.json())
      .then((data) => {
        allGeojson = data;

        buildYearsFromData(data);

        // default selection
        setSourceToYear("all");

        // keep native select in sync (hidden)
        populateNativeSelect();

        // ✅ Ensure picker UI starts consistent
        if (yearPickerLabel) yearPickerLabel.textContent = "All";
        if (yearPickerBtn) yearPickerBtn.setAttribute("aria-expanded", "false");
        if (yearPickerPanel) yearPickerPanel.hidden = true;

        if (USE_CUSTOM_YEAR_PICKER) {
          renderPickerList();
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
