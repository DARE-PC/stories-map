import csv
import json
import math
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, urlunparse


# Input/output files live next to this script inside data/.
BASE_DIR = Path(__file__).resolve().parent
INPUT_CSV = BASE_DIR / "stories2.csv"
FIXED_COORDS_CSV = BASE_DIR / "fixed_coords.csv"
OUTPUT_GEOJSON = BASE_DIR / "stories2.geojson"

# Clustered points become hard to click when many stories share coordinates,
# so we keep a minimum distance between generated GeoJSON points.
MIN_DIST_METERS = 100.0
MAX_ATTEMPTS = 1_000
RADIUS_STEP_METERS = 25.0
ANGLES_PER_RING = 24
EARTH_RADIUS_M = 6_371_000.0

# These are the columns we expect from the remote CSV feed.
REQUIRED_COLUMNS = [
    "id",
    "title",
    "author",
    "outlet",
    "focus",
    "topic",
    "country",
    "lang",
    "date",
    "lat",
    "lon",
    "url",
    "thumbnail",
    "outlet_logo",
]

# Only these focus areas should survive into the output.
ALLOWED_FOCUS_AREAS = [
    "Human Rights",
    "Peace and Conflict",
    "Climate and Environment",
    "Global Health",
    "Information and Artificial Intelligence",
]

FIXED_COORDS_REQUIRED_COLUMNS = [
    "id",
    "title",
    "New latitude",
    "New longitude",
]


def haversine_m(lat1, lon1, lat2, lon2) -> float:
    # Great-circle distance in meters, used for overlap avoidance.
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_M * c


def meters_to_deg_lat(meters: float) -> float:
    # Rough conversion is fine here because shifts are small.
    return meters / 111_320.0


def meters_to_deg_lon(meters: float, lat_deg: float) -> float:
    # Longitude degrees shrink toward the poles, so latitude matters.
    cos_lat = math.cos(math.radians(lat_deg))
    if cos_lat < 1e-12:
        cos_lat = 1e-12
    return meters / (111_320.0 * cos_lat)


def grid_cell(lat: float, lon: float, cell_size_deg: float) -> tuple[int, int]:
    # A spatial grid makes collision checks much cheaper than comparing
    # every point against every other point.
    return (int(math.floor(lat / cell_size_deg)), int(math.floor(lon / cell_size_deg)))


def neighbor_cells(cell: tuple[int, int]):
    row, col = cell
    for drow in (-1, 0, 1):
        for dcol in (-1, 0, 1):
            yield (row + drow, col + dcol)


def find_collision(candidate_lat, candidate_lon, grid, cell_size_deg) -> bool:
    # Only nearby grid cells can contain conflicting points.
    cell = grid_cell(candidate_lat, candidate_lon, cell_size_deg)
    for neighbor in neighbor_cells(cell):
        for lat, lon in grid.get(neighbor, []):
            if haversine_m(candidate_lat, candidate_lon, lat, lon) < MIN_DIST_METERS:
                return True
    return False


def add_point_to_grid(lat, lon, grid, cell_size_deg):
    cell = grid_cell(lat, lon, cell_size_deg)
    grid.setdefault(cell, []).append((lat, lon))


def generate_spiral_candidates(orig_lat, orig_lon):
    # Try the original coordinates first, then walk outward in rings until
    # we find a free spot.
    yield (orig_lat, orig_lon)

    attempt = 0
    ring = 0
    while attempt < MAX_ATTEMPTS:
        ring += 1
        radius_m = MIN_DIST_METERS + ring * RADIUS_STEP_METERS

        for index in range(ANGLES_PER_RING):
            angle = 2 * math.pi * (index / ANGLES_PER_RING)
            dlat_deg = meters_to_deg_lat(radius_m * math.cos(angle))
            dlon_deg = meters_to_deg_lon(radius_m * math.sin(angle), orig_lat)

            yield (orig_lat + dlat_deg, orig_lon + dlon_deg)

            attempt += 1
            if attempt >= MAX_ATTEMPTS:
                break


def is_valid_lat_lon(lat: float, lon: float) -> bool:
    return -90 <= lat <= 90 and -180 <= lon <= 180


def clean_value(value: str) -> str:
    # Normalize empty/null-ish CSV values into trimmed strings.
    return (value or "").strip()


def format_date(raw_date: str) -> tuple[str, str]:
    # Return both the human-friendly date string for the UI and the year
    # used by the year filter.
    raw_date = clean_value(raw_date)
    if not raw_date:
        return "", ""

    for date_format in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            parsed = datetime.strptime(raw_date, date_format)
            return f"{parsed.strftime('%B')} {parsed.day}, {parsed.year}", str(parsed.year)
        except ValueError:
            continue

    return raw_date, ""


def parse_date(raw_date: str) -> datetime | None:
    # Reuse the same accepted date formats for comparisons and filtering.
    raw_date = clean_value(raw_date)
    if not raw_date:
        return None

    for date_format in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw_date, date_format)
        except ValueError:
            continue

    return None


