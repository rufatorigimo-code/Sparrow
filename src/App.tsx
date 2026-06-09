import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, Home, Search, ShieldAlert, Globe, Star, Bookmark, VenetianMask, Trash2, X, UserCircle, Plus, Sparkles, Send, Loader2, Menu, MessageSquarePlus, ChevronRight, Image as ImageIcon, Music, PenLine, BookOpen, SlidersHorizontal, Mic, AudioLines, Bird } from 'lucide-react';
import { auth, db } from './firebase';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, onSnapshot, setDoc, deleteDoc, doc, addDoc, serverTimestamp, updateDoc, orderBy, where } from 'firebase/firestore';
import { GoogleGenAI } from '@google/genai';
import Markdown from 'react-markdown';
// @ts-ignore
import sparrowBg from './assets/images/sparrow_bg_1781026600858.png';

interface BookmarkItem {
  id: string;
  title: string;
  url: string;
}

interface Tab {
  id: string;
  url: string;
  title: string;
  history: string[];
  historyIndex: number;
}

const DEFAULT_URL = 'app://newtab';

export default function App() {
  // Normal State
  const [tabs, setTabs] = useState<Tab[]>([{
    id: 'default',
    url: DEFAULT_URL,
    title: 'New Tab',
    history: [DEFAULT_URL],
    historyIndex: 0
  }]);
  const [activeTabId, setActiveTabId] = useState<string>('default');
  
  // Incognito State
  const [isIncognito, setIsIncognito] = useState(false);
  const [incognitoTabs, setIncognitoTabs] = useState<Tab[]>([{
    id: 'default-incognito',
    url: DEFAULT_URL,
    title: 'New Tab',
    history: [DEFAULT_URL],
    historyIndex: 0
  }]);
  const [activeIncognitoTabId, setActiveIncognitoTabId] = useState<string>('default-incognito');

  // Input State
  const [inputUrl, setInputUrl] = useState(DEFAULT_URL);

  // Bookmarks State
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);

  // User State
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [customBg, setCustomBg] = useState<{type: 'color'|'image', value: string} | null>(() => {
    try {
      const saved = localStorage.getItem('customBg');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [showBgMenu, setShowBgMenu] = useState(false);

  // AI Assistant State
  const [aiMessages, setAiMessages] = useState<{role: 'user' | 'model', text: string, image?: string | null}[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);
  const [geminiChats, setGeminiChats] = useState<any[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageMimeType, setSelectedImageMimeType] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice Input State
  const [listeningTarget, setListeningTarget] = useState<'ai' | 'search' | null>(null);
  const listeningTargetRef = useRef<'ai' | 'search' | null>(null);
  const [sparrowQuery, setSparrowQuery] = useState('');
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    listeningTargetRef.current = listeningTarget;
  }, [listeningTarget]);

  // Active getters
  const activeTabs = isIncognito ? incognitoTabs : tabs;
  const activeTabIdCurrent = isIncognito ? activeIncognitoTabId : activeTabId;
  const activeTab = activeTabs.find(t => t.id === activeTabIdCurrent) || activeTabs[0];
  const isDark = theme === 'dark' || isIncognito;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;
    
    if (user) {
      const q = query(collection(db, `users/${user.uid}/bookmarks`));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const loadedBookmarks: BookmarkItem[] = [];
        snapshot.forEach((doc) => {
          loadedBookmarks.push(doc.data() as BookmarkItem);
        });
        setBookmarks(loadedBookmarks);
      }, (error) => {
        console.error("Error fetching bookmarks:", error);
      });
      return () => unsubscribe();
    } else {
      setBookmarks([]);
    }
  }, [user, isAuthReady]);

  useEffect(() => {
    if (!isAuthReady) return;
    
    if (user) {
      const q = query(collection(db, 'gemini_chats'), where('userId', '==', user.uid), orderBy('updatedAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const chats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setGeminiChats(chats);
      }, (error) => {
        console.error("Error fetching chats:", error);
      });
      return () => unsubscribe();
    } else {
      setGeminiChats([]);
    }
  }, [user, isAuthReady]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        
        recognition.onresult = (event: any) => {
          const transcript = event.results[event.results.length - 1][0].transcript;
          if (listeningTargetRef.current === 'ai') {
            setAiInput(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + transcript);
          } else if (listeningTargetRef.current === 'search') {
            setSparrowQuery(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + transcript);
          }
        };

        recognition.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          setListeningTarget(null);
        };

        recognition.onend = () => {
          setListeningTarget(null);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  const toggleListening = (target: 'ai' | 'search') => {
    if (!recognitionRef.current) {
      alert("Voice input is not supported in your browser.");
      return;
    }
    
    if (listeningTarget === target) {
      recognitionRef.current.stop();
      setListeningTarget(null);
    } else {
      try {
        if (listeningTarget) {
          recognitionRef.current.stop();
        }
        setListeningTarget(target);
        setTimeout(() => {
          recognitionRef.current.start();
        }, listeningTarget ? 300 : 0);
      } catch (e) {
        console.error("Error starting speech recognition:", e);
      }
    }
  };

  // Sync inputUrl with active tab
  useEffect(() => {
    if (activeTab) {
      setInputUrl(activeTab.url === 'app://newtab' ? '' : activeTab.url);
    }
  }, [activeTabIdCurrent, activeTab?.url, isIncognito]);

  const getTabTitle = (url: string) => {
    if (!url || url === 'app://newtab') return 'New Tab';
    if (url === 'app://gemini') return 'Gemini AI';
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  const createTab = () => {
    const newTab: Tab = {
      id: Date.now().toString(),
      url: DEFAULT_URL,
      title: 'New Tab',
      history: [DEFAULT_URL],
      historyIndex: 0
    };
    if (isIncognito) {
      setIncognitoTabs([...incognitoTabs, newTab]);
      setActiveIncognitoTabId(newTab.id);
    } else {
      setTabs([...tabs, newTab]);
      setActiveTabId(newTab.id);
    }
  };

  const closeTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (isIncognito) {
      if (incognitoTabs.length === 1) {
        setIsIncognito(false);
        setIncognitoTabs([{
          id: Date.now().toString(),
          url: DEFAULT_URL,
          title: 'New Tab',
          history: [DEFAULT_URL],
          historyIndex: 0
        }]);
      } else {
        const newTabs = incognitoTabs.filter(t => t.id !== id);
        setIncognitoTabs(newTabs);
        if (activeIncognitoTabId === id) {
          setActiveIncognitoTabId(newTabs[newTabs.length - 1].id);
        }
      }
    } else {
      if (tabs.length === 1) {
        const newTab = {
          id: Date.now().toString(),
          url: DEFAULT_URL,
          title: 'New Tab',
          history: [DEFAULT_URL],
          historyIndex: 0
        };
        setTabs([newTab]);
        setActiveTabId(newTab.id);
      } else {
        const newTabs = tabs.filter(t => t.id !== id);
        setTabs(newTabs);
        if (activeTabId === id) {
          setActiveTabId(newTabs[newTabs.length - 1].id);
        }
      }
    }
  };

  const updateActiveTab = (updates: Partial<Tab>) => {
    const updateTabList = (tabList: Tab[]) => tabList.map(tab => 
      tab.id === activeTabIdCurrent ? { ...tab, ...updates } : tab
    );
    if (isIncognito) setIncognitoTabs(updateTabList(incognitoTabs));
    else setTabs(updateTabList(tabs));
  };

  const navigateTo = (url: string) => {
    let finalUrl = url.trim();
    if (!finalUrl) return;
    
    if (!finalUrl.includes('.') || finalUrl.includes(' ')) {
      finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}&igu=1`;
    } else if (!/^https?:\/\//i.test(finalUrl) && !finalUrl.startsWith('app://')) {
      finalUrl = 'https://' + finalUrl;
    }

    setIsLoading(true);
    
    const newHistory = activeTab.history.slice(0, activeTab.historyIndex + 1);
    newHistory.push(finalUrl);
    
    updateActiveTab({
      url: finalUrl,
      title: getTabTitle(finalUrl),
      history: newHistory,
      historyIndex: newHistory.length - 1
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputUrl) {
      navigateTo(inputUrl);
    }
  };

  const goBack = () => {
    if (activeTab.historyIndex > 0) {
      const newIndex = activeTab.historyIndex - 1;
      const url = activeTab.history[newIndex];
      setIsLoading(true);
      updateActiveTab({
        url,
        title: getTabTitle(url),
        historyIndex: newIndex
      });
    }
  };

  const goForward = () => {
    if (activeTab.historyIndex < activeTab.history.length - 1) {
      const newIndex = activeTab.historyIndex + 1;
      const url = activeTab.history[newIndex];
      setIsLoading(true);
      updateActiveTab({
        url,
        title: getTabTitle(url),
        historyIndex: newIndex
      });
    }
  };

  const reload = () => {
    setIsLoading(true);
    const current = activeTab.url;
    updateActiveTab({ url: '' });
    setTimeout(() => {
      updateActiveTab({ url: current });
    }, 50);
  };

  const goHome = () => {
    navigateTo(DEFAULT_URL);
  };

  const toggleIncognito = () => {
    setIsIncognito(!isIncognito);
  };

  const isBookmarked = bookmarks.some(b => b.url === activeTab?.url);
  
  const toggleBookmark = async () => {
    if (!user) {
      alert("Please sign in to save bookmarks.");
      return;
    }

    if (isBookmarked) {
      const bookmarkToDelete = bookmarks.find(b => b.url === activeTab.url);
      if (bookmarkToDelete) {
        try {
          await deleteDoc(doc(db, `users/${user.uid}/bookmarks`, bookmarkToDelete.id));
        } catch (error) {
          console.error("Error deleting bookmark:", error);
        }
      }
    } else {
      try {
        const urlObj = new URL(activeTab.url);
        const title = urlObj.hostname.replace('www.', '');
        const newId = Date.now().toString();
        const newBookmark = { id: newId, title, url: activeTab.url, userId: user.uid, createdAt: new Date().toISOString() };
        await setDoc(doc(db, `users/${user.uid}/bookmarks`, newId), newBookmark);
      } catch (e) {
        const newId = Date.now().toString();
        const newBookmark = { id: newId, title: activeTab.url, url: activeTab.url, userId: user.uid, createdAt: new Date().toISOString() };
        await setDoc(doc(db, `users/${user.uid}/bookmarks`, newId), newBookmark);
      }
    }
  };

  const removeBookmark = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/bookmarks`, id));
    } catch (error) {
      console.error("Error deleting bookmark:", error);
    }
  };

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setShowUserMenu(false);
    } catch (error) {
      console.error("Login error:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setShowUserMenu(false);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleNewChat = () => {
    setCurrentChatId(null);
    setAiMessages([]);
    setAiInput('');
    setSelectedImage(null);
  };

  const loadChat = (chat: any) => {
    setCurrentChatId(chat.id);
    setAiMessages(chat.messages || []);
  };

  const deleteChat = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'gemini_chats', id));
      if (currentChatId === id) handleNewChat();
    } catch (error) {
      console.error("Error deleting chat:", error);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      setSelectedImage(base64String);
      setSelectedImageMimeType(file.type);
    };
    reader.readAsDataURL(file);
  };

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        const bg = { type: 'image' as const, value: reader.result as string };
        setCustomBg(bg);
        localStorage.setItem('customBg', JSON.stringify(bg));
      } catch (err) {
        alert('Изображение слишком большое для сохранения. Пожалуйста, выберите файл меньшего размера.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAISubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!aiInput.trim() && !selectedImage) || isAILoading) return;

    const userText = aiInput.trim();
    const imageToSend = selectedImage;
    const mimeTypeToSend = selectedImageMimeType;

    setAiInput('');
    setSelectedImage(null);
    setSelectedImageMimeType(null);

    const newUserMsg = { 
      role: 'user' as const, 
      text: userText, 
      image: imageToSend ? `data:${mimeTypeToSend};base64,${imageToSend}` : null 
    };
    
    const updatedMessages = [...aiMessages, newUserMsg];
    setAiMessages(updatedMessages);
    setIsAILoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

      const contents = aiMessages.map(m => {
        const parts: any[] = [];
        if (m.text) parts.push({ text: m.text });
        if (m.image) {
           const match = m.image.match(/^data:(image\/\w+);base64,(.*)$/);
           if (match) {
             parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
           }
        }
        return { role: m.role, parts };
      });

      const newParts: any[] = [];
      if (userText) newParts.push({ text: userText });
      if (imageToSend) newParts.push({ inlineData: { mimeType: mimeTypeToSend!, data: imageToSend } });

      contents.push({ role: 'user', parts: newParts });

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: contents as any,
        config: {
          systemInstruction: 'You are a helpful AI assistant built into a web browser. You can help the user with questions, summarize web pages, or provide general information. Be concise and helpful.',
        }
      });

      const newModelMsg = { role: 'model' as const, text: response.text || '' };
      const finalMessages = [...updatedMessages, newModelMsg];
      setAiMessages(finalMessages);

      if (user) {
        if (!currentChatId) {
          const docRef = await addDoc(collection(db, 'gemini_chats'), {
            userId: user.uid,
            title: userText.slice(0, 30) || 'Новый чат',
            updatedAt: serverTimestamp(),
            messages: finalMessages
          });
          setCurrentChatId(docRef.id);
        } else {
          await updateDoc(doc(db, 'gemini_chats', currentChatId), {
            updatedAt: serverTimestamp(),
            messages: finalMessages
          });
        }
      }
    } catch (error) {
      console.error("AI Error:", error);
      setAiMessages(prev => [...prev, { role: 'model', text: 'Sorry, I encountered an error. Please try again.' }]);
    } finally {
      setIsAILoading(false);
    }
  };

  const openGemini = () => {
    const newId = Date.now().toString();
    const geminiUrl = 'app://gemini';
    const newTab: Tab = {
      id: newId,
      url: geminiUrl,
      title: 'Gemini AI',
      history: [geminiUrl],
      historyIndex: 0
    };
    if (isIncognito) {
      setIncognitoTabs([...incognitoTabs, newTab]);
      setActiveIncognitoTabId(newId);
    } else {
      setTabs([...tabs, newTab]);
      setActiveTabId(newId);
    }
  };

  // Styles based on mode
  const topBarClass = isDark 
    ? "flex items-center gap-2 p-2 bg-slate-900 border-b border-slate-800 shadow-sm z-20 relative"
    : "flex items-center gap-2 p-2 bg-slate-200 border-b border-slate-300 shadow-sm z-20 relative";
    
  const btnClass = isDark
    ? "p-1.5 rounded-md text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
    : "p-1.5 rounded-md text-slate-700 hover:bg-slate-300 disabled:opacity-40 disabled:hover:bg-transparent transition-colors";
    
  const inputContainerClass = isDark
    ? "flex-1 flex items-center bg-slate-800 rounded-full px-3 py-1.5 shadow-inner border border-slate-700 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all max-w-4xl mx-auto"
    : "flex-1 flex items-center bg-white rounded-full px-3 py-1.5 shadow-inner border border-slate-300 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all max-w-4xl mx-auto";
    
  const inputClass = isDark
    ? "flex-1 bg-transparent outline-none text-sm text-slate-200 w-full placeholder-slate-500"
    : "flex-1 bg-transparent outline-none text-sm text-slate-800 w-full placeholder-slate-400";

  return (
    <div className={`flex flex-col h-screen font-sans overflow-hidden ${isDark ? 'bg-slate-900 text-slate-200' : 'bg-slate-100 text-slate-900'}`}>
      {/* Browser Chrome (Top Bar) */}
      <div className={topBarClass}>
        <div className="flex items-center gap-1">
          <button onClick={goBack} disabled={activeTab?.historyIndex === 0} className={btnClass} title="Go back">
            <ArrowLeft size={18} />
          </button>
          <button onClick={goForward} disabled={activeTab?.historyIndex === activeTab?.history.length - 1} className={btnClass} title="Go forward">
            <ArrowRight size={18} />
          </button>
          <button onClick={reload} className={btnClass} title="Reload page">
            <RotateCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button onClick={goHome} className={btnClass} title="Home">
            <Home size={18} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className={inputContainerClass}>
          <Search size={16} className={isDark ? "text-slate-400 mr-2 shrink-0" : "text-slate-400 mr-2 shrink-0"} />
          <input 
            type="text" 
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            className={inputClass}
            placeholder="Search or enter website URL"
          />
          <button 
            type="button"
            onClick={toggleBookmark}
            className={`ml-2 p-1 rounded-full hover:bg-slate-200/20 transition-colors ${isBookmarked ? 'text-yellow-400' : isDark ? 'text-slate-400' : 'text-slate-400'}`}
            title={isBookmarked ? "Remove bookmark" : "Add bookmark"}
          >
            <Star size={16} fill={isBookmarked ? "currentColor" : "none"} />
          </button>
        </form>

        <div className="flex items-center gap-1">
          <button 
            onClick={openGemini}
            className={`${btnClass} text-blue-500 hover:text-blue-600`}
            title="Open Gemini"
          >
            <Sparkles size={18} />
          </button>
          <button 
            onClick={toggleIncognito}
            className={`${btnClass} ${isIncognito ? 'text-purple-400 hover:text-purple-300 hover:bg-slate-800' : ''}`}
            title="Toggle Incognito Mode"
          >
            <VenetianMask size={18} />
          </button>
          
          <div className="relative">
            <button 
              onClick={() => {
                setShowBookmarks(!showBookmarks);
                setShowUserMenu(false);
              }}
              className={`${btnClass} ${showBookmarks ? (isDark ? 'bg-slate-800' : 'bg-slate-300') : ''}`}
              title="Bookmarks"
            >
              <Bookmark size={18} />
            </button>
            
            {/* Bookmarks Dropdown */}
            {showBookmarks && (
              <div className={`absolute top-full right-0 mt-2 w-80 border shadow-xl rounded-lg z-50 flex flex-col max-h-[80vh] ${isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`}>
                <div className={`flex items-center justify-between p-3 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                  <h3 className="font-semibold">Bookmarks</h3>
                  <button onClick={() => setShowBookmarks(false)} className="hover:opacity-70"><X size={16}/></button>
                </div>
                <div className="overflow-y-auto p-2 flex-1">
                  {bookmarks.length === 0 ? (
                    <p className={`text-sm text-center py-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>No bookmarks yet</p>
                  ) : (
                    bookmarks.map(b => (
                      <div key={b.id} className={`flex items-center justify-between p-2 rounded group ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-50'}`}>
                        <button className="truncate flex-1 text-left text-sm hover:underline" onClick={() => { navigateTo(b.url); setShowBookmarks(false); }}>
                          <div className={`font-medium truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{b.title}</div>
                          <div className={`text-xs truncate ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{b.url}</div>
                        </button>
                        <button onClick={() => removeBookmark(b.id)} className="p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="relative ml-1">
            <button 
              onClick={() => {
                setShowUserMenu(!showUserMenu);
                setShowBookmarks(false);
              }}
              className={`${btnClass} ${user ? 'text-blue-500' : ''} ${showUserMenu ? (isDark ? 'bg-slate-800' : 'bg-slate-300') : ''}`}
              title="Account"
            >
              {user && user.photoURL ? (
                <img src={user.photoURL} alt="User" className="w-5 h-5 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <UserCircle size={20} />
              )}
            </button>

            {/* User Menu Dropdown */}
            {showUserMenu && (
              <div className={`absolute top-full right-0 mt-2 w-64 border shadow-xl rounded-lg z-50 flex flex-col ${isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`}>
                <div className={`flex items-center justify-between p-3 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                  <h3 className="font-semibold">Account</h3>
                  <button onClick={() => setShowUserMenu(false)} className="hover:opacity-70"><X size={16}/></button>
                </div>
                
                {/* Theme Selector */}
                <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                  <span className="text-sm font-medium">Theme</span>
                  <div className={`flex gap-1 p-1 rounded-lg ${isDark ? 'bg-slate-900' : 'bg-slate-100'}`}>
                    <button onClick={() => setTheme('light')} className={`px-3 py-1 text-xs rounded-md transition-colors ${theme === 'light' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>Light</button>
                    <button onClick={() => setTheme('dark')} className={`px-3 py-1 text-xs rounded-md transition-colors ${theme === 'dark' ? 'bg-slate-700 shadow-sm text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>Dark</button>
                  </div>
                </div>

                <div className="p-4">
                  {user ? (
                    <div className="flex flex-col items-center">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt="User" className="w-16 h-16 rounded-full mb-3" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-3">
                          <UserCircle size={40} />
                        </div>
                      )}
                      <p className="font-medium mb-1">{user.displayName || 'User'}</p>
                      <p className={`text-sm mb-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{user.email}</p>
                      <button 
                        onClick={handleLogout}
                        className="w-full py-2 px-4 bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors text-sm font-medium"
                      >
                        Sign Out
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <p className={`text-sm text-center mb-4 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                        Sign in to sync your bookmarks and history across devices.
                      </p>
                      <button 
                        onClick={handleLogin}
                        className="w-full py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors text-sm font-medium"
                      >
                        Sign In
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className={`flex items-center px-2 py-1.5 gap-2 overflow-x-auto no-scrollbar border-b ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-200 border-slate-300'}`}>
        {activeTabs.map(tab => (
          <div 
            key={tab.id}
            onClick={() => isIncognito ? setActiveIncognitoTabId(tab.id) : setActiveTabId(tab.id)}
            className={`flex items-center gap-2 px-4 py-1.5 min-w-[120px] max-w-[200px] rounded-full cursor-pointer text-sm transition-colors border ${
              tab.id === activeTabIdCurrent 
                ? (isDark ? 'bg-slate-800 text-slate-200 border-slate-700 z-10' : 'bg-white text-slate-800 border-slate-300 z-10 shadow-sm')
                : (isDark ? 'bg-slate-900/50 text-slate-400 border-transparent hover:bg-slate-800' : 'bg-slate-300/50 text-slate-600 border-transparent hover:bg-slate-300')
            }`}
          >
            <div className="truncate flex-1">
              {tab.title}
            </div>
            <button 
              onClick={(e) => closeTab(e, tab.id)}
              className={`p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 ${tab.id === activeTabIdCurrent ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <button 
          onClick={createTab}
          className={`p-1.5 rounded-full ${isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-600 hover:bg-slate-300 hover:text-slate-800'}`}
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Warning Banner */}
      <div className={`px-4 py-2 flex items-start gap-2 text-xs shrink-0 ${isDark ? 'bg-slate-900 border-b border-slate-800 text-slate-400' : 'bg-amber-50 border-b border-amber-200 text-amber-800'}`}>
        {isIncognito ? (
          <>
            <VenetianMask size={14} className="mt-0.5 shrink-0 text-purple-400" />
            <p>
              <strong>Режим инкогнито:</strong> История, файлы cookie и данные сайтов не сохраняются. Обратите внимание, что некоторые сайты могут блокировать загрузку в iframe.
            </p>
          </>
        ) : (
          <>
            <ShieldAlert size={14} className="mt-0.5 shrink-0 text-amber-600" />
            <p>
              <strong>Обратите внимание:</strong> Некоторые сайты (например, YouTube, GitHub) блокируют отображение внутри других сайтов из соображений безопасности (X-Frame-Options).
            </p>
          </>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Viewport */}
        <div className={`flex-1 relative ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
          {isLoading && activeTab?.url && (
            <div className={`absolute inset-0 flex flex-col items-center justify-center z-20 ${isDark ? 'bg-slate-800' : 'bg-slate-50'}`}>
              <Globe size={32} className={`${isDark ? 'text-slate-600' : 'text-slate-300'} animate-pulse mb-4`} />
              <div className={`w-48 h-1 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
                <div className={`h-full w-1/2 animate-[bounce_1s_infinite_linear] ${isDark ? 'bg-purple-500' : 'bg-blue-500'}`} style={{ transformOrigin: 'left' }}></div>
              </div>
            </div>
          )}
          
          {[...tabs, ...incognitoTabs].map(tab => {
            const isActive = isIncognito ? tab.id === activeIncognitoTabId : tab.id === activeTabId;
            const isCurrentMode = isIncognito ? incognitoTabs.some(t => t.id === tab.id) : tabs.some(t => t.id === tab.id);
            
            if (!isCurrentMode) return null;
            
            return (
              <div key={tab.id} className={`absolute inset-0 ${isActive ? 'z-10' : 'z-0 hidden'}`}>
                {tab.url === 'app://gemini' ? (
                  <div className={`w-full h-full flex ${isDark ? 'bg-[#131314] text-[#e3e3e3]' : 'bg-white text-[#1f1f1f]'}`}>
                    {/* Sidebar */}
                    <div className={`hidden md:flex flex-col w-[280px] p-4 ${isDark ? 'bg-[#1e1f20]' : 'bg-[#f0f4f9]'}`}>
                      <div className="flex justify-between items-center mb-8">
                        <button className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full"><Menu size={24} /></button>
                        <button className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full"><Search size={20} /></button>
                      </div>
                      <button 
                        onClick={handleNewChat}
                        className={`flex items-center gap-3 px-4 py-3 rounded-full w-fit mb-4 text-sm font-medium transition-colors ${isDark ? 'bg-[#282a2c] hover:bg-[#333537]' : 'bg-[#dde3ea] hover:bg-[#d3d9e0]'}`}
                      >
                        <MessageSquarePlus size={20} />
                        Новый чат
                      </button>
                      
                      <div className="flex-1 overflow-y-auto flex flex-col gap-1 pr-2">
                        {geminiChats.length > 0 && <div className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mt-2">Чаты</div>}
                        {geminiChats.map(chat => (
                          <div key={chat.id} className={`group flex items-center justify-between px-4 py-2.5 rounded-full text-sm font-medium transition-colors cursor-pointer ${currentChatId === chat.id ? (isDark ? 'bg-[#282a2c]' : 'bg-[#dde3ea]') : (isDark ? 'hover:bg-[#282a2c]' : 'hover:bg-[#dde3ea]')}`} onClick={() => loadChat(chat)}>
                            <span className="truncate flex-1">{chat.title}</span>
                            <button onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-opacity"><Trash2 size={14}/></button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 flex flex-col relative">
                      {/* Header */}
                      <div className="flex justify-between items-center p-4">
                        <div className="text-xl font-medium tracking-wide flex-1 text-center md:text-left md:ml-4">Gemini</div>
                        {user && user.photoURL ? (
                          <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                        ) : (
                          <UserCircle size={32} />
                        )}
                      </div>

                      {/* Chat Area */}
                      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-40 flex flex-col items-center">
                        <div className="w-full max-w-3xl flex flex-col gap-6">
                          {aiMessages.length === 0 ? (
                            <div className="flex flex-col mt-10 md:mt-20">
                              <h1 className="text-3xl md:text-4xl font-medium mb-1">
                                Здравствуйте, {user?.displayName ? user.displayName.split(' ')[0] : 'Пользователь'}!
                              </h1>
                              <h2 className="text-4xl md:text-5xl font-semibold mb-12">
                                С чего начнем?
                              </h2>
                              
                              <div className="flex flex-wrap gap-3">
                                <button onClick={() => setAiInput('Создать изображение ')} className={`flex items-center gap-2 px-4 py-3 rounded-full text-sm transition-colors ${isDark ? 'bg-[#1e1f20] hover:bg-[#282a2c]' : 'bg-[#f0f4f9] hover:bg-[#e1e5ea]'}`}>
                                  <ImageIcon size={18} className="text-green-600 dark:text-green-400" /> Создать изображение
                                </button>
                                <button onClick={() => setAiInput('Создать музыку ')} className={`flex items-center gap-2 px-4 py-3 rounded-full text-sm transition-colors ${isDark ? 'bg-[#1e1f20] hover:bg-[#282a2c]' : 'bg-[#f0f4f9] hover:bg-[#e1e5ea]'}`}>
                                  <Music size={18} className="text-red-500 dark:text-red-400" /> Создать музыку
                                </button>
                                <button onClick={() => setAiInput('Напишите что-нибудь ')} className={`flex items-center gap-2 px-4 py-3 rounded-full text-sm transition-colors ${isDark ? 'bg-[#1e1f20] hover:bg-[#282a2c]' : 'bg-[#f0f4f9] hover:bg-[#e1e5ea]'}`}>
                                  <PenLine size={18} className="text-slate-500 dark:text-slate-400" /> Напишите что-нибудь
                                </button>
                                <button onClick={() => setAiInput('Научи меня ')} className={`flex items-center gap-2 px-4 py-3 rounded-full text-sm transition-colors ${isDark ? 'bg-[#1e1f20] hover:bg-[#282a2c]' : 'bg-[#f0f4f9] hover:bg-[#e1e5ea]'}`}>
                                  <BookOpen size={18} className="text-orange-500 dark:text-orange-400" /> Научи меня
                                </button>
                                <button onClick={() => setAiInput('Улучши мой день ')} className={`flex items-center gap-2 px-4 py-3 rounded-full text-sm transition-colors ${isDark ? 'bg-[#1e1f20] hover:bg-[#282a2c]' : 'bg-[#f0f4f9] hover:bg-[#e1e5ea]'}`}>
                                  <Sparkles size={18} className="text-yellow-500 dark:text-yellow-400" /> Улучши мой день
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-8 mt-6">
                              {aiMessages.map((msg, i) => (
                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                  {msg.role === 'model' && <Sparkles size={24} className="text-blue-500 mr-4 shrink-0 mt-1" />}
                                  <div className={`max-w-[85%] flex flex-col gap-2 ${msg.role === 'user' ? (isDark ? 'bg-[#282a2c] px-5 py-3 rounded-3xl' : 'bg-[#f0f4f9] px-5 py-3 rounded-3xl') : 'prose prose-sm md:prose-base dark:prose-invert'}`}>
                                    {msg.image && <img src={msg.image} alt="Uploaded content" className="max-w-full h-auto rounded-xl" />}
                                    {msg.role === 'user' ? <div>{msg.text}</div> : <Markdown>{msg.text}</Markdown>}
                                  </div>
                                </div>
                              ))}
                              {isAILoading && (
                                <div className="flex justify-start">
                                  <Sparkles size={24} className="text-blue-500 mr-4 shrink-0 mt-1 animate-pulse" />
                                  <Loader2 size={24} className="animate-spin text-slate-400" />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Input Area */}
                      <div className={`absolute bottom-0 left-0 right-0 p-4 md:p-6 ${isDark ? 'bg-gradient-to-t from-[#131314] via-[#131314] to-transparent' : 'bg-gradient-to-t from-white via-white to-transparent'}`}>
                        <form onSubmit={handleAISubmit} className="max-w-3xl mx-auto">
                          <div className={`flex flex-col gap-2 rounded-[24px] p-2 md:p-3 shadow-sm border transition-all ${isDark ? 'bg-[#1e1f20] border-slate-700' : 'bg-[#f0f4f9] border-transparent focus-within:bg-white focus-within:border-slate-300 focus-within:shadow-md'}`}>
                            {selectedImage && (
                              <div className="relative inline-block w-fit ml-3 mt-2">
                                <img src={`data:${selectedImageMimeType};base64,${selectedImage}`} alt="Preview" className="h-20 rounded-xl object-cover border border-slate-200 dark:border-slate-700" />
                                <button type="button" onClick={() => { setSelectedImage(null); setSelectedImageMimeType(null); }} className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full p-1 hover:bg-slate-700"><X size={14}/></button>
                              </div>
                            )}
                            <input
                              type="text"
                              value={aiInput}
                              onChange={e => setAiInput(e.target.value)}
                              placeholder="Спросить Gemini"
                              className="w-full bg-transparent outline-none px-3 py-2 text-base"
                            />
                            <div className="flex justify-between items-center px-2">
                              <div className="flex gap-3 text-slate-500">
                                <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />
                                <button type="button" onClick={() => fileInputRef.current?.click()} className="hover:text-slate-800 dark:hover:text-slate-200" title="Upload image"><Plus size={20} /></button>
                                <button type="button" className="hover:text-slate-800 dark:hover:text-slate-200"><SlidersHorizontal size={20} /></button>
                              </div>
                              <div className="flex gap-2 items-center">
                                <button type="button" className={`text-xs px-3 py-1.5 rounded-full font-medium ${isDark ? 'bg-[#282a2c] text-slate-300' : 'bg-white text-slate-700 shadow-sm'}`}>Быстрая</button>
                                <button 
                                  type="button" 
                                  onClick={() => toggleListening('ai')}
                                  className={`p-2 rounded-full transition-colors ${listeningTarget === 'ai' ? 'text-red-500 bg-red-500/10 animate-pulse' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                                  title={listeningTarget === 'ai' ? "Stop listening" : "Start voice input"}
                                >
                                  <Mic size={20} />
                                </button>
                                <button type="button" className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"><AudioLines size={20} /></button>
                                {(aiInput.trim() || selectedImage) ? (
                                  <button type="submit" disabled={isAILoading} className="p-2 text-blue-500 hover:bg-blue-500/10 rounded-full transition-colors">
                                    <Send size={20} />
                                  </button>
                                ) : (
                                  <div className="w-9 h-9"></div> /* Spacer to keep layout stable */
                                )}
                              </div>
                            </div>
                          </div>
                        </form>
                        <div className="text-center text-xs opacity-50 mt-3">
                          Gemini может допускать ошибки. Рекомендуем проверять важную информацию.
                        </div>
                      </div>
                    </div>
                  </div>
                ) : tab.url === 'app://newtab' ? (
                  <div 
                    className="w-full h-full relative flex flex-col items-center justify-center overflow-hidden"
                    style={{
                      backgroundColor: customBg?.type === 'color' ? customBg.value : undefined,
                      backgroundImage: customBg?.type === 'image' 
                        ? `url(${customBg.value})` 
                        : (customBg?.type === 'color' ? undefined : `url(${sparrowBg})`),
                      backgroundSize: 'cover',
                      backgroundPosition: 'center'
                    }}
                  >
                    {(customBg?.type === 'image' || !customBg) && (
                      <div className="absolute inset-0 bg-black/20 pointer-events-none" />
                    )}

                    {/* Search Box */}
                    <div className="w-full max-w-2xl px-4 flex flex-col items-center z-10">
                      <div className={`mb-8 text-6xl font-semibold drop-shadow-md flex items-center gap-3 tracking-wide ${
                        (customBg?.type === 'image' || !customBg) ? 'text-white' : (isDark ? 'text-white' : 'text-slate-800')
                      }`}>
                        <Bird size={56} className="text-[#3b82f6] animate-[pulse_3s_infinite]" />
                        <span>Sparrow</span>
                      </div>
                      <form 
                        onSubmit={(e) => {
                          e.preventDefault();
                          const form = e.target as HTMLFormElement;
                          const input = form.elements.namedItem('q') as HTMLInputElement;
                          if (input.value) navigateTo(input.value);
                        }}
                        className={`w-full flex items-center rounded-full px-5 py-3.5 shadow-lg border focus-within:ring-2 focus-within:ring-blue-500 transition-all ${
                          (customBg?.type === 'image' || !customBg) 
                            ? 'bg-white/90 dark:bg-slate-900/90 backdrop-blur border-white/20' 
                            : (isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200')
                        }`}
                      >
                        <Search size={20} className="text-slate-400 mr-3" />
                        <input 
                          name="q"
                          type="text" 
                          value={sparrowQuery}
                          onChange={(e) => setSparrowQuery(e.target.value)}
                          placeholder="Введите поисковый запрос или URL"
                          className={`flex-1 bg-transparent outline-none ${
                            (customBg?.type === 'image' || !customBg) ? 'text-slate-900 dark:text-white' : (isDark ? 'text-slate-200' : 'text-slate-800')
                          }`}
                          autoFocus
                        />
                        <button 
                          type="button" 
                          onClick={() => toggleListening('search')} 
                          className={`p-2 rounded-full transition-colors ${
                            listeningTarget === 'search' 
                              ? 'text-red-500 bg-red-500/10 animate-pulse' 
                              : 'text-slate-400 hover:text-blue-500'
                          }`}
                          title={listeningTarget === 'search' ? "Stop listening" : "Start voice input"}
                        >
                          <Mic size={20} />
                        </button>
                      </form>
                    </div>

                    {/* Customize Button */}
                    <div className="absolute bottom-6 right-6 z-10">
                      <button 
                        onClick={() => setShowBgMenu(!showBgMenu)}
                        className={`p-3 rounded-full shadow-lg transition-colors ${
                          (customBg?.type === 'image' || !customBg) 
                            ? 'bg-black/50 hover:bg-black/70 text-white backdrop-blur' 
                            : (isDark ? 'bg-slate-700 hover:bg-slate-600 text-slate-200' : 'bg-white hover:bg-slate-50 text-slate-700')
                        }`}
                        title="Настроить страницу"
                      >
                        <PenLine size={20} />
                      </button>
                      
                      {showBgMenu && (
                        <div className={`absolute bottom-full right-0 mb-4 w-72 rounded-2xl shadow-2xl border p-5 ${
                          isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
                        }`}>
                          <div className="flex justify-between items-center mb-4">
                            <h3 className="font-medium">Настроить фон</h3>
                            <button onClick={() => setShowBgMenu(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={16}/></button>
                          </div>
                          
                          <div className="mb-5">
                            <p className="text-xs text-slate-500 mb-3">Цвета</p>
                            <div className="flex flex-wrap gap-2.5">
                              {['#f8fafc', '#1e293b', '#fee2e2', '#dcfce7', '#dbeafe', '#f3e8ff', '#fef08a', '#ffedd5', '#fce7f3'].map(color => (
                                <button 
                                  key={color}
                                  onClick={() => {
                                    const bg = { type: 'color' as const, value: color };
                                    setCustomBg(bg);
                                    localStorage.setItem('customBg', JSON.stringify(bg));
                                  }}
                                  className="w-8 h-8 rounded-full border border-slate-300 dark:border-slate-600 shadow-sm hover:scale-110 transition-transform"
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                            </div>
                          </div>
                          
                          <div>
                            <p className="text-xs text-slate-500 mb-3">Изображение</p>
                            <input 
                              type="file" 
                              accept="image/*" 
                              id="bg-upload" 
                              className="hidden" 
                              onChange={handleBgUpload} 
                            />
                            <label 
                              htmlFor="bg-upload"
                              className={`flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl cursor-pointer text-sm font-medium transition-colors ${
                                isDark ? 'bg-slate-700 hover:bg-slate-600 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                              }`}
                            >
                              <ImageIcon size={18} />
                              Загрузить картинку
                            </label>
                          </div>

                          {customBg && (
                            <button 
                              onClick={() => {
                                setCustomBg(null);
                                localStorage.removeItem('customBg');
                              }}
                              className="mt-4 w-full py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors"
                            >
                              Сбросить к Sparrow
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : tab.url ? (
                  <iframe 
                    src={tab.url} 
                    className={`w-full h-full border-none ${isDark ? 'bg-slate-800' : 'bg-white'}`}
                    title={`Browser Viewport ${tab.id}`}
                    sandbox={incognitoTabs.some(t => t.id === tab.id) ? "allow-scripts allow-popups allow-forms" : "allow-same-origin allow-scripts allow-popups allow-forms"}
                    onLoad={() => { if (isActive) setIsLoading(false); }}
                    onError={() => { if (isActive) setIsLoading(false); }}
                  />
                ) : (
                  <div className={`w-full h-full flex flex-col items-center justify-center ${isDark ? 'text-slate-500 bg-slate-800' : 'text-slate-400 bg-slate-50'}`}>
                    <Globe size={48} className="mb-4 opacity-20" />
                    <p>Введите URL или поисковый запрос</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
