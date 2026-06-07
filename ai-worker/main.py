import os
import time
import json
import random
import requests

from dotenv import load_dotenv
load_dotenv()

from groq import Groq

def get_all_agents() -> list:
    """POST request to execute SQL to retrieve all agent rows from the database."""
    db_name = get_db_name()
    if not db_name:
        db_name = "market-guru"
        
    sdb_url = os.environ.get("SPACETIMEDB_URL", "http://127.0.0.1:3000").rstrip("/")
    url = f"{sdb_url}/v1/database/{db_name}/sql"
    try:
        response = requests.post(url, data="SELECT agent_id, name, prompt FROM agent", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data and isinstance(data, list) and len(data) > 0:
                rows = data[0].get("rows", [])
                agents = []
                for row in rows:
                    agents.append({
                        "agent_id": str(row[0]),
                        "name": str(row[1]),
                        "description": str(row[2])
                    })
                return agents
        else:
            print(f"[System] SQL endpoint error: HTTP {response.status_code}: {response.text}")
    except Exception as e:
        print(f"[System] Failed to fetch agents from database: {e}")
    
    # Fallback to local hardcoded defaults if offline
    return [
        {"agent_id": "agent_whale", "name": "Gordon Gekko Bot", "description": "An aggressive market whale who has a high starting balance, trades aggressively, and seeks to drive the price up by buying when possible."},
        {"agent_id": "agent_panic", "name": "Paper Hands Bot", "description": "A risk-averse panic seller who starts with a large inventory. They panic-sell immediately at any sign of stability or high prices to lock in cash, fearing drops."},
        {"agent_id": "agent_chaos", "name": "Chaos Monkey Bot", "description": "A completely unpredictable agent who trades erratically. They act on random whims, ignoring standard financial logic."}
    ]

def get_db_name() -> str | None:
    """Read the deployed database name from the environment or backend configuration."""
    if db_name := os.environ.get("SPACETIMEDB_DB_NAME"):
        return db_name
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        path = os.path.join(base_dir, "..", "backend", "spacetime.local.json")
        if os.path.exists(path):
            with open(path, "r") as f:
                data = json.load(f)
                return data.get("database")
    except Exception as e:
        print(f"[System] Could not parse local database name: {e}")
    return None

def get_market_price() -> int | None:
    """POST request to execute SQL to retrieve the current market price of Unobtainium in cents."""
    db_name = get_db_name()
    
    # If the local config file hasn't written the name yet, fall back to our known name
    if not db_name:
        db_name = "market-guru"
    sdb_url = os.environ.get("SPACETIMEDB_URL", "http://127.0.0.1:3000").rstrip("/")
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
    
    sdb_url = os.environ.get("SPACETIMEDB_URL", "http://127.0.0.1:3000").rstrip("/")
    urls = []
    if db_name:
        urls.append(f"{sdb_url}/v1/database/{db_name}/call/{reducer_name}")
    urls.append(f"{sdb_url}/api/v1/reducers/{reducer_name}")
    
    last_err = None
    for url in urls:
        try:
            response = requests.post(url, json=payload, timeout=5)
            if response.status_code == 200:
                print(f"[Tx Success] Called {reducer_name}({agent_id}, {quantity}) -> 200 OK")
                return True
            else:
                last_err = f"HTTP {response.status_code}: {response.text}"
        except Exception as e:
            last_err = str(e)
            
    print(f"[Tx Failed] Reducer {reducer_name} failed for {agent_id}: {last_err}")
    return False

def make_mock_decision() -> dict:
    """Generate a valid mocked trade decision if Groq API credentials are not set."""
    action = random.choice(["BUY", "SELL", "HOLD"])
    rationale = "Mocked action chosen due to missing GROQ_API_KEY environment variable."
    return {"action": action, "quantity": 1, "rationale": rationale}

def get_groq_decision(client: Groq, agent_id: str, profile: dict, price_cents: int) -> dict:
    """Invoke the Groq API to request a trading decision using Llama 3.1 8B Instant."""
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
    print("MarketGuru AI-Worker Economic Simulation Loop (Phase 4)")
    print("=========================================================")
    
    # Auto-load variable secrets locally if python-dotenv is present
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass

    db_name = get_db_name()
    if db_name:
        print(f"[System] Local database detected: {db_name}")
    else:
        print("[System] No local database configured. Will use fallback routes.")

    api_key = os.environ.get("GROQ_API_KEY")
    client = None
    if api_key:
        print("[System] Initialize Groq client.")
        client = Groq()
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
                
            try:
                price = get_market_price()
                if price is None:
                    price = 1000
                    print(f"[System] Server offline or unseeded. Defaulting price to {price} cents ($10.00).")
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

                if action == "BUY":
                    call_reducer("buy_asset", agent_id, quantity)
                elif action == "SELL":
                    call_reducer("sell_asset", agent_id, quantity)
                else:
                    print(f"[Info] {agent['name']} decided to HOLD. No transaction executed.")
                    
            except Exception as e:
                print(f"[Agent Loop Error] Exception occurred during {agent_id}'s turn: {e}")
            
            time.sleep(5)

if __name__ == "__main__":
    main()