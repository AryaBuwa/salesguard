import os
import json
import re
import random
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
    linkedin: str

def search_linkup_node(state: AgentState) -> AgentState:
    client = LinkupClient(api_key=os.getenv("LINKUP_API_KEY"))
    response = client.search(
        query=f"{state['company']} latest news financials lawsuits leadership changes 2025",
        depth="deep",
        output_type="searchResults"
    )
    results = []
    for r in response.results[:8]:
        url = getattr(r, "url", "")
        domain = url.split("/")[2] if url and len(url.split("/")) > 2 else ""
        results.append({
            "name": getattr(r, "name", ""),
            "url": url,
            "content": getattr(r, "content", ""),
            "favicon": f"https://www.google.com/s2/favicons?domain={domain}&sz=32"
        })

    company_lower = state['company'].lower().replace(' ', '')

    official_domain = None
    try:
        web_response = client.search(
            query=f"{state['company']} official website",
            depth="standard",
            output_type="searchResults"
        )
        for r in web_response.results[:5]:
            url = getattr(r, "url", "")
            if url:
                domain = url.split("/")[2] if len(url.split("/")) > 2 else ""
                domain_lower = domain.lower()
                invalid_domains = [
                    "linkedin.com", "facebook.com", "twitter.com", "x.com", 
                    "wikipedia.org", "crunchbase.com", "github.com", "youtube.com",
                    "instagram.com", "pinterest.com", "reddit.com", "glassdoor.com"
                ]
                if not any(x in domain_lower for x in invalid_domains):
                    official_domain = domain.replace("www.", "")
                    break
    except Exception as e:
        print("Homepage search error:", e)

    # Fallback to scanning search results
    if not official_domain:
        company_raw = state['company'].lower()
        company_clean = company_raw.replace(' ', '')
        company_hyphen = company_raw.replace(' ', '-')
        for r in results:
            url = r.get("url", "")
            if not url: continue
            domain = url.split("/")[2].replace("www.", "") if len(url.split("/")) > 2 else ""
            domain_base = domain.split(".")[0]
            if domain_base == company_clean or domain_base == company_hyphen:
                official_domain = domain
                break

    domain_guess = official_domain or f"{company_lower}.com"
    state["logo"] = f"https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://{domain_guess}&size=128"
    state["homepage"] = f"https://{official_domain}" if official_domain else f"https://www.{company_lower}.com"

    try:
        li_response = client.search(
            query=f"{state['company']} official LinkedIn company page",
            depth="standard",
            output_type="searchResults"
        )
        linkedin_url = ""
        for r in li_response.results[:5]:
            url = getattr(r, "url", "")
            if "linkedin.com/company" in url:
                linkedin_url = url.split("?")[0]
                break
        state["linkedin"] = linkedin_url or f"https://www.linkedin.com/company/{company_lower}"
    except:
        state["linkedin"] = f"https://www.linkedin.com/company/{company_lower}"

    state["results"] = results
    return state

critical = ["bankruptcy", "fraud", "criminal", "insolvency", "hack", "breach", "class action", "sec investigation"]
high = ["lawsuit", "layoffs", "scandal", "investigation", "fine", "penalty", "recall", "restructuring"]
medium = ["decline", "dispute", "warning", "resignation", "controversy", "acquisition"]
positive = ["record revenue", "profit growth", "beat earnings", "market leader", "expansion", "award", "partnership"]

def calculate_risk_math_node(state: AgentState) -> AgentState:
    text = " ".join([r["content"] for r in state["results"]]).lower()
    score = 20
    for w in critical:
        if w in text: score += 12
    for w in high:
        if w in text: score += 6
    for w in medium:
        if w in text: score += 3
    for w in positive:
        if w in text: score -= 5
    total_words = len(text.split())
    if total_words > 4000: score = int(score * 0.7)
    elif total_words > 2000: score = int(score * 0.85)
    state["risk_score"] = max(5, min(95, score))
    return state

def groq_analysis_node(state: AgentState) -> AgentState:
    llm = ChatGroq(model="llama-3.3-70b-versatile", api_key=os.getenv("GROQ_API_KEY"))
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