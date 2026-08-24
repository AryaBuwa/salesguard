import os
import json
import re
import random
import math
from difflib import SequenceMatcher
from dotenv import load_dotenv
from langgraph.graph import StateGraph, END
from langchain_groq import ChatGroq
from linkup import LinkupClient
from typing import List, Any
from typing_extensions import TypedDict

load_dotenv()

class AgentState(TypedDict):
    company: str
    results: List[Any]
    risk_score: int
    risk_summary: str
    suggestions: List[str]
    logo: str
    homepage: str
    homepage_verified: bool
    linkedin: str
    linkedin_verified: bool

# ---------------------------------------------------------------------------
# Domain validation helpers
# ---------------------------------------------------------------------------

SUFFIXES = [
    "inc", "incorporated", "corp", "corporation", "llc", "ltd",
    "limited", "co", "company", "group", "holdings", "plc"
]

NOISE_DOMAINS = [
    "linkedin.com", "facebook.com", "twitter.com", "x.com",
    "wikipedia.org", "crunchbase.com", "github.com", "youtube.com",
    "instagram.com", "pinterest.com", "reddit.com", "glassdoor.com",
    "bloomberg.com", "forbes.com", "reuters.com", "cnbc.com",
    "wsj.com", "nytimes.com", "businessinsider.com", "techcrunch.com",
    "medium.com", "quora.com", "stackoverflow.com", ".edu", ".gov",
    "indeed.com", "ziprecruiter.com", "owler.com", "zoominfo.com"
]


# TLDs recognized when a company name is written as (or looks like) a bare
# domain, e.g. "linkup.so", "linkup .so", "cal.com". Without this,
# normalize_company("linkup .so") -> "linkupso" (8 chars) never matches
# root_domain_base("linkup.so") -> "linkup" (6 chars) closely enough: the
# fuzzy ratio lands at 0.857, just under the 0.90 threshold used in
# domain_matches_company. Stripping the TLD here fixes it without loosening
# that threshold (loosening it would reopen the salesforcebin.com /
# Ayron-Aaron false-match bugs already fixed).
KNOWN_TLDS = ["com", "so", "io", "ai", "dev", "co", "app", "net", "org", "xyz"]
_TLD_SUFFIX_RE = re.compile(r"^(.*\S)\s*\.\s*(" + "|".join(KNOWN_TLDS) + r")$")


def normalize_company(name: str) -> str:
    """Strip legal suffixes, punctuation, spaces -> comparable token."""
    name = name.lower().strip()

    # If the name is literally "brand.tld" or "brand .tld", strip the TLD
    # part first so it normalizes the same way the domain itself would.
    # Anchored to the end of the string so it only fires on a trailing
    # "<name>.<tld>" shape, not unrelated internal periods.
    m = _TLD_SUFFIX_RE.match(name)
    if m:
        name = m.group(1)

    name = re.sub(r"[^a-z0-9\s]", "", name)
    words = [w for w in name.split() if w not in SUFFIXES]
    return "".join(words)


def root_domain_base(domain: str) -> str:
    """Get the registrable second-level label: news.microsoft.com -> microsoft"""
    domain = domain.lower().replace("www.", "")
    parts = domain.split(".")
    return parts[-2] if len(parts) >= 2 else parts[0]


def domain_matches_company(domain: str, company: str) -> bool:
    """
    Does this domain plausibly belong to this company?
    Strict on purpose: exact match, or a small typo-level edit distance only.
    Loose substring/containment matching is what let 'salesforcebin.com'
    pass as a match for 'Salesforce' before — any domain that merely
    *contains* the company name (with junk appended) must NOT match.
    """
    if not domain:
        return False
    domain_base = root_domain_base(domain)
    company_norm = normalize_company(company)
    if not company_norm or not domain_base:
        return False
    if domain_base == company_norm:
        return True
    if abs(len(domain_base) - len(company_norm)) > 2:
        return False
    ratio = SequenceMatcher(None, domain_base, company_norm).ratio()
    return ratio >= 0.90


