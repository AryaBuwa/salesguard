import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from agent.graph import build_graph

load_dotenv()
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str
    company: str
    context: str

class SearchRequest(BaseModel):
    company: str

@app.post("/search")
async def search(req: SearchRequest):
    try:
        graph = build_graph()
        result = graph.invoke({
            "company": req.company,
            "results": [],
            "risk_score": 0,
            "risk_summary": "",
            "suggestions": [],
            "logo": "",
            "homepage": "",
            "linkedin": ""
        })
        return {
            "company": req.company,
            "logo": result.get("logo", ""),
            "homepage": result.get("homepage", ""),
            "linkedin": result.get("linkedin", ""),
            "results": result["results"],
            "analysis": {
                "risk_score": result["risk_score"],
                "risk_summary": result["risk_summary"],
                "suggestions": result["suggestions"]
            }
        }
    except Exception as e:
        print("ERROR:", str(e))
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/chat")
async def chat(req: ChatRequest):
    try:
        from langchain_groq import ChatGroq
        llm = ChatGroq(model="llama-3.3-70b-versatile", api_key=os.getenv("GROQ_API_KEY"))
        
        system = f"""You are a strict B2B sales intelligence assistant for SalesGuard.

HARD RULES — NEVER BREAK THESE:
1. You ONLY answer questions about {req.company}. Nothing else.
2. If the user asks anything completely unrelated to {req.company} or sales (like coding, politics, weather), respond: "I can only assist with {req.company}-related sales intelligence."
3. When asked about contacts or who to reach out to, suggest job titles and departments (e.g. "Head of Procurement", "CTO", "VP of Sales") — never invent email addresses.
4. When asked for contact page or website, provide the official homepage URL from context if available. Never make up URLs.
5. LinkedIn company page questions are valid — provide the LinkedIn URL if known.
6. Never use markdown — no **bold**, no *bullets*, no # headers. Plain prose only.

Company Intelligence Data:
{req.context}

You are helping a sales representative prepare for or follow up on a call with {req.company}."""

        response = llm.invoke([
            {"role": "system", "content": system},
            {"role": "user", "content": req.message}
        ])
        return {"reply": response.content}
    except Exception as e:
        print("CHAT ERROR:", str(e))
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/health")
def health():
    return {"status": "ok"}