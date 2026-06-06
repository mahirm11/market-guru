use spacetimedb::{spacetimedb, ReducerContext};

#[spacetimedb(table(public))]
pub struct Agent {
    #[primarykey]
    pub agent_id: String,      // The unique ID for each bot (e.g., "bot_whale")
    pub name: String,          // Display name for the React UI
    pub cash_balance: u64,     // We store money as integers (cents) so we don't get floating-point errors!
    pub inventory: u32,        // How much Unobtainium they own
}

#[spacetimedb(table(public))]
pub struct Market {
    #[primarykey]
    pub id: u32,               // We only have 1 market, so this will always be '1'
    pub current_price: u64,    // The current price of Unobtainium in cents
}

#[spacetimedb(init)]
pub fn init_world() {
    // Seed the global Market price (Table ID 1, starting price = $10.00 / 1000 cents)
    Market::insert(Market {
        id: 1,
        current_price: 1000, 
    });

    // Agent 1: The aggressive market whale
    Agent::insert(Agent {
        agent_id: "agent_whale".to_string(),
        name: "Gordon Gekko Bot".to_string(),
        cash_balance: 500000, // $5,000.00 to start throwing around
        inventory: 0,
    });

    // Agent 2: The risk-averse panic seller
    Agent::insert(Agent {
        agent_id: "agent_panic".to_string(),
        name: "Paper Hands Bot".to_string(),
        cash_balance: 100000, // $1,000.00
        inventory: 50,       // Starts with lots of assets to panic-sell later
    });

    // Agent 3: The completely unpredictable agent
    Agent::insert(Agent {
        agent_id: "agent_chaos".to_string(),
        name: "Chaos Monkey Bot".to_string(),
        cash_balance: 200000, // $2,000.00
        inventory: 10,
    });
}

#[spacetimedb(init)]
pub fn init_world() {
    // Seed the global Market price (Table ID 1, starting price = $10.00 / 1000 cents)
    Market::insert(Market {
        id: 1,
        current_price: 1000, 
    });

    // Agent 1: The aggressive market whale
    Agent::insert(Agent {
        agent_id: "agent_whale".to_string(),
        name: "Gordon Gekko Bot".to_string(),
        cash_balance: 500000, // $5,000.00 to start throwing around
        inventory: 0,
    });

    // Agent 2: The risk-averse panic seller
    Agent::insert(Agent {
        agent_id: "agent_panic".to_string(),
        name: "Paper Hands Bot".to_string(),
        cash_balance: 100000, // $1,000.00
        inventory: 50,       // Starts with lots of assets to panic-sell later
    });

    // Agent 3: The completely unpredictable agent
    Agent::insert(Agent {
        agent_id: "agent_chaos".to_string(),
        name: "Chaos Monkey Bot".to_string(),
        cash_balance: 200000, // $2,000.00
        inventory: 10,
    });
}

