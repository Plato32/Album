import React, { useState, useEffect } from 'react';
import { db, initPacksInfo, getAlbumProgress } from './utils/db';
import AlbumCreator from './components/AlbumCreator';
import AlbumGrid from './components/AlbumGrid';
import PackOpener from './components/PackOpener';
import TradeCenter from './components/TradeCenter';
import { BookOpen, Package, ArrowLeftRight, Sparkles, BookMarked, HelpCircle } from 'lucide-react';

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
    const metadata = await db.albumMetadata.get('active');
    if (metadata) {
      setActiveAlbum(metadata);
      if (metadata.albumColor) {
        document.body.className = `theme-color-${metadata.albumColor}`;
      } else {
        document.body.className = 'theme-color-gold';
      }
      await refreshProgress();
      setActiveTab('album');
    } else {
      setActiveAlbum(null);
      setActiveTab('creator'); // Default to creator if empty
    }
  };

  const refreshProgress = async () => {
    const prog = await getAlbumProgress();
    if (prog) {
      setProgress(prog);
    }

    // Refresh packs badge count
    const status = await db.packsInfo.get('status');
    if (status) {
      setUnopenedPacksBadge(status.packsAvailable);
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
        {/* Force Creator view if no album loaded */}
        {!activeAlbum && activeTab !== 'creator' ? (
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
            <button 
              onClick={() => setActiveTab('creator')}
              className="btn-primary w-full"
            >
              Ir al Creador de Álbumes
            </button>
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
            {activeTab === 'creator' && (
              <AlbumCreator 
                onAlbumLoaded={checkActiveAlbum} 
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
