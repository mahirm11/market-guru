use spacetimedb::{ReducerContext, Table};

#[spacetimedb::table(accessor = agent, public)]
pub struct Agent {
    #[primary_key]
    pub agent_id: String,      // The unique ID for each bot (e.g., "bot_whale")
    pub name: String,          // Display name for the React UI
    pub cash_balance: u64,     // We store money as integers (cents) so we don't get floating-point errors!
    pub inventory: u32,        // How much Unobtainium they own
    pub prompt: String,        // Custom personality trading prompt for LLM decision making
}

#[spacetimedb::table(accessor = market, public)]
pub struct Market {
    #[primary_key]
    pub id: u32,               // We only have 1 market, so this will always be '1'
    pub current_price: u64,    // The current price of Unobtainium in cents
}

#[spacetimedb::reducer(init)]
pub fn init_world(ctx: &ReducerContext) {
    // Seed the global Market price (Table ID 1, starting price = $10.00 / 1000 cents)
    ctx.db.market().insert(Market {
        id: 1,
        current_price: 1000, 
    });

    // Agent 1: The aggressive market whale
    ctx.db.agent().insert(Agent {
        agent_id: "agent_whale".to_string(),
        name: "Gordon Gekko Bot".to_string(),
        cash_balance: 500000, // $5,000.00 to start throwing around
        inventory: 0,
        prompt: "An aggressive market whale who has a high starting balance, trades aggressively, and seeks to drive the price up by buying when possible.".to_string(),
    });

    // Agent 2: The risk-averse panic seller
    ctx.db.agent().insert(Agent {
        agent_id: "agent_panic".to_string(),
        name: "Paper Hands Bot".to_string(),
        cash_balance: 100000, // $1,000.00
        inventory: 50,       // Starts with lots of assets to panic-sell later
        prompt: "A risk-averse panic seller who starts with a large inventory. They panic-sell immediately at any sign of stability or high prices to lock in cash, fearing drops.".to_string(),
    });

    // Agent 3: The completely unpredictable agent
    ctx.db.agent().insert(Agent {
        agent_id: "agent_chaos".to_string(),
        name: "Chaos Monkey Bot".to_string(),
        cash_balance: 200000, // $2,000.00
        inventory: 10,
        prompt: "A completely unpredictable agent who trades erratically. They act on random whims, ignoring standard financial logic.".to_string(),
    });
}

#[spacetimedb::reducer]
pub fn spawn_agent(ctx: &ReducerContext, agent_id: String, name: String, prompt: String) -> Result<(), String> {
    // Standard initialization values
    let cash_balance = 250000; // $2,500.00 starting balance
    let inventory = 5;         // Starts with 5 units of asset

    // Check if agent already exists
    if ctx.db.agent().agent_id().find(agent_id.clone()).is_some() {
        return Err("Agent already exists".to_string());
    }

    ctx.db.agent().insert(Agent {
        agent_id,
        name,
        cash_balance,
        inventory,
        prompt,
    });
    
    log::info!("SPAWN SUCCESS: Custom agent successfully initialized");
    Ok(())
}

#[spacetimedb::reducer]
pub fn buy_asset(ctx: &ReducerContext, agent_id: String, quantity: u32) -> Result<(), String> {
    // Fetch the market using ctx.db
    let mut market = match ctx.db.market().id().find(1) {
        Some(m) => m,
        None => return Err("Critical Error: Global market not initialized".to_string()),
    };

    // Fetch the specific agent trying to buy
    let mut agent = match ctx.db.agent().agent_id().find(agent_id.clone()) {
        Some(a) => a,
        None => return Err(format!("Agent {} not found", agent_id)),
    };

    // Financial math: Calculate the total cost of the buy order
    let total_cost = market.current_price * (quantity as u64);

    // Concurrency & Integrity Guard: Does the bot have the cash?
    if agent.cash_balance < total_cost {
        return Err(format!("Trade Aborted: Agent {} has insufficient funds", agent.name));
    }

    // Mutate the Data State
    agent.cash_balance -= total_cost;
    agent.inventory += quantity;

    // Simulate basic market mechanics: Buying increases asset scarcity/demand.
    // We increase the price by 1% per unit purchased.
    let price_pump = (market.current_price / 100) * (quantity as u64);
    market.current_price += price_pump;

    // Commit changes back into the SpacetimeDB tables
    ctx.db.agent().agent_id().update(agent);
    ctx.db.market().id().update(market);

    log::info!("TRADE SUCCESS: {} bought {} units of Unobtainium", agent_id, quantity);
    Ok(())
}

#[spacetimedb::reducer]
pub fn sell_asset(ctx: &ReducerContext, agent_id: String, quantity: u32) -> Result<(), String> {
    // Fetch the market and the agent
    let mut market = ctx.db.market().id().find(1).unwrap();
    let mut agent = match ctx.db.agent().agent_id().find(agent_id.clone()) {
        Some(a) => a,
        None => return Err(format!("Agent {} not found", agent_id)),
    };

    // Concurrency & Integrity Guard: Does the bot actually have the items to sell?
    if agent.inventory < quantity {
        return Err(format!("Trade Aborted: Agent {} doesn't have enough asset inventory", agent.name));
    }

    // Financial math: Calculate earnings
    let total_earnings = market.current_price * (quantity as u64);

    // Mutate the Data State
    agent.inventory -= quantity;
    agent.cash_balance += total_earnings;

    // Simulate basic market mechanics: Selling increases circulating supply.
    // Price drops by 1% per unit dumped on the market, but we floor it at $1.00 (100 cents) so it doesn't go negative.
    let price_drop = (market.current_price / 100) * (quantity as u64);
    if market.current_price > price_drop + 100 {
        market.current_price -= price_drop;
    } else {
        market.current_price = 100;
    }

    // 5. Commit changes back into the SpacetimeDB tables
    ctx.db.agent().agent_id().update(agent);
    ctx.db.market().id().update(market);

    log::info!("TRADE SUCCESS: {} sold {} units of Unobtainium", agent_id, quantity);
    Ok(())
}

