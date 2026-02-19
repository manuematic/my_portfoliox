"""Yahoo Finance data fetcher for Mein Portfolio."""
from __future__ import annotations

import logging
import re
import json

import aiohttp

from .const import YAHOO_BASE_URL, YAHOO_HEADERS

_LOGGER = logging.getLogger(__name__)


async def fetch_stock_price(session: aiohttp.ClientSession, kuerzel: str) -> float | None:
    """Fetch current stock price from Yahoo Finance."""
    url = YAHOO_BASE_URL.format(kuerzel)
    try:
        async with session.get(url, headers=YAHOO_HEADERS, timeout=aiohttp.ClientTimeout(total=15)) as response:
            if response.status != 200:
                _LOGGER.warning("Yahoo Finance returned status %s for %s", response.status, kuerzel)
                return None

            html = await response.text()

            # Method 1: Try to extract from JSON embedded in page (most reliable)
            # Yahoo embeds stock data in a script tag as JSON
            pattern = r'"regularMarketPrice":\{"raw":([\d.]+)'
            match = re.search(pattern, html)
            if match:
                price = float(match.group(1))
                _LOGGER.debug("Fetched price for %s: %s (method: JSON)", kuerzel, price)
                return price

            # Method 2: Try meta tag / data attribute
            pattern2 = r'data-symbol="' + re.escape(kuerzel) + r'"[^>]*data-last="([\d.]+)"'
            match2 = re.search(pattern2, html)
            if match2:
                price = float(match2.group(1))
                _LOGGER.debug("Fetched price for %s: %s (method: data-attr)", kuerzel, price)
                return price

            # Method 3: fin-streamer tag
            pattern3 = r'<fin-streamer[^>]*data-symbol="' + re.escape(kuerzel) + r'"[^>]*value="([\d.]+)"'
            match3 = re.search(pattern3, html)
            if match3:
                price = float(match3.group(1))
                _LOGGER.debug("Fetched price for %s: %s (method: fin-streamer)", kuerzel, price)
                return price

            # Method 4: Generic fin-streamer with regularMarketPrice
            pattern4 = r'<fin-streamer[^>]*data-field="regularMarketPrice"[^>]*value="([\d.]+)"'
            match4 = re.search(pattern4, html)
            if match4:
                price = float(match4.group(1))
                _LOGGER.debug("Fetched price for %s: %s (method: fin-streamer-field)", kuerzel, price)
                return price

            _LOGGER.warning("Could not parse price for %s from Yahoo Finance", kuerzel)
            return None

    except aiohttp.ClientError as err:
        _LOGGER.error("HTTP error fetching price for %s: %s", kuerzel, err)
        return None
    except ValueError as err:
        _LOGGER.error("Value error parsing price for %s: %s", kuerzel, err)
        return None
    except Exception as err:  # pylint: disable=broad-except
        _LOGGER.error("Unexpected error fetching price for %s: %s", kuerzel, err)
        return None
