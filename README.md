# AI-broker-OS 🚚🤖

> **AI‑first operating system for small & mid‑sized freight brokers**
> One codebase orchestrating the **entire lifecycle** of a truckload—from prospecting all the way to margin analytics—using LangGraph agents, Supabase as the data plane, and modern cloud primitives.

    

---

## 🌐 Freight‑Lifecycle Vision

| Stage                             | Pain Today                       | AI‑broker‑OS Module (roadmap)                                                                         |
| --------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **1 Prospecting & Lead Scoring**  | Manual list pulling & cold calls | *ProspectRank Agent* → scrapes load boards, enriches shipper data, scores leads, feeds HubSpot.       |
| **2 Tender Intake**               | Parsing E‑mails / EDI by hand    | **Intake Agent** (Postmark → LLM) → tender → `loads` table. *(✅ live)*                                           |
| **3 Pricing / Cost Intelligence** | Spreadsheets, slow rate engines  | *PriceSense Agent* → taps DAT + historical margin; returns suggested sell/buy rate.                   |
| **4 Carrier Sourcing & Blast**    | Outlook BCC, SMS copy‑paste      | **LoadBlast Agent** (Resend/Twilio) → personalized offers, staggered tiers. *(🚧)*                    |
| **5 Quote Collection & Ranking**  | Inbox zero chaos                 | **QuoteCollector Agent** → regex/LLM parses replies, normalizes bids, scores best option. *(backlog)* |
| **6 Booking & Doc Gen**           | Rate‑cons, BOLs built in Word    | *Docs Agent* → auto‑generates rate confirmations/BOL PDFs, e‑sign via Dropbox Sign.                   |
| **7 Track & Trace**               | Phone calls, portal hopping      | *TrackBot* → pulls telematics APIs & carrier E‑Mails, predicts ETA changes, alerts.                   |
| **8 Settlements & Billing**       | AP/AR double entry               | *InvoiceFlow* → matches POD, generates invoice, syncs QuickBooks.                                     |
| **9 Margin & SLA Analytics**      | Excel macros                     | *Insights Dashboard* (Next.js + Supabase) → gross margin, carrier OT‑D metrics.                       |

Each module is a **LangGraph workflow** plus a thin Supabase Edge Function persist layer—so you can plug new intents in days, not months.

---

## ✨ MVP Scope (ASAP)

| Flow step                                                           | Tech                                | Status       |
| ------------------------------------------------------------------- | ----------------------------------- | ------------ |
| **1 Intake Agent**Postmark → LLM converts tender E‑mail → `loads` JSON         | LangGraph 0.5 · OpenAI GPT‑4o · Postmark       | ✅ live       |
| **2 fn\_create\_load**Insert load row + `pg_notify('load.created')` | Supabase Edge Function (TypeScript) | 🚧 deploying |
| **3 LoadBlast Agent**Email/SMS offer to carriers                    | LangGraph · Resend/Twilio           | 🟡 prototype |
| **4 QuoteCollector Agent**Parse replies → `carrier_quotes`          | LangGraph · Regex/LLM               | ⬜ backlog    |
| **5 Broker Inbox UI**                                               | Next.js · Supabase Realtime         | ⬜ design     |

---

## 🗺 Repository layout

```
AI-broker-OS/
├── intake_graph.py              # tender → load graph (Python)
├── requirements.txt             # frozen Python deps
├── sample.eml                   # demo tender email
├── broker_state.sqlite          # local checkpoints (ignored in CI)
├── supabase/
│   ├── functions/
│   │   └── fn_create_load/      # Edge Function source (Deno)
│   └── sql/
│       └── 000_loads.sql        # table + trigger
└── README.md
```

---

## 🛠 Local Dev Quick‑start

```bash
# clone & enter
git clone git@github.com:jake-esse/AI-broker-OS.git
cd AI-broker-OS

# python venv
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# env vars
cp .env.example .env     # set OPENAI_API_KEY, FN_CREATE_LOAD_URL, SUPABASE_*

# run intake
python intake_graph.py sample.eml
```

### Supabase CLI (optional local stack)

```bash
brew install supabase
supabase login
supabase link --project-ref <your-ref>
supabase db push supabase/sql/000_loads.sql
supabase functions deploy fn_create_load
```

---

## 🔄 Common tasks

| Task                                  | Command                                                   |
| ------------------------------------- | --------------------------------------------------------- |
| Freeze deps after installing new libs | `pip freeze > requirements.txt`                           |
| Edge Function live‑reload             | `supabase functions serve --no-verify-jwt fn_create_load` |
| Run LangGraph tests                   | `pytest tests/`                                           |
| Bump model version                    | edit `MODEL` const in `intake_graph.py`                   |

---

## 🧭 Roadmap Highlights

1. **QuoteCollector Agent** – robust parsing with LlamaParse fallback.
2. **LoadBlast UI** – live offer status chips, broker overrides.
3. **TrackBot** – telematics & macro‑market ETA prediction (pgvector).
4. **Redis checkpointing** – swap SQLite for multi‑runner safe store.
5. **CI** – GitHub Actions: pytest + LangSmith eval + supabase migration.

---

## 🤝 Contributing

1. Fork → feature branch → PR.
2. `pre-commit install` for code style (`black`, `ruff`, `mypy`).
3. Keep PRs atomic—one feature/fix each.
