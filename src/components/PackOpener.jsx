import React, { useState, useEffect, useRef } from 'react';
import { db } from '../utils/db';
import { Gift, Timer, Package, Sparkles, CheckCircle, RefreshCw } from 'lucide-react';
import PremiumCard from './PremiumCard';
import { playTearSound, playSparkleSound } from '../utils/sounds';

const CLAIM_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours in ms
const STICKERS_PER_PACK = 5;

export default function PackOpener({ refreshProgress }) {
  const [packsAvailable, setPacksAvailable] = useState(0);
  const [lastClaimed, setLastClaimed] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isOpening, setIsOpening] = useState(false);
  const [isRipped, setIsRipped] = useState(false);
  const [openedCards, setOpenedCards] = useState([]);
  const [revealStates, setRevealStates] = useState([false, false, false, false, false]);
  const timeoutsRef = useRef([]);

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    loadPackInfo();
  }, []);

  // Update countdown timer every second
  useEffect(() => {
    if (lastClaimed === 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastClaimed;
      const remaining = Math.max(0, CLAIM_COOLDOWN_MS - elapsed);
      setTimeRemaining(remaining);

      // If time completed, reload pack info to enable claim button
      if (remaining === 0) {
        loadPackInfo();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lastClaimed]);

  const loadPackInfo = async () => {
    const status = await db.packsInfo.get('status');
    if (status) {
      setPacksAvailable(status.packsAvailable);
      setLastClaimed(status.lastClaimed);
      const now = Date.now();
      const elapsed = now - status.lastClaimed;
      setTimeRemaining(Math.max(0, CLAIM_COOLDOWN_MS - elapsed));
    }
  };

  const handleClaimPack = async () => {
    if (timeRemaining > 0) return;

    const now = Date.now();
    await db.packsInfo.put({
      id: 'status',
      lastClaimed: now,
      packsAvailable: packsAvailable + 1
    });

    setPacksAvailable(prev => prev + 1);
    setLastClaimed(now);
    setTimeRemaining(CLAIM_COOLDOWN_MS);
  };

  // Cheat code button to instantly get a pack for testing/demo purposes
  const handleGetCheatPack = async () => {
    await db.packsInfo.put({
      id: 'status',
      lastClaimed: lastClaimed,
      packsAvailable: packsAvailable + 1
    });
    setPacksAvailable(prev => prev + 1);
  };

  const handleOpenPack = async () => {
    if (packsAvailable <= 0 || isOpening) return;

    const allStickers = await db.stickers.toArray();
    if (allStickers.length === 0) {
      alert('Primero debes crear o cargar un álbum en la sección "Creador de Álbum".');
      return;
    }

    setIsOpening(true);
    setIsRipped(false);
    setRevealStates([false, false, false, false, false]);
    playTearSound(); // Play tear synthesizer crinkle

    // Choose 5 random stickers
    const selectedStickers = [];
    const inventoryUpdates = [];
    const newItemsCheck = [];

    for (let i = 0; i < STICKERS_PER_PACK; i++) {
      const randomIndex = Math.floor(Math.random() * allStickers.length);
      const sticker = allStickers[randomIndex];
      selectedStickers.push(sticker);
      
      // Get current inventory state
      const invItem = await db.inventory.get(sticker.id);
      const isNew = !invItem || invItem.owned === 0;
      
      newItemsCheck.push(isNew);
      
      inventoryUpdates.push({
        stickerId: sticker.id,
        owned: (invItem?.owned || 0) + 1,
        pasted: invItem?.pasted || false
      });
    }

    // Bulk save back to inventory database
    await Promise.all(
      inventoryUpdates.map(update => db.inventory.put(update))
    );

    // Save pack claim info decrement
    await db.packsInfo.put({
      id: 'status',
      lastClaimed,
      packsAvailable: packsAvailable - 1
    });

    setPacksAvailable(prev => prev - 1);

    // Map stickers with their duplicate/new status
    const cards = selectedStickers.map((sticker, idx) => ({
      ...sticker,
      isNew: newItemsCheck[idx]
    }));

    // Set cards immediately under the hood
    setOpenedCards(cards);

    timeoutsRef.current.forEach(clearTimeout);

    // Shake the pack, then rip it open
    const t1 = setTimeout(() => {
      setIsRipped(true);
    }, 1200);

    timeoutsRef.current = [t1];
  };

  const handleSkipAnimation = () => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    setIsRipped(true);
  };

  const handleRevealAll = () => {
    setRevealStates([true, true, true, true, true]);
    playSparkleSound();
  };

  const handleRevealCard = (idx) => {
    if (revealStates[idx]) return; // Prevent double sound on double click

    setRevealStates(prev => {
      const next = [...prev];
      next[idx] = true;
      return next;
    });

    playSparkleSound(); // Play cute sparkles sound chime!
  };

  const handleCollectAll = () => {
    setIsOpening(false);
    setOpenedCards([]);
    setRevealStates([false, false, false, false, false]);
    refreshProgress();
  };

  // Timer formatter
  const formatTime = (ms) => {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {!isOpening ? (
        /* Pack Lobby */
        <div className="opener-lobby">
          {/* Claim Section */}
          <div className="glass-panel p-8 flex flex-col items-center justify-between text-center" style={{ relative: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '-20px', right: '-20px', color: 'rgba(138, 43, 226, 0.04)', pointerEvents: 'none', zIndex: 1 }}>
              <Gift size={160} />
            </div>

            <div style={{ zIndex: 5, position: 'relative' }}>
              <h2 className="text-3xl font-extrabold mb-3 font-display">Paquete Gratis</h2>
              <p className="text-slate-400 mb-8 max-w-sm text-sm">
                ¡Reclama un sobre de figuritas gratis cada 2 horas para completar tu álbum!
              </p>

              {timeRemaining > 0 ? (
                <div className="lobby-timer-box flex flex-col items-center">
                  <div className="flex items-center gap-2 text-slate-500 text-xs uppercase font-bold tracking-wider mb-1">
                    <Timer size={14} className="text-purple-400" />
                    Siguiente sobre en
                  </div>
                  <div className="font-display font-black text-3xl text-white" style={{ letterSpacing: '2px' }}>
                    {formatTime(timeRemaining)}
                  </div>
                </div>
              ) : (
                <button 
                  onClick={handleClaimPack}
                  className="btn-gold text-lg py-4 px-8 mb-4 flex items-center gap-2"
                >
                  <Gift size={20} /> Reclamar sobre gratis
                </button>
              )}
            </div>
            
            <div className="text-xs text-slate-600" style={{ zIndex: 5, marginTop: '2rem' }}>
              El tiempo restante se guarda localmente en tu navegador.
            </div>
          </div>

          {/* Opening Section */}
          <div className="glass-panel p-8 flex flex-col items-center justify-between text-center" style={{ relative: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '-20px', left: '-20px', color: 'rgba(251, 191, 36, 0.02)', pointerEvents: 'none', zIndex: 1 }}>
              <Package size={170} />
            </div>

            <div style={{ zIndex: 5, position: 'relative' }}>
              <h2 className="text-3xl font-extrabold mb-3 font-display">Tus Sobres</h2>
              
              <div style={{ margin: '2rem 0', display: 'flex', itemsCenter: 'center', justifyContent: 'center', gap: '1.5rem' }}>
                <div className="pack-card-visual animate-float">
                  <div className="pack-card-inner-border">
                    <span className="font-display font-black text-lg text-amber-200">FIGUS</span>
                  </div>
                </div>
                <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Sobres sin abrir</div>
                  <div className="font-display font-black text-5xl text-white">{packsAvailable}</div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button 
                  onClick={handleOpenPack}
                  disabled={packsAvailable === 0}
                  className="btn-primary text-lg py-4 px-10 flex items-center justify-center gap-2"
                >
                  <Package size={20} /> Abrir Sobre (5 Figus)
                </button>
                
                {/* Developer Cheat Mode Button */}
                <button 
                  onClick={handleGetCheatPack}
                  className="text-slate-600 hover:text-slate-400 transition-colors"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', marginTop: '10px', display: 'flex', itemsCenter: 'center', gap: '4px', margin: '10px auto 0' }}
                >
                  <RefreshCw size={10} /> +1 Sobre (Modo Desarrollador)
                </button>
              </div>
            </div>

            <div className="text-xs text-slate-600" style={{ zIndex: 5, marginTop: '2rem' }}>
              Cada sobre contiene 5 figuritas aleatorias del álbum activo.
            </div>
          </div>
        </div>
      ) : (
        /* Pack Tearing & Revealing Cards Screen */
        <div className="glass-panel-heavy p-8" style={{ minHeight: '520px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
          
          {/* Animation container wrapper */}
          <div className="flex-grow flex flex-col items-center justify-center w-full relative" style={{ minHeight: '480px' }}>
            
            {/* 1. Foil Pack Tearing wrapper (Fades & splits when ripped) */}
            {openedCards.length > 0 && (
              <div 
                className="pack-container-wrapper"
                style={{ 
                  display: isRipped && openedCards.length === 0 ? 'none' : 'block', 
                  zIndex: 30, 
                  pointerEvents: isRipped ? 'none' : 'auto',
                  position: isRipped ? 'absolute' : 'relative'
                }}
              >
                <div className={`foil-pack-container ${isOpening && !isRipped ? 'shaking' : ''} ${isRipped ? 'ripped' : ''}`}>
                  
                  {/* Pack Top Half */}
                  <div className="foil-pack-top">
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.8)', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.15em', fontFamily: 'var(--font-display)' }}>
                      FIGUS ÁLBUM
                    </span>
                  </div>
                  
                  {/* Pack Bottom Half */}
                  <div className="foil-pack-bottom">
                    <div style={{ border: '1.5px solid rgba(255, 255, 255, 0.25)', borderRadius: '12px', padding: '16px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', textAlign: 'center', background: 'rgba(0,0,0,0.1)' }}>
                      <div className="text-[20px] tracking-widest font-black uppercase text-yellow-100 font-display" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.15)' }}>
                        OFICIAL
                      </div>
                      
                      <div style={{ padding: '14px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '50%', color: 'white', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
                        <Sparkles size={26} />
                      </div>

                      <div>
                        <div className="font-display font-black text-sm text-white">SOBRE DE FIGURITAS</div>
                        <div className="text-[9px] text-yellow-100 uppercase tracking-widest font-bold mt-1">Contiene 5 Figus</div>
                      </div>
                    </div>
                  </div>
                  
                </div>
              </div>
            )}

            {/* 2. Interactive Card Revealing Grid (fades & slides up when ripped) */}
            {isRipped && (
              <div className="deal-cards-lobby w-full" style={{ zIndex: 10 }}>
                <h3 className="text-xl font-bold font-display text-center mb-4 flex items-center justify-center gap-2" style={{ color: '#2d2a26' }}>
                  <Sparkles className="text-amber-500" />
                  Haz clic en cada figurita para revelarla
                </h3>

                {!revealStates.every(state => state === true) && (
                  <button 
                    onClick={handleRevealAll}
                    className="btn-secondary mb-6"
                    style={{ padding: '8px 20px', fontSize: '12px', borderRadius: '10px' }}
                  >
                    Revelar Todas
                  </button>
                )}

                {/* Grid of cards */}
                <div className="opened-cards-grid">
                  {openedCards.map((card, idx) => (
                    <div 
                      key={idx}
                      onClick={() => handleRevealCard(idx)}
                      className="flip-card-container animate-card-slide-in"
                      style={{ 
                        perspective: '1000px',
                        animationDelay: `${idx * 0.12}s`
                      }}
                    >
                      {/* Card container with flip transform */}
                      <div 
                        className="card-flipper-inner"
                        style={{ 
                          transform: revealStates[idx] ? 'rotateY(180deg)' : 'rotateY(0deg)' 
                        }}
                      >
                        {/* CARD BACK */}
                        <div className="card-back-side">
                          <div className="card-back-frame">
                            <span className="font-display font-black text-slate-400 text-sm">FIGUS</span>
                            <Sparkles size={12} className="text-amber-500/20" />
                          </div>
                        </div>

                        {/* CARD FRONT */}
                        <div className="card-front-side">
                          {revealStates[idx] && (
                            <div className="w-full h-full relative">
                              {/* Card visual */}
                              <PremiumCard 
                                image={card.image} 
                                name={card.name} 
                                isRare={card.isRare} 
                              />
                              
                              {/* New/Duplicate indicator */}
                              <div style={{ position: 'absolute', bottom: '8px', left: '8px', right: '8px', display: 'flex', justifyContent: 'center', zIndex: 20 }}>
                                {card.isNew ? (
                                  <span style={{ backgroundColor: '#10b981', color: '#ffffff', fontSize: '9px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 8px', borderRadius: '50px', boxShadow: '0 4px 10px rgba(16,185,129,0.3)' }}>
                                    ¡NUEVA!
                                  </span>
                                ) : (
                                  <span style={{ backgroundColor: 'rgba(45, 42, 38, 0.9)', color: '#eae4d3', fontSize: '9px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 8px', borderRadius: '50px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    Repetida
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Show Collect button only when all are revealed */}
                {revealStates.every(state => state === true) && (
                  <button 
                    onClick={handleCollectAll}
                    className="btn-primary"
                    style={{ padding: '12px 32px', marginTop: '2rem' }}
                  >
                    <CheckCircle size={18} /> Guardar en Inventario
                  </button>
                )}
              </div>
            )}

            {/* Skip animation button (only shown when not ripped yet) */}
            {!isRipped && (
              <button 
                onClick={handleSkipAnimation}
                className="btn-secondary"
                style={{ marginTop: '2rem', padding: '8px 20px', fontSize: '13px', borderRadius: '10px', zIndex: 40 }}
              >
                Saltar Animación
              </button>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