def is_noise_domain(domain: str) -> bool:
    domain_lower = domain.lower()
    return any(noise in domain_lower for noise in NOISE_DOMAINS)


def extract_domain(url: str) -> str:
    parts = url.split("/")
    return parts[2] if len(parts) > 2 else ""


# Reputable, non-templated sources — preferred when trimming down to the
# final result set used for scoring and the LLM summary.
TRUSTED_NEWS_DOMAINS = [
    "reuters.com", "bloomberg.com", "wsj.com", "cnbc.com", "ft.com",
    "apnews.com", "techcrunch.com", "businesswire.com", "prnewswire.com",
    "sec.gov", "axios.com", "theverge.com", "forbes.com", "nytimes.com",
]

# Broader "verified source" set shown to the user as a trust signal per
# result card. Superset of TRUSTED_NEWS_DOMAINS (which is used internally
# for ranking) plus other well-known, editorially-vetted outlets and
# official/government sources that weren't otherwise in the ranking list.
# A domain being in here means "a sales rep would recognize and trust this
# outlet" — NOT the same claim as TRUSTED_NEWS_DOMAINS, which is about
# ranking priority for the scoring corpus specifically.
VERIFIED_SOURCE_DOMAINS = set(TRUSTED_NEWS_DOMAINS) | {
    # Wire services / general news
    "washingtonpost.com", "theguardian.com", "bbc.com", "npr.org",
    "usatoday.com", "latimes.com", "abcnews.go.com", "cbsnews.com",
    "nbcnews.com", "time.com", "economist.com", "newsweek.com",
    "apnews.com", "afp.com", "upi.com",
    # Business / finance specific
    "marketwatch.com", "barrons.com", "fortune.com", "investopedia.com",
    "finance.yahoo.com", "seekingalpha.com", "morningstar.com",
    "pitchbook.com", "crunchbase.com", "sifted.eu",
    # Tech / AI industry press — heavily relevant for AI-infra and startup
    # coverage, which generic "trusted news" lists tend to miss
    "wired.com", "arstechnica.com", "engadget.com", "venturebeat.com",
    "zdnet.com", "cnet.com", "theinformation.com", "semianalysis.com",
    "techinasia.com", "siliconangle.com", "protocol.com", "restofworld.org",
    "theregister.com", "spectrum.ieee.org",
    # Global business outlets (non-US companies show up constantly)
    "ft.com", "nikkei.com", "scmp.com", "handelsblatt.com", "lesechos.fr",
    "reuters.com", "bloomberg.com",
    # Official / government / regulatory
    "sec.gov", "ftc.gov", "justice.gov", "europa.eu", "gov.uk",
    "esma.europa.eu", "find-and-update.company-information.service.gov.uk",
    # Wire press-release distributors (legitimate, just not editorial)
    "globenewswire.com", "prweb.com", "businesswire.com", "prnewswire.com",
}


def is_verified_source(domain: str) -> bool:
    """Is this domain a recognized, editorially-vetted or official source?
    Shown to the user as a per-result trust badge — distinct from
    TRUSTED_NEWS_DOMAINS, which only affects internal ranking order."""
    domain = domain.lower().replace("www.", "")
    return any(domain == d or domain.endswith("." + d) for d in VERIFIED_SOURCE_DOMAINS)

# Content-farm / auto-generated market-activity sites observed reusing
# identical boilerplate phrasing across unrelated companies (e.g. "in Wake
# of Lawsuits and Leadership Changes" verbatim on both a Citigroup and a
# PayPal article). This inflates keyword-based risk scoring with generic
# template language that isn't actually about the company's real situation.
# Expand this list empirically as you spot more of the pattern.
LOW_QUALITY_CONTENT_DOMAINS = [
    "ainvest.com", "getlatka.com", "equityzen.com",
    "riskintelligenceservice.com",  # generates near-identical "Enterprise Risk
                                     # Assessment Report" filler per company —
                                     # especially dangerous since it's risk-flavored
    "techbriefly.com",              # thin auto-generated archive pages, nav
                                     # boilerplate leaking into snippets
    "deepresearchglobal.com",       # templated AI-generated SWOT-analysis filler
    "financialcontent.com",         # syndicated clickbait financial content mill
]


