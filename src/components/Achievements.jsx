import React, { useState, useEffect } from 'react';
import { db, getActiveAlbumId, getAlbumProgress } from '../utils/db';
import { Award, ShieldCheck, Trophy, Sparkles, Package, ArrowLeftRight, HelpCircle } from 'lucide-react';

export default function Achievements() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    percentage: 0,
    pastedRares: 0,
    packsOpened: 0,
    tradesCompleted: 0
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const activeId = getActiveAlbumId();
      if (!activeId) {
        setLoading(false);
        return;
      }

      // Progress stats
      const prog = await getAlbumProgress(activeId);
      const percentage = prog ? prog.percentage : 0;

      // Rare stickers pasted
      const allStickers = await db.stickers.where('albumId').equals(activeId).toArray();
      const rareStickers = allStickers.filter(s => s.isRare);
      const rareIds = rareStickers.map(s => s.id);
      
      const inventory = await db.inventory.where('albumId').equals(activeId).toArray();
      const pastedRares = inventory.filter(item => item.pasted && rareIds.includes(item.stickerId)).length;

      // Local storage metrics
      const packsOpened = parseInt(localStorage.getItem(`packs_opened_${activeId}`) || '0', 10);
      const tradesCompleted = parseInt(localStorage.getItem(`trades_${activeId}`) || '0', 10);

      setStats({
        percentage,
        pastedRares,
        packsOpened,
        tradesCompleted
      });
    } catch (e) {
      console.error("Error loading achievements metrics:", e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  // Define achievements criteria
  const list = [
    {
      id: 'album_10',
      title: 'Primer Paso 📖',
      description: 'Pega el 10% de las figuritas totales de tu álbum.',
      icon: <Award size={28} />,
      progressText: `${stats.percentage}% / 10%`,
      unlocked: stats.percentage >= 10,
      current: stats.percentage,
      target: 10
    },
    {
      id: 'album_50',
      title: 'Mitad de Camino 🗺️',
      description: 'Pega el 50% de las figuritas en tu álbum.',
      icon: <ShieldCheck size={28} />,
      progressText: `${stats.percentage}% / 50%`,
      unlocked: stats.percentage >= 50,
      current: stats.percentage,
      target: 50
    },
    {
      id: 'album_100',
      title: '¡Coleccionista Supremo! 🏆',
      description: 'Completa al 100% el álbum pegando todas las figuritas.',
      icon: <Trophy size={28} />,
      progressText: `${stats.percentage}% / 100%`,
      unlocked: stats.percentage >= 100,
      current: stats.percentage,
      target: 100
    },
    {
      id: 'foil_hunter',
      title: 'Foil Hunter ✨',
      description: 'Consigue y pega al menos 3 figuritas Raras (Brillantes).',
      icon: <Sparkles size={28} />,
      progressText: `${stats.pastedRares} / 3 pegadas`,
      unlocked: stats.pastedRares >= 3,
      current: stats.pastedRares,
      target: 3
    },
    {
      id: 'pack_opener',
      title: 'Abridor de Élite 📦',
      description: 'Abre al menos 5 sobres en este álbum.',
      icon: <Package size={28} />,
      progressText: `${stats.packsOpened} / 5 sobres`,
      unlocked: stats.packsOpened >= 5,
      current: stats.packsOpened,
      target: 5
    },
    {
      id: 'trader',
      title: 'Socio Comercial 🤝',
      description: 'Completar al menos 1 intercambio con un amigo.',
      icon: <ArrowLeftRight size={28} />,
      progressText: `${stats.tradesCompleted} / 1 intercambio`,
      unlocked: stats.tradesCompleted >= 1,
      current: stats.tradesCompleted,
      target: 1
    }
  ];

  const unlockedCount = list.filter(a => a.unlocked).length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="glass-panel text-center p-8 mb-8" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h2 className="text-3xl font-black font-display mb-2 text-white flex items-center gap-2">
          Vitrina de Logros 🏆
        </h2>
        <p className="text-slate-400 text-sm max-w-lg mb-6">
          ¡Completa objetivos del coleccionismo para desbloquear medallas exclusivas y certificar tu éxito en el álbum!
        </p>

        {/* Global Progress Bar */}
        <div style={{ width: '100%', maxWidth: '500px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '999px', height: '14px', overflow: 'hidden', display: 'flex', position: 'relative', marginBottom: '8px' }}>
          <div 
            style={{ 
              width: `${(unlockedCount / list.length) * 100}%`, 
              background: 'linear-gradient(90deg, var(--theme-accent) 0%, #a855f7 100%)', 
              height: '100%', 
              borderRadius: '999px',
              transition: 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1)' 
            }} 
          />
        </div>
        <span className="text-xs font-bold text-slate-400">
          Medallas Desbloqueadas: <span className="text-purple-400 font-black">{unlockedCount} de {list.length}</span>
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
        {list.map(achievement => {
          const progressPct = Math.min(100, Math.round((achievement.current / achievement.target) * 100)) || 0;
          return (
            <div 
              key={achievement.id}
              className={`glass-panel p-6 flex flex-col justify-between transition-all duration-300 ${
                achievement.unlocked 
                  ? 'border-gradient-amber' 
                  : 'opacity-70 grayscale'
              }`}
              style={{
                background: achievement.unlocked 
                  ? 'linear-gradient(135deg, rgba(226, 162, 39, 0.05) 0%, rgba(168, 85, 247, 0.02) 100%)' 
                  : 'rgba(25, 20, 18, 0.4)',
                border: achievement.unlocked 
                  ? '1.5px solid var(--theme-accent)' 
                  : '1.5px solid rgba(255, 255, 255, 0.04)',
                boxShadow: achievement.unlocked 
                  ? '0 8px 32px rgba(226, 162, 39, 0.08)' 
                  : 'none',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {/* Decorative radial blur for unlocked items */}
              {achievement.unlocked && (
                <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '80px', height: '80px', background: 'rgba(226, 162, 39, 0.15)', filter: 'blur(30px)', borderRadius: '50%', pointerEvents: 'none' }} />
              )}

              <div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '1rem' }}>
                  <div 
                    style={{ 
                      padding: '10px', 
                      borderRadius: '10px', 
                      background: achievement.unlocked 
                        ? 'rgba(226, 162, 39, 0.15)' 
                        : 'rgba(255,255,255,0.05)',
                      color: achievement.unlocked ? 'var(--theme-accent)' : '#94a3b8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {achievement.icon}
                  </div>
                  <div>
                    <h3 className="font-display font-black text-base text-white">
                      {achievement.title}
                    </h3>
                    <span 
                      style={{ 
                        fontSize: '9px', 
                        fontWeight: '800', 
                        textTransform: 'uppercase', 
                        letterSpacing: '0.05em',
                        color: achievement.unlocked ? 'var(--theme-accent)' : '#94a3b8'
                      }}
                    >
                      {achievement.unlocked ? 'Desbloqueado' : 'Bloqueado'}
                    </span>
                  </div>
                </div>

                <p className="text-slate-400 text-xs leading-relaxed mb-4">
                  {achievement.description}
                </p>
              </div>

              {/* Progress info inside card */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] text-slate-500 font-bold">Progreso</span>
                  <span className="text-[10px] text-slate-400 font-extrabold">{achievement.progressText}</span>
                </div>
                <div style={{ width: '100%', height: '4px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div 
                    style={{ 
                      width: `${progressPct}%`, 
                      backgroundColor: achievement.unlocked ? 'var(--theme-accent)' : '#64748b', 
                      height: '100%' 
                    }} 
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
