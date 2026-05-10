"""InfluxDB 2 Anbindung für My Portfolio X – direkte aiohttp-Calls, kein extra Paket."""
from __future__ import annotations

import logging
from typing import Any

_LOGGER = logging.getLogger(__name__)

MEAS_PRICES = "kurshistorie"
MEAS_TRADES = "transaktionen"


# ── Hilfsfunktionen ───────────────────────────────────────────────────────────

def _tag(v: str) -> str:
    """Escaping für InfluxDB Line-Protocol-Tag-Werte."""
    return str(v).replace(",", r"\,").replace("=", r"\=").replace(" ", r"\ ")


def _write_headers(token: str) -> dict:
    return {"Authorization": f"Token {token}", "Content-Type": "text/plain; charset=utf-8"}


def _query_headers(token: str) -> dict:
    return {
        "Authorization": f"Token {token}",
        "Content-Type": "application/vnd.flux",
        "Accept": "application/csv",
    }


def _write_url(base: str, org: str, bucket: str) -> str:
    return f"{base.rstrip('/')}/api/v2/write?org={org}&bucket={bucket}&precision=s"


def _query_url(base: str, org: str) -> str:
    return f"{base.rstrip('/')}/api/v2/query?org={org}"


def _delete_url(base: str, org: str, bucket: str) -> str:
    return f"{base.rstrip('/')}/api/v2/delete?org={org}&bucket={bucket}"


def _parse_annotated_csv(csv_text: str) -> list[dict[str, str]]:
    """Parst InfluxDB annotiertes CSV, gibt alle Datenzeilen als Dicts zurück."""
    rows: list[dict[str, str]] = []
    headers: list[str] | None = None

    for line in csv_text.splitlines():
        if not line or line.startswith("#"):
            continue
        parts = line.split(",")
        # Header-Zeile: erstes Feld leer, zweites "result"
        if len(parts) > 1 and parts[0] == "" and parts[1] == "result":
            headers = [p.strip() for p in parts]
            continue
        if headers and parts[0] == "" and parts[1] != "result":
            row = {h: (parts[i].strip() if i < len(parts) else "") for i, h in enumerate(headers)}
            rows.append(row)

    return rows


# ── Schreiben ─────────────────────────────────────────────────────────────────

async def write_price(
    session, base_url: str, token: str, org: str, bucket: str,
    kuerzel: str, isin: str, portfolio: str, kurs: float,
) -> None:
    """Aktuellen Kurs in InfluxDB schreiben (Line Protocol)."""
    if not all([base_url, token, org, bucket, kuerzel]):
        return
    tags = f"kuerzel={_tag(kuerzel)},portfolio={_tag(portfolio)}"
    if isin:
        tags += f",isin={_tag(isin)}"
    line = f"{MEAS_PRICES},{tags} kurs={kurs}"
    try:
        async with session.post(
            _write_url(base_url, org, bucket),
            headers=_write_headers(token),
            data=line,
        ) as r:
            if r.status not in (204, 200):
                _LOGGER.debug("InfluxDB write_price %s: %s", r.status, await r.text())
    except Exception as exc:
        _LOGGER.debug("InfluxDB write_price Fehler: %s", exc)


async def write_transaction(
    session, base_url: str, token: str, org: str, bucket: str,
    kuerzel: str, portfolio: str, typ: str, fields: dict[str, Any],
) -> None:
    """Transaktion (kauf/verkauf) in InfluxDB schreiben."""
    if not all([base_url, token, org, bucket, kuerzel]):
        return
    tags = f"kuerzel={_tag(kuerzel)},portfolio={_tag(portfolio)},typ={_tag(typ)}"

    field_parts = []
    for k, v in fields.items():
        if isinstance(v, str):
            field_parts.append(f'{k}="{v.replace(chr(34), chr(92)+chr(34))}"')
        elif isinstance(v, bool):
            field_parts.append(f"{k}={str(v).lower()}")
        elif isinstance(v, (int, float)) and v is not None:
            field_parts.append(f"{k}={v}")
    if not field_parts:
        return

    line = f"{MEAS_TRADES},{tags} {','.join(field_parts)}"
    try:
        async with session.post(
            _write_url(base_url, org, bucket),
            headers=_write_headers(token),
            data=line,
        ) as r:
            if r.status not in (204, 200):
                _LOGGER.debug("InfluxDB write_transaction %s: %s", r.status, await r.text())
    except Exception as exc:
        _LOGGER.debug("InfluxDB write_transaction Fehler: %s", exc)


# ── Lesen ─────────────────────────────────────────────────────────────────────

async def query_smas(
    session, base_url: str, token: str, org: str, bucket: str,
    kuerzel: str,
) -> dict[str, float | None]:
    """Letzte SMA 20/50/200 Werte für eine Aktie abfragen."""
    if not all([base_url, token, org, bucket, kuerzel]):
        return {"sma_20": None, "sma_50": None, "sma_200": None}

    flux = f"""
daily = from(bucket: "{bucket}")
  |> range(start: -220d)
  |> filter(fn: (r) => r["_measurement"] == "{MEAS_PRICES}" and r["kuerzel"] == "{kuerzel}" and r["_field"] == "kurs")
  |> aggregateWindow(every: 1d, fn: last, createEmpty: false)
  |> tail(n: 200)

s20  = daily |> movingAverage(n: 20)  |> last() |> set(key: "_field", value: "sma_20")
s50  = daily |> movingAverage(n: 50)  |> last() |> set(key: "_field", value: "sma_50")
s200 = daily |> movingAverage(n: 200) |> last() |> set(key: "_field", value: "sma_200")

union(tables: [s20, s50, s200])
"""
    result: dict[str, float | None] = {"sma_20": None, "sma_50": None, "sma_200": None}
    try:
        async with session.post(
            _query_url(base_url, org),
            headers=_query_headers(token),
            data=flux,
        ) as r:
            if r.status != 200:
                _LOGGER.debug("InfluxDB query_smas %s: %s", r.status, await r.text())
                return result
            text = await r.text()

        for row in _parse_annotated_csv(text):
            field = row.get("_field", "")
            val_s = row.get("_value", "")
            if field in result and val_s:
                try:
                    result[field] = round(float(val_s), 2)
                except ValueError:
                    pass
    except Exception as exc:
        _LOGGER.debug("InfluxDB query_smas Fehler: %s", exc)

    return result


