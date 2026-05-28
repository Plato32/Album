import React, { useState, useEffect, useRef } from 'react';
import { db, clearActiveAlbum, layoutStickers, getActiveAlbumId } from '../utils/db';
import { ChevronLeft, ChevronRight, Sparkles, Plus, Check, Search, Palette, Puzzle, Move, Compass, Printer, StickyNote, Trash2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import PremiumCard from './PremiumCard';
import { playPasteSound } from '../utils/sounds';

export default function AlbumGrid({ progress, refreshProgress }) {
  const [stickers, setStickers] = useState([]);
  const [inventory, setInventory] = useState({});
  const [currentPage, setCurrentPage] = useState(0); // 0-based index of double-pages (each double-page has 2 pages = 12 stickers)
  const [filter, setFilter] = useState('all'); // 'all', 'missing', 'duplicates'
  const [searchQuery, setSearchQuery] = useState(''); // Text search query
  const [highlightedStickerId, setHighlightedStickerId] = useState(null);
  const [albumBg, setAlbumBg] = useState('scrapbook');
  const [albumColor, setAlbumColor] = useState('gold');
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [recentlyPastedId, setRecentlyPastedId] = useState(null);
  const [zoomedSticker, setZoomedSticker] = useState(null);
  const [zoomScale, setZoomScale] = useState(1.0);
  const [customBgImage, setCustomBgImage] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [layoutStyle, setLayoutStyle] = useState('scrapbook'); // 'scrapbook' or 'grid'
  const [draggedOverPage, setDraggedOverPage] = useState(null);
  
  // Scopes and premium custom features states
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    document.body.className = `theme-color-${albumColor}`;
    return () => {
      document.body.className = '';
    };
  }, [albumColor]);

  useEffect(() => {
    loadAlbumData();
  }, [filter, searchQuery]);

  const loadAlbumData = async () => {
    const activeId = getActiveAlbumId() || 'album-legacy';
    const allStickers = await db.stickers.where('albumId').equals(activeId).toArray();
    const allInventory = await db.inventory.where('albumId').equals(activeId).toArray();
    const allNotes = await db.notes.where('albumId').equals(activeId).toArray();
    
    setNotes(allNotes);
    
    // Load metadata settings first to check layoutStyle
    const metadata = await db.albumMetadata.get(activeId);
    const currentLayoutStyle = metadata ? (metadata.layoutStyle || 'scrapbook') : 'scrapbook';
    
    console.log("CARGANDO ALBUM:", {
      layoutStyle: currentLayoutStyle,
      stickersCount: allStickers.length,
      stickers: allStickers.map(s => ({ id: s.id, name: s.name, page: s.page, x: s.x, y: s.y }))
    });
    
    // Ensure all stickers have page, x, y, width, rotation
    let needsUpdate = allStickers.some(s => 
      s.x === undefined || s.y === undefined || s.page === undefined ||
      s.x === null || s.y === null || s.page === null
    );
    
    let verifiedStickers = allStickers;
    if (needsUpdate || currentLayoutStyle === 'grid') {
      const computed = layoutStickers(allStickers, stickersPerPage, currentLayoutStyle === 'grid');
      // Only write if there is a difference to avoid redundant DB writes
      const hasDiff = allStickers.some((s, idx) => {
        const c = computed[idx];
        return !c || s.page !== c.page || s.x !== c.x || s.y !== c.y || s.width !== c.width || s.rotation !== c.rotation;
      });
      
      if (hasDiff) {
        verifiedStickers = computed;
        // Delete only the active album stickers and insert computed ones
        const stickersToDelete = await db.stickers.where('albumId').equals(activeId).toArray();
        for (const s of stickersToDelete) {
          await db.stickers.delete(s.id);
        }
        await db.stickers.bulkAdd(verifiedStickers);
      }
    }

    // Ensure all stickers have aspectRatio property
    const missingAspect = verifiedStickers.filter(s => s.aspectRatio === undefined);
    if (missingAspect.length > 0) {
      for (const s of missingAspect) {
        if (s.image) {
          const aspect = await new Promise((resolve) => {
            const img = new Image();
            img.src = s.image;
            img.onload = () => resolve(img.width / img.height);
            img.onerror = () => resolve(0.75);
          });
          s.aspectRatio = aspect;
          await db.stickers.update(s.id, { aspectRatio: aspect });
        }
      }
    }

    // Convert inventory array to map for O(1) lookup
    const invMap = {};
    allInventory.forEach(item => {
      invMap[item.stickerId] = item;
    });

    setInventory(invMap);

    // Filter stickers based on status if needed
    let filteredStickers = verifiedStickers;
    if (filter === 'duplicates') {
      filteredStickers = filteredStickers.filter(s => (invMap[s.id]?.owned || 0) > 1);
    }

    // Apply text search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filteredStickers = filteredStickers.filter(s => 
        String(s.name || '').toLowerCase().includes(q) || 
        String(s.id).includes(q)
      );
    }

    setStickers(filteredStickers);

    // Load customization settings
    if (metadata) {
      if (metadata.albumBg) setAlbumBg(metadata.albumBg);
      if (metadata.albumColor) setAlbumColor(metadata.albumColor);
      if (metadata.customBgImage) setCustomBgImage(metadata.customBgImage);
      if (metadata.layoutStyle) setLayoutStyle(metadata.layoutStyle);
    }
  };



  // --- STICKY NOTES INTERACTION HANDLERS ---
  const handleAddNote = async (pageIdx) => {
    const activeId = getActiveAlbumId() || 'album-legacy';
    const newNote = {
      id: `note-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      albumId: activeId,
      page: pageIdx,
      text: '¡Escribe aquí!',
      x: 35,
      y: 35,
      color: 'yellow',
      rotation: Math.floor(Math.random() * 10) - 5
    };
    await db.notes.add(newNote);
    setNotes(prev => [...prev, newNote]);
  };

  const handleDeleteNote = async (noteId) => {
    await db.notes.delete(noteId);
    setNotes(prev => prev.filter(n => n.id !== noteId));
  };

  const handleUpdateNote = async (noteId, updates) => {
    await db.notes.update(noteId, updates);
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, ...updates } : n));
  };

  const handleNoteMouseDown = (e, note) => {
    if (!isEditMode) return;
    const tagName = e.target.tagName.toLowerCase();
    if (tagName === 'textarea' || tagName === 'select' || tagName === 'option' || tagName === 'button') {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    const pageElement = e.currentTarget.offsetParent;
    if (!pageElement) return;
    const rect = pageElement.getBoundingClientRect();

    const startX = e.clientX;
    const startY = e.clientY;

    const startPos = {
      x: note.x || 0,
      y: note.y || 0
    };

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const pctDeltaX = (deltaX / rect.width) * 100;
      const pctDeltaY = (deltaY / rect.height) * 100;

      let newX = Number((startPos.x + pctDeltaX).toFixed(2));
      let newY = Number((startPos.y + pctDeltaY).toFixed(2));

      newX = Math.max(0, Math.min(85, newX));
      newY = Math.max(0, Math.min(85, newY));

      handleUpdateNote(note.id, { x: newX, y: newY });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleNoteTouchStart = (e, note) => {
    if (!isEditMode) return;
    const tagName = e.target.tagName.toLowerCase();
    if (tagName === 'textarea' || tagName === 'select' || tagName === 'option' || tagName === 'button') {
      return;
    }
    e.stopPropagation();

    const touch = e.touches[0];
    const pageElement = e.currentTarget.offsetParent;
    if (!pageElement) return;
    const rect = pageElement.getBoundingClientRect();

    const startX = touch.clientX;
    const startY = touch.clientY;

    const startPos = {
      x: note.x || 0,
      y: note.y || 0
    };

    const handleTouchMove = (moveEvent) => {
      const currentTouch = moveEvent.touches[0];
      const deltaX = currentTouch.clientX - startX;
      const deltaY = currentTouch.clientY - startY;

      const pctDeltaX = (deltaX / rect.width) * 100;
      const pctDeltaY = (deltaY / rect.height) * 100;

      let newX = Number((startPos.x + pctDeltaX).toFixed(2));
      let newY = Number((startPos.y + pctDeltaY).toFixed(2));

      newX = Math.max(0, Math.min(85, newX));
      newY = Math.max(0, Math.min(85, newY));

      handleUpdateNote(note.id, { x: newX, y: newY });
    };

    const handleTouchEnd = () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
  };

  // --- PASTING HANDLER ---
  const handlePasteSticker = async (stickerId) => {
    const invItem = inventory[stickerId];
    if (!invItem || invItem.owned <= 0 || invItem.pasted) return;

    // Paste the sticker (pasted = true) using put for maximum IndexedDB type safety
    await db.inventory.put({
      ...invItem,
      pasted: true
    });
    
    // Play tactile paste synthesizer sound!
    playPasteSound();
    
    // Play confetti explosion!
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#ffe066', '#f5b041', '#8a2be2', '#00f2fe']
    });

    // Update UI state
    setInventory(prev => ({
      ...prev,
      [stickerId]: { ...prev[stickerId], pasted: true }
    }));

    setRecentlyPastedId(stickerId);
    setTimeout(() => {
      setRecentlyPastedId(null);
    }, 1000);

    setHighlightedStickerId(null);

    refreshProgress();
  };

  const handleZoomSticker = (sticker) => {
    setZoomedSticker({
      name: sticker.name,
      image: sticker.image,
      isRare: !!sticker.isRare,
      isPanorama: false,
      numbers: [sticker.id]
    });
  };

  const closeZoom = () => {
    setZoomedSticker(null);
    setZoomScale(1.0);
  };

  const handleZoomSet = (stickersList, splitType) => {
    const numbers = stickersList.map(s => s.id);
    const isRare = stickersList.some(s => s.isRare);
    const sortedParts = [...stickersList].sort((a, b) => (a.splitPart || '').localeCompare(b.splitPart || ''));

    setZoomedSticker({
      name: getUnifiedName(stickersList[0].name),
      isRare,
      isPanorama: true,
      splitType,
      numbers,
      parts: sortedParts
    });
  };

  const stickersPerPage = progress.stickersPerPage || 6;

  const isHorizontalPair = (a, b) => {
    if (!a || !b) return false;
    if (a.parentId && a.parentId === b.parentId) {
      return a.splitType === 'horizontal' && a.splitPart === 'A' && b.splitPart === 'B';
    }
    // Fallback for names
    if (!a.name || !b.name) return false;
    const cleanNameA = String(a.name).replace(/\s+/g, '').toLowerCase();
    const cleanNameB = String(b.name).replace(/\s+/g, '').toLowerCase();
    if (cleanNameA.endsWith('(partea)') && cleanNameB.endsWith('(parteb)')) {
      return cleanNameA.slice(0, -8) === cleanNameB.slice(0, -8);
    }
    return false;
  };

  const isVerticalPair = (a, b) => {
    if (!a || !b) return false;
    if (a.parentId && a.parentId === b.parentId) {
      return a.splitType === 'vertical' && a.splitPart === 'A' && b.splitPart === 'B';
    }
    // Fallback for names
    if (!a.name || !b.name) return false;
    const cleanNameA = String(a.name).replace(/\s+/g, '').toLowerCase();
    const cleanNameB = String(b.name).replace(/\s+/g, '').toLowerCase();
    if (cleanNameA.endsWith('(partesuperior)') && cleanNameB.endsWith('(parteinferior)')) {
      return cleanNameA.slice(0, -15) === cleanNameB.slice(0, -14);
    }
    return false;
  };

  const isQuadGroup = (s1, s2, s3, s4) => {
    if (!s1 || !s2 || !s3 || !s4) return false;
    return (
      s1.parentId &&
      s1.parentId === s2.parentId &&
      s1.parentId === s3.parentId &&
      s1.parentId === s4.parentId &&
      s1.splitType === 'quad' &&
      s2.splitType === 'quad' &&
      s3.splitType === 'quad' &&
      s4.splitType === 'quad' &&
      s1.splitPart === 'A' &&
      s2.splitPart === 'B' &&
      s3.splitPart === 'C' &&
      s4.splitPart === 'D'
    );
  };

  const paginateStickers = (allStickers, limit) => {
    const pages = [];
    let currentPageList = [];
    let currentCount = 0;
    
    let i = 0;
    while (i < allStickers.length) {
      const current = allStickers[i];
      const next1 = allStickers[i + 1];
      const next2 = allStickers[i + 2];
      const next3 = allStickers[i + 3];
      
      const isQuad = isQuadGroup(current, next1, next2, next3);
      const isPair = !isQuad && next1 && (isHorizontalPair(current, next1) || isVerticalPair(current, next1));
      
      if (isQuad) {
        if (currentCount + 4 <= limit) {
          currentPageList.push(current, next1, next2, next3);
          currentCount += 4;
          i += 4;
        } else {
          if (currentPageList.length > 0) {
            pages.push(currentPageList);
          }
          currentPageList = [current, next1, next2, next3];
          currentCount = 4;
          i += 4;
        }
      } else if (isPair) {
        if (currentCount + 2 <= limit) {
          currentPageList.push(current, next1);
          currentCount += 2;
          i += 2;
        } else {
          if (currentPageList.length > 0) {
            pages.push(currentPageList);
          }
          currentPageList = [current, next1];
          currentCount = 2;
          i += 2;
        }
      } else {
        if (currentCount + 1 <= limit) {
          currentPageList.push(current);
          currentCount += 1;
          i++;
        } else {
          if (currentPageList.length > 0) {
            pages.push(currentPageList);
          }
          currentPageList = [current];
          currentCount = 1;
          i++;
        }
      }
    }
    
    if (currentPageList.length > 0) {
      pages.push(currentPageList);
    }
    
    return pages;
  };

  const totalPages = Math.max(1, Math.ceil((stickers.reduce((max, s) => s.page > max ? s.page : max, 0) + 1) / 2));

  useEffect(() => {
    if (currentPage >= totalPages && totalPages > 0) {
      setCurrentPage(totalPages - 1);
    }
  }, [totalPages, currentPage]);

  // Clamp current page to totalPages limit
  const activePage = Math.min(currentPage, totalPages - 1);

  // Filter out stickers owned but not pasted yet
  const unpastedStickers = stickers.filter(s => {
    const inv = inventory[s.id];
    return inv && inv.owned > 0 && !inv.pasted;
  });

  // Jump to the double page index containing the selected sticker ID and highlight it
  const jumpToStickerPage = (stickerId) => {
    const targetSticker = stickers.find(s => s.id === stickerId);
    if (targetSticker && targetSticker.page !== undefined) {
      const doublePageIdx = Math.floor(targetSticker.page / 2);
      setCurrentPage(doublePageIdx);
    }
    setHighlightedStickerId(stickerId);
    setTimeout(() => {
      setHighlightedStickerId(prev => prev === stickerId ? null : prev);
    }, 2500);
  };

  const handleTestGetPack = async () => {
    const activeId = getActiveAlbumId() || 'album-legacy';
    const packsId = `status-${activeId}`;
    const status = await db.packsInfo.get(packsId);
    const currentPacks = status ? status.packsAvailable : 0;
    await db.packsInfo.put({
      id: packsId,
      lastClaimed: status ? status.lastClaimed : 0,
      packsAvailable: currentPacks + 1
    });
    refreshProgress();
  };

  const handleTestCompleteAlbum = async () => {
    if (window.confirm('¿Seguro que quieres completar todo el álbum automáticamente para pruebas?')) {
      const activeId = getActiveAlbumId() || 'album-legacy';
      const allStickers = await db.stickers.where('albumId').equals(activeId).toArray();
      
      const completedInventory = allStickers.map(s => ({
        stickerId: s.id,
        owned: 1,
        pasted: true,
        albumId: activeId
      }));
      await db.inventory.bulkPut(completedInventory);
      await loadAlbumData();
      refreshProgress();
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.5 }
      });
    }
  };

  const handleTestRestart = async () => {
    if (window.confirm('¿Seguro que quieres despegar todas las figuritas para volver a pegarlas?')) {
      const activeId = getActiveAlbumId() || 'album-legacy';
      const allInventory = await db.inventory.where('albumId').equals(activeId).toArray();
      
      const resetInventory = allInventory.map(item => ({
        ...item,
        pasted: false
      }));
      await db.inventory.bulkPut(resetInventory);
      await loadAlbumData();
      refreshProgress();
    }
  };

  let cols = 3;
  if (stickersPerPage === 4) cols = 2;
  else if (stickersPerPage === 8 || stickersPerPage === 12) cols = 4;

  const nextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(prev => prev - 1);
    }
  };

  const getUnifiedName = (name) => {
    if (!name) return '';
    return name
      .replace(/\s*\(Parte\s+A\)/i, '')
      .replace(/\s*\(Parte\s+B\)/i, '')
      .replace(/\s*\(Parte\s+Superior\)/i, '')
      .replace(/\s*\(Parte\s+Inferior\)/i, '')
      .replace(/\s*\(A\)/i, '')
      .replace(/\s*\(B\)/i, '')
      .replace(/\s*\(partea\)/i, '')
      .replace(/\s*\(parteb\)/i, '')
      .replace(/\s*\(partesuperior\)/i, '')
      .replace(/\s*\(parteinferior\)/i, '')
      .trim();
  };

  const handleSelectBg = async (bgName) => {
    setAlbumBg(bgName);
    const metadata = await db.albumMetadata.get('active');
    if (metadata) {
      await db.albumMetadata.put({
        ...metadata,
        albumBg: bgName
      });
    }
  };

  const handleSelectColor = async (colorName) => {
    setAlbumColor(colorName);
    const metadata = await db.albumMetadata.get('active');
    if (metadata) {
      await db.albumMetadata.put({
        ...metadata,
        albumColor: colorName
      });
    }
  };

  const handleCustomBgUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Data = event.target.result;
      setCustomBgImage(base64Data);
      setAlbumBg('custom');
      
      const metadata = await db.albumMetadata.get('active');
      if (metadata) {
        await db.albumMetadata.put({
          ...metadata,
          albumBg: 'custom',
          customBgImage: base64Data
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteCustomBg = async () => {
    setCustomBgImage(null);
    if (albumBg === 'custom') {
      handleSelectBg('scrapbook');
    }
    const metadata = await db.albumMetadata.get('active');
    if (metadata) {
      const { customBgImage, ...rest } = metadata;
      await db.albumMetadata.put(rest);
    }
  };

  const handleSelectLayoutStyle = async (style) => {
    setLayoutStyle(style);
    const metadata = await db.albumMetadata.get('active');
    if (metadata) {
      await db.albumMetadata.put({
        ...metadata,
        layoutStyle: style
      });
    }
  };

  const handleDragStartFromDrawer = (e, stickerId) => {
    e.dataTransfer.setData('text/plain', stickerId.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDropOnPage = async (e, pageIndex) => {
    e.preventDefault();
    setDraggedOverPage(null);
    
    const stickerIdStr = e.dataTransfer.getData('text/plain');
    if (!stickerIdStr) return;
    
    const targetSticker = stickers.find(s => String(s.id) === stickerIdStr);
    if (!targetSticker) return;

    const inv = inventory[targetSticker.id];
    if (!inv || inv.owned <= 0 || inv.pasted) return;

    // Paste the sticker
    await handlePasteSticker(targetSticker.id);

    // Calculate positions if in scrapbook mode
    if (layoutStyle === 'scrapbook') {
      const rect = e.currentTarget.getBoundingClientRect();
      const dropX = e.clientX - rect.left;
      const dropY = e.clientY - rect.top;

      let xPct = (dropX / rect.width) * 100;
      let yPct = (dropY / rect.height) * 100;

      const widthPct = targetSticker.width || 24;
      const heightPct = widthPct * 1.33; // Assume standard aspect ratio
      
      xPct = Number((xPct - widthPct / 2).toFixed(2));
      yPct = Number((yPct - heightPct / 2).toFixed(2));

      xPct = Math.max(0, Math.min(100 - widthPct, xPct));
      yPct = Math.max(0, Math.min(95, yPct));

      const allGroups = getGroupedStickers(stickers);
      const group = allGroups.find(g => 
        g.type === 'single' ? g.sticker.id === stickerId : g.stickers.some(s => s.id === stickerId)
      );
      if (group) {
        await updateGroupCoordinates(group, { page: pageIndex, x: xPct, y: yPct });
      }
    } else {
      // In grid layout, moving page is still supported
      const allGroups = getGroupedStickers(stickers);
      const group = allGroups.find(g => 
        g.type === 'single' ? g.sticker.id === stickerId : g.stickers.some(s => s.id === stickerId)
      );
      if (group) {
        await updateGroupCoordinates(group, { page: pageIndex });
      }
    }
  };

  const renderSingleSlot = (sticker) => {
    const inv = inventory[sticker.id] || { owned: 0, pasted: false };
    const hasUnpasted = inv.owned > 0 && !inv.pasted;
    const isPasted = inv.pasted;
    const duplicateCount = Math.max(0, inv.owned - 1);
    const isHighlighted = highlightedStickerId === sticker.id;

    return (
      <div
        key={sticker.id}
        className={`sticker-slot ${isPasted ? 'is-pasted' : ''} ${isHighlighted ? 'highlight-pulse' : ''} ${sticker.isRare ? 'rare-sticker-slot' : ''}`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between', gap: '4px' }}>
          {/* Card or Silhouette container - Flex grows to fill space */}
          <div style={{ flexGrow: 1, minHeight: 0, position: 'relative', width: '100%' }}>
            {isPasted ? (
              <div 
                onClick={() => { if (!isEditMode) handleZoomSticker(sticker); }}
                className={`w-full h-full sticker-pasted ${!isEditMode ? 'cursor-zoom-in' : ''} ${recentlyPastedId === sticker.id ? 'animate-paste-slam' : ''}`}
                style={{ position: 'relative', width: '100%', height: '100%' }}
              >
                <PremiumCard 
                  image={sticker.image} 
                  name={sticker.name} 
                  isRare={sticker.isRare} 
                />
              </div>
            ) : (
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                <div 
                  onClick={() => {
                    if (hasUnpasted && !isEditMode) {
                      setHighlightedStickerId(prev => prev === sticker.id ? null : sticker.id);
                    }
                  }}
                  className={`slot-silhouette w-full h-full ${hasUnpasted ? 'cursor-pointer' : ''}`}
                  style={{ borderRadius: '8px' }}
                >
                  <span className="font-display font-extrabold text-sm text-slate-500">?</span>
                </div>

                {hasUnpasted && !isEditMode && (
                  <div className="slot-paste-overlay" style={{ opacity: isHighlighted ? 1 : undefined, pointerEvents: isHighlighted ? 'auto' : undefined }}>
                    <span className="text-[10px] text-slate-500 font-semibold mb-1">¡La tienes!</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handlePasteSticker(sticker.id); }}
                      className="btn-gold"
                      style={{ padding: '4px 8px', fontSize: '10px', borderRadius: '6px' }}
                    >
                      Pegar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Caption Container - ALWAYS visible at the bottom, outside the image */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', gap: '1px' }}>
            <span style={{ fontSize: '9px', fontWeight: 'bold', color: 'var(--theme-accent)', paddingLeft: '2px' }}>
              N° {String(sticker.id).padStart(3, '0')}
            </span>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <span className="slot-sticker-title" style={{ margin: 0, padding: '0 2px', textAlign: 'left', fontSize: '10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                {sticker.name}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPairSlot = (pair, type) => {
    const [s1, s2] = pair.stickers;
    const inv1 = inventory[s1.id] || { owned: 0, pasted: false };
    const inv2 = inventory[s2.id] || { owned: 0, pasted: false };
    
    const isPasted1 = inv1.pasted;
    const isPasted2 = inv2.pasted;
    
    const hasUnpasted1 = inv1.owned > 0 && !inv1.pasted;
    const hasUnpasted2 = inv2.owned > 0 && !inv2.pasted;
    
    const dup1 = Math.max(0, inv1.owned - 1);
    const dup2 = Math.max(0, inv2.owned - 1);

    const isHorizontal = type === 'horizontal-pair';
    const isHighlighted1 = highlightedStickerId === s1.id;
    const isHighlighted2 = highlightedStickerId === s2.id;
    
    const isPastedAll = isPasted1 && isPasted2;

    // Use dynamic aspectRatio from database
    const a1 = s1.aspectRatio || 0.75;
    const a2 = s2.aspectRatio || 0.75;
    const combinedAspect = isHorizontal ? (a1 + a2) : (1 / (1/a1 + 1/a2));

    let gridColumnSpan = 'span 1';
    let gridRowSpan = 'span 1';

    if (isHorizontal) {
      if (combinedAspect > 1.2) {
        gridColumnSpan = 'span 2';
      } else {
        gridColumnSpan = 'span 1';
      }
    } else {
      if (combinedAspect < 0.5) {
        gridRowSpan = 'span 2';
      } else {
        gridRowSpan = 'span 1';
      }
    }

    const styleOverride1 = isHorizontal
      ? {
          borderRight: 'none',
          borderTopRightRadius: '0px',
          borderBottomRightRadius: '0px',
          borderTopLeftRadius: '8px',
          borderBottomLeftRadius: '8px',
          boxShadow: 'none',
        }
      : {
          borderBottom: 'none',
          borderBottomLeftRadius: '0px',
          borderBottomRightRadius: '0px',
          borderTopLeftRadius: '8px',
          borderTopRightRadius: '8px',
          boxShadow: 'none',
        };

    const styleOverride2 = isHorizontal
      ? {
          borderLeft: 'none',
          borderTopLeftRadius: '0px',
          borderBottomLeftRadius: '0px',
          borderTopRightRadius: '8px',
          borderBottomRightRadius: '8px',
          boxShadow: 'none',
        }
      : {
          borderTop: 'none',
          borderTopLeftRadius: '0px',
          borderTopRightRadius: '0px',
          borderBottomLeftRadius: '8px',
          borderBottomRightRadius: '8px',
          boxShadow: 'none',
        };
    return (
      <div 
        key={`${s1.id}-${s2.id}`} 
        className={`sticker-slot-pair ${isHorizontal ? 'slot-pair-horizontal' : 'slot-pair-vertical'} ${isPastedAll ? 'is-pasted-all' : ''} group ${isHighlighted1 || isHighlighted2 ? 'highlight-pulse' : ''}`}
        style={{ 
          gridColumn: gridColumnSpan,
          gridRow: gridRowSpan,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between', gap: '4px' }}>
          <div style={{ flexGrow: 1, minHeight: 0, position: 'relative', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div 
              className="pair-slots-container" 
              style={{ 
                display: 'flex', 
                flexDirection: isHorizontal ? 'row' : 'column', 
                width: isHorizontal ? 'calc(100% - 1.25rem)' : '100%', 
                height: isHorizontal ? '100%' : 'calc(100% - 1.25rem)', 
                gap: '0px', 
                overflow: 'hidden' 
              }}
            >
              <div className="sub-slot" style={{ flex: 1, position: 'relative', height: '100%', width: '100%' }}>
                {isPasted1 ? (
                  <div 
                    onClick={() => {
                      if (isPasted1 && isPasted2) handleZoomSet(pair.stickers, type);
                      else handleZoomSticker(s1);
                    }}
                    className={`w-full h-full sticker-pasted ${recentlyPastedId === s1.id ? 'animate-paste-slam' : ''}`}
                  >
                    <PremiumCard image={s1.image} name={s1.name} isRare={s1.isRare} style={styleOverride1} imgStyle={{ objectFit: 'fill' }} />
                  </div>
                ) : (
                  <div 
                    onClick={() => {
                      if (hasUnpasted1 && !isEditMode) {
                        setHighlightedStickerId(prev => prev === s1.id ? null : s1.id);
                      }
                    }}
                    className={`slot-silhouette ${hasUnpasted1 ? 'cursor-pointer' : ''}`}
                    style={{ borderRadius: isHorizontal ? '8px 0 0 8px' : '8px 8px 0 0', width: '100%', height: '100%' }}
                  >
                    <span className="font-display font-extrabold text-sm text-slate-500">?</span>
                  </div>
                )}

                {hasUnpasted1 && (
                  <div className="slot-paste-overlay" style={{ opacity: isHighlighted1 ? 1 : undefined, pointerEvents: isHighlighted1 ? 'auto' : undefined }}>
                    <span className="text-[10px] text-slate-500 font-semibold mb-1">¡La tienes!</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handlePasteSticker(s1.id); }}
                      className="btn-gold"
                      style={{ padding: '4px 8px', fontSize: '10px', borderRadius: '6px' }}
                    >
                      Pegar
                    </button>
                  </div>
                )}
              </div>

              {!isPastedAll && (
                <div className={`pair-divider-line ${isHorizontal ? 'line-vertical' : 'line-horizontal'}`} />
              )}

              <div className="sub-slot" style={{ flex: 1, position: 'relative', height: '100%', width: '100%' }}>
                {isPasted2 ? (
                  <div 
                    onClick={() => {
                      if (isPasted1 && isPasted2) handleZoomSet(pair.stickers, type);
                      else handleZoomSticker(s2);
                    }}
                    className={`w-full h-full sticker-pasted ${recentlyPastedId === s2.id ? 'animate-paste-slam' : ''}`}
                  >
                    <PremiumCard image={s2.image} name={s2.name} isRare={s2.isRare} style={styleOverride2} imgStyle={{ objectFit: 'fill' }} />
                  </div>
                ) : (
                  <div 
                    onClick={() => {
                      if (hasUnpasted2 && !isEditMode) {
                        setHighlightedStickerId(prev => prev === s2.id ? null : s2.id);
                      }
                    }}
                    className={`slot-silhouette ${hasUnpasted2 ? 'cursor-pointer' : ''}`}
                    style={{ borderRadius: isHorizontal ? '0 8px 8px 0' : '0 0 8px 8px', width: '100%', height: '100%' }}
                  >
                    <span className="font-display font-extrabold text-sm text-slate-500">?</span>
                  </div>
                )}

                {hasUnpasted2 && (
                  <div className="slot-paste-overlay" style={{ opacity: isHighlighted2 ? 1 : undefined, pointerEvents: isHighlighted2 ? 'auto' : undefined }}>
                    <span className="text-[10px] text-slate-500 font-semibold mb-1">¡La tienes!</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handlePasteSticker(s2.id); }}
                      className="btn-gold"
                      style={{ padding: '4px 8px', fontSize: '10px', borderRadius: '6px' }}
                    >
                      Pegar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', gap: '1px', padding: '0 2px' }}>
            <span style={{ fontSize: '8px', fontWeight: 'bold', color: 'var(--theme-accent)', paddingLeft: '2px' }}>
              N° {String(s1.id).padStart(3, '0')} y N° {String(s2.id).padStart(3, '0')}
            </span>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <span className="slot-sticker-title" style={{ margin: 0, padding: '0 2px', textAlign: 'left', fontSize: '10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                {getUnifiedName(s1.name)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderQuadSlot = (quad) => {
    const [s1, s2, s3, s4] = quad.stickers;
    
    const inv1 = inventory[s1.id] || { owned: 0, pasted: false };
    const inv2 = inventory[s2.id] || { owned: 0, pasted: false };
    const inv3 = inventory[s3.id] || { owned: 0, pasted: false };
    const inv4 = inventory[s4.id] || { owned: 0, pasted: false };

    const isPasted1 = inv1.pasted;
    const isPasted2 = inv2.pasted;
    const isPasted3 = inv3.pasted;
    const isPasted4 = inv4.pasted;

    const hasUnpasted1 = inv1.owned > 0 && !inv1.pasted;
    const hasUnpasted2 = inv2.owned > 0 && !inv2.pasted;
    const hasUnpasted3 = inv3.owned > 0 && !inv3.pasted;
    const hasUnpasted4 = inv4.owned > 0 && !inv4.pasted;

    const isHighlighted1 = highlightedStickerId === s1.id;
    const isHighlighted2 = highlightedStickerId === s2.id;
    const isHighlighted3 = highlightedStickerId === s3.id;
    const isHighlighted4 = highlightedStickerId === s4.id;

    const pastedCount = (isPasted1 ? 1 : 0) + (isPasted2 ? 1 : 0) + (isPasted3 ? 1 : 0) + (isPasted4 ? 1 : 0);
    const isCompleted = pastedCount === 4;

    const dup1 = Math.max(0, inv1.owned - 1);
    const dup2 = Math.max(0, inv2.owned - 1);
    const dup3 = Math.max(0, inv3.owned - 1);
    const dup4 = Math.max(0, inv4.owned - 1);

    const styleOverride1 = {
      borderTopLeftRadius: '12px',
      borderTopRightRadius: '0px',
      borderBottomLeftRadius: '0px',
      borderBottomRightRadius: '0px',
      borderRight: isPasted1 && isPasted2 ? 'none' : undefined,
      borderBottom: isPasted1 && isPasted3 ? 'none' : undefined,
      boxShadow: 'none',
    };
    const styleOverride2 = {
      borderTopRightRadius: '12px',
      borderTopLeftRadius: '0px',
      borderBottomLeftRadius: '0px',
      borderBottomRightRadius: '0px',
      borderLeft: isPasted2 && isPasted1 ? 'none' : undefined,
      borderBottom: isPasted2 && isPasted4 ? 'none' : undefined,
      boxShadow: 'none',
    };
    const styleOverride3 = {
      borderBottomLeftRadius: '12px',
      borderTopLeftRadius: '0px',
      borderTopRightRadius: '0px',
      borderBottomRightRadius: '0px',
      borderRight: isPasted3 && isPasted4 ? 'none' : undefined,
      borderTop: isPasted1 && isPasted3 ? 'none' : undefined,
      boxShadow: 'none',
    };
    const styleOverride4 = {
      borderBottomRightRadius: '12px',
      borderTopLeftRadius: '0px',
      borderTopRightRadius: '0px',
      borderBottomLeftRadius: '0px',
      borderLeft: isPasted4 && isPasted3 ? 'none' : undefined,
      borderTop: isPasted4 && isPasted2 ? 'none' : undefined,
      boxShadow: 'none',
    };

    return (
      <div 
        key={`${s1.id}-${s2.id}-${s3.id}-${s4.id}`}
        className={`sticker-slot-quad ${isCompleted ? 'is-pasted-all' : ''} ${isHighlighted1 || isHighlighted2 || isHighlighted3 || isHighlighted4 ? 'highlight-pulse' : ''}`}
        style={{ 
          gridColumn: 'span 2',
          gridRow: 'span 2',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between', gap: '4px' }}>
          <div style={{ flexGrow: 1, minHeight: 0, position: 'relative', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', width: 'calc(100% - 1.25rem)', height: 'calc(100% - 1.25rem)', gap: '0px', overflow: 'hidden' }}>
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                {isPasted1 ? (
                  <div 
                    onClick={() => {
                      if (isCompleted) handleZoomSet(quad.stickers, 'quad');
                      else handleZoomSticker(s1);
                    }}
                    className={`w-full h-full sticker-pasted ${recentlyPastedId === s1.id ? 'animate-paste-slam' : ''}`}
                  >
                    <PremiumCard image={s1.image} name={s1.name} isRare={s1.isRare} style={styleOverride1} imgStyle={{ objectFit: 'fill' }} />
                  </div>
                ) : (
                  <div 
                    onClick={() => {
                      if (hasUnpasted1 && !isEditMode) {
                        setHighlightedStickerId(prev => prev === s1.id ? null : s1.id);
                      }
                    }}
                    className={`slot-silhouette ${hasUnpasted1 ? 'cursor-pointer' : ''}`}
                    style={{ borderRadius: '12px 0 0 0', width: '100%', height: '100%' }}
                  >
                    <span className="font-display font-extrabold text-sm text-slate-500">?</span>
                  </div>
                )}

                {hasUnpasted1 && (
                  <div className="slot-paste-overlay" style={{ opacity: isHighlighted1 ? 1 : undefined, pointerEvents: isHighlighted1 ? 'auto' : undefined }}>
                    <span className="text-[10px] text-slate-500 font-semibold mb-1">¡La tienes!</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handlePasteSticker(s1.id); }}
                      className="btn-gold"
                      style={{ padding: '4px 8px', fontSize: '10px', borderRadius: '6px' }}
                    >
                      Pegar
                    </button>
                  </div>
                )}
              </div>

              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                {isPasted2 ? (
                  <div 
                    onClick={() => {
                      if (isCompleted) handleZoomSet(quad.stickers, 'quad');
                      else handleZoomSticker(s2);
                    }}
                    className={`w-full h-full sticker-pasted ${recentlyPastedId === s2.id ? 'animate-paste-slam' : ''}`}
                  >
                    <PremiumCard image={s2.image} name={s2.name} isRare={s2.isRare} style={styleOverride2} imgStyle={{ objectFit: 'fill' }} />
                  </div>
                ) : (
                  <div 
                    onClick={() => {
                      if (hasUnpasted2 && !isEditMode) {
                        setHighlightedStickerId(prev => prev === s2.id ? null : s2.id);
                      }
                    }}
                    className={`slot-silhouette ${hasUnpasted2 ? 'cursor-pointer' : ''}`}
                    style={{ borderRadius: '0 12px 0 0', width: '100%', height: '100%' }}
                  >
                    <span className="font-display font-extrabold text-sm text-slate-500">?</span>
                  </div>
                )}

                {hasUnpasted2 && (
                  <div className="slot-paste-overlay" style={{ opacity: isHighlighted2 ? 1 : undefined, pointerEvents: isHighlighted2 ? 'auto' : undefined }}>
                    <span className="text-[10px] text-slate-500 font-semibold mb-1">¡La tienes!</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handlePasteSticker(s2.id); }}
                      className="btn-gold"
                      style={{ padding: '4px 8px', fontSize: '10px', borderRadius: '6px' }}
                    >
                      Pegar
                    </button>
                  </div>
                )}
              </div>

              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                {isPasted3 ? (
                  <div 
                    onClick={() => {
                      if (isCompleted) handleZoomSet(quad.stickers, 'quad');
                      else handleZoomSticker(s3);
                    }}
                    className={`w-full h-full sticker-pasted ${recentlyPastedId === s3.id ? 'animate-paste-slam' : ''}`}
                  >
                    <PremiumCard image={s3.image} name={s3.name} isRare={s3.isRare} style={styleOverride3} imgStyle={{ objectFit: 'fill' }} />
                  </div>
                ) : (
                  <div 
                    onClick={() => {
                      if (hasUnpasted3 && !isEditMode) {
                        setHighlightedStickerId(prev => prev === s3.id ? null : s3.id);
                      }
                    }}
                    className={`slot-silhouette ${hasUnpasted3 ? 'cursor-pointer' : ''}`}
                    style={{ borderRadius: '0 0 0 12px', width: '100%', height: '100%' }}
                  >
                    <span className="font-display font-extrabold text-sm text-slate-500">?</span>
                  </div>
                )}

                {hasUnpasted3 && (
                  <div className="slot-paste-overlay" style={{ opacity: isHighlighted3 ? 1 : undefined, pointerEvents: isHighlighted3 ? 'auto' : undefined }}>
                    <span className="text-[10px] text-slate-500 font-semibold mb-1">¡La tienes!</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handlePasteSticker(s3.id); }}
                      className="btn-gold"
                      style={{ padding: '4px 8px', fontSize: '10px', borderRadius: '6px' }}
                    >
                      Pegar
                    </button>
                  </div>
                )}
              </div>

              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                {isPasted4 ? (
                  <div 
                    onClick={() => {
                      if (isCompleted) handleZoomSet(quad.stickers, 'quad');
                      else handleZoomSticker(s4);
                    }}
                    className={`w-full h-full sticker-pasted ${recentlyPastedId === s4.id ? 'animate-paste-slam' : ''}`}
                  >
                    <PremiumCard image={s4.image} name={s4.name} isRare={s4.isRare} style={styleOverride4} imgStyle={{ objectFit: 'fill' }} />
                  </div>
                ) : (
                  <div 
                    onClick={() => {
                      if (hasUnpasted4 && !isEditMode) {
                        setHighlightedStickerId(prev => prev === s4.id ? null : s4.id);
                      }
                    }}
                    className={`slot-silhouette ${hasUnpasted4 ? 'cursor-pointer' : ''}`}
                    style={{ borderRadius: '0 0 12px 0', width: '100%', height: '100%' }}
                  >
                    <span className="font-display font-extrabold text-sm text-slate-500">?</span>
                  </div>
                )}

                {hasUnpasted4 && (
                  <div className="slot-paste-overlay" style={{ opacity: isHighlighted4 ? 1 : undefined, pointerEvents: isHighlighted4 ? 'auto' : undefined }}>
                    <span className="text-[10px] text-slate-500 font-semibold mb-1">¡La tienes!</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handlePasteSticker(s4.id); }}
                      className="btn-gold"
                      style={{ padding: '4px 8px', fontSize: '10px', borderRadius: '6px' }}
                    >
                      Pegar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', gap: '1px', padding: '0 2px' }}>
            <span style={{ fontSize: '8px', fontWeight: 'bold', color: 'var(--theme-accent)', paddingLeft: '2px' }}>
              N° {String(s1.id).padStart(3, '0')}, N° {String(s2.id).padStart(3, '0')}, N° {String(s3.id).padStart(3, '0')}, N° {String(s4.id).padStart(3, '0')}
            </span>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <span className="slot-sticker-title" style={{ margin: 0, padding: '0 2px', textAlign: 'left', fontSize: '10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                {getUnifiedName(s1.name)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderGridPage = (pageIndex) => {
    const pageStickers = stickers.filter(s => s.page === pageIndex);
    const renderedItems = processPageStickers(pageStickers);

    let gridCols = 3;
    let gridRows = 2;
    if (stickersPerPage === 4) {
      gridCols = 2;
      gridRows = 2;
    } else if (stickersPerPage === 8) {
      gridCols = 4;
      gridRows = 2;
    } else if (stickersPerPage === 12) {
      gridCols = 4;
      gridRows = 3;
    } else if (stickersPerPage === 9) {
      gridCols = 3;
      gridRows = 3;
    } else {
      gridCols = 3;
      gridRows = 2;
    }

    return (
      <div 
        className="sticker-slots-grid"
        style={{ 
          '--grid-cols': gridCols,
          '--grid-rows': gridRows,
          width: '100%', 
          height: '100%',
          marginTop: 0
        }}
      >
        {renderedItems.map((item, idx) => {
          if (item.type === 'single') return renderSingleSlot(item.sticker);
          if (item.type === 'horizontal-pair') return renderPairSlot(item, 'horizontal-pair');
          if (item.type === 'vertical-pair') return renderPairSlot(item, 'vertical-pair');
          if (item.type === 'quad-group') return renderQuadSlot(item);
          return null;
        })}
      </div>
    );
  };

  const processPageStickers = (pageStickers) => {
    const rendered = [];
    let i = 0;
    while (i < pageStickers.length) {
      const current = pageStickers[i];
      const next1 = pageStickers[i + 1];
      const next2 = pageStickers[i + 2];
      const next3 = pageStickers[i + 3];
      
      if (next1 && next2 && next3 && isQuadGroup(current, next1, next2, next3)) {
        rendered.push({
          type: 'quad-group',
          stickers: [current, next1, next2, next3]
        });
        i += 4;
      } else if (next1 && isHorizontalPair(current, next1)) {
        rendered.push({
          type: 'horizontal-pair',
          stickers: [current, next1]
        });
        i += 2;
      } else if (next1 && isVerticalPair(current, next1)) {
        rendered.push({
          type: 'vertical-pair',
          stickers: [current, next1]
        });
        i += 2;
      } else {
        rendered.push({
          type: 'single',
          sticker: current
        });
        i++;
      }
    }
    return rendered;
  };

  const getGroupedStickers = (allStickersList) => {
    const groups = [];
    const processedParentIds = new Set();
    
    allStickersList.forEach(s => {
      if (s.parentId) {
        if (!processedParentIds.has(s.parentId)) {
          processedParentIds.add(s.parentId);
          const parts = allStickersList.filter(x => x.parentId === s.parentId);
          // Sort parts by splitPart
          parts.sort((a, b) => String(a.splitPart || '').localeCompare(String(b.splitPart || '')));
          
          // Force unified coordinates and page based on the first part of the group
          const firstPart = parts[0];
          groups.push({
            type: firstPart.splitType === 'horizontal' ? 'horizontal-pair' : firstPart.splitType === 'vertical' ? 'vertical-pair' : 'quad',
            stickers: parts,
            parentId: s.parentId,
            x: firstPart.x !== undefined ? firstPart.x : 0,
            y: firstPart.y !== undefined ? firstPart.y : 0,
            width: firstPart.width !== undefined ? firstPart.width : 24,
            rotation: firstPart.rotation !== undefined ? firstPart.rotation : 0,
            page: firstPart.page !== undefined ? firstPart.page : 0
          });
        }
      } else {
        groups.push({
          type: 'single',
          sticker: s,
          id: s.id,
          x: s.x !== undefined ? s.x : 0,
          y: s.y !== undefined ? s.y : 0,
          width: s.width !== undefined ? s.width : 24,
          rotation: s.rotation !== undefined ? s.rotation : 0,
          page: s.page !== undefined ? s.page : 0
        });
      }
    });
    
    return groups;
  };

  const updateGroupCoordinates = async (group, fields) => {
    const isSingle = group.type === 'single';
    const groupStickersList = isSingle ? [group.sticker] : group.stickers;
    const ids = groupStickersList.map(s => s.id);
    
    // Update local state in-place for responsive drag feedback
    setStickers(prev => prev.map(s => ids.includes(s.id) ? { ...s, ...fields } : s));
    
    // Sync active selection coordinates
    setSelectedGroup(prev => {
      if (!prev) return null;
      const prevIds = prev.type === 'single' ? [prev.sticker.id] : prev.stickers.map(s => s.id);
      if (prevIds.includes(ids[0])) {
        return {
          ...prev,
          ...fields,
          sticker: prev.sticker ? { ...prev.sticker, ...fields } : undefined,
          stickers: prev.stickers ? prev.stickers.map(s => ({ ...s, ...fields })) : undefined
        };
      }
      return prev;
    });

    // Write coordinate updates to Dexie
    for (const id of ids) {
      await db.stickers.update(id, fields);
    }
  };

  const handleMouseDown = (e, group) => {
    if (!isEditMode) return;
    e.preventDefault();
    e.stopPropagation();

    setSelectedGroup(group);

    const pageElement = e.currentTarget.offsetParent;
    if (!pageElement) return;
    const rect = pageElement.getBoundingClientRect();

    const startX = e.clientX;
    const startY = e.clientY;

    const startPos = {
      x: group.x || 0,
      y: group.y || 0
    };

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const pctDeltaX = (deltaX / rect.width) * 100;
      const pctDeltaY = (deltaY / rect.height) * 100;

      let newX = Number((startPos.x + pctDeltaX).toFixed(2));
      let newY = Number((startPos.y + pctDeltaY).toFixed(2));

      newX = Math.max(0, Math.min(100 - (group.width || 20), newX));
      newY = Math.max(0, Math.min(95, newY));

      updateGroupCoordinates(group, { x: newX, y: newY });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleTouchStart = (e, group) => {
    if (!isEditMode) return;
    e.stopPropagation();

    setSelectedGroup(group);

    const touch = e.touches[0];
    const pageElement = e.currentTarget.offsetParent;
    if (!pageElement) return;
    const rect = pageElement.getBoundingClientRect();

    const startX = touch.clientX;
    const startY = touch.clientY;

    const startPos = {
      x: group.x || 0,
      y: group.y || 0
    };

    const handleTouchMove = (moveEvent) => {
      const currentTouch = moveEvent.touches[0];
      const deltaX = currentTouch.clientX - startX;
      const deltaY = currentTouch.clientY - startY;

      const pctDeltaX = (deltaX / rect.width) * 100;
      const pctDeltaY = (deltaY / rect.height) * 100;

      let newX = Number((startPos.x + pctDeltaX).toFixed(2));
      let newY = Number((startPos.y + pctDeltaY).toFixed(2));

      newX = Math.max(0, Math.min(100 - (group.width || 20), newX));
      newY = Math.max(0, Math.min(95, newY));

      updateGroupCoordinates(group, { x: newX, y: newY });
    };

    const handleTouchEnd = () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
  };

  const renderSingleStickerInner = (sticker) => {
    const inv = inventory[sticker.id] || { owned: 0, pasted: false };
    const hasUnpasted = inv.owned > 0 && !inv.pasted;
    const isPasted = inv.pasted;
    const isHighlighted = highlightedStickerId === sticker.id;

    return (
      <div className={`w-full h-full sticker-slot-inner ${isHighlighted ? 'highlight-pulse' : ''}`} style={{ position: 'relative', width: '100%', height: '100%' }}>
        {isPasted ? (
          <div 
            onClick={() => {
              if (!isEditMode) handleZoomSticker(sticker);
            }}
            className={`w-full h-full sticker-pasted ${!isEditMode ? 'cursor-zoom-in' : ''} ${recentlyPastedId === sticker.id ? 'animate-paste-slam' : ''}`}
          >
            <PremiumCard 
              image={sticker.image} 
              name={sticker.name} 
              isRare={sticker.isRare} 
            />
          </div>
        ) : (
          <div 
            onClick={() => {
              if (hasUnpasted && !isEditMode) {
                setHighlightedStickerId(prev => prev === sticker.id ? null : sticker.id);
              }
            }}
            className={`slot-silhouette w-full h-full ${hasUnpasted ? 'cursor-pointer' : ''}`}
            style={{ borderRadius: '10px' }}
          >
            <span className="font-display font-extrabold text-sm text-slate-500">?</span>
          </div>
        )}

        {hasUnpasted && !isEditMode && (
          <div className="slot-paste-overlay" style={{ opacity: isHighlighted ? 1 : undefined, pointerEvents: isHighlighted ? 'auto' : undefined }}>
            <span className="text-[10px] text-slate-500 font-semibold mb-1">¡La tienes!</span>
            <button 
              onClick={(e) => { e.stopPropagation(); handlePasteSticker(sticker.id); }}
              className="btn-gold"
              style={{ padding: '4px 8px', fontSize: '10px', borderRadius: '6px' }}
            >
              Pegar
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderSingleStickerCaption = (sticker) => {
    const inv = inventory[sticker.id] || { owned: 0, pasted: false };
    const duplicateCount = Math.max(0, inv.owned - 1);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', marginTop: '4px', gap: '1px' }}>
        <span style={{ fontSize: '8px', fontWeight: 'bold', color: 'var(--theme-accent)', paddingLeft: '2px' }}>
          N° {String(sticker.id).padStart(3, '0')}
        </span>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <span className="slot-sticker-title" style={{ margin: 0, padding: '0 2px', textAlign: 'left', fontSize: '10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
            {sticker.name}
          </span>
        </div>
      </div>
    );
  };

  const renderPairStickerInner = (group, type) => {
    const [s1, s2] = group.stickers;
    const inv1 = inventory[s1.id] || { owned: 0, pasted: false };
    const inv2 = inventory[s2.id] || { owned: 0, pasted: false };
    
    const isPasted1 = inv1.pasted;
    const isPasted2 = inv2.pasted;
    
    const hasUnpasted1 = inv1.owned > 0 && !inv1.pasted;
    const hasUnpasted2 = inv2.owned > 0 && !inv2.pasted;

    const isHorizontal = type === 'horizontal-pair';
    const isHighlighted1 = highlightedStickerId === s1.id;
    const isHighlighted2 = highlightedStickerId === s2.id;

    const styleOverride1 = isHorizontal
      ? {
          borderRight: 'none',
          borderTopRightRadius: '0px',
          borderBottomRightRadius: '0px',
          borderTopLeftRadius: '8px',
          borderBottomLeftRadius: '8px',
          boxShadow: 'none',
        }
      : {
          borderBottom: 'none',
          borderBottomLeftRadius: '0px',
          borderBottomRightRadius: '0px',
          borderTopLeftRadius: '8px',
          borderTopRightRadius: '8px',
          boxShadow: 'none',
        };

    const styleOverride2 = isHorizontal
      ? {
          borderLeft: 'none',
          borderTopLeftRadius: '0px',
          borderBottomLeftRadius: '0px',
          borderTopRightRadius: '8px',
          borderBottomRightRadius: '8px',
          boxShadow: 'none',
        }
      : {
          borderTop: 'none',
          borderTopLeftRadius: '0px',
          borderTopRightRadius: '0px',
          borderBottomLeftRadius: '8px',
          borderBottomRightRadius: '8px',
          boxShadow: 'none',
        };

    return (
      <div style={{ display: 'flex', flexDirection: isHorizontal ? 'row' : 'column', width: '100%', height: '100%' }}>
        <div style={{ flex: 1, position: 'relative', height: '100%', width: '100%' }}>
          {isPasted1 ? (
            <div 
              onClick={() => {
                if (!isEditMode) {
                  if (isPasted1 && isPasted2) handleZoomSet(group.stickers, type);
                  else handleZoomSticker(s1);
                }
              }}
              className={`w-full h-full sticker-pasted ${!isEditMode ? 'cursor-zoom-in' : ''} ${recentlyPastedId === s1.id ? 'animate-paste-slam' : ''}`}
            >
              <PremiumCard image={s1.image} name={s1.name} isRare={s1.isRare} style={styleOverride1} imgStyle={{ objectFit: 'fill' }} />
            </div>
          ) : (
            <div 
              onClick={() => {
                if (hasUnpasted1 && !isEditMode) {
                  setHighlightedStickerId(prev => prev === s1.id ? null : s1.id);
                }
              }}
              className={`slot-silhouette ${hasUnpasted1 ? 'cursor-pointer' : ''}`}
              style={{ borderRadius: isHorizontal ? '8px 0 0 8px' : '8px 8px 0 0', width: '100%', height: '100%' }}
            >
              <span className="font-display font-extrabold text-sm text-slate-500">?</span>
            </div>
          )}
          {hasUnpasted1 && !isEditMode && (
            <div className="slot-paste-overlay" style={{ opacity: isHighlighted1 ? 1 : undefined, pointerEvents: isHighlighted1 ? 'auto' : undefined }}>
              <span className="text-[10px] text-slate-500 font-semibold mb-1">¡La tienes!</span>
              <button 
                onClick={(e) => { e.stopPropagation(); handlePasteSticker(s1.id); }}
                className="btn-gold"
                style={{ padding: '4px 8px', fontSize: '10px', borderRadius: '6px' }}
              >
                Pegar
              </button>
            </div>
          )}
        </div>

        {!(isPasted1 && isPasted2) && (
          <div className={`pair-divider-line ${isHorizontal ? 'line-vertical' : 'line-horizontal'}`} />
        )}

        <div style={{ flex: 1, position: 'relative', height: '100%', width: '100%' }}>
          {isPasted2 ? (
            <div 
              onClick={() => {
                if (!isEditMode) {
                  if (isPasted1 && isPasted2) handleZoomSet(group.stickers, type);
                  else handleZoomSticker(s2);
                }
              }}
              className={`w-full h-full sticker-pasted ${!isEditMode ? 'cursor-zoom-in' : ''} ${recentlyPastedId === s2.id ? 'animate-paste-slam' : ''}`}
            >
              <PremiumCard image={s2.image} name={s2.name} isRare={s2.isRare} style={styleOverride2} imgStyle={{ objectFit: 'fill' }} />
            </div>
          ) : (
            <div 
              onClick={() => {
                if (hasUnpasted2 && !isEditMode) {
                  setHighlightedStickerId(prev => prev === s2.id ? null : s2.id);
                }
              }}
              className={`slot-silhouette ${hasUnpasted2 ? 'cursor-pointer' : ''}`}
              style={{ borderRadius: isHorizontal ? '0 8px 8px 0' : '0 0 8px 8px', width: '100%', height: '100%' }}
            >
              <span className="font-display font-extrabold text-sm text-slate-500">?</span>
            </div>
          )}
          {hasUnpasted2 && !isEditMode && (
            <div className="slot-paste-overlay" style={{ opacity: isHighlighted2 ? 1 : undefined, pointerEvents: isHighlighted2 ? 'auto' : undefined }}>
              <span className="text-[10px] text-slate-500 font-semibold mb-1">¡La tienes!</span>
              <button 
                onClick={(e) => { e.stopPropagation(); handlePasteSticker(s2.id); }}
                className="btn-gold"
                style={{ padding: '4px 8px', fontSize: '10px', borderRadius: '6px' }}
              >
                Pegar
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderPairStickerCaption = (group) => {
    const [s1, s2] = group.stickers;
    const inv1 = inventory[s1.id] || { owned: 0, pasted: false };
    const inv2 = inventory[s2.id] || { owned: 0, pasted: false };
    
    const dup1 = Math.max(0, inv1.owned - 1);
    const dup2 = Math.max(0, inv2.owned - 1);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', marginTop: '4px', gap: '1px' }}>
        <span style={{ fontSize: '8px', fontWeight: 'bold', color: 'var(--theme-accent)', paddingLeft: '2px' }}>
          N° {String(s1.id).padStart(3, '0')} y N° {String(s2.id).padStart(3, '0')}
        </span>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <span className="slot-sticker-title" style={{ margin: 0, padding: '0 2px', textAlign: 'left', fontSize: '10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
            {getUnifiedName(s1.name)}
          </span>
        </div>
      </div>
    );
  };

  const renderQuadStickerInner = (group) => {
    const [s1, s2, s3, s4] = group.stickers;
    
    const inv1 = inventory[s1.id] || { owned: 0, pasted: false };
    const inv2 = inventory[s2.id] || { owned: 0, pasted: false };
    const inv3 = inventory[s3.id] || { owned: 0, pasted: false };
    const inv4 = inventory[s4.id] || { owned: 0, pasted: false };

    const isPasted1 = inv1.pasted;
    const isPasted2 = inv2.pasted;
    const isPasted3 = inv3.pasted;
    const isPasted4 = inv4.pasted;

    const hasUnpasted1 = inv1.owned > 0 && !inv1.pasted;
    const hasUnpasted2 = inv2.owned > 0 && !inv2.pasted;
    const hasUnpasted3 = inv3.owned > 0 && !inv3.pasted;
    const hasUnpasted4 = inv4.owned > 0 && !inv4.pasted;

    const isHighlighted1 = highlightedStickerId === s1.id;
    const isHighlighted2 = highlightedStickerId === s2.id;
    const isHighlighted3 = highlightedStickerId === s3.id;
    const isHighlighted4 = highlightedStickerId === s4.id;

    const pastedCount = (isPasted1 ? 1 : 0) + (isPasted2 ? 1 : 0) + (isPasted3 ? 1 : 0) + (isPasted4 ? 1 : 0);
    const isCompleted = pastedCount === 4;

    const styleOverride1 = {
      borderTopLeftRadius: '12px',
      borderTopRightRadius: '0px',
      borderBottomLeftRadius: '0px',
      borderBottomRightRadius: '0px',
      borderRight: isPasted1 && isPasted2 ? 'none' : undefined,
      borderBottom: isPasted1 && isPasted3 ? 'none' : undefined,
      boxShadow: 'none',
    };
    const styleOverride2 = {
      borderTopRightRadius: '12px',
      borderTopLeftRadius: '0px',
      borderBottomLeftRadius: '0px',
      borderBottomRightRadius: '0px',
      borderLeft: isPasted1 && isPasted2 ? 'none' : undefined,
      borderBottom: isPasted2 && isPasted4 ? 'none' : undefined,
      boxShadow: 'none',
    };
    const styleOverride3 = {
      borderBottomLeftRadius: '12px',
      borderTopLeftRadius: '0px',
      borderTopRightRadius: '0px',
      borderBottomRightRadius: '0px',
      borderRight: isPasted3 && isPasted4 ? 'none' : undefined,
      borderTop: isPasted1 && isPasted3 ? 'none' : undefined,
      boxShadow: 'none',
    };
    const styleOverride4 = {
      borderBottomRightRadius: '12px',
      borderTopLeftRadius: '0px',
      borderTopRightRadius: '0px',
      borderBottomLeftRadius: '0px',
      borderLeft: isPasted3 && isPasted4 ? 'none' : undefined,
      borderTop: isPasted2 && isPasted4 ? 'none' : undefined,
      boxShadow: 'none',
    };

    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {!isCompleted && (
          <div className="quad-seams-container">
            <div className={`quad-seam-horizontal ${((isPasted1 && isPasted3) && (isPasted2 && isPasted4)) ? 'quad-seam-hidden' : ''}`} />
            <div className={`quad-seam-vertical ${((isPasted1 && isPasted2) && (isPasted3 && isPasted4)) ? 'quad-seam-hidden' : ''}`} />
          </div>
        )}

        {!isCompleted && (
          <div className="quad-center-guide" style={{ transform: 'translate(-50%, -50%) scale(0.7)' }}>
            <Puzzle size={12} className="quad-guide-icon" />
            <span className="quad-guide-text" style={{ fontSize: '8px' }}>{pastedCount}/4</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', width: '100%', height: '100%', gap: '0px' }}>
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {isPasted1 ? (
              <div 
                onClick={() => {
                  if (!isEditMode) {
                    if (isCompleted) handleZoomSet(group.stickers, 'quad');
                    else handleZoomSticker(s1);
                  }
                }}
                className={`w-full h-full sticker-pasted ${!isEditMode ? 'cursor-zoom-in' : ''} ${recentlyPastedId === s1.id ? 'animate-paste-slam' : ''}`}
              >
                <PremiumCard image={s1.image} name={s1.name} isRare={s1.isRare} style={styleOverride1} imgStyle={{ objectFit: 'fill' }} />
              </div>
            ) : (
              <div 
                onClick={() => {
                  if (hasUnpasted1 && !isEditMode) {
                    setHighlightedStickerId(prev => prev === s1.id ? null : s1.id);
                  }
                }}
                className={`slot-silhouette ${hasUnpasted1 ? 'cursor-pointer' : ''}`}
                style={{ borderRadius: '12px 0 0 0', width: '100%', height: '100%' }}
              >
                <span className="font-display font-extrabold text-sm text-slate-500">?</span>
              </div>
            )}
            {hasUnpasted1 && !isEditMode && (
              <div className="slot-paste-overlay" style={{ opacity: isHighlighted1 ? 1 : undefined, pointerEvents: isHighlighted1 ? 'auto' : undefined }}>
                <span className="text-[10px] text-slate-500 font-semibold mb-1">¡La tienes!</span>
                <button 
                  onClick={(e) => { e.stopPropagation(); handlePasteSticker(s1.id); }}
                  className="btn-gold"
                  style={{ padding: '4px 8px', fontSize: '10px', borderRadius: '6px' }}
                >
                  Pegar
                </button>
              </div>
            )}
          </div>

          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {isPasted2 ? (
              <div 
                onClick={() => {
                  if (!isEditMode) {
                    if (isCompleted) handleZoomSet(group.stickers, 'quad');
                    else handleZoomSticker(s2);
                  }
                }}
                className={`w-full h-full sticker-pasted ${!isEditMode ? 'cursor-zoom-in' : ''} ${recentlyPastedId === s2.id ? 'animate-paste-slam' : ''}`}
              >
                <PremiumCard image={s2.image} name={s2.name} isRare={s2.isRare} style={styleOverride2} imgStyle={{ objectFit: 'fill' }} />
              </div>
            ) : (
              <div 
                onClick={() => {
                  if (hasUnpasted2 && !isEditMode) {
                    setHighlightedStickerId(prev => prev === s2.id ? null : s2.id);
                  }
                }}
                className={`slot-silhouette ${hasUnpasted2 ? 'cursor-pointer' : ''}`}
                style={{ borderRadius: '0 12px 0 0', width: '100%', height: '100%' }}
              >
                <span className="font-display font-extrabold text-sm text-slate-500">?</span>
              </div>
            )}
            {hasUnpasted2 && !isEditMode && (
              <div className="slot-paste-overlay" style={{ opacity: isHighlighted2 ? 1 : undefined, pointerEvents: isHighlighted2 ? 'auto' : undefined }}>
                <span className="text-[10px] text-slate-500 font-semibold mb-1">¡La tienes!</span>
                <button 
                  onClick={(e) => { e.stopPropagation(); handlePasteSticker(s2.id); }}
                  className="btn-gold"
                  style={{ padding: '4px 8px', fontSize: '10px', borderRadius: '6px' }}
                >
                  Pegar
                </button>
              </div>
            )}
          </div>

          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {isPasted3 ? (
              <div 
                onClick={() => {
                  if (!isEditMode) {
                    if (isCompleted) handleZoomSet(group.stickers, 'quad');
                    else handleZoomSticker(s3);
                  }
                }}
                className={`w-full h-full sticker-pasted ${!isEditMode ? 'cursor-zoom-in' : ''} ${recentlyPastedId === s3.id ? 'animate-paste-slam' : ''}`}
              >
                <PremiumCard image={s3.image} name={s3.name} isRare={s3.isRare} style={styleOverride3} imgStyle={{ objectFit: 'fill' }} />
              </div>
            ) : (
              <div 
                onClick={() => {
                  if (hasUnpasted3 && !isEditMode) {
                    setHighlightedStickerId(prev => prev === s3.id ? null : s3.id);
                  }
                }}
                className={`slot-silhouette ${hasUnpasted3 ? 'cursor-pointer' : ''}`}
                style={{ borderRadius: '0 0 0 12px', width: '100%', height: '100%' }}
              >
                <span className="font-display font-extrabold text-sm text-slate-500">?</span>
              </div>
            )}
            {hasUnpasted3 && !isEditMode && (
              <div className="slot-paste-overlay" style={{ opacity: isHighlighted3 ? 1 : undefined, pointerEvents: isHighlighted3 ? 'auto' : undefined }}>
                <span className="text-[10px] text-slate-500 font-semibold mb-1">¡La tienes!</span>
                <button 
                  onClick={(e) => { e.stopPropagation(); handlePasteSticker(s3.id); }}
                  className="btn-gold"
                  style={{ padding: '4px 8px', fontSize: '10px', borderRadius: '6px' }}
                >
                  Pegar
                </button>
              </div>
            )}
          </div>

          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {isPasted4 ? (
              <div 
                onClick={() => {
                  if (!isEditMode) {
                    if (isCompleted) handleZoomSet(group.stickers, 'quad');
                    else handleZoomSticker(s4);
                  }
                }}
                className={`w-full h-full sticker-pasted ${!isEditMode ? 'cursor-zoom-in' : ''} ${recentlyPastedId === s4.id ? 'animate-paste-slam' : ''}`}
              >
                <PremiumCard image={s4.image} name={s4.name} isRare={s4.isRare} style={styleOverride4} imgStyle={{ objectFit: 'fill' }} />
              </div>
            ) : (
              <div 
                onClick={() => {
                  if (hasUnpasted4 && !isEditMode) {
                    setHighlightedStickerId(prev => prev === s4.id ? null : s4.id);
                  }
                }}
                className={`slot-silhouette ${hasUnpasted4 ? 'cursor-pointer' : ''}`}
                style={{ borderRadius: '0 0 12px 0', width: '100%', height: '100%' }}
              >
                <span className="font-display font-extrabold text-sm text-slate-500">?</span>
              </div>
            )}
            {hasUnpasted4 && !isEditMode && (
              <div className="slot-paste-overlay" style={{ opacity: isHighlighted4 ? 1 : undefined, pointerEvents: isHighlighted4 ? 'auto' : undefined }}>
                <span className="text-[10px] text-slate-500 font-semibold mb-1">¡La tienes!</span>
                <button 
                  onClick={(e) => { e.stopPropagation(); handlePasteSticker(s4.id); }}
                  className="btn-gold"
                  style={{ padding: '4px 8px', fontSize: '10px', borderRadius: '6px' }}
                >
                  Pegar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderQuadStickerCaption = (group) => {
    const [s1, s2, s3, s4] = group.stickers;
    const inv1 = inventory[s1.id] || { owned: 0, pasted: false };
    const inv2 = inventory[s2.id] || { owned: 0, pasted: false };
    const inv3 = inventory[s3.id] || { owned: 0, pasted: false };
    const inv4 = inventory[s4.id] || { owned: 0, pasted: false };

    const isPasted1 = inv1.pasted;
    const isPasted2 = inv2.pasted;
    const isPasted3 = inv3.pasted;
    const isPasted4 = inv4.pasted;

    const dup1 = Math.max(0, inv1.owned - 1);
    const dup2 = Math.max(0, inv2.owned - 1);
    const dup3 = Math.max(0, inv3.owned - 1);
    const dup4 = Math.max(0, inv4.owned - 1);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', marginTop: '4px', gap: '1px' }}>
        <span style={{ fontSize: '8px', fontWeight: 'bold', color: 'var(--theme-accent)', paddingLeft: '2px' }}>
          N° {String(s1.id).padStart(3, '0')}, N° {String(s2.id).padStart(3, '0')}, N° {String(s3.id).padStart(3, '0')}, N° {String(s4.id).padStart(3, '0')}
        </span>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <span className="slot-sticker-title" style={{ margin: 0, padding: '0 2px', textAlign: 'left', fontSize: '10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
            {getUnifiedName(s1.name)}
          </span>
        </div>
      </div>
    );
  };

  const renderPage = (pageIndex) => {
    const allGroups = getGroupedStickers(stickers);
    const groups = allGroups.filter(g => g.page === pageIndex);

    return (
      <div 
        className="album-page-canvas" 
        style={{ 
          position: 'relative', 
          width: '100%', 
          height: '100%', 
          minHeight: '520px',
          overflow: 'hidden'
        }}
        onClick={() => {
          if (isEditMode) setSelectedGroup(null);
        }}
      >
        {groups.map(group => {
          const isSelected = selectedGroup && (
            group.type === 'single'
              ? selectedGroup.type === 'single' && selectedGroup.sticker.id === group.sticker.id
              : selectedGroup.parentId === group.parentId
          );

          const isGroupPasted = group.type === 'single'
            ? (inventory[group.sticker.id]?.pasted)
            : group.stickers.every(s => inventory[s.id]?.pasted);

          let aspect = 0.75;
          if (group.type === 'single') {
            aspect = group.sticker.aspectRatio || 0.75;
          } else if (group.type === 'horizontal-pair') {
            const [s1, s2] = group.stickers;
            const a1 = s1.aspectRatio || 0.75;
            const a2 = s2.aspectRatio || 0.75;
            aspect = a1 + a2;
          } else if (group.type === 'vertical-pair') {
            const [s1, s2] = group.stickers;
            const a1 = s1.aspectRatio || 0.75;
            const a2 = s2.aspectRatio || 0.75;
            aspect = 1 / (1/a1 + 1/a2);
          } else if (group.type === 'quad') {
            const [s1] = group.stickers;
            aspect = s1.aspectRatio || 0.75;
          }

          let shadow = 'none';
          if (isEditMode && isSelected) {
            shadow = '0 0 0 4px rgba(226, 162, 39, 0.2)';
          } else if (!isEditMode && isGroupPasted) {
            shadow = 'var(--shadow-sm)';
          }

          return (
            <div 
              key={group.parentId || (group.sticker ? group.sticker.id : group.id)}
              className={`sticker-absolute-group ${isSelected ? 'selected-absolute-group' : ''}`}
              style={{
                position: 'absolute',
                left: `${group.x}%`,
                top: `${group.y}%`,
                width: `${group.width}%`,
                transform: `rotate(${group.rotation || 0}deg)`,
                transformOrigin: 'center center',
                zIndex: isSelected ? 100 : 10,
                cursor: isEditMode ? 'move' : 'default',
                borderRadius: '8px',
                border: isEditMode ? (isSelected ? '2px solid var(--theme-accent)' : '1px dashed rgba(139, 126, 116, 0.4)') : 'none',
                boxShadow: shadow,
                padding: isEditMode ? '4px' : '0px',
                backgroundColor: isEditMode && isSelected ? 'rgba(226, 162, 39, 0.03)' : 'transparent',
              }}
              onMouseDown={(e) => handleMouseDown(e, group)}
              onTouchStart={(e) => handleTouchStart(e, group)}
              onClick={(e) => {
                if (isEditMode) {
                  e.stopPropagation();
                  setSelectedGroup(group);
                }
              }}
            >
              <div className="group-slots" style={{ width: '100%', aspectRatio: aspect, position: 'relative' }}>
                {group.type === 'single' && renderSingleStickerInner(group.sticker)}
                {group.type === 'horizontal-pair' && renderPairStickerInner(group, 'horizontal-pair')}
                {group.type === 'vertical-pair' && renderPairStickerInner(group, 'vertical-pair')}
                {group.type === 'quad' && renderQuadStickerInner(group)}
              </div>
              {(() => {
                const isGroupPasted = group.type === 'single'
                  ? (inventory[group.sticker.id]?.pasted)
                  : group.stickers.every(s => inventory[s.id]?.pasted);
                const showCaption = isEditMode || !isGroupPasted;
                return showCaption ? (
                  <div className="group-caption" style={{ width: '100%', marginTop: '2px' }}>
                    {group.type === 'single' && renderSingleStickerCaption(group.sticker)}
                    {(group.type === 'horizontal-pair' || group.type === 'vertical-pair') && renderPairStickerCaption(group)}
                    {group.type === 'quad' && renderQuadStickerCaption(group)}
                  </div>
                ) : null;
              })()}
            </div>
          );
        })}

        {/* Render Sticky Notes */}
        {notes.filter(n => n.page === pageIndex).map(note => {
          const rotation = note.rotation || 0;
          return (
            <div
              key={note.id}
              className={`sticky-note note-color-${note.color} ${isEditMode ? 'is-editable' : ''}`}
              style={{
                position: 'absolute',
                left: `${note.x}%`,
                top: `${note.y}%`,
                transform: `rotate(${rotation}deg)`,
                transformOrigin: 'center center',
                zIndex: 50,
                cursor: isEditMode ? 'move' : 'default',
              }}
              onMouseDown={(e) => handleNoteMouseDown(e, note)}
              onTouchStart={(e) => handleNoteTouchStart(e, note)}
              onClick={(e) => e.stopPropagation()}
            >
              {isEditMode ? (
                <div className="note-edit-controls" onClick={(e) => e.stopPropagation()}>
                  <select 
                    value={note.color} 
                    onChange={(e) => handleUpdateNote(note.id, { color: e.target.value })}
                    className="note-color-select"
                  >
                    <option value="yellow">💛</option>
                    <option value="pink">💗</option>
                    <option value="green">💚</option>
                    <option value="blue">💙</option>
                  </select>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteNote(note.id);
                    }}
                    className="note-delete-btn"
                    title="Eliminar Nota"
                  >
                    ✕
                  </button>
                </div>
              ) : null}
              
              {isEditMode ? (
                <textarea
                  value={note.text}
                  onChange={(e) => handleUpdateNote(note.id, { text: e.target.value })}
                  className="note-textarea print-hidden"
                  maxLength={150}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : null}
              
              <div className={`note-text-display ${isEditMode ? 'print-only-block' : ''}`}>
                {note.text}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Progress & Page Index */}
      <div className="glass-panel progress-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '1.25rem' }}>
        {/* Progress bar info */}
        <div className="progress-info">
          <div className="flex justify-between items-center mb-2">
            <span className="font-bold text-lg text-white">Progreso de Colección</span>
            <span className="font-display font-black text-2xl text-purple-400">{progress.percentage}%</span>
          </div>
          <div className="progress-bar-track">
            <div 
              className="progress-bar-fill" 
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          <div className="flex justify-between items-center mt-3 text-xs text-slate-500 font-semibold flex-wrap gap-2">
            <div className="flex gap-4">
              <span>Fotos Pegadas: {progress.pasted} / {progress.total}</span>
              <span>Únicas: {progress.uniqueOwned}</span>
            </div>
            
            {/* Page Jump Dropdown & Customizer Trigger */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Ir a Página:</span>
                <select
                  value={currentPage}
                  onChange={(e) => setCurrentPage(Number(e.target.value))}
                  className="text-input"
                  style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '8px', border: '1.5px solid #e5dec9', background: '#ffffff', cursor: 'pointer', outline: 'none', fontWeight: '700', color: '#6b6359' }}
                >
                  {Array.from({ length: totalPages }, (_, idx) => (
                    <option key={idx} value={idx}>
                      Págs. {idx * 2 + 1} - {idx * 2 + 2}
                    </option>
                  ))}
                </select>
              </div>

              {/* Layout Switcher (Grid / Scrapbook) */}
              <div style={{ display: 'flex', background: '#eae4d3', borderRadius: '8px', padding: '2px', border: '1.5px solid #e5dec9', alignItems: 'center' }}>
                <button
                  onClick={() => {
                    handleSelectLayoutStyle('grid');
                    setIsEditMode(false);
                    setSelectedGroup(null);
                  }}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    borderRadius: '6px',
                    border: 'none',
                    background: layoutStyle === 'grid' ? 'var(--theme-accent)' : 'transparent',
                    color: layoutStyle === 'grid' ? '#ffffff' : '#6b6359',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s'
                  }}
                  title="Alinear figuritas en una cuadrícula fija ordenada"
                >
                  📊 Cuadrícula
                </button>
                <button
                  onClick={() => {
                    handleSelectLayoutStyle('scrapbook');
                  }}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    borderRadius: '6px',
                    border: 'none',
                    background: layoutStyle === 'scrapbook' ? 'var(--theme-accent)' : 'transparent',
                    color: layoutStyle === 'scrapbook' ? '#ffffff' : '#6b6359',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s'
                  }}
                  title="Diseño libre interactivo con arrastre, rotación y escalado"
                >
                  🎨 Scrapbook
                </button>
              </div>

              {/* Scrapbook Edit Mode Button */}
              {layoutStyle === 'scrapbook' && (
                <button
                  onClick={() => {
                    setIsEditMode(!isEditMode);
                    setSelectedGroup(null);
                  }}
                  className={`btn-secondary ${isEditMode ? 'nav-link-btn-active' : ''}`}
                  style={{ padding: '5px 10px', fontSize: '11px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}
                >
                  <Move size={12} /> {isEditMode ? 'Guardar Diseño' : 'Editar Diseño 🔧'}
                </button>
              )}

              <button
                onClick={() => setShowCustomizer(!showCustomizer)}
                className={`btn-secondary ${showCustomizer ? 'nav-link-btn-active' : ''}`}
                style={{ padding: '5px 10px', fontSize: '11px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}
              >
                <Palette size={12} /> Personalizar
              </button>


              {/* Print Album Button */}
              <button
                onClick={() => window.print()}
                className="btn-primary"
                style={{ padding: '5px 10px', fontSize: '11px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}
                title="Imprimir el álbum completo página por página"
              >
                <Printer size={12} /> Imprimir 🖨️
              </button>
            </div>
          </div>
        </div>

        {/* Slide-down Customizer Panel */}
        {showCustomizer && (
          <div style={{ borderTop: '1px solid #e5dec9', marginTop: '1.25rem', paddingTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Background selections */}
            <div>
              <span className="input-label" style={{ marginBottom: '0.5rem', display: 'block', fontSize: '10px' }}>Fondo del Álbum (14 Estilos)</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {[
                  { id: 'scrapbook', name: '📖 Scrapbook' },
                  { id: 'corkboard', name: '📌 Corkboard' },
                  { id: 'wood', name: '🪵 Madera' },
                  { id: 'cardboard', name: '📦 Cartón' },
                  { id: 'lined', name: '📝 Rayado' },
                  { id: 'fabric', name: '🧵 Tela Lino' },
                  { id: 'notebook', name: '📓 Cuaderno' },
                  { id: 'blueprint', name: '🗺️ Plano' },
                  { id: 'leather', name: '💼 Cuero' },
                  { id: 'neon', name: '🌐 Neón' },
                  { id: 'jungle', name: '🌴 Selvático' },
                  { id: 'geometric', name: '📐 Geométrico' },
                  { id: 'space', name: '🚀 Espacial' },
                ].map(bg => (
                  <button
                    key={bg.id}
                    onClick={() => handleSelectBg(bg.id)}
                    className="btn-secondary"
                    style={{
                      padding: '6px 12px',
                      fontSize: '11px',
                      borderRadius: '8px',
                      border: albumBg === bg.id ? '2px solid var(--theme-accent)' : '1.5px solid #e5dec9',
                      background: '#ffffff',
                      fontWeight: albumBg === bg.id ? '700' : '500',
                      color: '#2d2a26',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {albumBg === bg.id && <Check size={10} className="text-emerald-500" />}
                    {bg.name}
                  </button>
                ))}
                {customBgImage && (
                  <button
                    onClick={() => handleSelectBg('custom')}
                    className="btn-secondary"
                    style={{
                      padding: '6px 12px',
                      fontSize: '11px',
                      borderRadius: '8px',
                      border: albumBg === 'custom' ? '2px solid var(--theme-accent)' : '1.5px solid #e5dec9',
                      background: '#ffffff',
                      fontWeight: albumBg === 'custom' ? '700' : '500',
                      color: '#2d2a26',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {albumBg === 'custom' && <Check size={10} className="text-emerald-500" />}
                    📸 Foto de Fondo
                  </button>
                )}
              </div>

              {/* Custom background image upload input */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleCustomBgUpload}
                  id="custom-bg-upload-input"
                  style={{ display: 'none' }}
                />
                <label 
                  htmlFor="custom-bg-upload-input"
                  className="btn-secondary"
                  style={{ padding: '5px 10px', fontSize: '11px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', background: '#ffffff', border: '1.5px solid #e5dec9' }}
                >
                  Subir Foto de Fondo
                </label>
                {customBgImage && (
                  <button
                    onClick={handleDeleteCustomBg}
                    className="text-red-400 font-bold hover:underline"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px' }}
                  >
                    Eliminar Foto
                  </button>
                )}
              </div>
            </div>

            {/* Color theme selections */}
            <div>
              <span className="input-label" style={{ marginBottom: '0.5rem', display: 'block', fontSize: '10px' }}>Paleta de Colores (5 Temas)</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {[
                  { id: 'gold', name: 'Oro Cálido', hex: '#e2a227' },
                  { id: 'purple', name: 'Púrpura', hex: '#8b5cf6' },
                  { id: 'green', name: 'Verde', hex: '#10b981' },
                  { id: 'blue', name: 'Azul', hex: '#3b82f6' },
                  { id: 'red', name: 'Rojo Coral', hex: '#ef4444' },
                ].map(color => (
                  <button
                    key={color.id}
                    onClick={() => handleSelectColor(color.id)}
                    className="btn-secondary"
                    style={{
                      padding: '6px 12px',
                      fontSize: '11px',
                      borderRadius: '8px',
                      border: albumColor === color.id ? '2px solid var(--theme-accent)' : '1.5px solid #e5dec9',
                      background: '#ffffff',
                      fontWeight: albumColor === color.id ? '700' : '500',
                      color: '#2d2a26',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color.hex, display: 'inline-block' }} />
                    {albumColor === color.id && <Check size={10} className="text-emerald-500" />}
                    {color.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {stickers.length === 0 ? (
        <div className="glass-panel p-12 text-center text-slate-500">
          Carga un álbum en el creador para comenzar a coleccionar.
        </div>
      ) : (
        <>
          {isEditMode && (
            <div className="glass-panel p-4 mb-4" style={{ border: '2px solid var(--theme-accent)', background: 'rgba(226, 162, 39, 0.05)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-primary)', fontWeight: 'bold' }}>
                <Move size={14} className="text-amber-500" />
                <span>Modo Scrapbook Activo: Arrastra las figuritas para colocarlas libremente. Haz clic en una para ver más controles.</span>
              </div>
              {selectedGroup ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center', borderTop: '1px solid rgba(226, 162, 39, 0.2)', paddingTop: '8px', marginTop: '4px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                    Editando: <span style={{ color: 'var(--theme-accent)' }}>{selectedGroup.type === 'single' ? selectedGroup.sticker.name : getUnifiedName(selectedGroup.stickers[0].name)}</span>
                  </div>
                  
                  {/* Page Select */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--text-muted)' }}>PÁGINA:</span>
                    <select
                      value={selectedGroup.page}
                      onChange={(e) => {
                        const newPage = Number(e.target.value);
                        updateGroupCoordinates(selectedGroup, { page: newPage });
                        setCurrentPage(Math.floor(newPage / 2));
                      }}
                      className="text-input"
                      style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '6px', border: '1.5px solid #e5dec9', background: '#ffffff', color: '#6b6359', fontWeight: '700', cursor: 'pointer' }}
                    >
                      {Array.from({ length: 20 }, (_, idx) => (
                        <option key={idx} value={idx}>
                          Pág {idx + 1}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Width Slider */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexGrow: 1, minWidth: '150px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>TAMAÑO ({Number(selectedGroup.width).toFixed(1)}%):</span>
                    <input 
                      type="range"
                      min="10"
                      max="50"
                      step="0.1"
                      value={selectedGroup.width}
                      onChange={(e) => updateGroupCoordinates(selectedGroup, { width: Number(e.target.value) })}
                      style={{ flexGrow: 1, accentColor: 'var(--theme-accent)', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Rotation Slider */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexGrow: 1, minWidth: '150px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>ROTACIÓN ({Number(selectedGroup.rotation).toFixed(1)}°):</span>
                    <input 
                      type="range"
                      min="-45"
                      max="45"
                      step="0.1"
                      value={selectedGroup.rotation}
                      onChange={(e) => updateGroupCoordinates(selectedGroup, { rotation: Number(e.target.value) })}
                      style={{ flexGrow: 1, accentColor: 'var(--theme-accent)', cursor: 'pointer' }}
                    />
                  </div>
                  
                  <button
                    onClick={() => setSelectedGroup(null)}
                    className="btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '10px', borderRadius: '6px' }}
                  >
                    Listo
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Selecciona una figurita o silueta vacía en la página para cambiar su tamaño, rotación o pasarla de página.
                </div>
              )}

              {/* Sticky Notes Add Bar */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid rgba(226, 162, 39, 0.2)', paddingTop: '8px', marginTop: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Notas Adhesivas:</span>
                <button
                  onClick={() => handleAddNote(currentPage * 2)}
                  className="btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '6px' }}
                >
                  <Plus size={10} /> Agregar nota a la izquierda
                </button>
                <button
                  onClick={() => handleAddNote(currentPage * 2 + 1)}
                  className="btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '6px' }}
                >
                  <Plus size={10} /> Agregar nota a la derecha
                </button>
              </div>
            </div>
          )}

          <div className="album-book">
            <div className="album-double-page">
              {/* Center Crease shadow for book binding */}
              <div className="book-binding-crease" />

              {/* LEFT PAGE */}
              <div 
                className={`album-page album-page-left bg-theme-${albumBg} ${layoutStyle === 'grid' ? 'layout-grid' : ''}`}
                style={{
                  ...(albumBg === 'custom' && customBgImage ? { backgroundImage: `url(${customBgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
                  padding: '2.5rem 1.5rem 1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  height: 'auto',
                  minHeight: layoutStyle === 'grid' ? '620px' : '580px',
                  position: 'relative',
                  border: draggedOverPage === currentPage * 2 ? '2px dashed var(--theme-accent)' : 'none',
                  backgroundColor: draggedOverPage === currentPage * 2 ? 'rgba(226, 162, 39, 0.15)' : undefined,
                  boxShadow: draggedOverPage === currentPage * 2 ? '0 0 15px rgba(226, 162, 39, 0.3) inset' : undefined,
                  transition: 'all 0.2s'
                }}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => setDraggedOverPage(currentPage * 2)}
                onDragLeave={() => setDraggedOverPage(null)}
                onDrop={(e) => handleDropOnPage(e, currentPage * 2)}
              >
                <div className="page-num page-num-left">Pág. {currentPage * 2 + 1}</div>
                <div style={{ flexGrow: 1, position: 'relative', marginTop: '1rem', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  {layoutStyle === 'scrapbook' ? renderPage(currentPage * 2) : renderGridPage(currentPage * 2)}
                </div>
              </div>

              {/* RIGHT PAGE */}
              <div 
                className={`album-page album-page-right bg-theme-${albumBg} ${layoutStyle === 'grid' ? 'layout-grid' : ''}`}
                style={{
                  ...(albumBg === 'custom' && customBgImage ? { backgroundImage: `url(${customBgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
                  padding: '2.5rem 1.5rem 1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  height: 'auto',
                  minHeight: layoutStyle === 'grid' ? '620px' : '580px',
                  position: 'relative',
                  border: draggedOverPage === currentPage * 2 + 1 ? '2px dashed var(--theme-accent)' : 'none',
                  backgroundColor: draggedOverPage === currentPage * 2 + 1 ? 'rgba(226, 162, 39, 0.15)' : undefined,
                  boxShadow: draggedOverPage === currentPage * 2 + 1 ? '0 0 15px rgba(226, 162, 39, 0.3) inset' : undefined,
                  transition: 'all 0.2s'
                }}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => setDraggedOverPage(currentPage * 2 + 1)}
                onDragLeave={() => setDraggedOverPage(null)}
                onDrop={(e) => handleDropOnPage(e, currentPage * 2 + 1)}
              >
                <div className="page-num page-num-right">Pág. {currentPage * 2 + 2}</div>
                <div style={{ flexGrow: 1, position: 'relative', marginTop: '1rem', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  {layoutStyle === 'scrapbook' ? renderPage(currentPage * 2 + 1) : renderGridPage(currentPage * 2 + 1)}
                </div>
              </div>
            </div>
          </div>

          {/* Book Navigation controls */}
          <div className="flex justify-between items-center mt-6">
            <button 
              onClick={prevPage} 
              disabled={currentPage === 0}
              className="btn-secondary"
              style={{ padding: '10px 18px', fontSize: '13px' }}
            >
              <ChevronLeft size={16} /> Anterior
            </button>
            <span className="font-display font-semibold text-slate-500 text-sm">
              Páginas {currentPage * 2 + 1} - {currentPage * 2 + 2} de {totalPages * 2}
            </span>
            <button 
              onClick={nextPage} 
              disabled={currentPage >= totalPages - 1}
              className="btn-secondary"
              style={{ padding: '10px 18px', fontSize: '13px' }}
            >
              Siguiente <ChevronRight size={16} />
            </button>
          </div>

          {/* --- Unpasted Sticker Drawer --- */}
          <div className="glass-panel print-hidden" style={{ marginTop: '2.5rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', border: '2px dashed #b5ad96', background: '#faf8f2' }}>
            <h3 className="font-display font-black text-base text-slate-800 flex items-center gap-2" style={{ margin: 0 }}>
              <Sparkles size={16} className="text-amber-500" />
              Fotos por pegar ({unpastedStickers.length})
            </h3>
            
            {unpastedStickers.length === 0 ? (
              <div className="text-xs text-slate-500 italic py-4 text-center">
                No tienes fotos pendientes por pegar. ¡Abre más sobres en la pestaña "Abrir Sobres" para conseguir nuevas fotos!
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '10px', scrollbarWidth: 'thin' }}>
                {unpastedStickers.map(sticker => {
                  return (
                    <div 
                      key={sticker.id}
                      className={`glass-panel ${sticker.isRare ? 'rare-sticker-card' : ''}`}
                      style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        padding: '8px', 
                        minWidth: '110px', 
                        maxWidth: '110px', 
                        background: '#ffffff', 
                        boxShadow: 'var(--shadow-sm)',
                        borderRadius: '10px',
                        border: sticker.isRare ? undefined : '1.5px solid #e5dec9',
                        position: 'relative',
                        cursor: 'grab'
                      }}
                      draggable="true"
                      onDragStart={(e) => handleDragStartFromDrawer(e, sticker.id)}
                      onDragEnd={() => setDraggedOverPage(null)}
                      title="Arrastra esta foto y suéltala en el álbum para pegarla"
                    >
                      {/* Thumbnail Image */}
                      <div 
                        onClick={() => jumpToStickerPage(sticker.id)}
                        title="Hacer clic para ir a su página"
                        style={{ 
                          width: '90px', 
                          height: '90px', 
                          borderRadius: '6px', 
                          overflow: 'hidden', 
                          cursor: 'pointer',
                          border: '1px solid #eae4d3',
                          position: 'relative'
                        }}
                      >
                        <img 
                          src={sticker.image} 
                          alt={sticker.name} 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        <div style={{ position: 'absolute', top: '2px', left: '2px', background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '8px', fontWeight: 'bold', padding: '1px 4px', borderRadius: '3px' }}>
                          N° {sticker.id}
                        </div>
                      </div>
                      
                      {/* Name */}
                      <span 
                        style={{ 
                          fontSize: '8px', 
                          fontWeight: '700', 
                          color: '#6b6359', 
                          marginTop: '6px', 
                          whiteSpace: 'nowrap', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis',
                          width: '100%',
                          textAlign: 'center'
                        }}
                      >
                        {sticker.name}
                      </span>

                      {/* Locate Button */}
                      <button
                        onClick={() => jumpToStickerPage(sticker.id)}
                        className="btn-gold"
                        style={{ padding: '4px 8px', fontSize: '9px', borderRadius: '6px', width: '100%', marginTop: '6px', fontWeight: 'bold' }}
                      >
                        Ubicar
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* --- Developer Testing Tools --- */}
          <div className="flex justify-center gap-4 mt-8 print-hidden" style={{ opacity: 0.5, transition: 'opacity 0.2s' }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.5}>
            <button
              onClick={handleTestGetPack}
              className="btn-secondary"
              style={{ fontSize: '10px', padding: '6px 12px', borderRadius: '6px', border: '1.5px dashed #b5ad96' }}
            >
              🛠️ Testing: +1 Sobre
            </button>
            <button
              onClick={handleTestCompleteAlbum}
              className="btn-secondary"
              style={{ fontSize: '10px', padding: '6px 12px', borderRadius: '6px', border: '1.5px dashed #b5ad96' }}
            >
              🛠️ Testing: Completar Álbum
            </button>
            <button
              onClick={handleTestRestart}
              className="btn-secondary"
              style={{ fontSize: '10px', padding: '6px 12px', borderRadius: '6px', border: '1.5px dashed #dc2626', color: '#dc2626' }}
            >
              🛠️ Testing: Restablecer Álbum
            </button>
          </div>
        </>
      )}

      {/* Zoom Modal Overlay */}
      {zoomedSticker && (
        <div 
          onClick={closeZoom}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(5, 6, 11, 0.85)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
            animation: 'fadeIn 0.1s ease-out forwards'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="zoom-card-container"
            style={{ 
              width: '90vw', 
              maxWidth: zoomedSticker.splitType === 'horizontal-pair' || zoomedSticker.splitType === 'horizontal' 
                ? `${600 * zoomScale}px` 
                : zoomedSticker.splitType === 'vertical-pair' || zoomedSticker.splitType === 'vertical'
                  ? `${300 * zoomScale}px` 
                  : `${400 * zoomScale}px`,
              aspectRatio: zoomedSticker.splitType === 'horizontal-pair' || zoomedSticker.splitType === 'horizontal'
                ? '3/2' 
                : zoomedSticker.splitType === 'vertical-pair' || zoomedSticker.splitType === 'vertical'
                  ? '3/8' 
                  : '3/4',
              position: 'relative',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
              transform: 'scale(1)',
              animation: 'zoomIn 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              transition: 'max-width 0.2s ease-out'
            }}
          >
            {zoomedSticker.isPanorama ? (
              <div style={{
                display: zoomedSticker.splitType === 'quad' ? 'grid' : 'flex',
                gridTemplateColumns: zoomedSticker.splitType === 'quad' ? '1fr 1fr' : undefined,
                flexDirection: (zoomedSticker.splitType === 'vertical-pair' || zoomedSticker.splitType === 'vertical') ? 'column' : 'row',
                width: '100%',
                height: '100%'
              }}>
                {zoomedSticker.parts.map(part => (
                  <div key={part.id} style={{ flex: 1, height: zoomedSticker.splitType === 'quad' ? 'auto' : '100%' }}>
                    <PremiumCard 
                      image={part.image}
                      name={part.name}
                      isRare={part.isRare}
                      style={{ width: '100%', height: '100%', borderRadius: 0, border: 'none' }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <PremiumCard 
                image={zoomedSticker.image}
                name={zoomedSticker.name}
                isRare={zoomedSticker.isRare}
                style={{ width: '100%', height: '100%' }}
              />
            )}
            {/* Overlay Close Button */}
            <button 
              onClick={closeZoom}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'rgba(0,0,0,0.7)',
                border: '1.5px solid rgba(255,255,255,0.3)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 100,
                transition: 'all 0.2s',
                fontWeight: 'bold',
                fontSize: '14px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              ✕
            </button>
          </div>

          {/* Caption info below */}
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              color: '#ffffff', 
              textAlign: 'center', 
              marginTop: '1.5rem', 
              zIndex: 10,
              animation: 'zoomIn 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards'
            }}
          >
            {/* Size Control Buttons */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '1.25rem', alignItems: 'center' }}>
              <button 
                onClick={() => setZoomScale(s => Math.max(0.4, s - 0.1))} 
                className="btn-secondary" 
                style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '6px', cursor: 'pointer', background: 'rgba(255,255,255,0.1)', color: '#ffffff', border: '1.5px solid rgba(255,255,255,0.2)' }}
                title="Reducir tamaño de vista"
              >
                ➖ Achicar
              </button>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#ffffff', minWidth: '70px', display: 'inline-block' }}>
                Tamaño: {Math.round(zoomScale * 100)}%
              </span>
              <button 
                onClick={() => setZoomScale(s => Math.min(2.0, s + 0.1))} 
                className="btn-secondary" 
                style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '6px', cursor: 'pointer', background: 'rgba(255,255,255,0.1)', color: '#ffffff', border: '1.5px solid rgba(255,255,255,0.2)' }}
                title="Aumentar tamaño de vista"
              >
                ➕ Agrandar
              </button>
            </div>

            <h3 className="font-display font-black text-xl mb-1" style={{ color: '#ffffff' }}>
              {zoomedSticker.numbers.map(n => `N° ${String(n).padStart(3, '0')}`).join(', ')}
            </h3>
            <p className="text-slate-300 font-semibold text-sm">{zoomedSticker.name}</p>
          </div>
        </div>
      )}

      {/* Printable container for page-by-page printing */}
      <div className="print-only-album-container">
        {Array.from({ length: totalPages * 2 }).map((_, pageIdx) => (
          <div 
            key={pageIdx} 
            className={`print-page album-page bg-theme-${albumBg} ${layoutStyle === 'grid' ? 'layout-grid' : ''}`}
            style={{
              ...(albumBg === 'custom' && customBgImage ? { backgroundImage: `url(${customBgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
              padding: '2.5rem 1.5rem 1.5rem',
              display: 'flex',
              flexDirection: 'column',
              height: 'auto',
              minHeight: layoutStyle === 'grid' ? '620px' : '580px',
              position: 'relative',
              boxSizing: 'border-box'
            }}
          >
            <div className="page-num" style={{ position: 'absolute', top: '12px', left: pageIdx % 2 === 0 ? '16px' : 'auto', right: pageIdx % 2 === 1 ? '16px' : 'auto', fontSize: '12px', fontWeight: 'bold', color: 'rgba(0,0,0,0.5)' }}>
              Pág. {pageIdx + 1}
            </div>
            <div style={{ flexGrow: 1, position: 'relative', marginTop: '1rem', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {layoutStyle === 'scrapbook' ? renderPage(pageIdx) : renderGridPage(pageIdx)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
