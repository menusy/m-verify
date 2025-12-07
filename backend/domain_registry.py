"""Utilities for working with the official gov.pl domain dataset."""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

GOV_SUFFIX = ".gov.pl"
ROOT_DOMAIN = "gov.pl"

DEFAULT_CACHE_TTL_SECONDS = int(os.getenv("GOV_DOMAIN_CACHE_TTL_SECONDS", "43200") or "43200")
DEFAULT_REMOTE_URL = os.getenv("GOV_DOMAIN_REMOTE_URL")
DEFAULT_REMOTE_TIMEOUT_SECONDS = int(os.getenv("GOV_DOMAIN_REMOTE_TIMEOUT_SECONDS", "15") or "15")

CATEGORY_ROOT = "Portal główny gov.pl"
CATEGORY_CENTRAL = "Administracja centralna"
CATEGORY_LOCAL = "Administracja terenowa i samorząd"
CATEGORY_CAMPAIGN = "Serwisy i kampanie informacyjne"
CATEGORY_SPECIAL = "Inne / wyspecjalizowane"

LOCAL_KEYWORDS = {
    "um",
    "ug",
    "urzad",
    "urzadmiasta",
    "miasto",
    "gmina",
    "powiat",
    "starostwo",
    "lodzkie",
    "slaskie",
    "kujawsko",
    "lubelskie",
    "malopolska",
    "mazowsze",
    "pomorskie",
    "podlaskie",
    "podkarpackie",
    "opolskie",
    "warminsko",
    "zachodniopomorskie",
}

CAMPAIGN_KEYWORDS = {
    "akcja",
    "kampania",
    "program",
    "projekt",
    "spis",
    "wybory",
    "bezpieczenstwo",
    "szczepimy",
    "szczepimysie",
    "gov",
    "info",
    "portal",
    "edukacja",
    "polska",
    "2020",
    "2021",
    "2022",
    "2023",
    "2024",
    "2025",
}

CENTRAL_KEYWORDS = {
    "gov",
    "kprm",
    "kancelaria",
    "mon",
    "mzb",
    "mswia",
    "mf",
    "mz",
    "nfosigw",
    "nfz",
    "zus",
    "podatki",
    "obywatel",
    "cesc",
    "ceidg",
    "govpl",
}