async def query_price_history(
    session, base_url: str, token: str, org: str, bucket: str,
    kuerzel: str, days: int = 200,
) -> list[dict[str, Any]]:
    """Tägliche Schlusskurse (max. 200 Tage) für eine Aktie abfragen."""
    if not all([base_url, token, org, bucket, kuerzel]):
        return []

    flux = f"""
from(bucket: "{bucket}")
  |> range(start: -{days + 10}d)
  |> filter(fn: (r) => r["_measurement"] == "{MEAS_PRICES}" and r["kuerzel"] == "{kuerzel}" and r["_field"] == "kurs")
  |> aggregateWindow(every: 1d, fn: last, createEmpty: false)
  |> sort(columns: ["_time"])
  |> tail(n: {days})
"""
    prices: list[dict] = []
    try:
        async with session.post(
            _query_url(base_url, org),
            headers=_query_headers(token),
            data=flux,
        ) as r:
            if r.status != 200:
                _LOGGER.debug("InfluxDB query_price_history %s: %s", r.status, await r.text())
                return prices
            text = await r.text()

        for row in _parse_annotated_csv(text):
            time_s = row.get("_time", "")
            val_s  = row.get("_value", "")
            if time_s and val_s:
                try:
                    prices.append({"date": time_s[:10], "kurs": round(float(val_s), 3)})
                except ValueError:
                    pass
    except Exception as exc:
        _LOGGER.debug("InfluxDB query_price_history Fehler: %s", exc)

    return prices


async def query_transactions(
    session, base_url: str, token: str, org: str, bucket: str,
    portfolio: str,
) -> list[dict[str, Any]]:
    """Alle Verkaufs-Transaktionen eines Portfolios abfragen."""
    if not all([base_url, token, org, bucket]):
        return []

    flux = f"""
from(bucket: "{bucket}")
  |> range(start: -30y)
  |> filter(fn: (r) => r["_measurement"] == "{MEAS_TRADES}" and r["portfolio"] == "{portfolio}" and r["typ"] == "verkauf")
  |> pivot(rowKey: ["_time", "kuerzel"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"], desc: true)
"""
    transactions: list[dict] = []
    try:
        async with session.post(
            _query_url(base_url, org),
            headers=_query_headers(token),
            data=flux,
        ) as r:
            if r.status != 200:
                _LOGGER.debug("InfluxDB query_transactions %s: %s", r.status, await r.text())
                return transactions
            text = await r.text()

        for row in _parse_annotated_csv(text):
            if not row.get("kuerzel"):
                continue
            tx: dict[str, Any] = {"kuerzel": row.get("kuerzel", "")}
            for key in (
                "bezeichnung", "kaufkurs", "verkaufskurs", "stueckzahl",
                "kaufdatum", "verkaufsdatum", "gewinn_brutto", "gewinn_brutto_pct",
                "gewinn_netto", "steuer_betrag", "erloes_gesamt",
            ):
                val = row.get(key, "")
                if val:
                    try:
                        tx[key] = float(val)
                    except ValueError:
                        tx[key] = val
            # Zeitstempel als Verkaufsdatum-Fallback
            if "verkaufsdatum" not in tx and row.get("_time"):
                tx["verkaufsdatum"] = row["_time"][:10]
            transactions.append(tx)

    except Exception as exc:
        _LOGGER.debug("InfluxDB query_transactions Fehler: %s", exc)

    return transactions


# ── Löschen ───────────────────────────────────────────────────────────────────

async def delete_stock_history(
    session, base_url: str, token: str, org: str, bucket: str,
    kuerzel: str,
) -> None:
    """Gesamte Kurshistorie einer Aktie aus InfluxDB löschen."""
    if not all([base_url, token, org, bucket, kuerzel]):
        return

    import json as _json
    payload = _json.dumps({
        "start": "1970-01-01T00:00:00Z",
        "stop":  "2099-12-31T23:59:59Z",
        "predicate": f'_measurement="{MEAS_PRICES}" AND kuerzel="{kuerzel}"',
    })
    try:
        async with session.post(
            _delete_url(base_url, org, bucket),
            headers={
                "Authorization": f"Token {token}",
                "Content-Type": "application/json",
            },
            data=payload,
        ) as r:
            if r.status != 204:
                _LOGGER.debug("InfluxDB delete_stock_history %s: %s", r.status, await r.text())
            else:
                _LOGGER.debug("InfluxDB: Kurshistorie für '%s' gelöscht.", kuerzel)
    except Exception as exc:
        _LOGGER.debug("InfluxDB delete_stock_history Fehler: %s", exc)
