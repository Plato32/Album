import React, { useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';

export default function PremiumCard({ image, name, isRare, style, imgStyle }) {
  const cardRef = useRef(null);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [rotate, setRotate] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    
    const card = cardRef.current;
    const rect = card.getBoundingClientRect();
    
    // Mouse position relative to the element
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Normalize position from -0.5 to 0.5
    const normalizedX = (x / rect.width) - 0.5;
    const normalizedY = (y / rect.height) - 0.5;
    
    // Maximum degrees of rotation
    const maxRotation = 15;
    
    // Calculate rotation angles
    // Moving mouse to the right rotates card around Y-axis (tilt right)
    // Moving mouse down rotates card around X-axis (tilt down)
    const rotateX = normalizedY * -maxRotation; 
    const rotateY = normalizedX * maxRotation;

    setCoords({ x, y });
    setRotate({ x: rotateX, y: rotateY });
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setRotate({ x: 0, y: 0 });
  };

  // Build inline styles dynamically for card tilt
  const cardStyle = {
    transform: isHovered 
      ? `perspective(800px) rotateX(${rotate.x}deg) rotateY(${rotate.y}deg) scale3d(1.05, 1.05, 1.05)`
      : 'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
    transition: isHovered ? 'none' : 'transform 0.5s ease',
    '--mouse-x': `${coords.x}px`,
    '--mouse-y': `${coords.y}px`
  };

  return (
    <div 
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`foil-glow ${isRare ? 'rare-sticker-card' : ''}`}
      style={{
        ...cardStyle,
        position: 'relative',
        width: '100%',
        height: '100%',
        borderRadius: '10px',
        overflow: 'hidden',
        borderTop: isRare ? undefined : '1.5px solid #e5dec9',
        borderBottom: isRare ? undefined : '1.5px solid #e5dec9',
        borderLeft: isRare ? undefined : '1.5px solid #e5dec9',
        borderRight: isRare ? undefined : '1.5px solid #e5dec9',
        backgroundColor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--shadow-sm)',
        boxSizing: 'border-box',
        ...style
      }}
    >
      {/* 3D hover glossy shine overlay */}
      <div 
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 30,
          opacity: isHovered ? 1 : 0,
          transition: 'opacity 0.3s ease',
          background: `radial-gradient(circle 80px at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(255, 255, 255, ${isRare ? '0.3' : '0.15'}), transparent 80%)`
        }}
      />

      {/* Sticker Image */}
      <div className="premium-card-img-wrapper">
        <img 
          src={image} 
          alt={name} 
          draggable="false"
          style={imgStyle}
        />
      </div>
    </div>
  );
}