def rank_and_filter_results(raw_results, limit=12, max_per_domain=3, title_similarity_threshold=0.75):
    """
    Drop known templated/low-signal sources, prioritize reputable sources,
    but also cap how many results can come from a single domain and skip
    near-duplicate titles. Without this, a wire service like PRNewswire —
    genuinely reputable, but syndicating many separate releases for the
    same company — can win the trusted-source sort and eat 5-6 of the 8
    slots, crowding out Reuters/Bloomberg/CNBC entirely and reducing the
    scoring corpus to redundant earnings-report reposts.
    """
    filtered = []
    for r in raw_results:
        url = getattr(r, "url", "")
        domain = extract_domain(url).lower()
        if any(bad in domain for bad in LOW_QUALITY_CONTENT_DOMAINS):
            continue
        filtered.append(r)

    filtered.sort(key=lambda r: 0 if any(
        good in extract_domain(getattr(r, "url", "")).lower() for good in TRUSTED_NEWS_DOMAINS
    ) else 1)

    selected = []
    domain_counts = {}
    seen_titles = []
    for r in filtered:
        if len(selected) >= limit:
            break
        domain = extract_domain(getattr(r, "url", "")).lower()
        title = (getattr(r, "name", "") or "").lower()

        if domain_counts.get(domain, 0) >= max_per_domain:
            continue
        if any(SequenceMatcher(None, title, seen).ratio() > title_similarity_threshold for seen in seen_titles):
            continue

        selected.append(r)
        domain_counts[domain] = domain_counts.get(domain, 0) + 1
        seen_titles.append(title)

    return selected


def root_domain(domain: str) -> str:
    """
    Collapse a subdomain down to its registrable root: newsroom.ibm.com -> ibm.com.
    Subdomains (press/newsroom/investor-relations pages) often have missing or
    broken favicons and aren't the page you actually want to link a user to —
    this is what caused IBM's logo to render as a random unrelated icon.
    Known limitation: multi-part TLDs (co.uk, com.au) will over-truncate
    (e.g. bbc.co.uk -> co.uk) — acceptable for now since .com/.ai/.io etc
    dominate the companies this tool searches, but worth a manual override
    table later if UK/AU-heavy companies become common.
    """
    parts = domain.split(".")
    return ".".join(parts[-2:]) if len(parts) >= 2 else domain


# Manual overrides for companies whose real domain has no string similarity
# to their name — no fuzzy-matching approach can bridge "Texas Instruments"
# to "ti.com", they're just genuinely different strings. This is normal;
# every company-data product ships a table like this. Extend as you hit more.
KNOWN_DOMAIN_OVERRIDES = {
    "texasinstruments": "ti.com",
    "generalelectric": "ge.com",
    "hewlettpackard": "hp.com",
    "ibm": "ibm.com",                       # was keyed "internationalbusinessmachines"
    "internationalbusinessmachines": "ibm.com",  # keep for people who type the full name
    "proctergamble": "pg.com",
    "goldmansachs": "goldmansachs.com",
    "jpmorgan": "jpmorgan.com",
    "americanexpress": "americanexpress.com",
    # Major/frequently-demoed brands — pinned explicitly so an unlucky search
    # result (e.g. google.org, a legitimately Google-owned but non-homepage
    # domain) can never win by default when nothing else is there to compare
    # it against.
    "google": "google.com",
    "microsoft": "microsoft.com",
    "apple": "apple.com",
    "amazon": "amazon.com",
    "meta": "meta.com",
    "netflix": "netflix.com",
    "samsung": "samsung.com",
    "anthropic": "anthropic.com",
    "openai": "openai.com",
    "nvidia": "nvidia.com",
    "salesforce": "salesforce.com",
}


