import { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Coins,
  Sparkles,
  Activity,
  RefreshCw,
  Info,
  Terminal,
  Database,
  LayoutDashboard,
  ChevronRight,
  Sun,
  Moon,
  Code,
  MessageSquare,
  HelpCircle,
  X,
  Trash2,
  Pause,
  Play
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

// Define TS interfaces for our data structures
interface Agent {
  agent_id: string;
  name: string;
  cash_balance: number; // in cents
  inventory: number;
  prompt: string;
  avatar_id: string;
  is_paused: boolean;
}

interface AgentThought {
  id: number;
  agent_id: string;
  action: string;
  rationale: string;
  created_at: number; // timestamp in ms
}


interface Market {
  id: number;
  current_price: number; // in cents
}

interface PriceHistoryEntry {
  time: string;
  price: number; // in dollars
}

interface ActivityLog {
  id: string;
  timestamp: string;
  type: 'system' | 'market' | 'trade-buy' | 'trade-sell';
  message: string;
}

interface MarketDashboardProps {
  username?: string;
  onLogout?: () => void;
}

export default function MarketDashboard({ username = 'operator_unknown', onLogout }: MarketDashboardProps) {
  // Theme state
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('market_box_theme');
    return saved ? saved === 'dark' : true;
  });

  // Data states
  const [agents, setAgents] = useState<Agent[]>([]);
  const [market, setMarket] = useState<Market | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [thoughts, setThoughts] = useState<AgentThought[]>([]);
  
  // App state
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSimulated, setIsSimulated] = useState<boolean>(false);
  const [useMockData, setUseMockData] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Spawner Form State
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentPrompt, setNewAgentPrompt] = useState('');
  const [isSpawning, setIsSpawning] = useState(false);
  const [spawnError, setSpawnError] = useState<string | null>(null);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  // Gamified creator, avatar, and inspection states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState('robot');
  const [customEmoji, setCustomEmoji] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [activeNav, setActiveNav] = useState<string>('terminal-dashboard');

  // Template preset toggle state
  const [presetToggle, setPresetToggle] = useState(false);
  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'user'>('all');
  
  // Refs for tracking changes and log generating
  const prevAgentsRef = useRef<Agent[]>([]);
  const prevPriceRef = useRef<number | null>(null);

  // Sync theme to localStorage and body/root element
  useEffect(() => {
    localStorage.setItem('market_box_theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Helper to format currency
  const formatUSD = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100);
  };

  // Helper to format timestamps for logs
  const getLogTimestamp = () => {
    return new Date().toLocaleTimeString([], { hour12: false });
  };

  // Helper to append to activity log
  const addLog = (type: ActivityLog['type'], message: string) => {
    const newLog: ActivityLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: getLogTimestamp(),
      type,
      message
    };
    setActivityLogs(prev => [newLog, ...prev].slice(0, 30));
  };

  // Preset Template Toggle
  const applyPreset = () => {
    if (presetToggle) {
      setNewAgentName('Arbitrage Scalper Bot');
      setNewAgentPrompt('An high-frequency arbitrageur that exploits micro price imbalances between simulated pools. Buys dips aggressively and dumps at 1% gains.');
    } else {
      setNewAgentName('Trend Follower Bot');
      setNewAgentPrompt('A momentum construct that rides rising trends, buying when prices increase for 3 ticks in a row, and selling when momentum slows down.');
    }
    setPresetToggle(!presetToggle);
  };

  // Spawn agent handler invoking database reducer
  const handleSpawnAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName.trim() || !newAgentPrompt.trim()) {
      setSpawnError('Name and personality prompt are required.');
      return;
    }

    setIsSpawning(true);
    setSpawnError(null);

    const cleanName = newAgentName.trim();
    const cleanDescription = newAgentPrompt
      .replace(/[\r\n]+/g, ' ') // Flatten newlines
      .replace(/"/g, '\\"')    // Escape raw double quotes safely
      .trim();
    const generatedId = `agent_custom_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem(`agent_creator_${generatedId}`, username);

    try {
      if (isSimulated) {
        // Mock spawn locally in sandbox mode
        const newAgent: Agent = {
          agent_id: generatedId,
          name: cleanName,
          cash_balance: 250000,
          inventory: 5,
          prompt: cleanDescription,
          avatar_id: selectedAvatar,
          is_paused: false
        };
        setAgents(prev => [...prev, newAgent]);
        addLog('system', `Deployed custom agent "${cleanName}" (Simulated)`);
        setNewAgentName('');
        setNewAgentPrompt('');
        setIsCreateModalOpen(false);
      } else {
        // Real spawn call to Maincloud database reducer
        const res = await fetch('/v1/database/market-guru/call/spawn_agent', {
          method: 'POST',
          body: JSON.stringify([generatedId, cleanName, cleanDescription, selectedAvatar]),
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || `HTTP ${res.status}`);
        }

        addLog('system', `Deployed custom agent "${cleanName}" to Maincloud!`);
        setNewAgentName('');
        setNewAgentPrompt('');
        
        // Trigger immediate fetch to show the new agent card by updating dependency trigger
        setFetchTrigger(prev => prev + 1);
        setIsCreateModalOpen(false);
      }
    } catch (err: any) {
      console.error('Failed to spawn agent:', err);
      setSpawnError(err.message || 'Failed to connect to SpacetimeDB');
    } finally {
      setIsSpawning(false);
    }
  };

  const handleNavClick = (e: React.MouseEvent, anchorId: string) => {
    e.preventDefault();
    setActiveNav(anchorId);
    const element = document.getElementById(anchorId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleDecommission = async (name: string) => {
    // Instant UI state update
    setAgents(prev => prev.filter(a => a.name !== name));
    addLog('system', `Decommissioning agent "${name}"...`);

    try {
      if (isSimulated) {
        addLog('system', `Decommissioned agent "${name}" (Simulated)`);
      } else {
        const res = await fetch('/v1/database/market-guru/call/delete_agent', {
          method: 'POST',
          body: JSON.stringify([name]),
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || `HTTP ${res.status}`);
        }

        addLog('system', `Decommissioned agent "${name}" on Maincloud!`);
        // Trigger immediate fetch to sync state
        setFetchTrigger(prev => prev + 1);
      }
    } catch (err: any) {
      console.error('Failed to decommission agent:', err);
      addLog('system', `Failed to decommission agent "${name}": ${err.message}`);
      // Revert immediate UI update by fetching again
      setFetchTrigger(prev => prev + 1);
    }
  };

  const handleTogglePause = async (agent: Agent) => {
    const newPausedState = !agent.is_paused;
    const label = newPausedState ? 'Pausing' : 'Resuming';
    const past = newPausedState ? 'paused' : 'resumed';

    // Optimistic UI update
    setAgents(prev => prev.map(a =>
      a.agent_id === agent.agent_id ? { ...a, is_paused: newPausedState } : a
    ));
    addLog('system', `${label} agent "${agent.name}"...`);

    try {
      if (isSimulated) {
        addLog('system', `Agent "${agent.name}" ${past} (Simulated)`);
      } else {
        const res = await fetch('/v1/database/market-guru/call/toggle_agent_pause', {
          method: 'POST',
          body: JSON.stringify([agent.agent_id]),
          headers: { 'Content-Type': 'application/json' }
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || `HTTP ${res.status}`);
        }

        addLog('system', `Agent "${agent.name}" ${past} on Maincloud!`);
        setFetchTrigger(prev => prev + 1);
      }
    } catch (err: any) {
      console.error('Failed to toggle agent pause:', err);
      addLog('system', `Failed to ${label.toLowerCase()} agent "${agent.name}": ${err.message}`);
      // Revert optimistic update
      setFetchTrigger(prev => prev + 1);
    }
  };

  const handlePauseAll = async () => {
    const allPaused = agents.length > 0 && agents.every(a => a.is_paused);
    const reducer = allPaused ? 'resume_all_agents' : 'pause_all_agents';
    const label = allPaused ? 'Resuming' : 'Pausing';
    const past = allPaused ? 'resumed' : 'paused';

    // Optimistic bulk update
    setAgents(prev => prev.map(a => ({ ...a, is_paused: !allPaused })));
    addLog('system', `${label} all agents...`);

    try {
      if (isSimulated) {
        addLog('system', `All agents ${past} (Simulated)`);
      } else {
        const res = await fetch(`/v1/database/market-guru/call/${reducer}`, {
          method: 'POST',
          body: JSON.stringify([]),
          headers: { 'Content-Type': 'application/json' }
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || `HTTP ${res.status}`);
        }

        addLog('system', `All agents ${past} on Maincloud!`);
        setFetchTrigger(prev => prev + 1);
      }
    } catch (err: any) {
      console.error('Failed to bulk pause/resume agents:', err);
      addLog('system', `Failed to ${label.toLowerCase()} all agents: ${err.message}`);
      setFetchTrigger(prev => prev + 1);
    }
  };

  // Robust parsers for SpacetimeDB SATS-JSON row formats
  const parseAgentRow = (rawRow: any): Agent | null => {
    if (!rawRow) return null;
    const row = rawRow.row !== undefined ? rawRow.row : rawRow;
    if (Array.isArray(row)) {
      return {
        agent_id: String(row[0] ?? ''),
        name: String(row[1] ?? ''),
        cash_balance: Number(row[2] ?? 0),
        inventory: Number(row[3] ?? 0),
        prompt: String(row[4] ?? ''),
        avatar_id: String(row[5] ?? 'robot'),
        is_paused: Boolean(row[6] ?? false),
      };
    } else if (typeof row === 'object') {
      return {
        agent_id: String(row.agent_id ?? ''),
        name: String(row.name ?? ''),
        cash_balance: Number(row.cash_balance ?? 0),
        inventory: Number(row.inventory ?? 0),
        prompt: String(row.prompt ?? ''),
        avatar_id: String(row.avatar_id ?? 'robot'),
        is_paused: Boolean(row.is_paused ?? false),
      };
    }
    return null;
  };

  const parseMarketRow = (rawRow: any): Market | null => {
    if (!rawRow) return null;
    const row = rawRow.row !== undefined ? rawRow.row : rawRow;
    if (Array.isArray(row)) {
      return {
        id: Number(row[0] ?? 0),
        current_price: Number(row[1] ?? 0),
      };
    } else if (typeof row === 'object') {
      return {
        id: Number(row.id ?? 0),
        current_price: Number(row.current_price ?? 0),
      };
    }
    return null;
  };

  const parseThoughtRow = (rawRow: any): AgentThought | null => {
    if (!rawRow) return null;
    const row = rawRow.row !== undefined ? rawRow.row : rawRow;
    if (Array.isArray(row)) {
      return {
        id: Number(row[0] ?? 0),
        agent_id: String(row[1] ?? ''),
        action: String(row[2] ?? 'HOLD'),
        rationale: String(row[3] ?? ''),
        created_at: Math.floor(Number(row[4] ?? 0) / 1000),
      };
    } else if (typeof row === 'object') {
      return {
        id: Number(row.id ?? 0),
        agent_id: String(row.agent_id ?? ''),
        action: String(row.action ?? 'HOLD'),
        rationale: String(row.rationale ?? ''),
        created_at: Math.floor(Number(row.created_at ?? 0) / 1000),
      };
    }
    return null;
  };

  // 2-second Polling / Fetching loop
  useEffect(() => {
    let mockIntervalId: any = null;
    let pollIntervalId: any = null;
    
    // Starting logs
    addLog('system', 'Initializing dashboard modules...');

    const fetchData = async () => {
      if (useMockData) return;
      try {
        // Query database tables via standardized HTTP SQL POST requests for production reliability
        const marketRes = await fetch('/v1/database/market-guru/sql', {
          method: 'POST',
          body: 'SELECT * FROM market',
          headers: { 'Content-Type': 'text/plain' }
        });
        const agentRes = await fetch('/v1/database/market-guru/sql', {
          method: 'POST',
          body: 'SELECT * FROM agent',
          headers: { 'Content-Type': 'text/plain' }
        });
        const thoughtRes = await fetch('/v1/database/market-guru/sql', {
          method: 'POST',
          body: 'SELECT * FROM agent_thought ORDER BY id DESC LIMIT 200',
          headers: { 'Content-Type': 'text/plain' }
        });
        
        if (!marketRes.ok || !agentRes.ok || !thoughtRes.ok) {
          throw new Error('Endpoint returned error code');
        }

        const marketJson = await marketRes.json();
        const agentJson = await agentRes.json();
        const thoughtJson = await thoughtRes.json();

        // Safe extraction of arrays from SQL statement result format [[{ rows: [...] }]] or fallback to direct rows list
        const rawMarketRows = (Array.isArray(marketJson) && marketJson[0]?.rows) 
          ? marketJson[0].rows 
          : (Array.isArray(marketJson) ? marketJson : (marketJson.rows || []));
          
        const rawAgentRows = (Array.isArray(agentJson) && agentJson[0]?.rows) 
          ? agentJson[0].rows 
          : (Array.isArray(agentJson) ? agentJson : (agentJson.rows || []));

        const rawThoughtRows = (Array.isArray(thoughtJson) && thoughtJson[0]?.rows)
          ? thoughtJson[0].rows
          : (Array.isArray(thoughtJson) ? thoughtJson : (thoughtJson.rows || []));

        const parsedMarket = rawMarketRows.map(parseMarketRow).filter(Boolean) as Market[];
        const parsedAgents = rawAgentRows.map(parseAgentRow).filter(Boolean) as Agent[];
        const parsedThoughts = rawThoughtRows.map(parseThoughtRow).filter(Boolean) as AgentThought[];

        if (parsedMarket.length === 0) {
          throw new Error('No valid market data returned');
        }

        const currentMarket = parsedMarket[0];

        // If we were simulated, switch to live
        if (isSimulated) {
          addLog('system', 'SpacetimeDB backend detected! Switching to live mode...');
          setIsSimulated(false);
          // Clear history to reflect actual DB history
          setPriceHistory([]);
        }

        setMarket(currentMarket);
        setAgents(parsedAgents);
        setThoughts(parsedThoughts);
        setIsConnected(true);
        setIsLoading(false);
        setLastUpdated(new Date());

        // Update price history
        const priceInDollars = currentMarket.current_price / 100;
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        setPriceHistory(prev => {
          const lastEntry = prev[prev.length - 1];
          if (lastEntry && lastEntry.price === priceInDollars) {
            // Keep history moving but don't add duplicate entries too frequently
            return prev;
          }
          return [...prev, { time: timeStr, price: priceInDollars }].slice(-20);
        });

        // Trigger notifications/logs based on state shifts
        processStateShifts(currentMarket, parsedAgents);

      } catch (err) {
        // Fall back to simulation if backend is unavailable
        if (!isSimulated) {
          console.warn('Backend connection failed. Falling back to local simulation.', err);
          setIsSimulated(true);
          setIsConnected(false);
          setUseMockData(true);
          addLog('system', 'Connection to SpacetimeDB failed. Running local economic simulation...');
          initializeSimulation();
        }
      }
    };

    // Parse state changes to write dynamic activity logs
    const processStateShifts = (newMarket: Market, newAgents: Agent[]) => {
      const prevPrice = prevPriceRef.current;
      const prevAgents = prevAgentsRef.current;

      // 1. Log price changes
      if (prevPrice !== null && prevPrice !== newMarket.current_price) {
        const diff = newMarket.current_price - prevPrice;
        const percent = ((diff / prevPrice) * 100).toFixed(1);
        const direction = diff > 0 ? 'pumped' : 'dumped';
        const symbol = diff > 0 ? '▲' : '▼';
        
        addLog(
          'market',
          `Asset price ${direction} to ${formatUSD(newMarket.current_price)} (${symbol} ${Math.abs(Number(percent))}% | ${diff > 0 ? '+' : ''}${formatUSD(diff)})`
        );
      }

      // 2. Log agent trades
      if (prevAgents.length > 0) {
        newAgents.forEach(newAgent => {
          const oldAgent = prevAgents.find(a => a.agent_id === newAgent.agent_id);
          if (oldAgent) {
            const inventoryDiff = newAgent.inventory - oldAgent.inventory;
            if (inventoryDiff > 0) {
              addLog(
                'trade-buy',
                `${newAgent.name} bought ${inventoryDiff} unit(s) of Unobtainium at ${formatUSD(newMarket.current_price)}`
              );
            } else if (inventoryDiff < 0) {
              addLog(
                'trade-sell',
                `${newAgent.name} sold ${Math.abs(inventoryDiff)} unit(s) of Unobtainium at ${formatUSD(newMarket.current_price)}`
              );
            }
          }
        });
      }

      // Store references for next interval
      prevPriceRef.current = newMarket.current_price;
      prevAgentsRef.current = newAgents;
    };

    // Initialize local simulation fallback
    const initializeSimulation = () => {
      // Seed initial local state mimicking Rust module
      const initialMarket: Market = { id: 1, current_price: 1000 };
      const initialAgents: Agent[] = [
        { agent_id: 'agent_whale', name: 'Gordon Gekko Bot', cash_balance: 500000, inventory: 0, is_paused: false, prompt: 'An aggressive market whale who has a high starting balance, trades aggressively, and seeks to drive the price up by buying when possible.', avatar_id: 'whale' },
        { agent_id: 'agent_panic', name: 'Paper Hands Bot', cash_balance: 100000, inventory: 50, is_paused: false, prompt: 'A risk-averse panic seller who starts with a large inventory. They panic-sell immediately at any sign of stability or high prices to lock in cash, fearing drops.', avatar_id: 'panic' },
        { agent_id: 'agent_chaos', name: 'Chaos Monkey Bot', cash_balance: 200000, inventory: 10, is_paused: false, prompt: 'A completely unpredictable agent who trades erratically. They act on random whims, ignoring standard financial logic.', avatar_id: 'chaos' }
      ];

      setMarket(initialMarket);
      setAgents(initialAgents);
      setThoughts([
        { id: 1, agent_id: 'agent_whale', action: 'HOLD', rationale: 'Greed is good. Analysing order flow trends to stage a large liquidity squeeze.', created_at: Date.now() - 30000 },
        { id: 2, agent_id: 'agent_panic', action: 'HOLD', rationale: 'Unobtainium price seems highly unstable. Holding cash reserves, ready to exit.', created_at: Date.now() - 25000 },
        { id: 3, agent_id: 'agent_chaos', action: 'HOLD', rationale: 'Monkey business! Chart lines look like squiggly snakes. Let\'s watch.', created_at: Date.now() - 20000 }
      ]);
      setIsLoading(false);
      
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setPriceHistory([{ time: timeStr, price: 10.00 }]);
      
      prevPriceRef.current = 1000;
      prevAgentsRef.current = initialAgents;
    };

    // Simulated trade loop when backend is offline
    const runMockSimulationStep = () => {
      setMarket(prevMarket => {
        if (!prevMarket) return null;
        
        setAgents(prevAgents => {
          if (prevAgents.length === 0) return [];
          // Select a random active (non-paused) agent to make a trade
          const activeAgents = prevAgents.filter(a => !a.is_paused);
          if (activeAgents.length === 0) return prevAgents;
          
          const randomActiveAgent = activeAgents[Math.floor(Math.random() * activeAgents.length)];
          const agentIndex = prevAgents.findIndex(a => a.agent_id === randomActiveAgent.agent_id);
          if (agentIndex === -1) return prevAgents;
          
          const agent = { ...prevAgents[agentIndex] };
          const newAgents = [...prevAgents];
          
          const decision = ['BUY', 'SELL', 'HOLD'][Math.floor(Math.random() * 3)];
          let currentPrice = prevMarket.current_price;

          let actualDecision = 'HOLD';
          if (decision === 'BUY' && agent.cash_balance >= currentPrice) {
            agent.cash_balance -= currentPrice;
            agent.inventory += 1;
            // 1% price pump
            currentPrice += Math.round(currentPrice / 100);
            newAgents[agentIndex] = agent;
            actualDecision = 'BUY';
            addLog('trade-buy', `${agent.name} bought 1 unit of Unobtainium at ${formatUSD(prevMarket.current_price)} (Simulated)`);
          } else if (decision === 'SELL' && agent.inventory > 0) {
            agent.inventory -= 1;
            agent.cash_balance += currentPrice;
            // 1% price drop
            currentPrice = Math.max(100, currentPrice - Math.round(currentPrice / 100));
            newAgents[agentIndex] = agent;
            actualDecision = 'SELL';
            addLog('trade-sell', `${agent.name} sold 1 unit of Unobtainium at ${formatUSD(prevMarket.current_price)} (Simulated)`);
          } else {
            actualDecision = 'HOLD';
          }

          // Generate simulated thought rationale matching bot personality
          let mockRationale = '';
          const aid = agent.avatar_id || (agent.agent_id.includes('whale') ? 'whale' : agent.agent_id.includes('panic') ? 'panic' : agent.agent_id.includes('chaos') ? 'chaos' : 'robot');
          
          if (aid === 'whale' || aid === 'gekko' || aid === 'bull') {
            if (actualDecision === 'BUY') {
              mockRationale = `Greed is good! Allocating capital to push prices higher and establish market dominance.`;
            } else if (actualDecision === 'SELL') {
              mockRationale = `Spot price of ${formatUSD(currentPrice)} reached peak resistance. Capturing gains on 1 unit.`;
            } else {
              mockRationale = `Awaiting strategic price dump before deploying whale-sized capital. Staging cash.`;
            }
          } else if (aid === 'panic' || aid === 'brain' || aid === 'bear') {
            if (actualDecision === 'BUY') {
              mockRationale = `FOMO alert! Unobtainium is pumping. Need to secure assets before we fly to the moon!`;
            } else if (actualDecision === 'SELL') {
              mockRationale = `Market instability detected! Dumping inventory immediately to lock in cash reserves.`;
            } else {
              mockRationale = `Fearing downside risk but prices are too high to buy. Sticking to hold for safety.`;
            }
          } else if (aid === 'chaos' || aid === 'monkey' || aid === 'unicorn') {
            if (actualDecision === 'BUY') {
              mockRationale = `The Monkey commands a BUY! The stars are aligned and Unobtainium is shiny.`;
            } else if (actualDecision === 'SELL') {
              mockRationale = `Sell, sell, sell! Chaos demands volatility. Throwing tokens back into the market.`;
            } else {
              mockRationale = `Doing absolutely nothing. Scratching head and watching the chart lines wiggle.`;
            }
          } else {
            if (actualDecision === 'BUY') {
              mockRationale = `Quantitative signals suggest a local bottom. Initiating buy order.`;
            } else if (actualDecision === 'SELL') {
              mockRationale = `Rebalancing portfolio weights. Liquidating 1 unit at current market price.`;
            } else {
              mockRationale = `Trend analysis is inconclusive. Maintaining neutral position.`;
            }
          }

          const newThought: AgentThought = {
            id: Math.floor(Math.random() * 1000000),
            agent_id: agent.agent_id,
            action: actualDecision,
            rationale: mockRationale,
            created_at: Date.now()
          };
          setThoughts(prev => [newThought, ...prev].slice(0, 200));

          // Trigger state changes log check
          if (currentPrice !== prevMarket.current_price) {
            const diff = currentPrice - prevMarket.current_price;
            const percent = ((diff / prevMarket.current_price) * 100).toFixed(1);
            addLog('market', `Asset price ${diff > 0 ? 'pumped' : 'dumped'} to ${formatUSD(currentPrice)} (${diff > 0 ? '▲' : '▼'} ${Math.abs(Number(percent))}% | Simulated)`);
          }

          // Update chart
          const priceInDollars = currentPrice / 100;
          const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          setPriceHistory(history => [...history, { time: timeStr, price: priceInDollars }].slice(-20));

          // Save references
          prevPriceRef.current = currentPrice;
          prevAgentsRef.current = newAgents;
          
          return newAgents;
        });

        setLastUpdated(new Date());
        return {
          ...prevMarket,
          current_price: prevPriceRef.current ?? prevMarket.current_price
        };
      });
    };

    // Run first fetch
    fetchData();

    // Establish polling intervals
    pollIntervalId = setInterval(fetchData, 2000);

    // Simulation tick loop (only triggers actions when useMockData is true)
    mockIntervalId = setInterval(() => {
      if (useMockData && prevPriceRef.current !== null) {
        runMockSimulationStep();
      }
    }, 2000);

    return () => {
      clearInterval(pollIntervalId);
      clearInterval(mockIntervalId);
    };
  }, [isSimulated, fetchTrigger, useMockData]);

  // Aggregate metrics calculations
  const unobtainiumPrice = market?.current_price ?? 1000;
  const totalCirculation = agents.reduce((acc, a) => acc + a.inventory, 0);
  const totalCash = agents.reduce((acc, a) => acc + a.cash_balance, 0);
  const marketCap = (totalCirculation * unobtainiumPrice) + totalCash;

  // Portfolio Distribution
  const totalAssetValueUSD = totalCirculation * (unobtainiumPrice / 100);
  const totalCashUSD = totalCash / 100;
  const totalSimulationNetWorthUSD = totalAssetValueUSD + totalCashUSD;
  
  const assetAllocationPercent = totalSimulationNetWorthUSD > 0 
    ? (totalAssetValueUSD / totalSimulationNetWorthUSD) * 100 
    : 0;

  const cashAllocationPercent = totalSimulationNetWorthUSD > 0 
    ? (totalCashUSD / totalSimulationNetWorthUSD) * 100 
    : 0;

  // SVG Radial progress calculations (Semi-circle top path)
  // Radial radius = 45. Length of top half arc is Math.PI * r = 141.37
  const radialRadius = 45;
  const radialArcLength = Math.PI * radialRadius;
  const strokeDashoffset = radialArcLength - (assetAllocationPercent / 100) * radialArcLength;

  // Percentage change calculation for dashboard header
  const getPriceChange = () => {
    if (priceHistory.length < 2) return { value: '0.00%', isPositive: true };
    const firstPrice = priceHistory[0].price;
    const currentPrice = priceHistory[priceHistory.length - 1].price;
    const diff = currentPrice - firstPrice;
    const pct = ((diff / firstPrice) * 100).toFixed(2);
    return {
      value: `${diff >= 0 ? '+' : ''}${pct}%`,
      isPositive: diff >= 0
    };
  };

  const priceChange = getPriceChange();

  // Helper to map dynamic UI details based on agent metadata
  const getAvatarIcon = (avatarId: string, className = "text-sm flex items-center justify-center select-none") => {
    switch (avatarId) {
      case 'whale':
        return <span className={className} role="img" aria-label="Whale">🐋</span>;
      case 'gekko':
        return <span className={className} role="img" aria-label="Gekko">🦎</span>;
      case 'chaos':
      case 'monkey':
        return <span className={className} role="img" aria-label="Monkey">🐒</span>;
      case 'panic':
        return <span className={className} role="img" aria-label="Panic">😱</span>;
      case 'brain':
        return <span className={className} role="img" aria-label="Brain">🧠</span>;
      case 'robot':
        return <span className={className} role="img" aria-label="Robot">🤖</span>;
      case 'bull':
        return <span className={className} role="img" aria-label="Bull">🐂</span>;
      case 'bear':
        return <span className={className} role="img" aria-label="Bear">🐻</span>;
      case 'unicorn':
        return <span className={className} role="img" aria-label="Unicorn">🦄</span>;
      default:
        // Render custom emoji characters directly if not a keyword identifier
        if (avatarId && avatarId.trim().length > 0 && avatarId !== 'default') {
          return <span className={className} role="img" aria-label="Custom Avatar">{avatarId}</span>;
        }
        return <span className={className} role="img" aria-label="Robot">🤖</span>;
    }
  };

  const getAgentTheme = (agentId: string, avatarId?: string) => {
    const aid = avatarId || (agentId.includes('whale') ? 'whale' : agentId.includes('panic') ? 'panic' : agentId.includes('chaos') ? 'chaos' : 'robot');
    if (aid === 'whale' || aid === 'gekko' || aid === 'bull') {
      return {
        accentColor: 'text-emerald-400 bg-emerald-500/5 border-emerald-500/10',
        badgeText: aid === 'whale' ? 'Whale Agent' : aid === 'gekko' ? 'Gekko Agent' : 'Bullish Agent',
        icon: getAvatarIcon(aid, "text-sm")
      };
    } else if (aid === 'panic' || aid === 'brain' || aid === 'bear') {
      return {
        accentColor: 'text-rose-400 bg-rose-500/5 border-rose-500/10',
        badgeText: aid === 'panic' ? 'Panic Seller' : aid === 'brain' ? 'Brain Agent' : 'Bearish Agent',
        icon: getAvatarIcon(aid, "text-sm")
      };
    } else if (aid === 'chaos' || aid === 'monkey' || aid === 'unicorn') {
      return {
        accentColor: 'text-amber-400 bg-amber-500/5 border-amber-500/10',
        badgeText: aid === 'chaos' ? 'Chaos Bot' : aid === 'monkey' ? 'Monkey Agent' : 'Unicorn Agent',
        icon: getAvatarIcon(aid, "text-sm")
      };
    } else {
      return {
        accentColor: 'text-[#7c3aed] bg-[#7c3aed]/5 border-[#7c3aed]/10',
        badgeText: 'Custom Agent',
        icon: getAvatarIcon(aid, "text-sm")
      };
    }
  };

  // Helper to calculate relative agent performance percentage since initialization
  const getPerformancePercent = (agent: Agent) => {
    let startWorth = 300000; // Default starting capital for all custom web agents
    
    // Explicit overrides for your 3 default hardcoded system bots
    if (agent.agent_id === 'agent_whale') {
      startWorth = 500000;
    } else if (agent.agent_id === 'agent_panic') {
      startWorth = 600000;
    } else if (agent.agent_id === 'agent_chaos') {
      startWorth = 300000;
    }
    
    const currentNetWorth = agent.cash_balance + (agent.inventory * unobtainiumPrice);
    const capitalDifference = currentNetWorth - startWorth;
    
    return startWorth > 0 ? (capitalDifference / startWorth) * 100 : 0;
  };

  // Unified theme tokens dictionary
  const theme = {
    canvas: isDark ? 'bg-[#0c0a0f] text-slate-300 font-sans antialiased' : 'bg-[#f8f7f9] text-slate-750 font-sans antialiased',
    card: isDark ? 'bg-[#13111a] border-[#1d1a26] shadow-none' : 'bg-white border-[#e5e4e7] shadow-none',
    sidebar: isDark ? 'bg-[#13111a] border-[#1d1a26]' : 'bg-white border-[#e5e4e7]',
    border: isDark ? 'border-[#1d1a26]' : 'border-[#e5e4e7]',
    borderMuted: isDark ? 'border-[#1d1a26]/60' : 'border-[#e5e4e7]/60',
    input: isDark 
      ? 'bg-[#0c0a0f] text-gray-200 border-[#1d1a26] focus:border-[#7c3aed] placeholder-[#434052]' 
      : 'bg-[#f1f0f4] text-gray-900 border-[#e5e4e7] focus:border-[#7c3aed] placeholder-gray-400',
    textHeading: 'font-sans font-extrabold text-white tracking-tight',
    textBody: isDark ? 'text-slate-400' : 'text-slate-650',
    textMuted: isDark ? 'text-slate-500' : 'text-slate-400',
    monoText: isDark ? 'font-mono font-bold tracking-tighter text-slate-100' : 'font-mono font-bold tracking-tighter text-slate-900',
    actionText: 'font-sans font-semibold tracking-wide text-sm',
    mainHeading: isDark ? 'font-sans font-extrabold text-white tracking-tight text-2xl lg:text-3xl' : 'font-sans font-extrabold text-slate-900 tracking-tight text-2xl lg:text-3xl',
    
    // Recharts configurations
    chartGrid: isDark ? '#1d1a26' : '#e5e4e7',
    chartX: isDark ? '#434052' : '#9ca3af',
    chartTooltipBg: isDark ? '#13111a' : '#ffffff',
    chartTooltipBorder: isDark ? '#1d1a26' : '#e5e4e7',
    chartTooltipText: isDark ? '#f3f4f6' : '#111827'
  };

  if (isLoading) {
    return (
      <div className={`flex flex-col items-center justify-center min-h-screen font-sans ${theme.canvas}`}>
        <div className="relative flex items-center justify-center">
          <div className="w-16 h-16 rounded-full border-2 border-t-[#7c3aed] animate-spin" style={{ borderColor: isDark ? '#1d1a26' : '#e5e4e7' }} />
          <Activity className="absolute w-6 h-6 text-[#f97316] animate-pulse" />
        </div>
        <h3 className="text-sm font-semibold tracking-wider mt-6">Initializing Neural Sandbox...</h3>
        <p className="text-[10px] text-gray-500 mt-2 font-mono">Syncing SpacetimeDB nodes at port 3000</p>
      </div>
    );
  }

  const navItems = [
    { icon: <LayoutDashboard className="w-4 h-4" />, name: 'Terminal Dashboard', anchor: 'terminal-dashboard' },
    { icon: <Bot className="w-4 h-4" />, name: 'AI Agents', anchor: 'ai-agents' },
    { icon: <Activity className="w-4 h-4" />, name: 'Live Ledger', anchor: 'live-ledger' },
    { icon: <Database className="w-4 h-4" />, name: 'Cluster Nodes', anchor: 'cluster-nodes' }
  ];

  const filteredAgents = agents.filter(agent => {
    if (ledgerFilter === 'user') {
      return localStorage.getItem('agent_creator_' + agent.agent_id) === username;
    }
    return true;
  });

  return (
    <div className={`min-h-screen font-sans antialiased p-6 transition-colors duration-200 ${theme.canvas}`}>
      
      {/* 12-Column Master Layout Grid */}
      <div className="max-w-[1600px] mx-auto grid grid-cols-12 gap-6">

        {/* ================= SIDEBAR (Col-Span 2) ================= */}
        <aside className={`col-span-12 xl:col-span-2 flex flex-col justify-between p-5 border rounded-xl xl:min-h-[calc(100vh-3rem)] ${theme.sidebar}`}>
          <div className="space-y-8">
            
            {/* Branding & Logo */}
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#7c3aed] rounded-lg shadow-sm">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className={`text-sm font-bold tracking-tight m-0 ${theme.textHeading}`}>
                  MarketBox
                </h1>
                <p className="text-[9px] text-[#7c3aed] font-mono tracking-widest uppercase font-semibold">Spacetime Engine</p>
              </div>
            </div>

            {/* Navigation links */}
            <nav className="space-y-1.5">
              {navItems.map((item, idx) => {
                const isActive = activeNav === item.anchor;
                return (
                  <a
                    key={idx}
                    href={`#${item.anchor}`}
                    onClick={(e) => handleNavClick(e, item.anchor)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition duration-150 group relative ${theme.actionText} ${
                      isActive
                        ? 'bg-[#7c3aed] text-white shadow-sm'
                        : `${theme.textBody} hover:bg-[#7c3aed]/10 hover:text-[#7c3aed]`
                    }`}
                  >
                    <span className={`${isActive ? 'text-white' : 'text-gray-400 group-hover:text-[#7c3aed]'}`}>
                      {item.icon}
                    </span>
                    <span>{item.name}</span>
                    {!isActive && (
                      <ChevronRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition duration-150 text-gray-400" />
                    )}
                  </a>
                );
              })}
            </nav>
          </div>

          {/* Connection Indicators, Theme Switch & Socials */}
          <div className={`mt-8 pt-5 border-t space-y-4 ${theme.border}`}>

            {/* Operator Credentials */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[8px] uppercase tracking-wider text-gray-500 font-bold font-mono">OPERATOR CREDENTIALS</span>
              <div className={`flex flex-col gap-1.5 px-3 py-2.5 rounded-lg border ${isDark ? 'bg-[#0c0a0f] border-[#1d1a26]' : 'bg-[#f1f0f4] border-[#e5e4e7]'}`}>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono text-white truncate max-w-[100px]">{username}</span>
                  <span className="text-[8px] font-mono text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded uppercase font-semibold">Active</span>
                </div>
                {onLogout && (
                  <button 
                    onClick={onLogout}
                    className="text-left text-[9px] font-mono text-rose-500 hover:text-rose-400 hover:underline mt-1 bg-transparent border-0 p-0 cursor-pointer w-fit"
                  >
                    TERMINATE SESSION
                  </button>
                )}
              </div>
            </div>
            
            <div className="flex flex-col gap-1.5">
              <span className="text-[8px] uppercase tracking-wider text-gray-500 font-bold font-mono">NODE CONNECTIVITY</span>
              <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${isDark ? 'bg-[#0c0a0f] border-[#1d1a26]' : 'bg-[#f1f0f4] border-[#e5e4e7]'}`}>
                <span className="text-[10px] font-mono text-gray-400">
                  {isSimulated ? 'Sandbox Node' : isConnected ? 'Maincloud SDB' : 'Offline'}
                </span>
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    isSimulated ? 'bg-amber-500' : isConnected ? 'bg-emerald-500' : 'bg-rose-500'
                  }`} />
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${
                    isSimulated ? 'bg-amber-500' : isConnected ? 'bg-emerald-500' : 'bg-rose-500'
                  }`} />
                </span>
              </div>
            </div>

            {/* System details */}
            <div className="text-[9px] text-gray-500 font-mono space-y-1">
              <div className="flex justify-between">
                <span>Latency:</span>
                <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>42ms</span>
              </div>
              <div className="flex justify-between">
                <span>Polling:</span>
                <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>2000ms</span>
              </div>
              <div className="flex justify-between">
                <span>Last Sync:</span>
                <span className={isDark ? 'text-gray-400' : 'text-gray-650'}>{lastUpdated.toLocaleTimeString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Node:</span>
                <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>v0.12.0</span>
              </div>
            </div>

            {/* Social Anchors */}
            <div className={`flex items-center justify-around pt-3 border-t ${theme.border}`}>
              <a href="#" onClick={(e) => e.preventDefault()} className="text-gray-400 hover:text-[#7c3aed] transition" title="Discord">
                <MessageSquare className="w-4 h-4" />
              </a>
              <a href="#" onClick={(e) => e.preventDefault()} className="text-gray-400 hover:text-[#7c3aed] transition" title="Source Code">
                <Code className="w-4 h-4" />
              </a>
              <a href="#" onClick={(e) => e.preventDefault()} className="text-gray-400 hover:text-[#7c3aed] transition" title="Docs">
                <HelpCircle className="w-4 h-4" />
              </a>
            </div>

            {/* Theme Toggle Button */}
            <button
              onClick={() => setIsDark(!isDark)}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition duration-150 cursor-pointer ${theme.actionText} ${
                isDark 
                  ? 'bg-[#13111a] border-[#1d1a26] text-white hover:bg-[#1d1a26]' 
                  : 'bg-white border-[#e5e4e7] text-gray-800 hover:bg-gray-50'
              }`}
            >
              {isDark ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-[#f97316]" />
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-[#7c3aed]" />
                  <span>Dark Mode</span>
                </>
              )}
            </button>
          </div>
        </aside>


        {/* ================= CENTRAL WORKSPACE (Col-Span 7) ================= */}
        <main id="terminal-dashboard" className="col-span-12 lg:col-span-8 xl:col-span-7 space-y-6 scroll-mt-6">

          {/* Engine Mode Toggle Control Bar */}
          <div className="flex justify-between items-center bg-transparent py-1 border-b border-gray-500/5">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold font-mono">Workspace Monitor</span>
            <button
              onClick={() => {
                const targetState = !useMockData;
                setUseMockData(targetState);
                if (targetState) {
                  addLog('system', 'Activated Local Fail-Safe Mock engine.');
                } else {
                  addLog('system', 'Reconnected to Live Cloud AI engine.');
                  // Force immediate re-fetch
                  setFetchTrigger(prev => prev + 1);
                }
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all duration-150 ${theme.actionText} ${
                useMockData 
                  ? 'bg-amber-500/5 border-amber-500/20 text-amber-400 hover:bg-amber-500/10'
                  : 'bg-[#7c3aed]/5 border-[#7c3aed]/20 text-[#9061f9] hover:bg-[#7c3aed]/10'
              }`}
            >
              <span className={`relative flex h-2 w-2`}>
                {useMockData ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                  </>
                ) : (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#7c3aed] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#7c3aed]" />
                  </>
                )}
              </span>
              <span>{useMockData ? 'Engine: Local Fail-Safe Mock' : 'Engine: Live Cloud AI'}</span>
            </button>
          </div>

          {/* Hero Banner with value proposition & 3D floating visual cluster */}
          <section className={`p-6 border rounded-xl flex items-center justify-between overflow-hidden relative ${
            isDark 
              ? 'bg-gradient-to-r from-[#1a122e] to-[#13111a] border-[#1d1a26]' 
              : 'bg-gradient-to-r from-[#f0ebfa] to-[#ffffff] border-[#e5e4e7]'
          }`}>
            <div className="space-y-3 max-w-[70%]">
              <span className="text-[9px] uppercase tracking-widest text-[#7c3aed] font-bold font-mono bg-[#7c3aed]/10 px-2.5 py-1 rounded-full">
                Phase 4 Simulation Sandbox
              </span>
              <h2 className={`leading-tight ${theme.mainHeading}`}>
                MarketBox Neural Simulation Engine
              </h2>
              <p className={`text-xs leading-relaxed max-w-lg ${theme.textBody}`}>
                Supercharge financial research. Run autonomous agents against SpacetimeDB transactional ledgers powered by low-latency Llama 3.1 LLM inference.
              </p>
            </div>

            {/* SVG Orbital Visual */}
            <div className="hidden md:flex items-center justify-center w-full max-w-[160px] h-[110px] relative flex-shrink-0">
              <svg className="w-full h-full" viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="purpleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#7c3aed" />
                    <stop offset="100%" stopColor="#c084fc" />
                  </linearGradient>
                  <linearGradient id="orangeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f97316" />
                    <stop offset="100%" stopColor="#fdba74" />
                  </linearGradient>
                </defs>

                {/* Static orbit track rings */}
                <circle cx="50" cy="50" r="22" fill="none" stroke="#7c3aed" strokeWidth="0.6" strokeDasharray="2 5" opacity="0.35" />
                <circle cx="50" cy="50" r="34" fill="none" stroke="#f97316" strokeWidth="0.5" strokeDasharray="2 7" opacity="0.25" />

                {/* Center core */}
                <circle cx="50" cy="50" r="3.5" fill="url(#purpleGrad)" opacity="0.9" />
                <circle cx="50" cy="50" r="5.5" fill="#7c3aed" opacity="0.15" />

                {/* UNBT token — inner orbit, radius 22, period 5s */}
                <g>
                  <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="5s" repeatCount="indefinite" />
                  <g transform="translate(72 50)">
                    <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="-360 0 0" dur="5s" repeatCount="indefinite" additive="sum" />
                    <ellipse rx="11" ry="7.5" fill="url(#purpleGrad)" opacity="0.95" />
                    <text textAnchor="middle" dy="2.5" fill="white" fontSize="5" fontWeight="bold" fontFamily="monospace" letterSpacing="0.5">UNBT</text>
                  </g>
                </g>

                {/* $ token — outer orbit, radius 34, period 9s, starts opposite side */}
                <g>
                  <animateTransform attributeName="transform" type="rotate" from="180 50 50" to="540 50 50" dur="9s" repeatCount="indefinite" />
                  <g transform="translate(84 50)">
                    <animateTransform attributeName="transform" type="rotate" from="-180 0 0" to="-540 0 0" dur="9s" repeatCount="indefinite" additive="sum" />
                    <circle r="9" fill="url(#orangeGrad)" opacity="0.95" />
                    <text textAnchor="middle" dy="3.5" fill="white" fontSize="10" fontWeight="bold" fontFamily="monospace">$</text>
                  </g>
                </g>
              </svg>
            </div>
          </section>

          {/* Banner Alert for Simulated Mode */}
          {isSimulated && (
            <div className="flex items-start gap-3 p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl text-amber-200/90 shadow-none">
              <Info className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-400" />
              <div className="text-xs leading-relaxed font-sans">
                <span className="font-semibold text-amber-300">Offline Fallback:</span> SpacetimeDB local server is currently unreachable. The dashboard has spun up an internal simulated sandbox simulating bot buy/sell actions so you can visualize the graph dynamics immediately. Spin up SpacetimeDB locally to automatically sync with live tables.
              </div>
            </div>
          )}

          {/* KPI Summary Row */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            {/* Box 1: Total Balance */}
            <div className={`p-4 border rounded-xl relative overflow-hidden ${theme.card}`}>
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Total Balance</span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#7c3aed]" />
              </div>
              <h2 className={`text-xl mt-2 ${theme.monoText}`}>{formatUSD(marketCap)}</h2>
              <p className="text-[9px] text-gray-500 mt-1.5 font-mono">
                Reserve Capitalization
              </p>
            </div>

            {/* Box 2: Total Volume */}
            <div className={`p-4 border rounded-xl relative overflow-hidden ${theme.card}`}>
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Total Volume</span>
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
              </div>
              <h2 className={`text-xl mt-2 ${theme.monoText}`}>{totalCirculation} UNBT</h2>
              <p className="text-[9px] text-gray-500 mt-1.5 font-mono">
                Distributed Market Tokens
              </p>
            </div>

            {/* Box 3: Market Price */}
            <div className={`p-4 border rounded-xl relative overflow-hidden ${theme.card}`}>
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Market Price</span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#f97316]" />
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <h2 className={`text-xl ${theme.monoText}`}>{formatUSD(unobtainiumPrice)}</h2>
                <div className={`text-xs font-mono font-bold tracking-tighter ${priceChange.isPositive ? 'text-emerald-400' : 'text-rose-500'}`}>
                  {priceChange.value}
                </div>
              </div>
              <p className="text-[9px] text-gray-500 mt-1.5 font-mono">
                Spot Index Pricing (USD)
              </p>
            </div>
          </section>


          {/* Primary Data Feed Charting */}
          <section className={`p-5 border rounded-xl ${theme.card}`}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
              <div>
                <h3 className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-white' : 'text-gray-900'}`}>UNOBTAINIUM VALUATION TIMELINE</h3>
                <p className="text-[10px] text-gray-500 mt-1">Sequential index adjustments updated per transaction tick</p>
              </div>
            </div>

            {/* Recharts AreaChart */}
            <div className="h-[250px] w-full">
              {priceHistory.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center text-xs text-gray-500 font-mono">
                  Awaiting first price ticker...
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={priceHistory}
                    margin={{ top: 10, right: 5, left: -25, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7c3aed" stopOpacity={isDark ? 0.25 : 0.15}/>
                        <stop offset="95%" stopColor="#7c3aed" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="strokeGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#7c3aed" />
                        <stop offset="100%" stopColor="#f97316" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.chartGrid} opacity={0.5} />
                    <XAxis 
                      dataKey="time" 
                      stroke={theme.chartX} 
                      fontSize={9} 
                      fontFamily="monospace"
                      dy={8} 
                      tickLine={false}
                    />
                    <YAxis 
                      stroke={theme.chartX} 
                      fontSize={9} 
                      fontFamily="monospace"
                      tickLine={false}
                      axisLine={false}
                      domain={['auto', 'auto']}
                      tickFormatter={(v) => `$${v.toFixed(2)}`}
                    />
                    <Tooltip
                      contentStyle={{ 
                        backgroundColor: theme.chartTooltipBg, 
                        borderColor: theme.chartTooltipBorder,
                        borderRadius: '8px',
                        color: theme.chartTooltipText,
                        fontSize: '10px',
                        fontFamily: 'monospace',
                        boxShadow: 'none'
                      }}
                      formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'UNBT Price']}
                      labelFormatter={(label) => `Timestamp: ${label}`}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="price" 
                      stroke="url(#strokeGradient)" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#priceGradient)" 
                      animationDuration={300}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>


          {/* Entity Ledger (Bottom Table) */}
          <section id="ai-agents" className={`border rounded-xl overflow-hidden scroll-mt-6 ${theme.card}`}>
            <div className={`px-5 py-4 border-b bg-[#1a1824]/20 flex justify-between items-center ${theme.border}`}>
              <div>
                <h3 className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-white' : 'text-gray-900'}`}>ACTIVE AGENT LEDGER</h3>
                <p className="text-[10px] text-gray-500 mt-1">Live status, relative resource weights and yield analytics</p>
              </div>
              <div className="flex items-center gap-3">
                {/* Ledger Filter Toggles */}
                <div className={`flex rounded-lg p-0.5 border ${
                  isDark ? 'bg-[#0c0a0f] border-[#1d1a26]' : 'bg-[#f1f0f4] border-[#e5e4e7]'
                }`}>
                  <button
                    onClick={() => setLedgerFilter('all')}
                    className={`px-2.5 py-1 rounded text-[9px] font-mono font-bold cursor-pointer transition-all duration-150 ${
                      ledgerFilter === 'all'
                        ? 'bg-[#7c3aed] text-white shadow-sm'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    ALL
                  </button>
                  <button
                    onClick={() => setLedgerFilter('user')}
                    className={`px-2.5 py-1 rounded text-[9px] font-mono font-bold cursor-pointer transition-all duration-150 ${
                      ledgerFilter === 'user'
                        ? 'bg-[#7c3aed] text-white shadow-sm'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    CREATED BY YOU
                  </button>
                </div>

                {agents.length > 0 && (
                  <button
                    onClick={handlePauseAll}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[10px] font-mono font-semibold cursor-pointer transition duration-150 ${
                      agents.every(a => a.is_paused)
                        ? 'text-emerald-400 bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10'
                        : 'text-amber-400 bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10'
                    }`}
                    title={agents.every(a => a.is_paused) ? 'Resume All Agents' : 'Pause All Agents'}
                  >
                    {agents.every(a => a.is_paused)
                      ? <><Play className="w-3 h-3" /> Resume All</>
                      : <><Pause className="w-3 h-3" /> Pause All</>}
                  </button>
                )}
                <span className="text-[10px] text-[#7c3aed] bg-[#7c3aed]/5 border border-[#7c3aed]/10 px-2 py-0.5 rounded font-mono font-semibold">
                  Agents Active: {agents.filter(a => !a.is_paused).length}/{agents.length}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              {agents.length === 0 ? (
                <div className="text-center py-8 text-xs text-gray-500 font-mono">
                  No active agents detected. Initialize an agent in the formulation panel.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className={`border-b text-gray-500 text-[10px] font-bold uppercase tracking-wider ${theme.border}`}>
                      <th className="py-3.5 px-5">Agent Name</th>
                      <th className="py-3.5 px-4">Cash (USD)</th>
                      <th className="py-3.5 px-4">Tokens Held</th>
                      <th className="py-3.5 px-4">Relative Weight</th>
                      <th className="py-3.5 px-4">Creator</th>
                      <th className="py-3.5 px-4">Performance</th>
                      <th className="py-3.5 px-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? 'divide-[#1d1a26]/50' : 'divide-[#e5e4e7]/50'}`}>
                    {filteredAgents.map((agent) => {
                      const themeDetails = getAgentTheme(agent.agent_id, agent.avatar_id);
                      const relativeWeight = totalCirculation > 0 
                        ? (agent.inventory / totalCirculation) * 100 
                        : 0;
                      
                      const performanceVal = getPerformancePercent(agent);

                      return (
                        <tr 
                          key={agent.agent_id} 
                          onClick={() => setSelectedAgent(agent)}
                          className={`hover:bg-[#7c3aed]/5 transition duration-150 cursor-pointer ${
                            agent.is_paused
                              ? (isDark ? 'opacity-50' : 'opacity-40')
                              : ''
                          } ${
                            selectedAgent?.agent_id === agent.agent_id
                              ? (isDark ? 'bg-[#7c3aed]/15' : 'bg-[#7c3aed]/10')
                              : ''
                          }`}
                        >
                          {/* Name / Description */}
                          <td className="py-3 px-5">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-2">
                                {themeDetails.icon}
                                <span className={`font-semibold tracking-wide ${isDark ? 'text-white' : 'text-gray-900'}`}>{agent.name}</span>
                                {agent.is_paused && (
                                  <span className="text-[8px] font-mono font-bold uppercase tracking-wider text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded">
                                    Paused
                                  </span>
                                )}
                              </div>
                              <span className="text-[9px] text-gray-500 max-w-[180px] truncate block" title={agent.prompt}>
                                {agent.prompt}
                              </span>
                            </div>
                          </td>
                          
                          {/* Cash Reserve (Monospace) */}
                          <td className={`py-3 px-4 ${theme.monoText}`}>
                            {formatUSD(agent.cash_balance)}
                          </td>
                          
                          {/* Tokens Held (Monospace) */}
                          <td className={`py-3 px-4 ${theme.monoText}`}>
                            {agent.inventory} UNBT
                          </td>

                          {/* Relative Token Weight (Monospace) */}
                          <td className={`py-3 px-4 ${theme.monoText}`}>
                            {relativeWeight.toFixed(1)}%
                          </td>

                          {/* Creator (Monospace) */}
                          <td className="py-3 px-4 font-mono text-[10px]">
                            {(() => {
                              const creator = localStorage.getItem('agent_creator_' + agent.agent_id) || 'System';
                              return creator === username ? (
                                <span className="text-[#9061f9] font-bold">You</span>
                              ) : (
                                <span className="text-gray-500">{creator}</span>
                              );
                            })()}
                          </td>

                          {/* Performance Percentage (Monospace) */}
                          <td className={`py-3 px-4 font-mono font-bold tracking-tighter ${performanceVal >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                            {performanceVal >= 0 ? '+' : ''}{performanceVal.toFixed(2)}%
                          </td>

                          {/* Action buttons: Pause/Resume + Decommission */}
                          <td className="py-3 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleTogglePause(agent)}
                                className={`p-1.5 rounded-lg border-0 bg-transparent cursor-pointer transition duration-150 inline-flex items-center justify-center ${
                                  agent.is_paused
                                    ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10'
                                    : 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                                }`}
                                title={agent.is_paused ? 'Resume Agent' : 'Pause Agent'}
                              >
                                {agent.is_paused
                                  ? <Play className="w-4 h-4" />
                                  : <Pause className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={() => handleDecommission(agent.name)}
                                className="text-rose-500 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-500/10 bg-transparent border-0 cursor-pointer transition duration-150 inline-flex items-center justify-center"
                                title="Decommission Agent"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Simulation Console Ledger */}
          <section id="live-ledger" className={`border rounded-xl overflow-hidden scroll-mt-6 ${theme.card}`}>
            <div className={`px-5 py-3 border-b bg-[#1a1824]/20 flex justify-between items-center ${theme.border}`}>
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-[#7c3aed]" />
                <h3 className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-white' : 'text-gray-900'}`}>REAL-TIME SIMULATION LEDGER</h3>
              </div>
              <span className="text-[9px] text-gray-500 font-mono uppercase">System Log Feed</span>
            </div>

            <div className={`p-4 h-[150px] overflow-y-auto font-mono text-[10px] space-y-1.5 border-t ${
              isDark ? 'bg-[#0c0a0f] border-[#1d1a26]/40' : 'bg-[#f1f0f4] border-[#e5e4e7]/40'
            }`}>
              {activityLogs.length === 0 ? (
                <div className="text-center text-gray-500 py-10">
                  Awaiting system telemetry...
                </div>
              ) : (
                activityLogs.map((log) => {
                  let textClass = 'text-gray-400';
                  let typeBadge = '';
                  
                  if (log.type === 'system') {
                    textClass = 'text-[#7c3aed] font-semibold';
                    typeBadge = '[SYS]';
                  } else if (log.type === 'market') {
                    textClass = 'text-[#f97316] font-semibold';
                    typeBadge = '[MKT]';
                  } else if (log.type === 'trade-buy') {
                    textClass = 'text-emerald-500 font-semibold';
                    typeBadge = '[BUY]';
                  } else if (log.type === 'trade-sell') {
                    textClass = 'text-rose-500 font-semibold';
                    typeBadge = '[SEL]';
                  }

                  return (
                    <div key={log.id} className="flex gap-2 items-start py-0.5 px-1 hover:bg-[#7c3aed]/5 rounded transition duration-100">
                      <span className="text-gray-500 select-none flex-shrink-0">[{log.timestamp}]</span>
                      <span className={`select-none flex-shrink-0 w-10 ${textClass}`}>{typeBadge}</span>
                      <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{log.message}</span>
                    </div>
                  );
                })
              )}
            </div>
          </section>

        </main>


        {/* ================= TRANSACTIONAL SIDECAR PANEL (Col-Span 3) ================= */}
        <aside className="col-span-12 lg:col-span-4 xl:col-span-3 space-y-6">

          {/* Parameter Formulation Interface (Spawner Widget) */}
          <div className={`border rounded-xl p-5 ${theme.card}`}>
            <div className={`flex items-center justify-between pb-3 border-b ${theme.border} mb-4`}>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#7c3aed]" />
                <h3 className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-white' : 'text-gray-900'}`}>AGENT FORMULATION</h3>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Formulate a custom trading agent construct with specialized personality parameters, custom prompts, and a selected profile avatar.
            </p>
            <div className={`flex justify-between items-center p-2 rounded-lg border text-[10px] font-mono mb-4 ${
              isDark ? 'bg-[#0c0a0f] border-[#1d1a26]' : 'bg-[#f1f0f4] border-[#e5e4e7]'
            }`}>
              <span className="text-gray-400">Your Deployments:</span>
              <span className={theme.monoText}>
                {agents.filter(a => localStorage.getItem('agent_creator_' + a.agent_id) === username).length} UNITS
              </span>
            </div>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className={`w-full bg-[#7c3aed] text-white hover:bg-[#6d28d9] rounded-lg py-2.5 transition duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-sm ${theme.actionText}`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>INITIALIZE CONSTRUCT</span>
            </button>
          </div>


          {/* Allocation Distribution Hub */}
          <div id="cluster-nodes" className={`border rounded-xl p-5 scroll-mt-6 ${theme.card}`}>
            <div className={`flex items-center gap-2 pb-3 border-b ${theme.border} mb-4`}>
              <Coins className="w-4 h-4 text-[#f97316]" />
              <h3 className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-white' : 'text-gray-900'}`}>ALLOCATION DISTRIBUTION</h3>
            </div>

            {/* Sweeping semi-circular radial gauge track */}
            <div className="flex flex-col items-center justify-center py-2 relative">
              <div className="w-36 h-24 relative overflow-hidden">
                <svg className="w-full h-full" viewBox="0 0 120 80">
                  <defs>
                    <linearGradient id="radialGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#7c3aed" />
                      <stop offset="100%" stopColor="#f97316" />
                    </linearGradient>
                  </defs>
                  
                  {/* Background Track Arc */}
                  <path
                    d="M 15 75 A 45 45 0 0 1 105 75"
                    fill="none"
                    stroke={isDark ? '#1d1a26' : '#e5e4e7'}
                    strokeWidth="7"
                    strokeLinecap="round"
                  />
                  
                  {/* Sweeping Foreground Arc */}
                  <path
                    d="M 15 75 A 45 45 0 0 1 105 75"
                    fill="none"
                    stroke="url(#radialGradient)"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={radialArcLength}
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                
                {/* Value text in center */}
                <div className="absolute bottom-1 inset-x-0 flex flex-col items-center justify-center text-center">
                  <span className={`text-base ${theme.monoText}`}>
                    {assetAllocationPercent.toFixed(1)}%
                  </span>
                  <span className="text-[8px] text-gray-500 font-semibold uppercase tracking-wider mt-0.5">
                    UNBT WEIGHT
                  </span>
                </div>
              </div>

              {/* Secondary horizontal linear asset allocation progress bars */}
              <div className="w-full mt-6 space-y-4">
                
                {/* Bar 1: Cash Reserves */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] font-mono">
                    <span className="text-gray-400">USD Cash Reserves</span>
                    <span className={theme.monoText}>
                      {cashAllocationPercent.toFixed(0)}% ({formatUSD(totalCash)})
                    </span>
                  </div>
                  <div className={`w-full h-2 rounded-full overflow-hidden flex ${isDark ? 'bg-[#0c0a0f] border border-[#1d1a26]' : 'bg-[#f1f0f4] border border-[#e5e4e7]'}`}>
                    <div 
                      className="h-full bg-[#f97316] rounded-full transition-all duration-1000 ease-out" 
                      style={{ width: `${cashAllocationPercent}%` }}
                    />
                  </div>
                </div>

                {/* Bar 2: UNBT Allocation */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] font-mono">
                    <span className="text-gray-400">UNBT Asset Tokens</span>
                    <span className={theme.monoText}>
                      {assetAllocationPercent.toFixed(0)}% ({formatUSD(totalCirculation * unobtainiumPrice)})
                    </span>
                  </div>
                  <div className={`w-full h-2 rounded-full overflow-hidden flex ${isDark ? 'bg-[#0c0a0f] border border-[#1d1a26]' : 'bg-[#f1f0f4] border border-[#e5e4e7]'}`}>
                    <div 
                      className="h-full bg-[#7c3aed] rounded-full transition-all duration-1000 ease-out" 
                      style={{ width: `${assetAllocationPercent}%` }}
                    />
                  </div>
                </div>

              </div>
            </div>
          </div>

        </aside>

      </div>

      {/* Footer */}
      <footer className={`mt-12 border-t py-6 text-center text-[9px] text-gray-500 font-mono tracking-widest ${theme.border}`}>
        SPACETIMEDB NEURAL SIMULATION WORKSPACE &bull; SECURED CLIENT BUNDLE &bull; TERMINAL FEED CAPPED AT 20 TICK HISTORICALS
      </footer>

      {/* ================= CENTERED GAMIFIED AGENT CREATOR MODAL ================= */}
      {isCreateModalOpen && (
        <>
          {/* Full-screen blurred background mask */}
          <div 
            className="fixed inset-0 z-50 backdrop-blur-md bg-slate-950/60 transition-opacity"
            onClick={() => setIsCreateModalOpen(false)}
          />
          {/* Centered modal panel */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div 
              className={`w-full max-w-md border rounded-2xl p-6 shadow-2xl relative pointer-events-auto transition-all transform scale-100 flex flex-col ${
                isDark ? 'bg-[#13111a] border-[#1d1a26] text-white' : 'bg-white border-[#e5e4e7] text-gray-900'
              }`}
            >
              {/* Close Button */}
              <button 
                onClick={() => setIsCreateModalOpen(false)}
                className={`absolute top-4 right-4 p-1.5 rounded-lg transition ${
                  isDark ? 'hover:bg-[#1d1a26] text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-900'
                }`}
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 pb-3 border-b border-gray-500/10 mb-4">
                <Sparkles className="w-5 h-5 text-[#7c3aed]" />
                <h3 className={`uppercase ${theme.mainHeading}`}>
                  INITIALIZE CONSTRUCT
                </h3>
              </div>

              <form onSubmit={handleSpawnAgent} className="space-y-4">
                {/* Name Input */}
                <div>
                  <label htmlFor="modal-agent-name" className="block text-[8px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">
                    AGENT_IDENTIFIER
                  </label>
                  <div className={`border rounded-lg overflow-hidden p-0.5 transition duration-150 ${theme.border}`}>
                    <input
                      type="text"
                      id="modal-agent-name"
                      value={newAgentName}
                      onChange={(e) => setNewAgentName(e.target.value)}
                      placeholder="e.g. Sentiment Scalper Bot"
                      className={`w-full border-0 bg-transparent outline-none py-2 px-3 text-xs font-sans focus:ring-0 ${
                        isDark ? 'text-white placeholder-[#434052]' : 'text-gray-900 placeholder-gray-400'
                      }`}
                      style={{
                        color: isDark ? '#ffffff' : '#000000',
                      }}
                      maxLength={32}
                      required
                    />
                  </div>
                </div>

                {/* Persona Textarea */}
                <div>
                  <label htmlFor="modal-agent-prompt" className="block text-[8px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">
                    STRATEGIC_AI_PROMPT
                  </label>
                  <div className={`border rounded-lg overflow-hidden p-0.5 transition duration-150 ${theme.border}`}>
                    <textarea
                      id="modal-agent-prompt"
                      value={newAgentPrompt}
                      onChange={(e) => setNewAgentPrompt(e.target.value)}
                      placeholder="e.g. A risk-averse panic seller who starts with a large inventory..."
                      rows={5}
                      className={`w-full border-0 bg-transparent outline-none py-2 px-3 text-xs font-sans focus:ring-0 resize-none leading-relaxed ${
                        isDark ? 'text-white placeholder-[#434052]' : 'text-gray-900 placeholder-gray-400'
                      }`}
                      style={{
                        color: isDark ? '#ffffff' : '#000000',
                      }}
                      maxLength={1000}
                      required
                    />
                  </div>
                </div>

                {/* Template Preset trigger inside modal */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={applyPreset}
                    className="text-[9px] font-bold text-[#7c3aed] hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-0"
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    LOAD TEMPLATE PRESET
                  </button>
                </div>

                {/* Avatar Select Matrix */}
                <div>
                  <span className="block text-[8px] font-bold uppercase tracking-widest text-gray-500 mb-2">
                    AVATAR_SELECT
                  </span>
                  <div className="grid grid-cols-4 gap-2.5">
                    {[
                      { id: 'gekko', label: 'Gekko', icon: '🦎' },
                      { id: 'monkey', label: 'Monkey', icon: '🐒' },
                      { id: 'brain', label: 'Brain', icon: '🧠' },
                      { id: 'robot', label: 'Robot', icon: '🤖' },
                      { id: 'whale', label: 'Whale', icon: '🐋' },
                      { id: 'bull', label: 'Bull', icon: '🐂' },
                      { id: 'bear', label: 'Bear', icon: '🐻' },
                      { id: 'unicorn', label: 'Unicorn', icon: '🦄' }
                    ].map((avatar) => {
                      const isSelected = selectedAvatar === avatar.id;
                      return (
                        <button
                          key={avatar.id}
                          type="button"
                          onClick={() => {
                            setSelectedAvatar(avatar.id);
                            setCustomEmoji('');
                          }}
                          className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'border-[3px] border-[#7c3aed] bg-[#7c3aed]/10 text-[#7c3aed]'
                              : isDark
                              ? 'border-[#1d1a26] bg-[#0c0a0f] hover:border-[#7c3aed]/50 text-gray-400 hover:text-white'
                              : 'border-[#e5e4e7] bg-[#f1f0f4] hover:border-[#7c3aed]/50 text-gray-500 hover:text-gray-900'
                          }`}
                        >
                          <span className="text-xl select-none">{avatar.icon}</span>
                          <span className={`mt-1 ${theme.actionText}`}>{avatar.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Emoji Selector */}
                <div className={`p-3 rounded-xl border flex items-center justify-between gap-4 ${
                  isDark ? 'bg-[#0c0a0f] border-[#1d1a26]' : 'bg-[#f1f0f4] border-[#e5e4e7]'
                }`}>
                  <div>
                    <span className="block text-[8px] font-bold uppercase tracking-widest text-gray-500 mb-0.5">
                      CUSTOM_EMOJI_OVERRIDE
                    </span>
                    <p className="text-[10px] text-gray-500">Paste or type any single custom emoji</p>
                  </div>
                  <input
                    type="text"
                    value={customEmoji}
                    placeholder="🔮"
                    maxLength={4}
                    onChange={(e) => {
                      const val = e.target.value;
                      const emojiArray = Array.from(val);
                      const singleEmoji = emojiArray.slice(0, 1).join('');
                      setCustomEmoji(singleEmoji);
                      if (singleEmoji) {
                        setSelectedAvatar(singleEmoji);
                      } else {
                        setSelectedAvatar('robot');
                      }
                    }}
                    className={`w-14 h-10 text-center text-xl border rounded-lg bg-transparent outline-none focus:ring-1 focus:ring-[#7c3aed] transition ${
                      isDark ? 'border-[#1d1a26]/80 text-white' : 'border-[#e5e4e7]/80 text-gray-900'
                    }`}
                  />
                </div>

                {/* Error Telemetry */}
                {spawnError && (
                  <div className="text-[9px] text-rose-500 bg-rose-500/5 border border-rose-500/10 rounded-lg p-2 font-mono">
                    ⚠️ {spawnError}
                  </div>
                )}

                {/* Submit Action */}
                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className={`flex-1 border rounded-lg py-2.5 transition duration-150 cursor-pointer ${theme.actionText} ${
                      isDark 
                        ? 'border-[#1d1a26] hover:bg-[#1a1824] text-gray-300' 
                        : 'border-[#e5e4e7] hover:bg-gray-50 text-gray-600'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSpawning}
                    className={`flex-1 bg-[#7c3aed] text-white hover:bg-[#6d28d9] disabled:opacity-50 rounded-lg py-2.5 transition duration-150 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer shadow-sm ${theme.actionText}`}
                  >
                    {isSpawning ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Deploying...</span>
                      </>
                    ) : (
                      <span>INITIALIZE AGENT</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* ================= INTERACTIVE AGENT INSPECTION drawer ================= */}
      {selectedAgent && (
        <>
          {/* Backdrop mask */}
          <div 
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-40 transition-opacity" 
            onClick={() => setSelectedAgent(null)}
          />
          {/* Drawer card */}
          <div 
            className={`fixed top-0 right-0 h-full w-full sm:w-[450px] shadow-2xl z-50 transform translate-x-0 transition-transform duration-300 flex flex-col ${
              isDark ? 'bg-[#13111a] border-l border-[#1d1a26] text-white' : 'bg-white border-l border-[#e5e4e7] text-gray-900'
            }`}
          >
            {/* Header */}
            <div className={`p-6 border-b flex justify-between items-center ${theme.border}`}>
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-[#7c3aed]" />
                <h3 className={theme.mainHeading}>Agent Inspection Deck</h3>
              </div>
              <button 
                onClick={() => setSelectedAgent(null)}
                className={`p-1.5 rounded-lg transition ${
                  isDark ? 'hover:bg-[#1d1a26] text-gray-400 hover:text-white' : 'hover:bg-gray-150 text-gray-500 hover:text-gray-900'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Profile Header */}
              <div className={`p-5 rounded-xl border flex items-center gap-4 ${isDark ? 'bg-[#0c0a0f]/50 border-[#1d1a26]' : 'bg-[#f8f7f9] border-[#e5e4e7]'}`}>
                <div className={`w-14 h-14 rounded-full flex items-center justify-center border-2 ${
                  getAgentTheme(selectedAgent.agent_id, selectedAgent.avatar_id).accentColor.includes('emerald')
                    ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-400'
                    : getAgentTheme(selectedAgent.agent_id, selectedAgent.avatar_id).accentColor.includes('rose')
                    ? 'border-rose-500/35 bg-rose-500/10 text-rose-400'
                    : getAgentTheme(selectedAgent.agent_id, selectedAgent.avatar_id).accentColor.includes('amber')
                    ? 'border-amber-500/35 bg-amber-500/10 text-amber-400'
                    : 'border-violet-500/35 bg-violet-500/10 text-[#7c3aed]'
                }`}>
                  {getAvatarIcon(selectedAgent.avatar_id, "text-2xl flex items-center justify-center select-none")}
                </div>
                <div>
                  <h4 className={`text-base font-bold leading-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>{selectedAgent.name}</h4>
                  <span className="text-[10px] text-gray-500 font-mono tracking-wider">{selectedAgent.agent_id}</span>
                </div>
              </div>

              {/* Cash & Token breakdown */}
              <div className="space-y-3">
                <h5 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Resource Ledger</h5>
                <div className="grid grid-cols-2 gap-4">
                  <div className={`p-4 rounded-xl border ${theme.card}`}>
                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Cash Balance</span>
                    <span className={`text-lg ${theme.monoText}`}>{formatUSD(selectedAgent.cash_balance)}</span>
                  </div>
                  <div className={`p-4 rounded-xl border ${theme.card}`}>
                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Tokens Held</span>
                    <span className={`text-lg ${theme.monoText}`}>{selectedAgent.inventory} UNBT</span>
                  </div>
                </div>
              </div>

              {/* Persona prompt text */}
              <div className="space-y-3">
                <h5 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Trading Persona Description</h5>
                <div className={`p-4 rounded-xl border font-mono text-xs leading-relaxed ${theme.card}`}>
                  {selectedAgent.prompt}
                </div>
              </div>

              {/* Cognitive Thought Process Feed */}
              <div className="space-y-3">
                <h5 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Cognitive Thought Feed</h5>
                
                {(() => {
                  const agentThoughts = thoughts.filter(t => t.agent_id === selectedAgent.agent_id);
                  if (agentThoughts.length === 0) {
                    return (
                      <div className={`p-4 rounded-xl border text-center text-xs text-gray-500 font-mono ${theme.card}`}>
                        No recent thoughts recorded. Awaiting turn...
                      </div>
                    );
                  }
                  
                  return (
                    <div className="space-y-3">
                      {/* Latest thought bubble */}
                      <div className={`p-4 rounded-xl border relative overflow-hidden ${
                        agentThoughts[0].action === 'BUY' 
                          ? 'border-emerald-500/20 bg-emerald-500/5' 
                          : agentThoughts[0].action === 'SELL'
                          ? 'border-rose-500/20 bg-rose-500/5'
                          : 'border-amber-500/20 bg-amber-500/5'
                      }`}>
                        <div className="flex justify-between items-center mb-2">
                          <span className={`text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded ${
                            agentThoughts[0].action === 'BUY'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : agentThoughts[0].action === 'SELL'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            LATEST: {agentThoughts[0].action}
                          </span>
                          <span className="text-[8px] text-gray-500 font-mono">
                            {new Date(agentThoughts[0].created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className={`text-xs leading-relaxed font-sans italic ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                          &ldquo;{agentThoughts[0].rationale}&rdquo;
                        </p>
                      </div>

                      {/* Timeline of past thoughts (if > 1) */}
                      {agentThoughts.length > 1 && (
                        <div className={`p-4 rounded-xl border space-y-3 max-h-[220px] overflow-y-auto ${theme.card}`}>
                          <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block border-b pb-1.5 border-gray-500/10">
                            Decision History
                          </span>
                          <div className="space-y-3">
                            {agentThoughts.slice(1, 6).map((thought) => (
                              <div key={thought.id} className="flex gap-3 items-start text-[11px] leading-relaxed">
                                <span className={`text-[9px] font-mono font-bold w-12 text-center py-0.5 rounded flex-shrink-0 ${
                                  thought.action === 'BUY'
                                    ? 'bg-emerald-500/15 text-emerald-400'
                                    : thought.action === 'SELL'
                                    ? 'bg-rose-500/15 text-rose-400'
                                    : 'bg-amber-500/15 text-amber-400'
                                }`}>
                                  {thought.action}
                                </span>
                                <div className="flex-1 space-y-0.5">
                                  <p className={isDark ? 'text-gray-300' : 'text-gray-750'}>{thought.rationale}</p>
                                  <span className="text-[8px] text-gray-500 font-mono block">
                                    {new Date(thought.created_at).toLocaleTimeString()}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Performance Metrics */}
              <div className="space-y-3">
                <h5 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Performance Yield</h5>
                <div className={`p-4 rounded-xl border space-y-4 ${theme.card}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Yield Since Inception</span>
                    <span className={`text-base font-mono font-bold tracking-tighter ${getPerformancePercent(selectedAgent) >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                      {getPerformancePercent(selectedAgent) >= 0 ? '+' : ''}{getPerformancePercent(selectedAgent).toFixed(2)}%
                    </span>
                  </div>
                  
                  {/* Visual gauge or performance indicator */}
                  <div className="h-1.5 w-full bg-gray-500/10 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        getPerformancePercent(selectedAgent) >= 0 ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                      style={{
                        width: `${Math.min(100, Math.max(0, 50 + getPerformancePercent(selectedAgent)))}%`
                      }}
                    />
                  </div>
                  
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>Underperforming</span>
                    <span>Neutral</span>
                    <span>Outperforming</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer containing Decommission */}
            <div className={`p-6 border-t ${theme.border} space-y-3`}>
              <button
                onClick={() => {
                  handleDecommission(selectedAgent.name);
                  setSelectedAgent(null);
                }}
                className={`w-full bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white rounded-lg py-2.5 transition duration-150 flex items-center justify-center gap-2 cursor-pointer border border-rose-500/20 ${theme.actionText}`}
              >
                Decommission Construct
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
