import { trackEvent } from './lib/analytics';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, Send, Store, Wallet, User, Check, AlertCircle, ChevronDown, 
  ArrowRightLeft, Tag, X, Shield, History, ArrowUpRight, Info, 
  Activity, Zap, CreditCard, CheckCircle2, RefreshCw, Clock, ArrowRight as ArrowRightIcon, Gift,
  Copy, LogOut, Mail, Edit3, Star, Sparkles, Fingerprint, Home as HomeIcon
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
  body {
    background-color: #FBFBFA;
    color: #141413;
    font-family: 'IBM Plex Sans', system-ui, -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
    margin: 0;
  }
  
  .font-serif { font-family: 'Newsreader', 'PT Serif', Georgia, serif; }
  .font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
  .font-sans { font-family: 'IBM Plex Sans', system-ui, -apple-system, sans-serif; }

  .hero-green { color: #137A43; }
`;

/**
 * ANS Sovereign Geometric Logo
 * Distinctive geometric vector mark representing identity resolution on Arc
 */
export const ANSLogo = ({ className = "" }: { size?: number; className?: string }) => (
  <div className={`flex items-center gap-2 select-none shrink-0 ${className}`}>
    <span className="text-[#137A43] font-mono font-bold text-2xl tracking-tighter leading-none">&lt;&gt;</span>
    <span className="text-[#141413] font-sans font-bold text-2xl tracking-tight leading-none">ANS</span>
  </div>
);

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

const Button = ({ children, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'accent' | 'ghost' }) => {
  const hasPx = /(?:^|\s)px-/.test(className);
  const hasPy = /(?:^|\s)py-/.test(className);
  const hasTextSize = /(?:^|\s)text-(xs|sm|base|lg|xl|2xl)\b/.test(className);

  const defaultPx = hasPx ? "" : "px-5";
  const defaultPy = hasPy ? "" : "py-2.5";
  const defaultText = hasTextSize ? "" : "text-sm";

  const baseStyle = `font-sans font-medium rounded-full transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#137A43] focus-visible:ring-offset-2 active:scale-[0.98] select-none ${defaultPx} ${defaultPy} ${defaultText}`;
  
  const variants = {
    primary: "bg-[#141413] text-white hover:bg-[#282826] shadow-sm disabled:bg-[#E5E5E2] disabled:text-[#8E8E89]",
    secondary: "bg-white border border-[#E5E5E2] text-[#141413] hover:bg-[#F7F7F6] hover:border-[#D5D5D0] shadow-sm disabled:border-[#ECECE9] disabled:text-[#A0A09B]",
    accent: "bg-[#137A43] text-white hover:bg-[#0F6536] shadow-sm border border-transparent disabled:bg-[#E8F5E9] disabled:text-[#137A43]/50",
    ghost: "bg-transparent text-[#60605A] hover:text-[#141413] hover:bg-[#F2F2EF] disabled:text-[#A0A09B]"
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
    className={`border border-[#E5E5E2] bg-white rounded-2xl overflow-hidden ${hoverable ? 'hover:border-[#137A43]/40 hover:shadow-[0_6px_20px_rgba(0,0,0,0.04)] transition-all duration-200 cursor-pointer' : 'shadow-[0_1px_3px_rgba(0,0,0,0.02)]'} ${noPadding ? '' : 'p-6'} ${className}`}
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
    "New": "text-[#60605A] bg-[#F7F7F6] border-[#E5E5E2]",
    "Trusted": "text-[#2C2C2A] bg-[#F2F2EF] border-[#DCDCD8]",
    "Verified": "text-[#137A43] bg-[#E8F5E9] border-[#137A43]/20",
    "Elite": "text-[#0B4B27] bg-[#DEF2E3] border-[#137A43]/30"
  };

  return (
    <div className="relative inline-block">
      <button 
        onClick={(e) => { e.stopPropagation(); if (showDetails) setIsOpen(!isOpen); }}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-sans font-semibold border transition-all ${colors[rep.tier] || colors.New} ${!showDetails && 'cursor-default'}`}
      >
        <Shield size={11} strokeWidth={2.2} />
        {rep.tier}
      </button>

      {isOpen && showDetails && (
        <div className="absolute z-50 top-full mt-2 left-0 w-64 bg-white border border-[#E5E5E2] rounded-xl p-4 shadow-xl text-sm font-sans" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-3 pb-2 border-b border-[#F0F0ED]">
            <span className="font-serif font-bold text-[#141413] text-sm">{name} Reputation</span>
            <button onClick={() => setIsOpen(false)} className="text-[#8E8E89] hover:text-[#141413]"><X size={15} /></button>
          </div>
          <div className="space-y-2 text-[#60605A] text-xs">
            <div className="flex justify-between"><span>Member Since</span><span className="text-[#141413] font-medium font-mono">{rep.since}</span></div>
            <div className="flex justify-between"><span>Total Transactions</span><span className="text-[#141413] font-medium font-mono">{rep.txs}</span></div>
            <div className="flex justify-between"><span>Names Bought</span><span className="text-[#141413] font-medium font-mono">{rep.buys}</span></div>
            <div className="flex justify-between"><span>Names Sold</span><span className="text-[#141413] font-medium font-mono">{rep.sales}</span></div>
            <div className="flex justify-between"><span>Tips Sent/Recv</span><span className="text-[#141413] font-medium font-mono">{rep.tips}</span></div>
            <div className="flex justify-between pt-1 mt-1 border-t border-[#F0F0ED]">
              <span>Dispute Flags</span>
              <span className={rep.disputes > 0 ? "text-red-600 font-bold font-mono" : "text-[#137A43] font-bold font-mono"}>{rep.disputes}</span>
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
      <form 
        onSubmit={(e) => {
          e.preventDefault();
        }} 
        className="relative max-w-2xl mx-auto mb-4"
      >
        <div className="relative flex items-center bg-white border border-[#E5E5E2] rounded-full p-2 pl-6 shadow-sm focus-within:border-[#137A43] focus-within:ring-2 focus-within:ring-[#137A43]/10 transition-all">
          <Search size={20} className="text-gray-400 mr-3 shrink-0" />
          <input 
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a name (e.g. alice.arc)"
            autoFocus={autoFocus}
            aria-label="Search for a .arc name"
            className="w-full bg-transparent text-sm sm:text-base text-[#141413] placeholder:text-gray-400 font-sans outline-none pr-3"
            spellCheck="false"
          />
          <button 
            type="submit" 
            disabled={isSearching}
            className="bg-[#137A43] hover:bg-[#0F6536] text-white font-medium text-sm px-7 py-2.5 sm:px-8 sm:py-3 rounded-full transition-colors shrink-0 disabled:opacity-60 flex items-center gap-1.5 shadow-sm active:scale-95"
          >
            {isSearching ? <RefreshCw size={15} className="animate-spin" /> : 'Search'}
          </button>
        </div>
      </form>

      {/* Popular shortcuts matching the design system */}
      <div className="flex items-center justify-center flex-wrap gap-2 mb-8 text-xs font-mono">
        <span className="text-[#8E8E89] mr-1 font-sans">Popular:</span>
        {['alice.arc', 'dev.arc', 'nina.arc', 'marketplace.arc'].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setQuery(item.replace('.arc', ''))}
            className="px-3.5 py-1 bg-white border border-[#E5E5E2] hover:border-[#137A43] hover:text-[#137A43] text-[#40403B] rounded-full text-xs font-mono transition-colors shadow-2xs"
          >
            {item}
          </button>
        ))}
      </div>

      <div className="min-h-[20px] text-left">
        {isSearching && (
          <div className="text-center text-[#60605A] font-mono text-xs flex items-center justify-center gap-2 py-4">
            <div className="w-3.5 h-3.5 border-2 border-[#137A43] border-t-transparent rounded-full animate-spin"></div>
            Querying Arc namespace...
          </div>
        )}
        
        {!isSearching && result?.type === 'available' && (
          <RegistrationProcess name={result.name} length={result.length} auth={auth} ans={ans} />
        )}

        {!isSearching && result?.type === 'taken' && (
          <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-[#E5E5E2]">
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <h3 className="text-2xl font-serif font-bold text-[#141413]">{result.data.name}</h3>
                <span className="px-2 py-0.5 bg-[#F7F7F6] text-[#60605A] text-[10px] font-mono uppercase tracking-wider rounded border border-[#E5E5E2]">Registered</span>
              </div>
              <p className="text-[#60605A] font-sans text-xs">
                Owner: <span className="font-mono text-[#141413]">{result.data.owner}</span>
              </p>
            </div>
            <Button variant="secondary" onClick={() => navigateToProfile(result.data.name)}>
              View Profile
            </Button>
          </Card>
        )}

        {!isSearching && result?.type === 'listed' && (
          <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-amber-200/80 bg-amber-50/30">
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <h3 className="text-2xl font-serif font-bold text-[#141413]">{result.data.name}</h3>
                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-mono uppercase tracking-wider rounded border border-amber-200">Listed for Sale</span>
              </div>
              <p className="text-[#60605A] font-sans text-xs">
                Asking Price: <span className="text-[#141413] font-mono font-bold">{result.data.price} USDC</span>
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
      <Card className="text-center py-10 border-[#137A43]/20 bg-[#E8F5E9]/30 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-[#E8F5E9] text-[#137A43] flex items-center justify-center mx-auto mb-4">
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
          <Button variant="accent" onClick={() => setTxStep('idle')} className="text-sm">Manage Name</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-[#E5E5E2] bg-white shadow-sm p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-[#E5E5E2] gap-4">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500 font-semibold block mb-1">
            Namespace Record
          </span>
          <h2 className="text-3xl font-serif font-bold text-gray-900 tracking-tight">{name}</h2>
          <span className="text-[#137A43] text-xs font-mono font-semibold inline-flex items-center gap-1.5 mt-2 bg-[#E8F5E9] border border-[#137A43]/20 px-3 py-1 rounded-full">
            <CheckCircle2 size={13} /> Unregistered / Available
          </span>
        </div>
        <div className="text-left sm:text-right bg-[#FBFBFA] p-3.5 rounded-2xl border border-[#E5E5E2]">
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-0.5">Registration Fee</span>
          <div className="text-2xl font-mono font-bold text-gray-900 tabular-nums">
            {price} <span className="text-gray-500 text-xs font-mono font-normal">USDC</span>
          </div>
        </div>
      </div>

      <div className="space-y-6 pt-6">
        <div>
          <label className="block text-gray-500 font-mono text-[11px] uppercase tracking-wider font-semibold mb-2">
            Registration Mode
          </label>
          <div className="grid grid-cols-2 bg-[#F5F5F3] p-1 rounded-full border border-[#E5E5E2]">
            <button 
              className={`py-2 text-xs font-mono font-semibold rounded-full transition-all ${!isGift ? 'bg-white text-gray-900 shadow-sm border border-[#E5E5E2]' : 'text-gray-500 hover:text-gray-900'}`}
              onClick={() => setIsGift(false)}
            >
              Self-Register
            </button>
            <button 
              className={`py-2 text-xs font-mono font-semibold rounded-full transition-all ${isGift ? 'bg-white text-gray-900 shadow-sm border border-[#E5E5E2]' : 'text-gray-500 hover:text-gray-900'}`}
              onClick={() => setIsGift(true)}
            >
              Gift to Recipient
            </button>
          </div>
        </div>

        {isGift && (
          <div>
            <label className="block text-gray-500 font-mono text-[11px] uppercase tracking-wider font-semibold mb-2">
              Recipient Address or Name
            </label>
            <input 
              type="text" 
              value={giftTarget}
              onChange={(e) => setGiftTarget(e.target.value)}
              placeholder="0x... or alice.arc"
              className="w-full bg-[#FBFBFA] border border-[#E5E5E2] text-gray-900 font-mono p-3 rounded-xl focus:outline-none focus:border-[#137A43] focus:bg-white text-sm transition-all"
            />
          </div>
        )}

        <div>
          <label className="block text-gray-500 font-mono text-[11px] uppercase tracking-wider font-semibold mb-2">
            Registration Period
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[3, 6, 9, 12].map(m => {
              const durPrice = getPrice(length, m);
              const isSelected = duration === m;
              return (
                <button 
                  key={m}
                  onClick={() => setDuration(m)}
                  className={`py-3 px-3 rounded-2xl border text-left transition-all ${
                    isSelected 
                      ? 'border-[#137A43] bg-[#E8F5E9]/50 text-gray-900 shadow-2xs ring-1 ring-[#137A43]' 
                      : 'border-[#E5E5E2] text-gray-700 hover:border-gray-400 bg-white'
                  }`}
                >
                  <div className="text-xs font-mono font-semibold text-gray-900">
                    {m} Months
                  </div>
                  <div className={`text-[11px] font-mono mt-0.5 tabular-nums ${isSelected ? 'text-[#137A43] font-bold' : 'text-gray-500'}`}>
                    {durPrice} USDC
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-mono">
            {error}
          </div>
        )}

        <div className="pt-2">
          <Button 
            variant="accent"
            className="w-full py-3.5 text-sm font-sans font-medium" 
            onClick={handleRegister}
            disabled={isLoading || txStep !== 'idle' || (isGift && !giftTarget)}
          >
            {isLoading && txStep === 'idle' && 'Initializing transaction...'}
            {txStep === 'idle' && !isLoading && (isGift ? `Authorize ${price} USDC & Gift` : `Authorize ${price} USDC & Register`)}
            {txStep === 'approving' && 'Approving USDC Settlement...'}
            {txStep === 'registering' && (isGift ? 'Executing Gift Operation...' : 'Registering Arc Identity...')}
          </Button>
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-500 font-mono mt-3">
            <Shield size={12} className="text-[#137A43]" />
            <span>Atomic settlement on Arc Testnet (ERC-4337 Passkey Smart Account)</span>
          </div>
        </div>
      </div>
    </Card>
  );
};

/**
 * Abstract Arc-Inspired Geometric Centerpiece
 * Faithful recreation of the reference 3D white sculptural arch, 
 * central emerald star, orbital planetary rings, and stacked typography
 */
const ArcGeometricCenterpiece = () => {
  return (
    <div className="relative w-full max-w-[500px] aspect-[1.1/1] mx-auto flex items-center justify-center select-none pointer-events-none lg:pointer-events-auto">
      <svg 
        viewBox="0 0 500 420" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <defs>
          <linearGradient id="archFrontGrad" x1="170" y1="50" x2="330" y2="350" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="35%" stopColor="#F7F7F5" />
            <stop offset="70%" stopColor="#E7E7E3" />
            <stop offset="100%" stopColor="#D5D5CF" />
          </linearGradient>

          <linearGradient id="archInnerGrad" x1="210" y1="110" x2="340" y2="350" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#EDEDEA" />
            <stop offset="55%" stopColor="#DCDCD6" />
            <stop offset="100%" stopColor="#C4C4BC" />
          </linearGradient>

          <linearGradient id="starTop" x1="260" y1="165" x2="260" y2="198" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#22C55E" />
            <stop offset="100%" stopColor="#137A43" />
          </linearGradient>
          <linearGradient id="starBottom" x1="260" y1="198" x2="260" y2="232" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#137A43" />
            <stop offset="100%" stopColor="#0B4B27" />
          </linearGradient>
          <linearGradient id="starLeft" x1="238" y1="198" x2="260" y2="198" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#189953" />
            <stop offset="100%" stopColor="#0D5E32" />
          </linearGradient>
          <linearGradient id="starRight" x1="260" y1="198" x2="282" y2="198" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#12743F" />
            <stop offset="100%" stopColor="#083E1F" />
          </linearGradient>

          <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="14" />
            <feOffset dx="0" dy="16" result="offsetblur" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.10" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ambient Ground Shadow */}
        <ellipse cx="255" cy="358" rx="145" ry="24" fill="#000000" opacity="0.06" filter="blur(16px)" />
        <ellipse cx="270" cy="352" rx="95" ry="16" fill="#000000" opacity="0.07" filter="blur(8px)" />

        {/* Outer Orbital Ring - Back Segment */}
        <path 
          d="M 105 210 C 125 150 345 140 405 195" 
          stroke="#137A43" 
          strokeWidth="1.25" 
          opacity="0.45"
          fill="none" 
        />
        {/* Rear Node on Outer Ring */}
        <circle cx="365" cy="160" r="4.5" fill="#137A43" />

        {/* Inner Orbital Ring - Back Segment */}
        <path 
          d="M 145 210 C 165 168 325 162 375 200" 
          stroke="#137A43" 
          strokeWidth="1" 
          opacity="0.3"
          strokeDasharray="3 3"
          fill="none" 
        />

        {/* 3D WHITE SCULPTURAL ARCH */}
        <g filter="url(#softShadow)">
          {/* Back Pillar / Inner Loop */}
          <path 
            d="M 190 230 C 190 135 240 85 282 85 C 322 85 352 130 352 235 C 352 305 328 340 288 340 C 276 340 266 325 266 305 C 266 290 276 275 292 265 C 308 255 312 225 312 175 C 312 130 292 115 276 115 C 250 115 222 145 222 235 L 190 230 Z" 
            fill="url(#archInnerGrad)" 
          />

          {/* Front Sweeping Ribbon Loop */}
          <path 
            d="M 170 315 C 155 245 178 135 235 90 C 270 60 322 70 342 115 C 362 160 352 265 322 315 C 306 340 276 345 256 325 C 240 310 245 285 260 270 C 280 250 295 205 295 150 C 295 115 270 95 245 110 C 215 130 198 195 202 275 C 205 315 180 340 170 315 Z" 
            fill="url(#archFrontGrad)" 
          />

          {/* Arch Light Crease Reflection */}
          <path 
            d="M 175 285 C 180 195 212 120 248 100 C 285 80 325 100 336 140 C 346 180 332 265 306 310" 
            stroke="#FFFFFF" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            opacity="0.9" 
            fill="none" 
          />
        </g>

        {/* Inner Orbital Ring - Front Segment */}
        <path 
          d="M 145 210 C 125 255 305 270 375 200" 
          stroke="#137A43" 
          strokeWidth="1" 
          opacity="0.4"
          fill="none" 
        />

        {/* Outer Orbital Ring - Front Segment */}
        <path 
          d="M 105 210 C 75 275 335 295 405 195" 
          stroke="#137A43" 
          strokeWidth="1.5" 
          opacity="0.75"
          fill="none" 
        />

        {/* Orbit Nodes on Front Segment */}
        <circle cx="115" cy="230" r="5" fill="#137A43" />
        <circle cx="362" cy="240" r="5.5" fill="#137A43" />

        {/* CENTERPIECE 4-POINT EMERALD STAR */}
        <g transform="translate(262, 210) scale(1.15)">
          <circle cx="0" cy="0" r="30" fill="#137A43" opacity="0.2" filter="blur(10px)" />
          
          <path d="M 0 0 L -8 -4 L 0 -28 L 0 0 Z" fill="url(#starTop)" />
          <path d="M 0 0 L 8 -4 L 0 -28 L 0 0 Z" fill="#22C55E" opacity="0.9" />

          <path d="M 0 0 L -8 4 L 0 28 L 0 0 Z" fill="url(#starBottom)" />
          <path d="M 0 0 L 8 4 L 0 28 L 0 0 Z" fill="#137A43" />

          <path d="M 0 0 L -4 -8 L -28 0 L 0 0 Z" fill="url(#starLeft)" />
          <path d="M 0 0 L -4 8 L -28 0 L 0 0 Z" fill="#0B4B27" />

          <path d="M 0 0 L 4 -8 L 28 0 L 0 0 Z" fill="url(#starRight)" />
          <path d="M 0 0 L 4 8 L 28 0 L 0 0 Z" fill="#169A54" />

          <circle cx="0" cy="0" r="1.5" fill="#FFFFFF" opacity="0.95" />
        </g>
      </svg>

      {/* Far Right Monospace Caption matching image exactly */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-8 sm:translate-x-12 hidden lg:block select-none pointer-events-none">
        <div className="text-[10px] font-mono tracking-[0.22em] text-[#7A7A75] space-y-1.5 leading-tight font-medium border-l border-[#BDBDB8] pl-3">
          <p>SIMPLE NAMES.</p>
          <p>REAL OWNERS.</p>
          <p>ON-CHAIN.</p>
        </div>
      </div>
    </div>
  );
};

/**
 * Real Name Search with live on-chain contract resolution & shortcuts
 */
const HeroNameSearch = ({ 
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
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<any>(null);

  const performCheck = useCallback(async (nameToCheck: string) => {
    const formatted = cleanName(nameToCheck);
    if (!formatted || formatted.length < 3) {
      setResult(formatted.length > 0 ? { type: 'invalid' } : null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const fullName = `${formatted}.arc`;

    try {
      const isAvail = await fallbackPublicClient.readContract({
        address: ANS_ADDRESS,
        abi: ANS_ABI,
        functionName: 'isAvailable',
        args: [formatted],
      });

      if (isAvail) {
        setResult({ type: 'available', name: fullName, length: formatted.length, raw: formatted });
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
        setResult({ type: 'available', name: fullName, length: formatted.length, raw: formatted });
      }
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!query) {
      setResult(null);
      return;
    }
    const timer = setTimeout(() => {
      performCheck(query);
    }, 350);
    return () => clearTimeout(timer);
  }, [query, performCheck]);

  const handleShortcutClick = (shortcut: string) => {
    const raw = shortcut.replace('.arc', '');
    setQuery(raw);
    performCheck(raw);
  };

  return (
    <div className="w-full text-left">
      {/* Search Input pill container matching reference */}
      <form 
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) performCheck(query);
        }} 
        className="relative max-w-xl"
      >
        <div className="relative flex items-center bg-white border border-[#E5E5E2] rounded-full p-1.5 pl-5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] focus-within:border-[#137A43] focus-within:ring-2 focus-within:ring-[#137A43]/10 transition-all">
          <Search size={18} className="text-gray-400 mr-3 shrink-0" />
          <input 
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a name (e.g. alice.arc)"
            aria-label="Search for a .arc name"
            className="w-full bg-transparent text-sm text-[#141413] placeholder:text-gray-400 font-sans outline-none pr-3"
            spellCheck="false"
          />
          <button 
            type="submit" 
            disabled={isSearching}
            className="bg-[#137A43] hover:bg-[#0F6536] text-white font-medium text-sm px-7 py-2.5 rounded-full transition-colors shrink-0 disabled:opacity-60 flex items-center gap-1.5 shadow-sm active:scale-95"
          >
            {isSearching ? <RefreshCw size={14} className="animate-spin" /> : 'Search'}
          </button>
        </div>
      </form>

      {/* Popular shortcuts row matching image: Popular: alice.arc dev.arc nina.arc marketplace.arc */}
      <div className="flex items-center flex-wrap gap-2 mt-4 text-xs font-mono">
        <span className="text-[#8E8E89] mr-1 font-sans">Popular:</span>
        {['alice.arc', 'dev.arc', 'nina.arc', 'marketplace.arc'].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => handleShortcutClick(item)}
            className="px-3.5 py-1 bg-white border border-[#E5E5E2] hover:border-[#137A43] hover:text-[#137A43] text-[#40403B] rounded-full text-xs font-mono transition-colors shadow-2xs"
          >
            {item}
          </button>
        ))}
      </div>

      {/* Result feedback card */}
      <div className="mt-4 max-w-xl">
        {isSearching && (
          <div className="text-gray-500 font-mono text-xs flex items-center gap-2 py-2">
            <div className="w-3.5 h-3.5 border-2 border-[#137A43] border-t-transparent rounded-full animate-spin"></div>
            Checking on-chain availability on Arc Testnet...
          </div>
        )}

        {!isSearching && result?.type === 'available' && (
          <div className="bg-white border border-[#137A43]/40 p-4 rounded-2xl shadow-sm animate-in fade-in duration-150">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-[#137A43]"></span>
                  <span className="font-serif font-bold text-gray-900 text-lg">{result.name}</span>
                  <span className="text-[10px] font-mono text-[#137A43] bg-[#E8F5E9] border border-[#137A43]/20 px-2 py-0.5 rounded-md font-bold">
                    Available
                  </span>
                </div>
                <p className="text-xs text-gray-500 font-sans">
                  Available to register with instant Passkey lease on Arc Testnet.
                </p>
              </div>
              <button 
                className="bg-[#137A43] hover:bg-[#0F6536] text-white py-2 px-4 text-xs font-sans font-medium rounded-full shrink-0 shadow-sm transition-all"
                onClick={() => navigateTo('names')}
              >
                Register with Passkey
              </button>
            </div>
          </div>
        )}

        {!isSearching && result?.type === 'taken' && (
          <div className="bg-white border border-[#E5E5E2] p-4 rounded-2xl shadow-sm animate-in fade-in duration-150">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-serif font-bold text-gray-900 text-lg">{result.data.name}</span>
                  <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                    Registered
                  </span>
                </div>
                <p className="text-xs text-gray-500 font-mono truncate max-w-xs">
                  Owner: {result.data.owner}
                </p>
              </div>
              <button 
                className="bg-white border border-[#E5E5E2] text-gray-800 hover:bg-gray-50 py-2 px-4 text-xs font-sans font-medium rounded-full shrink-0 shadow-sm transition-all"
                onClick={() => navigateToProfile(result.data.name)}
              >
                View Profile
              </button>
            </div>
          </div>
        )}

        {!isSearching && result?.type === 'listed' && (
          <div className="bg-white border border-amber-300 p-4 rounded-2xl shadow-sm animate-in fade-in duration-150">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-serif font-bold text-gray-900 text-lg">{result.data.name}</span>
                  <span className="text-[10px] font-mono text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-semibold">
                    Listed: {result.data.price} USDC
                  </span>
                </div>
                <p className="text-xs text-gray-500 font-sans">
                  Available in trustless atomic escrow on Arc Testnet.
                </p>
              </div>
              <button 
                className="bg-[#141413] hover:bg-[#282826] text-white py-2 px-4 text-xs font-sans font-medium rounded-full shrink-0 shadow-sm transition-all"
                onClick={() => navigateTo('marketplace')}
              >
                View Listing
              </button>
            </div>
          </div>
        )}

        {!isSearching && result?.type === 'invalid' && (
          <p className="text-xs text-amber-700 font-mono">
            Names must contain at least 3 characters.
          </p>
        )}
      </div>
    </div>
  );
};

/**
 * Five Product Capabilities Strip matching reference layout
 */
const ProductCapabilitiesStrip = () => {
  const capabilities = [
    {
      icon: User,
      title: "Human-readable identity",
      desc: "Use .arc names instead of long wallet addresses.",
    },
    {
      icon: Send,
      title: "Name-based payments",
      desc: "Send USDC to a name or wallet with confidence.",
    },
    {
      icon: Store,
      title: "Name marketplace",
      desc: "Discover, buy, and sell names on Arc.",
    },
    {
      icon: Shield,
      title: "Profiles & reputation",
      desc: "Build your on-chain identity and establish trust.",
    },
    {
      icon: Fingerprint,
      title: "Passkey security",
      desc: "Secure access with Circle SDK and passkeys.",
    },
  ];

  return (
    <section className="border-y border-[#E5E5E2] bg-transparent relative z-10 my-4 sm:my-8">
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-[#E5E5E2]">
          {capabilities.map((cap) => {
            const Icon = cap.icon;
            return (
              <div key={cap.title} className="p-4 sm:px-6 flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-[#E8F5E9] text-[#137A43] flex items-center justify-center shrink-0 mt-0.5">
                  <Icon size={18} strokeWidth={2} />
                </div>
                <div>
                  <h3 className="font-sans font-semibold text-gray-900 text-sm mb-1 leading-snug">
                    {cap.title}
                  </h3>
                  <p className="text-gray-500 text-xs font-sans leading-relaxed">
                    {cap.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

/**
 * Lower Homepage Section — The 3-Column Side-By-Side Grid
 * Exact match to reference image:
 * Card 1: Dark Identity Card with glowing wave
 * Card 2: Featured Names Card with live testnet / spotlight data
 * Card 3: How It Works 3-step guide
 */
const LowerHomeGrid = ({
  navigateTo,
  navigateToProfile,
}: {
  navigateTo: (view: string) => void;
  navigateToProfile: (name: string) => void;
}) => {
  const featuredNames = [
    { name: "alice.arc", status: "Available", price: "$12.00" },
    { name: "nina.arc", status: "Available", price: "$8.50" },
    { name: "dev.arc", status: "Available", price: "$15.00" },
    { name: "marketplace.arc", status: "Available", price: "$20.00" },
    { name: "arcx.arc", status: "Available", price: "$18.00" },
  ];

  return (
    <section className="max-w-7xl mx-auto px-6 py-10 sm:py-14 relative z-10">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        
        {/* CARD 1: Dark Identity Card */}
        <div className="lg:col-span-1 bg-[#0F1410] rounded-2xl p-8 text-white relative overflow-hidden flex flex-col justify-between shadow-sm min-h-[420px]">
          {/* Subtle green ambient glow and wave SVG */}
          <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-radial from-[#137A43]/30 via-transparent to-transparent pointer-events-none" />
          <svg className="absolute right-0 bottom-0 w-48 h-32 opacity-40 pointer-events-none" viewBox="0 0 200 120" fill="none">
            <path d="M0 120 C60 100 120 40 200 60 L200 120 Z" fill="url(#greenWaveGrad)" />
            <path d="M0 120 C80 90 140 30 200 50" stroke="#22C55E" strokeWidth="1.5" opacity="0.8" />
            <defs>
              <linearGradient id="greenWaveGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#137A43" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#22C55E" stopOpacity="0.05" />
              </linearGradient>
            </defs>
          </svg>

          <div>
            <div className="inline-flex items-center gap-2 text-xs font-mono text-[#86EFAC] bg-white/5 border border-white/10 px-3 py-1 rounded-full mb-8">
              <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
              <span>Live on Arc Network</span>
            </div>

            <h2 className="font-serif font-bold text-3xl sm:text-4xl leading-tight mb-4">
              Your name.<br />
              Your identity,<br />
              <span className="text-[#22C55E]">On-chain.</span>
            </h2>

            <p className="text-gray-300 text-xs sm:text-sm leading-relaxed max-w-sm mb-6 font-sans">
              Join the next generation of on-chain identity. Register, manage and use your .arc name across the Arc ecosystem.
            </p>
          </div>

          <button 
            onClick={() => navigateTo('names')}
            className="bg-white text-gray-900 hover:bg-gray-100 font-sans font-medium text-xs px-5 py-2.5 rounded-full flex items-center gap-2 w-fit transition-all shadow-sm active:scale-95"
          >
            <span>Get Started</span>
            <ArrowRightIcon size={14} />
          </button>
        </div>

        {/* RIGHT 2 COLUMNS: Featured Names & How It Works unified container matching reference */}
        <div className="lg:col-span-2 bg-white border border-[#E5E5E2] rounded-2xl grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#E5E5E2] shadow-sm overflow-hidden">
          
          {/* Card 2: Featured Names */}
          <div className="p-6 sm:p-7 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-sans font-semibold text-gray-900 text-sm">Featured Names</h3>
                <button 
                  onClick={() => navigateTo('marketplace')}
                  className="text-xs font-mono text-[#137A43] hover:underline flex items-center gap-1 font-medium"
                >
                  <span>View all</span>
                  <ArrowRightIcon size={12} />
                </button>
              </div>

              <div className="divide-y divide-[#F0F0EE]">
                {featuredNames.map((item) => (
                  <div 
                    key={item.name}
                    onClick={() => {
                      const raw = item.name.replace('.arc', '');
                      navigateTo('names');
                    }}
                    className="py-3 flex items-center justify-between group cursor-pointer hover:bg-[#FBFBFA] px-2 rounded-lg transition-colors"
                  >
                    <span className="font-mono text-sm font-semibold text-gray-900 group-hover:text-[#137A43] transition-colors">
                      {item.name}
                    </span>
                    
                    <div className="flex items-center gap-3">
                      <span className="bg-[#E8F5E9] text-[#137A43] font-mono text-[11px] px-2.5 py-0.5 rounded-md font-semibold">
                        {item.status}
                      </span>
                      <span className="font-mono text-xs text-gray-700 flex items-center gap-1 group-hover:text-[#137A43] transition-colors">
                        {item.price}
                        <ArrowRightIcon size={11} className="text-gray-400 group-hover:text-[#137A43] group-hover:translate-x-0.5 transition-all" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Card 3: How It Works */}
          <div className="p-6 sm:p-7 flex flex-col justify-between bg-white/40">
            <div>
              <span className="text-[11px] font-mono font-bold tracking-widest text-[#137A43] uppercase block mb-2">
                HOW IT WORKS
              </span>
              <h2 className="font-serif font-bold text-2xl sm:text-3xl text-gray-900 leading-tight mb-8">
                Get your .arc name in just a few steps.
              </h2>

              <div className="space-y-6">
                <div className="flex items-start gap-3.5">
                  <div className="w-7 h-7 rounded-full bg-[#E8F5E9] text-[#137A43] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 font-mono">
                    1
                  </div>
                  <div>
                    <h4 className="font-sans font-semibold text-sm text-gray-900">
                      Search & check availability
                    </h4>
                    <p className="font-sans text-xs text-gray-500 mt-0.5">
                      Find your perfect name in seconds.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="w-7 h-7 rounded-full bg-[#E8F5E9] text-[#137A43] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 font-mono">
                    2
                  </div>
                  <div>
                    <h4 className="font-sans font-semibold text-sm text-gray-900">
                      Register your name
                    </h4>
                    <p className="font-sans text-xs text-gray-500 mt-0.5">
                      Secure it on Arc with a supported wallet.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="w-7 h-7 rounded-full bg-[#E8F5E9] text-[#137A43] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 font-mono">
                    3
                  </div>
                  <div>
                    <h4 className="font-sans font-semibold text-sm text-gray-900">
                      Start using it
                    </h4>
                    <p className="font-sans text-xs text-gray-500 mt-0.5">
                      Receive payments, manage your profile and more.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </section>
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
    <div className="w-full bg-[#FBFBFA] relative overflow-hidden min-h-screen">
      
      {/* HERO SECTION */}
      <section className="relative px-6 pt-12 pb-10 md:pt-16 md:pb-14 max-w-7xl mx-auto z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* LEFT: Eyebrow, Headline, Supporting copy, Real Name Search, Shortcuts */}
          <div className="lg:col-span-7 text-left">
            <p className="text-xs font-mono font-bold tracking-[0.2em] text-[#137A43] uppercase mb-4 select-none">
              ARC NAME SERVICE
            </p>

            <h1 className="text-4xl sm:text-6xl font-serif text-[#141413] tracking-tight leading-[1.08] mb-5">
              The sovereign naming layer <br className="hidden sm:inline" />
              for <span className="text-[#137A43]">Arc Network.</span>
            </h1>
            
            <p className="text-base sm:text-lg text-[#60605A] font-sans max-w-lg mb-8 leading-relaxed font-normal">
              Turn long blockchain addresses into human-readable .arc names.<br className="hidden sm:inline" />
              Send, receive, and manage your identity — all on Arc.
            </p>

            {/* Real Name Search Interaction matching reference */}
            <HeroNameSearch 
              navigateTo={navigateTo} 
              navigateToProfile={navigateToProfile} 
              auth={auth} 
              ans={ans} 
            />
          </div>

          {/* RIGHT: Abstract Arc 3D Sculpture Centerpiece + Stacked Caption */}
          <div className="lg:col-span-5 hidden md:flex items-center justify-center">
            <ArcGeometricCenterpiece />
          </div>

        </div>
      </section>

      {/* HORIZONTAL STRIP OF FIVE PRODUCT CAPABILITIES */}
      <ProductCapabilitiesStrip />

      {/* LOWER SECTION: 3-CARD SIDE-BY-SIDE GRID */}
      <LowerHomeGrid 
        navigateTo={navigateTo} 
        navigateToProfile={navigateToProfile} 
      />

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
    <div className="max-w-4xl mx-auto pt-14 pb-32 px-6">
      <div className="text-center mb-10">
        <p className="text-xs font-mono font-bold tracking-[0.2em] text-[#137A43] uppercase mb-3 select-none">
          ARC NAMESPACE REGISTRY
        </p>
        <h1 className="text-4xl md:text-5xl font-serif font-bold text-gray-900 mb-4 tracking-tight">
          Find your .arc name
        </h1>
        <p className="text-gray-500 font-sans text-base max-w-md mx-auto">
          Search for an available name or explore existing identities on Arc Network.
        </p>
      </div>

      <InteractiveSearch navigateToProfile={navigateToProfile} autoFocus auth={auth} ans={ans} />
      
      {recentNames.length > 0 && (
        <div className="mt-16 pt-12 border-t border-[#E5E5E2]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-serif font-bold text-gray-900 flex items-center gap-2">
              <Sparkles size={18} className="text-[#137A43]" /> Recently Registered
            </h3>
            <span className="text-xs font-mono text-gray-400 font-medium">Verified on Arc Testnet</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {recentNames.map(s => (
              <div 
                key={s} 
                onClick={() => navigateToProfile(s)}
                className="bg-white border border-[#E5E5E2] hover:border-[#137A43]/40 hover:shadow-md p-4 rounded-2xl flex items-center justify-between group cursor-pointer transition-all"
              >
                <div>
                  <span className="font-mono font-bold text-gray-900 block group-hover:text-[#137A43] transition-colors">{s}</span>
                  <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider font-semibold">Active Identity</span>
                </div>
                <div className="w-7 h-7 rounded-full bg-[#FBFBFA] border border-[#E5E5E2] group-hover:border-[#137A43]/30 flex items-center justify-center transition-colors">
                  <ArrowRightIcon size={12} className="text-gray-400 group-hover:text-[#137A43] group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const MarketplaceSellerBadge = ({
  sellerAddress,
  navigateTo,
}: {
  sellerAddress: string;
  navigateTo: (view: string, data?: string | null) => void;
}) => {
  const { profile } = useUserProfile(sellerAddress);
  return (
    <div className="text-right">
      <p className="text-gray-400 text-[10px] font-mono uppercase tracking-wider font-semibold mb-1">Seller</p>
      <button 
        onClick={() => navigateTo('userprofile', sellerAddress)}
        className="text-xs font-mono text-gray-800 hover:text-gray-900 bg-[#F5F5F3] hover:bg-[#EAEAE7] border border-[#E5E5E2] px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 ml-auto shadow-[0_1px_1px_rgba(0,0,0,0.02)]"
        title="View Seller Profile"
      >
        {profile.avatarUrl ? (
          <img src={profile.avatarUrl} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />
        ) : null}
        <span>{profile.displayName || `${sellerAddress.slice(0, 6)}...${sellerAddress.slice(-4)}`}</span>
      </button>
    </div>
  );
};

const TipRecipientProfileBadge = ({ resolvedAddress }: { resolvedAddress: string }) => {
  const { profile: resolvedProfile } = useUserProfile(resolvedAddress);
  if (!resolvedProfile.displayName) return null;
  return (
    <div className="mt-2.5 flex items-center gap-2 text-xs text-gray-700 bg-white border border-[#E5E5E2] px-3.5 py-1.5 rounded-full w-fit shadow-2xs">
      {resolvedProfile.avatarUrl && (
        <img src={resolvedProfile.avatarUrl} alt="" className="w-4 h-4 rounded-full object-cover" />
      )}
      <span className="font-sans font-bold text-gray-900">{resolvedProfile.displayName}</span>
      <ReputationBadge name={resolvedAddress} showDetails={false} />
    </div>
  );
};

const OwnerProfileSnippet = ({ 
  ownerStr, 
  navigateTo 
}: { 
  ownerStr: string; 
  navigateTo: (view: string, data?: string | null) => void;
}) => {
  const { profile: ownerProfile } = useUserProfile(ownerStr);
  if (!ownerProfile.displayName && !ownerProfile.bio && !ownerProfile.avatarUrl) return null;
  return (
    <div className="mt-4 p-4 bg-[#FBFBFA] border border-[#E5E5E2] rounded-2xl flex items-start gap-4">
      <div className="w-10 h-10 rounded-full bg-white border border-[#E5E5E2] flex items-center justify-center text-gray-900 font-serif font-bold text-sm shrink-0 shadow-sm overflow-hidden">
        {ownerProfile.avatarUrl ? (
          <img src={ownerProfile.avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          ownerProfile.avatar?.trim() || (ownerProfile.displayName ? ownerProfile.displayName.slice(0, 2).toUpperCase() : ownerStr.slice(0, 4))
        )}
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
    <div className="max-w-7xl mx-auto pt-14 pb-32 px-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-6 border-b border-[#E5E5E2] pb-8">
        <div>
          <p className="text-xs font-mono font-bold tracking-[0.2em] text-[#137A43] uppercase mb-2 select-none">
            SECONDARY NAMESPACE LEDGER
          </p>
          <h1 className="text-4xl font-serif font-bold text-gray-900 tracking-tight">Marketplace</h1>
          <p className="text-gray-500 font-sans text-base mt-1">Discover, verify, and acquire registered .arc identities via atomic escrow.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {['all', '3', '4', '5+'].map(f => (
            <button 
              key={f}
              className={`px-4 py-2 text-xs font-mono font-medium rounded-full transition-all border ${filter === f ? 'bg-[#141413] text-white border-[#141413] shadow-sm' : 'bg-white text-gray-700 border-[#E5E5E2] hover:border-[#137A43] hover:text-[#137A43]'}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All Records' : `${f} Letters`}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-gray-400">
          <RefreshCw size={24} className="animate-spin mx-auto mb-3 text-gray-400" />
          <p className="font-mono text-xs text-gray-500">Querying on-chain escrow listings on Arc Testnet...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-[#E5E5E2]">
          <div className="w-14 h-14 rounded-full bg-[#FBFBFA] border border-[#E5E5E2] flex items-center justify-center mx-auto mb-4 text-gray-400 shadow-sm">
            <Store size={24} />
          </div>
          <h3 className="text-xl font-serif font-bold text-gray-900 mb-2">No Active Marketplace Listings</h3>
          <p className="text-gray-500 font-sans text-sm max-w-md mx-auto mb-8 leading-relaxed">
            There are currently no .arc names listed for sale on the secondary market. Anyone who owns an identity can list their name directly through the My Names dashboard.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="primary" onClick={() => navigateTo('mynames')} className="text-xs font-mono font-semibold px-5 py-2.5">
              List from My Names
            </Button>
            <Button variant="secondary" onClick={() => navigateTo('names')} className="text-xs font-mono font-semibold px-5 py-2.5">
              Register a Name
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map(listing => {
            const isOwnListing = !!(auth.address && listing.seller.toLowerCase() === auth.address.toLowerCase());

            return (
              <Card key={listing.name} className="border-[#E5E5E2] bg-white shadow-sm flex flex-col p-6 hover:border-[#137A43]/40 transition-all">
                <div className="flex justify-between items-start mb-8">
                  <h3 className="text-2xl font-serif font-bold text-gray-900 cursor-pointer hover:text-[#137A43] transition-colors tracking-tight" onClick={() => navigateToProfile(listing.name)}>
                    {listing.name}
                  </h3>
                  <ReputationBadge name={listing.name} showDetails={false} />
                </div>
                <div className="mb-8 flex justify-between items-end">
                  <div>
                    <p className="text-gray-400 text-[10px] font-mono uppercase tracking-wider font-semibold mb-1">Asking Price</p>
                    <p className="text-2xl font-mono text-gray-900 font-bold tabular-nums">
                      {listing.price} <span className="text-xs font-mono text-gray-500 font-normal">USDC</span>
                    </p>
                  </div>
                  <MarketplaceSellerBadge sellerAddress={listing.seller} navigateTo={navigateTo} />
                </div>
                
                {isOwnListing ? (
                  <div className="mt-auto pt-4 border-t border-[#E5E5E2] flex flex-col xl:flex-row items-center justify-between gap-3">
                    <span className="text-[10px] font-mono font-semibold text-[#137A43] bg-[#E8F5E9] px-2.5 py-1 rounded-full border border-[#137A43]/20 whitespace-nowrap self-start xl:self-center">
                      Your Listing
                    </span>
                    <div className="flex items-center gap-2 w-full xl:w-auto">
                      <Button 
                        variant="secondary" 
                        className="text-xs font-mono py-1.5 px-3 flex-1 xl:flex-none justify-center"
                        onClick={() => handleListForSale(listing.name)}
                      >
                        Update Price
                      </Button>
                      <Button 
                        variant="secondary" 
                        className="text-xs font-mono py-1.5 px-3 text-red-600 hover:bg-red-50 hover:border-red-200 flex-1 xl:flex-none justify-center"
                        onClick={() => handleCancelListing(listing.name)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : selectedListing?.name === listing.name ? (
                  <div className="mt-auto border-t border-[#E5E5E2] pt-4 bg-[#FBFBFA] -mx-6 -mb-6 p-6 rounded-b-2xl">
                    {txState === 'success' ? (
                      <div className="text-center py-5 text-[#137A43] font-mono font-bold text-xs flex flex-col items-center justify-center gap-2">
                        <CheckCircle2 size={20} strokeWidth={2.5} />
                        <span>Done! Purchase Complete</span>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2.5 mb-5 text-xs font-mono text-gray-600">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Asset Price</span>
                            <span className="text-gray-900 font-medium tabular-nums">{calculateFees(listing.price).price} USDC</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Protocol Fee (2.5%)</span>
                            <span className="text-gray-500 tabular-nums">{calculateFees(listing.price).fee} USDC</span>
                          </div>
                          <div className="flex justify-between text-gray-900 pt-2.5 border-t border-[#E5E5E2] font-bold">
                            <span>Total Settlement</span>
                            <span className="text-[#137A43] tabular-nums">{calculateFees(listing.price).total} USDC</span>
                          </div>
                          <div className="text-[10px] text-gray-500 font-mono mt-2 flex items-start gap-1.5 bg-white p-2 rounded-xl border border-[#E5E5E2]">
                            <Info size={11} className="shrink-0 mt-0.5 text-[#137A43]" />
                            <span>Atomic escrow guarantees instant title transfer upon settlement.</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="secondary" className="px-3" onClick={() => { setSelectedListing(null); setTxState('idle'); }}>
                            <X size={15} />
                          </Button>
                          <Button variant="accent" className="flex-1 text-xs font-mono font-semibold py-2.5" onClick={() => handleBuy(listing)} disabled={txState !== 'idle'}>
                            {txState === 'idle' ? 'Confirm Settlement' : txState === 'approving' ? 'Approving USDC...' : 'Executing Purchase...'}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="mt-auto pt-4 border-t border-[#E5E5E2]">
                    <Button variant="secondary" className="w-full text-xs font-sans font-medium py-2.5" onClick={() => setSelectedListing(listing)}>
                      Purchase Record
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
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-[#137A43]/5 rounded-full blur-3xl pointer-events-none group-hover:bg-[#137A43]/10 transition-colors duration-700" />
        <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-[#137A43]/5 rounded-full blur-3xl pointer-events-none group-hover:bg-[#137A43]/10 transition-colors duration-700" />
        
        <div className="w-20 h-20 rounded-[24px] bg-white border border-[#137A43]/10 flex items-center justify-center mx-auto mb-8 shadow-sm relative z-10 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#137A43]/5 to-[#137A43]/10" />
          <Fingerprint size={36} strokeWidth={1.5} className="text-[#137A43] relative z-10" />
        </div>
        
        <h2 className="text-2xl sm:text-[32px] tracking-tight font-serif font-bold text-gray-900 mb-4 relative z-10">
          Secure Sign In
        </h2>
        
        <p className="text-gray-500 font-sans text-sm sm:text-[15px] mb-8 leading-relaxed relative z-10 max-w-[360px] mx-auto">
          {actionText}.
        </p>

        <div className="flex items-center justify-center gap-2 mb-10 relative z-10">
           <span className="px-3.5 py-1.5 bg-gray-50 border border-gray-200/75 rounded-full text-[11px] font-sans font-bold text-gray-500 tracking-wider uppercase flex items-center gap-1.5 shadow-sm">
             <Shield size={14} strokeWidth={2.5} className="text-[#137A43]" />
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
    if (status === 'healthy') return <span className="px-3 py-0.5 bg-[#E8F5E9] text-[#137A43] border border-[#137A43]/20 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider">Active</span>;
    if (status === 'expiring') return <span className="px-3 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1"><AlertCircle size={10}/> Expiring</span>;
    return <span className="px-3 py-0.5 bg-red-50 text-red-600 border border-red-200 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider">Expired</span>;
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
    <div className="max-w-5xl mx-auto pt-14 pb-32 px-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-10 border-b border-[#E5E5E2] pb-8 gap-6">
        <div>
          <p className="text-xs font-mono font-bold tracking-[0.2em] text-[#137A43] uppercase mb-2 select-none">
            IDENTITY MANAGEMENT
          </p>
          <h1 className="text-4xl font-serif font-bold text-gray-900 tracking-tight">My Names</h1>
          <p className="text-gray-500 font-sans text-base mt-1">Manage, renew, delegate, and trade your active .arc identities.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {balance !== undefined && (
            <div className="bg-white px-5 py-3 rounded-2xl border border-[#E5E5E2] shadow-sm">
              <p className="text-gray-400 text-[10px] font-mono uppercase tracking-wider font-semibold mb-1">Settlement Balance</p>
              <p className="text-2xl font-mono text-[#137A43] font-bold tabular-nums">
                {balance} <span className="text-gray-500 text-xs font-mono font-normal">USDC</span>
              </p>
            </div>
          )}
          <div className="text-left sm:text-right bg-white px-5 py-3 rounded-2xl border border-[#E5E5E2] shadow-sm min-w-[140px]">
            <div className="flex items-center justify-between sm:justify-end gap-2 mb-1">
              <span className="text-gray-400 text-[10px] font-mono uppercase tracking-wider font-semibold">Wallet Quota</span>
              <div className="flex items-center gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={`w-2.5 h-2.5 rounded-sm transition-all ${
                      i < usedCount 
                        ? 'bg-[#137A43] shadow-sm' 
                        : 'border border-[#E5E5E2] bg-[#F5F5F3]'
                    }`}
                    title={i < usedCount ? `Slot ${i + 1}: Registered` : `Slot ${i + 1}: Available`}
                  />
                ))}
              </div>
            </div>
            <p className="text-2xl font-mono text-gray-900 font-bold tabular-nums">
              {usedCount} <span className="text-gray-500 text-xs font-mono font-normal">/ 3 Max</span>
            </p>
          </div>
        </div>
      </div>

      {auth.address && (
        <div className="mb-8 p-4 sm:p-5 bg-white border border-[#E5E5E2] rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-[#F5F5F3] border border-[#E5E5E2] flex items-center justify-center text-gray-700 shrink-0">
              <Wallet size={18} />
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider font-semibold text-gray-500">Connected Smart Account</p>
              <p className="font-mono text-xs sm:text-sm font-semibold text-gray-900 break-all">{auth.address}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={() => {
                navigator.clipboard.writeText(auth.address!);
                toast.success('Address copied to clipboard!');
              }}
              className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-3.5 py-2 bg-[#FBFBFA] hover:bg-[#F0F0EE] text-gray-800 border border-[#E5E5E2] rounded-lg font-mono text-xs font-semibold transition-all shadow-sm active:scale-95 shrink-0"
            >
              <Copy size={13} className="text-gray-500" />
              <span>Copy Address</span>
            </button>
            <Button
              variant="primary"
              onClick={() => navigateTo('send')}
              className="flex-1 sm:flex-none py-2 px-4 text-xs font-mono font-semibold"
            >
              <Send size={13}/> Send Payment
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {namesList.map(nameItem => (
          <Card key={nameItem.name} hoverable className="border-[#E5E5E2] bg-white shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 p-6 relative overflow-visible">
            <div className="flex items-center gap-5">
              <div className="w-12 h-12 rounded-xl bg-[#F5F5F3] border border-[#E5E5E2] flex items-center justify-center text-gray-900 font-serif font-bold text-xl shadow-sm shrink-0">
                {nameItem.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                  <h3 
                    className="text-2xl font-serif font-bold text-gray-900 flex items-center gap-2 cursor-pointer hover:text-[#137A43] transition-colors tracking-tight"
                    onClick={() => navigateTo('profile', nameItem.name)}
                  >
                    {nameItem.name}
                    {nameItem.isPrimary && (
                      <span className="text-[#137A43] text-[10px] font-mono font-semibold px-2.5 py-0.5 border border-[#137A43]/20 bg-[#E8F5E9] rounded-full uppercase tracking-wider flex items-center gap-1">
                        <Star size={10} className="fill-[#137A43]" /> Main
                      </span>
                    )}
                    {nameItem.listed && (
                      <span className="text-amber-800 text-[10px] font-mono font-semibold px-2.5 py-0.5 border border-amber-200 bg-amber-50 rounded-full uppercase tracking-wider">
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
                    className="p-0.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                  >
                    <Copy size={11} />
                  </button>
                </p>
                <p className="text-gray-500 text-xs font-mono flex items-center gap-2">
                  Expires: <span className="tabular-nums">{new Date(nameItem.expiry).toLocaleDateString()}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0 pt-4 sm:pt-0 border-t border-[#E5E5E2] sm:border-0">
              {!nameItem.isPrimary && (
                <button
                  onClick={() => handleSetPrimary(nameItem.name)}
                  className="px-3 py-2 text-xs font-mono font-semibold text-gray-700 hover:text-[#137A43] border border-[#E5E5E2] hover:border-[#137A43]/30 rounded-full bg-white hover:bg-[#E8F5E9]/50 transition-colors flex items-center gap-1.5 shadow-2xs"
                  title="Set as your primary main identity across Arc"
                >
                  <Star size={12} className="text-gray-400" /> Set Main
                </button>
              )}

              {(nameItem.status === 'expiring' || nameItem.status === 'expired') && (
                <Button variant="accent" className="flex-1 sm:flex-none py-2 px-3 text-xs font-mono font-semibold" onClick={() => handleRenew(nameItem.name)}>
                  Renew
                </Button>
              )}
              
              <div className="relative group flex-1 sm:flex-none">
                <Button variant="secondary" className="w-full sm:w-auto px-4 py-2 text-xs font-sans font-medium flex items-center justify-center gap-1.5">
                  Manage <ChevronDown size={13} />
                </Button>
                <div className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-[#E5E5E2] rounded-2xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-20 py-1.5 overflow-hidden">
                  {!nameItem.isPrimary && (
                    <button onClick={() => handleSetPrimary(nameItem.name)} className="w-full text-left px-4 py-2.5 text-xs text-gray-800 hover:bg-[#F5F5F3] font-mono transition-colors flex items-center gap-2.5">
                      <Star size={14} className="text-[#137A43]" /> Set as Main Identity
                    </button>
                  )}
                  <button onClick={() => navigateTo('send', nameItem.name)} className="w-full text-left px-4 py-2.5 text-xs text-gray-800 hover:bg-[#F5F5F3] font-mono transition-colors flex items-center gap-2.5">
                    <Send size={14} className="text-gray-400"/> Send Payment
                  </button>
                  <button onClick={() => handleRenew(nameItem.name)} className="w-full text-left px-4 py-2.5 text-xs text-gray-800 hover:bg-[#F5F5F3] font-mono transition-colors flex items-center gap-2.5">
                    <RefreshCw size={14} className="text-gray-400"/> Renew Record
                  </button>
                  <button onClick={() => handleTransfer(nameItem.name)} className="w-full text-left px-4 py-2.5 text-xs text-gray-800 hover:bg-[#F5F5F3] font-mono transition-colors flex items-center gap-2.5">
                    <ArrowRightLeft size={14} className="text-gray-400"/> Transfer Record
                  </button>
                  {nameItem.listed ? (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); handleListForSale(nameItem.name); }} className="w-full text-left px-4 py-2.5 text-xs text-gray-800 hover:bg-[#F5F5F3] font-mono transition-colors flex items-center gap-2.5">
                        <Tag size={14} className="text-gray-400"/> Update Price
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleCancelListing(nameItem.name); }} className="w-full text-left px-4 py-2.5 text-xs text-red-600 hover:bg-red-50 font-mono transition-colors flex items-center gap-2.5">
                        <Tag size={14} className="text-red-500"/> Cancel Listing
                      </button>
                    </>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); handleListForSale(nameItem.name); }} className="w-full text-left px-4 py-2.5 text-xs text-gray-800 hover:bg-[#F5F5F3] font-mono transition-colors flex items-center gap-2.5">
                      <Tag size={14} className="text-gray-400"/> List for Sale
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
            <Button variant="accent" onClick={() => navigateTo('names')} className="mx-auto text-sm px-8 py-3">
              Register a Name
            </Button>
          </Card>
        )}
      </div>

      {transferModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md bg-white shadow-2xl relative rounded-2xl border-[#E5E5E2] p-8">
            <h3 className="text-xl font-serif font-bold text-gray-900 mb-2">Transfer {transferModal.name}</h3>
            <p className="text-sm text-gray-500 font-sans mb-6">Enter the recipient's wallet address or .arc name.</p>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 font-mono">Recipient</label>
                <input
                  type="text"
                  value={transferModal.to}
                  onChange={(e) => setTransferModal(prev => ({ ...prev, to: e.target.value }))}
                  disabled={transferModal.pending}
                  placeholder="0x... or name.arc"
                  className="w-full p-3.5 bg-[#FBFBFA] border border-[#E5E5E2] rounded-xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#137A43]/20 focus:border-[#137A43] transition-all"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={() => setTransferModal(prev => ({ ...prev, isOpen: false }))} disabled={transferModal.pending} className="px-5 py-2.5">
                Cancel
              </Button>
              <Button variant="accent" onClick={submitTransfer} disabled={!transferModal.to || transferModal.pending} className="px-5 py-2.5">
                {transferModal.pending ? 'Transferring...' : 'Transfer Name'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {listingModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md bg-white shadow-2xl relative rounded-2xl border-[#E5E5E2] p-8">
            <h3 className="text-xl font-serif font-bold text-gray-900 mb-2">List {listingModal.name} for Sale</h3>
            <p className="text-sm text-gray-500 font-sans mb-6">Set a price in USDC. A 2.5% protocol fee will be deducted from your proceeds upon sale.</p>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-mono font-bold text-gray-700 uppercase tracking-wider mb-2">Price (USDC)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={listingModal.price}
                    onChange={(e) => setListingModal(prev => ({ ...prev, price: e.target.value }))}
                    disabled={listingModal.pending}
                    placeholder="50"
                    className="w-full p-3.5 pl-4 pr-16 bg-[#FBFBFA] border border-[#E5E5E2] rounded-xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#137A43]/20 focus:border-[#137A43] transition-all"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-gray-400 font-medium text-xs">USDC</span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={() => setListingModal(prev => ({ ...prev, isOpen: false }))} disabled={listingModal.pending} className="px-5 py-2.5">
                Cancel
              </Button>
              <Button variant="accent" onClick={submitListing} disabled={!listingModal.price || listingModal.pending} className="px-5 py-2.5">
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
      <div className="max-w-lg mx-auto pt-16 px-6 pb-32">
        <Card className="text-center py-12 border-[#137A43]/20 bg-[#E8F5E9]/30 shadow-sm p-8">
          <div className="w-14 h-14 rounded-full bg-[#E8F5E9] text-[#137A43] flex items-center justify-center mx-auto mb-5">
            <Check size={28} strokeWidth={2.5} />
          </div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#137A43] font-bold block mb-1">
            Settlement Confirmed
          </span>
          <h3 className="text-2xl font-serif font-bold text-gray-900 mb-2">Payment Dispatched</h3>
          <p className="text-gray-600 font-sans mb-8 text-sm leading-relaxed">
            Successfully transferred <span className="font-mono text-gray-900 font-bold tabular-nums">{amount} USDC</span> to <span className="font-mono font-semibold text-gray-900">{recipient}</span>.
          </p>
          <div className="flex flex-col gap-2.5">
            {txHash && (
              <Button 
                variant="secondary" 
                className="w-full py-2.5 text-xs font-mono"
                onClick={() => window.open(`https://explorer.testnet.arc.io/tx/${txHash}`, '_blank')}
              >
                View on Arc Explorer <ArrowUpRight size={13}/>
              </Button>
            )}
            <Button variant="accent" onClick={() => { setStep('edit'); setRecipient(''); setAmount(''); setNote(''); setTxStatus('idle'); }} className="w-full py-3 text-xs font-sans font-medium">
              Execute Another Payment
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pt-14 pb-32 px-6">
      <div className="mb-10 border-b border-[#E5E5E2] pb-8">
        <p className="text-xs font-mono font-bold tracking-[0.2em] text-[#137A43] uppercase mb-2 select-none">
          DIRECT USDC SETTLEMENT CONSOLE
        </p>
        <h1 className="text-4xl font-serif font-bold text-gray-900 tracking-tight">Send Payment</h1>
        <p className="text-gray-500 font-sans text-base mt-1">Transfer USDC directly using verifiable .arc names instead of long wallet addresses.</p>
      </div>

      <Card className="border-[#E5E5E2] bg-white shadow-sm p-6 sm:p-8">
        {step === 'edit' ? (
          <div className="space-y-6">
            <div>
              <label className="block text-gray-500 font-mono text-[11px] uppercase tracking-wider font-semibold mb-2">
                Recipient Target
              </label>
              <div className="relative">
                <input 
                  type="text" 
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="e.g. alex.arc or 0x..."
                  className="w-full bg-[#FBFBFA] border border-[#E5E5E2] text-gray-900 font-mono text-lg p-3.5 pl-4 rounded-xl focus:outline-none focus:border-[#137A43] focus:bg-white transition-all"
                />
                {isResolved && (
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs bg-white px-2.5 py-1 rounded-full border border-[#E5E5E2] shadow-2xs">
                    <span className="font-mono text-gray-600 text-xs tabular-nums">
                      {resolvedAddress?.startsWith('0x') && resolvedAddress.length === 42 ? `${resolvedAddress.slice(0, 6)}...${resolvedAddress.slice(-4)}` : resolvedAddress}
                    </span>
                    <CheckCircle2 size={14} className="text-[#137A43]" />
                  </div>
                )}
              </div>
              {resolvedAddress && resolvedAddress.startsWith('0x') && resolvedAddress.length === 42 && (
                <TipRecipientProfileBadge resolvedAddress={resolvedAddress} />
              )}
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-gray-500 font-mono text-[11px] uppercase tracking-wider font-semibold">
                  Amount (USDC)
                </label>
                {balance !== undefined && (
                  <span className="text-xs font-mono text-gray-500">
                    Settlement Balance: <span className="font-bold text-gray-800 tabular-nums">{balance} USDC</span>
                  </span>
                )}
              </div>
              <div className="relative mb-3">
                <input 
                  type="number" 
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-[#FBFBFA] border border-[#E5E5E2] text-gray-900 font-mono text-3xl font-bold p-3.5 pl-4 rounded-xl focus:outline-none focus:border-[#137A43] focus:bg-white transition-all tabular-nums"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-sm text-gray-400 font-bold">
                  USDC
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[5, 10, 25, 50, 100].map(amt => (
                  <button 
                    key={amt}
                    onClick={() => setAmount(amt.toString())}
                    className="py-2 text-xs font-mono font-semibold border border-[#E5E5E2] rounded-full text-gray-700 hover:border-[#137A43] hover:text-[#137A43] transition-colors bg-white shadow-2xs tabular-nums"
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-gray-500 font-mono text-[11px] uppercase tracking-wider font-semibold mb-2">
                Public Settlement Note (Optional)
              </label>
              <input 
                type="text" 
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reference or memo for counterparty..."
                className="w-full bg-[#FBFBFA] border border-[#E5E5E2] text-gray-900 font-mono p-3 pl-4 rounded-xl focus:outline-none focus:border-[#137A43] focus:bg-white transition-all text-xs"
                maxLength={60}
              />
            </div>

            <div className="pt-2">
              <Button 
                variant="accent"
                className="w-full py-3.5 text-sm font-sans font-medium" 
                onClick={handleReview}
                disabled={!recipient || !amount}
              >
                Review Settlement Order
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="border-b border-[#E5E5E2] pb-4 flex items-center justify-between">
              <h3 className="text-gray-900 font-serif font-bold text-lg flex items-center gap-2">
                <CreditCard size={18} className="text-[#137A43]"/> Settlement Order Verification
              </h3>
              <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider font-semibold">Atomic Transfer</span>
            </div>
            
            <div className="space-y-4 font-mono">
              <div className="bg-[#FBFBFA] border border-[#E5E5E2] p-4 rounded-2xl">
                <span className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold block mb-1.5">Recipient Target</span>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-gray-900 font-serif font-bold text-xl">{recipient}</div>
                    {isResolved && <div className="text-gray-500 text-xs mt-0.5">{resolvedAddress}</div>}
                  </div>
                  {isResolved && <ReputationBadge name={recipient} showDetails={false} />}
                </div>
              </div>
              
              <div className="flex justify-between items-end py-4 border-y border-[#E5E5E2]">
                <span className="text-gray-500 text-[11px] uppercase tracking-wider font-semibold">Total USDC Transfer</span>
                <span className="text-3xl font-mono text-gray-900 font-bold tabular-nums">
                  {amount} <span className="text-sm text-gray-400 font-normal">USDC</span>
                </span>
              </div>

              {note && (
                <div className="bg-[#FBFBFA] p-3 rounded-xl border border-[#E5E5E2]">
                  <span className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold block mb-1">On-Chain Memo</span>
                  <p className="text-gray-900 text-xs italic">"{note}"</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={() => setStep('edit')} disabled={txStatus !== 'idle'} className="px-5 text-xs font-mono">
                Back
              </Button>
              <Button variant="accent" className="flex-1 py-3 text-xs font-mono font-semibold" onClick={handleConfirm} disabled={txStatus !== 'idle'}>
                {txStatus === 'idle' && 'Authorize Transfer via Passkey'}
                {txStatus === 'approving' && 'Approving USDC Settlement...'}
                {txStatus === 'confirming' && 'Dispatching Payment...'}
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
        <Button variant="accent" onClick={() => navigateTo('names')} className="mx-auto px-10 py-3.5">Register Now</Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pt-14 pb-32 px-6">
      <Card noPadding className="overflow-hidden shadow-sm border-[#E5E5E2] rounded-2xl">
        <div className="bg-white p-8 md:p-12 border-b border-[#E5E5E2] flex flex-col md:flex-row items-start md:items-end justify-between gap-8 relative overflow-hidden">
          
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
                className="text-xs font-sans font-semibold text-[#137A43] hover:underline flex items-center gap-1"
              >
                View owner profile →
              </button>
            </div>

            <OwnerProfileSnippet ownerStr={ownerStr} navigateTo={navigateTo} />
          </div>
          
          <div className="flex flex-col gap-2.5 w-full md:w-auto z-10 shrink-0">
            <Button variant="accent" onClick={() => navigateTo('send', name)} className="w-full md:w-auto py-3 px-6 text-xs font-sans font-medium">
              <Send size={13} className="mr-1.5 inline" /> Send Payment
            </Button>
            {listingPrice !== null && (
              <Button variant="primary" onClick={() => navigateTo('marketplace')} className="w-full md:w-auto py-3 px-6 text-xs font-mono font-semibold">
                Acquire via Escrow: {listingPrice} USDC
              </Button>
            )}
          </div>
        </div>

        <div className="p-8 md:p-12 bg-[#FBFBFA]">
          <h3 className="text-xl font-serif font-bold text-gray-900 mb-8 flex items-center gap-3">
            <History size={18} className="text-[#137A43]" /> Activity Ledger
          </h3>
          
          {activities.length > 0 ? (
            <div className="space-y-2">
              {activities.map((tx) => {
                const getActionIcon = () => {
                  switch (tx.action) {
                    case 'Registered Name':
                      return <Shield size={18} className="text-[#137A43]" />;
                    case 'Received Tip':
                      return <Zap size={18} className="text-amber-500" />;
                    case 'Bought Name':
                      return <Store size={18} className="text-[#137A43]" />;
                    case 'Gifted Name':
                      return <Gift size={18} className="text-[#137A43]" />;
                    case 'Renewed Name':
                      return <RefreshCw size={18} className="text-[#137A43]" />;
                    case 'Listed for Sale':
                      return <Tag size={18} className="text-gray-600" />;
                    default:
                      return <ArrowRightLeft size={18} className="text-gray-400" />;
                  }
                };

                return (
                  <div key={tx.id} className="flex flex-col sm:flex-row justify-between sm:items-center py-4 border-b border-[#E5E5E2] last:border-0 gap-4 hover:bg-white -mx-3 px-3 rounded-xl transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-white border border-[#E5E5E2] flex items-center justify-center shadow-sm shrink-0">
                        {getActionIcon()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-gray-900 font-sans font-semibold text-sm">{tx.action}</p>
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
                        <p className="text-gray-500 font-mono text-xs mt-0.5">
                          {tx.from}
                          {tx.note && <span className="text-gray-600 font-sans italic ml-2">"{tx.note}"</span>}
                        </p>
                      </div>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-gray-900 font-mono font-bold text-sm tabular-nums">{tx.amount}</p>
                      <p className="text-gray-400 font-mono text-[11px] mt-0.5">{formatRelativeTime(tx.timestamp)}</p>
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
  const [isBannerSaving, setIsBannerSaving] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  
  const { setAvatar } = useANS(auth.credential);

  useEffect(() => {
    // 1. Instantly show local cached profile
    const p = loadProfile(targetAddress);
    setProfile(p);
    setFormData(p);

    // 2. Fetch remote profile from Supabase globally
    let isCancelled = false;
    fetchProfileGlobal(targetAddress).then((remote) => {
      if (!isCancelled && remote) {
        setProfile(remote);
        setFormData(remote);
      }
    });

    // 3. Real-time subscription to profile updates
    const unsubscribe = subscribeToProfile(targetAddress, (updated) => {
      if (!isCancelled) {
        setProfile(updated);
        setFormData(updated);
      }
    });

    return () => {
      isCancelled = true;
      unsubscribe();
    };
  }, [targetAddress]);

  const isOwner = !!(auth.address && targetAddress && auth.address.toLowerCase() === targetAddress.toLowerCase());

  const handleCopy = async () => {
    await navigator.clipboard.writeText(targetAddress);
    setCopied(true);
    toast.success('Address copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingProfile(true);
      toast.loading('Saving profile globally...', { id: 'save-profile' });
      const res = await saveProfileGlobal(formData);
      setProfile(formData);
      setIsEditing(false);
      if (res.globalSaved) {
        toast.success('Profile saved and published globally!', { id: 'save-profile' });
      } else {
        toast.success('Profile saved locally!', { id: 'save-profile', description: res.error });
      }
    } catch (err: any) {
      console.error('Failed to save profile:', err);
      toast.error('Failed to save profile', { id: 'save-profile' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be smaller than 10MB");
      return;
    }

    try {
      setIsAvatarSaving(true);
      toast.loading("Compressing and saving avatar...", { id: "pfp-save" });
      const base64Url = await compressImage(file, 400, 400, 0.85);
      const updatedProfile = { ...profile, avatarUrl: base64Url };
      
      const res = await saveProfileGlobal(updatedProfile);
      setProfile(updatedProfile);
      setFormData(updatedProfile);
      
      if (res.globalSaved) {
        toast.success("Profile photo updated globally!", { id: "pfp-save" });
      } else {
        toast.success("Avatar updated locally!", { id: "pfp-save", description: res.error });
      }
    } catch (err) {
      console.error("Avatar upload failed:", err);
      toast.error("Failed to upload avatar", { id: "pfp-save" });
    } finally {
      setIsAvatarSaving(false);
      e.target.value = '';
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be smaller than 10MB");
      return;
    }

    try {
      setIsBannerSaving(true);
      toast.loading("Compressing and saving banner...", { id: "banner-save" });
      const base64Url = await compressImage(file, 1400, 500, 0.85);
      const updatedProfile = { ...profile, bannerUrl: base64Url };
      
      const res = await saveProfileGlobal(updatedProfile);
      setProfile(updatedProfile);
      setFormData(updatedProfile);
      
      if (res.globalSaved) {
        toast.success("Banner updated globally across all devices!", { id: "banner-save" });
      } else {
        toast.success("Banner saved locally!", { id: "banner-save", description: res.error });
      }
    } catch (err) {
      console.error("Banner upload failed:", err);
      toast.error("Failed to upload banner", { id: "banner-save" });
    } finally {
      setIsBannerSaving(false);
      e.target.value = '';
    }
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
      <div 
        className="w-full h-48 md:h-64 relative group border-b border-gray-200 overflow-hidden" 
        style={{ 
          background: profile.bannerUrl 
            ? `url("${profile.bannerUrl}") center/cover no-repeat` 
            : bannerGradient 
        }}
      >
        {isOwner && (
          <label 
            className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border border-white/20 backdrop-blur-md cursor-pointer shadow-lg hover:scale-105 active:scale-95"
            title="Edit banner image"
          >
            <Camera size={14} />
            <span>{isBannerSaving ? 'Saving Banner...' : 'Edit Banner'}</span>
            <input 
              type="file" 
              className="hidden" 
              accept="image/*" 
              disabled={isBannerSaving}
              onChange={handleBannerUpload} 
            />
          </label>
        )}
      </div>

      <div className="max-w-[1400px] mx-auto px-6 pb-32">
        {/* Profile Header */}
        <div className="relative -mt-16 md:-mt-20 mb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="flex flex-col gap-4 w-full md:w-auto z-10">
            <div className="w-32 h-32 md:w-40 md:h-40 rounded-2xl border-4 border-white bg-gray-100 flex items-center justify-center text-gray-900 font-serif font-bold text-4xl shadow-xl overflow-hidden shrink-0 relative group">
              {onchainAvatarUrl || profile.avatarUrl ? (
                <img src={(onchainAvatarUrl as string) || profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                avatarDisplay
              )}
              {isOwner && (
                <label 
                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity cursor-pointer text-white"
                  title="Upload profile picture"
                >
                  <Camera size={24} className="mb-1" />
                  <span className="text-[10px] font-bold">{isAvatarSaving ? 'Saving...' : 'Upload PFP'}</span>
                  <input type="file" className="hidden" accept="image/*" disabled={isAvatarSaving} onChange={handleImageUpload} />
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
                  {copied ? <Check size={14} className="text-[#137A43]" /> : <Copy size={14} />}
                </button>
                <span className="text-gray-600 mx-1">|</span>
                <span className="font-sans text-xs">Joined {repStats.since}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto mt-4 md:mt-0 z-10">
            {isOwner && (
              <Button variant="secondary" onClick={() => setIsEditing(!isEditing)} className="text-sm bg-white border-[#E5E5E2] text-gray-900 hover:bg-gray-100">
                <Edit3 size={16} className="mr-2" /> Edit Profile
              </Button>
            )}
            <Button variant="secondary" onClick={handleCopy} className="text-sm bg-white border-[#E5E5E2] text-gray-900 hover:bg-gray-100">
               <Share size={16} className="mr-2" /> Share
            </Button>
          </div>
        </div>

        {/* Tabs with exact active green underline indicator */}
        <div className="flex items-center gap-8 border-b border-[#E5E5E2] mb-8 overflow-x-auto no-scrollbar">
          {(['overview', 'portfolio', 'activity'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3.5 text-sm font-sans font-medium capitalize whitespace-nowrap border-b-2 transition-colors ${activeTab === tab ? 'border-[#137A43] text-gray-900 font-semibold' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
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
                 <form onSubmit={handleSave} className="bg-white border border-[#E5E5E2] rounded-2xl p-8 space-y-6 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h3 className="font-serif font-bold text-xl text-gray-900">Edit Profile</h3>
                      <span className="text-xs text-[#137A43] font-sans font-semibold flex items-center gap-1.5 bg-[#E8F5E9] px-2.5 py-1 rounded-full border border-[#137A43]/20">
                        <span className="w-2 h-2 rounded-full bg-[#137A43] animate-pulse"></span>
                        Global Profile
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-[11px] font-sans font-bold uppercase tracking-wider text-gray-500 mb-2">Display Name</label>
                        <input type="text" value={formData.displayName || ''} onChange={(e) => setFormData(p => ({ ...p, displayName: e.target.value }))} placeholder="e.g. Alice Nakamoto" className="w-full bg-[#FBFBFA] border border-[#E5E5E2] text-gray-900 font-sans p-3 rounded-xl focus:outline-none focus:border-[#137A43] text-sm" />
                      </div>
                      <div>
                        <label className="block text-[11px] font-sans font-bold uppercase tracking-wider text-gray-500 mb-2">Email</label>
                        <input type="email" value={formData.email || ''} onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))} placeholder="alice@example.com" className="w-full bg-[#FBFBFA] border border-[#E5E5E2] text-gray-900 font-sans p-3 rounded-xl focus:outline-none focus:border-[#137A43] text-sm" />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-[11px] font-sans font-bold uppercase tracking-wider text-gray-500">Bio</label>
                        <span className="text-xs font-mono text-gray-500">{(formData.bio?.length || 0)}/160</span>
                      </div>
                      <textarea maxLength={160} rows={3} value={formData.bio || ''} onChange={(e) => setFormData(p => ({ ...p, bio: e.target.value }))} placeholder="Tell the community about yourself (max 160 chars)..." className="w-full bg-[#FBFBFA] border border-[#E5E5E2] text-gray-900 font-sans p-3 rounded-xl focus:outline-none focus:border-[#137A43] text-sm resize-none" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-[11px] font-sans font-bold uppercase tracking-wider text-gray-500 mb-2">Twitter Handle</label>
                        <div className="flex rounded-xl border border-[#E5E5E2] overflow-hidden bg-[#FBFBFA] focus-within:border-[#137A43]">
                          <span className="px-3.5 py-3 text-gray-500 text-sm font-mono flex items-center bg-[#FBFBFA] border-r border-[#E5E5E2]">@</span>
                          <input type="text" value={formData.twitter || ''} onChange={(e) => setFormData(p => ({ ...p, twitter: e.target.value.replace(/^@/, '') }))} placeholder="handle" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 focus:outline-none font-sans" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-sans font-bold uppercase tracking-wider text-gray-500 mb-2">Website URL</label>
                        <input type="url" value={formData.website || ''} onChange={(e) => setFormData(p => ({ ...p, website: e.target.value }))} placeholder="https://example.com" className="w-full bg-[#FBFBFA] border border-[#E5E5E2] text-gray-900 font-sans p-3 rounded-xl focus:outline-none focus:border-[#137A43] text-sm" />
                      </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button variant="accent" type="submit" disabled={isSavingProfile} className="text-sm px-6">
                        {isSavingProfile ? 'Saving...' : 'Save Profile'}
                      </Button>
                      <Button variant="secondary" type="button" disabled={isSavingProfile} onClick={() => { setFormData(profile); setIsEditing(false); }} className="text-sm px-6">
                        Cancel
                      </Button>
                    </div>
                 </form>
               ) : (
                 <div className="bg-white border border-[#E5E5E2] rounded-2xl p-6 shadow-sm">
                    <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2"><Info size={14} /> About</h3>
                    {profile.bio ? (
                      <p className="text-gray-700 font-sans text-base leading-relaxed">{profile.bio}</p>
                    ) : (
                      <p className="text-gray-500 font-sans text-sm italic">No bio provided yet.</p>
                    )}
                    
                    <div className="flex flex-wrap items-center gap-6 text-sm font-sans text-gray-500 pt-6 mt-6 border-t border-[#E5E5E2]">
                      {isOwner && profile.email && (
                        <span className="flex items-center gap-1.5 text-gray-600" title="Private to your wallet">
                          <Mail size={16} className="text-gray-500" /> {profile.email}
                        </span>
                      )}
                      {profile.twitter && (
                        <a href={`https://twitter.com/${profile.twitter}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-gray-700 hover:text-gray-900 hover:underline font-medium">
                          <span>@{profile.twitter}</span>
                        </a>
                      )}
                      {profile.website && (
                        <a href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[#137A43] hover:underline font-medium">
                          <ArrowUpRight size={14} /> {profile.website.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                    </div>
                 </div>
               )}
            </div>
            
            <div className="space-y-6">
               <div className="bg-white border border-[#E5E5E2] rounded-2xl p-6 shadow-sm">
                 <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-gray-500 mb-4">Reputation Stats</h3>
                 <div className="grid grid-cols-2 gap-4">
                   <div className="bg-[#FBFBFA] rounded-xl p-3 border border-[#E5E5E2]">
                     <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-gray-500">Member Since</p>
                     <p className="text-sm font-mono font-bold text-gray-900 mt-1">{repStats.since}</p>
                   </div>
                   <div className="bg-[#FBFBFA] rounded-xl p-3 border border-[#E5E5E2]">
                     <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-gray-500">Tier</p>
                     <p className="text-sm font-mono font-bold text-gray-900 mt-1">{repStats.tier}</p>
                   </div>
                   <div className="bg-[#FBFBFA] rounded-xl p-3 border border-[#E5E5E2]">
                     <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-gray-500">Trades</p>
                     <p className="text-sm font-mono font-bold text-gray-900 mt-1">{repStats.sales + repStats.buys}</p>
                   </div>
                   <div className="bg-[#FBFBFA] rounded-xl p-3 border border-[#E5E5E2]">
                     <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-gray-500">Tips / Gifts</p>
                     <p className="text-sm font-mono font-bold text-gray-900 mt-1">{repStats.tips}</p>
                   </div>
                 </div>
                 {repStats.disputes > 0 && (
                   <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-3">
                     <AlertCircle size={16} className="text-red-600 shrink-0" />
                     <p className="text-xs text-red-700 font-medium">This account has {repStats.disputes} active dispute flags.</p>
                   </div>
                 )}
               </div>
            </div>
          </div>
        )}
        
        {activeTab === 'portfolio' && (
           <div className="bg-white border border-[#E5E5E2] rounded-2xl p-6 md:p-8 shadow-sm">
              <div className="flex flex-wrap gap-4">
                {isNamesLoading ? (
                  <div className="flex items-center gap-2 text-sm font-sans text-gray-500">
                    <div className="w-4 h-4 border-2 border-[#137A43] border-t-transparent rounded-full animate-spin"></div>
                    Loading on-chain portfolio...
                  </div>
                ) : ownedNames.length > 0 ? (
                  ownedNames.map(nameItem => (
                    <button
                      key={nameItem}
                      onClick={() => navigateTo('profile', nameItem)}
                      className="px-5 py-3 bg-[#FBFBFA] hover:bg-white text-gray-900 border border-[#E5E5E2] hover:border-[#137A43]/50 rounded-xl font-mono text-sm font-semibold transition-all flex items-center gap-3 group shadow-2xs"
                    >
                      <span>{nameItem}</span>
                      <ArrowRightIcon size={14} className="text-gray-500 group-hover:text-[#137A43] transition-colors" />
                    </button>
                  ))
                ) : (
                  <p className="text-sm font-sans text-gray-500 w-full text-center py-12">No registered .arc names for this wallet.</p>
                )}
              </div>
           </div>
        )}

        {activeTab === 'activity' && (
          <div className="bg-white border border-[#E5E5E2] rounded-2xl p-6 md:p-8 shadow-sm">
            {(() => {
              const userActs = getUserActivities(targetAddress);
              if (userActs.length === 0) {
                return (
                  <div className="text-center py-12">
                    <History size={32} className="mx-auto text-gray-400 mb-3" />
                    <p className="text-gray-500 text-sm">No activity recorded locally for this user yet.</p>
                  </div>
                );
              }
              return (
                <div className="space-y-4">
                  {userActs.map((tx: any) => (
                    <div key={tx.id} className="flex flex-col sm:flex-row justify-between sm:items-center py-4 border-b border-[#E5E5E2] last:border-0 gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-[#FBFBFA] border border-[#E5E5E2] flex items-center justify-center text-gray-500 shrink-0">
                          {tx.action.includes('Transferred') || tx.action.includes('Gifted') ? <Gift size={16} className="text-[#137A43]" /> : <History size={16} />}
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
    { id: 'home', label: 'Home', icon: HomeIcon },
    { id: 'names', label: 'Names', icon: Search },
    { id: 'send', label: 'Send', icon: Send },
    { id: 'marketplace', label: 'Marketplace', icon: Store },
    { id: 'mynames', label: 'My Names', icon: User },
  ];

  return (
    <div className="min-h-screen flex flex-col selection:bg-[#137A43]/20 text-gray-900 font-sans bg-[#FBFBFA]">
      <style>{globalStyles}</style>

      {/* UNIFIED PROTOCOL HEADER MATCHING REFERENCE IMAGE */}
      <header className="flex items-center justify-between px-6 sm:px-10 h-20 border-b border-[#E5E5E2] bg-[#FBFBFA]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-8 md:gap-12">
          <div 
            className="cursor-pointer select-none hover:opacity-90 transition-opacity"
            onClick={() => navigateTo('home')}
          >
            <ANSLogo />
          </div>
          <nav className="hidden md:flex items-center gap-6">
            {navItems.map(item => {
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => navigateTo(item.id)}
                  className={`relative py-2 text-sm font-sans font-medium transition-colors ${
                    isActive 
                      ? 'text-[#141413] font-semibold' 
                      : 'text-[#60605A] hover:text-[#141413]'
                  }`}
                >
                  <span>{item.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#137A43] rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Arc Network Pill matching reference */}
          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-white border border-[#E5E5E2] rounded-full text-xs font-sans font-medium text-[#141413] shadow-2xs select-none">
            <div className="w-2 h-2 rounded-full bg-[#137A43]"></div>
            <span>Arc Network</span>
            <ChevronDown size={13} className="text-[#60605A]" />
          </div>
          
          {auth.isConnected && auth.address ? (
            <div className="flex items-center gap-2">
              <div 
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E5E5E2] rounded-full text-xs font-mono text-gray-800 shadow-2xs cursor-default"
                title="Your USDC balance on Arc Testnet"
              >
                <CreditCard size={13} className="text-[#137A43] shrink-0" />
                <span className="font-bold text-gray-900 tabular-nums">{formattedBalance}</span>
                <span className="text-gray-500 text-[10px]">USDC</span>
              </div>

              {currentPrimaryName && (
                <button
                  onClick={() => navigateTo('profile', currentPrimaryName)}
                  title="View your main identity profile"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-900 border border-[#E5E5E2] rounded-full font-serif text-xs font-bold transition-all shadow-2xs"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-[#137A43] shrink-0" />
                  <span>{currentPrimaryName}</span>
                </button>
              )}

              <button
                onClick={handleCopyAddress}
                title="Click to copy your address"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 border border-[#E5E5E2] rounded-full font-mono text-xs font-medium transition-all shadow-2xs"
              >
                {copiedAddress ? (
                  <>
                    <Check size={13} className="text-[#137A43] shrink-0" />
                    <span className="text-[#137A43] font-semibold">Copied!</span>
                  </>
                ) : (
                  <>
                    <span className="tabular-nums">{auth.address.slice(0, 5)}...{auth.address.slice(-4)}</span>
                    <Copy size={11} className="text-gray-400" />
                  </>
                )}
              </button>

              <button
                onClick={() => navigateTo('userprofile', auth.address)}
                title="View your public profile"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-medium text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-50 border border-[#E5E5E2] rounded-full transition-colors shadow-2xs"
              >
                <User size={13} />
                <span>Profile</span>
              </button>

              <button
                onClick={() => auth.signOut()}
                title="Sign out"
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 border border-[#E5E5E2] hover:border-red-200 rounded-full transition-colors shadow-2xs shrink-0"
              >
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => auth.signIn()}
              className="bg-[#141413] hover:bg-[#282826] text-white px-5 py-2 rounded-full text-xs font-sans font-medium shadow-sm transition-all active:scale-95"
              disabled={auth.isLoading}
            >
              {auth.isLoading ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 w-full relative">
        {currentView === 'home' && <HomeView navigateTo={navigateTo} navigateToProfile={(name) => navigateTo('profile', name)} auth={auth} ans={ans} />}
        {currentView === 'names' && <NamesAppView navigateToProfile={(name) => navigateTo('profile', name)} auth={auth} ans={ans} />}
        {currentView === 'marketplace' && <MarketplaceView navigateToProfile={(name) => navigateTo('profile', name)} auth={auth} ans={ans} navigateTo={navigateTo} handleListForSale={(name) => navigateTo('listForSale', name)} />}
        {currentView === 'mynames' && <MyNamesView isConnected={auth.isConnected} connectWallet={() => auth.signIn()} auth={auth} ans={ans} balance={formattedBalance} navigateTo={navigateTo} />}
        {currentView === 'send' && <SendView isConnected={auth.isConnected} connectWallet={() => auth.signIn()} auth={auth} ans={ans} balance={formattedBalance} defaultRecipient={sendRecipientTarget} />}
        {currentView === 'profile' && profileTarget && <NameProfileView name={profileTarget} navigateTo={navigateTo} />}
        {currentView === 'userprofile' && userProfileTarget && <UserProfileView targetAddress={userProfileTarget} auth={auth} navigateTo={navigateTo} />}
      </main>

      {/* GLOBAL FOOTER MATCHING REFERENCE IMAGE */}
      <footer className="border-t border-[#E5E5E2] bg-transparent py-8 px-6 sm:px-10 z-10 relative">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-4 text-xs text-gray-500 font-sans">
            <div 
              className="flex items-center gap-2 cursor-pointer select-none" 
              onClick={() => navigateTo('home')}
            >
              <span className="text-[#137A43] font-mono font-bold text-lg leading-none">&lt;&gt;</span>
              <span className="text-gray-900 font-sans font-bold text-lg leading-none">ANS</span>
            </div>
            <span className="text-gray-500 text-center sm:text-left">
              Third-party .arc domain service on Arc Network. Not affiliated with Arc Network or Circle.
            </span>
          </div>
          
          <div className="flex items-center gap-6 text-xs text-gray-500 font-sans">
            <button onClick={() => navigateTo('home')} className="hover:text-gray-900 transition-colors">About</button>
            <a href="https://docs.arc.io/" target="_blank" rel="noreferrer" className="hover:text-gray-900 transition-colors">Docs</a>
            <a href="https://github.com/Nimona22/ANS" target="_blank" rel="noreferrer" className="hover:text-gray-900 transition-colors">Support</a>
            <a href="https://x.com" target="_blank" rel="noreferrer" className="hover:text-gray-900 transition-colors text-gray-700" title="X (Twitter)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
            <a href="https://github.com/Nimona22/ANS" target="_blank" rel="noreferrer" className="hover:text-gray-900 transition-colors text-gray-700" title="GitHub">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
              </svg>
            </a>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-[#E5E5E2] flex justify-around items-center pb-safe pt-2 z-50 px-2 shadow-[0_-4px_20px_rgba(0,0,0,0.04)]">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => navigateTo(item.id)}
              className={`flex flex-col items-center justify-center w-full py-1.5 mb-1 rounded-lg transition-colors ${isActive ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Icon size={18} className="mb-1" strokeWidth={isActive ? 2.5 : 1.75} />
              <span className={`text-[9px] font-mono ${isActive ? 'font-bold text-gray-900' : 'font-medium'}`}>{item.label}</span>
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
          className={`flex flex-col items-center justify-center w-full py-1.5 mb-1 rounded-lg transition-colors ${auth.isConnected ? 'text-[#137A43]' : 'text-gray-400'}`}
        >
          <Wallet size={18} className="mb-1" strokeWidth={1.75} />
          <span className="text-[9px] font-mono font-bold">
            {auth.isConnected && auth.address ? `${auth.address.slice(0, 4)}...${auth.address.slice(-3)}` : 'Sign In'}
          </span>
        </button>
      </nav>

      {/* Mobile Wallet Bottom Sheet */}
      {isMobileWalletOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={() => setIsMobileWalletOpen(false)}>
          <div className="w-full bg-white rounded-t-2xl p-6 shadow-2xl border-t border-[#E5E5E2]" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            
            <div className="flex justify-between items-center mb-5">
              <span className="font-serif font-bold text-xl text-gray-900">Your Wallet</span>
              <button onClick={() => setIsMobileWalletOpen(false)} aria-label="Close wallet" className="p-1.5 text-gray-400 hover:text-gray-900 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="p-4 bg-[#FBFBFA] border border-[#E5E5E2] rounded-2xl flex items-center justify-between gap-3 shadow-2xs">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-gray-500 mb-1">Smart Account</p>
                  <p className="font-mono text-xs font-semibold text-gray-900 truncate">{auth.address}</p>
                </div>
                <button
                  onClick={handleCopyAddress}
                  aria-label="Copy smart account address"
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[#E5E5E2] rounded-full text-xs font-sans font-semibold text-gray-700 shadow-2xs active:scale-95 shrink-0 hover:border-[#137A43]/50 transition-colors"
                >
                  {copiedAddress ? (
                    <>
                      <Check size={14} className="text-[#137A43]" />
                      <span className="text-[#137A43]">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} className="text-gray-400" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              <div className="p-4 bg-[#FBFBFA] border border-[#E5E5E2] rounded-2xl flex items-center justify-between shadow-2xs">
                <div>
                  <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-gray-500 mb-1">USDC Balance</p>
                  <p className="font-mono text-xl font-bold text-[#137A43]">{formattedBalance} <span className="text-sm font-sans text-gray-500 font-medium">USDC</span></p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-[#E8F5E9] text-[#137A43] flex items-center justify-center">
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