# Preference order when multiple validated domains are found for the same
# company (e.g. both anthropic.com and anthropic.org pass name-matching) —
# .com/.ai/.io/.dev/.so/.co/.app are the common real company TLDs today;
# .net/.org are far more often unrelated orgs, fan pages, or squatters.
TLD_PRIORITY = [".com", ".ai", ".io", ".dev", ".so", ".co", ".app", ".net", ".org"]


def tld_rank(domain: str) -> int:
    for i, tld in enumerate(TLD_PRIORITY):
        if domain.endswith(tld):
            return i
    return len(TLD_PRIORITY)


def pick_best_domain(candidates: list) -> str:
    """
    Pick the best domain from a pool of validated candidates gathered across
    multiple independent signals (official-website search, LinkedIn content,
    news results). Prefers the domain that shows up most often (consensus —
    the real domain tends to appear across several independent sources),
    tie-broken by TLD priority. This replaces "take the first one that
    passes validation," which is what let anthropic.org beat anthropic.com
    when .org happened to rank first in a single search call.
    """
    if not candidates:
        return None
    counts = {}
    for d in candidates:
        counts[d] = counts.get(d, 0) + 1
    return sorted(counts.items(), key=lambda item: (-item[1], tld_rank(item[0])))[0][0]


def linkedin_slug_matches_company(url: str, company: str) -> bool:
    """
    Validate a LinkedIn company-page URL against the company name. Without
    this, the old code accepted the FIRST url containing 'linkedin.com/company'
    with zero name check — which is how a regional page like
    linkedin.com/company/googlecloudcolorado got accepted for 'Google'.

    Uses EXACT match only, no fuzzy tolerance. domain_matches_company's
    typo-tolerance exists for domain squatting (a deliberately-registered
    near-miss domain), which doesn't really apply to LinkedIn company
    slugs — and that tolerance was wide enough to conflate "Ayron Security"
    with an unrelated "Aaron Security & Services" (one letter apart, but
    genuinely different companies). Better to occasionally miss a real
    LinkedIn page than confidently show the wrong company's profile.
    """
    m = re.search(r"linkedin\.com/company/([a-zA-Z0-9\-]+)", url)
    if not m:
        return False
    slug = m.group(1).replace("-", "")
    slug_norm = re.sub(r"[^a-z0-9]", "", slug.lower())
    return slug_norm == normalize_company(company)


# ---------------------------------------------------------------------------

