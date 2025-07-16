# --------------------------- intake_graph.py ----------------------------
"""
AI-Broker MVP · Intake Agent  (LangGraph ≥ 0.5)

• Parse a tender e-mail (.eml)                 → raw_text
• LLM extracts required load fields            → load, missing
• Branch:  if missing → ask_more   else → ack
• Emits placeholder messages (print) for now.
• Checkpoints each run in SQLite (needs thread_id).
"""

# ─── Standard-library imports ───────────────────────────────────────────
import os, sys, json, email, uuid, sqlite3
from pathlib import Path
from typing import List, Dict, Any
from typing_extensions import TypedDict

# ─── Third-party imports ────────────────────────────────────────────────
from langgraph.graph import StateGraph
from langgraph.checkpoint.sqlite import SqliteSaver
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage

# ╔══════════ 1. Config & shared state ═══════════════════════════════════
REQUIRED = ["origin_zip", "dest_zip", "pickup_dt", "equipment", "weight_lb"]
MODEL    = os.getenv("LLM_MODEL", "gpt-4o-mini")

class GState(TypedDict):
    raw_text: str
    load: dict
    missing: List[str]

llm = ChatOpenAI(model=MODEL, temperature=0.0)

# ╔══════════ 2. Helper functions ════════════════════════════════════════
def read_email(path: Path) -> str:
    """Return plain-text body from a .eml file (best-effort)."""
    msg = email.message_from_bytes(path.read_bytes())

    def _dec(part) -> str:
        cs = part.get_content_charset() or "utf-8"
        return part.get_payload(decode=True).decode(cs, errors="replace")

    if msg.is_multipart():
        for p in msg.walk():
            if p.get_content_type() == "text/plain":
                return _dec(p)
    return _dec(msg)

def missing(d: dict) -> List[str]:
    return [f for f in REQUIRED if not d.get(f)]

# ╔══════════ 3. Graph nodes ═════════════════════════════════════════════
def classify(state: GState) -> Dict[str, Any]:
    prompt = (
        "Extract these fields as exact JSON, leave blanks empty:\n"
        f"{REQUIRED}\n\nEMAIL:\n{state['raw_text']}"
    )
    raw = llm.invoke([HumanMessage(content=prompt)]).content.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = {}

    return {"load": data, "missing": missing(data)}

def ask_more(state: GState) -> Dict[str, Any]:
    print("❓ Need:", state["missing"])
    # TODO: send e-mail/SMS in production
    return {}

def ack(state: GState) -> Dict[str, Any]:
    print("✅ Load:", json.dumps(state["load"], indent=2))
    print("📣 Event: load.created")
    # TODO: Supabase Edge Function call in production
    return {}

# ╔══════════ 4. Router (returns STRING) ═════════════════════════════════
def route_after_classify(state: GState) -> str:
    """Return next node name based on presence of missing fields."""
    return "ask_more" if state["missing"] else "ack"

# ╔══════════ 5. Build & compile the graph ═══════════════════════════════
def build_agent():
    g = StateGraph(GState)

    g.add_node("classify", classify)
    g.add_node("ask_more", ask_more)
    g.add_node("ack", ack)

    g.add_conditional_edges("classify", route_after_classify)
    g.set_entry_point("classify")
    g.set_finish_point({"ack", "ask_more"})

    conn  = sqlite3.connect("broker_state.sqlite", check_same_thread=False)
    saver = SqliteSaver(conn)
    return g.compile(checkpointer=saver)

agent = build_agent()

# ╔══════════ 6. CLI wrapper ════════════════════════════════════════════
def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python intake_graph.py path/to/email.eml"); sys.exit(1)

    path = Path(sys.argv[1]).expanduser()
    if not path.exists():
        print("File not found:", path); sys.exit(1)

    run_id = f"intake-{uuid.uuid4()}"
    agent.invoke(
        {"raw_text": read_email(path)},
        config={"thread_id": run_id},   # required for SQLite checkpoint
    )

if __name__ == "__main__":
    main()
# --------------------------- end of file ------------------------------