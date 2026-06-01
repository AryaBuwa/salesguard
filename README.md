# SalesGuard
> Real-time sales intelligence before every call.

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
- Backend: FastAPI, LangGraph, Groq llama-3.3-70b, Linkup API
- Frontend: React + Vite, jsPDF

## Run Locally
### Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --port 8001 --reload

### Frontend
cd frontend
npm install
npm run dev

### Environment Variables
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
