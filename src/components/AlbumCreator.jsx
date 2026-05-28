import React, { useState } from 'react';
import { db, importAlbumDefinition, clearActiveAlbum, layoutStickers, ensureSplitStickersGrouped } from '../utils/db';
import { Upload, Download, Trash2, Award, Sparkles, BookOpen, AlertCircle, Scissors, ArrowUpDown, Split } from 'lucide-react';

export default function AlbumCreator({ onAlbumLoaded, activeAlbumName }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [stickers, setStickers] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Custom creator options
  const [autoSplit, setAutoSplit] = useState(true);
  const [autoSort, setAutoSort] = useState(false);
  const [autoName, setAutoName] = useState(false);
  const [stickersPerPage, setStickersPerPage] = useState(6);
  const [layoutStyle, setLayoutStyle] = useState('grid'); // 'grid' or 'scrapbook'
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedStickerId, setSelectedStickerId] = useState(null);

  const applyAutoSplitToCurrent = async () => {
    if (stickers.length === 0) return;
    setError('');
    
    try {
      const processed = await Promise.all(stickers.map(async (sticker) => {
        if (!sticker.parentId && !sticker.splitType) {
          const img = new Image();
          img.src = sticker.image;
          await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
          
          if (img.width && img.height) {
            const isHorizontal = img.width / img.height > 1.25;
            if (isHorizontal) {
              const originalName = sticker.name;
              const fileParentId = `${originalName}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
              
              // Draw Left Half
              const canvasL = document.createElement('canvas');
              canvasL.width = img.width / 2;
              canvasL.height = img.height;
              const ctxL = canvasL.getContext('2d');
              ctxL.drawImage(img, 0, 0, img.width / 2, img.height, 0, 0, img.width / 2, img.height);
              const imageL = canvasL.toDataURL('image/jpeg');

              // Draw Right Half
              const canvasR = document.createElement('canvas');
              canvasR.width = img.width / 2;
              canvasR.height = img.height;
              const ctxR = canvasR.getContext('2d');
              ctxR.drawImage(img, img.width / 2, 0, img.width / 2, img.height, 0, 0, img.width / 2, img.height);
              const imageR = canvasR.toDataURL('image/jpeg');

              return [
                {
                  id: Date.now() + Math.random(),
                  name: `${originalName} (Parte A)`,
                  image: imageL,
                  isRare: sticker.isRare,
                  group: sticker.group || 'General',
                  parentId: fileParentId,
                  splitType: 'horizontal',
                  splitPart: 'A',
                  aspectRatio: (img.width / 2) / img.height
                },
                {
                  id: Date.now() + Math.random() + 0.1,
                  name: `${originalName} (Parte B)`,
                  image: imageR,
                  isRare: sticker.isRare,
                  group: sticker.group || 'General',
                  parentId: fileParentId,
                  splitType: 'horizontal',
                  splitPart: 'B',
                  aspectRatio: (img.width / 2) / img.height
                }
              ];
            }
          }
        }
        return [sticker];
      }));

      const flattened = processed.flat();
      setStickers(layoutStickers(flattened, stickersPerPage));
      setSuccess('Auto-división completada para las figuritas actuales.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      console.error(e);
      setError('Ocurrió un error al intentar auto-dividir las figuritas.');
    }
  };

  const applyAutoSortToCurrent = () => {
    if (stickers.length === 0) return;
    const sorted = [...stickers].sort((a, b) => {
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    setStickers(layoutStickers(sorted, stickersPerPage));
    setSuccess('Ordenamiento alfabético aplicado a las figuritas actuales.');
    setTimeout(() => setSuccess(''), 3000);
  };

  const applyAutoNameToCurrent = () => {
    if (stickers.length === 0) return;
    let idx = 1;
    const renamed = [];
    const parentIdToName = {};

    for (let i = 0; i < stickers.length; i++) {
      const s = stickers[i];
      if (s.parentId) {
        if (!parentIdToName[s.parentId]) {
          parentIdToName[s.parentId] = `Figurita ${idx}`;
          idx++;
        }
        renamed.push({
          ...s,
          name: `${parentIdToName[s.parentId]} (Parte ${s.splitPart})`
        });
      } else {
        renamed.push({
          ...s,
          name: `Figurita ${idx}`
        });
        idx++;
      }
    }
    setStickers(renamed);
    setSuccess('Renombrado secuencial aplicado a las figuritas actuales.');
    setTimeout(() => setSuccess(''), 3000);
  };

  // Handle image uploads
  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    processFiles(files);
  };

  const processFiles = (files) => {
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) {
      setError('Por favor, selecciona archivos de imagen válidos.');
      return;
    }

    setError('');
    const tempStickersList = [];
    let processedCount = 0;

    imageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Data = event.target.result;
        
        // Load image to measure dimensions and process splits
        const img = new Image();
        img.src = base64Data;
        img.onload = () => {
          const originalName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
          const isHorizontal = img.width / img.height > 1.25;
          const isVertical = img.height / img.width > 1.25;

          // Only auto-split if enabled by user
          const fileParentId = `${originalName}-${file.size}-${Date.now()}`;
          if (autoSplit && isHorizontal) {
            // Draw Left Half
            const canvasL = document.createElement('canvas');
            canvasL.width = img.width / 2;
            canvasL.height = img.height;
            const ctxL = canvasL.getContext('2d');
            ctxL.drawImage(img, 0, 0, img.width / 2, img.height, 0, 0, img.width / 2, img.height);
            const imageL = canvasL.toDataURL(file.type || 'image/jpeg');

            // Draw Right Half
            const canvasR = document.createElement('canvas');
            canvasR.width = img.width / 2;
            canvasR.height = img.height;
            const ctxR = canvasR.getContext('2d');
            ctxR.drawImage(img, img.width / 2, 0, img.width / 2, img.height, 0, 0, img.width / 2, img.height);
            const imageR = canvasR.toDataURL(file.type || 'image/jpeg');

            tempStickersList.push(
              {
                id: Date.now() + Math.random(),
                name: `${originalName} (Parte A)`,
                image: imageL,
                isRare: false,
                group: 'General',
                parentId: fileParentId,
                splitType: 'horizontal',
                splitPart: 'A',
                aspectRatio: (img.width / 2) / img.height
              },
              {
                id: Date.now() + Math.random() + 0.1,
                name: `${originalName} (Parte B)`,
                image: imageR,
                isRare: false,
                group: 'General',
                parentId: fileParentId,
                splitType: 'horizontal',
                splitPart: 'B',
                aspectRatio: (img.width / 2) / img.height
              }
            );
          } else {
            // Keep single (no auto-splitting for vertical images by default)
            tempStickersList.push({
              id: Date.now() + Math.random(),
              name: originalName,
              image: base64Data,
              isRare: false,
              group: 'General',
              aspectRatio: img.width / img.height
            });
          }

          processedCount++;
          if (processedCount === imageFiles.length) {
            setStickers((prev) => {
              const updatedPrev = [...prev, ...tempStickersList];
              return layoutStickers(updatedPrev, stickersPerPage);
            });
          }
        };
      };
      reader.readAsDataURL(file);
    });
  };

  // Manual splitting of a specific sticker horizontally (Left/Right)
  const handleManualSplitHorizontal = (id) => {
    const stickerToSplit = stickers.find(s => s.id === id);
    if (!stickerToSplit) return;

    const img = new Image();
    img.src = stickerToSplit.image;
    img.onload = () => {
      const manualParentId = stickerToSplit.parentId || `${stickerToSplit.name}-${Date.now()}`;
      
      const canvasL = document.createElement('canvas');
      canvasL.width = img.width / 2;
      canvasL.height = img.height;
      const ctxL = canvasL.getContext('2d');
      ctxL.drawImage(img, 0, 0, img.width / 2, img.height, 0, 0, img.width / 2, img.height);
      const imageL = canvasL.toDataURL('image/jpeg');

      const canvasR = document.createElement('canvas');
      canvasR.width = img.width / 2;
      canvasR.height = img.height;
      const ctxR = canvasR.getContext('2d');
      ctxR.drawImage(img, img.width / 2, 0, img.width / 2, img.height, 0, 0, img.width / 2, img.height);
      const imageR = canvasR.toDataURL('image/jpeg');

      const splitA = {
        id: Date.now() + Math.random(),
        name: `${stickerToSplit.name} (Parte A)`,
        image: imageL,
        isRare: stickerToSplit.isRare,
        group: stickerToSplit.group,
        parentId: manualParentId,
        splitType: 'horizontal',
        splitPart: 'A',
        page: stickerToSplit.page,
        x: stickerToSplit.x,
        y: stickerToSplit.y,
        width: stickerToSplit.width,
        rotation: stickerToSplit.rotation,
        aspectRatio: (img.width / 2) / img.height
      };

      const splitB = {
        id: Date.now() + Math.random() + 0.1,
        name: `${stickerToSplit.name} (Parte B)`,
        image: imageR,
        isRare: stickerToSplit.isRare,
        group: stickerToSplit.group,
        parentId: manualParentId,
        splitType: 'horizontal',
        splitPart: 'B',
        page: stickerToSplit.page,
        x: stickerToSplit.x,
        y: stickerToSplit.y,
        width: stickerToSplit.width,
        rotation: stickerToSplit.rotation,
        aspectRatio: (img.width / 2) / img.height
      };

      setStickers(prev => {
        const index = prev.findIndex(s => s.id === id);
        if (index === -1) return prev;
        const next = [...prev];
        next.splice(index, 1, splitA, splitB);
        return next;
      });
    };
  };

  // Manual splitting of a specific sticker vertically (Top/Bottom)
  const handleManualSplitVertical = (id) => {
    const stickerToSplit = stickers.find(s => s.id === id);
    if (!stickerToSplit) return;

    const img = new Image();
    img.src = stickerToSplit.image;
    img.onload = () => {
      const manualParentId = stickerToSplit.parentId || `${stickerToSplit.name}-${Date.now()}`;
      
      const canvasT = document.createElement('canvas');
      canvasT.width = img.width;
      canvasT.height = img.height / 2;
      const ctxT = canvasT.getContext('2d');
      ctxT.drawImage(img, 0, 0, img.width, img.height / 2, 0, 0, img.width, img.height / 2);
      const imageT = canvasT.toDataURL('image/jpeg');

      const canvasB = document.createElement('canvas');
      canvasB.width = img.width;
      canvasB.height = img.height / 2;
      const ctxB = canvasB.getContext('2d');
      ctxB.drawImage(img, 0, img.height / 2, img.width, img.height / 2, 0, 0, img.width, img.height / 2);
      const imageB = canvasB.toDataURL('image/jpeg');

      const splitT = {
        id: Date.now() + Math.random(),
        name: `${stickerToSplit.name} (Parte Superior)`,
        image: imageT,
        isRare: stickerToSplit.isRare,
        group: stickerToSplit.group,
        parentId: manualParentId,
        splitType: 'vertical',
        splitPart: 'A',
        page: stickerToSplit.page,
        x: stickerToSplit.x,
        y: stickerToSplit.y,
        width: stickerToSplit.width,
        rotation: stickerToSplit.rotation,
        aspectRatio: img.width / (img.height / 2)
      };

      const splitB = {
        id: Date.now() + Math.random() + 0.1,
        name: `${stickerToSplit.name} (Parte Inferior)`,
        image: imageB,
        isRare: stickerToSplit.isRare,
        group: stickerToSplit.group,
        parentId: manualParentId,
        splitType: 'vertical',
        splitPart: 'B',
        page: stickerToSplit.page,
        x: stickerToSplit.x,
        y: stickerToSplit.y,
        width: stickerToSplit.width,
        rotation: stickerToSplit.rotation,
        aspectRatio: img.width / (img.height / 2)
      };

      setStickers(prev => {
        const index = prev.findIndex(s => s.id === id);
        if (index === -1) return prev;
        const next = [...prev];
        next.splice(index, 1, splitT, splitB);
        return next;
      });
    };
  };

  // Manual splitting of a specific sticker into 4 parts (2x2 grid)
  const handleManualSplitQuad = (id) => {
    const stickerToSplit = stickers.find(s => s.id === id);
    if (!stickerToSplit) return;

    const img = new Image();
    img.src = stickerToSplit.image;
    img.onload = () => {
      const manualParentId = stickerToSplit.parentId || `${stickerToSplit.name}-${Date.now()}`;
      
      const halfW = img.width / 2;
      const halfH = img.height / 2;

      // Part A: Top-Left
      const canvasA = document.createElement('canvas');
      canvasA.width = halfW;
      canvasA.height = halfH;
      const ctxA = canvasA.getContext('2d');
      ctxA.drawImage(img, 0, 0, halfW, halfH, 0, 0, halfW, halfH);
      const imageA = canvasA.toDataURL('image/jpeg');

      // Part B: Top-Right
      const canvasB = document.createElement('canvas');
      canvasB.width = halfW;
      canvasB.height = halfH;
      const ctxB = canvasB.getContext('2d');
      ctxB.drawImage(img, halfW, 0, halfW, halfH, 0, 0, halfW, halfH);
      const imageB = canvasB.toDataURL('image/jpeg');

      // Part C: Bottom-Left
      const canvasC = document.createElement('canvas');
      canvasC.width = halfW;
      canvasC.height = halfH;
      const ctxC = canvasC.getContext('2d');
      ctxC.drawImage(img, 0, halfH, halfW, halfH, 0, 0, halfW, halfH);
      const imageC = canvasC.toDataURL('image/jpeg');

      // Part D: Bottom-Right
      const canvasD = document.createElement('canvas');
      canvasD.width = halfW;
      canvasD.height = halfH;
      const ctxD = canvasD.getContext('2d');
      ctxD.drawImage(img, halfW, halfH, halfW, halfH, 0, 0, halfW, halfH);
      const imageD = canvasD.toDataURL('image/jpeg');

      const splitA = {
        id: Date.now() + Math.random(),
        name: `${stickerToSplit.name} (Parte A)`,
        image: imageA,
        isRare: stickerToSplit.isRare,
        group: stickerToSplit.group,
        parentId: manualParentId,
        splitType: 'quad',
        splitPart: 'A',
        page: stickerToSplit.page,
        x: stickerToSplit.x,
        y: stickerToSplit.y,
        width: stickerToSplit.width,
        rotation: stickerToSplit.rotation,
        aspectRatio: img.width / img.height
      };

      const splitB = {
        id: Date.now() + Math.random() + 0.1,
        name: `${stickerToSplit.name} (Parte B)`,
        image: imageB,
        isRare: stickerToSplit.isRare,
        group: stickerToSplit.group,
        parentId: manualParentId,
        splitType: 'quad',
        splitPart: 'B',
        page: stickerToSplit.page,
        x: stickerToSplit.x,
        y: stickerToSplit.y,
        width: stickerToSplit.width,
        rotation: stickerToSplit.rotation,
        aspectRatio: img.width / img.height
      };

      const splitC = {
        id: Date.now() + Math.random() + 0.2,
        name: `${stickerToSplit.name} (Parte C)`,
        image: imageC,
        isRare: stickerToSplit.isRare,
        group: stickerToSplit.group,
        parentId: manualParentId,
        splitType: 'quad',
        splitPart: 'C',
        page: stickerToSplit.page,
        x: stickerToSplit.x,
        y: stickerToSplit.y,
        width: stickerToSplit.width,
        rotation: stickerToSplit.rotation,
        aspectRatio: img.width / img.height
      };

      const splitD = {
        id: Date.now() + Math.random() + 0.3,
        name: `${stickerToSplit.name} (Parte D)`,
        image: imageD,
        isRare: stickerToSplit.isRare,
        group: stickerToSplit.group,
        parentId: manualParentId,
        splitType: 'quad',
        splitPart: 'D',
        page: stickerToSplit.page,
        x: stickerToSplit.x,
        y: stickerToSplit.y,
        width: stickerToSplit.width,
        rotation: stickerToSplit.rotation,
        aspectRatio: img.width / img.height
      };

      setStickers(prev => {
        const index = prev.findIndex(s => s.id === id);
        if (index === -1) return prev;
        const next = [...prev];
        next.splice(index, 1, splitA, splitB, splitC, splitD);
        return next;
      });
    };
  };

  // Revert division of a split sticker (stitch parts back together using canvas)
  const handleRevertSplit = (parentId) => {
    const parts = stickers.filter(s => s.parentId === parentId);
    if (parts.length === 0) return;

    // Sort parts by splitPart ('A', 'B', 'C', 'D')
    parts.sort((a, b) => String(a.splitPart || '').localeCompare(String(b.splitPart || '')));

    const firstPart = parts[0];
    const splitType = firstPart.splitType;

    // Create image elements for all parts
    const imgPromises = parts.map(part => {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = part.image;
        img.onload = () => resolve({ img, part });
      });
    });

    Promise.all(imgPromises).then(loadedParts => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (splitType === 'horizontal') {
        if (loadedParts.length < 2) return;
        const [{ img: imgA }, { img: imgB }] = loadedParts;
        canvas.width = imgA.width + imgB.width;
        canvas.height = Math.max(imgA.height, imgB.height);
        ctx.drawImage(imgA, 0, 0);
        ctx.drawImage(imgB, imgA.width, 0);
      } else if (splitType === 'vertical') {
        if (loadedParts.length < 2) return;
        const [{ img: imgT }, { img: imgB }] = loadedParts;
        canvas.width = Math.max(imgT.width, imgB.width);
        canvas.height = imgT.height + imgB.height;
        ctx.drawImage(imgT, 0, 0);
        ctx.drawImage(imgB, 0, imgT.height);
      } else if (splitType === 'quad') {
        if (loadedParts.length < 4) return;
        const partA = loadedParts.find(p => p.part.splitPart === 'A');
        const partB = loadedParts.find(p => p.part.splitPart === 'B');
        const partC = loadedParts.find(p => p.part.splitPart === 'C');
        const partD = loadedParts.find(p => p.part.splitPart === 'D');
        if (!partA || !partB || !partC || !partD) return;

        const imgA = partA.img;
        const imgB = partB.img;
        const imgC = partC.img;
        const imgD = partD.img;

        const topW = imgA.width + imgB.width;
        const bottomW = imgC.width + imgD.width;
        canvas.width = Math.max(topW, bottomW);
        canvas.height = Math.max(imgA.height, imgC.height) + Math.max(imgB.height, imgD.height);

        ctx.drawImage(imgA, 0, 0);
        ctx.drawImage(imgB, imgA.width, 0);
        ctx.drawImage(imgC, 0, imgA.height);
        ctx.drawImage(imgD, imgC.width, imgB.height);
      } else {
        return; // Unknown split type
      }

      const mergedImage = canvas.toDataURL('image/jpeg');
      const cleanName = firstPart.name
        .replace(/\s*\(Parte\s+A\)/i, '')
        .replace(/\s*\(Parte\s+B\)/i, '')
        .replace(/\s*\(Parte\s+C\)/i, '')
        .replace(/\s*\(Parte\s+D\)/i, '')
        .replace(/\s*\(Parte\s+Superior\)/i, '')
        .replace(/\s*\(Parte\s+Inferior\)/i, '')
        .trim();

      const mergedSticker = {
        id: Date.now() + Math.random(),
        name: cleanName,
        image: mergedImage,
        isRare: firstPart.isRare,
        group: firstPart.group,
        page: firstPart.page,
        x: firstPart.x,
        y: firstPart.y,
        width: firstPart.width,
        rotation: firstPart.rotation
      };

      setStickers(prev => {
        // Remove all parts and insert the single merged sticker at the index of the first part
        const firstIndex = prev.findIndex(s => s.parentId === parentId);
        if (firstIndex === -1) return prev;
        
        const next = prev.filter(s => s.parentId !== parentId);
        next.splice(firstIndex, 0, mergedSticker);
        return next;
      });
    });
  };

  // Drag and drop events
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Edit sticker details
  const updateSticker = (id, key, value) => {
    setStickers(prev => prev.map(s => s.id === id ? { ...s, [key]: value } : s));
  };

  // Edit sticker position properties (synchronized for split groups)
  const updateStickerPosition = (id, fields) => {
    setStickers(prev => {
      const target = prev.find(s => s.id === id);
      if (!target) return prev;
      
      const idsToUpdate = target.parentId 
        ? prev.filter(s => s.parentId === target.parentId).map(s => s.id)
        : [id];
        
      return prev.map(s => idsToUpdate.includes(s.id) ? { ...s, ...fields } : s);
    });
  };

  // Delete a sticker from list
  const deleteSticker = (id) => {
    setStickers(prev => prev.filter(s => s.id !== id));
  };

  // Move sticker or split group up or down in the list by swapping groups
  const moveSticker = (id, direction) => {
    const target = stickers.find(s => s.id === id);
    if (!target) return;
    
    // Group consecutive stickers by parentId
    const groups = [];
    let currentGroup = [];
    stickers.forEach(s => {
      if (s.parentId) {
        if (currentGroup.length > 0 && currentGroup[0].parentId === s.parentId) {
          currentGroup.push(s);
        } else {
          if (currentGroup.length > 0) groups.push(currentGroup);
          currentGroup = [s];
        }
      } else {
        if (currentGroup.length > 0) groups.push(currentGroup);
        groups.push([s]);
        currentGroup = [];
      }
    });
    if (currentGroup.length > 0) groups.push(currentGroup);

    // Find the index of the group containing this sticker
    const targetGroupIdx = groups.findIndex(g => g.some(s => s.id === id));
    if (targetGroupIdx === -1) return;

    if (direction === 'up' && targetGroupIdx > 0) {
      // Swap with the group above
      const temp = groups[targetGroupIdx];
      groups[targetGroupIdx] = groups[targetGroupIdx - 1];
      groups[targetGroupIdx - 1] = temp;
    } else if (direction === 'down' && targetGroupIdx < groups.length - 1) {
      // Swap with the group below
      const temp = groups[targetGroupIdx];
      groups[targetGroupIdx] = groups[targetGroupIdx + 1];
      groups[targetGroupIdx + 1] = temp;
    } else {
      return;
    }

    setStickers(groups.flat());
  };

  // Import JSON Album Package
  const handleImportJson = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const albumData = JSON.parse(event.target.result);
        if (!albumData.name || !albumData.stickers || !Array.isArray(albumData.stickers)) {
          throw new Error('Formato de álbum no válido. Falta el nombre o la lista de figuritas.');
        }

        const count = await importAlbumDefinition(albumData);
        setSuccess(`¡Álbum "${albumData.name}" importado con éxito! ${count} figuritas cargadas.`);
        onAlbumLoaded();
      } catch (err) {
        setError('Error al leer el archivo JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  // Generate displayed sorted stickers list
  const getProcessedStickers = (styleOverride = null) => {
    const activeStyle = styleOverride !== null ? styleOverride : layoutStyle;
    let list = stickers;
    if (autoSort) {
      list = [...stickers].sort((a, b) => {
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
    }
    const grouped = ensureSplitStickersGrouped(list);
    
    // Fill coordinates for scrapbook mode if missing
    if (activeStyle === 'scrapbook') {
      const layouted = layoutStickers(grouped, stickersPerPage);
      return grouped.map(s => {
        const l = layouted.find(x => x.id === s.id);
        return {
          ...s,
          page: s.page !== undefined && s.page !== null ? s.page : (l ? l.page : 0),
          x: s.x !== undefined && s.x !== null ? s.x : (l ? l.x : 10),
          y: s.y !== undefined && s.y !== null ? s.y : (l ? l.y : 10),
          width: s.width !== undefined && s.width !== null ? s.width : (l ? l.width : 24),
          rotation: s.rotation !== undefined && s.rotation !== null ? s.rotation : (l ? l.rotation : 0)
        };
      });
    }
    return grouped;
  };

  // Create album (save locally and/or export)
  const handleCreateAlbum = async (shouldExport = false, nameOverride = null, layoutStyleOverride = null, autoNameOverride = null) => {
    const finalName = nameOverride !== null ? nameOverride.trim() : name.trim();
    const finalLayoutStyle = layoutStyleOverride !== null ? layoutStyleOverride : layoutStyle;
    const finalAutoName = autoNameOverride !== null ? autoNameOverride : autoName;

    if (!finalName) {
      setError('Por favor, ingresa un nombre para el álbum.');
      return;
    }
    if (stickers.length === 0) {
      setError('Debes añadir al menos una figurita.');
      return;
    }

    setError('');
    
    // Use the processed (sorted) list to save/export if autoSort is active
    let finalStickersList = getProcessedStickers(finalLayoutStyle);

    // Auto-name stickers sequentially if requested
    if (finalAutoName) {
      let stickerIndex = 1;
      const renamedList = [];
      for (let i = 0; i < finalStickersList.length; i++) {
        const s = finalStickersList[i];
        const next1 = finalStickersList[i + 1];
        const next2 = finalStickersList[i + 2];
        const next3 = finalStickersList[i + 3];
        
        // Check if current and next 3 form a split quad (same parentId and splitType is quad)
        if (s.parentId && s.splitType === 'quad' && 
            next1 && next1.parentId === s.parentId &&
            next2 && next2.parentId === s.parentId &&
            next3 && next3.parentId === s.parentId) {
          const num = stickerIndex++;
          renamedList.push(
            { ...s, name: `Figurita ${num} (Parte A)` },
            { ...next1, name: `Figurita ${num} (Parte B)` },
            { ...next2, name: `Figurita ${num} (Parte C)` },
            { ...next3, name: `Figurita ${num} (Parte D)` }
          );
          i += 3; // Skip next 3 since we processed them together
        }
        // Check if current and next form a split pair (same parentId)
        else if (s.parentId && next1 && s.parentId === next1.parentId) {
          const num = stickerIndex++;
          const suffixA = s.splitPart === 'A' ? (s.splitType === 'vertical' ? ' (Parte Superior)' : ' (Parte A)') : (s.splitType === 'vertical' ? ' (Parte Inferior)' : ' (Parte B)');
          const suffixB = next1.splitPart === 'A' ? (next1.splitType === 'vertical' ? ' (Parte Superior)' : ' (Parte A)') : (next1.splitType === 'vertical' ? ' (Parte Inferior)' : ' (Parte B)');
          
          renamedList.push({
            ...s,
            name: `Figurita ${num}${suffixA}`
          });
          renamedList.push({
            ...next1,
            name: `Figurita ${num}${suffixB}`
          });
          i++; // Skip next since we processed it together
        } else {
          const num = stickerIndex++;
          renamedList.push({
            ...s,
            name: `Figurita ${num}`
          });
        }
      }
      finalStickersList = renamedList;
    }

    const albumData = {
      name: finalName,
      description,
      stickersPerPage: Number(stickersPerPage),
      layoutStyle: finalLayoutStyle,
      stickers: finalStickersList.map(s => ({
        name: s.name,
        image: s.image,
        isRare: s.isRare,
        group: s.group,
        parentId: s.parentId || null,
        splitType: s.splitType || null,
        splitPart: s.splitPart || null,
        page: s.page,
        x: s.x,
        y: s.y,
        width: s.width,
        rotation: s.rotation
      }))
    };

    try {
      // 1. Save to local IndexedDB
      const count = await importAlbumDefinition(albumData);
      
      // 2. Export JSON if requested
      if (shouldExport) {
        const jsonStr = JSON.stringify(albumData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const downloadAnchor = document.createElement('a');
        downloadAnchor.href = url;
        downloadAnchor.download = `${finalName.toLowerCase().replace(/\s+/g, '-')}-album.json`;
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        document.body.removeChild(downloadAnchor);
        URL.revokeObjectURL(url);
      }

      setSuccess(`¡Álbum "${finalName}" creado con éxito con ${count} figuritas!`);
      // Reset creator form
      setName('');
      setDescription('');
      setStickers([]);
      onAlbumLoaded();
    } catch (err) {
      setError('Error al guardar el álbum: ' + err.message);
    }
  };

  // Quick creation helper
  const handleQuickCreateAlbum = () => {
    if (stickers.length === 0) {
      setError('Debes añadir al menos una figurita primero.');
      return;
    }
    const albumName = name.trim() || `Álbum Rápido (${new Date().toLocaleDateString()})`;
    handleCreateAlbum(false, albumName, 'grid', true);
  };

  // Reset/Clear active album database
  const handleResetActiveAlbum = async () => {
    if (window.confirm('¿Estás seguro de que quieres borrar el álbum actual? Esto eliminará todo tu progreso de colección y figuritas.')) {
      await clearActiveAlbum();
      onAlbumLoaded();
      setSuccess('Se ha limpiado el progreso y álbum de figuritas.');
    }
  };

  const displayedStickers = getProcessedStickers();

  const renderCreatorDoublePage = () => {
    const list = getProcessedStickers();
    const withLayout = layoutStyle === 'grid' ? layoutStickers(list, stickersPerPage) : list;
    
    // Filter stickers for left page (currentPage * 2) and right page (currentPage * 2 + 1)
    const leftPageStickers = withLayout.filter(s => s.page === currentPage * 2);
    const rightPageStickers = withLayout.filter(s => s.page === currentPage * 2 + 1);
    
    const totalPagesCount = Math.max(2, Math.ceil(withLayout.length / stickersPerPage) * 2);
    
    // Helper to group stickers on a page for rendering pairs/quads unified
    const getPageGroups = (pageStickers) => {
      const groups = [];
      const processedParentIds = new Set();
      
      pageStickers.forEach(s => {
        if (s.parentId) {
          if (!processedParentIds.has(s.parentId)) {
            processedParentIds.add(s.parentId);
            const parts = pageStickers.filter(x => x.parentId === s.parentId);
            parts.sort((a, b) => String(a.splitPart || '').localeCompare(String(b.splitPart || '')));
            
            const first = parts[0];
            groups.push({
              type: first.splitType === 'horizontal' ? 'horizontal-pair' : first.splitType === 'vertical' ? 'vertical-pair' : 'quad',
              stickers: parts,
              parentId: s.parentId,
              x: first.x !== undefined ? first.x : 10,
              y: first.y !== undefined ? first.y : 10,
              width: first.width !== undefined ? first.width : 24,
              rotation: first.rotation !== undefined ? first.rotation : 0,
              page: first.page !== undefined ? first.page : 0
            });
          }
        } else {
          groups.push({
            type: 'single',
            sticker: s,
            id: s.id,
            x: s.x !== undefined ? s.x : 10,
            y: s.y !== undefined ? s.y : 10,
            width: s.width !== undefined ? s.width : 24,
            rotation: s.rotation !== undefined ? s.rotation : 0,
            page: s.page !== undefined ? s.page : 0
          });
        }
      });
      return groups;
    };
    
    const leftGroups = getPageGroups(leftPageStickers);
    const rightGroups = getPageGroups(rightPageStickers);
    
    const renderPagePreview = (pageIndex, pageGroups) => {
      return (
        <div 
          className="album-page"
          style={{
            position: 'relative',
            flex: 1,
            minHeight: '400px',
            height: '400px',
            overflow: 'hidden',
            border: selectedStickerId ? '1px dashed rgba(139, 126, 116, 0.2)' : 'none',
            userSelect: 'none'
          }}
          onDragOver={e => e.preventDefault()}
        >
          <div className="page-num" style={{ top: '8px', left: pageIndex % 2 === 0 ? '12px' : 'auto', right: pageIndex % 2 !== 0 ? '12px' : 'auto' }}>
            Pág. {pageIndex + 1}
          </div>
          
          <div style={{ position: 'relative', width: '100%', height: '100%', marginTop: '1.5rem' }}>
            {pageGroups.map(group => {
              const isSelected = selectedStickerId && (
                group.type === 'single'
                  ? selectedStickerId === group.sticker.id
                  : group.stickers.some(s => s.id === selectedStickerId)
              );
              
              let aspect = 0.75;
              if (group.type === 'horizontal-pair') {
                const [s1, s2] = group.stickers;
                aspect = (s1.aspectRatio || 0.75) + (s2.aspectRatio || 0.75);
              } else if (group.type === 'vertical-pair') {
                const [s1, s2] = group.stickers;
                aspect = 1 / (1/(s1.aspectRatio || 0.75) + 1/(s2.aspectRatio || 0.75));
              } else if (group.type === 'quad') {
                const [s1] = group.stickers;
                aspect = s1.aspectRatio || 0.75;
              } else {
                aspect = group.sticker.aspectRatio || 0.75;
              }
              
              const handlePageMouseDown = (e) => {
                if (layoutStyle !== 'scrapbook') return;
                e.preventDefault();
                e.stopPropagation();
                
                const stickerId = group.type === 'single' ? group.sticker.id : group.stickers[0].id;
                setSelectedStickerId(stickerId);
                
                const pageElement = e.currentTarget.offsetParent;
                if (!pageElement) return;
                const rect = pageElement.getBoundingClientRect();
                
                const startX = e.clientX;
                const startY = e.clientY;
                const startXPercent = group.x;
                const startYPercent = group.y;
                
                const handlePageMouseMove = (moveEvent) => {
                  const deltaX = moveEvent.clientX - startX;
                  const deltaY = moveEvent.clientY - startY;
                  
                  const pctDeltaX = (deltaX / rect.width) * 100;
                  const pctDeltaY = (deltaY / rect.height) * 100;
                  
                  let newX = Number((startXPercent + pctDeltaX).toFixed(1));
                  let newY = Number((startYPercent + pctDeltaY).toFixed(1));
                  
                  newX = Math.max(0, Math.min(100 - group.width, newX));
                  newY = Math.max(0, Math.min(90, newY));
                  
                  updateStickerPosition(stickerId, { x: newX, y: newY });
                };
                
                const handlePageMouseUp = () => {
                  window.removeEventListener('mousemove', handlePageMouseMove);
                  window.removeEventListener('mouseup', handlePageMouseUp);
                };
                
                window.addEventListener('mousemove', handlePageMouseMove);
                window.addEventListener('mouseup', handlePageMouseUp);
              };
              
              return (
                <div
                  key={group.parentId || (group.sticker ? group.sticker.id : group.id)}
                  style={{
                    position: 'absolute',
                    left: `${group.x}%`,
                    top: `${group.y}%`,
                    width: `${group.width}%`,
                    aspectRatio: aspect,
                    transform: `translate(-50%, -50%) rotate(${group.rotation || 0}deg)`,
                    transformOrigin: 'center center',
                    zIndex: isSelected ? 100 : 10,
                    cursor: layoutStyle === 'scrapbook' ? 'move' : 'default',
                    borderRadius: '6px',
                    border: isSelected ? '2px solid var(--theme-accent)' : '1px dashed rgba(139, 126, 116, 0.4)',
                    boxShadow: isSelected ? '0 0 0 4px rgba(226, 162, 39, 0.2)' : 'none',
                    padding: '2px',
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                  }}
                  onMouseDown={handlePageMouseDown}
                >
                  <div style={{ display: 'flex', width: '100%', height: '100%', gap: '0px', overflow: 'hidden', flexGrow: 1 }}>
                    {group.type === 'single' && (
                      <img src={group.sticker.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    )}
                    {(group.type === 'horizontal-pair' || group.type === 'vertical-pair') && (
                      <div style={{ display: 'flex', flexDirection: group.type === 'horizontal-pair' ? 'row' : 'column', width: '100%', height: '100%' }}>
                        <img src={group.stickers[0].image} alt="" style={{ flex: 1, width: '100%', height: '100%', objectFit: 'fill' }} />
                        <img src={group.stickers[1].image} alt="" style={{ flex: 1, width: '100%', height: '100%', objectFit: 'fill' }} />
                      </div>
                    )}
                    {group.type === 'quad' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', width: '100%', height: '100%' }}>
                        <img src={group.stickers[0].image} alt="" style={{ width: '100%', height: '100%', objectFit: 'fill' }} />
                        {group.stickers[1] && <img src={group.stickers[1].image} alt="" style={{ width: '100%', height: '100%', objectFit: 'fill' }} />}
                        {group.stickers[2] && <img src={group.stickers[2].image} alt="" style={{ width: '100%', height: '100%', objectFit: 'fill' }} />}
                        {group.stickers[3] && <img src={group.stickers[3].image} alt="" style={{ width: '100%', height: '100%', objectFit: 'fill' }} />}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '8px', textAlign: 'center', color: 'var(--text-muted)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginTop: '2px', padding: '0 2px' }}>
                    {group.type === 'single' ? `Figu ${group.sticker.name.split(' ')[1] || group.sticker.id}` : `Figu ${group.stickers[0].name.split(' ')[1] || group.stickers[0].id}`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    };

    return (
      <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <h4 className="text-xs font-semibold text-slate-400 mb-2 flex justify-between items-center">
          <span>Vista Previa del Libro ({layoutStyle === 'grid' ? 'Cuadrícula Automática' : 'Scrapbook Libre'})</span>
          {layoutStyle === 'scrapbook' && (
            <span style={{ fontSize: '10px', color: 'var(--theme-accent)', fontWeight: 'bold' }}>
              💡 ¡Arrastra las figuritas en las páginas para posicionarlas!
            </span>
          )}
        </h4>
        
        <div className="album-book" style={{ boxShadow: 'var(--shadow-md)', borderRadius: '12px', overflow: 'hidden' }}>
          <div className="album-double-page" style={{ minHeight: '400px' }}>
            <div className="book-binding-crease" style={{ backgroundSize: '100% 20px' }} />
            
            {renderPagePreview(currentPage * 2, leftGroups)}
            {renderPagePreview(currentPage * 2 + 1, rightGroups)}
          </div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
          <button
            type="button"
            className="btn-secondary"
            disabled={currentPage === 0}
            onClick={() => setCurrentPage(prev => prev - 1)}
            style={{ padding: '4px 10px', fontSize: '11px' }}
          >
            ◀ Pág. Ant.
          </button>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)' }}>
            Páginas {currentPage * 2 + 1} - {currentPage * 2 + 2} de {totalPagesCount}
          </span>
          <button
            type="button"
            className="btn-secondary"
            disabled={(currentPage + 1) * 2 >= totalPagesCount}
            onClick={() => setCurrentPage(prev => prev + 1)}
            style={{ padding: '4px 10px', fontSize: '11px' }}
          >
            Pág. Sig. ▶
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="creator-grid">
      {/* Import / Load Existing Section */}
      <div className="glass-panel p-6 flex flex-col justify-between">
        <div>
          <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
            <BookOpen className="text-purple-400" />
            Cargar Álbum Existente
          </h2>
          <p className="text-slate-400 mb-6 text-sm">
            Si un amigo creó un álbum y te compartió el archivo `.json`, puedes cargarlo aquí para empezar a coleccionar las mismas figuritas y poder intercambiarlas.
          </p>
          
          <div className="drop-zone">
            <input 
              type="file" 
              accept=".json" 
              onChange={handleImportJson} 
              id="import-json-upload" 
              style={{ display: 'none' }} 
            />
            <label htmlFor="import-json-upload" style={{ cursor: 'pointer' }} className="flex flex-col items-center gap-3">
              <div className="welcome-icon-box" style={{ width: '60px', height: '60px', borderRadius: '16px', marginBottom: 0 }}>
                <Upload size={24} />
              </div>
              <span className="font-semibold text-white">Subir archivo de álbum (.json)</span>
              <span className="text-xs text-slate-500">Haz clic para buscar en tu dispositivo</span>
            </label>
          </div>
        </div>

        {activeAlbumName && (
          <div className="mt-8" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '1.5rem' }}>
            <h3 className="text-xs font-semibold text-slate-500 uppercase mb-3">Álbum en Curso</h3>
            <div className="glass-panel p-4 flex items-center justify-between" style={{ background: 'rgba(5, 6, 11, 0.3)' }}>
              <div>
                <div className="font-bold text-white text-lg">{activeAlbumName}</div>
                <div className="text-xs text-slate-500">Progreso activo guardado en este navegador</div>
              </div>
              <button 
                onClick={handleResetActiveAlbum} 
                className="btn-secondary"
                style={{ padding: '10px', color: '#f87171', borderColor: 'rgba(248, 113, 113, 0.2)', background: 'rgba(248, 113, 113, 0.05)' }}
                title="Restablecer Álbum"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Creator Form Section */}
      <div className="glass-panel p-6 flex flex-col">
        <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
          <Sparkles className="text-amber-400" />
          Crear Álbum Personalizado
        </h2>
        <p className="text-slate-400 mb-6 text-sm">
          Crea tu propio álbum. Sube imágenes (fotos de amigos, mascotas, memes, etc.), configúralas y expórtalas.
        </p>

        {/* Inputs */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="input-container">
            <label className="input-label">Nombre del Álbum</label>
            <input 
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="Ej. Cumpleaños de Tomás, Mascotas..."
              className="text-input" 
            />
          </div>
          <div className="input-container">
            <label className="input-label">Descripción (Opcional)</label>
            <textarea 
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              placeholder="Ej. Colección de fotos graciosas del año..."
              rows={2}
              className="text-input"
              style={{ resize: 'none' }}
            />
          </div>

          {/* Configurable Page size / Layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '4px' }}>
            <div className="input-container">
              <label className="input-label">Figus por Página</label>
              <select 
                value={stickersPerPage}
                onChange={e => setStickersPerPage(Number(e.target.value))}
                className="text-input"
                style={{ cursor: 'pointer' }}
              >
                <option value={4}>4 (2x2 por página)</option>
                <option value={6}>6 (3x2 por página)</option>
                <option value={8}>8 (4x2 por página)</option>
                <option value={9}>9 (3x3 por página)</option>
                <option value={12}>12 (4x3 por página)</option>
              </select>
            </div>
            
            <div className="input-container">
              <label className="input-label">Diseño Base del Álbum</label>
              <div style={{ display: 'flex', gap: '4px', background: '#334155', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', width: 'fit-content' }}>
                <button
                  type="button"
                  onClick={() => setLayoutStyle('grid')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    borderRadius: '6px',
                    border: 'none',
                    background: layoutStyle === 'grid' ? 'var(--theme-accent)' : 'transparent',
                    color: layoutStyle === 'grid' ? '#ffffff' : '#94a3b8',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s'
                  }}
                  title="Alineamiento automático en cuadrícula"
                >
                  📊 Grilla
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutStyle('scrapbook')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    borderRadius: '6px',
                    border: 'none',
                    background: layoutStyle === 'scrapbook' ? 'var(--theme-accent)' : 'transparent',
                    color: layoutStyle === 'scrapbook' ? '#ffffff' : '#94a3b8',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s'
                  }}
                  title="Colocación libre interactiva (arrastrar y posicionar)"
                >
                  🎨 Scrapbook
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center', minWidth: '220px' }}>
              {/* Auto Split */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', flexGrow: 1 }}>
                  <input 
                    type="checkbox"
                    id="auto-split-checkbox"
                    checked={autoSplit}
                    onChange={e => {
                      const val = e.target.checked;
                      setAutoSplit(val);
                      if (val) applyAutoSplitToCurrent();
                    }}
                    style={{ accentColor: '#b45309', width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label htmlFor="auto-split-checkbox" className="font-semibold text-xs cursor-pointer text-slate-300">Auto-Dividir Figus</label>
                </div>
                {stickers.length > 0 && (
                  <button
                    type="button"
                    onClick={applyAutoSplitToCurrent}
                    className="btn-secondary"
                    style={{ padding: '2px 6px', fontSize: '9px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                    title="Dividir a la mitad las imágenes horizontales añadidas"
                  >
                    Dividir
                  </button>
                )}
              </div>

              {/* Auto Sort */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', flexGrow: 1 }}>
                  <input 
                    type="checkbox"
                    id="auto-sort-checkbox"
                    checked={autoSort}
                    onChange={e => {
                      const val = e.target.checked;
                      setAutoSort(val);
                      if (val) applyAutoSortToCurrent();
                    }}
                    style={{ accentColor: '#b45309', width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label htmlFor="auto-sort-checkbox" className="font-semibold text-xs cursor-pointer text-slate-300">Auto-Ordenar Alf.</label>
                </div>
                {stickers.length > 0 && (
                  <button
                    type="button"
                    onClick={applyAutoSortToCurrent}
                    className="btn-secondary"
                    style={{ padding: '2px 6px', fontSize: '9px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                    title="Ordenar alfabéticamente las figuritas añadidas"
                  >
                    Ordenar
                  </button>
                )}
              </div>

              {/* Auto Name */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', flexGrow: 1 }}>
                  <input 
                    type="checkbox"
                    id="auto-name-checkbox"
                    checked={autoName}
                    onChange={e => {
                      const val = e.target.checked;
                      setAutoName(val);
                      if (val) applyAutoNameToCurrent();
                    }}
                    style={{ accentColor: '#b45309', width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label htmlFor="auto-name-checkbox" className="font-semibold text-xs cursor-pointer text-slate-300">Auto-nombrar Figus</label>
                </div>
                {stickers.length > 0 && (
                  <button
                    type="button"
                    onClick={applyAutoNameToCurrent}
                    className="btn-secondary"
                    style={{ padding: '2px 6px', fontSize: '9px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                    title="Nombrar secuencialmente las figuritas añadidas"
                  >
                    Nombrar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Drag and Drop Zone */}
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`drop-zone ${isDragging ? 'drop-zone-active' : ''}`}
          style={{ marginBottom: '1.5rem' }}
        >
          <input 
            type="file" 
            multiple 
            accept="image/*" 
            onChange={handleImageUpload} 
            id="image-files-upload" 
            style={{ display: 'none' }} 
          />
          <label htmlFor="image-files-upload" style={{ cursor: 'pointer' }} className="flex flex-col items-center gap-2">
            <div className="welcome-icon-box" style={{ width: '50px', height: '50px', borderRadius: '14px', marginBottom: 0, color: '#fbbf24', borderColor: 'rgba(251, 191, 36, 0.2)', backgroundColor: 'rgba(251, 191, 36, 0.05)' }}>
              <Upload size={20} />
            </div>
            <span className="font-semibold text-white text-sm">Añadir Imágenes (Figuritas)</span>
            <span className="text-xs text-slate-500">Arrastra archivos aquí o haz clic para buscarlos</span>
          </label>
        </div>

        {/* Success/Error Alerts */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 p-3 mb-4 text-sm glass-panel" style={{ backgroundColor: 'rgba(248, 113, 113, 0.05)', borderColor: 'rgba(248, 113, 113, 0.2)' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 text-emerald-400 p-3 mb-4 text-sm glass-panel" style={{ backgroundColor: 'rgba(52, 211, 153, 0.05)', borderColor: 'rgba(52, 211, 153, 0.2)' }}>
            <Sparkles size={16} />
            <span>{success}</span>
          </div>
        )}

        {/* Live Double Page Book Preview */}
        {stickers.length > 0 && renderCreatorDoublePage()}

        {/* Loaded Stickers Preview List */}
        {stickers.length > 0 && (
          <div className="flex-grow">
            <h3 className="text-xs font-semibold text-slate-400 mb-3 flex justify-between items-center">
              <span className="flex items-center gap-1.5">
                Figuritas Añadidas ({stickers.length})
                {autoSort && <span style={{ fontSize: '10px', color: '#b45309', fontWeight: 'bold' }}>(Ordenado automáticamente)</span>}
              </span>
              <button onClick={() => setStickers([])} className="text-red-400 font-bold hover:underline" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px' }}>Borrar todas</button>
            </h3>
            
            <div className="stickers-preview-container" style={{ marginBottom: '1.5rem' }}>
              {displayedStickers.map((sticker, idx) => {
                const isTop = sticker.parentId 
                  ? displayedStickers.findIndex(s => s.parentId === sticker.parentId) === 0
                  : idx === 0;
                const siblingParts = sticker.parentId ? displayedStickers.filter(s => s.parentId === sticker.parentId) : [];
                const maxSiblingIdx = sticker.parentId 
                  ? Math.max(...siblingParts.map(s => displayedStickers.findIndex(x => x.id === s.id)))
                  : idx;
                const isBottom = maxSiblingIdx === displayedStickers.length - 1;
                const isSelectedInPreview = selectedStickerId === sticker.id;

                return (
                  <div 
                    key={sticker.id} 
                    className={`sticker-editor-card ${sticker.isRare ? 'rare-sticker-card' : ''}`}
                    style={isSelectedInPreview ? { borderColor: 'var(--theme-accent)', boxShadow: '0 0 10px rgba(226, 162, 39, 0.15)' } : undefined}
                  >
                    {/* Reorder Controls */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingRight: '6px', borderRight: '1px solid var(--border-color)', marginRight: '6px', justifyContent: 'center' }}>
                      <button 
                        onClick={() => moveSticker(sticker.id, 'up')}
                        disabled={isTop || autoSort}
                        style={{ 
                          padding: '2px 4px', 
                          fontSize: '9px', 
                          border: 'none', 
                          background: 'none', 
                          color: (isTop || autoSort) ? '#9c9284' : 'var(--theme-accent)', 
                          opacity: (isTop || autoSort) ? 0.25 : 1, 
                          cursor: (isTop || autoSort) ? 'not-allowed' : 'pointer', 
                          fontWeight: 'bold' 
                        }}
                        title={autoSort ? "Auto-ordenar activo (desactívalo para ordenar manualmente)" : "Subir en el álbum"}
                      >
                        ▲
                      </button>
                      <button 
                        onClick={() => moveSticker(sticker.id, 'down')}
                        disabled={isBottom || autoSort}
                        style={{ 
                          padding: '2px 4px', 
                          fontSize: '9px', 
                          border: 'none', 
                          background: 'none', 
                          color: (isBottom || autoSort) ? '#9c9284' : 'var(--theme-accent)', 
                          opacity: (isBottom || autoSort) ? 0.25 : 1, 
                          cursor: (isBottom || autoSort) ? 'not-allowed' : 'pointer', 
                          fontWeight: 'bold' 
                        }}
                        title={autoSort ? "Auto-ordenar activo (desactívalo para ordenar manualmente)" : "Bajar en el álbum"}
                      >
                        ▼
                      </button>
                    </div>

                    <img 
                      src={sticker.image} 
                      alt="preview" 
                      onClick={() => setSelectedStickerId(sticker.id)}
                      style={{ cursor: 'pointer' }}
                    />
                    <div className="flex-grow flex flex-col gap-2" style={{ overflow: 'hidden' }}>
                      <input 
                        type="text" 
                        value={sticker.name} 
                        onChange={e => updateSticker(sticker.id, 'name', e.target.value)} 
                        placeholder="Nombre de la figurita"
                        className="text-input"
                        style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                      />

                      {/* Position Selectors - Only shown in Scrapbook mode */}
                      {layoutStyle === 'scrapbook' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', borderTop: '1px dashed #e5dec9', paddingTop: '6px' }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', width: '80px' }}>
                              <span style={{ fontSize: '7px', fontWeight: 'bold', color: 'var(--text-muted)' }}>PÁGINA</span>
                              <select
                                value={sticker.page || 0}
                                onChange={(e) => updateStickerPosition(sticker.id, { page: Number(e.target.value) })}
                                className="text-input"
                                style={{ padding: '2px 4px', fontSize: '9px', fontWeight: 'bold', border: '1.5px solid #e5dec9', borderRadius: '6px', background: '#ffffff', color: '#6b6359', height: '22px' }}
                              >
                                {Array.from({ length: 20 }, (_, pIdx) => (
                                  <option key={pIdx} value={pIdx}>
                                    Pág {pIdx + 1}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flexGrow: 1 }}>
                              <span style={{ fontSize: '7px', fontWeight: 'bold', color: 'var(--text-muted)' }}>ANCHO ({Number(sticker.width || 0).toFixed(1)}%)</span>
                              <input 
                                type="range" 
                                min="10" 
                                max="60" 
                                step="0.1"
                                value={sticker.width || 24}
                                onChange={(e) => updateStickerPosition(sticker.id, { width: Number(e.target.value) })}
                                style={{ width: '100%', height: '4px', accentColor: 'var(--theme-accent)', cursor: 'pointer' }}
                              />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flexGrow: 1 }}>
                              <span style={{ fontSize: '7px', fontWeight: 'bold', color: 'var(--text-muted)' }}>ROTACIÓN ({Number(sticker.rotation || 0).toFixed(1)}°)</span>
                              <input 
                                type="range" 
                                min="-45" 
                                max="45" 
                                step="0.1"
                                value={sticker.rotation || 0}
                                onChange={(e) => updateStickerPosition(sticker.id, { rotation: Number(e.target.value) })}
                                style={{ width: '100%', height: '4px', accentColor: 'var(--theme-accent)', cursor: 'pointer' }}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-3">
                        {/* Rare Toggle */}
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs select-none">
                          <input 
                            type="checkbox" 
                            checked={sticker.isRare} 
                            onChange={e => updateSticker(sticker.id, 'isRare', e.target.checked)}
                            style={{ accentColor: '#fbbf24', cursor: 'pointer' }}
                          />
                          <span className={`flex items-center gap-0.5 ${sticker.isRare ? 'text-amber-400 font-bold' : 'text-slate-500'}`}>
                            <Award size={12} /> Foil Especial
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* Actions (Split and Trash) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {sticker.parentId ? (
                        <button 
                          onClick={() => handleRevertSplit(sticker.parentId)}
                          className="btn-secondary"
                          style={{ padding: '4px 6px', color: '#10b981', borderColor: 'transparent', background: 'none', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 'bold' }}
                          title="Revertir división (Unir piezas en la imagen original)"
                        >
                          <ArrowUpDown size={12} /> Unir ↺
                        </button>
                      ) : (
                        <>
                          <button 
                            onClick={() => handleManualSplitHorizontal(sticker.id)}
                            className="btn-secondary"
                            style={{ padding: '4px', color: '#b45309', borderColor: 'transparent', background: 'none', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '9px', fontWeight: 'bold' }}
                            title="Dividir en 2 horizontal (Izquierda/Derecha)"
                          >
                            <Scissors size={12} /> 2↔
                          </button>
                          <button 
                            onClick={() => handleManualSplitVertical(sticker.id)}
                            className="btn-secondary"
                            style={{ padding: '4px', color: '#b45309', borderColor: 'transparent', background: 'none', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '9px', fontWeight: 'bold' }}
                            title="Dividir en 2 vertical (Arriba/Abajo)"
                          >
                            <Scissors size={12} /> 2↕
                          </button>
                          <button 
                            onClick={() => handleManualSplitQuad(sticker.id)}
                            className="btn-secondary"
                            style={{ padding: '4px', color: '#b45309', borderColor: 'transparent', background: 'none', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '9px', fontWeight: 'bold' }}
                            title="Dividir en 4 partes (2x2)"
                          >
                            <Split size={12} /> 4⊞
                          </button>
                        </>
                      )}
                      <button 
                        onClick={() => deleteSticker(sticker.id)} 
                        className="btn-secondary"
                        style={{ padding: '8px', color: '#f87171', borderColor: 'transparent', background: 'none' }}
                        title="Eliminar"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button 
                onClick={handleQuickCreateAlbum}
                className="btn-gold flex-grow py-3"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 'bold' }}
              >
                ⚡ Creación Rápida
              </button>
              <button 
                onClick={() => handleCreateAlbum(false)}
                className="btn-secondary flex-grow py-3"
              >
                Cargar Solo en mi Navegador
              </button>
              <button 
                onClick={() => handleCreateAlbum(true)}
                className="btn-primary flex-grow py-3"
              >
                <Download size={16} />
                Crear y Exportar Álbum (.json)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
