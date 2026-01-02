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
  maxZoom: 16
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

  map.addSource("stories", {
    type: "geojson",
    data: geojsonUrl,
    cluster: true,
    clusterMaxZoom: 10,
    clusterRadius: 50
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
        50, 22,
        200, 28,
        1000, 34,
        5000, 40
      ],
      "circle-color": [
        "step",
        ["get", "point_count"],
        "#88c0d0",
        50, "#5e81ac",
        200, "#4c566a",
        1000, "#2e3440"
      ],
      "circle-opacity": 0.85,
      "circle-stroke-width": 1,
      "circle-stroke-color": "rgba(0,0,0,0.15)"
    }
  });

  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "stories",
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count_abbreviated}",
      "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
      "text-size": 12
    },
    paint: {
      "text-color": "#ffffff"
    }
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
      "circle-stroke-color": "rgba(0,0,0,0.25)"
    }
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
        zoom
      });
    });
  });

  // Click point → popup
  map.on("click", "unclustered-point", (e) => {
    const feature = e.features?.[0];
    if (!feature) return;

    const props = feature.properties || {};

    const title = props.title ?? "Story";
    const date = props.date ?? "";
    const url = props.url ?? "#";

    // Anti-meridian wrap fix
    const coordinates = feature.geometry.coordinates.slice();
    while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
      coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
    }

    // Inline styles ensure date is always visible
    const popupHtml = `
      <div style="font-size:12px; font-weight:700; margin:0 0 6px 0;">
        ${escapeHtml(date)}
      </div>
      <div style="font-size:14px; font-weight:400; margin:0 0 10px 0;">
        ${escapeHtml(title)}
      </div>
      <a class="popup-link"
         href="${escapeAttr(url)}"
         target="_blank"
         rel="noopener noreferrer">
        Read story →
      </a>
    `;

    new mapboxgl.Popup({ offset: 12, closeButton: true })
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

// =====================
// Helpers (basic XSS-safe escaping)
// =====================
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