def search_linkup_node(state: AgentState) -> AgentState:
    client = LinkupClient(api_key=os.getenv("LINKUP_API_KEY"))
    company = state["company"]
    company_lower = company.lower().replace(" ", "")

    # Known abbreviation-mismatch override — check first, it's a known-good
    # answer and skips the ambiguity entirely for these specific companies.
    override_domain = KNOWN_DOMAIN_OVERRIDES.get(normalize_company(company))

    response = client.search(
        query=f"What are the latest business developments for {company} in 2026 — "
              f"financial performance, product launches, partnerships, leadership changes, "
              f"and any notable risks or controversies?",
        depth="deep",
        output_type="searchResults"
    )
    filtered_response_results = rank_and_filter_results(response.results, limit=12)
    results = []
    for r in filtered_response_results:
        url = getattr(r, "url", "")
        domain = extract_domain(url)
        results.append({
            "name": getattr(r, "name", ""),
            "url": url,
            "content": getattr(r, "content", ""),
            "favicon": f"https://www.google.com/s2/favicons?domain={domain}&sz=32",
            "verified": is_verified_source(domain)
        })

    # --- LinkedIn lookup: validate the slug against the company name, don't
    # just take the first URL containing "linkedin.com/company" — that's what
    # let a regional page (googlecloudcolorado) through for "Google" before.
    linkedin_url = ""
    linkedin_domain_candidates = []
    try:
        li_response = client.search(
            query=f"{company} official LinkedIn company page",
            depth="standard",
            output_type="searchResults"
        )
        for r in li_response.results[:10]:
            url = getattr(r, "url", "")
            if "linkedin.com/company" not in url:
                continue
            if linkedin_slug_matches_company(url, company):
                linkedin_url = url.split("?")[0]
                # also mine the snippet content for a homepage domain mention
                content = (getattr(r, "content", "") or "").lower()
                found = re.findall(r"\b([a-z0-9-]+\.(?:com|ai|io|co|dev|so|app|net|org))\b", content)
                for d in found:
                    if not is_noise_domain(d) and domain_matches_company(d, company):
                        linkedin_domain_candidates.append(root_domain(d))
                break  # first VALIDATED match, not first match overall
    except Exception as e:
        print("LinkedIn search error:", e)
    state["linkedin"] = linkedin_url or f"https://www.linkedin.com/company/{company_lower}"
    state["linkedin_verified"] = bool(linkedin_url)

    # --- Official website search: collect ALL validated candidates instead
    # of stopping at the first one, so we can pick by consensus + TLD priority
    # rather than gambling on whatever Linkup happened to rank first
    # (this is what let anthropic.org beat anthropic.com before).
    domain_candidates = []
    try:
        web_response = client.search(
            query=f"{company} official website",
            depth="standard",
            output_type="searchResults"
        )
        for r in web_response.results[:10]:
            url = getattr(r, "url", "")
            if not url:
                continue
            domain = extract_domain(url).replace("www.", "")
            if not domain or is_noise_domain(domain):
                continue
            if domain_matches_company(domain, company):
                domain_candidates.append(root_domain(domain))
    except Exception as e:
        print("Homepage search error:", e)

    # Add LinkedIn-derived and news-result candidates into the same pool
    domain_candidates.extend(linkedin_domain_candidates)
    for r in results:
        url = r.get("url", "")
        if not url:
            continue
        domain = extract_domain(url).replace("www.", "")
        if domain and not is_noise_domain(domain) and domain_matches_company(domain, company):
            domain_candidates.append(root_domain(domain))

    official_domain = override_domain or pick_best_domain(domain_candidates)

    # No blind .com guessing — many real companies use .ai/.dev/.so/.io etc,
    # and a wrong guessed link is worse than admitting we didn't find one.
    state["homepage_verified"] = bool(official_domain)
    if official_domain:
        state["homepage"] = f"https://{official_domain}"
        state["logo"] = f"https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://{official_domain}&size=128"
    else:
        state["homepage"] = ""
        state["logo"] = ""

    # A result from the company's OWN confirmed domain (its blog, newsroom,
    # press releases, investor-relations subdomain, etc.) is a primary
    # source about itself and should read as verified — it just isn't in
    # VERIFIED_SOURCE_DOMAINS, which is a media-outlet allowlist, not a
    # per-company one. This runs after official_domain resolution since
    # that's the only point we know what "the company's own domain" is.
    if official_domain:
        for r in results:
            if r["verified"]:
                continue
            result_domain = extract_domain(r.get("url", "")).replace("www.", "")
            if result_domain and root_domain(result_domain) == official_domain:
                r["verified"] = True

    state["results"] = results
    return state

critical = ["bankruptcy", "fraud", "criminal", "insolvency", "hack", "breach", "class action", "sec investigation"]
high = ["lawsuit", "layoffs", "scandal", "investigation", "fine", "penalty", "recall", "restructuring"]
medium = ["decline", "dispute", "warning", "resignation", "controversy", "acquisition"]
positive = ["record revenue", "profit growth", "beat earnings", "market leader", "expansion", "award", "partnership"]

