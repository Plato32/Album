import Dexie from 'dexie';

// Initialize the database
export const db = new Dexie('StickerAlbumDB');

// Define tables and indexes
db.version(1).stores({
  albumMetadata: 'id',       // id ("active"), name, description, totalStickers
  stickers: 'id, name, isRare, group', // id, name, image (base64), isRare, group
  inventory: 'stickerId, owned, pasted', // stickerId, owned, pasted
  packsInfo: 'id'            // id ("status"), lastClaimed, packsAvailable
});

// Helper to initialize packsInfo if it doesn't exist
export async function initPacksInfo() {
  const status = await db.packsInfo.get('status');
  if (!status) {
    await db.packsInfo.put({
      id: 'status',
      lastClaimed: 0,
      packsAvailable: 3 // Start with 3 free packs
    });
  }
}

// Reset everything to start a new album
export async function clearActiveAlbum() {
  await db.albumMetadata.clear();
  await db.stickers.clear();
  await db.inventory.clear();
  await db.packsInfo.clear();
  await initPacksInfo();
}

export function ensureSplitStickersGrouped(stickersList) {
  const result = [];
  const visited = new Set();
  
  stickersList.forEach((s, idx) => {
    const stickerId = s.id !== undefined && s.id !== null ? s.id : `temp-${idx}`;
    if (visited.has(stickerId)) return;
    
    if (s.parentId) {
      // Find all stickers with this parentId
      const parts = stickersList.filter(x => x.parentId === s.parentId);
      // Sort parts by splitPart ('A', 'B', 'C', 'D' etc.) to maintain correct layout order
      parts.sort((a, b) => String(a.splitPart || '').localeCompare(String(b.splitPart || '')));
      
      parts.forEach(p => {
        const partId = p.id !== undefined && p.id !== null ? p.id : `temp-${stickersList.indexOf(p)}`;
        result.push(p);
        visited.add(partId);
      });
    } else {
      result.push(s);
      visited.add(stickerId);
    }
  });
  
  return result;
}

export function layoutStickers(stickersList, stickersPerPage = 6, forceSequential = false) {
  // First, guarantee that all split parts are consecutive and in order
  const orderedStickers = ensureSplitStickersGrouped(stickersList);

  // Group consecutive stickers by parentId
  const groups = [];
  let currentGroup = [];
  
  orderedStickers.forEach(s => {
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

  // Now assign position fields to each group
  let cols = 3;
  let rows = 2;
  if (stickersPerPage === 4) { cols = 2; rows = 2; }
  else if (stickersPerPage === 8 || stickersPerPage === 12) { cols = 4; rows = Math.ceil(stickersPerPage / 4); }
  else if (stickersPerPage === 9) { cols = 3; rows = 3; }

  let currentPageIndex = 0;
  let currentPageCells = 0;
  let groupIndexOnPage = 0;

  return groups.flatMap((group) => {
    // Estimación del tamaño en celdas de la cuadrícula:
    // Un quad consume 4 celdas, un par consume 2 celdas, una individual 1 celda.
    const size = group.length === 4 ? 4 : (group.length === 2 ? 2 : 1);

    // Si el grupo no cabe en la página actual, pasamos a la siguiente página
    if (currentPageCells > 0 && currentPageCells + size > stickersPerPage) {
      currentPageIndex++;
      currentPageCells = 0;
      groupIndexOnPage = 0;
    }

    const page = currentPageIndex;
    const slotIdx = groupIndexOnPage;

    currentPageCells += size;
    groupIndexOnPage++;

    const col = slotIdx % cols;
    const row = Math.floor(slotIdx / cols);

    let x = 0;
    let y = 0;
    let width = 24;

    if (cols === 2) {
      x = 10 + col * 45;
      y = 10 + row * 44;
      width = 35;
    } else if (cols === 3) {
      x = 7 + col * 31;
      y = rows === 2 ? (10 + row * 44) : (7 + row * 31);
      width = 24;
    } else { // cols === 4
      x = 5 + col * 23;
      y = rows === 2 ? (10 + row * 44) : (7 + row * 31);
      width = 18;
    }

    // Force ALL stickers in the split group to have the exact same page, x, y, width, rotation
    const firstMember = group[0];
    const finalPage = (!forceSequential && firstMember.page !== undefined && firstMember.page !== null) ? firstMember.page : page;
    const finalX = (!forceSequential && firstMember.x !== undefined && firstMember.x !== null) ? firstMember.x : x;
    const finalY = (!forceSequential && firstMember.y !== undefined && firstMember.y !== null) ? firstMember.y : y;
    const finalWidth = (!forceSequential && firstMember.width !== undefined && firstMember.width !== null) ? firstMember.width : width;
    const finalRotation = (!forceSequential && firstMember.rotation !== undefined && firstMember.rotation !== null) ? firstMember.rotation : 0;

    return group.map(s => ({
      ...s,
      page: finalPage,
      x: finalX,
      y: finalY,
      width: finalWidth,
      rotation: finalRotation
    }));
  });
}

// Import a new album definition
export async function importAlbumDefinition(albumJson) {
  // Clear existing database
  await clearActiveAlbum();
  
  // Set metadata
  await db.albumMetadata.put({
    id: 'active',
    name: albumJson.name || 'Álbum Personalizado',
    description: albumJson.description || 'Mi álbum de figuritas personalizado',
    totalStickers: albumJson.stickers.length,
    stickersPerPage: albumJson.stickersPerPage || 6,
    layoutStyle: albumJson.layoutStyle || 'scrapbook'
  });
  
  // Insert stickers
  const initialStickers = albumJson.stickers.map((sticker, idx) => ({
    id: idx + 1, // Assure ID is present for layoutStickers
    name: sticker.name || `Figurita ${idx + 1}`,
    image: sticker.image, // Base64 data
    isRare: !!sticker.isRare,
    group: sticker.group || 'General',
    parentId: sticker.parentId || null,
    splitType: sticker.splitType || null,
    splitPart: sticker.splitPart || null,
    page: sticker.page,
    x: sticker.x,
    y: sticker.y,
    width: sticker.width,
    rotation: sticker.rotation
  }));

  const forceSequential = albumJson.layoutStyle === 'grid';
  const stickersToInsert = layoutStickers(initialStickers, albumJson.stickersPerPage || 6, forceSequential).map((s, idx) => ({
    ...s,
    id: idx + 1
  }));
  
  await db.stickers.bulkAdd(stickersToInsert);
  
  // Initialize inventory for all stickers
  const inventoryToInsert = stickersToInsert.map(s => ({
    stickerId: s.id,
    owned: 0,
    pasted: false
  }));
  
  await db.inventory.bulkAdd(inventoryToInsert);
  return stickersToInsert.length;
}

// Get the user's progress
export async function getAlbumProgress() {
  const metadata = await db.albumMetadata.get('active');
  if (!metadata) return null;
  
  const inventory = await db.inventory.toArray();
  const total = metadata.totalStickers;
  const pasted = inventory.filter(item => item.pasted).length;
  const uniqueOwned = inventory.filter(item => item.owned > 0).length;
  const totalOwned = inventory.reduce((sum, item) => sum + item.owned, 0);
  const duplicates = inventory.reduce((sum, item) => sum + Math.max(0, item.owned - 1), 0);
  
  return {
    name: metadata.name,
    description: metadata.description,
    total,
    pasted,
    uniqueOwned,
    totalOwned,
    duplicates,
    percentage: Math.round((pasted / total) * 100) || 0,
    stickersPerPage: metadata.stickersPerPage || 6
  };
}
