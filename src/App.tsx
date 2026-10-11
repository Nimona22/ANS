import { trackEvent } from './lib/analytics';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, Send, Store, Wallet, User, Check, AlertCircle, ChevronDown, 
  ArrowRightLeft, Tag, X, Shield, History, ArrowUpRight, Info, 
  Activity, Zap, CreditCard, CheckCircle2, RefreshCw, Clock, ArrowRight as ArrowRightIcon, Gift,
  Copy, LogOut, Mail, Edit3, Star, Sparkles, Fingerprint
, Camera, Share} from 'lucide-react';
import { toast } from 'sonner';
import { useReadContract } from 'wagmi';
import { arcTestnet } from 'viem/chains';
import { formatUnits, type Address } from 'viem';
import { usePasskeyAuth, type AuthState } from './hooks/usePasskeyAuth';
import { useANS, cleanName, fallbackPublicClient } from './hooks/useANS';
import { ANS_ABI, ANS_ADDRESS, REPUTATION_ABI, REPUTATION_ADDRESS, USDC_ABI, USDC_ADDRESS } from './lib/abis';
import {
  NameActivityItem,
  getRealisticNameActivities,
  recordActivity,
  formatRelativeTime,
  calculateRegistrationPriceUSDC,
  getUserPrimaryName,
  setUserPrimaryName,
  getRecentlyRegisteredNames,
  getUserActivities,
} from './lib/activity';
import {
  fetchActiveListings,
  addTrackedListing,
  removeTrackedListing,
  type MarketplaceListing,
} from './lib/marketplace';
import {
  UserProfile,
  loadProfile,
  saveProfile,
  saveProfileGlobal,
  fetchProfileGlobal,
  compressImage,
  useUserProfile,
  subscribeToProfile,
} from './lib/profile';
export type { UserProfile };
export { loadProfile, saveProfile, saveProfileGlobal, fetchProfileGlobal, compressImage, useUserProfile };


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

const INITIAL_MOCK_LISTINGS: any[] = [];

const TIER_NAMES = ['New', 'Trusted', 'Verified', 'Elite'] as const;