def normalize_story_url(raw_url: str) -> str:
    # The feed sometimes points at the Pantheon host; normalize it to the
    # public Pulitzer Center domain so map links stay consistent.
    raw_url = clean_value(raw_url)
    if not raw_url:
        return ""

    try:
        parsed = urlparse(raw_url)
    except ValueError:
        return raw_url

    hostname = (parsed.netloc or "").lower()
    if hostname == "live-pulitzercenter.pantheonsite.io":
        parsed = parsed._replace(scheme="https", netloc="pulitzercenter.org")
    elif not parsed.scheme:
        parsed = parsed._replace(scheme="https")

    return urlunparse(parsed)


def split_multi_value(raw_value: str) -> list[str]:
    # Focus/topic values arrive as --- separated strings.
    raw_value = clean_value(raw_value)
    if not raw_value:
        return []

    return [part.strip() for part in raw_value.split("---") if part.strip()]


def filter_focus_areas(raw_focus: str) -> list[str]:
    # Keep only the curated set of focus areas used by the map filter.
    allowed = set(ALLOWED_FOCUS_AREAS)
    filtered = []

    for value in split_multi_value(raw_focus):
        if value in allowed and value not in filtered:
            filtered.append(value)

    return filtered


def build_feature(row: dict[str, str], lat: float, lon: float) -> dict:
    # Convert one cleaned CSV row into the GeoJSON shape the frontend expects.
    formatted_date, year = format_date(row["date"])
    filtered_focus = filter_focus_areas(row["focus"])

    return {
        "type": "Feature",
        "properties": {
            "id": clean_value(row["id"]),
            "title": clean_value(row["title"]),
            "author": clean_value(row["author"]),
            "thumbnail": clean_value(row["thumbnail"]),
            "outlet": clean_value(row["outlet"]),
            "outlet_logo": clean_value(row["outlet_logo"]),
            "lang": clean_value(row["lang"]),
            "date": formatted_date,
            "year": year,
            "url": normalize_story_url(row["url"]),
            "country": clean_value(row["country"]),
            "focus": ", ".join(filtered_focus),
            "topic": clean_value(row["topic"]),
        },
        "geometry": {
            "type": "Point",
            "coordinates": [lon, lat],
        },
    }


def load_fixed_coords() -> dict[str, tuple[str, str]]:
    # Temporary manual coordinate fixes keyed by story id.
    if not FIXED_COORDS_CSV.exists():
        return {}

    with FIXED_COORDS_CSV.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)

        if not reader.fieldnames:
            print("fixed_coords.csv appears to have no header row.")
            raise SystemExit(1)

        missing = sorted(set(FIXED_COORDS_REQUIRED_COLUMNS) - set(reader.fieldnames))
        if missing:
            print(f"fixed_coords.csv is missing columns: {missing}")
            print(f"Found columns: {reader.fieldnames}")
            raise SystemExit(1)

        fixed_coords = {}
        for row in reader:
            story_id = clean_value(row.get("id", ""))
            new_lat = clean_value(row.get("New latitude", ""))
            new_lon = clean_value(row.get("New longitude", ""))
            if not story_id or not new_lat or not new_lon:
                continue
            fixed_coords[story_id] = (new_lat, new_lon)

    return fixed_coords


def apply_fixed_coords(rows: list[dict[str, str]], fixed_coords: dict[str, tuple[str, str]]) -> int:
    # Override feed coordinates with the manual spreadsheet when available.
    applied = 0

    for row in rows:
        story_id = clean_value(row.get("id", ""))
        if not story_id or story_id not in fixed_coords:
            continue

        new_lat, new_lon = fixed_coords[story_id]
        row["lat"] = new_lat
        row["lon"] = new_lon
        applied += 1

    return applied


def dedupe_exact_rows(rows: list[dict[str, str]], fieldnames: list[str]) -> tuple[list[dict[str, str]], int]:
    # If the feed ever repeats the same line verbatim, keep only the first.
    seen = set()
    deduped = []
    removed = 0

    for row in rows:
        key = tuple((field, row.get(field, "")) for field in fieldnames)
        if key in seen:
            removed += 1
            continue
        seen.add(key)
        deduped.append(row)

    return deduped, removed


def pick_better_row(current_row: dict[str, str], candidate_row: dict[str, str]) -> dict[str, str]:
    # For repeated IDs, prefer the newest dated story record.
    current_date = parse_date(current_row.get("date", ""))
    candidate_date = parse_date(candidate_row.get("date", ""))

    if current_date and candidate_date:
        if candidate_date > current_date:
            return candidate_row
        return current_row

    if candidate_date and not current_date:
        return candidate_row

    return current_row


