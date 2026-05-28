import React, { useState, useEffect } from 'react';
import { db, initPacksInfo, getAlbumProgress, getActiveAlbumId } from './utils/db';
import AlbumCreator from './components/AlbumCreator';
import AlbumGrid from './components/AlbumGrid';
import PackOpener from './components/PackOpener';
import TradeCenter from './components/TradeCenter';
import LibraryManager from './components/LibraryManager';
import Achievements from './components/Achievements';
import { BookOpen, Package, ArrowLeftRight, Sparkles, BookMarked, HelpCircle, Trophy } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('album');
  const [activeAlbum, setActiveAlbum] = useState(null);
  const [progress, setProgress] = useState({
    name: '',
    description: '',
    total: 0,
    pasted: 0,
    uniqueOwned: 0,
    totalOwned: 0,
    duplicates: 0,
    percentage: 0,
    stickersPerPage: 6
  });
  const [unopenedPacksBadge, setUnopenedPacksBadge] = useState(0);

  useEffect(() => {
    initApp();
  }, []);

  const initApp = async () => {
    await initPacksInfo();
    await checkActiveAlbum();
  };

  const checkActiveAlbum = async () => {
    const activeId = getActiveAlbumId();
    let metadata = null;
    if (activeId) {
      metadata = await db.albumMetadata.get(activeId);
    }

    if (!metadata) {
      const all = await db.albumMetadata.toArray();
      if (all.length > 0) {
        metadata = all[0];
        localStorage.setItem('activeAlbumId', metadata.id);
      }
    }

    if (metadata) {
      setActiveAlbum(metadata);
      if (metadata.albumColor) {
        document.body.className = `theme-color-${metadata.albumColor}`;
      } else {
        document.body.className = 'theme-color-gold';
      }
      await refreshProgress(metadata.id);
      setActiveTab(prev => (prev === 'creator' || prev === 'library') ? prev : 'album');
    } else {
      setActiveAlbum(null);
      setActiveTab('creator'); // Default to creator if empty
    }
  };

  const refreshProgress = async (albumId) => {
    const activeId = albumId || getActiveAlbumId();
    const prog = await getAlbumProgress(activeId);
    if (prog) {
      setProgress(prog);
    }

    // Refresh packs badge count
    if (activeId) {
      const status = await db.packsInfo.get(`status-${activeId}`);
      if (status) {
        setUnopenedPacksBadge(status.packsAvailable);
      } else {
        setUnopenedPacksBadge(0);
      }
    } else {
      setUnopenedPacksBadge(0);
    }
  };

  return (
    <div className="app-container">
      {/* Header / Navbar */}
      <header className="navbar-header">
        <div className="navbar-content">
          
          {/* Logo Title */}
          <div className="navbar-logo-area">
            <div className="logo-icon-wrapper">
              <BookMarked size={22} />
            </div>
            <div className="logo-title-group">
              <h1>Álbum de Figuritas Web</h1>
              {activeAlbum && (
                <div className="logo-subtitle">
                  Coleccionando: <span className="text-purple-400">{activeAlbum.name}</span>
                </div>
              )}
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="navbar-nav">
            <button 
              onClick={() => setActiveTab('album')}
              disabled={!activeAlbum}
              className={`nav-link-btn ${activeTab === 'album' ? 'nav-link-btn-active' : ''}`}
            >
              <BookOpen size={15} /> Mi Álbum
            </button>
            
            <button 
              onClick={() => setActiveTab('opener')}
              disabled={!activeAlbum}
              className={`nav-link-btn ${activeTab === 'opener' ? 'nav-link-btn-active' : ''}`}
              style={{ position: 'relative' }}
            >
              <Package size={15} /> Abrir Sobres
              
              {/* Notification count badge */}
              {unopenedPacksBadge > 0 && activeAlbum && (
                <span className="nav-badge">
                  {unopenedPacksBadge}
                </span>
              )}
            </button>

            <button 
              onClick={() => setActiveTab('trading')}
              disabled={!activeAlbum}
              className={`nav-link-btn ${activeTab === 'trading' ? 'nav-link-btn-active' : ''}`}
            >
              <ArrowLeftRight size={15} /> Intercambiar
            </button>

            <button 
              onClick={() => setActiveTab('achievements')}
              disabled={!activeAlbum}
              className={`nav-link-btn ${activeTab === 'achievements' ? 'nav-link-btn-active' : ''}`}
            >
              <Trophy size={15} /> Logros 🏆
            </button>

            <button 
              onClick={() => setActiveTab('library')}
              className={`nav-link-btn ${activeTab === 'library' ? 'nav-link-btn-active' : ''}`}
            >
              <BookMarked size={15} /> Biblioteca 📚
            </button>

            <button 
              onClick={() => setActiveTab('creator')}
              className={`nav-link-btn ${activeTab === 'creator' ? 'nav-link-btn-active' : ''}`}
            >
              <Sparkles size={15} /> Creador
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow">
        {/* Force Library / Creator view if no album loaded */}
        {!activeAlbum && (activeTab !== 'creator' && activeTab !== 'library') ? (
          <div className="welcome-gate glass-panel-heavy">
            <div className="welcome-icon-box">
              <BookOpen size={40} />
            </div>
            <div>
              <h2 className="text-2xl font-black font-display mb-3">Ningún álbum activo</h2>
              <p className="text-slate-400 mb-6 text-sm">
                ¡Para empezar a coleccionar, necesitas crear un nuevo álbum con tus fotos o cargar un archivo `.json` de álbum que te hayan compartido!
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
              <button 
                onClick={() => setActiveTab('library')}
                className="btn-secondary flex-grow"
              >
                Ir a Biblioteca
              </button>
              <button 
                onClick={() => setActiveTab('creator')}
                className="btn-primary flex-grow"
              >
                Crear Álbum
              </button>
            </div>
          </div>
        ) : (
          /* Render components depending on current tab */
          <>
            {activeTab === 'album' && (
              <AlbumGrid 
                progress={progress} 
                refreshProgress={refreshProgress} 
              />
            )}
            {activeTab === 'opener' && (
              <PackOpener 
                refreshProgress={refreshProgress} 
              />
            )}
            {activeTab === 'trading' && (
              <TradeCenter 
                progress={progress} 
                refreshProgress={refreshProgress} 
              />
            )}
            {activeTab === 'achievements' && (
              <Achievements />
            )}
            {activeTab === 'library' && (
              <LibraryManager 
                onAlbumActivated={async (albumId) => {
                  if (albumId) {
                    localStorage.setItem('activeAlbumId', albumId);
                  } else {
                    localStorage.removeItem('activeAlbumId');
                  }
                  await checkActiveAlbum();
                }}
                onNavigateToCreator={() => setActiveTab('creator')}
              />
            )}
            {activeTab === 'creator' && (
              <AlbumCreator 
                onAlbumLoaded={async () => {
                  await checkActiveAlbum();
                  setActiveTab('album');
                }} 
                activeAlbumName={activeAlbum?.name}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 mt-12 text-center text-xs text-slate-500" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.03)' }}>
        <div className="navbar-content" style={{ padding: '0 2rem' }}>
          <div>
            © {new Date().getFullYear()} StickerAlbumWeb — Pair programmed with Antigravity AI
          </div>
          <div className="flex gap-4">
            <span className="hover:text-slate-300 transition-colors cursor-pointer flex items-center gap-1">
              <HelpCircle size={12} /> Ayuda
            </span>
            <span>|</span>
            <span className="hover:text-slate-300 transition-colors">Código Libre</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
