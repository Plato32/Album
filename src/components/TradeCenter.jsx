import React, { useState, useEffect } from 'react';
import { db } from '../utils/db';
import { Send, Download, FileText, Globe, Key, User, Plus, Trash2, ArrowLeftRight, Check, AlertCircle, Copy } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function TradeCenter({ progress, refreshProgress }) {
  const [activeTab, setActiveTab] = useState('offline'); // 'offline' or 'online'
  const [duplicates, setDuplicates] = useState([]);
  const [missing, setMissing] = useState([]);
  const [stickersMap, setStickersMap] = useState({});

  // Offline Trade State
  const [selectedOffer, setSelectedOffer] = useState([]); // stickers we are giving away
  const [selectedWant, setSelectedWant] = useState([]); // stickers we want
  const [generatedCode, setGeneratedCode] = useState('');
  const [importCode, setImportCode] = useState('');
  const [decodedProposal, setDecodedProposal] = useState(null);
  const [decodedConfirmation, setDecodedConfirmation] = useState(null);
  const [activeOfflineOfferId, setActiveOfflineOfferId] = useState(null);
  const [offlineStatus, setOfflineStatus] = useState({ error: '', success: '' });

  // Online Trade State
  const [nickname, setNickname] = useState('');
  const [roomId, setRoomId] = useState('');
  const [ws, setWs] = useState(null);
  const [onlineState, setOnlineState] = useState('disconnected'); // 'disconnected', 'connecting', 'waiting', 'trading', 'success'
  const [peerName, setPeerName] = useState('');
  const [myOffers, setMyOffers] = useState([]); // IDs of stickers I am offering
  const [peerOffers, setPeerOffers] = useState([]); // IDs of stickers peer is offering
  const [myConfirmed, setMyConfirmed] = useState(false);
  const [peerConfirmed, setPeerConfirmed] = useState(false);
  const [onlineStatusMsg, setOnlineStatusMsg] = useState('');

  useEffect(() => {
    loadTradingData();
    // Load active offer ID if stored in memory
    const storedOfferId = sessionStorage.getItem('activeOfferId');
    if (storedOfferId) setActiveOfflineOfferId(storedOfferId);
  }, []);

  const loadTradingData = async () => {
    const allStickers = await db.stickers.toArray();
    const allInventory = await db.inventory.toArray();
    
    const map = {};
    allStickers.forEach(s => {
      map[s.id] = s;
    });
    setStickersMap(map);

    // Filter duplicates: inventory items where owned > 1
    const dupesList = allInventory
      .filter(item => item.owned > 1)
      .map(item => ({
        ...map[item.stickerId],
        owned: item.owned
      }));
    setDuplicates(dupesList);

    // Filter missing: inventory items where owned === 0 or pasted === false
    const missingList = allInventory
      .filter(item => item.owned === 0)
      .map(item => map[item.stickerId]);
    setMissing(missingList);
  };

  // ----- OFFLINE TRADING LOGIC -----
  const generateOfflineOffer = () => {
    if (selectedOffer.length === 0 || selectedWant.length === 0) {
      setOfflineStatus({ success: '', error: 'Debes seleccionar al menos una figurita para dar y una para recibir.' });
      return;
    }

    const offerId = 'off-' + Math.random().toString(36).substring(2, 9);
    const offerPayload = {
      type: 'OFFER',
      offerId,
      give: selectedOffer,
      want: selectedWant,
      albumName: progress.name
    };

    // Store offerId in session to verify confirmation code later
    sessionStorage.setItem('activeOfferId', offerId);
    setActiveOfflineOfferId(offerId);

    const base64Code = btoa(JSON.stringify(offerPayload));
    setGeneratedCode(base64Code);
    setOfflineStatus({ error: '', success: '¡Propuesta generada! Copia el código de abajo y envíaselo a tu amigo.' });
  };

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code);
    alert('Código copiado al portapapeles.');
  };

  const handleParseImportCode = () => {
    setOfflineStatus({ error: '', success: '' });
    setDecodedProposal(null);
    setDecodedConfirmation(null);

    if (!importCode.trim()) {
      setOfflineStatus({ success: '', error: 'Ingresa un código válido.' });
      return;
    }

    try {
      const decodedJson = JSON.parse(atob(importCode.trim()));
      
      if (decodedJson.type === 'OFFER') {
        // Validate proposal: does the receiver have duplicates of what sender wants?
        setDecodedProposal(decodedJson);
      } else if (decodedJson.type === 'CONFIRM') {
        setDecodedConfirmation(decodedJson);
      } else {
        setOfflineStatus({ success: '', error: 'Código no reconocido o de tipo inválido.' });
      }
    } catch (err) {
      setOfflineStatus({ success: '', error: 'Error al decodificar el código. Asegúrate de copiarlo completo.' });
    }
  };

  const acceptOfflineProposal = async () => {
    if (!decodedProposal) return;
    
    // Double check inventory: do we have the stickers they want?
    const inventory = await db.inventory.toArray();
    const invMap = {};
    inventory.forEach(item => {
      invMap[item.stickerId] = item;
    });

    // Check if we have enough copies of the requested stickers
    const missingItems = decodedProposal.want.filter(stickerId => {
      const item = invMap[stickerId];
      return !item || item.owned <= 1; // Need duplicate (owned > 1) to trade it
    });

    if (missingItems.length > 0) {
      setOfflineStatus({
        success: '',
        error: `No puedes aceptar este intercambio. Te faltan copias repetidas de: ${missingItems.map(id => stickersMap[id]?.name || id).join(', ')}`
      });
      return;
    }

    try {
      // 1. Process inventory updates for receiver:
      // Lose cards we are giving (which is what sender wants)
      for (const giveId of decodedProposal.want) {
        const item = invMap[giveId];
        await db.inventory.update(giveId, { owned: item.owned - 1 });
      }
      // Gain cards we are receiving (which is what sender gives)
      for (const gainId of decodedProposal.give) {
        const item = invMap[gainId] || { owned: 0, pasted: false };
        await db.inventory.update(gainId, { owned: item.owned + 1 });
      }

      // 2. Generate confirmation code
      const confirmPayload = {
        type: 'CONFIRM',
        offerId: decodedProposal.offerId,
        give: decodedProposal.want, // what receiver gives
        want: decodedProposal.give  // what receiver wants
      };

      const base64Confirm = btoa(JSON.stringify(confirmPayload));
      
      confetti({ particleCount: 80, spread: 60 });
      setOfflineStatus({
        error: '',
        success: '¡Intercambio aceptado! Tu inventario ha sido actualizado. Envía este código de confirmación a tu amigo para completar el intercambio.'
      });
      
      setGeneratedCode(base64Confirm);
      setDecodedProposal(null);
      setImportCode('');
      loadTradingData();
      refreshProgress();
    } catch (err) {
      setOfflineStatus({ success: '', error: 'Error al procesar el intercambio: ' + err.message });
    }
  };

  const completeOfflineTrade = async () => {
    if (!decodedConfirmation) return;

    if (decodedConfirmation.offerId !== activeOfflineOfferId) {
      setOfflineStatus({
        success: '',
        error: 'Este código de confirmación no corresponde a tu oferta activa.'
      });
      return;
    }

    try {
      const inventory = await db.inventory.toArray();
      const invMap = {};
      inventory.forEach(item => {
        invMap[item.stickerId] = item;
      });

      // Process inventory updates for host:
      // Lose cards we gave (which is decodedConfirmation.want)
      for (const giveId of decodedConfirmation.want) {
        const item = invMap[giveId];
        await db.inventory.update(giveId, { owned: item.owned - 1 });
      }
      // Gain cards we received (which is decodedConfirmation.give)
      for (const gainId of decodedConfirmation.give) {
        const item = invMap[gainId] || { owned: 0, pasted: false };
        await db.inventory.update(gainId, { owned: item.owned + 1 });
      }

      confetti({ particleCount: 100, spread: 80 });
      setOfflineStatus({
        error: '',
        success: '¡Intercambio completado con éxito! Tu inventario ha sido actualizado.'
      });

      // Clear states
      sessionStorage.removeItem('activeOfferId');
      setActiveOfflineOfferId(null);
      setDecodedConfirmation(null);
      setImportCode('');
      setGeneratedCode('');
      setSelectedOffer([]);
      setSelectedWant([]);
      loadTradingData();
      refreshProgress();
    } catch (err) {
      setOfflineStatus({ success: '', error: 'Error al completar el intercambio: ' + err.message });
    }
  };


  // ----- ONLINE WEBSOCKET TRADING LOGIC -----
  const connectOnline = () => {
    if (!nickname.trim() || !roomId.trim()) {
      setOnlineStatusMsg('Por favor ingresa un apodo y una sala.');
      return;
    }

    setOnlineState('connecting');
    setOnlineStatusMsg('Conectando al servidor...');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.hostname === 'localhost' ? 'localhost:3001' : window.location.host;
    const wsUrl = `${protocol}//${wsHost}/trade`;

    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      setOnlineStatusMsg('Servidor conectado. Uniéndose a sala...');
      socket.send(JSON.stringify({
        type: 'join',
        roomId,
        nickname,
        duplicates: duplicates.map(d => d.id)
      }));
    };

    socket.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      
      switch (msg.type) {
        case 'joined':
          setOnlineState('waiting');
          setOnlineStatusMsg(`Unido a la sala ${roomId}. Esperando compañero...`);
          break;
        case 'peer-join':
          setPeerName(msg.peerName);
          setOnlineState('trading');
          setOnlineStatusMsg(`¡Conectado con ${msg.peerName}! Empezar intercambio.`);
          break;
        case 'peer-leave':
          setOnlineState('waiting');
          setOnlineStatusMsg(`${peerName} abandonó la sala. Esperando...`);
          setPeerOffers([]);
          setPeerConfirmed(false);
          setMyConfirmed(false);
          break;
        case 'peer-update-offer':
          setPeerOffers(msg.offers);
          break;
        case 'peer-confirm':
          setPeerConfirmed(msg.confirmed);
          break;
        case 'trade-complete':
          await applyOnlineTrade(msg.myGive, msg.myGain);
          break;
        case 'error':
          setOnlineStatusMsg(`Error: ${msg.message}`);
          socket.close();
          break;
      }
    };

    socket.onclose = () => {
      setOnlineState('disconnected');
      setWs(null);
      setMyConfirmed(false);
      setPeerConfirmed(false);
      setMyOffers([]);
      setPeerOffers([]);
    };

    socket.onerror = () => {
      setOnlineStatusMsg('Error de conexión con el servidor de intercambios.');
    };

    setWs(socket);
  };

  const disconnectOnline = () => {
    if (ws) {
      ws.close();
    }
  };

  const handleToggleOnlineOffer = (stickerId) => {
    if (onlineState !== 'trading' || myConfirmed) return;

    let nextOffers;
    if (myOffers.includes(stickerId)) {
      nextOffers = myOffers.filter(id => id !== stickerId);
    } else {
      nextOffers = [...myOffers, stickerId];
    }

    setMyOffers(nextOffers);

    ws.send(JSON.stringify({
      type: 'update-offer',
      offers: nextOffers
    }));
  };

  const handleConfirmOnlineOffer = () => {
    if (onlineState !== 'trading') return;
    
    const nextConfirm = !myConfirmed;
    setMyConfirmed(nextConfirm);

    ws.send(JSON.stringify({
      type: 'confirm',
      confirmed: nextConfirm
    }));
  };

  const applyOnlineTrade = async (giveIds, gainIds) => {
    try {
      const inventory = await db.inventory.toArray();
      const invMap = {};
      inventory.forEach(item => {
        invMap[item.stickerId] = item;
      });

      // Deduct giveIds from inventory
      for (const giveId of giveIds) {
        const item = invMap[giveId];
        if (item) {
          await db.inventory.update(giveId, { owned: item.owned - 1 });
        }
      }

      // Add gainIds to inventory
      for (const gainId of gainIds) {
        const item = invMap[gainId] || { owned: 0, pasted: false };
        await db.inventory.update(gainId, { owned: item.owned + 1 });
      }

      confetti({ particleCount: 120, spread: 80 });
      setOnlineState('success');
      setOnlineStatusMsg('¡Intercambio en tiempo real finalizado con éxito!');
      
      if (ws) ws.close();

      loadTradingData();
      refreshProgress();
    } catch (err) {
      alert('Error al aplicar el intercambio: ' + err.message);
    }
  };

  const handleCreateRoomCode = () => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setRoomId(code);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Tab Selectors */}
      <div className="flex mb-8 max-w-md mx-auto" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(12, 14, 24, 0.4)', borderRadius: '12px', padding: '4px' }}>
        <button
          onClick={() => setActiveTab('offline')}
          className={`nav-link-btn flex-grow justify-center ${activeTab === 'offline' ? 'nav-link-btn-active' : ''}`}
          style={{ padding: '10px' }}
        >
          <FileText size={16} /> Offline (Códigos)
        </button>
        <button
          onClick={() => setActiveTab('online')}
          className={`nav-link-btn flex-grow justify-center ${activeTab === 'online' ? 'nav-link-btn-active' : ''}`}
          style={{ padding: '10px' }}
        >
          <Globe size={16} /> Online (Sala)
        </button>
      </div>

      {/* ----- OFFLINE TABS ----- */}
      {activeTab === 'offline' && (
        <div className="trade-split">
          
          {/* Create Code Section */}
          <div className="glass-panel p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-xl font-bold font-display mb-2 text-purple-400 flex items-center gap-2">
                <Send size={18} /> Crear Propuesta
              </h2>
              <p className="text-slate-400 text-xs mb-6">
                Elige cuáles de tus figuritas repetidas quieres regalar y cuáles de las que te faltan te gustaría recibir.
              </p>

              {/* Selector panels */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                
                {/* Repetidas list */}
                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Ofreces</h3>
                  <div className="trade-list-container" style={{ maxHeight: '280px' }}>
                    {duplicates.length === 0 ? (
                      <span className="text-[10px] text-slate-600 block p-2 text-center">No tienes repetidas</span>
                    ) : (
                      <div className="trade-visual-grid">
                        {duplicates.map(card => {
                          const isSelected = selectedOffer.includes(card.id);
                          return (
                            <div 
                              key={card.id} 
                              className={`trade-card-item ${card.isRare ? 'rare-sticker-card' : ''} ${isSelected ? 'trade-card-item-selected' : ''}`}
                              onClick={() => {
                                setSelectedOffer(isSelected 
                                  ? selectedOffer.filter(id => id !== card.id) 
                                  : [...selectedOffer, card.id]
                                );
                              }}
                            >
                              <input 
                                type="checkbox" 
                                checked={isSelected}
                                onChange={() => {}} // handled by click
                                className="trade-card-checkbox"
                              />
                              <div className="trade-card-dupe-badge">
                                <span className="badge-dupe">+{card.owned - 1}</span>
                              </div>
                              <div className="trade-card-img-wrapper">
                                <img src={card.image} alt={card.name} />
                              </div>
                              <div className="trade-card-info">
                                <span className="trade-card-title">{card.name}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Faltantes list */}
                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Pides</h3>
                  <div className="trade-list-container">
                    {missing.length === 0 ? (
                      <span className="text-[10px] text-slate-600 block p-2 text-center">¡Álbum completo!</span>
                    ) : (
                      missing.map(card => (
                        <label key={card.id} className="trade-item-row">
                          <input 
                            type="checkbox" 
                            checked={selectedWant.includes(card.id)}
                            onChange={(e) => {
                              setSelectedWant(e.target.checked 
                                ? [...selectedWant, card.id] 
                                : selectedWant.filter(id => id !== card.id)
                              );
                            }}
                            style={{ accentColor: '#a855f7', cursor: 'pointer' }}
                          />
                          <span className="text-slate-300 font-semibold truncate text-xs" style={{ maxWidth: '100px' }}>{card.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

              </div>

              {/* Action */}
              <button 
                onClick={generateOfflineOffer}
                disabled={selectedOffer.length === 0 || selectedWant.length === 0}
                className="w-full btn-primary"
              >
                Generar Código de Propuesta
              </button>

              {/* Result code box */}
              {generatedCode && (
                <div className="mt-4">
                  <label className="input-label" style={{ marginBottom: '6px', display: 'block' }}>Copia y envía este código:</label>
                  <div className="flex gap-2">
                    <textarea 
                      readOnly 
                      value={generatedCode} 
                      rows={3}
                      className="code-textarea"
                    />
                    <button 
                      onClick={() => handleCopyCode(generatedCode)} 
                      className="btn-secondary"
                      style={{ padding: '10px' }}
                      title="Copiar Código"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Import Code Section */}
          <div className="glass-panel p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-xl font-bold font-display mb-2 text-purple-400 flex items-center gap-2">
                <Download size={18} /> Procesar Código
              </h2>
              <p className="text-slate-400 text-xs mb-6">
                Pega el código que te envió tu amigo (ya sea una propuesta de intercambio o una confirmación).
              </p>

              <textarea 
                value={importCode}
                onChange={e => setImportCode(e.target.value)}
                placeholder="Pega el código Base64 aquí..."
                rows={4}
                className="code-textarea"
                style={{ marginBottom: '1rem', minHeight: '100px' }}
              />

              <button 
                onClick={handleParseImportCode}
                className="w-full btn-secondary py-2.5"
              >
                Decodificar Código
              </button>

              {/* Status Banner */}
              {(offlineStatus.error || offlineStatus.success) && (
                <div className="mt-4 p-3 rounded-lg flex items-start gap-2 text-xs border" style={{
                  backgroundColor: offlineStatus.error ? 'rgba(248,113,113,0.05)' : 'rgba(52,211,153,0.05)',
                  borderColor: offlineStatus.error ? 'rgba(248,113,113,0.2)' : 'rgba(52,211,153,0.2)',
                  color: offlineStatus.error ? '#f87171' : '#34d399'
                }}>
                  <AlertCircle size={14} className="mt-0.5" />
                  <span>{offlineStatus.error || offlineStatus.success}</span>
                </div>
              )}

              {/* 1. Decoded Proposal View */}
              {decodedProposal && (
                <div className="mt-4 glass-panel p-4" style={{ background: 'rgba(5, 6, 11, 0.4)' }}>
                  <h3 className="font-bold text-sm text-slate-200 mb-3 flex items-center gap-1-5">
                    <ArrowLeftRight size={14} /> Propuesta Recibida
                  </h3>
                  <div className="flex flex-col gap-3 mb-4 text-xs">
                    <div>
                      <span className="text-slate-500 font-semibold block mb-1">Tu amigo te da:</span>
                      <div className="flex flex-wrap gap-1-5">
                        {decodedProposal.give.map(id => (
                          <span key={id} className="deal-pocket-badge-peer" style={{ fontSize: '9px', padding: '2px 8px' }}>
                            {stickersMap[id]?.name || `Figu ${id}`}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500 font-semibold block mb-1">A cambio te pide:</span>
                      <div className="flex flex-wrap gap-1-5">
                        {decodedProposal.want.map(id => (
                          <span key={id} className="deal-pocket-badge" style={{ fontSize: '9px', padding: '2px 8px' }}>
                            {stickersMap[id]?.name || `Figu ${id}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={acceptOfflineProposal}
                    className="w-full btn-gold py-2"
                    style={{ fontSize: '12px' }}
                  >
                    Aceptar Intercambio y Generar Confirmación
                  </button>
                </div>
              )}

              {/* 2. Decoded Confirmation View */}
              {decodedConfirmation && (
                <div className="mt-4 glass-panel p-4" style={{ background: 'rgba(5, 6, 11, 0.4)' }}>
                  <h3 className="font-bold text-sm text-emerald-400 mb-3 flex items-center gap-1-5">
                    <Check size={14} /> Confirmación de Intercambio
                  </h3>
                  <p className="text-xs text-slate-400 mb-4">
                    Tu amigo aceptó la propuesta. Al hacer clic abajo, se completará la transacción y se actualizará tu álbum.
                  </p>
                  <button 
                    onClick={completeOfflineTrade}
                    className="w-full btn-primary py-2"
                    style={{ fontSize: '12px' }}
                  >
                    Completar Intercambio
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ----- ONLINE TABS ----- */}
      {activeTab === 'online' && (
        <div className="glass-panel p-6">
          <div className="max-w-3xl mx-auto">
            {onlineState === 'disconnected' && (
              <div className="text-center py-6">
                <h2 className="text-2xl font-bold font-display mb-2 flex items-center justify-center gap-2">
                  <Globe className="text-purple-400" /> Intercambiar en Tiempo Real
                </h2>
                <p className="text-slate-400 text-sm mb-8 max-w-md mx-auto">
                  Únete a una sala con tu amigo para intercambiar figuritas repetidas en vivo usando tu red local.
                </p>

                <div className="glass-panel p-6 max-w-md mx-auto text-left flex flex-col gap-4 mb-6" style={{ background: 'rgba(5, 6, 11, 0.3)' }}>
                  <div className="input-container">
                    <label className="input-label flex items-center gap-1">
                      <User size={12} /> Tu Apodo
                    </label>
                    <input 
                      type="text" 
                      value={nickname}
                      onChange={e => setNickname(e.target.value)}
                      placeholder="Ej. Coleccionista1"
                      className="text-input" 
                    />
                  </div>

                  <div className="input-container">
                    <label className="input-label flex items-center gap-1">
                      <Key size={12} /> Código de Sala (Room ID)
                    </label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={roomId}
                        onChange={e => setRoomId(e.target.value)}
                        placeholder="Ej. 1234"
                        className="text-input" 
                        style={{ flexGrow: 1 }}
                      />
                      <button 
                        onClick={handleCreateRoomCode}
                        className="btn-secondary"
                        style={{ padding: '8px 14px', fontSize: '12px' }}
                      >
                        Generar
                      </button>
                    </div>
                  </div>

                  <button 
                    onClick={connectOnline}
                    className="w-full btn-primary py-3"
                    style={{ marginTop: '1rem' }}
                  >
                    Conectar e Intercambiar
                  </button>
                </div>

                {onlineStatusMsg && (
                  <div className="text-xs text-amber-400 p-3 max-w-md mx-auto glass-panel" style={{ backgroundColor: 'rgba(251,191,36,0.05)', borderColor: 'rgba(251,191,36,0.2)' }}>
                    {onlineStatusMsg}
                  </div>
                )}
              </div>
            )}

            {/* Connecting or Waiting State */}
            {(onlineState === 'connecting' || onlineState === 'waiting') && (
              <div className="text-center py-12" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', itemsCenter: 'center' }}>
                <div style={{ width: '48px', height: '48px', border: '3px solid #8a2be2', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
                <div>
                  <h3 className="font-bold text-lg text-white">Estado de la Sala</h3>
                  <p className="text-sm text-slate-400 mt-2">{onlineStatusMsg}</p>
                </div>
                <button 
                  onClick={disconnectOnline}
                  className="btn-secondary"
                  style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.15)', background: 'rgba(248,113,113,0.02)', padding: '8px 20px', fontSize: '12px', margin: '0 auto' }}
                >
                  Cancelar / Desconectar
                </button>
              </div>
            )}

            {/* Active Trading Screen */}
            {onlineState === 'trading' && (
              <div>
                {/* Room Header Info */}
                <div className="flex justify-between items-center glass-panel p-4 mb-6 text-xs" style={{ background: 'rgba(5, 6, 11, 0.4)' }}>
                  <div>
                    <span className="text-slate-500 font-bold uppercase tracking-wider">Sala:</span>
                    <span className="text-white font-mono font-bold ml-1.5" style={{ fontSize: '13px' }}>{roomId}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-bold uppercase tracking-wider">Conectado con:</span>
                    <span className="text-purple-400 font-bold ml-1.5">{peerName}</span>
                  </div>
                  <button 
                    onClick={disconnectOnline}
                    className="text-red-400 font-bold hover:underline"
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Abandonar Sala
                  </button>
                </div>

                {/* Dashboard grid split */}
                <div className="online-grid">
                  
                  {/* Left Column: My Duplicates Shelf */}
                  <div className="desk-column">
                    <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 text-center" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '8px' }}>
                      Tus Repetidas
                    </h3>
                    <div className="desk-shelf-list" style={{ maxHeight: '340px', overflowY: 'auto' }}>
                      {duplicates.length === 0 ? (
                        <div className="text-[10px] text-slate-600 text-center py-4">No tienes repetidas</div>
                      ) : (
                        <div className="trade-visual-grid">
                          {duplicates.map(card => {
                            const isSelected = myOffers.includes(card.id);
                            return (
                              <div 
                                key={card.id}
                                onClick={() => handleToggleOnlineOffer(card.id)}
                                className={`trade-card-item ${card.isRare ? 'rare-sticker-card' : ''} ${isSelected ? 'trade-card-item-selected' : ''}`}
                              >
                                <div className="trade-card-dupe-badge">
                                  <span className="badge-dupe">+{card.owned - 1}</span>
                                </div>
                                <div className="trade-card-img-wrapper">
                                  <img src={card.image} alt={card.name} />
                                </div>
                                <div className="trade-card-info">
                                  <span className="trade-card-title">{card.name}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Middle Column: The Trading Board */}
                  <div className="trade-desk-center">
                    <div>
                      <h3 className="text-xs text-slate-200 uppercase mb-4 text-center flex items-center justify-center gap-1-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '8px' }}>
                        <ArrowLeftRight size={14} className="text-purple-400" />
                        Mesa de Intercambio
                      </h3>

                      {/* Sync Grid */}
                      <div className="flex flex-col gap-4">
                        {/* What I am giving */}
                        <div>
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex justify-between">
                            <span>Tú Ofreces:</span>
                            {myConfirmed && <span className="text-emerald-400 flex items-center gap-0.5 font-bold"><Check size={10} /> LISTO</span>}
                          </div>
                          <div className="desk-deal-pocket">
                            {myOffers.map(id => (
                              <span key={id} className="deal-pocket-badge">
                                {stickersMap[id]?.name || id}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* What peer is giving */}
                        <div>
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex justify-between">
                            <span>{peerName} Ofrece:</span>
                            {peerConfirmed && <span className="text-emerald-400 flex items-center gap-0.5 font-bold"><Check size={10} /> LISTO</span>}
                          </div>
                          <div className="desk-deal-pocket">
                            {peerOffers.map(id => (
                              <span key={id} className="deal-pocket-badge-peer">
                                {stickersMap[id]?.name || id}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Accept status & action */}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '1rem', marginTop: '1.5rem' }}>
                      <button 
                        onClick={handleConfirmOnlineOffer}
                        disabled={myOffers.length === 0 && peerOffers.length === 0}
                        className={myConfirmed ? 'btn-secondary w-full' : 'btn-gold w-full'}
                        style={myConfirmed ? { color: '#34d399', borderColor: 'rgba(52, 211, 153, 0.3)', background: 'rgba(52, 211, 153, 0.05)' } : {}}
                      >
                        {myConfirmed ? (
                          <>
                            <Check size={14} /> Listo (Haz clic para cambiar)
                          </>
                        ) : (
                          'Confirmar Intercambio'
                        )}
                      </button>
                      
                      <div className="text-[10px] text-center text-slate-500 mt-2 font-medium">
                        {!myConfirmed && !peerConfirmed && "Seleccionen figuritas y confirmen."}
                        {myConfirmed && !peerConfirmed && `Esperando confirmación de ${peerName}...`}
                        {!myConfirmed && peerConfirmed && `${peerName} está listo. ¡Confirma tu parte!`}
                        {myConfirmed && peerConfirmed && "Ambos listos. Procesando..."}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Peer's Duplicates Shelf */}
                  <div className="desk-column">
                    <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 text-center" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '8px' }}>
                      Repetidas de {peerName}
                    </h3>
                    
                    <p style={{ fontSize: '9px', color: '#64748b', textAlign: 'center', marginBottom: '10px' }}>
                      Tu amigo colocará sus figuritas en la mesa.
                    </p>

                    <div className="desk-shelf-list" style={{ maxHeight: '340px', overflowY: 'auto' }}>
                      {peerOffers.length === 0 ? (
                        <div className="text-[10px] text-slate-600 text-center py-4">Mesa vacía</div>
                      ) : (
                        <div className="trade-visual-grid">
                          {peerOffers.map(id => {
                            const card = stickersMap[id];
                            if (!card) return null;
                            return (
                              <div 
                                key={id}
                                className={`trade-card-item ${card.isRare ? 'rare-sticker-card' : ''}`}
                                style={{ cursor: 'default' }}
                              >
                                <div className="trade-card-img-wrapper">
                                  <img src={card.image} alt={card.name} />
                                </div>
                                <div className="trade-card-info">
                                  <span className="trade-card-title">{card.name}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* Success State */}
            {onlineState === 'success' && (
              <div className="text-center py-12" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', itemsCenter: 'center' }}>
                <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: 'rgba(52, 211, 153, 0.05)', border: '1px solid rgba(52, 211, 153, 0.3)', color: '#34d399', display: 'flex', itemsCenter: 'center', justifyContent: 'center', margin: '0 auto' }}>
                  <Check size={28} />
                </div>
                <div>
                  <h3 className="font-bold text-xl text-white">¡Intercambio Completado!</h3>
                  <p className="text-sm text-slate-400 mt-2">{onlineStatusMsg}</p>
                </div>
                <button 
                  onClick={() => { setOnlineState('disconnected'); setOnlineStatusMsg(''); }}
                  className="btn-primary"
                  style={{ padding: '10px 24px', fontSize: '13px', margin: '0 auto' }}
                >
                  Volver a Conectar
                </button>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
