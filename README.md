# SalesGuard
> Real-time sales intelligence before every call.

## Upcoming Updates (Scheduled Till 15th August)
1. Updated risk scoring. ✔ (done) 
2. Verified pages/website loading with confidence score. (still buffering)
3. Web-Search fix and updates. 

## Current Progress (Updated on 14th August 2026 21:00)
1. Web search results again broke and affecting the report. (reports are fine its just wrong searches problem now.)
2. Implemented TLD-strip fix for official domain seperation again with few domain names pre-added, kind of worked but again faulty/wrong search results multiple times. I think I have to scrap this idea.   
3. Probably gonna restart the updates from start, because TLD-strip failed. Again! (updated on 14th August 2026 20:34)
4. The chatbot logic update and updating guardrails with more wider and stricter policy. ✔ (done)
5. Risk Scoring math working properly and showing correct scores. ✔ (done)

## Problem
Sales reps waste 30-45 minutes researching companies before calls.
SalesGuard does it in 30 seconds.

## Solution
Type a company name. SalesGuard fetches live news via Linkup deep search,
scores risk using a custom algorithm, and generates personalized outreach
strategies using Groq's LLM.

## How Linkup Is Used
Linkup powers two searches per query:
1. Deep search for company news, financials, and risk signals
2. Standard search to find the official LinkedIn company page

## Features
- Real-time risk scoring (5-95) from live news
- AI-generated executive summary
- 6-9 personalized outreach suggestions
- Official company links (website + LinkedIn)
- AI sales assistant chatbot (company-specific)
- PDF export
- Copy suggestions to clipboard

## Tech Stack
- Backend: FastAPI, LangGraph, Groq openai/gpt-oss-120b, Linkup API
- Frontend: React + Vite, jsPDF

## Run Locally
Follow these steps to set up and run the application on your machine. You will need two separate terminal windows.

## 1. Backend Setup
Navigate to the backend directory, install the required Python packages, and launch the FastAPI server:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --port 8001 --reload
```

## 2. Frontend Setup
Open a new terminal window, navigate to the frontend directory, install the Node dependencies, and start the React development server: 

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables
Create a `.env` file in the following directories:

**Backend (`/backend/.env`)**

| Variable | Description |
| :--- | :--- |
| `LINKUP_API_KEY` | Your API key from Linkup |
| `GROQ_API_KEY` | Your API key from Groq |

**Frontend (`/frontend/.env`)**

| Variable | Description |
| :--- | :--- |
| `VITE_API_URL` | The backend URL (e.g., `http://localhost:8001`) |

## Live Demo
https://salesguard.vercel.app/

## Built By
Arya — Team "Back-Spaced - solo developer — Linkup Async Hackathon 2026