def calculate_risk_math_node(state: AgentState) -> AgentState:
    text = " ".join([r["content"] for r in state["results"]]).lower()

    def count_hits(words):
        # leading \b only (no trailing \b) so "lawsuit" also catches
        # "lawsuits", "breach" also catches "breached" — the old exact
        # \bword\b boundary silently missed these inflected forms
        return sum(len(re.findall(r"\b" + re.escape(w), text)) for w in words)

    crit_hits = count_hits(critical)
    high_hits = count_hits(high)
    med_hits = count_hits(medium)
    pos_hits = count_hits(positive)

    # Log-scaled hit counts (diminishing returns) instead of density-per-1000-words.
    # Density blows up when total_words is small (short/few search snippets) —
    # 2-3 hits in a 400-word corpus could swing the score as hard as 20 hits
    # in a 4000-word one. log1p caps the marginal impact of each additional
    # mention, so a short snippet with a couple of hits can't fake severity
    # the way linear density could.
    weighted = (
        12 * math.log1p(crit_hits)
        + 6 * math.log1p(high_hits)
        + 3 * math.log1p(med_hits)
        - 5 * math.log1p(pos_hits)
    )
    raw = 20 + weighted

    # Smooth bounded mapping (logistic squash), recalibrated for the log1p scale.
    center, scale = 31.59, 7.2
    squashed = 1 / (1 + math.exp(-(raw - center) / scale))
    score = 5 + squashed * 90

    state["risk_score"] = round(score)

    # Debug visibility — remove or lower to logging.debug() once you trust it.
    print(
        f"[risk] {state.get('company')}: critical={crit_hits} high={high_hits} "
        f"medium={med_hits} positive={pos_hits} raw={raw:.1f} score={state['risk_score']}"
    )
    return state

def groq_analysis_node(state: AgentState) -> AgentState:
    llm = ChatGroq(model="openai/gpt-oss-120b", api_key=os.getenv("GROQ_API_KEY"))
    snippets = "\n".join([f"- {r['name']}: {r['content'][:250]}" for r in state["results"]])
    target = random.randint(6, 9)
    prompt = f"""You are a senior B2B sales intelligence analyst. Analyze "{state['company']}" and return ONLY valid JSON, no markdown, no backticks.

News:
{snippets}

Risk Score: {state['risk_score']}/100

Return:
{{
  "risk_summary": "3-4 sentences specific to {state['company']} only. Start with market position. Mention one specific recent event. End with what this means for a sales rep today. Never use generic phrases.",
  "suggestions": [
    "specific actionable outreach tactic",
    "angle based on a recent news item",
    "timing or trigger-based suggestion",
    "competitive or market-based angle",
    "risk mitigation or objection handling tip",
    "relationship or stakeholder approach",
    "value proposition for their current situation",
    "follow-up or nurture strategy",
    "executive-level engagement angle"
  ]
}}

Rules:
- Return EXACTLY {target} suggestions — no more, no less
- All suggestions must be specific to {state['company']}
- Pure JSON only, no markdown"""

    response = llm.invoke(prompt)
    raw = re.sub(r"```json|```", "", response.content.strip()).strip()
    try:
        parsed = json.loads(raw)
        state["risk_summary"] = parsed.get("risk_summary", "No summary available.")
        suggestions = parsed.get("suggestions", [])
        # Enforce 6-9 range
        if len(suggestions) < 6:
            suggestions += [
                "Reference a recent company milestone in your opener",
                "Address risk factors proactively in your pitch",
                "Ask about their current strategic priorities"
            ]
        state["suggestions"] = suggestions[:9]
    except Exception:
        state["risk_summary"] = raw[:400]
        state["suggestions"] = [
            "Review recent news before the call",
            "Ask about current strategic priorities",
            "Check LinkedIn for recent leadership changes",
            "Reference a recent company milestone in your opener",
            "Address any risk factors proactively in your pitch",
            "Lead with value relevant to their current market position"
        ]
    return state

def build_graph():
    graph = StateGraph(AgentState)
    graph.add_node("search", search_linkup_node)
    graph.add_node("risk", calculate_risk_math_node)
    graph.add_node("analyze", groq_analysis_node)
    graph.set_entry_point("search")
    graph.add_edge("search", "risk")
    graph.add_edge("risk", "analyze")
    graph.add_edge("analyze", END)
    return graph.compile()