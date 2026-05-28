import React, { useState, useEffect } from 'react';
import { db, getAlbumProgress, deleteAlbum, getActiveAlbumId } from '../utils/db';
import { BookOpen, Trash2, Download, Plus, Award, CheckCircle, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function LibraryManager({ onAlbumActivated, onNavigateToCreator }) {
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeAlbumId, setActiveAlbumId] = useState(null);

  useEffect(() => {
    loadLibrary();
  }, []);

  const loadLibrary = async () => {
    setLoading(true);
    try {
      const allMeta = await db.albumMetadata.toArray();
      const albumsWithProgress = [];
      const currentActiveId = getActiveAlbumId();
      setActiveAlbumId(currentActiveId);

      for (const meta of allMeta) {
        const prog = await getAlbumProgress(meta.id);
        if (prog) {
          albumsWithProgress.push(prog);
        }
      }
      setAlbums(albumsWithProgress);
    } catch (err) {
      console.error("Error cargando biblioteca de álbumes:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAlbum = (albumId) => {
    onAlbumActivated(albumId);
    setActiveAlbumId(albumId);
    
    // Play celebratory sound and confetti
    confetti({
      particleCount: 50,
      spread: 40,
      colors: ['#a855f7', '#f5b041', '#3b82f6']
    });
  };

  const handleDeleteAlbum = async (e, albumId, albumName) => {
    e.stopPropagation();
    if (window.confirm(`¿Estás seguro de que deseas eliminar permanentemente el álbum "${albumName}" y todo su progreso de figuritas?`)) {
      await deleteAlbum(albumId);
      await loadLibrary();
      onAlbumActivated(getActiveAlbumId()); // Sync changes to parent app tab
    }
  };

  const handleExportAlbum = async (e, albumId, albumName) => {
    e.stopPropagation();
    try {
      const metadata = await db.albumMetadata.get(albumId);
      const stickers = await db.stickers.where('albumId').equals(albumId).toArray();
      
      const cleanStickers = stickers.map(s => {
        const cleanId = s.id.split('-').pop();
        const cleanParentId = s.parentId ? s.parentId.split('-').pop() : null;
        return {
          name: s.name,
          image: s.image,
          isRare: s.isRare,
          group: s.group,
          parentId: cleanParentId,
          splitType: s.splitType,
          splitPart: s.splitPart,
          page: s.page,
          x: s.x,
          y: s.y,
          width: s.width,
          rotation: s.rotation
        };
      });

      const exportData = {
        name: metadata.name,
        description: metadata.description,
        stickersPerPage: metadata.stickersPerPage,
        layoutStyle: metadata.layoutStyle,
        albumBg: metadata.albumBg || 'scrapbook',
        albumColor: metadata.albumColor || 'gold',
        customBgImage: metadata.customBgImage || null,
        stickers: cleanStickers
      };

      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;
      downloadAnchor.download = `${albumName.toLowerCase().replace(/[^a-z0-9]/g, "_")}_album.json`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Error al exportar definición del álbum: " + err.message);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-black font-display text-white flex items-center gap-2">
            Biblioteca de Álbumes 📚
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Administra tus colecciones activas y cambia entre ellas en cualquier momento.
          </p>
        </div>
        <button 
          onClick={onNavigateToCreator}
          className="btn-gold flex items-center gap-1.5 py-2.5 px-5 font-bold"
        >
          <Plus size={16} /> Crear Nuevo Álbum
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20 flex flex-col items-center gap-4">
          <div style={{ width: '40px', height: '40px', border: '3px solid var(--theme-accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <span className="text-slate-400 text-sm">Cargando biblioteca de colecciones...</span>
        </div>
      ) : albums.length === 0 ? (
        <div className="glass-panel-heavy p-12 text-center max-w-xl mx-auto flex flex-col items-center gap-6">
          <div style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '50%', color: 'var(--text-muted)' }}>
            <BookOpen size={48} />
          </div>
          <div>
            <h3 className="text-xl font-bold font-display text-white mb-2">No tienes álbumes guardados</h3>
            <p className="text-slate-400 text-xs max-w-sm mx-auto leading-relaxed">
              Crea tu primer álbum utilizando tus propias fotos del creador o importando un archivo de definición de álbum compartido.
            </p>
          </div>
          <button 
            onClick={onNavigateToCreator}
            className="btn-primary py-2.5 px-6 font-bold flex items-center gap-1.5"
          >
            <Plus size={16} /> Diseñar mi primer álbum
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {albums.map((album) => {
            const isActive = album.id === activeAlbumId;
            return (
              <div 
                key={album.id}
                onClick={() => handleSelectAlbum(album.id)}
                className={`glass-panel p-6 flex flex-col justify-between cursor-pointer transition-all duration-300 relative group hover:translate-y-[-4px] ${isActive ? 'active-library-card' : 'hover:border-slate-700'}`}
                style={{
                  border: isActive ? '2px solid var(--theme-accent)' : '1px solid rgba(255, 255, 255, 0.05)',
                  background: isActive ? 'linear-gradient(135deg, rgba(226, 162, 39, 0.08) 0%, rgba(12, 14, 24, 0.6) 100%)' : 'rgba(12, 14, 24, 0.4)'
                }}
              >
                {/* Active Indicator Top Corner */}
                {isActive && (
                  <div className="absolute top-4 right-4 flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                    <CheckCircle size={10} /> ACTIVO
                  </div>
                )}

                {/* Album Header Info */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <div 
                      className={`w-3 h-3 rounded-full theme-color-dot-${album.albumColor || 'gold'}`}
                      style={{ boxShadow: `0 0 8px var(--theme-accent)` }}
                    />
                    <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                      {album.layoutStyle === 'grid' ? 'DISEÑO GRILLA' : 'DISEÑO LIBRO'}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold font-display text-white truncate max-w-[85%] group-hover:text-amber-300 transition-colors">
                    {album.name}
                  </h3>
                  <p className="text-slate-400 text-xs mt-1 line-clamp-2 min-h-[32px] leading-relaxed">
                    {album.description || "Sin descripción."}
                  </p>
                </div>

                {/* Stats / Progress Bar */}
                <div className="my-6">
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="text-slate-500 font-bold">PROGRESO:</span>
                    <span className="font-mono font-bold text-white flex items-center gap-1">
                      {album.percentage}% <span className="text-slate-500 font-normal">({album.pasted}/{album.total} figus)</span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-gold h-full rounded-full transition-all duration-500"
                      style={{ 
                        width: `${album.percentage}%`,
                        backgroundColor: 'var(--theme-accent)'
                      }}
                    />
                  </div>
                </div>

                {/* Card footer controls */}
                <div className="flex justify-between items-center pt-4 border-t border-white/5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-2">
                    <button 
                      onClick={(e) => handleExportAlbum(e, album.id, album.name)}
                      className="text-slate-400 hover:text-white transition-colors"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '700' }}
                      title="Exportar archivo JSON"
                    >
                      <Download size={14} /> Exportar
                    </button>
                    <button 
                      onClick={(e) => handleDeleteAlbum(e, album.id, album.name)}
                      className="text-slate-500 hover:text-red-400 transition-colors"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '700' }}
                      title="Eliminar álbum de la base de datos"
                    >
                      <Trash2 size={14} /> Eliminar
                    </button>
                  </div>

                  <button 
                    onClick={() => handleSelectAlbum(album.id)}
                    className={`text-xs py-1.5 px-3 rounded-lg font-bold transition-all ${isActive ? 'bg-amber-400/10 text-amber-400 cursor-default border border-amber-400/20' : 'btn-primary hover:scale-[1.03]'}`}
                    disabled={isActive}
                  >
                    {isActive ? 'Abierto' : 'Abrir Colección'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
