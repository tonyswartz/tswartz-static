#!/usr/bin/env python3
"""Merge completed TripIt trips into travel/states.json and countries.json."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRAVEL = ROOT / "travel"
STATES_JSON = TRAVEL / "states.json"
COUNTRIES_JSON = TRAVEL / "countries.json"
ALPHA2_JSON = TRAVEL / "alpha2-iso-num.json"
STATE_FILE = Path.home() / ".buzz" / "tripit-travel-sync-state.json"
DM_CHANNEL = "c7990b4b-157c-450e-a3f5-e162105316b2"
TONY_HEX = "272d0c3ae273a2ccb96cad3bd88a08a1b14a491d9cde0c6a02f5063a54f100de"


def run_tripit(args: list[str]) -> dict:
    env = os.environ.copy()
    result = subprocess.run(
        ["npx", "-y", "tripit", *args],
        capture_output=True,
        text=True,
        check=True,
        env=env,
        cwd=str(ROOT),
    )
    return json.loads(result.stdout)


def fetch_completed_trips() -> list[dict]:
    today = date.today()
    trips: list[dict] = []
    for past in (False, True):
        page = 1
        while True:
            data = run_tripit(
                [
                    "trips",
                    "list",
                    "-o",
                    "json",
                    "--page-num",
                    str(page),
                    "--page-size",
                    "100",
                ]
                + (["--past"] if past else [])
            )
            batch = data.get("Trip") or []
            if isinstance(batch, dict):
                batch = [batch]
            if not batch:
                break
            for trip in batch:
                end_raw = trip.get("end_date")
                if not end_raw:
                    continue
                if date.fromisoformat(end_raw) <= today:
                    trips.append(trip)
            if len(batch) < 100:
                break
            page += 1
    seen: set[str] = set()
    unique: list[dict] = []
    for trip in trips:
        uid = trip.get("uuid") or trip.get("display_name")
        if uid in seen:
            continue
        seen.add(uid)
        unique.append(trip)
    return unique


def load_json(path: Path) -> dict:
    with path.open() as f:
        return json.load(f)


def write_json(path: Path, data: dict) -> None:
    with path.open("w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def abbr_to_fips(states_master: list[dict]) -> dict[str, str]:
    return {s["abbr"].upper(): s["fips"] for s in states_master}


def extract_from_trip(
    trip: dict,
    abbr_fips: dict[str, str],
    alpha2_to_isonum: dict[str, str],
) -> tuple[set[str], set[str]]:
    fips: set[str] = set()
    iso_nums: set[str] = set()
    addr = trip.get("PrimaryLocationAddress") or {}
    country = (addr.get("country") or "").upper()
    state = (addr.get("state") or "").upper()

    if country == "US" and state in abbr_fips:
        fips.add(abbr_fips[state])
    elif country == "US":
        loc = trip.get("primary_location") or trip.get("display_name") or ""
        if ", " in loc:
            maybe_state = loc.rsplit(", ", 1)[-1].strip().upper()
            if maybe_state in abbr_fips:
                fips.add(abbr_fips[maybe_state])

    if country:
        iso = alpha2_to_isonum.get(country)
        if iso:
            iso_nums.add(iso)

    return fips, iso_nums


def rebuild_by_region(states_master: list[dict], visited_fips: set[str]) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = {}
    for state in states_master:
        if state["fips"] not in visited_fips:
            continue
        grouped.setdefault(state["region"], []).append(state["name"])
    for names in grouped.values():
        names.sort()
    return dict(sorted(grouped.items()))


def rebuild_by_continent(countries_master: list[dict], visited_iso: set[str]) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = {}
    for country in countries_master:
        if country["isoNum"] not in visited_iso:
            continue
        grouped.setdefault(country["continent"], []).append(country["name"])
    for names in grouped.values():
        names.sort()
    return dict(sorted(grouped.items()))


def compute_remaining(states_master: list[dict], visited_fips: set[str]) -> str | None:
    missing = [s["name"] for s in states_master if s["fips"] not in visited_fips]
    if len(missing) == 1:
        return missing[0]
    return None


def names_for_fips(states_master: list[dict], fips_codes: set[str]) -> list[str]:
    lookup = {s["fips"]: s["name"] for s in states_master}
    return sorted(lookup[f] for f in fips_codes if f in lookup)


def names_for_iso(countries_master: list[dict], iso_codes: set[str]) -> list[str]:
    lookup = {c["isoNum"]: c["name"] for c in countries_master}
    return sorted(lookup[i] for i in iso_codes if i in lookup)


def notify_tony(message: str) -> None:
    buzz = subprocess.run(
        ["which", "buzz"],
        capture_output=True,
        text=True,
        check=False,
    )
    if buzz.returncode != 0:
        print("buzz CLI missing; skip notify:", message)
        return
    subprocess.run(
        [
            "buzz",
            "messages",
            "send",
            "--channel",
            DM_CHANNEL,
            "--content",
            message,
            "--mention",
            TONY_HEX,
        ],
        check=False,
        env=os.environ.copy(),
    )


def git_push_if_dirty(states_changed: bool, countries_changed: bool, summary: str) -> None:
    status = subprocess.run(
        ["git", "status", "--porcelain", "travel/states.json", "travel/countries.json"],
        capture_output=True,
        text=True,
        check=True,
        cwd=str(ROOT),
    )
    if not status.stdout.strip():
        print("No JSON changes to commit.")
        return
    files = []
    if states_changed:
        files.append("travel/states.json")
    if countries_changed:
        files.append("travel/countries.json")
    subprocess.run(["git", "add", *files], check=True, cwd=str(ROOT))
    subprocess.run(
        ["git", "commit", "-m", summary],
        check=True,
        cwd=str(ROOT),
    )
    subprocess.run(["git", "push", "origin", "main"], check=True, cwd=str(ROOT))


def main() -> int:
    if not os.environ.get("TRIPIT_USERNAME") or not os.environ.get("TRIPIT_PASSWORD"):
        print("TRIPIT_USERNAME/TRIPIT_PASSWORD not set", file=sys.stderr)
        return 1

    states_data = load_json(STATES_JSON)
    countries_data = load_json(COUNTRIES_JSON)
    alpha2_to_isonum = load_json(ALPHA2_JSON)
    abbr_fips = abbr_to_fips(states_data["states"])

    before_state_fips = set(states_data.get("visitedFips", []))
    before_country_iso = set(countries_data.get("visitedIsoNums", []))

    trips = fetch_completed_trips()
    print(f"Completed trips scanned: {len(trips)}")

    trip_fips: set[str] = set()
    trip_iso: set[str] = set()
    for trip in trips:
        fips, iso_nums = extract_from_trip(trip, abbr_fips, alpha2_to_isonum)
        trip_fips |= fips
        trip_iso |= iso_nums

    new_state_fips = before_state_fips | trip_fips
    new_country_iso = before_country_iso | trip_iso
    added_state_fips = new_state_fips - before_state_fips
    added_country_iso = new_country_iso - before_country_iso

    states_changed = added_state_fips != set()
    countries_changed = added_country_iso != set()

    if states_changed:
        states_data["visitedFips"] = sorted(new_state_fips)
        states_data["count"] = len(new_state_fips)
        states_data["byRegion"] = rebuild_by_region(states_data["states"], set(new_state_fips))
        remaining = compute_remaining(states_data["states"], set(new_state_fips))
        if remaining:
            states_data["remaining"] = remaining
        else:
            states_data.pop("remaining", None)
        states_data["source"] = f"tripit auto-sync ({date.today().isoformat()})"
        write_json(STATES_JSON, states_data)

    if countries_changed:
        countries_data["visitedIsoNums"] = sorted(new_country_iso)
        countries_data["count"] = len(new_country_iso)
        countries_data["byContinent"] = rebuild_by_continent(
            countries_data["countries"], set(new_country_iso)
        )
        countries_data["source"] = f"tripit auto-sync ({date.today().isoformat()})"
        write_json(COUNTRIES_JSON, countries_data)

    snapshot = {
        "last_run": datetime.now(timezone.utc).isoformat(),
        "trips_scanned": len(trips),
        "visited_states": len(new_state_fips),
        "visited_countries": len(new_country_iso),
        "added_states": names_for_fips(states_data["states"], added_state_fips),
        "added_countries": names_for_iso(countries_data["countries"], added_country_iso),
    }
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    write_json(STATE_FILE, snapshot)

    if not states_changed and not countries_changed:
        print("Already up to date.")
        return 0

    added_state_names = snapshot["added_states"]
    added_country_names = snapshot["added_countries"]
    summary = "Auto-sync TripIt completed travel to tswartz.com map."
    if added_state_names:
        summary += f" States: {', '.join(added_state_names)}."
    if added_country_names:
        summary += f" Countries: {', '.join(added_country_names)}."

    git_push_if_dirty(states_changed, countries_changed, summary)

    lines = ["@Tony Swartz TripIt weekly sync — travel map updated."]
    if added_state_names:
        lines.append(f"**New states:** {', '.join(added_state_names)} ({len(new_state_fips)} total)")
    if added_country_names:
        lines.append(f"**New countries:** {', '.join(added_country_names)} ({len(new_country_iso)} total)")
    lines.append("Live after Railway deploy: https://tswartz-production.up.railway.app/travel/")
    notify_tony("\n".join(lines))
    print(summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
