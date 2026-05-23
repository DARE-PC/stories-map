# Pulitzer Center Story Map

This project powers an interactive map of Pulitzer Center-supported stories from around the world. It was built as a way to explore roughly 20 years of reporting geographically, helping readers move across regions, zoom into local clusters, and discover stories in context rather than as a flat archive.

The map is also rooted in a simple idea: maps are never neutral. They select, simplify, and leave things out. In that spirit, this project tries to use geography not as decoration, but as a way to surface underreported places, connect stories across borders, and make a large body of journalism easier to explore.

## How it works

Stories are displayed as clustered points on a world map. Users can zoom in and out, move across regions, and click on clusters to reveal more local detail. Individual stories appear as points; clicking on one opens a preview with a link to read the full story.

The map can also be filtered by year and by Pulitzer Center focus area, making it possible to explore reporting across time as well as across themes such as climate, human rights, global health, peace and conflict, and information and artificial intelligence.

## Data updates

The source CSV is downloaded automatically every day, and a GeoJSON is regenerated from it. If the source data changes, the updated files are committed back to the repository through GitHub Actions.

## Notes

- `data/fixed_coords.csv` is a temporary manual override file used while missing coordinates are still being corrected upstream.
- The automated update workflow lives in `.github/workflows/update-stories-data.yml`.
