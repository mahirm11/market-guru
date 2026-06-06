import os
import time
import json
import random
import requests

# Direct API interactions to bypass local environment Pydantic middleman compilation issues
# pyrefly: ignore [missing-import]
from google import genai  # type: ignore
# pyrefly: ignore [missing-import]
from google.genai import types  # type: ignore

# Define the agent profiles matching backend/spacetimedb/src/lib.rs
AGENTS = {
    "agent_whale": {
        "name": "Gordon Gekko Bot",
        "description": "An aggressive market whale who has a high starting balance, trades aggressively, and seeks to drive the price up by buying when possible."
    },
    "agent_panic": {
        "name": "Paper Hands Bot",
        "description": "A risk-averse panic seller who starts with a large inventory. They panic-sell immediately at any sign of stability or high prices to lock in cash, fearing drops."
    },
    "agent_chaos": {
        "name": "Chaos Monkey Bot",
        "description": "A completely unpredictable agent who trades erratically. They act on random whims, ignoring standard financial logic."
    }
}

def get_db_name() -> str | None:
    """Read the deployed database name from the backend configuration."""
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
    """GET request to retrieve the current market price of Unobtainium in cents."""
    url = "http://127.0.0.1:3000/api/v1/tables/market/rows"
    try:
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                row = data[0]
                if isinstance(row, dict):
                    return row.get("current_price")
                elif isinstance(row, list) and len(row) > 1:
                    return row[1]
            elif isinstance(data, dict):
                rows = data.get("rows")
                if rows and isinstance(rows, list) and len(rows) > 0:
                    row = rows[0]
                    if isinstance(row, dict):
                        return row.get("current_price")
                    elif isinstance(row, list) and len(row) > 1:
                        return row[1]
            print(f"[System] Warning: Unrecognized market price JSON structure: {data}")
        else:
            print(f"[System] Failed to fetch market price. HTTP Status: {response.status_code}")
    except Exception as e:
        print(f"[System] Error hitting market rows endpoint: {e}")
    return None

def call_reducer(reducer_name: str, agent_id: str, quantity: int) -> bool:
    """POST request to call SpacetimeDB reducer endpoints with positional arguments."""
    payload = [agent_id, quantity]
    db_name = get_db_name()
    
    urls = []
    if db_name:
        urls.append(f"http://127.0.0.1:3000/v1/database/{db_name}/call/{reducer_name}")
    urls.append(f"http://127.0.0.1:3000/api/v1/reducers/{reducer_name}")
    
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
    """Generate a valid mocked trade decision if Gemini API credentials are not set."""
    action = random.choice(["BUY", "SELL", "HOLD"])
    rationale = "Mocked action chosen due to missing GEMINI_API_KEY environment variable."
    return {"action": action, "quantity": 1, "rationale": rationale}

def get_gemini_decision(client: genai.Client, agent_id: str, profile: dict, price_cents: int) -> dict:
    """Invoke the Gemini model using a native JSON schema map to bypass Pydantic bugs."""
    price_dollars = price_cents / 100.0
    
    prompt = (
        f"You are simulating {profile['name']}, an AI agent with the following personality:\n"
        f"'{profile['description']}'\n\n"
        f"Market status: The current price of Unobtainium is {price_cents} cents (${price_dollars:.2f}).\n\n"
        f"Determine your next action (BUY, SELL, or HOLD) for exactly 1 unit of Unobtainium.\n"
        f"Provide a brief rationale matching your personality."
    )
    
    # Native API Dictionary Specification — Completely bypasses local validation library versions
    native_json_schema = {
        "type": "OBJECT",
        "properties": {
            "action": {
                "type": "STRING",
                "enum": ["BUY", "SELL", "HOLD"],
                "description": "The trade action to take. Must be one of BUY, SELL, or HOLD."
            },
            "quantity": {
                "type": "INTEGER",
                "description": "The number of units of the asset to trade. This must always be exactly 1."
            },
            "rationale": {
                "type": "STRING",
                "description": "A brief sentence explaining the reasoning behind the trade choice based on the agent's personality and market conditions."
            }
        },
        "required": ["action", "quantity", "rationale"]
    }
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_json_schema=native_json_schema,
            ),
        )
        if response.text:
            return json.loads(response.text)
    except Exception as e:
        print(f"[Gemini Error] API call failed: {e}. Falling back to HOLD.")
    
    return {"action": "HOLD", "quantity": 1, "rationale": "Fallback to HOLD due to Gemini API failure."}

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

    api_key = os.environ.get("GEMINI_API_KEY")
    client = None
    if api_key:
        print("[System] Initialize Google GenAI client.")
        client = genai.Client()
    else:
        print("[System] WARNING: GEMINI_API_KEY not found. Running in MOCK trade mode.")

    print("[System] Starting heartbeat simulation loop (heartbeat: 5 seconds)...")
    
    while True:
        for agent_id, profile in AGENTS.items():
            print(f"\n--- Turn: {profile['name']} ({agent_id}) ---")
            
            try:
                price = get_market_price()
                if price is None:
                    price = 1000
                    print(f"[System] Server offline or unseeded. Defaulting price to {price} cents ($10.00).")
                else:
                    print(f"[Market] Current Unobtainium Price: {price} cents (${price / 100.0:.2f})")

                if client:
                    decision = get_gemini_decision(client, agent_id, profile, price)
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
                    print(f"[Info] {profile['name']} decided to HOLD. No transaction executed.")
                    
            except Exception as e:
                print(f"[Agent Loop Error] Exception occurred during {agent_id}'s turn: {e}")
            
            time.sleep(5)

if __name__ == "__main__":
    main()