def dedupe_by_id_keep_latest(rows: list[dict[str, str]]) -> tuple[list[dict[str, str]], int]:
    # Preserve first-seen ordering, but swap in the newest row when an ID repeats.
    kept_by_id = {}
    order = []
    removed = 0

    for row in rows:
        story_id = clean_value(row.get("id", ""))
        if not story_id:
            order.append((None, row))
            continue

        if story_id not in kept_by_id:
            kept_by_id[story_id] = row
            order.append((story_id, row))
            continue

        removed += 1
        kept_by_id[story_id] = pick_better_row(kept_by_id[story_id], row)

    result = []
    emitted_ids = set()
    for story_id, row in order:
        if story_id is None:
            result.append(row)
            continue
        if story_id in emitted_ids:
            continue
        result.append(kept_by_id[story_id])
        emitted_ids.add(story_id)

    return result, removed


def main():
    # 1. Load and validate the source CSV.
    if not INPUT_CSV.exists():
        print(f"CSV not found: {INPUT_CSV}")
        raise SystemExit(1)

    with INPUT_CSV.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)

        if not reader.fieldnames:
            print("CSV appears to have no header row.")
            raise SystemExit(1)

        missing = sorted(set(REQUIRED_COLUMNS) - set(reader.fieldnames))
        if missing:
            print(f"Missing required columns: {missing}")
            print(f"Found columns: {reader.fieldnames}")
            raise SystemExit(1)

        fieldnames = list(reader.fieldnames)
        rows = list(reader)

    # 2. Apply temporary coordinate overrides before validation so stories
    # with missing feed coordinates can still make it into the map.
    fixed_coords = load_fixed_coords()
    fixed_coords_applied = apply_fixed_coords(rows, fixed_coords)

    # 3. Apply feed-level cleanup rules before any GeoJSON work.
    total_rows = len(rows)
    rows, exact_dupes_removed = dedupe_exact_rows(rows, fieldnames)
    rows, duplicate_ids_removed = dedupe_by_id_keep_latest(rows)
    rows_2006_plus = []
    older_than_2006_removed = 0

    for row in rows:
        parsed_date = parse_date(row.get("date", ""))
        if parsed_date and parsed_date.year < 2006:
            older_than_2006_removed += 1
            continue
        rows_2006_plus.append(row)

    rows = rows_2006_plus

    # 4. Convert remaining rows into map-ready features.
    features = []
    total = 0
    skipped = 0
    moved = 0
    max_move_m = 0.0
    max_move_id = ""

    cell_size_deg = meters_to_deg_lat(MIN_DIST_METERS)
    grid = {}

    for row in rows:
        total += 1

        try:
            lat = float(row["lat"])
            lon = float(row["lon"])
        except (TypeError, ValueError):
            skipped += 1
            continue

        if not is_valid_lat_lon(lat, lon):
            skipped += 1
            continue

        story_id = clean_value(row["id"])
        title = clean_value(row["title"])
        url = normalize_story_url(row["url"])
        formatted_date, year = format_date(row["date"])
        if not story_id or not title or not url or not formatted_date or not year:
            skipped += 1
            continue

        # Shift overlapping points just enough to make separate stories clickable.
        new_lat, new_lon = lat, lon
        placed = False

        for candidate_lat, candidate_lon in generate_spiral_candidates(lat, lon):
            if not find_collision(candidate_lat, candidate_lon, grid, cell_size_deg):
                new_lat, new_lon = candidate_lat, candidate_lon
                placed = True
                break

        if not placed:
            skipped += 1
            add_point_to_grid(lat, lon, grid, cell_size_deg)
            continue

        move_dist_m = haversine_m(lat, lon, new_lat, new_lon)
        if move_dist_m > 0:
            moved += 1
            if move_dist_m > max_move_m:
                max_move_m = move_dist_m
                max_move_id = story_id

        features.append(build_feature(row, new_lat, new_lon))
        add_point_to_grid(new_lat, new_lon, grid, cell_size_deg)

    # 5. Write the final GeoJSON used by the map.
    geojson = {
        "type": "FeatureCollection",
        "features": features,
    }

    with OUTPUT_GEOJSON.open("w", encoding="utf-8") as handle:
        json.dump(geojson, handle, ensure_ascii=False)

    print("Build complete")
    print(f"  Input   : {INPUT_CSV}")
    print(f"  Output  : {OUTPUT_GEOJSON}")
    print(f"  CSV rows: {total_rows}")
    print(f"  Applied fixed coords    : {fixed_coords_applied}")
    print(f"  Removed exact duplicates: {exact_dupes_removed}")
    print(f"  Removed duplicate ids   : {duplicate_ids_removed}")
    print(f"  Removed pre-2006 rows   : {older_than_2006_removed}")
    print(f"  Total   : {total}")
    print(f"  Features: {len(features)}")
    print(f"  Skipped : {skipped}")
    print(f"  Moved   : {moved}")
    print(f"  Min gap : {MIN_DIST_METERS} meters")
    if max_move_id:
        print(f"  Max move: {max_move_m:.2f} meters (id: {max_move_id})")


if __name__ == "__main__":
    main()
