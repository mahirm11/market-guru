import os
import time
import json
import random
import requests

from dotenv import load_dotenv
load_dotenv()

from groq import Groq

def get_spacetimedb_url() -> str:
    """Helper to retrieve SpacetimeDB connection target.
    Forces connection to the official cloud instance rather than local fallbacks.
    """
    return "https://maincloud.spacetimedb.com"

def get_db_name() -> str:
    """Read the deployed database name from the environment variable."""
    # Hardcoded fallback to your cloud database name so it can NEVER use local mode
    return os.environ.get("SPACETIMEDB_DB_NAME", "market-guru")

def get_all_agents() -> list:
    """POST request to execute SQL to retrieve all agent rows from the database."""
    db_name = get_db_name()
    sdb_url = get_spacetimedb_url()
    url = f"{sdb_url}/v1/database/{db_name}/sql"
    try:
        response = requests.post(url, data="SELECT agent_id, name, prompt, is_paused FROM agent", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data and isinstance(data, list) and len(data) > 0:
                rows = data[0].get("rows", [])
                agents = []
                for row in rows:
                    agents.append({
                        "agent_id": str(row[0]),
                        "name": str(row[1]),
                        "description": str(row[2]),
                        "is_paused": bool(row[3]) if len(row) > 3 else False
                    })
                return agents
        else:
            print(f"[System] SQL endpoint error: HTTP {response.status_code}: {response.text}")
    except Exception as e:
        print(f"[System] Failed to fetch agents from cloud database: {e}")
    
    # Clean fallback matching the exact dictionary schema expected by the Groq prompt generator
    return [
        {"agent_id": "agent_whale", "name": "Gordon Gekko Bot", "is_paused": False, "description": "An aggressive market whale who has a high starting balance, trades aggressively, and seeks to drive the price up by buying when possible."},
        {"agent_id": "agent_panic", "name": "Paper Hands Bot", "is_paused": False, "description": "A risk-averse panic seller who starts with a large inventory. They panic-sell immediately at any sign of stability or high prices to lock in cash, fearing drops."},
        {"agent_id": "agent_chaos", "name": "Chaos Monkey Bot", "is_paused": False, "description": "A completely unpredictable agent who trades erratically. They act on random whims, ignoring standard financial logic."}
    ]

def get_market_price() -> int | None:
    """POST request to execute SQL to retrieve the current market price of Unobtainium in cents."""
    db_name = get_db_name()
    sdb_url = get_spacetimedb_url()
    url = f"{sdb_url}/v1/database/{db_name}/sql"
    try:
        response = requests.post(url, data="SELECT current_price FROM market LIMIT 1", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data and isinstance(data, list) and len(data) > 0:
                rows = data[0].get("rows", [])
                if rows and len(rows) > 0:
                    return int(rows[0][0])
        else:
            print(f"[System] SQL endpoint error: HTTP {response.status_code}: {response.text}")
    except Exception as e:
        print(f"[System] Failed to fetch market price: {e}")
    return None

def call_reducer(reducer_name: str, agent_id: str, quantity: int) -> bool:
    """POST request to call SpacetimeDB reducer endpoints with positional arguments."""
    payload = [agent_id, quantity]
    db_name = get_db_name()
    sdb_url = get_spacetimedb_url()
    
    # Focus only on the official SpacetimeDB REST API endpoints
    url = f"{sdb_url}/v1/database/{db_name}/call/{reducer_name}"
    
    try:
        response = requests.post(url, json=payload, timeout=5)
        if response.status_code == 200:
            print(f"[Tx Success] Called {reducer_name}({agent_id}, {quantity}) -> 200 OK")
            return True
        else:
            print(f"[Tx Failed] Reducer {reducer_name} failed: HTTP {response.status_code} - {response.text}")
    except Exception as e:
        print(f"[Tx Failed] Reducer {reducer_name} error: {e}")
            
    return False

def call_record_agent_thought(agent_id: str, action: str, rationale: str) -> bool:
    """POST request to call SpacetimeDB record_agent_thought reducer."""
    payload = [agent_id, action, rationale]
    db_name = get_db_name()
    sdb_url = get_spacetimedb_url()
    url = f"{sdb_url}/v1/database/{db_name}/call/record_agent_thought"
    
    try:
        response = requests.post(url, json=payload, timeout=5)
        if response.status_code == 200:
            print(f"[Tx Success] Called record_agent_thought({agent_id}, {action}) -> 200 OK")
            return True
        else:
            print(f"[Tx Failed] Thought record failed: HTTP {response.status_code} - {response.text}")
    except Exception as e:
        print(f"[Tx Failed] Thought record error: {e}")
            
    return False

def make_mock_decision() -> dict:
    """Generate a valid mocked trade decision if Groq API credentials are not set."""
    action = random.choice(["BUY", "SELL", "HOLD"])
    rationale = "Mocked action chosen due to missing GROQ_API_KEY environment variable."
    return {"action": action, "quantity": 1, "rationale": rationale}

def get_groq_decision(client: Groq, agent_id: str, profile: dict, price_cents: int) -> dict:
    """Invoke the Groq API to request a trading decision using llama-3.1-8b-instant."""
    price_dollars = price_cents / 100.0
    
    prompt = (
        f"You are simulating {profile['name']}, an AI agent with the following personality:\n"
        f"'{profile['description']}'\n\n"
        f"Market status: The current price of Unobtainium is {price_cents} cents (${price_dollars:.2f}).\n\n"
        f"Determine your next action (BUY, SELL, or HOLD) for exactly 1 unit of Unobtainium.\n"
        f"Provide a brief rationale matching your personality. Return your response in JSON format matching this schema:\n"
        f"{{\n"
        f"  \"action\": \"BUY\" | \"SELL\" | \"HOLD\",\n"
        f"  \"quantity\": 1,\n"
        f"  \"rationale\": \"string\"\n"
        f"}}\n"
        f"Make sure to return only valid JSON."
    )
    
    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        raw_json = response.choices[0].message.content
        if raw_json:
            return json.loads(raw_json)
    except Exception as e:
        print(f"[Groq Error] API call failed: {e}. Falling back to HOLD.")
    
    return {"action": "HOLD", "quantity": 1, "rationale": "Fallback to HOLD due to Groq API failure."}

def main():
    print("=========================================================")
    print("MarketBox AI-Worker Economic Simulation Loop (Phase 4)")
    print("=========================================================")
    
    db_name = get_db_name()
    print(f"[System] Targeted Cloud Database: {db_name}")

    api_key = os.environ.get("GROQ_API_KEY")
    client = None
    if api_key:
        print("[System] Initialize Groq client (HTTP/1.1).")
        import httpx
        client = Groq(http_client=httpx.Client(http2=False), max_retries=0)
    else:
        print("[System] WARNING: GROQ_API_KEY not found. Running in MOCK trade mode.")

    print("[System] Starting heartbeat simulation loop (heartbeat: 5 seconds)...")
    
    while True:
        agents = get_all_agents()
        for agent in agents:
            agent_id = agent["agent_id"]
            print(f"\n--- Turn: {agent['name']} ({agent_id}) ---")
            
            # Mid-cycle check: verify if the agent still exists in the database
            fresh_agents = get_all_agents()
            if not any(a["agent_id"] == agent_id for a in fresh_agents):
                print(f"[Info] Agent {agent['name']} ({agent_id}) was deleted. Skipping turn.")
                continue

            # Pause check: skip the turn instantly without nesting delays
            fresh_agent = next((a for a in fresh_agents if a["agent_id"] == agent_id), None)
            if fresh_agent and fresh_agent.get("is_paused", False):
                print(f"[Paused] Agent {agent['name']} ({agent_id}) is paused. Skipping turn.")
                time.sleep(5)
                continue 
                
            try:
                price = get_market_price()
                if price is None:
                    price = 1000
                    print(f"[System] Cloud server unseeded. Defaulting price to {price} cents ($10.00).")
                else:
                    print(f"[Market] Current Unobtainium Price: {price} cents (${price / 100.0:.2f})")

                if client:
                    decision = get_groq_decision(client, agent_id, agent, price)
                else:
                    decision = make_mock_decision()
                
                action = decision.get("action", "HOLD").upper()
                quantity = decision.get("quantity", 1)
                rationale = decision.get("rationale", "No rationale provided.")
                
                print(f"[Decision] Action: {action} | Qty: {quantity}")
                print(f"[Rationale] {rationale}")

                # Record agent thought process in database
                call_record_agent_thought(agent_id, action, rationale)

                if action == "BUY":
                    call_reducer("buy_asset", agent_id, quantity)
                elif action == "SELL":
                    call_reducer("sell_asset", agent_id, quantity)
                else:
                    print(f"[Info] {agent['name']} decided to HOLD. No transaction executed.")
                    
            except Exception as e:
                print(f"[Agent Loop Error] Exception occurred during {agent_id}'s turn: {e}")
            
            # This is the ONLY place a delay should live to regulate turns cleanly
            time.sleep(5)

if __name__ == "__main__":
    main()