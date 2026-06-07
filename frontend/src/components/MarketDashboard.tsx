import { useState, useEffect, useRef } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Bot,
  Coins,
  ShieldAlert,
  Sparkles,
  Activity,
  DollarSign,
  Layers,
  RefreshCw,
  Info
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

export default function MarketDashboard() {
  // Data states
  const [agents, setAgents] = useState<Agent[]>([]);
  const [market, setMarket] = useState<Market | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  
  // App state
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSimulated, setIsSimulated] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Spawner Form State
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentPrompt, setNewAgentPrompt] = useState('');
  const [isSpawning, setIsSpawning] = useState(false);
  const [spawnError, setSpawnError] = useState<string | null>(null);
  const [spawnSuccess, setSpawnSuccess] = useState(false);
  const [fetchTrigger, setFetchTrigger] = useState(0);
  
  // Refs for tracking changes and log generating
  const prevAgentsRef = useRef<Agent[]>([]);
  const prevPriceRef = useRef<number | null>(null);

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

  // Spawn agent handler invoking database reducer
  const handleSpawnAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName.trim() || !newAgentPrompt.trim()) {
      setSpawnError('Name and personality prompt are required.');
      return;
    }

    setIsSpawning(true);
    setSpawnError(null);
    setSpawnSuccess(false);

    const generatedId = `agent_custom_${Math.random().toString(36).substring(2, 9)}`;

    try {
      if (isSimulated) {
        // Mock spawn locally in sandbox mode
        const newAgent: Agent = {
          agent_id: generatedId,
          name: newAgentName,
          cash_balance: 250000,
          inventory: 5,
          prompt: newAgentPrompt
        };
        setAgents(prev => [...prev, newAgent]);
        addLog('system', `Deployed custom agent "${newAgentName}" (Simulated)`);
        setSpawnSuccess(true);
        setNewAgentName('');
        setNewAgentPrompt('');
      } else {
        // Real spawn call to Maincloud database reducer
        const res = await fetch('/v1/database/market-guru/call/spawn_agent', {
          method: 'POST',
          body: JSON.stringify([generatedId, newAgentName, newAgentPrompt]),
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || `HTTP ${res.status}`);
        }

        addLog('system', `Deployed custom agent "${newAgentName}" to Maincloud!`);
        setSpawnSuccess(true);
        setNewAgentName('');
        setNewAgentPrompt('');
        
        // Trigger immediate fetch to show the new agent card by updating dependency trigger
        setFetchTrigger(prev => prev + 1);
      }
    } catch (err: any) {
      console.error('Failed to spawn agent:', err);
      setSpawnError(err.message || 'Failed to connect to SpacetimeDB');
    } finally {
      setIsSpawning(false);
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
      };
    } else if (typeof row === 'object') {
      return {
        agent_id: String(row.agent_id ?? ''),
        name: String(row.name ?? ''),
        cash_balance: Number(row.cash_balance ?? 0),
        inventory: Number(row.inventory ?? 0),
        prompt: String(row.prompt ?? ''),
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

  // 2-second Polling / Fetching loop
  useEffect(() => {
    let mockIntervalId: any = null;
    let pollIntervalId: any = null;
    
    // Starting logs
    addLog('system', 'Initializing dashboard modules...');

    const fetchData = async () => {
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
        
        if (!marketRes.ok || !agentRes.ok) {
          throw new Error('Endpoint returned error code');
        }

        const marketJson = await marketRes.json();
        const agentJson = await agentRes.json();

        // Safe extraction of arrays from SQL statement result format [[{ rows: [...] }]] or fallback to direct rows list
        const rawMarketRows = (Array.isArray(marketJson) && marketJson[0]?.rows) 
          ? marketJson[0].rows 
          : (Array.isArray(marketJson) ? marketJson : (marketJson.rows || []));
          
        const rawAgentRows = (Array.isArray(agentJson) && agentJson[0]?.rows) 
          ? agentJson[0].rows 
          : (Array.isArray(agentJson) ? agentJson : (agentJson.rows || []));

        const parsedMarket = rawMarketRows.map(parseMarketRow).filter(Boolean) as Market[];
        const parsedAgents = rawAgentRows.map(parseAgentRow).filter(Boolean) as Agent[];

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
        { agent_id: 'agent_whale', name: 'Gordon Gekko Bot', cash_balance: 500000, inventory: 0, prompt: 'An aggressive market whale who has a high starting balance, trades aggressively, and seeks to drive the price up by buying when possible.' },
        { agent_id: 'agent_panic', name: 'Paper Hands Bot', cash_balance: 100000, inventory: 50, prompt: 'A risk-averse panic seller who starts with a large inventory. They panic-sell immediately at any sign of stability or high prices to lock in cash, fearing drops.' },
        { agent_id: 'agent_chaos', name: 'Chaos Monkey Bot', cash_balance: 200000, inventory: 10, prompt: 'A completely unpredictable agent who trades erratically. They act on random whims, ignoring standard financial logic.' }
      ];

      setMarket(initialMarket);
      setAgents(initialAgents);
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
          // Select a random agent to make a trade
          const agentIndex = Math.floor(Math.random() * prevAgents.length);
          const agent = { ...prevAgents[agentIndex] };
          const newAgents = [...prevAgents];
          
          const decision = ['BUY', 'SELL', 'HOLD'][Math.floor(Math.random() * 3)];
          let currentPrice = prevMarket.current_price;

          if (decision === 'BUY' && agent.cash_balance >= currentPrice) {
            agent.cash_balance -= currentPrice;
            agent.inventory += 1;
            // 1% price pump
            currentPrice += Math.round(currentPrice / 100);
            newAgents[agentIndex] = agent;
            
            addLog('trade-buy', `${agent.name} bought 1 unit of Unobtainium at ${formatUSD(prevMarket.current_price)} (Simulated)`);
          } else if (decision === 'SELL' && agent.inventory > 0) {
            agent.inventory -= 1;
            agent.cash_balance += currentPrice;
            // 1% price drop
            currentPrice = Math.max(100, currentPrice - Math.round(currentPrice / 100));
            newAgents[agentIndex] = agent;
            
            addLog('trade-sell', `${agent.name} sold 1 unit of Unobtainium at ${formatUSD(prevMarket.current_price)} (Simulated)`);
          } else {
            // HOLD
          }

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

    // Simulation tick loop (only triggers actions when isSimulated is true)
    mockIntervalId = setInterval(() => {
      if (prevPriceRef.current !== null && (window as any).isSimulatingDBMode || isSimulated) {
        runMockSimulationStep();
      }
    }, 2000);

    return () => {
      clearInterval(pollIntervalId);
      clearInterval(mockIntervalId);
    };
  }, [isSimulated, fetchTrigger]);

  // Aggregate metrics calculations
  const unobtainiumPrice = market?.current_price ?? 1000;
  const totalCirculation = agents.reduce((acc, a) => acc + a.inventory, 0);
  const totalCash = agents.reduce((acc, a) => acc + a.cash_balance, 0);
  const marketCap = (totalCirculation * unobtainiumPrice) + totalCash;

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
  const getAgentTheme = (agentId: string) => {
    switch (agentId) {
      case 'agent_whale':
        return {
          accentColor: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5',
          fillColor: 'bg-emerald-500',
          badgeText: 'Aggressive Whale',
          icon: <DollarSign className="w-5 h-5 text-emerald-400" />,
          glow: 'shadow-[0_0_15px_rgba(16,185,129,0.1)]',
          desc: 'Seeks to pump the price by aggressive buying.'
        };
      case 'agent_panic':
        return {
          accentColor: 'border-rose-500/30 text-rose-400 bg-rose-500/5',
          fillColor: 'bg-rose-500',
          badgeText: 'Panic Seller',
          icon: <ShieldAlert className="w-5 h-5 text-rose-400" />,
          glow: 'shadow-[0_0_15px_rgba(244,63,94,0.1)]',
          desc: 'Dumps inventory quickly when prices are high.'
        };
      case 'agent_chaos':
        return {
          accentColor: 'border-amber-500/30 text-amber-400 bg-amber-500/5',
          fillColor: 'bg-amber-500',
          badgeText: 'Chaos Bot',
          icon: <Sparkles className="w-5 h-5 text-amber-400" />,
          glow: 'shadow-[0_0_15px_rgba(245,158,11,0.1)]',
          desc: 'Trades erratically on unpredictable random impulses.'
        };
      default:
        return {
          accentColor: 'border-purple-500/30 text-purple-400 bg-purple-500/5',
          fillColor: 'bg-purple-500',
          badgeText: 'Active Agent',
          icon: <Bot className="w-5 h-5 text-purple-400" />,
          glow: 'shadow-[0_0_15px_rgba(168,85,247,0.1)]',
          desc: 'Standard AI trading bot.'
        };
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] text-gray-200 bg-[#0c0d12]">
        <RefreshCw className="w-12 h-12 mb-4 text-purple-500 animate-spin" />
        <h3 className="text-lg font-medium tracking-wide">Syncing with economic simulation...</h3>
        <p className="text-sm text-gray-500 mt-2">Checking local SpacetimeDB nodes at port 3000</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-gray-100 bg-[#0c0d12] flex flex-col font-sans select-none antialiased">
      {/* Top Navigation / Status Header */}
      <header className="border-b border-gray-800 bg-[#0f111a] px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-xl shadow-lg shadow-purple-900/30">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white m-0">MarketGuru</h1>
            <p className="text-xs text-purple-400/80 font-mono tracking-wider uppercase">SpacetimeDB Economic Agent Engine</p>
          </div>
        </div>

        {/* Connection Health indicators */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#171a26] border border-gray-800">
            <div className={`w-2 h-2 rounded-full ${isSimulated ? 'bg-amber-500 animate-pulse' : isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500 animate-pulse'}`} />
            <span className="text-xs font-mono font-medium">
              {isSimulated ? 'Local Simulation' : isConnected ? 'Live SpacetimeDB' : 'Disconnected'}
            </span>
          </div>

          <span className="text-xs text-gray-500 hidden md:inline">
            Last Fetch: {lastUpdated.toLocaleTimeString()}
          </span>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
        
        {/* Banner Alert for Simulated Mode */}
        {isSimulated && (
          <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-200">
            <Info className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-400" />
            <div className="text-sm leading-relaxed">
              <span className="font-semibold text-amber-300">Offline Fallback Engaged:</span> SpacetimeDB local server at <code className="bg-amber-950/40 px-1 py-0.5 rounded text-amber-400 font-mono">127.0.0.1:3000</code> is currently unreachable. The dashboard has spun up an internal simulated sandbox simulating bot buy/sell actions so you can visualize the graph dynamics immediately. Spin up SpacetimeDB locally to automatically sync with live tables.
            </div>
          </div>
        )}

        {/* Aggregate Stats Dashboard Section */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Asset price */}
          <div className="p-5 bg-[#121420] border border-gray-800 rounded-2xl hover:border-gray-700 transition duration-300 relative overflow-hidden group">
            <div className="absolute right-0 top-0 w-24 h-24 bg-gradient-to-bl from-purple-500/5 to-transparent rounded-bl-full pointer-events-none" />
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Unobtainium Index</p>
                <h2 className="text-2xl font-bold mt-2 text-white font-mono">{formatUSD(unobtainiumPrice)}</h2>
              </div>
              <div className="p-2.5 bg-purple-500/10 rounded-xl border border-purple-500/10">
                <Coins className="w-5 h-5 text-purple-400" />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <div className={`flex items-center text-xs font-semibold py-0.5 px-2 rounded font-mono ${priceChange.isPositive ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>
                {priceChange.isPositive ? <TrendingUp className="w-3.5 h-3.5 mr-1" /> : <TrendingDown className="w-3.5 h-3.5 mr-1" />}
                {priceChange.value}
              </div>
              <span className="text-xs text-gray-500">20-tick shift window</span>
            </div>
          </div>

          {/* Card 2: Active Bots */}
          <div className="p-5 bg-[#121420] border border-gray-800 rounded-2xl hover:border-gray-700 transition duration-300 relative overflow-hidden">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Bots</p>
                <h2 className="text-2xl font-bold mt-2 text-white font-mono">{agents.length} Bots</h2>
              </div>
              <div className="p-2.5 bg-indigo-500/10 rounded-xl border border-indigo-500/10">
                <Bot className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-xs text-gray-400 font-mono">
              <span className="flex h-2 w-2 relative mr-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Gemini AI agent decision loops
            </div>
          </div>

          {/* Card 3: Circulation */}
          <div className="p-5 bg-[#121420] border border-gray-800 rounded-2xl hover:border-gray-700 transition duration-300 relative overflow-hidden">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Circulating Supply</p>
                <h2 className="text-2xl font-bold mt-2 text-white font-mono">{totalCirculation} UNBT</h2>
              </div>
              <div className="p-2.5 bg-blue-500/10 rounded-xl border border-blue-500/10">
                <Layers className="w-5 h-5 text-blue-400" />
              </div>
            </div>
            <div className="mt-4 text-xs text-gray-500">
              Total tokens held by agents
            </div>
          </div>

          {/* Card 4: Net worth */}
          <div className="p-5 bg-[#121420] border border-gray-800 rounded-2xl hover:border-gray-700 transition duration-300 relative overflow-hidden">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Net Worth</p>
                <h2 className="text-2xl font-bold mt-2 text-white font-mono">{formatUSD(marketCap)}</h2>
              </div>
              <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/10">
                <DollarSign className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
            <div className="mt-4 text-xs text-gray-400 flex items-center gap-1.5 font-mono">
              <span className="text-emerald-400">{formatUSD(totalCash)}</span> cash /
              <span className="text-purple-400">{formatUSD(totalCirculation * unobtainiumPrice)}</span> assets
            </div>
          </div>

        </section>

        {/* Live Chart Section */}
        <section className="p-6 bg-[#121420] border border-gray-800 rounded-2xl">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-6">
            <div>
              <h3 className="text-base font-semibold text-white">Unobtainium Index Price Shift</h3>
              <p className="text-xs text-gray-500 mt-1">Live price adjustments driven by agent buys and dumps</p>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-gray-400 bg-[#0f111a] px-3 py-1.5 border border-gray-800 rounded-lg">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
              Price in USD ($)
            </div>
          </div>

          {/* Responsive Line/Area Chart */}
          <div className="h-[280px] w-full">
            {priceHistory.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-xs text-gray-600 font-mono">
                Awaiting first price ticker...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={priceHistory}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1f2937" opacity={0.4} />
                  <XAxis 
                    dataKey="time" 
                    stroke="#4b5563" 
                    fontSize={10} 
                    fontFamily="monospace"
                    dy={10} 
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="#4b5563" 
                    fontSize={10} 
                    fontFamily="monospace"
                    tickLine={false}
                    axisLine={false}
                    domain={['auto', 'auto']}
                    tickFormatter={(v) => `$${v.toFixed(2)}`}
                  />
                  <Tooltip
                    contentStyle={{ 
                      backgroundColor: 'rgba(15, 17, 26, 0.95)', 
                      borderColor: '#374151',
                      borderRadius: '12px',
                      color: '#f3f4f6',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                    }}
                    formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Price']}
                    labelFormatter={(label) => `Tick Time: ${label}`}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="price" 
                    stroke="#a78bfa" 
                    strokeWidth={2.5}
                    fillOpacity={1} 
                    fill="url(#priceGradient)" 
                    animationDuration={300}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* Dynamic Agent Cards Grid */}
        <section className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-white">Participating AI Agents</h3>
            <p className="text-xs text-gray-500 mt-1">Real-time balances and assets held in individual wallets</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {agents.map(agent => {
              const theme = getAgentTheme(agent.agent_id);
              const assetValue = agent.inventory * unobtainiumPrice;
              const netWorth = agent.cash_balance + assetValue;
              
              // Calculate percentage of portfolio in cash vs assets
              const cashPercentage = netWorth > 0 ? (agent.cash_balance / netWorth) * 100 : 100;
              const assetPercentage = netWorth > 0 ? (assetValue / netWorth) * 100 : 0;

              return (
                <div 
                  key={agent.agent_id} 
                  className={`p-5 bg-[#121420] border border-gray-800 rounded-2xl hover:border-gray-700 hover:scale-[1.01] transition-all duration-300 flex flex-col justify-between ${theme.glow}`}
                >
                  <div>
                    {/* Header: Bot Name and badge */}
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-2">
                        {theme.icon}
                        <h4 className="text-sm font-semibold text-white tracking-wide">{agent.name}</h4>
                        <button 
                          onClick={() => handleDecommission(agent.name)}
                          className="ml-2 px-1.5 py-0.5 text-[9px] bg-red-950 border border-red-800 text-red-300 rounded hover:bg-red-900 transition cursor-pointer"
                        >
                          Decommission
                        </button>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium ${theme.accentColor}`}>
                        {theme.badgeText}
                      </span>
                    </div>

                    <p className="text-[11px] text-gray-500 mt-2 min-h-[48px] leading-relaxed line-clamp-3" title={agent.prompt}>
                      {agent.prompt || theme.desc}
                    </p>

                    <div className="mt-5 border-t border-gray-800/80 pt-4 space-y-3">
                      {/* Cash Balance */}
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-500">Cash Balance</span>
                        <span className="font-mono text-emerald-400 font-semibold">{formatUSD(agent.cash_balance)}</span>
                      </div>

                      {/* Inventory Quantities */}
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-500">Assets Owned</span>
                        <span className="font-mono text-white">{agent.inventory} UNBT</span>
                      </div>

                      {/* Valuation */}
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-500">Asset Value</span>
                        <span className="font-mono text-purple-400">{formatUSD(assetValue)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Net worth progress details */}
                  <div className="mt-5 pt-4 border-t border-gray-850">
                    <div className="flex justify-between items-end text-xs mb-2">
                      <span className="text-gray-400 font-medium">Net Worth</span>
                      <span className="font-mono text-white font-bold text-sm">{formatUSD(netWorth)}</span>
                    </div>

                    {/* Progress Bar showing Portfolio Distribution */}
                    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden flex">
                      <div 
                        className="h-full bg-emerald-500" 
                        style={{ width: `${cashPercentage}%` }} 
                        title={`Cash: ${cashPercentage.toFixed(0)}%`}
                      />
                      <div 
                        className="h-full bg-purple-500" 
                        style={{ width: `${assetPercentage}%` }} 
                        title={`Assets: ${assetPercentage.toFixed(0)}%`}
                      />
                    </div>
                    
                    <div className="flex justify-between text-[9px] text-gray-600 font-mono mt-1">
                      <span>Cash: {cashPercentage.toFixed(0)}%</span>
                      <span>Asset: {assetPercentage.toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Bottom Section: Activity Ticker & Spawner Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Live Economy Activity Log */}
          <div className="lg:col-span-2 bg-[#121420] border border-gray-800 rounded-2xl overflow-hidden flex flex-col justify-between">
            <div className="px-5 py-4 border-b border-gray-800 bg-[#0f111a] flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-400" />
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Simulation Activity Ticker</h3>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">Real-time ledger updates</span>
            </div>

            <div className="p-4 h-[220px] overflow-y-auto font-mono text-[11px] space-y-2.5 scrollbar-thin scrollbar-thumb-gray-800">
              {activityLogs.length === 0 ? (
                <div className="text-center text-gray-600 py-10">
                  Awaiting logs from trading ticks...
                </div>
              ) : (
                activityLogs.map((log) => {
                  let textClass = 'text-gray-400';
                  let typeBadge = '';
                  
                  if (log.type === 'system') {
                    textClass = 'text-blue-400';
                    typeBadge = '[SYS]';
                  } else if (log.type === 'market') {
                    textClass = 'text-amber-400';
                    typeBadge = '[MKT]';
                  } else if (log.type === 'trade-buy') {
                    textClass = 'text-emerald-400';
                    typeBadge = '[BUY]';
                  } else if (log.type === 'trade-sell') {
                    textClass = 'text-rose-400';
                    typeBadge = '[SEL]';
                  }

                  return (
                    <div key={log.id} className="flex gap-2 items-start py-0.5 hover:bg-[#161a29]/30 rounded px-1 transition duration-150">
                      <span className="text-gray-600 select-none flex-shrink-0">[{log.timestamp}]</span>
                      <span className={`font-semibold select-none flex-shrink-0 w-10 ${textClass}`}>{typeBadge}</span>
                      <span className="text-gray-300 break-words">{log.message}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 🚀 Deploy Your Own AI Trader Widget Card */}
          <div className="bg-[#121420] border border-gray-800 rounded-2xl p-5 flex flex-col justify-between group hover:border-gray-700 transition duration-300 shadow-[0_0_20px_rgba(139,92,246,0.02)]">
            <div>
              <div className="flex items-center gap-2 pb-3 border-b border-gray-800">
                <Sparkles className="w-5 h-5 text-purple-400 animate-pulse" />
                <h3 className="text-sm font-semibold text-white tracking-wide">🚀 Deploy Your Own AI Trader</h3>
              </div>
              
              <form onSubmit={handleSpawnAgent} className="mt-4 space-y-3.5">
                <div>
                  <label htmlFor="agent-name" className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                    Agent Name
                  </label>
                  <input
                    type="text"
                    id="agent-name"
                    value={newAgentName}
                    onChange={(e) => setNewAgentName(e.target.value)}
                    placeholder="e.g., Sentiment Scalper Bot"
                    className="w-full bg-[#0c0d12] border border-gray-800 text-gray-200 placeholder-gray-600 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 transition-all font-sans"
                    maxLength={32}
                  />
                </div>

                <div>
                  <label htmlFor="agent-prompt" className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                    Trading Personality / Prompt
                  </label>
                  <textarea
                    id="agent-prompt"
                    value={newAgentPrompt}
                    onChange={(e) => setNewAgentPrompt(e.target.value)}
                    placeholder="e.g., A contrarian trader that sells when the price pumps above 12 dollars, and buys aggressively when it dips..."
                    rows={3}
                    className="w-full bg-[#0c0d12] border border-gray-800 text-gray-200 placeholder-gray-600 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 transition-all font-sans resize-none leading-relaxed"
                    maxLength={256}
                  />
                </div>

                {spawnError && (
                  <div className="text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2 font-mono">
                    ⚠️ {spawnError}
                  </div>
                )}

                {spawnSuccess && (
                  <div className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 font-mono">
                    ✓ Agent deployed successfully!
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSpawning}
                  className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:from-gray-800 disabled:to-gray-800 text-white rounded-xl py-2.5 text-xs font-semibold shadow-lg shadow-purple-900/20 hover:shadow-purple-900/30 transition duration-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSpawning ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Deploying...
                    </>
                  ) : (
                    'Deploy to Maincloud'
                  )}
                </button>
              </form>
            </div>
          </div>
        </section>

      </main>
      
      {/* Footer */}
      <footer className="mt-auto border-t border-gray-900 bg-[#07080c] py-4 px-6 text-center text-xs text-gray-600 font-mono">
        SpacetimeDB Dev Challenge Economy Dashboard • Capped at last 20 price shifts
      </footer>
    </div>
  );
}
