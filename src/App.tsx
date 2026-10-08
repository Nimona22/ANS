import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, Send, Store, Wallet, User, Check, AlertCircle, ChevronDown, 
  ArrowRightLeft, Tag, X, Shield, History, ArrowUpRight, Info, 
  Activity, Zap, CreditCard, CheckCircle2, RefreshCw, Clock, ArrowRight as ArrowRightIcon, Gift,
  Copy, LogOut
} from 'lucide-react';
import { toast } from 'sonner';
import { useReadContract } from 'wagmi';
import { arcTestnet } from 'viem/chains';
import { formatUnits, type Address } from 'viem';
import { usePasskeyAuth, type AuthState } from './hooks/usePasskeyAuth';
import { useANS, cleanName, fallbackPublicClient } from './hooks/useANS';
import { ANS_ABI, ANS_ADDRESS, REPUTATION_ABI, REPUTATION_ADDRESS, USDC_ABI, USDC_ADDRESS } from './lib/abis';

const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=PT+Serif:ital,wght@0,400;0,700;1,400&family=JetBrains+Mono:wght@400;500;700&display=swap');

  body {
    background-color: #FAFAFA;
    color: #111111;
    font-family: 'Inter', sans-serif;
    -webkit-font-smoothing: antialiased;
    margin: 0;
  }
  
  .font-serif { font-family: 'PT Serif', serif; }
  .font-mono { font-family: 'JetBrains Mono', monospace; }
  .font-sans { font-family: 'Inter', sans-serif; }

  /* Custom Scrollbar */
  ::-webkit-scrollbar { width: 8px; }
  ::-webkit-scrollbar-track { background: #FAFAFA; }
  ::-webkit-scrollbar-thumb { background: #E5E5E5; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #CCCCCC; }

  .hero-green { color: #1A863A; }
`;

const MOCK_REPUTATION: Record<string, { tier: string; txs: number; sales: number; buys: number; tips: number; since: string; disputes: number }> = {
  "alice.arc": { tier: "Elite", txs: 142, sales: 12, buys: 8, tips: 45, since: "Jan 2024", disputes: 0 },
  "vitalik.arc": { tier: "Verified", txs: 89, sales: 2, buys: 5, tips: 14, since: "Feb 2024", disputes: 0 },
  "bob.arc": { tier: "Trusted", txs: 34, sales: 1, buys: 2, tips: 5, since: "Mar 2024", disputes: 0 },
  "pro.arc": { tier: "New", txs: 4, sales: 0, buys: 1, tips: 0, since: "Sep 2024", disputes: 0 },
  "defi.arc": { tier: "Verified", txs: 67, sales: 5, buys: 10, tips: 2, since: "Dec 2023", disputes: 1 },
  "alex.arc": { tier: "Verified", txs: 14, sales: 8, buys: 4, tips: 2, since: "2026", disputes: 0 },
  "build.arc": { tier: "Trusted", txs: 28, sales: 3, buys: 4, tips: 8, since: "Apr 2025", disputes: 0 },
  "pay.arc": { tier: "Elite", txs: 310, sales: 4, buys: 20, tips: 150, since: "Jan 2023", disputes: 0 },
};

const INITIAL_MOCK_NAMES = [
  { name: "alice.arc", owner: "0x71C...9A23", expiry: Date.now() + 180 * 24 * 60 * 60 * 1000, status: 'healthy', isPrimary: true },
  { name: "bob.arc", owner: "0x71C...9A23", expiry: Date.now() + 18 * 24 * 60 * 60 * 1000, status: 'expiring', isPrimary: false },
  { name: "xyz.arc", owner: "0x71C...9A23", expiry: Date.now() - 5 * 24 * 60 * 60 * 1000, status: 'expired', isPrimary: false },
  { name: "vitalik.arc", owner: "0xd8d...045", expiry: Date.now() + 300 * 24 * 60 * 60 * 1000, status: 'healthy', isPrimary: false },
  { name: "alex.arc", owner: "0x38d...f2ed", expiry: Date.now() + 120 * 24 * 60 * 60 * 1000, status: 'healthy', isPrimary: true },
];

const INITIAL_MOCK_LISTINGS = [
  { name: "pro.arc", seller: "0x123...abc", price: 500, expiry: Date.now() + 90 * 24 * 60 * 60 * 1000 },
  { name: "defi.arc", seller: "0x456...def", price: 1200, expiry: Date.now() + 120 * 24 * 60 * 60 * 1000 },
  { name: "pay.arc", seller: "0x789...ghi", price: 250, expiry: Date.now() + 45 * 24 * 60 * 60 * 1000 },
  { name: "build.arc", seller: "0xabc...123", price: 25, expiry: Date.now() + 30 * 24 * 60 * 60 * 1000 },
];

const TIER_NAMES = ['New', 'Trusted', 'Verified', 'Elite'] as const;

const Button = ({ children, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }) => {
  const baseStyle = "font-sans font-medium px-6 py-2.5 rounded-xl transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-[#111111] text-white hover:bg-[#333333] shadow-sm",
    secondary: "bg-white border border-gray-200 text-gray-900 hover:bg-gray-50 shadow-sm",
    ghost: "bg-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-100"
  };
  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

const Card = ({ children, className = '', noPadding = false, hoverable = false, onClick }: {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
  hoverable?: boolean;
  onClick?: () => void;
}) => (
  <div 
    onClick={onClick}
    className={`border border-gray-200 bg-white rounded-2xl overflow-hidden ${hoverable ? 'hover:border-gray-300 hover:shadow-md transition-all duration-300 cursor-pointer' : 'shadow-sm'} ${noPadding ? '' : 'p-6'} ${className}`}
  >
    {children}
  </div>
);

const ReputationBadge = ({ name, showDetails = true }: { name: string; showDetails?: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const clean = cleanName(name);
  const isAddress = name.startsWith('0x') && name.length === 42;

  const { data: resolvedOwner } = useReadContract({
    address: ANS_ADDRESS,
    abi: ANS_ABI,
    functionName: 'resolve',
    args: [clean],
    chainId: arcTestnet.id,
    query: { enabled: !isAddress && clean.length >= 3 },
  });

  const targetAddress = (isAddress ? (name as Address) : resolvedOwner) as Address | undefined;

  const { data: tierNum } = useReadContract({
    address: REPUTATION_ADDRESS,
    abi: REPUTATION_ABI,
    functionName: 'getTier',
    args: targetAddress ? [targetAddress] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!targetAddress },
  });

  const { data: repRecord } = useReadContract({
    address: REPUTATION_ADDRESS,
    abi: REPUTATION_ABI,
    functionName: 'getReputation',
    args: targetAddress ? [targetAddress] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!targetAddress },
  });

  const fallback = MOCK_REPUTATION[name] || { tier: "New", txs: 0, sales: 0, buys: 0, tips: 0, since: "Just now", disputes: 0 };
  
  const rep = repRecord && targetAddress ? {
    tier: TIER_NAMES[Number(tierNum ?? 0)] ?? "New",
    txs: Number(repRecord.salesCompleted) + Number(repRecord.purchasesCompleted) + Number(repRecord.tipsGiftsGiven),
    sales: Number(repRecord.salesCompleted),
    buys: Number(repRecord.purchasesCompleted),
    tips: Number(repRecord.tipsGiftsGiven),
    since: repRecord.memberSince > 0n ? new Date(Number(repRecord.memberSince) * 1000).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : fallback.since,
    disputes: Number(repRecord.disputeFlags),
  } : fallback;
  
  const colors: Record<string, string> = {
    "New": "text-gray-600 bg-gray-100 border-gray-200",
    "Trusted": "text-[#0052FF] bg-[#0052FF]/10 border-[#0052FF]/20",
    "Verified": "text-[#1A863A] bg-[#1A863A]/10 border-[#1A863A]/20",
    "Elite": "text-[#7000FF] bg-[#7000FF]/10 border-[#7000FF]/20"
  };

  return (
    <div className="relative inline-block">
      <button 
        onClick={(e) => { e.stopPropagation(); if (showDetails) setIsOpen(!isOpen); }}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-sans font-bold uppercase tracking-wider border transition-colors ${colors[rep.tier] || colors.New} ${!showDetails && 'cursor-default'}`}
      >
        <Shield size={12} strokeWidth={2.5} />
        {rep.tier}
      </button>

      {isOpen && showDetails && (
        <div className="absolute z-50 top-full mt-2 left-0 w-64 bg-white border border-gray-200 rounded-xl p-4 shadow-xl text-sm font-sans" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-100">
            <span className="font-serif font-bold text-gray-900">{name} Stats</span>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-900"><X size={16} /></button>
          </div>
          <div className="space-y-2 text-gray-500 text-xs">
            <div className="flex justify-between"><span>Member Since</span><span className="text-gray-900 font-medium">{rep.since}</span></div>
            <div className="flex justify-between"><span>Total Transactions</span><span className="text-gray-900 font-medium">{rep.txs}</span></div>
            <div className="flex justify-between"><span>Names Bought</span><span className="text-gray-900 font-medium">{rep.buys}</span></div>
            <div className="flex justify-between"><span>Names Sold</span><span className="text-gray-900 font-medium">{rep.sales}</span></div>
            <div className="flex justify-between"><span>Tips Sent/Recv</span><span className="text-gray-900 font-medium">{rep.tips}</span></div>
            <div className="flex justify-between pt-1 mt-1 border-t border-gray-100">
              <span>Disputes</span>
              <span className={rep.disputes > 0 ? "text-red-500 font-bold" : "text-[#1A863A] font-bold"}>{rep.disputes}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const InteractiveSearch = ({ 
  navigateToProfile, 
  autoFocus = false, 
  isHero = false,
  auth,
  ans 
}: {
  navigateToProfile: (name: string) => void;
  autoFocus?: boolean;
  isHero?: boolean;
  auth: AuthState;
  ans: ReturnType<typeof useANS>;
}) => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!query) {
      setResult(null);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      const formatted = cleanName(query);
      const fullName = `${formatted}.arc`;

      if (formatted.length < 3) {
        setResult({ type: 'invalid' });
        setIsSearching(false);
        return;
      }

      try {
        const isAvail = await fallbackPublicClient.readContract({
          address: ANS_ADDRESS,
          abi: ANS_ABI,
          functionName: 'isAvailable',
          args: [formatted],
        });

        if (isAvail) {
          setResult({ type: 'available', name: fullName, length: formatted.length });
        } else {
          const listing = await fallbackPublicClient.readContract({
            address: ANS_ADDRESS,
            abi: ANS_ABI,
            functionName: 'getListing',
            args: [formatted],
          });

          if (listing && listing.active) {
            setResult({
              type: 'listed',
              data: {
                name: fullName,
                seller: listing.seller,
                price: Number(formatUnits(listing.price, 6)),
              },
            });
          } else {
            const record = await fallbackPublicClient.readContract({
              address: ANS_ADDRESS,
              abi: ANS_ABI,
              functionName: 'getNameRecord',
              args: [formatted],
            });
            setResult({
              type: 'taken',
              data: {
                name: fullName,
                owner: record.owner,
                expiry: Number(record.expiry) * 1000,
              },
            });
          }
        }
      } catch {
        const taken = INITIAL_MOCK_NAMES.find(n => n.name === fullName);
        const listed = INITIAL_MOCK_LISTINGS.find(l => l.name === fullName);

        if (listed) {
          setResult({ type: 'listed', data: listed });
        } else if (taken) {
          setResult({ type: 'taken', data: taken });
        } else {
          setResult({ type: 'available', name: fullName, length: formatted.length });
        }
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className={`w-full ${isHero ? 'max-w-2xl' : 'max-w-3xl'} mx-auto`}>
      <div className="relative mb-6">
        <div className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400">
          <Search size={24} strokeWidth={1.5} />
        </div>
        <input 
          type="text" 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a name"
          autoFocus={autoFocus}
          className={`w-full bg-white border border-gray-200 text-gray-900 font-sans font-medium py-6 pl-16 pr-24 rounded-2xl focus:outline-none focus:border-gray-400 focus:ring-4 focus:ring-gray-100 transition-all placeholder:text-gray-400 shadow-sm ${isHero ? 'text-xl' : 'text-2xl'}`}
          spellCheck="false"
        />
        <div className={`absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 font-sans font-medium pointer-events-none ${isHero ? 'text-lg' : 'text-xl'}`}>
          .arc
        </div>
      </div>

      <div className="min-h-[20px] text-left">
        {isSearching && (
          <div className="text-center text-gray-500 font-sans text-sm flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
            Searching...
          </div>
        )}
        
        {!isSearching && result?.type === 'available' && (
          <RegistrationProcess name={result.name} length={result.length} auth={auth} ans={ans} />
        )}

        {!isSearching && result?.type === 'taken' && (
          <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-2xl font-serif font-bold text-gray-900">{result.data.name}</h3>
                <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] uppercase tracking-wider font-sans font-bold rounded border border-gray-200">Registered</span>
              </div>
              <p className="text-gray-500 font-sans text-sm">
                Owner: <span className="font-mono text-gray-900">{result.data.owner}</span>
              </p>
            </div>
            <Button variant="secondary" onClick={() => navigateToProfile(result.data.name)}>
              View Profile
            </Button>
          </Card>
        )}

        {!isSearching && result?.type === 'listed' && (
          <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-blue-100 bg-blue-50/50">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-2xl font-serif font-bold text-gray-900">{result.data.name}</h3>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] uppercase tracking-wider font-sans font-bold rounded border border-blue-200">Listed for Sale</span>
              </div>
              <p className="text-gray-500 font-sans text-sm">
                Asking Price: <span className="text-gray-900 font-mono font-medium">{result.data.price} USDC</span>
              </p>
            </div>
            <Button variant="primary" onClick={() => navigateToProfile(result.data.name)}>
              View Listing
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
};

const RegistrationProcess = ({ 
  name, 
  length, 
  auth, 
  ans 
}: { 
  name: string; 
  length: number; 
  auth: AuthState; 
  ans: ReturnType<typeof useANS>; 
}) => {
  const [duration, setDuration] = useState(12);
  const [isGift, setIsGift] = useState(false);
  const [giftTarget, setGiftTarget] = useState('');
  const [txStep, setTxStep] = useState('idle');
  const [txHash, setTxHash] = useState<string | null>(null);

  const getPrice = (len: number, dur: number) => {
    let base = len === 3 ? 5 : len === 4 ? 3 : len === 5 ? 1.5 : 0.5;
    if (dur === 6) base = base * 1.8;
    if (dur === 9) base = base * 2.4;
    if (dur === 12) base = base * 3;
    return base.toFixed(2);
  };

  const price = getPrice(length, duration);

  const handleRegister = async () => {
    if (!auth.isConnected) {
      toast.info('Connecting with Passkey...');
      await auth.signIn();
      return;
    }

    try {
      setTxStep('approving');
      let hash = '';
      if (isGift) {
        if (!giftTarget) {
          toast.error('Please enter a recipient address or .arc name');
          setTxStep('idle');
          return;
        }
        setTxStep('registering');
        hash = await ans.giftName(name, duration, giftTarget, price);
      } else {
        setTxStep('registering');
        hash = await ans.register(name, duration, price);
      }
      setTxHash(hash);
      setTxStep('success');
      toast.success(`${name} registered successfully!`);
    } catch (err: any) {
      setTxStep('idle');
      toast.error(err?.message || 'Transaction failed');
    }
  };

  if (txStep === 'success') {
    return (
      <Card className="text-center py-10 border-[#1A863A]/20 bg-[#1A863A]/5 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-[#1A863A]/10 text-[#1A863A] flex items-center justify-center mx-auto mb-4">
          <Check size={24} strokeWidth={3} />
        </div>
        <h3 className="text-2xl font-serif font-bold text-gray-900 mb-2">{name} Registered</h3>
        <p className="text-gray-500 font-sans text-sm mb-6">
          {isGift ? `Successfully gifted to ${giftTarget}` : 'This identity is now secured in your wallet.'}
        </p>
        <div className="flex justify-center gap-3">
          <Button 
            variant="secondary" 
            className="font-mono text-xs"
            onClick={() => txHash && window.open(`https://explorer.testnet.arc.io/tx/${txHash}`, '_blank')}
          >
            View Tx <ArrowUpRight size={14} className="ml-1"/>
          </Button>
          <Button variant="primary" onClick={() => setTxStep('idle')} className="text-sm">Manage Name</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="shadow-md border-gray-200">
      <div className="flex items-center justify-between mb-6 pb-6 border-b border-gray-100">
        <div>
          <h2 className="text-3xl font-serif font-bold text-gray-900">{name}</h2>
          <span className="text-[#1A863A] text-xs font-sans font-bold flex items-center gap-1.5 mt-2 uppercase tracking-wider">
            <CheckCircle2 size={14} /> Available
          </span>
        </div>
        <div className="text-right bg-gray-50 p-3 rounded-xl border border-gray-100">
          <div className="text-2xl font-mono text-gray-900">{price} <span className="text-gray-500 text-sm font-sans">USDC</span></div>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-gray-500 font-sans text-[11px] font-bold uppercase tracking-wider mb-2">Registration Type</label>
          <div className="flex bg-gray-50 border border-gray-200 rounded-xl p-1">
            <button 
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors ${!isGift ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-900'}`}
              onClick={() => setIsGift(false)}
            >
              For Myself
            </button>
            <button 
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors ${isGift ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-900'}`}
              onClick={() => setIsGift(true)}
            >
              Gift to Address
            </button>
          </div>
        </div>

        {isGift && (
          <div>
            <label className="block text-gray-500 font-sans text-[11px] font-bold uppercase tracking-wider mb-2">Recipient</label>
            <input 
              type="text" 
              value={giftTarget}
              onChange={(e) => setGiftTarget(e.target.value)}
              placeholder="0x... or name.arc"
              className="w-full bg-white border border-gray-200 text-gray-900 font-mono p-3.5 rounded-xl focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 text-sm"
            />
          </div>
        )}

        <div>
          <label className="block text-gray-500 font-sans text-[11px] font-bold uppercase tracking-wider mb-2">Duration</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[3, 6, 9, 12].map(m => (
              <button 
                key={m}
                onClick={() => setDuration(m)}
                className={`py-3 rounded-xl border text-sm font-medium transition-colors ${duration === m ? 'border-gray-900 bg-gray-900 text-white shadow-sm' : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'}`}
              >
                {m} Months
              </button>
            ))}
          </div>
        </div>

        <div className="pt-4">
          <Button 
            variant="primary"
            className="w-full py-4 text-base" 
            onClick={handleRegister}
            disabled={txStep !== 'idle' || (isGift && !giftTarget)}
          >
            {txStep === 'idle' && (isGift ? 'Approve USDC & Gift' : 'Approve USDC & Register')}
            {txStep === 'approving' && 'Approving USDC...'}
            {txStep === 'registering' && 'Confirming on Arc...'}
          </Button>
          <p className="text-center text-xs text-gray-500 mt-4 font-sans flex items-center justify-center gap-1.5">
            <Shield size={14} /> Atomic on-chain transaction
          </p>
        </div>
      </div>
    </Card>
  );
};

const HomeView = ({ 
  navigateTo, 
  navigateToProfile,
  auth,
  ans 
}: { 
  navigateTo: (view: string) => void; 
  navigateToProfile: (name: string) => void;
  auth: AuthState;
  ans: ReturnType<typeof useANS>;
}) => {
  return (
    <div className="w-full bg-[#FAFAFA] relative overflow-hidden min-h-screen">
      
      {/* HERO */}
      <section className="relative px-6 pt-24 pb-32 md:pt-32 md:pb-40 max-w-7xl mx-auto z-10 text-center">
        <div className="relative z-10 flex flex-col items-center">
          <h1 className="text-6xl md:text-8xl font-serif text-gray-900 tracking-tight leading-[1.1] mb-8">
            Naming <span className="hero-green font-bold">everything</span><br/>
            on the internet
          </h1>
          
          <p className="text-lg md:text-xl text-gray-600 font-sans max-w-2xl mx-auto mb-10 leading-relaxed font-medium">
            ANS is the open naming layer for Arc, making it simple to replace complex wallet addresses with human-readable names.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button variant="primary" className="px-8 py-4 text-base w-full sm:w-auto" onClick={() => navigateTo('names')}>
              Register Your Name
            </Button>
            <Button variant="ghost" className="px-8 py-4 text-base w-full sm:w-auto text-[#1A863A] font-bold hover:bg-[#1A863A]/10 hover:text-[#1A863A]" onClick={() => document.getElementById('problem')?.scrollIntoView({behavior: 'smooth'})}>
              Learn More
            </Button>
          </div>
        </div>
      </section>

      {/* PROBLEM / EXPLANATION */}
      <section id="problem" className="px-6 py-24 bg-white border-y border-gray-200 relative z-10">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <div>
              <span className="text-[#1A863A] font-sans font-bold text-xs uppercase tracking-wider mb-2 block">The Problem</span>
              <h2 className="text-4xl md:text-5xl font-serif font-bold text-gray-900 mb-6 leading-tight">
                Hex addresses are not meant for humans.
              </h2>
              <p className="text-gray-600 text-lg mb-8 leading-relaxed font-sans font-medium">
                Sending crypto to a 42-character alphanumeric address is stressful, error-prone, and intimidating. One wrong character and your funds are lost permanently.
              </p>
              
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 mt-1">
                    <X size={14} strokeWidth={3} />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 text-base">Unreadable Addresses</h4>
                    <p className="text-gray-500 text-sm">Hard to verify, easy to spoof with clipboard malware.</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 mt-1">
                    <X size={14} strokeWidth={3} />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 text-base">High Cognitive Load</h4>
                    <p className="text-gray-500 text-sm">Triple-checking characters on every single transaction.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 p-8 rounded-3xl border border-gray-200">
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm mb-4">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2 font-sans">Without ANS</span>
                <span className="font-mono text-gray-500 text-lg">0x7a82...91Fc</span>
              </div>
              <div className="flex justify-center my-2 text-gray-400">
                <ArrowRightIcon className="rotate-90 md:rotate-0" size={20} />
              </div>
              <div className="bg-white p-6 rounded-2xl border-2 border-[#1A863A] shadow-md">
                <span className="text-xs font-bold text-[#1A863A] uppercase tracking-wider block mb-2 font-sans">With ANS</span>
                <span className="font-serif font-bold text-gray-900 text-2xl flex items-center gap-2">
                  alex.arc <CheckCircle2 size={20} className="text-[#1A863A]" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CORE FEATURES */}
      <section className="px-6 py-24 bg-[#FAFAFA] relative z-10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-[#1A863A] font-sans font-bold text-xs uppercase tracking-wider mb-2 block">Built For Arc</span>
            <h2 className="text-4xl md:text-5xl font-serif font-bold text-gray-900 mb-4">Everything you need from a name service</h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto font-sans">Native to Arc blockchain with low fees and passkey-powered security.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="bg-white">
              <User className="text-[#1A863A] mb-4" size={28} />
              <h3 className="text-xl font-serif font-bold text-gray-900 mb-3">Universal Identity</h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-6">
                Replace 0x... addresses with a recognizable .arc name you own completely.
              </p>
              <div className="p-3 bg-gray-50 rounded-xl font-mono text-xs text-gray-600 border border-gray-100">
                alex.arc &rarr; 0x7a...91Fc
              </div>
            </Card>

            <Card className="bg-white">
              <CreditCard className="text-[#1A863A] mb-4" size={28} />
              <h3 className="text-xl font-serif font-bold text-gray-900 mb-3">Send by Name</h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-6">
                Send USDC tips or payments directly to any name without copying raw hexadecimal addresses.
              </p>
              <div className="p-3 bg-gray-50 rounded-xl font-mono text-xs text-gray-600 border border-gray-100">
                send 25 USDC &rarr; bob.arc
              </div>
            </Card>

            <Card className="bg-white">
              <Shield className="text-[#1A863A] mb-4" size={28} />
              <h3 className="text-xl font-serif font-bold text-gray-900 mb-3">On-Chain Reputation</h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-6">
                Every transaction, tip, and trade builds a verifiable trust score linked to your name.
              </p>
              <div className="p-3 bg-gray-50 rounded-xl font-mono text-xs text-gray-600 border border-gray-100 flex items-center justify-between">
                <span>Score: Elite</span>
                <span className="text-[#1A863A] font-bold">100% Trust</span>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* POLICY & RULES */}
      <section className="px-6 py-24 bg-white border-y border-gray-200 relative z-10">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-serif font-bold text-gray-900 mb-4">Fair Namespace Rules</h2>
            <p className="text-gray-500 text-base max-w-xl mx-auto font-sans">Designed from the ground up to prevent squatting and maintain high utility.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card className="bg-gray-50 border-gray-200">
              <Clock className="text-gray-400 mb-4" size={24} />
              <h4 className="text-lg font-serif font-bold text-gray-900 mb-2">3 Wallet Cap</h4>
              <p className="text-gray-500 text-sm mb-4 leading-relaxed">Each wallet is strictly limited to 3 active names at any time to prevent domain hoarding.</p>
              <div className="font-mono text-xs text-gray-600 bg-white p-3 rounded-lg border border-gray-200 inline-flex items-center gap-2">
                0x7a...91Fc <ArrowRightIcon size={12}/> <span className="text-[#1A863A]">3 names</span>
              </div>
            </Card>

            <Card className="bg-gray-50 border-gray-200">
              <Gift className="text-gray-400 mb-4" size={24} />
              <h4 className="text-lg font-serif font-bold text-gray-900 mb-2">Gift Mode</h4>
              <p className="text-gray-500 text-sm mb-4 leading-relaxed">Register a name directly to a friend's address in a single transaction with no extra gas.</p>
              <div className="font-mono text-xs text-gray-600 bg-white p-3 rounded-lg border border-gray-200 inline-flex items-center gap-2">
                You <ArrowRightIcon size={12}/> alex.arc <ArrowRightIcon size={12}/> Friend
              </div>
            </Card>

            <Card className="bg-gray-50 border-gray-200">
              <ArrowRightLeft className="text-gray-400 mb-4" size={24} />
              <h4 className="text-lg font-serif font-bold text-gray-900 mb-2">Transferable Ownership</h4>
              <p className="text-gray-500 text-sm mb-4 leading-relaxed">You own the name. Transfer it securely to another wallet at any time without restrictions.</p>
            </Card>

            <Card className="bg-gray-50 border-gray-200">
              <RefreshCw className="text-gray-400 mb-4" size={24} />
              <h4 className="text-lg font-serif font-bold text-gray-900 mb-2">Renewable Names</h4>
              <p className="text-gray-500 text-sm mb-4 leading-relaxed">Keep your identity active by renewing names before they expire directly from your dashboard.</p>
            </Card>

            <Card className="bg-gray-50 border-gray-200">
              <Store className="text-gray-400 mb-4" size={24} />
              <h4 className="text-lg font-serif font-bold text-gray-900 mb-2">Buy & Sell</h4>
              <p className="text-gray-500 text-sm mb-4 leading-relaxed">Names have value. Buy premium names or list your own for sale on the built-in marketplace.</p>
            </Card>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="px-6 py-32 bg-[#FAFAFA] text-center relative z-10">
        <h2 className="text-4xl md:text-5xl font-serif font-bold text-gray-900 mb-6 tracking-tight">Ready to find your name?</h2>
        <p className="text-gray-500 font-sans text-lg mb-10 max-w-xl mx-auto">
          Search for your .arc identity and launch the application.
        </p>
        <Button variant="primary" onClick={() => navigateTo('names')} className="mx-auto px-10 py-4 text-base">Launch App</Button>
      </section>
    </div>
  );
};

const NamesAppView = ({ 
  navigateToProfile, 
  auth, 
  ans 
}: { 
  navigateToProfile: (name: string) => void;
  auth: AuthState;
  ans: ReturnType<typeof useANS>;
}) => (
  <div className="max-w-4xl mx-auto pt-16 pb-32 px-6">
    <div className="text-center mb-12">
      <h1 className="text-4xl md:text-5xl font-serif font-bold text-gray-900 mb-4">Find your .arc name</h1>
      <p className="text-gray-500 font-sans text-lg">Search for an available name or explore existing identities.</p>
    </div>
    <InteractiveSearch navigateToProfile={navigateToProfile} autoFocus auth={auth} ans={ans} />
    
    <div className="mt-16 pt-12 border-t border-gray-200">
      <h3 className="text-xl font-serif font-bold text-gray-900 mb-6">Recently Registered</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {['alex.arc', 'build.arc', 'pay.arc', 'alpha.arc'].map(s => (
          <Card key={s} hoverable className="text-center p-4" onClick={() => navigateToProfile(s)}>
            <span className="font-sans font-bold text-gray-900">{s}</span>
          </Card>
        ))}
      </div>
    </div>
  </div>
);

const MarketplaceView = ({ 
  navigateToProfile, 
  auth, 
  ans 
}: { 
  navigateToProfile: (name: string) => void;
  auth: AuthState;
  ans: ReturnType<typeof useANS>;
}) => {
  const [filter, setFilter] = useState('all');
  const [selectedListing, setSelectedListing] = useState<any>(null);
  const [txState, setTxState] = useState('idle');
  const [listings, setListings] = useState<any[]>(INITIAL_MOCK_LISTINGS);

  // Poll / load contract listings for common candidates
  useEffect(() => {
    let cancelled = false;
    async function loadContractListings() {
      const candidates = ['pro', 'defi', 'pay', 'build', 'alex', 'vitalik', 'alpha'];
      const activeList: any[] = [];

      for (const cand of candidates) {
        try {
          const l = await fallbackPublicClient.readContract({
            address: ANS_ADDRESS,
            abi: ANS_ABI,
            functionName: 'getListing',
            args: [cand],
          });
          if (l && l.active) {
            activeList.push({
              name: `${cand}.arc`,
              seller: l.seller,
              price: Number(formatUnits(l.price, 6)),
              expiry: Date.now() + 90 * 24 * 60 * 60 * 1000,
            });
          }
        } catch {
          // ignore individual lookup error
        }
      }

      if (!cancelled && activeList.length > 0) {
        // Merge on-chain with mock fallback
        const merged = [...activeList];
        for (const mock of INITIAL_MOCK_LISTINGS) {
          if (!merged.some(m => m.name === mock.name)) {
            merged.push(mock);
          }
        }
        setListings(merged);
      }
    }

    loadContractListings();
    return () => { cancelled = true; };
  }, []);

  const filtered = listings.filter(l => {
    const len = l.name.replace('.arc', '').length;
    if (filter === '3') return len === 3;
    if (filter === '4') return len === 4;
    if (filter === '5+') return len >= 5;
    return true;
  });

  const handleBuy = async (listingItem: any) => {
    if (!auth.isConnected) {
      toast.info('Connecting with Passkey...');
      await auth.signIn();
      return;
    }

    try {
      setTxState('approving');
      const hash = await ans.buyName(listingItem.name, listingItem.price.toString());
      setTxState('success');
      toast.success(`Purchased ${listingItem.name} successfully! Tx: ${hash.slice(0, 10)}...`);
    } catch (err: any) {
      setTxState('idle');
      toast.error(err?.message || 'Purchase failed');
    }
  };

  const calculateFees = (price: number) => {
    const p = price;
    const fee = p * 0.025;
    return {
      price: p.toFixed(2),
      fee: fee.toFixed(2),
      total: (p + fee).toFixed(2),
      sellerReceives: (p - fee).toFixed(2)
    };
  };

  return (
    <div className="max-w-7xl mx-auto pt-16 pb-32 px-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6 border-b border-gray-200 pb-8">
        <div>
          <h1 className="text-4xl font-serif font-bold text-gray-900 mb-3">Marketplace</h1>
          <p className="text-gray-500 font-sans text-lg">Discover and collect premium identities.</p>
        </div>
        <div className="flex bg-gray-50 border border-gray-200 rounded-xl p-1">
          {['all', '3', '4', '5+'].map(f => (
            <button 
              key={f}
              className={`px-5 py-2 text-sm font-bold rounded-lg transition-colors ${filter === f ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-900'}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All Names' : `${f} Letters`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filtered.map(listing => (
          <Card key={listing.name} className="flex flex-col">
            <div className="flex justify-between items-start mb-10">
              <h3 className="text-2xl font-serif font-bold text-gray-900 cursor-pointer hover:text-[#1A863A]" onClick={() => navigateToProfile(listing.name)}>{listing.name}</h3>
              <ReputationBadge name={listing.name} showDetails={false} />
            </div>
            <div className="mb-8">
              <p className="text-gray-400 text-[10px] font-sans font-bold uppercase tracking-wider mb-2">Asking Price</p>
              <p className="text-2xl font-mono text-gray-900 font-bold">{listing.price} <span className="text-sm font-sans text-gray-500 font-medium">USDC</span></p>
            </div>
            
            {selectedListing?.name === listing.name ? (
              <div className="mt-auto border-t border-gray-100 pt-5 bg-gray-50 -mx-6 -mb-6 p-6 rounded-b-2xl">
                {txState === 'success' ? (
                  <div className="text-center py-6 text-[#1A863A] font-sans font-bold text-sm flex flex-col items-center justify-center gap-3">
                    <CheckCircle2 size={24} strokeWidth={2.5} /> Purchase Complete
                  </div>
                ) : (
                  <>
                    <div className="space-y-3 mb-6 text-xs font-mono text-gray-500">
                      <div className="flex justify-between">
                        <span>Item Price</span>
                        <span className="text-gray-900">{calculateFees(listing.price).price} USDC</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Protocol Fee (2.5%)</span>
                        <span className="text-gray-900">{calculateFees(listing.price).fee} USDC</span>
                      </div>
                      <div className="flex justify-between text-gray-900 pt-3 border-t border-gray-200 text-sm font-bold">
                        <span>Total You Pay</span>
                        <span>{calculateFees(listing.price).total} USDC</span>
                      </div>
                      <div className="text-[10px] text-gray-500 font-sans mt-3 flex items-start gap-1.5 bg-white p-2.5 rounded border border-gray-200">
                        <Info size={12} className="shrink-0 mt-0.5 text-[#1A863A]" />
                        <span>Seller receives {calculateFees(listing.price).sellerReceives} USDC. Escrow guarantees atomic transfer.</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" className="px-3" onClick={() => {setSelectedListing(null); setTxState('idle');}}>
                        <X size={16} />
                      </Button>
                      <Button variant="primary" className="flex-1 text-sm" onClick={() => handleBuy(listing)} disabled={txState !== 'idle'}>
                        {txState === 'idle' ? 'Confirm Buy' : txState === 'approving' ? 'Approving...' : 'Purchasing...'}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="mt-auto pt-5 border-t border-gray-100">
                <Button variant="secondary" className="w-full text-sm py-2.5" onClick={() => setSelectedListing(listing)}>
                  Buy Name
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
};

const MyNamesView = ({ 
  isConnected, 
  connectWallet,
  auth,
  ans,
  balance,
}: { 
  isConnected: boolean; 
  connectWallet: () => void;
  auth: AuthState;
  ans: ReturnType<typeof useANS>;
  balance?: string;
}) => {
  if (!isConnected || !auth.address) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center px-6">
        <div className="w-20 h-20 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center mb-8 text-gray-400 shadow-sm">
          <Wallet size={32} strokeWidth={1.5} />
        </div>
        <h2 className="text-3xl font-serif font-bold text-gray-900 mb-4">Sign In Required</h2>
        <p className="text-gray-500 font-sans text-lg max-w-md mx-auto mb-10 leading-relaxed">Connect your wallet to manage your .arc identities, renew registrations, or list names for sale.</p>
        <Button variant="primary" onClick={connectWallet} className="px-8 py-3.5 text-base">Connect Wallet</Button>
      </div>
    );
  }

  const { data: rawOwnedNames, refetch: refetchOwned } = useReadContract({
    address: ANS_ADDRESS,
    abi: ANS_ABI,
    functionName: 'getNamesByOwner',
    args: [auth.address as Address],
    chainId: arcTestnet.id,
    query: { enabled: !!auth.address },
  });

  const { data: primaryName } = useReadContract({
    address: ANS_ADDRESS,
    abi: ANS_ABI,
    functionName: 'reverseLookup',
    args: [auth.address as Address],
    chainId: arcTestnet.id,
    query: { enabled: !!auth.address },
  });

  const [namesList, setNamesList] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    async function loadDetails() {
      const owned = (rawOwnedNames as string[] | undefined) || [];
      if (owned.length === 0) {
        // If wallet has no registered names yet, show fallback mock for preview if address is mock
        const mockMatch = INITIAL_MOCK_NAMES.filter(n => n.owner === auth.address);
        if (active) setNamesList(mockMatch);
        return;
      }

      const records = await Promise.all(
        owned.map(async (n) => {
          try {
            const clean = cleanName(n);
            const rec = await fallbackPublicClient.readContract({
              address: ANS_ADDRESS,
              abi: ANS_ABI,
              functionName: 'getNameRecord',
              args: [clean],
            });
            const expiryMs = Number(rec.expiry) * 1000;
            const now = Date.now();
            const daysLeft = (expiryMs - now) / (1000 * 60 * 60 * 24);
            const status = daysLeft < 0 ? 'expired' : daysLeft <= 30 ? 'expiring' : 'healthy';

            return {
              name: `${clean}.arc`,
              owner: rec.owner,
              expiry: expiryMs,
              status,
              isPrimary: primaryName ? cleanName(primaryName) === clean : false,
            };
          } catch {
            return {
              name: `${n}.arc`,
              owner: auth.address,
              expiry: Date.now() + 180 * 24 * 60 * 60 * 1000,
              status: 'healthy',
              isPrimary: false,
            };
          }
        })
      );

      if (active) setNamesList(records);
    }

    loadDetails();
    return () => { active = false; };
  }, [rawOwnedNames, primaryName, auth.address]);

  const usedCount = namesList.length;

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === 'healthy') return <span className="px-2.5 py-1 bg-[#1A863A]/10 text-[#1A863A] border border-[#1A863A]/20 rounded-full text-[10px] font-sans font-bold uppercase tracking-wider">Active</span>;
    if (status === 'expiring') return <span className="px-2.5 py-1 bg-amber-100 text-amber-700 border border-amber-200 rounded-full text-[10px] font-sans font-bold uppercase tracking-wider flex items-center gap-1"><AlertCircle size={10}/> Expiring</span>;
    return <span className="px-2.5 py-1 bg-red-50 text-red-600 border border-red-200 rounded-full text-[10px] font-sans font-bold uppercase tracking-wider">Expired</span>;
  };

  const handleRenew = async (name: string) => {
    try {
      toast.info(`Renewing ${name}...`);
      await ans.renew(name, 12, '1.5');
      toast.success(`${name} renewed!`);
      refetchOwned();
    } catch (e: any) {
      toast.error(e?.message || 'Renew failed');
    }
  };

  const handleTransfer = async (name: string) => {
    const to = window.prompt(`Transfer ${name} to address or .arc name:`);
    if (!to) return;
    try {
      toast.info(`Transferring ${name}...`);
      await ans.transferName(name, to);
      toast.success(`${name} transferred to ${to}!`);
      refetchOwned();
    } catch (e: any) {
      toast.error(e?.message || 'Transfer failed');
    }
  };

  const handleListForSale = async (name: string) => {
    const priceStr = window.prompt(`Set listing price for ${name} (in USDC):`, '50');
    if (!priceStr) return;
    try {
      toast.info(`Listing ${name} for ${priceStr} USDC...`);
      await ans.listForSale(name, priceStr);
      toast.success(`${name} listed for sale!`);
      refetchOwned();
    } catch (e: any) {
      toast.error(e?.message || 'Listing failed');
    }
  };

  return (
    <div className="max-w-5xl mx-auto pt-16 pb-32 px-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-10 border-b border-gray-200 pb-8 gap-6">
        <div>
          <h1 className="text-4xl font-serif font-bold text-gray-900 mb-3">My Names</h1>
          <p className="text-gray-500 font-sans text-lg">Manage your identity portfolio.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {balance !== undefined && (
            <div className="bg-white px-5 py-3 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-gray-400 text-[10px] font-sans font-bold uppercase tracking-wider mb-1">Balance</p>
              <p className="text-2xl font-mono text-[#1A863A] font-bold">{balance} <span className="text-gray-500 text-sm font-sans font-medium">USDC</span></p>
            </div>
          )}
          <div className="text-left sm:text-right bg-white px-5 py-3 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-gray-400 text-[10px] font-sans font-bold uppercase tracking-wider mb-1">Capacity</p>
            <p className="text-2xl font-mono text-gray-900 font-bold">{usedCount} <span className="text-gray-500 text-base font-sans font-medium">/ 3 Used</span></p>
          </div>
        </div>
      </div>

      {auth.address && (
        <div className="mb-8 p-4 sm:p-5 bg-white border border-gray-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-600 shrink-0">
              <Wallet size={20} />
            </div>
            <div>
              <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-gray-400">Connected Wallet</p>
              <p className="font-mono text-xs sm:text-sm font-semibold text-gray-900 break-all">{auth.address}</p>
            </div>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(auth.address!);
              toast.success('Address copied to clipboard!');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-200 rounded-xl font-sans text-xs font-semibold transition-all shadow-sm active:scale-95 shrink-0"
          >
            <Copy size={13} className="text-gray-500" />
            <span>Copy Address</span>
          </button>
        </div>
      )}

      <div className="space-y-4">
        {namesList.map(nameItem => (
          <Card key={nameItem.name} hoverable className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative overflow-visible">
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-900 font-serif font-bold text-2xl shadow-sm">
                {nameItem.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-2xl font-serif font-bold text-gray-900 flex items-center gap-2">
                    {nameItem.name}
                    {nameItem.isPrimary && <span className="text-[#0052FF] text-[9px] font-sans font-bold px-2 py-0.5 border border-[#0052FF]/20 bg-[#0052FF]/10 rounded-full uppercase tracking-wider">Primary</span>}
                  </h3>
                  <StatusBadge status={nameItem.status} />
                </div>
                <p className="text-gray-500 text-xs font-mono flex items-center gap-2 mb-1">
                  Owner: {auth.address ? `${auth.address.slice(0, 8)}...${auth.address.slice(-6)}` : ''}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (auth.address) {
                        navigator.clipboard.writeText(auth.address);
                        toast.success('Address copied to clipboard!');
                      }
                    }}
                    title="Copy owner address"
                    className="p-1 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                  >
                    <Copy size={12} />
                  </button>
                </p>
                <p className="text-gray-500 text-xs font-mono flex items-center gap-2">
                  Expires: {new Date(nameItem.expiry).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto mt-2 sm:mt-0 pt-5 sm:pt-0 border-t border-gray-100 sm:border-0">
              {(nameItem.status === 'expiring' || nameItem.status === 'expired') && (
                <Button variant="primary" className="flex-1 sm:flex-none py-2.5 text-sm" onClick={() => handleRenew(nameItem.name)}>
                  Renew
                </Button>
              )}
              
              <div className="relative group flex-1 sm:flex-none">
                <Button variant="secondary" className="w-full sm:w-auto px-4 py-2.5 text-sm flex items-center justify-center gap-2">
                  Manage <ChevronDown size={14} />
                </Button>
                <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 py-1.5 overflow-hidden">
                  {!nameItem.isPrimary && <button className="w-full text-left px-5 py-3 text-sm text-gray-700 hover:bg-gray-50 font-sans transition-colors flex items-center gap-3 font-medium"><User size={16} className="text-gray-400"/> Set as Primary</button>}
                  <button onClick={() => handleRenew(nameItem.name)} className="w-full text-left px-5 py-3 text-sm text-gray-700 hover:bg-gray-50 font-sans transition-colors flex items-center gap-3 font-medium"><RefreshCw size={16} className="text-gray-400"/> Renew Name</button>
                  <button onClick={() => handleTransfer(nameItem.name)} className="w-full text-left px-5 py-3 text-sm text-gray-700 hover:bg-gray-50 font-sans transition-colors flex items-center gap-3 font-medium"><ArrowRightLeft size={16} className="text-gray-400"/> Transfer Name</button>
                  <button onClick={() => handleListForSale(nameItem.name)} className="w-full text-left px-5 py-3 text-sm text-gray-700 hover:bg-gray-50 font-sans transition-colors flex items-center gap-3 font-medium"><Tag size={16} className="text-gray-400"/> List for Sale</button>
                </div>
              </div>
            </div>
          </Card>
        ))}

        {namesList.length === 0 && (
          <Card className="text-center py-12 text-gray-500">
            <p className="text-base font-sans font-medium mb-4">You have not registered any .arc names yet.</p>
            <Button variant="primary" onClick={connectWallet} className="mx-auto text-sm">
              Register a Name
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
};

const SendView = ({ 
  isConnected, 
  connectWallet,
  auth,
  ans,
  balance,
}: { 
  isConnected: boolean; 
  connectWallet: () => void;
  auth: AuthState;
  ans: ReturnType<typeof useANS>;
  balance?: string;
}) => {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [step, setStep] = useState('edit'); 
  const [txStatus, setTxStatus] = useState('idle');
  const [txHash, setTxHash] = useState<string | null>(null);

  const cleanRecip = cleanName(recipient);
  const isArcName = recipient.trim().toLowerCase().endsWith('.arc');

  const { data: onchainResolved } = useReadContract({
    address: ANS_ADDRESS,
    abi: ANS_ABI,
    functionName: 'resolve',
    args: [cleanRecip],
    chainId: arcTestnet.id,
    query: { enabled: isArcName && cleanRecip.length >= 3 },
  });

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center px-6">
        <div className="w-20 h-20 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center mb-8 text-gray-400 shadow-sm">
          <Send size={32} strokeWidth={1.5} />
        </div>
        <h2 className="text-3xl font-serif font-bold text-gray-900 mb-4">Sign In Required</h2>
        <p className="text-gray-500 font-sans text-lg max-w-md mx-auto mb-10 leading-relaxed">Connect your wallet to send USDC payments seamlessly using .arc names.</p>
        <Button variant="primary" onClick={connectWallet} className="px-8 py-3.5 text-base">Connect Wallet</Button>
      </div>
    );
  }

  const isResolved = isArcName && (!!onchainResolved || recipient.length > 4);
  const resolvedAddress = (onchainResolved as string | undefined) || (isResolved ? "0x3f5...8b91" : null);

  const handleReview = () => {
    if (!recipient || !amount) return;
    setStep('preview');
  };

  const handleConfirm = async () => {
    try {
      setTxStatus('signing');
      const hash = await ans.sendTip(recipient, amount, note);
      setTxHash(hash);
      setTxStatus('confirming');
      setStep('success');
      toast.success('Payment sent successfully!');
    } catch (err: any) {
      setTxStatus('idle');
      toast.error(err?.message || 'Payment failed');
    }
  };

  if (step === 'success') {
    return (
      <div className="max-w-lg mx-auto pt-20 px-6 pb-32">
        <Card className="text-center py-12 border-[#1A863A]/20 bg-[#1A863A]/5 shadow-md">
          <div className="w-16 h-16 rounded-full bg-[#1A863A]/10 text-[#1A863A] flex items-center justify-center mx-auto mb-6">
            <Check size={32} strokeWidth={2.5} />
          </div>
          <h3 className="text-3xl font-serif font-bold text-gray-900 mb-2">Payment Sent</h3>
          <p className="text-gray-500 font-sans mb-10 text-base">
            Successfully sent <span className="font-mono text-gray-900 font-bold">{amount} USDC</span> to {recipient}.
          </p>
          <div className="flex flex-col gap-3">
            {txHash && (
              <Button 
                variant="secondary" 
                className="w-full py-3 text-xs font-mono"
                onClick={() => window.open(`https://explorer.testnet.arc.io/tx/${txHash}`, '_blank')}
              >
                View on Arcscan <ArrowUpRight size={14} className="ml-1"/>
              </Button>
            )}
            <Button variant="primary" onClick={() => { setStep('edit'); setRecipient(''); setAmount(''); setNote(''); setTxStatus('idle'); }} className="w-full py-3.5">
              Send Another Payment
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pt-16 pb-32 px-6">
      <div className="mb-10 border-b border-gray-200 pb-8">
        <h1 className="text-4xl font-serif font-bold text-gray-900 mb-3">Send Payment</h1>
        <p className="text-gray-500 font-sans text-lg">Send USDC securely using .arc names instead of addresses.</p>
      </div>

      <Card className="shadow-md border-gray-200">
        {step === 'edit' ? (
          <div className="space-y-8">
            <div>
              <label className="block text-gray-500 font-sans text-[11px] font-bold uppercase tracking-wider mb-2">To</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="name.arc or 0x..."
                  className="w-full bg-gray-50 border border-gray-200 text-gray-900 font-sans font-medium text-xl p-4 pl-5 rounded-xl focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-colors"
                />
                {isResolved && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-sm bg-white px-2.5 py-1.5 rounded-lg border border-gray-200 shadow-sm">
                    <span className="font-mono text-gray-500 text-xs">
                      {resolvedAddress?.startsWith('0x') && resolvedAddress.length === 42 ? `${resolvedAddress.slice(0, 6)}...${resolvedAddress.slice(-4)}` : resolvedAddress}
                    </span>
                    <CheckCircle2 size={16} className="text-[#1A863A]" />
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-gray-500 font-sans text-[11px] font-bold uppercase tracking-wider">Amount (USDC)</label>
                {balance !== undefined && (
                  <span className="text-xs font-mono text-gray-500">
                    Balance: <span className="font-bold text-gray-800">{balance} USDC</span>
                  </span>
                )}
              </div>
              <input 
                type="number" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 font-mono text-3xl p-4 pl-5 rounded-xl focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-colors mb-4"
              />
              <div className="flex gap-2">
                {[5, 10, 25, 50, 100].map(amt => (
                  <button 
                    key={amt}
                    onClick={() => setAmount(amt.toString())}
                    className="flex-1 py-2 text-sm font-mono font-bold border border-gray-200 rounded-lg text-gray-600 hover:border-gray-400 hover:text-gray-900 transition-colors bg-white shadow-sm"
                  >
                    {amt}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-gray-500 font-sans text-[11px] font-bold uppercase tracking-wider mb-2">Public Note (Optional)</label>
              <input 
                type="text" 
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What is this for?"
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 font-sans p-4 pl-5 rounded-xl focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-colors text-sm"
                maxLength={60}
              />
            </div>

            <div className="pt-6 border-t border-gray-100">
              <Button 
                variant="primary"
                className="w-full py-4 text-base" 
                onClick={handleReview}
                disabled={!recipient || !amount}
              >
                Review Transaction
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <h3 className="text-gray-900 font-serif font-bold text-xl mb-4 border-b border-gray-100 pb-4 flex items-center gap-2"><CreditCard size={20} className="text-gray-400"/> Transaction Preview</h3>
            
            <div className="space-y-6 font-sans">
              <div className="flex flex-col gap-2">
                <span className="text-gray-500 text-[11px] font-bold uppercase tracking-wider">Recipient</span>
                <div className="bg-gray-50 border border-gray-200 p-5 rounded-xl flex justify-between items-center">
                  <div>
                    <div className="text-gray-900 font-serif font-bold text-2xl mb-1">{recipient}</div>
                    {isResolved && <div className="text-gray-500 font-mono text-sm">{resolvedAddress}</div>}
                  </div>
                  {isResolved && <ReputationBadge name={recipient} showDetails={false} />}
                </div>
              </div>
              
              <div className="flex justify-between items-end py-6 border-y border-gray-100">
                <span className="text-gray-500 text-[11px] font-bold uppercase tracking-wider mb-1.5">Amount</span>
                <span className="text-5xl font-mono text-gray-900 tracking-tight font-bold">{amount} <span className="text-xl text-gray-400 font-sans font-medium">USDC</span></span>
              </div>

              {note && (
                <div className="flex flex-col gap-2">
                  <span className="text-gray-500 text-[11px] font-bold uppercase tracking-wider">Note (Public on-chain)</span>
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900 text-sm font-medium">"{note}"</div>
                </div>
              )}
            </div>

            <div className="flex gap-4 pt-6">
              <Button variant="secondary" onClick={() => setStep('edit')} disabled={txStatus !== 'idle'} className="px-6">
                Back
              </Button>
              <Button variant="primary" className="flex-1 py-4 text-base" onClick={handleConfirm} disabled={txStatus !== 'idle'}>
                {txStatus === 'idle' && 'Confirm & Sign'}
                {txStatus === 'signing' && 'Awaiting Signature...'}
                {txStatus === 'confirming' && 'Confirming on Arc...'}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

const NameProfileView = ({ 
  name, 
  navigateTo 
}: { 
  name: string; 
  navigateTo: (view: string) => void;
}) => {
  const clean = cleanName(name);

  const { data: record } = useReadContract({
    address: ANS_ADDRESS,
    abi: ANS_ABI,
    functionName: 'getNameRecord',
    args: [clean],
    chainId: arcTestnet.id,
  });

  const { data: listing } = useReadContract({
    address: ANS_ADDRESS,
    abi: ANS_ABI,
    functionName: 'getListing',
    args: [clean],
    chainId: arcTestnet.id,
  });

  const mockListing = INITIAL_MOCK_LISTINGS.find(l => l.name === name);
  const mockName = INITIAL_MOCK_NAMES.find(n => n.name === name);

  const hasOnchainOwner = record && record.owner !== '0x0000000000000000000000000000000000000000';
  const isRegistered = hasOnchainOwner || (listing && listing.active) || !!mockName || !!mockListing;

  const ownerStr = (listing && listing.active ? listing.seller : hasOnchainOwner ? record.owner : mockListing ? mockListing.seller : mockName?.owner || "0x71C...9A23") as string;
  const listingPrice = listing && listing.active ? Number(formatUnits(listing.price, 6)) : mockListing ? mockListing.price : null;

  if (!isRegistered) {
    return (
      <div className="max-w-2xl mx-auto pt-32 px-6 text-center pb-32">
        <h1 className="text-4xl font-serif font-bold text-gray-900 mb-4">{name} is not registered.</h1>
        <p className="text-gray-500 font-sans text-lg mb-10">This identity is available on Arc.</p>
        <Button variant="primary" onClick={() => navigateTo('names')} className="mx-auto px-10 py-3.5">Register Now</Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pt-16 pb-32 px-6">
      <Card noPadding className="overflow-hidden shadow-lg border-gray-200">
        <div className="bg-white p-8 md:p-12 border-b border-gray-100 flex flex-col md:flex-row items-start md:items-end justify-between gap-8 relative overflow-hidden">
          
          <div className="z-10 w-full">
            <h1 className="text-5xl md:text-6xl font-serif font-bold text-gray-900 mb-6 flex flex-col sm:flex-row sm:items-center gap-4 tracking-tight">
              {name}
              <div className="self-start sm:self-auto mt-2 sm:mt-0"><ReputationBadge name={name} /></div>
            </h1>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-8 text-gray-500 font-mono text-sm">
              <span className="flex items-center gap-2"><span className="text-gray-400 font-sans text-[10px] font-bold uppercase tracking-wider">Owner</span> {ownerStr}</span>
              <a 
                href={`https://explorer.testnet.arc.io/address/${ownerStr}`} 
                target="_blank" 
                rel="noreferrer" 
                className="flex items-center gap-1.5 hover:text-gray-900 transition-colors"
              >
                <ArrowUpRight size={14}/> View on Arcscan
              </a>
            </div>
          </div>
          
          <div className="flex flex-col gap-3 w-full md:w-auto z-10 shrink-0">
            <Button variant="primary" onClick={() => navigateTo('send')} className="w-full md:w-auto py-3.5 text-base">
              Send Payment
            </Button>
            {listingPrice !== null && (
              <Button variant="secondary" onClick={() => navigateTo('marketplace')} className="w-full md:w-auto py-3.5 text-base border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100">
                Buy for {listingPrice} USDC
              </Button>
            )}
          </div>
        </div>

        <div className="p-8 md:p-12 bg-gray-50">
          <h3 className="text-xl font-serif font-bold text-gray-900 mb-8 flex items-center gap-3">
            <History size={20} className="text-gray-400" /> Activity History
          </h3>
          
          <div className="space-y-2">
            {[
              { action: "Received Tip", amount: "50 USDC", from: "bob.arc", time: "2 days ago" },
              { action: "Bought Name", amount: "120 USDC", from: "Marketplace", time: "1 month ago" },
              { action: "Registered Name", amount: "-", from: "Arc Protocol", time: "6 months ago" },
            ].map((tx, i) => (
              <div key={i} className="flex flex-col sm:flex-row justify-between sm:items-center py-5 border-b border-gray-200 last:border-0 gap-4 hover:bg-white -mx-4 px-4 rounded-xl transition-colors">
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-400 shadow-sm">
                    <ArrowRightLeft size={18} />
                  </div>
                  <div>
                    <p className="text-gray-900 font-sans font-bold">{tx.action}</p>
                    <p className="text-gray-500 font-mono text-xs mt-1">{tx.from}</p>
                  </div>
                </div>
                <div className="sm:text-right">
                  <p className="text-gray-900 font-mono font-bold text-base">{tx.amount}</p>
                  <p className="text-gray-500 font-sans text-xs mt-1">{tx.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
};

export default function App() {
  const [currentView, setCurrentView] = useState('home');
  const [profileTarget, setProfileTarget] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);

  const auth = usePasskeyAuth();
  const ans = useANS(auth.credential);

  // Wagmi contract read for live USDC balance
  const { data: usdcBalanceRaw } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: auth.address ? [auth.address as Address] : undefined,
    chainId: arcTestnet.id,
    query: {
      enabled: !!auth.address,
      refetchInterval: 5000,
    },
  });

  // Direct RPC fallback to ensure balance always loads accurately
  const [fallbackBalance, setFallbackBalance] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.address) {
      setFallbackBalance(null);
      return;
    }
    let active = true;
    const fetchBal = async () => {
      try {
        const bal = await fallbackPublicClient.readContract({
          address: USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: 'balanceOf',
          args: [auth.address as Address],
        });
        if (active) {
          setFallbackBalance(formatUnits(bal, 6));
        }
      } catch (err) {
        console.warn('Balance fetch note:', err);
      }
    };
    fetchBal();
    const timer = setInterval(fetchBal, 6000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [auth.address]);

  const formattedBalance = useMemo(() => {
    if (usdcBalanceRaw !== undefined && usdcBalanceRaw !== null) {
      const val = Number(formatUnits(usdcBalanceRaw, 6));
      return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (fallbackBalance !== null) {
      const val = Number(fallbackBalance);
      return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return '0.00';
  }, [usdcBalanceRaw, fallbackBalance]);

  const handleCopyAddress = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!auth.address) return;
    navigator.clipboard.writeText(auth.address);
    setCopiedAddress(true);
    toast.success('Address copied to clipboard!');
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  const navigateTo = (view: string, data: string | null = null) => {
    if (view === 'profile') setProfileTarget(data);
    setCurrentView(view);
    window.scrollTo(0, 0);
  };

  const navItems = [
    { id: 'names', label: 'Names', icon: Search },
    { id: 'send', label: 'Send', icon: Send },
    { id: 'marketplace', label: 'Marketplace', icon: Store },
    { id: 'mynames', label: 'My Names', icon: User },
  ];

  return (
    <div className="min-h-screen flex flex-col selection:bg-[#1A863A]/20 text-gray-900 font-sans bg-[#FAFAFA]">
      <style>{globalStyles}</style>

      {currentView === 'home' ? (
        <header className="flex items-center justify-between px-6 md:px-10 h-20 border-b border-gray-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
          <div className="flex items-center gap-8">
            <div 
              className="text-[#111] font-serif font-bold text-2xl tracking-tight cursor-pointer flex items-center gap-2"
              onClick={() => navigateTo('home')}
            >
              <div className="text-[#1A863A]">&lt;&gt;</div>
              ANS
            </div>
          </div>
          <div className="flex items-center gap-3">
            {auth.isConnected && auth.address ? (
              <>
                <div 
                  className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-sans font-medium text-gray-800 shadow-sm"
                  title="Your USDC balance"
                >
                  <CreditCard size={14} className="text-[#1A863A]" />
                  <span className="font-mono font-bold text-gray-900">{formattedBalance}</span>
                  <span className="text-gray-500 font-semibold text-[11px]">USDC</span>
                </div>
                <button
                  onClick={handleCopyAddress}
                  title="Click to copy your address"
                  className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-800 border border-gray-200 hover:border-gray-300 rounded-xl font-mono text-xs font-semibold transition-all shadow-sm active:scale-95"
                >
                  {copiedAddress ? (
                    <>
                      <Check size={13} className="text-[#1A863A]" />
                      <span className="text-[#1A863A] font-sans font-medium text-xs">Copied!</span>
                    </>
                  ) : (
                    <>
                      <span>{auth.address.slice(0, 6)}...{auth.address.slice(-4)}</span>
                      <Copy size={13} className="text-gray-400" />
                    </>
                  )}
                </button>
                <button
                  onClick={() => auth.signOut()}
                  title="Sign out"
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 border border-gray-200 hover:border-red-200 rounded-xl transition-colors shadow-sm"
                >
                  <LogOut size={15} />
                </button>
              </>
            ) : null}
            <Button variant="primary" onClick={() => navigateTo('names')} className="font-sans font-bold text-sm px-6">
              Launch App
            </Button>
          </div>
        </header>
      ) : (
        <header className="flex items-center justify-between px-4 sm:px-8 h-20 border-b border-gray-200 bg-white sticky top-0 z-50 shadow-sm">
          <div className="flex items-center gap-6 md:gap-12">
            <div 
              className="text-[#111] font-serif font-bold text-2xl tracking-tight cursor-pointer flex items-center gap-2 shrink-0"
              onClick={() => navigateTo('home')}
            >
              <div className="text-[#1A863A]">&lt;&gt;</div>
              ANS
            </div>
            <nav className="hidden md:flex items-center gap-2">
              {navItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => navigateTo(item.id)}
                  className={`px-4 py-2.5 rounded-xl font-sans text-sm font-semibold transition-colors ${currentView === item.id ? 'text-gray-900 bg-gray-100 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden lg:flex items-center gap-2 text-gray-500 text-xs font-sans font-medium px-3 py-1.5 border border-gray-200 rounded-full bg-gray-50">
              <div className="w-2 h-2 rounded-full bg-[#1A863A]"></div>
              Arc Network
            </div>
            
            {auth.isConnected && auth.address ? (
              <>
                {/* Balance Display */}
                <div 
                  className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-sans font-medium text-gray-800 shadow-sm cursor-default"
                  title="Your USDC balance on Arc Testnet"
                >
                  <CreditCard size={14} className="text-[#1A863A] shrink-0" />
                  <span className="font-mono font-bold text-gray-900">{formattedBalance}</span>
                  <span className="text-gray-500 text-[11px] font-semibold">USDC</span>
                </div>

                {/* Copy Address Button */}
                <button
                  onClick={handleCopyAddress}
                  title="Click to copy your address"
                  className="flex items-center gap-2 px-3 sm:px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-800 border border-gray-200 hover:border-gray-300 rounded-xl font-mono text-xs font-semibold transition-all shadow-sm group active:scale-95"
                >
                  {copiedAddress ? (
                    <>
                      <Check size={14} className="text-[#1A863A] shrink-0" />
                      <span className="text-[#1A863A] font-sans font-medium">Copied!</span>
                    </>
                  ) : (
                    <>
                      <span>{auth.address.slice(0, 6)}...{auth.address.slice(-4)}</span>
                      <Copy size={13} className="text-gray-400 group-hover:text-gray-700 transition-colors shrink-0" />
                    </>
                  )}
                </button>

                {/* Sign Out Button */}
                <button
                  onClick={() => auth.signOut()}
                  title="Sign out"
                  className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 border border-gray-200 hover:border-red-200 rounded-xl transition-colors shadow-sm shrink-0"
                >
                  <LogOut size={16} />
                </button>
              </>
            ) : (
              <Button 
                variant="primary"
                onClick={() => auth.signIn()}
                className="font-mono text-sm h-10 px-6"
                disabled={auth.isLoading}
              >
                {auth.isLoading ? (
                  <span className="flex items-center gap-2">Connecting...</span>
                ) : (
                  <span className="flex items-center gap-2">Sign In</span>
                )}
              </Button>
            )}
          </div>
        </header>
      )}

      <main className="flex-1 w-full relative">
        {currentView === 'home' && <HomeView navigateTo={navigateTo} navigateToProfile={(name) => navigateTo('profile', name)} auth={auth} ans={ans} />}
        {currentView === 'names' && <NamesAppView navigateToProfile={(name) => navigateTo('profile', name)} auth={auth} ans={ans} />}
        {currentView === 'marketplace' && <MarketplaceView navigateToProfile={(name) => navigateTo('profile', name)} auth={auth} ans={ans} />}
        {currentView === 'mynames' && <MyNamesView isConnected={auth.isConnected} connectWallet={() => auth.signIn()} auth={auth} ans={ans} balance={formattedBalance} />}
        {currentView === 'send' && <SendView isConnected={auth.isConnected} connectWallet={() => auth.signIn()} auth={auth} ans={ans} balance={formattedBalance} />}
        {currentView === 'profile' && profileTarget && <NameProfileView name={profileTarget} navigateTo={navigateTo} />}
      </main>

      <footer className="bg-white border-t border-gray-200 py-16 px-6 pb-28 md:pb-16 z-10 relative">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between gap-10">
          <div>
            <div className="text-gray-900 font-serif font-bold text-2xl flex items-center gap-2 mb-3">
              <div className="text-[#1A863A]">&lt;&gt;</div>
              ANS
            </div>
            <p className="text-gray-500 text-sm font-sans font-medium">Arc Name Service</p>
          </div>
          <div className="flex gap-16 md:gap-24">
            <div className="flex flex-col gap-4 text-sm font-sans">
              <span className="text-gray-900 mb-1 font-serif font-bold text-base">Navigation</span>
              <button onClick={() => navigateTo('home')} className="text-gray-500 hover:text-gray-900 text-left font-medium">Home</button>
              <button onClick={() => navigateTo('names')} className="text-gray-500 hover:text-gray-900 text-left font-medium">Names</button>
              <button onClick={() => navigateTo('send')} className="text-gray-500 hover:text-gray-900 text-left font-medium">Send</button>
              <button onClick={() => navigateTo('marketplace')} className="text-gray-500 hover:text-gray-900 text-left font-medium">Marketplace</button>
              <button onClick={() => navigateTo('mynames')} className="text-gray-500 hover:text-gray-900 text-left font-medium">My Names</button>
            </div>
            <div className="flex flex-col gap-4 text-sm font-sans">
              <span className="text-gray-900 mb-1 font-serif font-bold text-base">Technical</span>
              <a href="#" className="text-gray-500 hover:text-gray-900 font-medium">Arc Network</a>
              <a href="#" className="text-gray-500 hover:text-gray-900 font-medium">Documentation</a>
              <a href="#" className="text-gray-500 hover:text-gray-900 font-medium">GitHub</a>
            </div>
          </div>
        </div>
      </footer>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-gray-200 flex justify-around items-center pb-safe pt-2 z-50 px-2 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => navigateTo(item.id)}
              className={`flex flex-col items-center justify-center w-full py-2 mb-2 rounded-lg transition-colors ${isActive ? 'text-gray-900' : 'text-gray-400'}`}
            >
              <Icon size={20} className="mb-1.5" strokeWidth={isActive ? 2.5 : 1.5} />
              <span className="text-[10px] font-sans font-bold">{item.label}</span>
            </button>
          );
        })}
        <button
          onClick={() => {
            if (auth.isConnected) {
              handleCopyAddress();
            } else {
              auth.signIn();
            }
          }}
          className={`flex flex-col items-center justify-center w-full py-2 mb-2 rounded-lg transition-colors ${auth.isConnected ? 'text-[#1A863A]' : 'text-gray-400'}`}
        >
          {auth.isConnected ? (
            copiedAddress ? <Check size={20} className="mb-1.5 text-[#1A863A]" /> : <Wallet size={20} className="mb-1.5" />
          ) : (
            <Wallet size={20} className="mb-1.5" strokeWidth={1.5} />
          )}
          <span className="text-[10px] font-sans font-bold">
            {auth.isConnected ? (copiedAddress ? 'Copied!' : `${formattedBalance} USDC`) : 'Sign In'}
          </span>
        </button>
      </nav>
    </div>
  );
}
