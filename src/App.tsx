import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ScanLine, Send, Globe, ChevronLeft, QrCode, CheckCircle2, Loader2,
  Bell, HandCoins, Gift, Target, WifiOff, LogOut,
  Search, X, Plus, Wallet, ArrowRight, AlertTriangle
} from 'lucide-react';
import { auth, db } from './firebase';
import { signInAnonymously, onAuthStateChanged, signOut, RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { doc, getDoc, setDoc, query, collection, where, getDocs, onSnapshot, serverTimestamp } from 'firebase/firestore';

declare global {
  interface Window { recaptchaVerifier: any; }
}

type Screen = 'welcome' | 'login_phone' | 'login_otp' | 'setup_profile' | 'home' | 'scanner' | 'pay_contact' | 'amount_entry' | 'processing' | 'success' | 'receive_money';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('welcome');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  
  // Auth & Database States
  const [userDoc, setUserDoc] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [userPhone, setUserPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [userName, setUserName] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Transfer States
  const [recipient, setRecipient] = useState<{id?: string, name: string, username: string, emoji: string}>({name: '', username: '', emoji: ''});
  const [amount, setAmount] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [realUpiId, setRealUpiId] = useState('');
  const [receiveAmount, setReceiveAmount] = useState('');

  // Transitions
  const screenVariants = { initial: { opacity: 0, x: 20 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -20 } };

  const navigate = (screen: Screen) => setCurrentScreen(screen);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const d = await getDoc(doc(db, 'users', user.uid));
          if (d.exists()) {
            setUserDoc({ id: user.uid, ...d.data() });
            navigate('home');
          } else {
            navigate('setup_profile');
          }
        } catch (e) {
          navigate('login_phone');
        }
      } else {
        setUserDoc(null);
        navigate('welcome');
      }
      setIsLoadingAuth(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!auth.currentUser || !userDoc?.id) return;
    
    const unsubUser = onSnapshot(doc(db, 'users', auth.currentUser.uid), (docSn) => {
      if (docSn.exists()) setUserDoc({ id: auth.currentUser!.uid, ...docSn.data() });
    });

    const unsubTx1 = onSnapshot(query(collection(db, 'transactions'), where('senderId', '==', auth.currentUser.uid)), (snap) => {
      const sent = snap.docs.map(d => ({ id: d.id, ...d.data(), type: 'sent', date: 'Recent' }));
      setTransactions(prev => {
        const others = prev.filter(p => p.type !== 'sent');
        return [...others, ...sent].sort((a,b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));
      });
    });

    const unsubTx2 = onSnapshot(query(collection(db, 'transactions'), where('receiverId', '==', auth.currentUser.uid)), (snap) => {
      const received = snap.docs.map(d => ({ id: d.id, ...d.data(), type: 'received', date: 'Recent' }));
      setTransactions(prev => {
        const others = prev.filter(p => p.type !== 'received');
        return [...others, ...received].sort((a,b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));
      });
    });

    return () => { unsubUser(); unsubTx1(); unsubTx2(); };
  }, [userDoc?.id]);

  useEffect(() => {
    // Only set up listeners, avoid premature recaptcha creation
  }, []);

  const handleBack = () => {
    setAmount(''); setSearchTerm('');
    if (currentScreen === 'login_phone') navigate('welcome');
    else if (currentScreen === 'login_otp') navigate('login_phone');
    else if (currentScreen === 'setup_profile') navigate('welcome');
    else if (['scanner', 'pay_contact', 'success', 'receive_money'].includes(currentScreen)) navigate('home');
    else if (currentScreen === 'amount_entry') navigate('home');
  };

  const handleSendOtp = async () => {
    setIsLoading(true);
    try {
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-wrapper', { 'size': 'invisible' });
      }
      
      const phoneNumber = `+91${userPhone.replace(/\D/g, '')}`;
      const confirmation = await signInWithPhoneNumber(auth, phoneNumber, window.recaptchaVerifier);
      setConfirmationResult(confirmation);
      navigate('login_otp');
    } catch (error: any) {
      console.error(error);
      // Clear recaptcha on error to allow for retry safely
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
        } catch (e) {}
        window.recaptchaVerifier = undefined;
      }
      const recaptchaWrapper = document.getElementById('recaptcha-wrapper');
      if (recaptchaWrapper) {
         recaptchaWrapper.innerHTML = '';
      }

      if (error.code === 'auth/operation-not-allowed') {
        alert("CRITICAL ERROR:\n\nYou MUST enable 'Phone' authentication in your Firebase Console.\n\n1. Go to Firebase Console\n2. Click 'Authentication'\n3. Click 'Sign-in method'\n4. Click 'Phone' and Enable it.\n5. Save and try again.");
      } else {
        alert('Verification Failed: ' + error.message + '\n\nIMPORTANT: If using the AI Studio preview, you MUST open the app in a NEW TAB to receive SMS. If reCAPTCHA is blocked, SMS will not send.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length < 6 || !confirmationResult) return;
    setIsLoading(true);
    try {
      await confirmationResult.confirm(otp);
    } catch (error: any) {
      alert('Invalid OTP: ' + error.message);
      setOtp('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProfile = async () => {
    if (!userName.trim() || !auth.currentUser) return;
    setIsLoading(true);
    const phoneNumberStr = `+91${userPhone}`;
    const cleanPhone = phoneNumberStr.replace('+91', '');
    const generatedUpi = realUpiId ? realUpiId.toLowerCase().trim() : `${cleanPhone}@mahraj`;
    try {
      await setDoc(doc(db, 'users', auth.currentUser.uid), {
        name: userName,
        phone: phoneNumberStr,
        upiId: generatedUpi,
        emoji: '😎'
      });
      navigate('home');
    } catch (err: any) {
      alert("Failed to create profile: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGlobalSearch = async () => {
    if (!searchTerm.trim()) return;
    setIsLoading(true);
    try {
      // Search by UPI ID first
      const q = query(collection(db, 'users'), where('upiId', '==', searchTerm));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const found = snap.docs[0];
        if (found.id === auth.currentUser?.uid) { alert('You cannot pay yourself!'); return; }
        setRecipient({ id: found.id, name: found.data().name, username: found.data().upiId, emoji: found.data().emoji || '👤' });
        navigate('amount_entry');
      } else {
        // Fallback to phone number search
        const phoneFormat = searchTerm.startsWith('+91') ? searchTerm : `+91${searchTerm}`;
        const q2 = query(collection(db, 'users'), where('phone', '==', phoneFormat));
        const snap2 = await getDocs(q2);
        if (!snap2.empty) {
          const found = snap2.docs[0];
          if (found.id === auth.currentUser?.uid) { alert('You cannot pay yourself!'); return; }
          setRecipient({ id: found.id, name: found.data().name, username: found.data().upiId, emoji: found.data().emoji || '👤' });
          navigate('amount_entry');
        } else {
          alert("Couldn't find any user with this target.");
        }
      }
    } catch (err: any) {
      console.error(err);
      alert('Search failed: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const processPayment = async () => {
    if (!auth.currentUser || !userDoc || !recipient.id) return;
    navigate('processing');
    
    try {
      // Record transaction
      const txRef = doc(collection(db, 'transactions'));
      await setDoc(txRef, {
        senderId: auth.currentUser.uid,
        receiverId: recipient.id,
        senderName: userDoc.name,
        receiverName: recipient.name,
        amount: Number(amount),
        timestamp: serverTimestamp(),
        status: 'initiated'
      });
      
      // Trigger deep link for ACTUAL UPI apps to handle the payment
      const upiLink = `upi://pay?pa=${recipient.username}&pn=${encodeURIComponent(recipient.name)}&am=${amount}&cu=INR`;
      setTimeout(() => {
        window.location.href = upiLink;
        navigate('success');
      }, 1500);

    } catch(err: any) {
      console.error(err);
      alert("Transaction setup failed! " + err.message);
      navigate('home');
    }
  };

  const handleAmountSubmit = () => {
    if (!isOnline) { alert("No internet connection! Please check your network to send money."); return; }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return;
    processPayment();
  };

  if (isLoadingAuth) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-white"><Loader2 className="w-8 h-8 animate-spin text-[#c7ff00]" /></div>;
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center font-sans tracking-tight text-white selection:bg-[#c7ff00] selection:text-black">
      <div id="recaptcha-wrapper"></div>
      <div className="w-full sm:max-w-[400px] bg-[#0a0a0a] min-h-screen sm:min-h-[800px] sm:h-[85vh] sm:rounded-[40px] sm:shadow-[0_0_50px_rgba(199,255,0,0.05)] sm:border sm:border-zinc-800 overflow-hidden relative flex flex-col">
        {!isOnline && (
          <div className="bg-red-500 text-white text-xs font-bold text-center py-1.5 flex items-center justify-center gap-2 z-50 animate-pulse">
            <WifiOff className="w-3 h-3" /> No Internet Connection
          </div>
        )}
        <AnimatePresence mode="wait">
          
          {currentScreen === 'welcome' && (
            <motion.div key="welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col p-6 items-center justify-center relative overflow-hidden bg-gradient-to-b from-black via-zinc-950 to-black">
              <div className="flex-1 flex flex-col items-center justify-center z-10 w-full text-center mt-20">
                <div className="w-24 h-24 bg-gradient-to-tr from-[#c7ff00] to-emerald-400 rounded-3xl p-[2px] mb-8 shadow-[0_0_40px_rgba(199,255,0,0.2)]">
                  <div className="w-full h-full bg-black rounded-[22px] flex items-center justify-center"><Wallet className="w-10 h-10 text-[#c7ff00]" /></div>
                </div>
                <h1 className="text-5xl font-black mb-3 tracking-tighter">Mahraj Pay.</h1>
                <p className="text-zinc-400 text-sm font-medium px-4">Global Network. Real-time setup.</p>
              </div>
              <div className="w-full z-10 pb-8">
                <button onClick={() => navigate('login_phone')} className="w-full bg-[#c7ff00] text-black font-extrabold py-4 rounded-2xl flex items-center justify-center gap-2 transition-transform active:scale-[0.98] shadow-[0_0_20px_rgba(199,255,0,0.15)]">
                  Get Started <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          )}

          {currentScreen === 'login_phone' && (
            <motion.div key="login_phone" variants={screenVariants} initial="initial" animate="animate" exit="exit" className="flex-1 flex flex-col p-6 bg-[#0a0a0a]">
              <button onClick={handleBack} className="p-2 -ml-2 rounded-full hover:bg-zinc-800 text-white w-max mb-6"><ChevronLeft className="w-6 h-6" /></button>
              <h2 className="text-2xl font-bold mb-2">Enter mobile number</h2>
              
              <div className="flex border-b-2 border-zinc-700 focus-within:border-[#c7ff00] transition-colors pb-2 items-center gap-3 mt-4">
                <span className="text-lg text-zinc-400 font-medium">+91</span>
                <input type="tel" autoFocus maxLength={10} value={userPhone} onChange={(e) => setUserPhone(e.target.value.replace(/\D/g, ''))} placeholder="00000 00000" className="bg-transparent outline-none flex-1 text-2xl font-bold tracking-wider placeholder-zinc-800" />
              </div>
              <div className="mt-auto pb-4">
                <button disabled={userPhone.length < 10 || isLoading} onClick={handleSendOtp} className="w-full bg-[#c7ff00] disabled:bg-zinc-900 disabled:text-zinc-600 text-black font-extrabold py-4 rounded-2xl flex items-center justify-center">
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send OTP'}
                </button>
              </div>
            </motion.div>
          )}

          {currentScreen === 'login_otp' && (
            <motion.div key="login_otp" variants={screenVariants} initial="initial" animate="animate" exit="exit" className="flex-1 flex flex-col p-6 bg-[#0a0a0a]">
              <button onClick={handleBack} className="p-2 -ml-2 rounded-full hover:bg-zinc-800 text-white w-max mb-6"><ChevronLeft className="w-6 h-6" /></button>
              <h2 className="text-2xl font-bold mb-2">Verify number</h2>
              <div className="flex gap-4 justify-center">
                {[...Array(6)].map((_, i) => (
                  <input key={i} type="text" maxLength={1} value={otp[i] || ''} onChange={(e) => { const val = e.target.value.replace(/\D/g, ''); setOtp(prev => prev.slice(0,i) + val + prev.slice(i+1)); }} className="w-12 h-14 bg-zinc-900 border border-zinc-800 rounded-xl text-center text-xl font-bold focus:border-[#c7ff00] outline-none" />
                ))}
              </div>
              <div className="mt-8 text-center">
                <button 
                  disabled={isLoading}
                  onClick={handleSendOtp}
                  className="text-zinc-400 font-medium text-sm hover:text-white transition-colors"
                >
                  Didn't receive it? <span className="text-[#c7ff00]">Resend OTP</span>
                </button>
              </div>
              <div className="mt-auto pb-4">
                <button disabled={otp.length < 6 || isLoading} onClick={handleVerifyOtp} className="w-full bg-[#c7ff00] disabled:bg-zinc-900 disabled:text-zinc-600 text-black font-extrabold py-4 rounded-2xl flex items-center justify-center">
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify Code'}
                </button>
              </div>
            </motion.div>
          )}

          {currentScreen === 'setup_profile' && (
            <motion.div key="setup_profile" variants={screenVariants} initial="initial" animate="animate" exit="exit" className="flex-1 flex flex-col p-6 bg-[#0a0a0a]">
              <h2 className="text-2xl font-bold mt-12 mb-2">Set up your profile</h2>
              <div className="mb-8 mt-4 space-y-4">
                <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Full Name" className="w-full bg-zinc-900 border border-zinc-800 focus:border-[#c7ff00] rounded-xl px-4 py-3 text-white outline-none font-semibold" />
                <input type="text" value={realUpiId} onChange={(e) => setRealUpiId(e.target.value)} placeholder="Your Bank UPI ID (e.g. name@okicici)" className="w-full bg-zinc-900 border border-zinc-800 focus:border-[#c7ff00] rounded-xl px-4 py-3 text-white outline-none font-semibold" />
                <p className="text-xs text-zinc-500 font-medium px-1">Enter your real UPI ID to allow others to pay you directly to your bank account via the generated QR code.</p>
              </div>
              <div className="mt-auto pb-4">
                <button disabled={!userName.trim() || isLoading} onClick={handleCreateProfile} className="w-full bg-[#c7ff00] disabled:bg-zinc-900 text-black font-extrabold py-4 rounded-2xl flex items-center justify-center">
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Account'}
                </button>
              </div>
            </motion.div>
          )}

          {currentScreen === 'home' && userDoc && (
            <motion.div key="home" variants={screenVariants} initial="initial" animate="animate" exit="exit" className="flex-1 flex flex-col overflow-y-auto w-full no-scrollbar relative">
              <div className="px-6 pt-12 pb-6 flex justify-between items-center bg-[#0a0a0a] sticky top-0 z-20">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-[#c7ff00] to-emerald-400 p-[2px]">
                    <div className="w-full h-full bg-black rounded-full flex items-center justify-center text-sm font-bold">{userDoc.name?.slice(0,2).toUpperCase() || 'AA'}</div>
                  </div>
                  <div><div className="text-zinc-400 text-xs font-medium">Hello,</div><div className="text-white text-base font-bold">{userDoc.name?.split(' ')[0]}</div></div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => navigate('receive_money')} className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center"><QrCode className="w-5 h-5 text-[#c7ff00]" /></button>
                  <button onClick={() => signOut(auth)} className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center"><LogOut className="w-4 h-4 text-zinc-400" /></button>
                </div>
              </div>
              
              <div className="px-6 pb-6">
                <div className="bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700/50 rounded-3xl p-5 relative overflow-hidden group">
                  <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#c7ff00] opacity-10 rounded-full blur-3xl filter group-hover:opacity-20 transition-opacity"></div>
                  <div className="flex justify-between items-start mb-2 relative z-10">
                    <span className="text-sm font-semibold text-zinc-400 flex items-center gap-1.5"><Wallet className="w-4 h-4" /> Real UPI ID</span>
                  </div>
                  <div className="relative z-10 mt-1">
                    <div className="text-xl font-bold text-white mb-1">{userDoc.name}</div>
                    <div className="bg-black/40 inline-flex px-3 py-1.5 rounded-lg border border-white/5 text-xs font-mono text-zinc-300">
                      <span>{userDoc.upiId}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-6 pb-8">
                <div className="grid grid-cols-3 gap-4">
                  <ActionBtn icon={<ScanLine className="w-6 h-6" />} label="Scan" onClick={() => {}} bg="bg-zinc-900 border-zinc-800 text-white" />
                  <ActionBtn icon={<Globe className="w-6 h-6" />} label="Send Mobile/UPI" onClick={() => navigate('pay_contact')} bg="bg-[#c7ff00] border-transparent text-black" />
                  <ActionBtn icon={<HandCoins className="w-6 h-6" />} label="Receive Code" onClick={() => navigate('receive_money')} bg="bg-zinc-900 border-zinc-800 text-white" />
                </div>
              </div>

              <div className="px-6 pb-12">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Past Transactions</h3>
                <div className="space-y-3">
                  {transactions.length === 0 ? (
                      <div className="text-center py-6 text-zinc-500 text-sm">No transactions yet</div>
                  ) : transactions.slice(0, 10).map((tx) => (
                    <div key={tx.id} className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-4 flex items-center justify-between">
                      <div className="flex flex-col">
                        <div className="text-sm font-bold text-white">{tx.type === 'sent' ? `Paid to ${tx.receiverName || 'Unknown'}` : `Recvd from ${tx.senderName || 'Unknown'}`}</div>
                        <div className="text-xs text-zinc-500">{new Date(tx.timestamp?.toMillis() || Date.now()).toLocaleDateString()}</div>
                      </div>
                      <div className={`text-sm font-bold ${tx.type === 'received' ? 'text-[#c7ff00]' : 'text-white'}`}>
                        {tx.type === 'received' ? '+' : '-'}₹{tx.amount}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {currentScreen === 'pay_contact' && (
            <motion.div key="pay_contact" variants={screenVariants} initial="initial" animate="animate" exit="exit" className="flex-1 bg-black flex flex-col">
              <div className="p-4 flex items-center gap-3 border-b border-zinc-900 bg-[#0a0a0a]">
                <button onClick={handleBack} className="p-2 -ml-2 rounded-full hover:bg-zinc-800 text-white"><ChevronLeft className="w-6 h-6" /></button>
                <div className="flex-1 relative">
                  <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="UPI ID or Phone" className="w-full pl-11 pr-4 py-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-sm text-white focus:border-[#c7ff00] outline-none" autoFocus />
                </div>
              </div>
              <div className="p-6">
                <button disabled={!searchTerm || isLoading} onClick={handleGlobalSearch} className="w-full py-4 bg-[#c7ff00] text-black font-bold flex justify-center items-center rounded-2xl disabled:opacity-50">
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin"/> : 'Search Globally'}
                </button>
              </div>
            </motion.div>
          )}

          {currentScreen === 'amount_entry' && (
            <motion.div key="amount_entry" variants={screenVariants} initial="initial" animate="animate" exit="exit" className="flex-1 bg-[#0a0a0a] flex flex-col relative">
              <div className="p-4 flex items-center gap-3 border-b border-zinc-900"><button onClick={handleBack} className="p-2 -ml-2 rounded-full text-white"><ChevronLeft className="w-6 h-6" /></button><div><h2 className="text-sm font-bold text-white">{recipient.name}</h2><p className="text-[10px] text-zinc-500 font-mono tracking-tighter uppercase">{recipient.username}</p></div></div>
              <div className="flex-1 flex flex-col items-center justify-center px-6 pt-10 pb-32">
                <span className="text-zinc-500 font-medium mb-4 text-sm">Paying via Real UPI Intent</span>
                <div className="flex items-baseline justify-center"><span className="text-3xl text-[#c7ff00] mr-1">₹</span><input type="text" value={amount} onChange={(e) => { const val = e.target.value.replace(/[^0-9]/g, ''); if (val.length <= 5) setAmount(val); }} placeholder="0" autoFocus className="text-6xl font-bold text-white bg-transparent text-center outline-none w-full max-w-[200px]" style={{fieldSizing: 'content'} as any}/></div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-6 bg-[#0a0a0a] border-t border-zinc-900"><button disabled={!amount || Number(amount)<=0} onClick={handleAmountSubmit} className="w-full bg-[#c7ff00] disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-extrabold py-4 rounded-2xl flex items-center justify-center gap-2"><Send className="w-5 h-5" /><span>Pay using UPI</span></button></div>
            </motion.div>
          )}

          {currentScreen === 'processing' && (
            <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 bg-[#0a0a0a] flex flex-col items-center justify-center p-6 text-center"><div className="w-24 h-24 rounded-full flex items-center justify-center mb-6"><Loader2 className="w-12 h-12 text-[#c7ff00] animate-spin" /></div><h2 className="text-xl font-bold text-white mb-2">Processing...</h2></motion.div>
          )}

          {currentScreen === 'success' && (
            <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-6 text-center">
              <div className="w-32 h-32 bg-[#c7ff00] rounded-full flex items-center justify-center mb-8 text-black shadow-[0_0_50px_rgba(199,255,0,0.3)]"><CheckCircle2 className="w-16 h-16" /></div>
              <h2 className="text-5xl font-black mb-2 tracking-tighter">₹{amount}</h2><p className="text-emerald-400 mb-10 font-bold uppercase text-xs">Sent Successfully</p>
              <button onClick={handleBack} className="absolute bottom-10 px-10 py-4 bg-white text-black rounded-full font-bold w-[calc(100%-48px)] max-w-xs">Back to Home</button>
            </motion.div>
          )}

          {currentScreen === 'receive_money' && userDoc && (
            <motion.div key="receive_money" variants={screenVariants} initial="initial" animate="animate" exit="exit" className="flex-1 bg-black flex flex-col items-center p-6 relative overflow-y-auto w-full no-scrollbar">
              <div className="w-full flex items-center justify-between mb-8"><button onClick={handleBack} className="p-2 -ml-2 rounded-full text-white"><ChevronLeft className="w-6 h-6" /></button><div className="text-sm font-bold uppercase">Receive</div><div className="w-10"></div></div>
              <div className="bg-white rounded-[32px] p-8 w-full max-w-xs flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-black rounded-xl mb-4 flex items-center justify-center font-bold text-[#c7ff00]">{userDoc.name?.slice(0,2).toUpperCase()}</div>
                <h3 className="text-black font-bold text-xl">{userDoc.name}</h3><p className="text-zinc-500 font-mono text-xs mb-6">{userDoc.upiId}</p>
                
                <div className="flex items-center gap-2 mb-6 w-full">
                  <span className="text-zinc-800 font-bold text-xl">₹</span>
                  <input type="text" value={receiveAmount} onChange={(e) => setReceiveAmount(e.target.value.replace(/\D/g, ''))} placeholder="Amount (Optional)" className="bg-zinc-100 border border-zinc-200 rounded-xl px-4 py-3 text-black outline-none font-bold text-center w-full" />
                </div>

                <div className="w-48 h-48 bg-white border border-zinc-200 rounded-2xl p-2 mb-6">
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`upi://pay?pa=${userDoc.upiId}&pn=${userDoc.name}${receiveAmount ? `&am=${receiveAmount}` : ''}&cu=INR`)}`} className="w-full h-full object-contain mix-blend-multiply" alt="QR" />
                </div>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Scan with any UPI App<br/>(GPay, PhonePe, Paytm)</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ActionBtn({ icon, label, bg, onClick }: { icon: React.ReactNode, label: string, bg: string, onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-2 group outline-none">
      <div className={`w-[60px] h-[60px] rounded-2xl flex items-center justify-center border transition-all duration-300 ${bg} shadow-sm active:scale-95`}>{icon}</div>
      <span className="text-[11px] font-bold tracking-wide text-center leading-tight text-zinc-400 group-hover:text-white transition-colors">{label}</span>
    </button>
  );
}