def _to_iso(ts: Optional[float]) -> Optional[str]:
    if not ts:
        return None
    return (
        datetime.fromtimestamp(ts, tz=timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
    )


def normalize_hostname(value: Optional[str]) -> Optional[str]:
    """Normalize arbitrary user input into a lowercase hostname."""
    if value is None:
        return None

    candidate = str(value).strip()
    if not candidate:
        return None

    parsed = urlparse(candidate if "://" in candidate else f"//{candidate}", scheme="https")
    host = (parsed.hostname or "").strip()

    if not host:
        # Fallback: try to strip ports/paths manually
        stripped = candidate.split("/")[0].split("?")[0]
        host = stripped.split(":")[0]

    host = host.strip().strip(".")
    if not host:
        return None

    try:
        host = host.encode("idna").decode("ascii")
    except UnicodeError:
        # Leave host as-is if it cannot be IDNA-encoded
        pass

    return host.lower()


class DomainRegistry:
    """Loads and caches the official list of gov.pl domains."""

    def __init__(
        self,
        source_path: Path,
        *,
        cache_ttl: int = DEFAULT_CACHE_TTL_SECONDS,
        remote_url: Optional[str] = DEFAULT_REMOTE_URL,
        remote_timeout: int = DEFAULT_REMOTE_TIMEOUT_SECONDS,
    ) -> None:
        self.source_path = Path(source_path)
        self.cache_ttl = cache_ttl
        self.remote_url = remote_url
        self.remote_timeout = remote_timeout

        self._lock = threading.Lock()
        self._entries: List[Dict] = []
        self._lookup: Dict[str, Dict] = {}
        self._categories: List[str] = []
        self._meta: Dict[str, Optional[str]] = {}
        self._last_refreshed: float = 0.0
        self._last_source: Optional[str] = None
        self._last_error: Optional[str] = None

        # Attempt an initial load so endpoints can respond immediately.
        self.ensure_fresh(force=True)

    def ensure_fresh(self, *, force: bool = False) -> None:
        """Reload the dataset if the cache expired or when forced."""
        now = time.time()
        if not force and self._entries and (now - self._last_refreshed) < self.cache_ttl:
            return

        with self._lock:
            now = time.time()
            if not force and self._entries and (now - self._last_refreshed) < self.cache_ttl:
                return

            try:
                payload, origin = self._load_payload()
                entries, lookup, categories, meta = self._parse_payload(payload)
            except Exception as exc:  # pragma: no cover - defensive
                self._last_error = str(exc)
                logger.exception("Nie udało się załadować bazy domen gov.pl: %s", exc)
                if self._entries:
                    # Keep serving stale data but expose the error via cache info.
                    return
                raise RuntimeError("Brak danych o domenach gov.pl") from exc

            if not entries:
                raise RuntimeError("Pobrany plik gov.json nie zawiera żadnych domen.")

            self._entries = entries
            self._lookup = lookup
            self._categories = categories
            self._meta = meta
            self._last_refreshed = time.time()
            self._last_source = origin
            self._last_error = None

    def cache_info(self) -> Dict[str, Optional[str]]:
        """Return metadata about the current cache state."""
        expires_at = self._last_refreshed + self.cache_ttl if self._last_refreshed else None
        return {
            "last_refreshed": _to_iso(self._last_refreshed),
            "expires_at": _to_iso(expires_at),
            "ttl_seconds": self.cache_ttl,
            "entries_cached": len(self._entries),
            "last_error": self._last_error,
        }

    def verify(self, hostname: str) -> Dict:
        """Return a structured verification payload for a given hostname."""
        normalized = normalize_hostname(hostname)
        if not normalized:
            raise ValueError("Nieprawidłowy hostname.")

        self.ensure_fresh()

        is_gov_domain = normalized == ROOT_DOMAIN or normalized.endswith(GOV_SUFFIX)
        matched_domain = None
        matched_entry: Optional[Dict] = None

        for candidate in self._candidate_domains(normalized):
            if candidate in self._lookup:
                matched_domain = candidate
                matched_entry = self._lookup[candidate]
                break

        confidence = 1.0 if matched_entry and normalized == matched_domain else (0.85 if matched_entry else 0.0)

        message = self._build_message(
            normalized=normalized,
            matched_domain=matched_domain,
            is_gov_domain=is_gov_domain,
            has_match=matched_entry is not None,
        )

        advice = self._build_advice(is_gov_domain=is_gov_domain, has_match=matched_entry is not None)

        return {
            "hostname": hostname,
            "normalized_hostname": normalized,
            "is_gov_domain": is_gov_domain,
            "is_listed": matched_entry is not None,
            "matched_domain": matched_domain,
            "display_name": matched_entry.get("display_name") if matched_entry else None,
            "category": matched_entry.get("category") if matched_entry else None,
            "last_seen_at": matched_entry.get("last_seen_at") if matched_entry else None,
            "source_link": matched_entry.get("source_link") if matched_entry else None,
            "confidence": confidence,
            "message": message,
            "advice": advice,
            "cache": self.cache_info(),
            "source": {
                "origin": self._last_source,
                "declared_count": self._meta.get("declared_count"),
                "data_timestamp": self._meta.get("data_timestamp"),
            },
        }

    def query(
        self,
        *,
        q: Optional[str] = None,
        category: Optional[str] = None,
        limit: int = 250,
        offset: int = 0,
    ) -> Dict:
        """Return a filtered slice of the dataset."""
        self.ensure_fresh()

        q_lower = q.lower().strip() if q else None
        filtered: List[Dict] = []

        for entry in self._entries:
            if q_lower and q_lower not in entry["domain"] and q_lower not in entry.get("display_name", "").lower():
                continue
            if category and entry.get("category") != category:
                continue
            filtered.append(entry)

        total = len(filtered)
        start = max(offset, 0)
        end = start + max(limit, 0)
        sliced = filtered[start:end]

        return {
            "items": [self._public_entry(entry) for entry in sliced],
            "count": len(sliced),
            "total": total,
            "offset": start,
            "limit": max(limit, 0),
            "categories": self._categories,
            "cache": self.cache_info(),
        }

    def _public_entry(self, entry: Dict) -> Dict:
        return {
            "domain": entry["domain"],
            "display_name": entry.get("display_name"),
            "category": entry.get("category"),
            "last_seen_at": entry.get("last_seen_at"),
            "source_link": entry.get("source_link"),
        }

    def _load_payload(self) -> Tuple[Dict, str]:
        if self.source_path and self.source_path.exists():
            with self.source_path.open("r", encoding="utf-8") as handle:
                return json.load(handle), f"file://{self.source_path}"

        if self.remote_url:
            return self._fetch_remote_payload(), self.remote_url

        raise FileNotFoundError(
            f"Nie znaleziono pliku {self.source_path}. "
            "Ustaw zmienną GOV_DOMAIN_REMOTE_URL aby pobierać dane z API."
        )

    def _fetch_remote_payload(self) -> Dict:
        if not self.remote_url:
            raise FileNotFoundError("Brak zdefiniowanego źródła zewnętrznego dla domen gov.pl.")

        request = Request(
            self.remote_url,
            headers={"User-Agent": "m-verify-domain-registry/1.0"},
            method="GET",
        )

        try:
            with urlopen(request, timeout=self.remote_timeout) as response:
                encoding = response.headers.get_content_charset() or "utf-8"
                payload = response.read().decode(encoding, errors="replace")
                return json.loads(payload)
        except (HTTPError, URLError) as exc:
            raise RuntimeError(f"Nie udało się pobrać danych z {self.remote_url}: {exc}") from exc

    def _parse_payload(
        self,
        payload: Dict,
    ) -> Tuple[List[Dict], Dict[str, Dict], List[str], Dict[str, Optional[str]]]:
        entries: List[Dict] = []
        lookup: Dict[str, Dict] = {}
        categories: set = set()

        for row in payload.get("data", []):
            raw_domain = self._extract_domain(row)
            if not raw_domain:
                continue

            normalized = normalize_hostname(raw_domain)
            if not normalized:
                continue

            entry = {
                "domain": normalized,
                "display_name": raw_domain.strip(),
                "category": self._infer_category(normalized),
                "last_seen_at": row.get("meta", {}).get("updated_at"),
                "source_link": row.get("links", {}).get("self"),
            }

            lookup[normalized] = entry
            entries.append(entry)
            categories.add(entry["category"])

        entries.sort(key=lambda item: item["domain"])

        if ROOT_DOMAIN not in lookup:
            root_entry = {
                "domain": ROOT_DOMAIN,
                "display_name": "gov.pl",
                "category": CATEGORY_ROOT,
                "last_seen_at": payload.get("meta", {}).get("headers_map", {}).get("col1"),
                "source_link": payload.get("links", {}).get("self"),
            }
            entries.append(root_entry)
            lookup[ROOT_DOMAIN] = root_entry
            categories.add(CATEGORY_ROOT)

        meta = {
            "declared_count": str(payload.get("meta", {}).get("count") or ""),
            "data_timestamp": payload.get("meta", {}).get("headers_map", {}).get("col1"),
        }

        return entries, lookup, sorted(categories), meta

    def _extract_domain(self, row: Dict) -> Optional[str]:
        attributes = row.get("attributes") or {}
        col1 = attributes.get("col1") or {}
        return (col1.get("val") or col1.get("repr") or "").strip()

    def _candidate_domains(self, hostname: str) -> Iterable[str]:
        parts = hostname.split(".")
        for index in range(len(parts) - 1):
            candidate = ".".join(parts[index:])
            if candidate == ROOT_DOMAIN or candidate.endswith(GOV_SUFFIX):
                yield candidate

    def _build_message(
        self,
        *,
        normalized: str,
        matched_domain: Optional[str],
        is_gov_domain: bool,
        has_match: bool,
    ) -> str:
        if not is_gov_domain:
            return (
                f"Domena {normalized} nie kończy się na {GOV_SUFFIX} – "
                "prawdopodobnie nie należy do administracji publicznej."
            )

        if has_match and matched_domain:
            if normalized == matched_domain:
                return f"Domena {matched_domain} figuruje w oficjalnym rejestrze gov.pl."
            return (
                f"Domena {normalized} korzysta z oficjalnie zarejestrowanej bazy "
                f"{matched_domain} w strefie gov.pl."
            )

        return f"Nie znaleziono domeny {normalized} w kompendium gov.pl."

    def _build_advice(self, *, is_gov_domain: bool, has_match: bool) -> List[str]:
        if has_match:
            return [
                "Upewnij się, że adres w przeglądarce dokładnie odpowiada temu w komunikatach instytucji.",
                "Sprawdź certyfikat TLS – powinien być wystawiony na domenę gov.pl.",
            ]

        if not is_gov_domain:
            return [
                "Nie podawaj danych logowania ani numerów dokumentów na tej stronie.",
                "Zweryfikuj adres w oficjalnym kompendium domen gov.pl.",
                "Szukaj literówek lub dodatkowych znaków w adresie, które mogą sugerować phishing.",
            ]

        return [
            "Skontaktuj się z właściwą jednostką administracji i potwierdź poprawność adresu.",
            "Porównaj adres z listą domen w kompendium gov.pl.",
        ]

    def _infer_category(self, domain: str) -> str:
        if domain == ROOT_DOMAIN:
            return CATEGORY_ROOT

        if not domain.endswith(GOV_SUFFIX):
            return CATEGORY_SPECIAL

        prefix = domain[: -len(GOV_SUFFIX)].strip(".")
        if not prefix:
            return CATEGORY_ROOT

        levels = [chunk for chunk in prefix.split(".") if chunk]
        tokens = self._tokenize(prefix)

        if len(levels) == 1:
            token = tokens[0] if tokens else ""
            if token in CENTRAL_KEYWORDS:
                return CATEGORY_CENTRAL
            if token in CAMPAIGN_KEYWORDS:
                return CATEGORY_CAMPAIGN
            return CATEGORY_CENTRAL

        if any(token in LOCAL_KEYWORDS for token in tokens):
            return CATEGORY_LOCAL

        if any(token in CAMPAIGN_KEYWORDS for token in tokens):
            return CATEGORY_CAMPAIGN

        return CATEGORY_SPECIAL

    def _tokenize(self, value: str) -> List[str]:
        tokens: List[str] = []
        for chunk in value.replace("-", ".").split("."):
            chunk = chunk.strip().lower()
            if chunk:
                tokens.append(chunk)
        return tokens