const Button = ({ children, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }) => {
  const hasPx = /(?:^|\s)px-/.test(className);
  const hasPy = /(?:^|\s)py-/.test(className);
  const hasTextSize = /(?:^|\s)text-(xs|sm|base|lg|xl|2xl)\b/.test(className);

  const defaultPx = hasPx ? "" : "px-6";
  const defaultPy = hasPy ? "" : "py-2.5";
  const defaultText = hasTextSize ? "" : "text-base";

  const baseStyle = `font-sans font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A863A] focus-visible:ring-offset-2 active:scale-[0.98] ${defaultPx} ${defaultPy} ${defaultText}`;
  
  const variants = {
    primary: "bg-[#111111] text-white hover:bg-[#333333] shadow-sm border border-transparent disabled:bg-gray-200 disabled:text-gray-500",
    secondary: "bg-white border border-gray-200 text-gray-900 hover:bg-gray-50 hover:border-gray-300 shadow-sm disabled:border-gray-100 disabled:text-gray-400",
    ghost: "bg-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100 disabled:text-gray-400"
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getPrice = (len: number, dur: number) => {
    let base = len === 3 ? 5 : len === 4 ? 3 : len === 5 ? 1.5 : 0.5;
    if (dur === 6) base = base * 1.8;
    if (dur === 9) base = base * 2.4;
    if (dur === 12) base = base * 3;
    return base.toFixed(2);
  };

  const price = getPrice(length, duration);

  const handleRegister = async () => {
    if (isLoading) return; // prevent double-fire
    if (!auth.isConnected) {
      toast.info('Connecting with Passkey...');
      await auth.signIn();
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      setTxStep('approving');
      let hash = '';
      if (isGift) {
        if (!giftTarget) {
          toast.error('Please enter a recipient address or .arc name');
          setTxStep('idle');
          setIsLoading(false);
          return;
        }
        hash = await ans.giftName(name, duration, giftTarget, (step) => {
          if (step === 'approving') setTxStep('approving');
          else if (step === 'registering') setTxStep('registering');
        });
      } else {
        hash = await ans.register(name, duration, (step) => {
          if (step === 'approving') setTxStep('approving');
          else if (step === 'registering') setTxStep('registering');
        });
      }
      setTxHash(hash);
      setTxStep('success');
      recordActivity({
        name,
        action: isGift ? 'Gifted Name' : 'Registered Name',
        amount: calculateRegistrationPriceUSDC(name, duration),
        from: isGift ? (auth.address || 'You') : 'Arc Protocol',
        to: isGift ? giftTarget : (auth.address || ''),
        timestamp: Date.now(),
        txHash: hash,
      });
      toast.success(`Done! ${name} ${isGift ? 'gifted' : 'registered'} successfully!`);
    } catch (err: any) {
      console.error(err);
      const msg = err?.message || 'Transaction failed';
      setError(msg);
      toast.error(msg);
      setTxStep('idle');
    } finally {
      setIsLoading(false);
    }
  };

  if (txStep === 'success') {
    return (
      <Card className="text-center py-10 border-[#1A863A]/20 bg-[#1A863A]/5 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-[#1A863A]/10 text-[#1A863A] flex items-center justify-center mx-auto mb-4">
          <Check size={24} strokeWidth={3} />
        </div>
        <h3 className="text-2xl font-serif font-bold text-gray-900 mb-2">Done! {name} {isGift ? 'Gifted' : 'Registered'}</h3>
        <p className="text-gray-500 font-sans text-sm mb-6">
          {isGift ? `Successfully gifted to ${giftTarget}` : 'This identity is now secured in your wallet.'}
        </p>
        <div className="flex justify-center gap-3">
          <Button 
            variant="secondary" 
            className="font-mono text-xs"
            onClick={() => txHash && window.open(`https://explorer.testnet.arc.io/tx/${txHash}`, '_blank')}
          >
            View Tx <ArrowUpRight size={14}/>
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

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-sans">
            {error}
          </div>
        )}

        <div className="pt-4">
          <Button 
            variant="primary"
            className="w-full py-4 text-base" 
            onClick={handleRegister}
            disabled={isLoading || txStep !== 'idle' || (isGift && !giftTarget)}
          >
            {isLoading && txStep === 'idle' && 'Processing...'}
            {txStep === 'idle' && !isLoading && (isGift ? 'Approve USDC & Gift' : 'Approve USDC & Register')}
            {txStep === 'approving' && 'Approving USDC...'}
            {txStep === 'registering' && (isGift ? 'Gifting name...' : 'Registering name...')}
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
          
          {/* How It Works Guide */}
          <div className="mt-20 sm:mt-24 w-full max-w-5xl mx-auto text-left relative">
            <Card className="p-8 sm:p-10 border-gray-200 bg-white/70 backdrop-blur-xl shadow-lg shadow-gray-200/50">
              <div className="flex flex-col md:flex-row md:items-center gap-10 md:gap-14">
                
                <div className="md:w-1/4 shrink-0 text-center md:text-left">
                  <h3 className="text-xl font-serif font-bold text-gray-900 mb-2">How ANS works</h3>
                  <p className="text-sm font-sans text-gray-500 leading-relaxed font-medium">
                    A simpler way to identify and use names on Arc.
                  </p>
                </div>

                <div className="hidden md:block w-px h-24 bg-gray-100 shrink-0"></div>

                <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-10 sm:gap-6 relative">
                  
                  {/* Connection Line for Desktop */}
                  <div className="hidden sm:block absolute top-4 left-[10%] right-[10%] h-[1px] bg-gray-100 -z-10"></div>

                  <div className="relative flex flex-col items-center text-center">
                    <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-900 font-sans font-bold text-xs mb-4 shadow-sm">1</div>
                    <h4 className="font-bold text-gray-900 text-[15px] mb-2">Find your name</h4>
                    <p className="text-gray-500 text-[13px] leading-relaxed font-sans max-w-[200px]">
                      Search for a memorable .arc name.
                    </p>
                  </div>
                  
                  <div className="relative flex flex-col items-center text-center">
                    <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-900 font-sans font-bold text-xs mb-4 shadow-sm">2</div>
                    <h4 className="font-bold text-gray-900 text-[15px] mb-2">Register your identity</h4>
                    <p className="text-gray-500 text-[13px] leading-relaxed font-sans max-w-[200px]">
                      Register your chosen name through the ANS registration flow.
                    </p>
                  </div>
                  
                  <div className="relative flex flex-col items-center text-center">
                    <div className="w-8 h-8 rounded-full bg-[#1A863A]/10 border border-[#1A863A]/20 flex items-center justify-center text-[#1A863A] font-sans font-bold text-xs mb-4 shadow-sm">3</div>
                    <h4 className="font-bold text-gray-900 text-[15px] mb-2">Use your name</h4>
                    <p className="text-gray-500 text-[13px] leading-relaxed font-sans max-w-[200px]">
                      Make recipients easier to identify when sending USDC on Arc.
                    </p>
                  </div>
                  
                </div>
              </div>
            </Card>
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
}) => {
  const [recentNames, setRecentNames] = useState<string[]>(() => getRecentlyRegisteredNames());

  useEffect(() => {
    let cancelled = false;
    const updateRecent = async () => {
      const candidates = getRecentlyRegisteredNames();
      const verified: string[] = [];
      for (const item of candidates) {
        try {
          const rec = await fallbackPublicClient.readContract({
            address: ANS_ADDRESS,
            abi: ANS_ABI,
            functionName: 'getNameRecord',
            args: [cleanName(item)],
          });
          if (rec && rec.owner !== '0x0000000000000000000000000000000000000000') {
            verified.push(item.endsWith('.arc') ? item : `${item}.arc`);
          }
        } catch {
          // ignore individual lookup
        }
      }
      if (!cancelled && verified.length > 0) {
        setRecentNames(verified);
      }
    };

    updateRecent();

    const onUpdate = () => {
      updateRecent();
    };

    window.addEventListener('ans_recent_registered_updated', onUpdate);
    window.addEventListener('ans_activity_updated', onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener('ans_recent_registered_updated', onUpdate);
      window.removeEventListener('ans_activity_updated', onUpdate);
    };
  }, []);

  return (
    <div className="max-w-4xl mx-auto pt-16 pb-32 px-6">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-serif font-bold text-gray-900 mb-4">Find your .arc name</h1>
        <p className="text-gray-500 font-sans text-lg">Search for an available name or explore existing identities.</p>
      </div>
      <InteractiveSearch navigateToProfile={navigateToProfile} autoFocus auth={auth} ans={ans} />
      
      {recentNames.length > 0 && (
        <div className="mt-16 pt-12 border-t border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-serif font-bold text-gray-900 flex items-center gap-2">
              <Sparkles size={20} className="text-[#1A863A]" /> Recently Registered
            </h3>
            <span className="text-xs font-sans text-gray-400 font-medium">Verified on Arc Testnet</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {recentNames.map(s => (
              <Card key={s} hoverable className="p-4 flex items-center justify-between group cursor-pointer" onClick={() => navigateToProfile(s)}>
                <div>
                  <span className="font-serif font-bold text-gray-900 block group-hover:text-[#1A863A] transition-colors">{s}</span>
                  <span className="text-[10px] font-sans text-gray-400 uppercase tracking-wider font-semibold">Active Identity</span>
                </div>
                <ArrowRightIcon size={14} className="text-gray-400 group-hover:text-gray-900 group-hover:translate-x-0.5 transition-all" />
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const MarketplaceView = ({ 
  navigateToProfile, 
  auth, 
  ans,
  navigateTo,
  handleListForSale,
}: { 
  navigateToProfile: (name: string) => void; 
  auth: AuthState; 
  ans: ReturnType<typeof useANS>;
  navigateTo: (view: string, data?: string | null) => void;
  handleListForSale: (name: string) => void;
}) => {
  const [filter, setFilter] = useState('all');
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  const [txState, setTxState] = useState('idle');
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadListings = useCallback(async () => {
    setIsLoading(true);
    try {
      const active = await fetchActiveListings(fallbackPublicClient);
      setListings(active);
    } catch (err) {
      console.warn('Failed to load active marketplace listings:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadListings();
    const handleUpdate = () => {
      loadListings();
    };
    window.addEventListener('ans_marketplace_updated', handleUpdate);
    return () => window.removeEventListener('ans_marketplace_updated', handleUpdate);
  }, [loadListings]);

  const filtered = listings.filter(l => {
    const len = l.name.replace('.arc', '').length;
    if (filter === '3') return len === 3;
    if (filter === '4') return len === 4;
    if (filter === '5+') return len >= 5;
    return true;
  });

  const handleBuy = async (listingItem: MarketplaceListing) => {
    if (!auth.isConnected) {
      toast.info('Connecting with Passkey...');
      await auth.signIn();
      return;
    }

    try {
      setTxState('approving');
      const hash = await ans.buyName(listingItem.name, listingItem.price.toString(), (step) => {
        if (step === 'approving') setTxState('approving');
        else if (step === 'buying') setTxState('purchasing');
      });
      setTxState('success');
      recordActivity({
        name: listingItem.name,
        action: 'Bought Name',
        amount: `${listingItem.price} USDC`,
        from: 'Marketplace',
        to: auth.address || '',
        timestamp: Date.now(),
        txHash: hash,
      });
      removeTrackedListing(listingItem.name);
      setListings(prev => prev.filter(l => cleanName(l.name) !== cleanName(listingItem.name)));
      toast.success(`Done! Purchased ${listingItem.name} successfully! Tx: ${hash.slice(0, 10)}...`);
    } catch (err: any) {
      setTxState('idle');
      toast.error(err?.message || 'Purchase failed');
    }
  };

  const handleCancelListing = async (name: string) => {
    try {
      toast.loading(`Cancelling listing for ${name}...`, { id: `cancel-${name}` });
      await ans.cancelListing(name);
      removeTrackedListing(name);
      setListings(prev => prev.filter(l => cleanName(l.name) !== cleanName(name)));
      toast.success(`${name} listing cancelled!`, { id: `cancel-${name}` });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to cancel listing', { id: `cancel-${name}` });
    }
  };

  const calculateFees = (price: number) => {
    const p = price;
    const fee = p * 0.025;
    return {
      price: p.toFixed(2),
      fee: fee.toFixed(2),
      total: p.toFixed(2),
      sellerReceives: (p - fee).toFixed(2)
    };
  };

  return (
    <div className="max-w-7xl mx-auto pt-16 pb-32 px-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6 border-b border-gray-200 pb-8">
        <div>
          <h1 className="text-4xl font-serif font-bold text-gray-900 mb-3">Marketplace</h1>
          <p className="text-gray-500 font-sans text-lg">Discover and collect verified .arc identities.</p>
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

      {isLoading ? (
        <div className="text-center py-20 text-gray-400">
          <RefreshCw size={28} className="animate-spin mx-auto mb-3 text-gray-300" />
          <p className="font-sans text-sm">Checking on-chain active listings...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
          <div className="w-16 h-16 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center mx-auto mb-4 text-gray-400 shadow-sm">
            <Store size={28} />
          </div>
          <h3 className="text-2xl font-serif font-bold text-gray-900 mb-2">No Active Marketplace Listings</h3>
          <p className="text-gray-500 font-sans text-sm max-w-md mx-auto mb-8 leading-relaxed">
            There are currently no .arc names listed for sale on the secondary market. Anyone with an owned identity can list their name directly through the My Names dashboard.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="primary" onClick={() => navigateTo('mynames')} className="text-sm">
              List from My Names
            </Button>
            <Button variant="secondary" onClick={() => navigateTo('names')} className="text-sm">
              Register a Name
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map(listing => {
            const isOwnListing = !!(auth.address && listing.seller.toLowerCase() === auth.address.toLowerCase());

            return (
              <Card key={listing.name} className="flex flex-col">
                <div className="flex justify-between items-start mb-10">
                  <h3 className="text-2xl font-serif font-bold text-gray-900 cursor-pointer hover:text-[#1A863A]" onClick={() => navigateToProfile(listing.name)}>
                    {listing.name}
                  </h3>
                  <ReputationBadge name={listing.name} showDetails={false} />
                </div>
                <div className="mb-8 flex justify-between items-end">
                  <div>
                    <p className="text-gray-400 text-[10px] font-sans font-bold uppercase tracking-wider mb-1">Asking Price</p>
                    <p className="text-2xl font-mono text-gray-900 font-bold">{listing.price} <span className="text-sm font-sans text-gray-500 font-medium">USDC</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400 text-[10px] font-sans font-bold uppercase tracking-wider mb-1">Seller</p>
                    <button 
                      onClick={() => navigateTo('userprofile', listing.seller)}
                      className="text-xs font-mono text-blue-600 hover:text-blue-700 hover:underline bg-blue-50 px-2 py-1 rounded-md transition-colors"
                      title="View Seller Profile"
                    >
                      {listing.seller.slice(0, 6)}...{listing.seller.slice(-4)}
                    </button>
                  </div>
                </div>
                
                {isOwnListing ? (
                  <div className="mt-auto pt-4 border-t border-gray-100 flex flex-col xl:flex-row items-center justify-between gap-3">
                    <span className="text-[11px] font-sans font-bold text-blue-700 bg-blue-50 px-2.5 py-1.5 rounded border border-blue-200 whitespace-nowrap self-start xl:self-center">
                      Your Listing
                    </span>
                    <div className="flex items-center gap-2 w-full xl:w-auto">
                      <Button 
                        variant="secondary" 
                        className="text-xs py-1.5 px-3 flex-1 xl:flex-none justify-center"
                        onClick={() => handleListForSale(listing.name)}
                      >
                        Update Price
                      </Button>
                      <Button 
                        variant="secondary" 
                        className="text-xs py-1.5 px-3 text-red-600 hover:bg-red-50 hover:border-red-200 flex-1 xl:flex-none justify-center"
                        onClick={() => handleCancelListing(listing.name)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : selectedListing?.name === listing.name ? (
                  <div className="mt-auto border-t border-gray-100 pt-5 bg-gray-50 -mx-6 -mb-6 p-6 rounded-b-2xl">
                    {txState === 'success' ? (
                      <div className="text-center py-6 text-[#1A863A] font-sans font-bold text-sm flex flex-col items-center justify-center gap-3">
                        <CheckCircle2 size={24} strokeWidth={2.5} /> Done! Purchase Complete
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
                            <span className="text-gray-500 font-sans">{calculateFees(listing.price).fee} USDC (deducted from seller)</span>
                          </div>
                          <div className="flex justify-between text-gray-900 pt-3 border-t border-gray-200 text-sm font-bold">
                            <span>Total You Pay</span>
                            <span className="text-[#1A863A] font-bold">{calculateFees(listing.price).total} USDC</span>
                          </div>
                          <div className="text-[10px] text-gray-500 font-sans mt-3 flex items-start gap-1.5 bg-white p-2.5 rounded border border-gray-200">
                            <Info size={12} className="shrink-0 mt-0.5 text-[#1A863A]" />
                            <span>Seller receives {calculateFees(listing.price).sellerReceives} USDC. Escrow guarantees atomic transfer.</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="secondary" className="px-3" onClick={() => { setSelectedListing(null); setTxState('idle'); }}>
                            <X size={16} />
                          </Button>
                          <Button variant="primary" className="flex-1 text-sm" onClick={() => handleBuy(listing)} disabled={txState !== 'idle'}>
                            {txState === 'idle' ? 'Confirm Buy' : txState === 'approving' ? 'Approving USDC...' : 'Purchasing name...'}
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
            );
          })}
        </div>
      )}
    </div>
  );
};

const PasskeySignInCard = ({ auth, actionText = "Connect your wallet" }: { auth: AuthState, actionText?: string }) => {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 max-w-[540px] mx-auto w-full">
      <Card className="w-full text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white border border-gray-100 p-8 sm:p-14 relative overflow-hidden group">
        {/* Subtle decorative background blur */}
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-[#1A863A]/5 rounded-full blur-3xl pointer-events-none group-hover:bg-[#1A863A]/10 transition-colors duration-700" />
        <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-[#1A863A]/5 rounded-full blur-3xl pointer-events-none group-hover:bg-[#1A863A]/10 transition-colors duration-700" />
        
        <div className="w-20 h-20 rounded-[24px] bg-white border border-[#1A863A]/10 flex items-center justify-center mx-auto mb-8 shadow-sm relative z-10 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#1A863A]/5 to-[#1A863A]/10" />
          <Fingerprint size={36} strokeWidth={1.5} className="text-[#1A863A] relative z-10" />
        </div>
        
        <h2 className="text-2xl sm:text-[32px] tracking-tight font-serif font-bold text-gray-900 mb-4 relative z-10">
          Secure Sign In
        </h2>
        
        <p className="text-gray-500 font-sans text-sm sm:text-[15px] mb-8 leading-relaxed relative z-10 max-w-[360px] mx-auto">
          {actionText}.
        </p>

        <div className="flex items-center justify-center gap-2 mb-10 relative z-10">
           <span className="px-3.5 py-1.5 bg-gray-50 border border-gray-200/75 rounded-full text-[11px] font-sans font-bold text-gray-500 tracking-wider uppercase flex items-center gap-1.5 shadow-sm">
             <Shield size={14} strokeWidth={2.5} className="text-[#1A863A]" />
             Uses FaceID / TouchID — No PIN Required
           </span>
        </div>
        
        {auth.error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start text-left gap-3 relative z-10">
            <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm font-sans text-red-800 leading-relaxed font-medium">{auth.error}</p>
          </div>
        )}

        <div className="flex flex-col gap-3 relative z-10">
          <Button 
            variant="primary" 
            onClick={() => auth.signIn()} 
            disabled={auth.isLoading}
            className="w-full py-4 text-[15px] shadow-lg shadow-black/5"
          >
            {auth.isLoading ? (
              <span className="flex items-center justify-center gap-2.5">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Waiting for Passkey...</span>
              </span>
            ) : (
              'Sign In with Passkey'
            )}
          </Button>

          <Button 
            variant="secondary" 
            onClick={() => auth.signUp()} 
            disabled={auth.isLoading}
            className="w-full py-4 text-[15px]"
          >
            Create New Wallet
          </Button>
        </div>
      </Card>
    </div>
  );
};

const MyNamesView = ({ 
  isConnected, 
  connectWallet,
  auth,
  ans,
  balance,
  navigateTo,
}: { 
  isConnected: boolean; 
  connectWallet: () => void;
  auth: AuthState;
  ans: ReturnType<typeof useANS>;
  balance?: string;
  navigateTo: (view: string, arg?: string) => void;
}) => {
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
  const [transferModal, setTransferModal] = useState<{isOpen: boolean; name: string; to: string; pending: boolean}>({isOpen: false, name: '', to: '', pending: false});
  const [listingModal, setListingModal] = useState<{isOpen: boolean; name: string; price: string; pending: boolean}>({isOpen: false, name: '', price: '50', pending: false});

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

            const localPrimary = getUserPrimaryName(auth.address);
            const isPrimary = localPrimary
              ? cleanName(localPrimary) === clean
              : primaryName
                ? cleanName(primaryName) === clean
                : owned.length === 1;

            return {
              name: `${clean}.arc`,
              owner: rec.owner,
              expiry: expiryMs,
              status,
              listed: !!rec.listed,
              isPrimary,
            };
          } catch {
            return {
              name: `${n}.arc`,
              owner: auth.address,
              expiry: Date.now() + 180 * 24 * 60 * 60 * 1000,
              status: 'healthy',
              listed: false,
              isPrimary: false,
            };
          }
        })
      );

      if (active) setNamesList(records);
    }

    loadDetails();

    const handlePrimaryChanged = () => {
      loadDetails();
    };
    window.addEventListener('ans_primary_changed', handlePrimaryChanged);
    return () => { 
      active = false;
      window.removeEventListener('ans_primary_changed', handlePrimaryChanged);
    };
  }, [rawOwnedNames, primaryName, auth.address]);

  if (!isConnected || !auth.address) {
    return <PasskeySignInCard auth={auth} actionText="Sign in or create a wallet instantly to manage your .arc identities, renew registrations, or list names for sale" />;
  }

  const usedCount = namesList.length;

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === 'healthy') return <span className="px-2.5 py-1 bg-[#1A863A]/10 text-[#1A863A] border border-[#1A863A]/20 rounded-full text-[10px] font-sans font-bold uppercase tracking-wider">Active</span>;
    if (status === 'expiring') return <span className="px-2.5 py-1 bg-amber-100 text-amber-700 border border-amber-200 rounded-full text-[10px] font-sans font-bold uppercase tracking-wider flex items-center gap-1"><AlertCircle size={10}/> Expiring</span>;
    return <span className="px-2.5 py-1 bg-red-50 text-red-600 border border-red-200 rounded-full text-[10px] font-sans font-bold uppercase tracking-wider">Expired</span>;
  };

  const handleSetPrimary = (name: string) => {
    if (!auth.address) return;
    setUserPrimaryName(auth.address, name);
    setNamesList(prev => prev.map(item => ({
      ...item,
      isPrimary: cleanName(item.name) === cleanName(name),
    })));
    toast.success(`${name} is now your main .arc identity!`);
  };

  const handleRenew = async (name: string) => {
    try {
      toast.loading('Approving USDC...', { id: `renew-${name}` });
      await ans.renew(name, 12, (step) => {
        if (step === 'approving') {
          toast.loading('Approving USDC...', { id: `renew-${name}` });
        } else if (step === 'renewing') {
          toast.loading('Renewing name...', { id: `renew-${name}` });
        }
      });
      recordActivity({
        name,
        action: 'Renewed Name',
        amount: calculateRegistrationPriceUSDC(name, 12),
        from: auth.address || 'Owner',
        timestamp: Date.now(),
      });
      toast.success(`Done! ${name} renewed!`, { id: `renew-${name}` });
      refetchOwned();
    } catch (e: any) {
      toast.error(e?.message || 'Renew failed', { id: `renew-${name}` });
    }
  };

  const handleTransfer = (name: string) => {
    setTransferModal({ isOpen: true, name, to: '', pending: false });
  };

  const submitTransfer = async () => {
    const { name, to } = transferModal;
    if (!to) return;
    setTransferModal(prev => ({ ...prev, pending: true }));
    try {
      toast.info(`Transferring ${name}...`);
      await ans.transferName(name, to);
      recordActivity({
        name,
        action: 'Transferred Name',
        amount: '-',
        from: auth.address || 'Previous Owner',
        to,
        timestamp: Date.now(),
      });
      toast.success(`${name} transferred to ${to}!`);
      refetchOwned();
      setTransferModal(prev => ({ ...prev, isOpen: false }));
    } catch (e: any) {
      toast.error(e?.message || 'Transfer failed');
      setTransferModal(prev => ({ ...prev, pending: false }));
    }
  };

  const handleListForSale = (name: string) => {
    setListingModal({ isOpen: true, name, price: '50', pending: false });
  };

  const submitListing = async () => {
    const { name, price } = listingModal;
    if (!price || isNaN(Number(price)) || Number(price) <= 0) {
      toast.error('Please enter a valid positive price');
      return;
    }
    setListingModal(prev => ({ ...prev, pending: true }));
    try {
      toast.info(`Listing ${name} for ${price} USDC...`);
      await ans.listForSale(name, price);
      addTrackedListing(name);
      recordActivity({
        name,
        action: 'Listed for Sale',
        amount: `${price} USDC`,
        from: auth.address || 'Seller',
        timestamp: Date.now(),
      });
      toast.success(`${name} listed for sale!`);
      refetchOwned();
      setListingModal(prev => ({ ...prev, isOpen: false }));
    } catch (e: any) {
      toast.error(e?.message || 'Listing failed');
      setListingModal(prev => ({ ...prev, pending: false }));
    }
  };

  const handleCancelListing = async (name: string) => {
    try {
      toast.loading(`Cancelling listing for ${name}...`, { id: `cancel-${name}` });
      await ans.cancelListing(name);
      removeTrackedListing(name);
      toast.success(`${name} removed from marketplace!`, { id: `cancel-${name}` });
      refetchOwned();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to cancel listing', { id: `cancel-${name}` });
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
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={() => {
                navigator.clipboard.writeText(auth.address!);
                toast.success('Address copied to clipboard!');
              }}
              className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-200 rounded-xl font-sans text-xs font-semibold transition-all shadow-sm active:scale-95 shrink-0"
            >
              <Copy size={13} className="text-gray-500" />
              <span>Copy Address</span>
            </button>
            <Button
              variant="primary"
              onClick={() => navigateTo('send')}
              className="flex-1 sm:flex-none py-2.5 px-5 text-sm font-semibold shadow-sm"
            >
              <Send size={14}/> Send Payment
            </Button>
          </div>
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
                  <h3 
                    className="text-2xl font-serif font-bold text-gray-900 flex items-center gap-2 cursor-pointer hover:text-[#1A863A] transition-colors"
                    onClick={() => navigateTo('profile', nameItem.name)}
                  >
                    {nameItem.name}
                    {nameItem.isPrimary && (
                      <span className="text-[#0052FF] text-[9px] font-sans font-bold px-2 py-0.5 border border-[#0052FF]/20 bg-[#0052FF]/10 rounded-full uppercase tracking-wider flex items-center gap-1">
                        <Star size={10} className="fill-[#0052FF]" /> Main
                      </span>
                    )}
                    {nameItem.listed && (
                      <span className="text-amber-700 text-[9px] font-sans font-bold px-2 py-0.5 border border-amber-200 bg-amber-50 rounded-full uppercase tracking-wider">
                        Listed
                      </span>
                    )}
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

            <div className="flex items-center gap-2.5 w-full sm:w-auto mt-2 sm:mt-0 pt-5 sm:pt-0 border-t border-gray-100 sm:border-0">
              {!nameItem.isPrimary && (
                <button
                  onClick={() => handleSetPrimary(nameItem.name)}
                  className="px-3 py-2 text-xs font-sans font-semibold text-gray-600 hover:text-[#0052FF] border border-gray-200 hover:border-blue-200 rounded-xl bg-white hover:bg-blue-50/50 transition-colors flex items-center gap-1.5 shadow-sm"
                  title="Set as your primary main identity across Arc"
                >
                  <Star size={12} className="text-gray-400" /> Set as Main
                </button>
              )}

              {(nameItem.status === 'expiring' || nameItem.status === 'expired') && (
                <Button variant="primary" className="flex-1 sm:flex-none py-2 text-xs" onClick={() => handleRenew(nameItem.name)}>
                  Renew
                </Button>
              )}
              
              <div className="relative group flex-1 sm:flex-none">
                <Button variant="secondary" className="w-full sm:w-auto px-4 py-2 text-xs flex items-center justify-center gap-2">
                  Manage <ChevronDown size={14} />
                </Button>
                <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 py-1.5 overflow-hidden">
                  {!nameItem.isPrimary && (
                    <button onClick={() => handleSetPrimary(nameItem.name)} className="w-full text-left px-5 py-3 text-sm text-gray-700 hover:bg-gray-50 font-sans transition-colors flex items-center gap-3 font-medium">
                      <Star size={16} className="text-[#0052FF]" /> Set as Main Identity
                    </button>
                  )}
                  <button onClick={() => navigateTo('send', nameItem.name)} className="w-full text-left px-5 py-3 text-sm text-gray-700 hover:bg-gray-50 font-sans transition-colors flex items-center gap-3 font-medium">
                    <Send size={16} className="text-gray-400"/> Send Payment
                  </button>
                  <button onClick={() => handleRenew(nameItem.name)} className="w-full text-left px-5 py-3 text-sm text-gray-700 hover:bg-gray-50 font-sans transition-colors flex items-center gap-3 font-medium">
                    <RefreshCw size={16} className="text-gray-400"/> Renew Name
                  </button>
                  <button onClick={() => handleTransfer(nameItem.name)} className="w-full text-left px-5 py-3 text-sm text-gray-700 hover:bg-gray-50 font-sans transition-colors flex items-center gap-3 font-medium">
                    <ArrowRightLeft size={16} className="text-gray-400"/> Transfer Name
                  </button>
                  {nameItem.listed ? (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); handleListForSale(nameItem.name); }} className="w-full text-left px-5 py-3 text-sm text-gray-700 hover:bg-gray-50 font-sans transition-colors flex items-center gap-3 font-medium">
                        <Tag size={16} className="text-gray-400"/> Update Price
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleCancelListing(nameItem.name); }} className="w-full text-left px-5 py-3 text-sm text-red-600 hover:bg-red-50 font-sans transition-colors flex items-center gap-3 font-medium">
                        <Tag size={16} className="text-red-500"/> Cancel Listing
                      </button>
                    </>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); handleListForSale(nameItem.name); }} className="w-full text-left px-5 py-3 text-sm text-gray-700 hover:bg-gray-50 font-sans transition-colors flex items-center gap-3 font-medium">
                      <Tag size={16} className="text-gray-400"/> List for Sale
                    </button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}

        {namesList.length === 0 && (
          <Card className="text-center py-12 text-gray-500">
            <p className="text-base font-sans font-medium mb-4">You have not registered any .arc names yet.</p>
            <Button variant="primary" onClick={() => navigateTo('names')} className="mx-auto text-sm">
              Register a Name
            </Button>
          </Card>
        )}
      </div>

      {transferModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md bg-white shadow-2xl relative">
            <h3 className="text-xl font-serif font-bold text-gray-900 mb-2">Transfer {transferModal.name}</h3>
            <p className="text-sm text-gray-500 font-sans mb-6">Enter the recipient's wallet address or .arc name.</p>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Recipient</label>
                <input
                  type="text"
                  value={transferModal.to}
                  onChange={(e) => setTransferModal(prev => ({ ...prev, to: e.target.value }))}
                  disabled={transferModal.pending}
                  placeholder="0x... or name.arc"
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 focus:border-[#0052FF] transition-all"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={() => setTransferModal(prev => ({ ...prev, isOpen: false }))} disabled={transferModal.pending} className="px-5 py-2">
                Cancel
              </Button>
              <Button variant="primary" onClick={submitTransfer} disabled={!transferModal.to || transferModal.pending} className="px-5 py-2">
                {transferModal.pending ? 'Transferring...' : 'Transfer Name'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {listingModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md bg-white shadow-2xl relative">
            <h3 className="text-xl font-serif font-bold text-gray-900 mb-2">List {listingModal.name} for Sale</h3>
            <p className="text-sm text-gray-500 font-sans mb-6">Set a price in USDC. A 2.5% protocol fee will be deducted from your proceeds upon sale.</p>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Price (USDC)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={listingModal.price}
                    onChange={(e) => setListingModal(prev => ({ ...prev, price: e.target.value }))}
                    disabled={listingModal.pending}
                    placeholder="50"
                    className="w-full p-3 pl-4 pr-16 bg-gray-50 border border-gray-200 rounded-xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 focus:border-[#0052FF] transition-all"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">USDC</span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={() => setListingModal(prev => ({ ...prev, isOpen: false }))} disabled={listingModal.pending} className="px-5 py-2">
                Cancel
              </Button>
              <Button variant="primary" onClick={submitListing} disabled={!listingModal.price || listingModal.pending} className="px-5 py-2">
                {listingModal.pending ? 'Listing...' : 'List for Sale'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

const SendView = ({ 
  isConnected, 
  connectWallet,
  auth,
  ans,
  balance,
  defaultRecipient = '',
}: { 
  isConnected: boolean; 
  connectWallet: () => void;
  auth: AuthState;
  ans: ReturnType<typeof useANS>;
  balance?: string;
  defaultRecipient?: string;
}) => {
  const [recipient, setRecipient] = useState(defaultRecipient || '');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [step, setStep] = useState('edit'); 
  const [txStatus, setTxStatus] = useState('idle');
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    if (defaultRecipient) {
      setRecipient(defaultRecipient);
    }
  }, [defaultRecipient]);

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
    return <PasskeySignInCard auth={auth} actionText="Sign in or create a wallet instantly to send USDC payments seamlessly using .arc names" />;
  }

  const isResolved = isArcName && (!!onchainResolved || recipient.length > 4);
  const resolvedAddress = (onchainResolved as string | undefined) || (isResolved ? "0x3f5...8b91" : null);

  const handleReview = () => {
    if (!recipient || !amount) return;
    setStep('preview');
  };

  const handleConfirm = async () => {
    try {
      setTxStatus('approving');
      const hash = await ans.sendTip(recipient, amount, note, (step) => {
        if (step === 'approving') setTxStatus('approving');
        else if (step === 'tipping') setTxStatus('confirming');
      });
      recordActivity({
        name: recipient,
        action: 'Received Tip',
        amount: `${amount} USDC`,
        from: auth.address ? (cleanName(auth.address).slice(0, 8) + '...') : 'Anonymous',
        to: recipient,
        timestamp: Date.now(),
        txHash: hash,
        note: note || undefined,
      });
      setTxHash(hash);
      setTxStatus('idle');
      setStep('success');
      toast.success('Done! Payment sent successfully!');
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
          <h3 className="text-3xl font-serif font-bold text-gray-900 mb-2">Done! Payment Sent</h3>
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
                View on Arcscan <ArrowUpRight size={14}/>
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
              {resolvedAddress && resolvedAddress.startsWith('0x') && resolvedAddress.length === 42 && (() => {
                const resolvedProfile = loadProfile(resolvedAddress);
                if (!resolvedProfile.displayName) return null;
                return (
                  <div className="mt-2.5 flex items-center gap-2 text-xs text-gray-700 bg-white border border-gray-200 px-3 py-1.5 rounded-xl w-fit shadow-sm">
                    <span className="font-sans font-bold text-gray-900">{resolvedProfile.displayName}</span>
                    <ReputationBadge name={resolvedAddress} showDetails={false} />
                  </div>
                );
              })()}
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
                {txStatus === 'approving' && 'Approving USDC...'}
                {txStatus === 'confirming' && 'Sending payment...'}
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
  navigateTo: (view: string, data?: string | null) => void;
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

  const isOwnerAddress = ownerStr.startsWith('0x') && ownerStr.length === 42;
  const { data: repRecord } = useReadContract({
    address: REPUTATION_ADDRESS,
    abi: REPUTATION_ABI,
    functionName: 'getReputation',
    args: isOwnerAddress ? [ownerStr as Address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: isOwnerAddress },
  });

  const [activities, setActivities] = useState<NameActivityItem[]>([]);

  useEffect(() => {
    const list = getRealisticNameActivities({
      name,
      hasOnchainOwner: !!hasOnchainOwner,
      ownerAddress: hasOnchainOwner ? record?.owner : undefined,
      expirySeconds: record ? Number(record.expiry) : undefined,
      memberSinceSeconds: repRecord ? Number(repRecord.memberSince) : undefined,
      isMockName: !hasOnchainOwner && !!mockName,
    });
    setActivities(list);

    const onUpdate = () => {
      const updated = getRealisticNameActivities({
        name,
        hasOnchainOwner: !!hasOnchainOwner,
        ownerAddress: hasOnchainOwner ? record?.owner : undefined,
        expirySeconds: record ? Number(record.expiry) : undefined,
        memberSinceSeconds: repRecord ? Number(repRecord.memberSince) : undefined,
        isMockName: !hasOnchainOwner && !!mockName,
      });
      setActivities(updated);
    };

    window.addEventListener('ans_activity_updated', onUpdate);
    return () => window.removeEventListener('ans_activity_updated', onUpdate);
  }, [name, hasOnchainOwner, record, repRecord, mockName]);

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

            <div className="mt-3">
              <button
                onClick={() => navigateTo('userprofile', ownerStr)}
                className="text-xs font-sans font-semibold text-[#1A863A] hover:underline flex items-center gap-1"
              >
                View owner profile →
              </button>
            </div>

            {(() => {
              const ownerProfile = loadProfile(ownerStr);
              if (!ownerProfile.displayName && !ownerProfile.bio) return null;
              return (
                <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-900 font-serif font-bold text-sm shrink-0 shadow-sm">
                    {ownerProfile.avatar?.trim() || (ownerProfile.displayName ? ownerProfile.displayName.slice(0, 2).toUpperCase() : ownerStr.slice(0, 4))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-serif font-bold text-sm text-gray-900 truncate">{ownerProfile.displayName || 'Owner Profile'}</span>
                      <ReputationBadge name={ownerStr} showDetails={false} />
                    </div>
                    {ownerProfile.bio && <p className="text-gray-600 font-sans text-xs line-clamp-2 leading-relaxed">{ownerProfile.bio}</p>}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mt-2">
                      {ownerProfile.twitter && <span>@{ownerProfile.twitter}</span>}
                      {ownerProfile.website && <span>{ownerProfile.website.replace(/^https?:\/\//, '')}</span>}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
          
          <div className="flex flex-col gap-3 w-full md:w-auto z-10 shrink-0">
            <Button variant="primary" onClick={() => navigateTo('send', name)} className="w-full md:w-auto py-3.5 text-base">
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
          
          {activities.length > 0 ? (
            <div className="space-y-2">
              {activities.map((tx) => {
                const getActionIcon = () => {
                  switch (tx.action) {
                    case 'Registered Name':
                      return <Shield size={18} className="text-[#1A863A]" />;
                    case 'Received Tip':
                      return <Zap size={18} className="text-amber-500" />;
                    case 'Bought Name':
                      return <Store size={18} className="text-blue-500" />;
                    case 'Gifted Name':
                      return <Gift size={18} className="text-purple-500" />;
                    case 'Renewed Name':
                      return <RefreshCw size={18} className="text-[#1A863A]" />;
                    case 'Listed for Sale':
                      return <Tag size={18} className="text-blue-500" />;
                    default:
                      return <ArrowRightLeft size={18} className="text-gray-400" />;
                  }
                };

                return (
                  <div key={tx.id} className="flex flex-col sm:flex-row justify-between sm:items-center py-5 border-b border-gray-200 last:border-0 gap-4 hover:bg-white -mx-4 px-4 rounded-xl transition-colors">
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm shrink-0">
                        {getActionIcon()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-gray-900 font-sans font-bold">{tx.action}</p>
                          {tx.txHash && (
                            <a
                              href={`https://explorer.testnet.arc.io/tx/${tx.txHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-gray-400 hover:text-gray-900 transition-colors p-0.5 rounded"
                              title="View on Explorer"
                            >
                              <ArrowUpRight size={13} />
                            </a>
                          )}
                        </div>
                        <p className="text-gray-500 font-mono text-xs mt-1">
                          {tx.from}
                          {tx.note && <span className="text-gray-600 font-sans italic ml-2">"{tx.note}"</span>}
                        </p>
                      </div>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-gray-900 font-mono font-bold text-base">{tx.amount}</p>
                      <p className="text-gray-500 font-sans text-xs mt-1">{formatRelativeTime(tx.timestamp)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
              <History size={28} className="mx-auto mb-2 text-gray-300" />
              <p className="font-sans text-sm">No activity recorded yet for this name.</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

const UserProfileView = ({
  targetAddress,
  auth,
  navigateTo,
}: {
  targetAddress: string;
  auth: AuthState;
  navigateTo: (view: string, data?: string | null) => void;
}) => {
  const [profile, setProfile] = useState<UserProfile>(() => loadProfile(targetAddress));
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<UserProfile>(profile);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'portfolio' | 'activity'>('overview');
  const [isAvatarSaving, setIsAvatarSaving] = useState(false);
  
  const { setAvatar } = useANS(auth.credential);

  useEffect(() => {
    const p = loadProfile(targetAddress);
    setProfile(p);
    setFormData(p);
  }, [targetAddress]);

  const isOwner = !!(auth.address && targetAddress && auth.address.toLowerCase() === targetAddress.toLowerCase());

  const handleCopy = async () => {
    await navigator.clipboard.writeText(targetAddress);
    setCopied(true);
    toast.success('Address copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveProfile(formData);
    setProfile(formData);
    setIsEditing(false);
    toast.success('Profile metadata saved locally!');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be smaller than 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Url = event.target?.result as string;
      const updatedProfile = { ...profile, avatarUrl: base64Url };
      saveProfile(updatedProfile);
      setProfile(updatedProfile);
      setFormData(updatedProfile);
      toast.success("Avatar updated locally! Connect a Supabase backend to make it global.", { duration: 6000 });
    };
    reader.readAsDataURL(file);
  };

  const { data: rawOwnedNames, isLoading: isNamesLoading } = useReadContract({
    address: ANS_ADDRESS,
    abi: ANS_ABI,
    functionName: 'getNamesByOwner',
    args: targetAddress ? [targetAddress as Address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!targetAddress },
  });

  const { data: onchainAvatarUrl, refetch: refetchAvatar } = useReadContract({
    address: ANS_ADDRESS,
    abi: ANS_ABI,
    functionName: 'avatars',
    args: targetAddress ? [targetAddress as Address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!targetAddress },
  });

  const ownedNames = useMemo(() => {
    const names = (rawOwnedNames as string[] | undefined) || [];
    return names.filter(n => n.length > 0).map(n => n.endsWith('.arc') ? n : `${n}.arc`);
  }, [rawOwnedNames]);

  const { data: tierNum } = useReadContract({
    address: REPUTATION_ADDRESS,
    abi: REPUTATION_ABI,
    functionName: 'getTier',
    args: targetAddress ? [targetAddress as Address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!targetAddress },
  });

  const { data: repRecord } = useReadContract({
    address: REPUTATION_ADDRESS,
    abi: REPUTATION_ABI,
    functionName: 'getReputation',
    args: targetAddress ? [targetAddress as Address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!targetAddress },
  });

  const repStats = useMemo(() => {
    if (repRecord) {
      return {
        tier: TIER_NAMES[Number(tierNum ?? 0)] ?? 'New',
        since: repRecord.memberSince > 0n ? new Date(Number(repRecord.memberSince) * 1000).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : 'Recent',
        sales: Number(repRecord.salesCompleted),
        buys: Number(repRecord.purchasesCompleted),
        tips: Number(repRecord.tipsGiftsGiven),
        disputes: Number(repRecord.disputeFlags),
      };
    }
    return { tier: 'New', since: 'Recent', sales: 0, buys: 0, tips: 0, disputes: 0 };
  }, [repRecord, tierNum]);

  const avatarDisplay = profile.avatarUrl || profile.avatar?.trim() || (profile.displayName ? profile.displayName.slice(0, 2).toUpperCase() : targetAddress.slice(0, 4));

  const bannerGradient = useMemo(() => {
    const num = targetAddress ? parseInt(targetAddress.slice(2, 8), 16) : 0;
    const hue1 = num % 360;
    const hue2 = (hue1 + 40) % 360;
    return `linear-gradient(135deg, hsl(${hue1}, 80%, 15%), hsl(${hue2}, 80%, 5%))`;
  }, [targetAddress]);

  return (
    <div className="w-full min-h-screen bg-[#FAFAFA] text-gray-900 -mt-16 pt-16 font-sans">
      {/* Banner */}
      <div className="w-full h-48 md:h-64 relative group border-b border-gray-200" style={{ background: bannerGradient }}>
        {isOwner && (
          <button className="absolute top-4 right-4 bg-black/40 hover:bg-black/60 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors opacity-0 group-hover:opacity-100 flex items-center gap-2 border border-gray-200 backdrop-blur-md">
            <Camera size={14} /> Edit Banner
          </button>
        )}
      </div>

      <div className="max-w-[1400px] mx-auto px-6 pb-32">
        {/* Profile Header */}
        <div className="relative -mt-16 md:-mt-20 mb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="flex flex-col gap-4 w-full md:w-auto z-10">
            <div className="w-32 h-32 md:w-40 md:h-40 rounded-xl border-4 border-white bg-gray-100 flex items-center justify-center text-gray-900 font-serif font-bold text-4xl shadow-2xl overflow-hidden shrink-0 relative group">
              {onchainAvatarUrl || profile.avatarUrl ? (
                <img src={(onchainAvatarUrl as string) || profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                avatarDisplay
              )}
              {isOwner && (
                <label className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity cursor-pointer text-white">
                  <Camera size={24} className="mb-1" />
                  <span className="text-[10px] font-bold">Upload PFP</span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                </label>
              )}
            </div>

            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                {profile.displayName || (isOwner ? 'Your Profile' : 'Unnamed User')}
                <ReputationBadge name={targetAddress} showDetails={true} />
              </h1>
              <div className="flex items-center gap-2 text-gray-500 font-mono text-sm mt-2">
                <span>{targetAddress.slice(0, 6)}...{targetAddress.slice(-4)}</span>
                <button onClick={handleCopy} title="Copy full address" className="p-1 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors">
                  {copied ? <Check size={14} className="text-[#1A863A]" /> : <Copy size={14} />}
                </button>
                <span className="text-gray-600 mx-1">|</span>
                <span className="font-sans text-xs">Joined {repStats.since}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto mt-4 md:mt-0 z-10">
            {isOwner && (
              <Button variant="secondary" onClick={() => setIsEditing(!isEditing)} className="text-sm bg-white border-gray-200 text-gray-900 hover:bg-gray-100 hover:border-gray-300">
                <Edit3 size={16} className="mr-2" /> Edit Profile
              </Button>
            )}
            <Button variant="secondary" onClick={handleCopy} className="text-sm bg-white border-gray-200 text-gray-900 hover:bg-gray-100 hover:border-gray-300">
               <Share size={16} className="mr-2" /> Share
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-8 border-b border-gray-200 mb-8 overflow-x-auto no-scrollbar">
          {(['overview', 'portfolio', 'activity'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-4 text-sm font-sans font-bold capitalize whitespace-nowrap border-b-2 transition-colors ${activeTab === tab ? 'border-white text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
            >
              {tab === 'portfolio' ? `Portfolio (${ownedNames.length})` : tab}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-8">
               {isEditing && isOwner ? (
                 <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-xl p-8 space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="font-serif font-bold text-xl text-gray-900">Edit Profile</h3>
                      <span className="text-xs text-gray-500 font-sans">Local metadata</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-[11px] font-sans font-bold uppercase tracking-wider text-gray-500 mb-2">Display Name</label>
                        <input type="text" value={formData.displayName || ''} onChange={(e) => setFormData(p => ({ ...p, displayName: e.target.value }))} placeholder="e.g. Alice Nakamoto" className="w-full bg-gray-50 border border-gray-200 text-gray-900 font-sans p-3 rounded-xl focus:outline-none focus:border-gray-400 text-sm" />
                      </div>
                      <div>
                        <label className="block text-[11px] font-sans font-bold uppercase tracking-wider text-gray-500 mb-2">Email</label>
                        <input type="email" value={formData.email || ''} onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))} placeholder="alice@example.com" className="w-full bg-gray-50 border border-gray-200 text-gray-900 font-sans p-3 rounded-xl focus:outline-none focus:border-gray-400 text-sm" />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-[11px] font-sans font-bold uppercase tracking-wider text-gray-500">Bio</label>
                        <span className="text-xs font-mono text-gray-500">{(formData.bio?.length || 0)}/160</span>
                      </div>
                      <textarea maxLength={160} rows={3} value={formData.bio || ''} onChange={(e) => setFormData(p => ({ ...p, bio: e.target.value }))} placeholder="Tell the community about yourself (max 160 chars)..." className="w-full bg-gray-50 border border-gray-200 text-gray-900 font-sans p-3 rounded-xl focus:outline-none focus:border-gray-400 text-sm resize-none" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-[11px] font-sans font-bold uppercase tracking-wider text-gray-500 mb-2">Twitter Handle</label>
                        <div className="flex rounded-xl border border-gray-200 overflow-hidden bg-gray-50 focus-within:border-gray-400">
                          <span className="px-3.5 py-3 text-gray-500 text-sm font-mono flex items-center bg-gray-50 border-r border-gray-200">@</span>
                          <input type="text" value={formData.twitter || ''} onChange={(e) => setFormData(p => ({ ...p, twitter: e.target.value.replace(/^@/, '') }))} placeholder="handle" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 focus:outline-none font-sans" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-sans font-bold uppercase tracking-wider text-gray-500 mb-2">Website URL</label>
                        <input type="url" value={formData.website || ''} onChange={(e) => setFormData(p => ({ ...p, website: e.target.value }))} placeholder="https://example.com" className="w-full bg-gray-50 border border-gray-200 text-gray-900 font-sans p-3 rounded-xl focus:outline-none focus:border-gray-400 text-sm" />
                      </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button variant="primary" type="submit" className="text-sm px-6 bg-gray-900 text-white border-none hover:bg-gray-800">Save Profile</Button>
                      <Button variant="secondary" type="button" onClick={() => { setFormData(profile); setIsEditing(false); }} className="text-sm px-6 bg-transparent border-gray-200 text-gray-900 hover:bg-white">Cancel</Button>
                    </div>
                 </form>
               ) : (
                 <div className="bg-white border border-gray-200 rounded-xl p-6">
                    <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2"><Info size={14} /> About</h3>
                    {profile.bio ? (
                      <p className="text-gray-700 font-sans text-base leading-relaxed">{profile.bio}</p>
                    ) : (
                      <p className="text-gray-500 font-sans text-sm italic">No bio provided yet.</p>
                    )}
                    
                    <div className="flex flex-wrap items-center gap-6 text-sm font-sans text-gray-500 pt-6 mt-6 border-t border-gray-200">
                      {profile.email && (
                        <span className="flex items-center gap-1.5 text-gray-600">
                          <Mail size={16} className="text-gray-500" /> {profile.email}
                        </span>
                      )}
                      {profile.twitter && (
                        <a href={`https://twitter.com/${profile.twitter}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-400 hover:underline font-medium">
                          <span>@{profile.twitter}</span>
                        </a>
                      )}
                      {profile.website && (
                        <a href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[#2DD4BF] hover:underline font-medium">
                          <ArrowUpRight size={16} /> {profile.website.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                    </div>
                 </div>
               )}
            </div>
            
            <div className="space-y-6">
               <div className="bg-white border border-gray-200 rounded-xl p-6">
                 <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-gray-500 mb-4">Reputation Stats</h3>
                 <div className="grid grid-cols-2 gap-4">
                   <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                     <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-gray-500">Member Since</p>
                     <p className="text-sm font-mono font-bold text-gray-900 mt-1">{repStats.since}</p>
                   </div>
                   <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                     <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-gray-500">Tier</p>
                     <p className="text-sm font-mono font-bold text-gray-900 mt-1">{repStats.tier}</p>
                   </div>
                   <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                     <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-gray-500">Trades</p>
                     <p className="text-sm font-mono font-bold text-gray-900 mt-1">{repStats.sales + repStats.buys}</p>
                   </div>
                   <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                     <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-gray-500">Tips / Gifts</p>
                     <p className="text-sm font-mono font-bold text-gray-900 mt-1">{repStats.tips}</p>
                   </div>
                 </div>
                 {repStats.disputes > 0 && (
                   <div className="mt-4 bg-red-900/20 border border-red-500/20 rounded-lg p-3 flex items-center gap-3">
                     <AlertCircle size={16} className="text-red-400" />
                     <p className="text-xs text-red-400 font-medium">This account has {repStats.disputes} active dispute flags.</p>
                   </div>
                 )}
               </div>
            </div>
          </div>
        )}
        
        {activeTab === 'portfolio' && (
           <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8">
              <div className="flex flex-wrap gap-4">
                {isNamesLoading ? (
                  <div className="flex items-center gap-2 text-sm font-sans text-gray-500">
                    <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></div>
                    Loading on-chain portfolio...
                  </div>
                ) : ownedNames.length > 0 ? (
                  ownedNames.map(nameItem => (
                    <button
                      key={nameItem}
                      onClick={() => navigateTo('profile', nameItem)}
                      className="px-5 py-3 bg-gray-50 hover:bg-gray-100 text-gray-900 border border-gray-200 rounded-xl font-mono text-sm font-semibold transition-colors flex items-center gap-3 group"
                    >
                      <span>{nameItem}</span>
                      <ArrowRightIcon size={14} className="text-gray-500 group-hover:text-[#1A863A] transition-colors" />
                    </button>
                  ))
                ) : (
                  <p className="text-sm font-sans text-gray-500 w-full text-center py-12">No registered .arc names for this wallet.</p>
                )}
              </div>
           </div>
        )}

        {activeTab === 'activity' && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8">
            {(() => {
              const userActs = getUserActivities(targetAddress);
              if (userActs.length === 0) {
                return (
                  <div className="text-center py-12">
                    <History size={32} className="mx-auto text-gray-600 mb-3" />
                    <p className="text-gray-500 text-sm">No activity recorded locally for this user yet.</p>
                  </div>
                );
              }
              return (
                <div className="space-y-4">
                  {userActs.map((tx: any) => (
                    <div key={tx.id} className="flex flex-col sm:flex-row justify-between sm:items-center py-4 border-b border-gray-200 last:border-0 gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500 shrink-0">
                          {tx.action.includes('Transferred') || tx.action.includes('Gifted') ? <Gift size={16} className="text-purple-400" /> : <History size={16} />}
                        </div>
                        <div>
                          <p className="text-gray-900 font-sans font-bold text-sm">{tx.action}</p>
                          <p className="text-gray-500 font-mono text-xs mt-0.5">
                            {tx.name}
                            {tx.note && <span className="text-gray-500 font-sans italic ml-2">"{tx.note}"</span>}
                          </p>
                        </div>
                      </div>
                      <div className="sm:text-right">
                        <p className="text-gray-900 font-mono font-bold text-sm">{tx.amount}</p>
                        <p className="text-gray-500 font-sans text-[10px] mt-0.5">{formatRelativeTime(tx.timestamp)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

      </div>
    </div>
  );
};

export default function App() {
  const [currentView, setCurrentView] = useState('home');
  const [profileTarget, setProfileTarget] = useState<string | null>(null);
  const [userProfileTarget, setUserProfileTarget] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [isMobileWalletOpen, setIsMobileWalletOpen] = useState(false);


  const auth = usePasskeyAuth();
  const ans = useANS(auth.credential);

  useEffect(() => {
    trackEvent({
      eventType: currentView === 'marketplace' ? 'marketplace_viewed' : 'page_viewed',
      walletAddress: auth.address ? auth.address : undefined,
      metadata: { view: currentView, profileTarget }
    });
  }, [currentView, profileTarget, auth.address]);

  useEffect(() => {
    if (auth.isConnected && auth.address) {
      trackEvent({ eventType: 'wallet_connected', walletAddress: auth.address });
    }
  }, [auth.isConnected, auth.address]);


  const { data: usdcBalanceRaw, isLoading: isBalanceLoading } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: auth.address ? [auth.address as Address] : undefined,
    chainId: arcTestnet.id,
    query: {
      enabled: !!auth.address,
      refetchInterval: 10000,
    },
  });

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
    const timer = setInterval(fetchBal, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [auth.address]);

  const formattedBalance = useMemo(() => {
    if (usdcBalanceRaw !== undefined && usdcBalanceRaw !== null) {
      return Number(formatUnits(usdcBalanceRaw, 6)).toFixed(2);
    }
    if (fallbackBalance !== null) {
      return Number(fallbackBalance).toFixed(2);
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

  const [currentPrimaryName, setCurrentPrimaryName] = useState<string | null>(() => getUserPrimaryName(auth.address));

  const { data: onchainPrimary } = useReadContract({
    address: ANS_ADDRESS,
    abi: ANS_ABI,
    functionName: 'reverseLookup',
    args: auth.address ? [auth.address as Address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!auth.address },
  });

  const { data: rawAppOwnedNames } = useReadContract({
    address: ANS_ADDRESS,
    abi: ANS_ABI,
    functionName: 'getNamesByOwner',
    args: auth.address ? [auth.address as Address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!auth.address },
  });

  useEffect(() => {
    if (auth.address) {
      const stored = getUserPrimaryName(auth.address);
      const appOwned = (rawAppOwnedNames as string[] || []).map(n => n.endsWith('.arc') ? n : `${n}.arc`);
      
      let validatedStored = null;
      if (stored) {
        // Only use the local stored primary name if we can confirm the user actually owns it
        // Or if the names are still loading, tentatively use it to avoid flashing
        if (appOwned.includes(stored) || !rawAppOwnedNames) {
          validatedStored = stored;
        } else if (rawAppOwnedNames && !appOwned.includes(stored)) {
          // If we loaded names and it's not there, clear it from local storage
          localStorage.removeItem(`ans_primary_${auth.address}`);
        }
      }

      if (validatedStored) {
        setCurrentPrimaryName(validatedStored);
      } else if (onchainPrimary && onchainPrimary.length > 0) {
        const full = onchainPrimary.endsWith('.arc') ? onchainPrimary : `${onchainPrimary}.arc`;
        setCurrentPrimaryName(full);
      } else {
        setCurrentPrimaryName(null);
      }
    } else {
      setCurrentPrimaryName(null);
    }

    const onPrimaryChanged = (e: any) => {
      if (e.detail?.primaryName) {
        setCurrentPrimaryName(e.detail.primaryName);
      }
    };
    window.addEventListener('ans_primary_changed', onPrimaryChanged);
    return () => window.removeEventListener('ans_primary_changed', onPrimaryChanged);
  }, [auth.address, onchainPrimary]);

  const [sendRecipientTarget, setSendRecipientTarget] = useState<string>('');

  const navigateTo = (view: string, data: string | null = null) => {
    if (view === 'profile') {
      if (data === 'self' && auth.address) {
        setUserProfileTarget(auth.address);
        setCurrentView('userprofile');
      } else {
        setProfileTarget(data);
        setCurrentView(view);
      }
    } else if (view === 'userprofile') {
      const target = data === 'self' || !data ? auth.address : data;
      setUserProfileTarget(target);
      setCurrentView('userprofile');
    } else if (view === 'send') {
      setSendRecipientTarget(data || '');
      setCurrentView('send');
    } else {
      setCurrentView(view);
    }
    window.scrollTo(0, 0);
  };

  const navItems = [
    { id: 'names', label: 'Names', icon: Search },
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
          <Button variant="primary" onClick={() => navigateTo('names')} className="font-sans font-bold text-sm px-6">
            Launch App
          </Button>
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
                {isBalanceLoading && usdcBalanceRaw === undefined && fallbackBalance === null ? (
                  <div className="h-9 w-24 bg-gray-200 animate-pulse rounded-xl border border-gray-200" />
                ) : (
                  <div 
                    className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-sans font-medium text-gray-800 shadow-sm cursor-default"
                    title="Your USDC balance on Arc Testnet"
                  >
                    <CreditCard size={14} className="text-[#1A863A] shrink-0" />
                    <span className="font-mono font-bold text-gray-900">{formattedBalance}</span>
                    <span className="text-gray-500 text-[11px] font-semibold">USDC</span>
                  </div>
                )}

                <div className="flex items-center gap-1.5 sm:gap-2">
                  {currentPrimaryName && (
                    <button
                      onClick={() => navigateTo('profile', currentPrimaryName)}
                      title="View your main identity profile"
                      className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-gray-50 text-gray-900 border border-gray-200 hover:border-gray-300 rounded-xl font-sans text-xs font-bold transition-all shadow-sm group active:scale-95"
                    >
                      <div className="w-2 h-2 rounded-full bg-[#1A863A] shrink-0" />
                      <span className="font-serif">{currentPrimaryName}</span>
                    </button>
                  )}

                  <button
                    onClick={handleCopyAddress}
                    title="Click to copy your address"
                    className="flex items-center gap-2 px-2.5 sm:px-3 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 hover:border-gray-300 rounded-xl font-mono text-xs font-medium transition-all shadow-sm group active:scale-95"
                  >
                    {copiedAddress ? (
                      <>
                        <Check size={14} className="text-[#1A863A] shrink-0" />
                        <span className="text-[#1A863A] font-sans font-medium">Copied!</span>
                      </>
                    ) : (
                      <>
                        <span>{auth.address.slice(0, 5)}...{auth.address.slice(-4)}</span>
                        <Copy size={12} className="text-gray-400 group-hover:text-gray-700 transition-colors shrink-0" />
                      </>
                    )}
                  </button>
                </div>

                <button
                  onClick={() => navigateTo('userprofile', auth.address)}
                  title="View your public profile"
                  className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-sans font-medium text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-colors shadow-sm"
                >
                  <User size={14} />
                  <span>Profile</span>
                </button>

                <button
                  onClick={() => auth.signOut()}
                  title="Sign out"
                  className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 border border-gray-200 hover:border-red-200 rounded-xl transition-colors shadow-sm shrink-0"
                >
                  <LogOut size={16} />
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Button 
                  variant="secondary"
                  onClick={() => auth.signUp()}
                  className="font-mono text-sm h-10 px-4 hidden sm:flex"
                  disabled={auth.isLoading}
                >
                  Create Wallet
                </Button>
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
              </div>
            )}
          </div>
        </header>
      )}

      <main className="flex-1 w-full relative">
        {currentView === 'home' && <HomeView navigateTo={navigateTo} navigateToProfile={(name) => navigateTo('profile', name)} auth={auth} ans={ans} />}
        {currentView === 'names' && <NamesAppView navigateToProfile={(name) => navigateTo('profile', name)} auth={auth} ans={ans} />}
        {currentView === 'marketplace' && <MarketplaceView navigateToProfile={(name) => navigateTo('profile', name)} auth={auth} ans={ans} navigateTo={navigateTo} handleListForSale={(name) => navigateTo('listForSale', name)} />}
        {currentView === 'mynames' && <MyNamesView isConnected={auth.isConnected} connectWallet={() => auth.signIn()} auth={auth} ans={ans} balance={formattedBalance} navigateTo={navigateTo} />}
        {currentView === 'send' && <SendView isConnected={auth.isConnected} connectWallet={() => auth.signIn()} auth={auth} ans={ans} balance={formattedBalance} defaultRecipient={sendRecipientTarget} />}
        {currentView === 'profile' && profileTarget && <NameProfileView name={profileTarget} navigateTo={navigateTo} />}
        {currentView === 'userprofile' && userProfileTarget && <UserProfileView targetAddress={userProfileTarget} auth={auth} navigateTo={navigateTo} />}
      </main>

      {currentView === 'home' && (
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
                <button onClick={() => navigateTo('marketplace')} className="text-gray-500 hover:text-gray-900 text-left font-medium">Marketplace</button>
                <button onClick={() => navigateTo('mynames')} className="text-gray-500 hover:text-gray-900 text-left font-medium">My Names</button>
              </div>
              <div className="flex flex-col gap-4 text-sm font-sans">
                <span className="text-gray-900 mb-1 font-serif font-bold text-base">Technical</span>
                <a href="https://www.arc.io/network" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-900 font-medium">Arc Network</a>
                <a href="https://docs.arc.io/" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-900 font-medium">Documentation</a>
                <a href="https://github.com/Nimona22/ANS" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-900 font-medium">GitHub</a>
                <a href="https://explorer.arc.io/" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-900 font-medium">Arc Explorer</a>
              </div>
            </div>
          </div>
        </footer>
      )}

      {/* Mobile Bottom Navigation Bar */}
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
              setIsMobileWalletOpen(true);
            } else {
              auth.signIn();
            }
          }}
          className={`flex flex-col items-center justify-center w-full py-2 mb-2 rounded-lg transition-colors ${auth.isConnected ? 'text-[#1A863A]' : 'text-gray-400'}`}
        >
          <Wallet size={20} className="mb-1.5" strokeWidth={1.5} />
          <span className="text-[10px] font-mono font-bold">
            {auth.isConnected && auth.address ? `${auth.address.slice(0, 5)}...${auth.address.slice(-4)}` : 'Sign In'}
          </span>
        </button>
      </nav>

      {/* Mobile Wallet Bottom Sheet */}
      {isMobileWalletOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={() => setIsMobileWalletOpen(false)}>
          <div className="w-full bg-white rounded-t-3xl p-6 shadow-2xl border-t border-gray-200" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6" />
            
            <div className="flex justify-between items-center mb-6">
              <span className="font-serif font-bold text-xl text-gray-900">Your Wallet</span>
              <button onClick={() => setIsMobileWalletOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-900 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-gray-400 mb-1">Smart Account</p>
                  <p className="font-mono text-xs font-semibold text-gray-900 truncate">{auth.address}</p>
                </div>
                <button
                  onClick={handleCopyAddress}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-sans font-semibold text-gray-700 shadow-sm active:scale-95 shrink-0"
                >
                  {copiedAddress ? (
                    <>
                      <Check size={14} className="text-[#1A863A]" />
                      <span className="text-[#1A863A]">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} className="text-gray-400" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-gray-400 mb-1">USDC Balance</p>
                  <p className="font-mono text-xl font-bold text-[#1A863A]">{formattedBalance} <span className="text-sm font-sans text-gray-500 font-medium">USDC</span></p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-[#1A863A]/10 text-[#1A863A] flex items-center justify-center">
                  <CreditCard size={20} />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <Button 
                variant="secondary" 
                className="w-full py-3.5 text-sm flex items-center justify-center gap-2"
                onClick={() => {
                  setIsMobileWalletOpen(false);
                  navigateTo('userprofile', auth.address);
                }}
              >
                <User size={16} /> View Profile
              </Button>
              <Button 
                variant="ghost" 
                className="w-full py-3 text-sm text-red-600 hover:bg-red-50 flex items-center justify-center gap-2"
                onClick={() => {
                  setIsMobileWalletOpen(false);
                  auth.signOut();
                }}
              >
                <LogOut size={16} /> Sign Out
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
