import json
from functools import lru_cache
from urllib.parse import urlencode
from urllib.request import Request, urlopen


@lru_cache(maxsize=512)
def geocode_location_name(query):
    cleaned = (query or '').strip()
    if len(cleaned) < 3:
        return (None, None)

    params = urlencode({'q': cleaned, 'format': 'json', 'limit': 1})
    url = 'https://nominatim.openstreetmap.org/search?' + params
    req = Request(url, headers={
        'User-Agent': 'NextGenSmartFinanceManager/1.0',
        'Accept': 'application/json',
    })

    try:
        with urlopen(req, timeout=6) as resp:
            payload = json.loads(resp.read().decode('utf-8'))
    except Exception:
        return (None, None)

    if not payload:
        return (None, None)

    first = payload[0]
    try:
        lat = round(float(first.get('lat')), 6)
        lng = round(float(first.get('lon')), 6)
    except (TypeError, ValueError):
        return (None, None)

    return (lat, lng)
