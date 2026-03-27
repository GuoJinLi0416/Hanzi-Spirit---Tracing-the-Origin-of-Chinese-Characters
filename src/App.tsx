import React, { useState, useRef, useEffect } from 'react';
import { Search, Loader2, BookOpen, Volume2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ImagePlaceholderProps {
  prompt: string;
  lang: 'zh' | 'en';
}

const MiZiGe: React.FC<{ char: string; pinyin: string; lang: 'zh' | 'en' }> = ({ char, pinyin, lang }) => {
  const [imageStatus, setImageStatus] = useState<'loading' | 'found' | 'not-found'>('loading');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [videoChecked, setVideoChecked] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

  useEffect(() => {
    setImageStatus('loading');
    setVideoUrl(null);
    setImageUrl(null);
    setVideoChecked(false);
    setShowVideo(false);
    
    // Check for existing image
    fetch(`/api/image-exists/${encodeURIComponent(char)}`)
      .then(res => res.json())
      .then(data => {
        if (data.exists) {
          setImageUrl(data.imageUrl);
          setImageStatus('found');
        } else {
          setImageStatus('not-found');
        }
      })
      .catch(err => {
        console.error("Error checking image existence:", err);
        setImageStatus('not-found');
      });

    // Check for existing video
    fetch(`/api/video-exists/${encodeURIComponent(char)}`)
      .then(res => res.json())
      .then(data => {
        if (data.exists) {
          setVideoUrl(data.videoUrl);
        }
        setVideoChecked(true);
      })
      .catch(err => {
        console.error("Error checking video existence:", err);
        setVideoChecked(true);
      });
  }, [char]);

  const playPronunciation = () => {
    try {
      const utterance = new SpeechSynthesisUtterance(char);
      utterance.lang = 'zh-CN';
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.error("Error playing pronunciation:", error);
    }
  };

  const handleImageClick = async () => {
    if (videoUrl) {
      setShowVideo(true);
    } else if (videoChecked && !generating) {
      setGenerating(true);
      try {
        const res = await fetch(`/api/generate-video/${encodeURIComponent(char)}`, { method: 'POST' });
        const data = await res.json();
        if (data.videoUrl) {
          setVideoUrl(data.videoUrl);
          setShowVideo(true);
        } else {
          alert("视频生成失败，请稍后再试。");
        }
      } catch (err) {
        console.error("Error generating video:", err);
        alert("视频生成失败，请稍后再试。");
      } finally {
        setGenerating(false);
      }
    }
  };

  return (
    <div className="flex flex-col md:flex-row items-end gap-8">
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="text-2xl font-serif text-accent/60 tracking-widest lowercase italic">
            {pinyin}
          </div>
          <button onClick={playPronunciation} className="text-accent hover:text-blue-500 transition-all duration-200 hover:scale-110 cursor-pointer">
            <Volume2 size={20} />
          </button>
        </div>
        <div className="relative w-48 h-48 sm:w-64 sm:h-64 border-2 border-accent/30 bg-white shadow-inner flex items-center justify-center">
          {/* MiZiGe Lines */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
            <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2,2" className="text-accent/20" />
            <line x1="50" y1="0" x2="50" y2="100" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2,2" className="text-accent/20" />
            <line x1="0" y1="0" x2="100" y2="100" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2,2" className="text-accent/20" />
            <line x1="100" y1="0" x2="0" y2="100" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2,2" className="text-accent/20" />
          </svg>
          <span className="text-8xl sm:text-9xl font-kaiti text-accent z-10 select-none">
            {char}
          </span>
        </div>
      </div>

      {/* Image/Video Display Area */}
      <div 
        className="w-48 h-48 sm:w-64 sm:h-64 border-2 border-accent/30 bg-white shadow-inner flex items-center justify-center relative group cursor-pointer"
        onClick={handleImageClick}
      >
        {showVideo && videoUrl ? (
          <video 
            src={videoUrl} 
            autoPlay 
            loop 
            muted 
            playsInline
            preload="auto"
            controls
            className="w-full h-full object-cover" 
          />
        ) : !videoChecked || generating ? (
          <Loader2 className="animate-spin text-accent" />
        ) : imageStatus === 'loading' ? (
          <Loader2 className="animate-spin text-accent" />
        ) : imageStatus === 'found' && imageUrl ? (
          <div className="relative w-full h-full">
            <img src={imageUrl} alt={char} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-white text-sm font-bold bg-black/50 px-2 py-1 rounded">
                {lang === 'zh' ? '溯源' : 'Trace Origin'}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-accent/50 text-sm p-4 text-center">
            {lang === 'zh' ? '暂无意境图' : 'No atmosphere image'}
          </p>
        )}
      </div>
    </div>
  );
};

// Removed ImagePlaceholder component.

export default function App() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isComposing = useRef(false);

  const t = {
    zh: {
      title: '字里乾坤',
      subtitle: '探寻汉字之源 · 领略东方美学',
      placeholder: '输入一个汉字...',
      invalid: '请输入中文字符',
      footer: '@ 2026 字里乾坤 · 郭金莉',
      shuowen: '说文解字',
      visuals: '动态意境',
      videoDisabled: '视频生成功能暂未开启',
      error: '抱歉，书生倦怠，未能识得此字。',
      loading: '正在字里推演乾坤...'
    },
    en: {
      title: 'Hanzi Spirit',
      subtitle: 'Trace the Origin of Chinese Characters · Experience Eastern Aesthetics',
      placeholder: 'Enter a Chinese character...',
      invalid: 'Please enter a Chinese character',
      footer: '@ 2026 Hanzi Spirit · Jinli Guo',
      shuowen: 'Shuowen Jiezi',
      visuals: 'Dynamic Atmosphere',
      videoDisabled: 'Video generation disabled',
      error: 'Sorry, the scholar is tired and could not recognize this character.',
      loading: 'Unfolding the spirit of Hanzi...'
    }
  }[lang];

  const isChinese = (char: string) => {
    return /[\u4e00-\u9fa5]/.test(char);
  };

  const handleSearch = async (e?: React.FormEvent, overrideChar?: string) => {
    if (e) e.preventDefault();
    
    let targetChar = overrideChar;
    if (!targetChar) {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) {
        setErrorMsg(t.invalid);
        return;
      }
      targetChar = trimmedQuery.charAt(0);
    }
    
    if (loading) return;

    if (!isChinese(targetChar)) {
      setErrorMsg(t.invalid);
      return;
    }
    setErrorMsg(null);

    setLoading(true);
    setAnalysis(null);
    setIsStarted(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: targetChar }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch analysis');
      }
      setAnalysis({ ...data, char: targetChar });
    } catch (err: any) {
      console.error('Search error:', err);
      
      // Handle Quota Exceeded (429)
      if (err.status === 429 || err.message?.includes("429") || err.message?.includes("Quota exceeded")) {
        setErrorMsg(lang === 'zh' 
          ? "您的 API 额度已耗尽 (Quota Exceeded)。请稍后再试。" 
          : "Quota exceeded. Please try again later.");
      } else {
        setErrorMsg(err.message || t.error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCompositionStart = () => {
    isComposing.current = true;
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
    isComposing.current = false;
    const val = e.currentTarget.value;
    if (val.length > 1) {
      setQuery(val.charAt(0));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!isComposing.current) {
      setQuery(val.slice(0, 1));
    } else {
      setQuery(val);
    }
    setErrorMsg(null);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [analysis]);

  return (
    <div className="min-h-screen flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Lang Toggle */}
      <div className="absolute top-6 right-6 flex gap-2">
        <button 
          onClick={() => setLang('zh')}
          className={cn("px-3 py-1 text-xs rounded-full border transition-all", lang === 'zh' ? "bg-accent text-white border-accent" : "border-accent/20 text-accent/50")}
        >
          中文
        </button>
        <button 
          onClick={() => setLang('en')}
          className={cn("px-3 py-1 text-xs rounded-full border transition-all", lang === 'en' ? "bg-accent text-white border-accent" : "border-accent/20 text-accent/50")}
        >
          EN
        </button>
      </div>

      {/* Header */}
      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <h1 className="text-5xl sm:text-7xl font-serif font-bold tracking-tighter text-accent mb-2">
          {t.title}
        </h1>
        <p className="text-sm sm:text-base text-ink/60 tracking-[0.3em] uppercase">
          {t.subtitle}
        </p>
      </motion.header>

      {/* Search Section */}
      <div className={cn(
        "w-full max-w-xl transition-all duration-700 ease-in-out",
        isStarted ? "mb-12" : "mt-24"
      )}>
        <form onSubmit={handleSearch} className="relative group">
          <input
            type="text"
            value={query}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onChange={handleChange}
            placeholder={t.placeholder}
            className="w-full bg-white/80 border-b-2 border-accent/30 py-4 px-6 text-2xl focus:outline-none focus:border-accent transition-colors placeholder:text-ink/20 text-center font-serif"
          />
          <button
            type="submit"
            disabled={loading || !query}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-accent/50 hover:text-accent disabled:opacity-30 transition-colors"
          >
            {loading ? <Loader2 className="animate-spin" /> : <Search size={28} />}
          </button>
        </form>
        {errorMsg && (
          <motion.p 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="mt-2 text-center text-xs text-accent font-bold"
          >
            {errorMsg}
          </motion.p>
        )}
        {!isStarted && (
          <div className="mt-8 flex justify-center gap-4 text-xs text-ink/40 tracking-widest">
            {['山', '水', '日', '月', '人'].map((word) => (
              <button 
                key={word} 
                onClick={() => { setQuery(word); handleSearch(undefined, word); }}
                className="hover:text-accent transition-colors"
              >
                {word}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Result Section */}
      <AnimatePresence>
        {isStarted && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-5xl"
          >
            {loading && !analysis ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <Loader2 className="animate-spin text-accent w-12 h-12" />
                <p className="text-accent/60 font-serif italic tracking-widest">
                  {t.loading}
                </p>
              </div>
            ) : analysis && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                {/* Left Side: MiZiGe, Etymology & Modern Definitions */}
                <div className="lg:col-span-12 flex flex-col items-center space-y-8">
                  <MiZiGe char={analysis.char} pinyin={analysis.pinyin} lang={lang} />
                  
                  {/* Origin/Etymology */}
                  <div className="w-full max-w-2xl p-6 bg-white/50 backdrop-blur-sm border border-accent/10 rounded-2xl shadow-sm">
                    <h3 className="text-sm font-bold text-accent uppercase tracking-widest mb-4 flex items-center gap-2">
                      <BookOpen size={16} />
                      {lang === 'zh' ? '字源本意' : 'Etymology'}
                    </h3>
                    <p className="text-ink/80 leading-relaxed font-serif text-lg">
                      {lang === 'zh' ? analysis.explanation.zh_origin : analysis.explanation.en_origin}
                    </p>
                  </div>

                  {/* Modern Definitions */}
                  {analysis.explanation[`${lang}_modern`] && (
                    <div className="w-full max-w-2xl p-6 bg-white/50 backdrop-blur-sm border border-accent/10 rounded-2xl shadow-sm">
                      <h3 className="text-sm font-bold text-accent uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Search size={16} />
                        {lang === 'zh' ? '现代释义' : 'Modern Definitions'}
                      </h3>
                      <div className="space-y-4">
                        {analysis.explanation[`${lang}_modern`].map((item: any, idx: number) => (
                          <div key={idx} className="border-l-2 border-accent/10 pl-4 py-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-bold bg-accent/10 text-accent px-1.5 py-0.5 rounded uppercase">
                                {item.pos}
                              </span>
                              <span className="text-ink font-medium">{item.def}</span>
                            </div>
                            <div className="text-xs text-ink/50 italic">
                              {lang === 'zh' ? '举例：' : 'Example: '}{item.example}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="mt-auto pt-12 text-xs text-ink/30 tracking-widest uppercase text-center">
        {t.footer}
      </footer>

      <style>{`
        .writing-mode-vertical {
          writing-mode: vertical-rl;
          text-orientation: mixed;
        }
      `}</style>
    </div>
  );
}
