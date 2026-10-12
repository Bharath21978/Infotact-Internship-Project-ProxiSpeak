import { useEffect, useRef } from 'react';
import { FURNITURE, MY_PLAYER, PROXIMITY_RADIUS, SPACES, WORLD } from '../lib/world.js';
import { distance } from '../lib/movement.js';

const W = WORLD.width;
const H = WORLD.height;
const rr = (ctx, x, y, w, h, r, fill, outline) => {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 1.4; ctx.stroke(); }
};
const text = (ctx, s, x, y, size = 13, color = '#94aabe', weight = 600, align = 'left') => {
  ctx.font = `${weight} ${size}px Manrope, sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
};

function drawDesk(ctx, obj) {
  const { x, y, w, h } = obj;
  ctx.shadowColor = '#02091a99'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 9;
  rr(ctx, x, y, w, h, 15, '#294058', '#52738a');
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  rr(ctx, x + 12, y + 11, w * 0.57, h - 24, 8, '#172638', '#405873');
  rr(ctx, x + 22, y + 22, w * 0.45, 6, 3, '#57c5b4');
  rr(ctx, x + 22, y + 34, w * 0.31, 4, 2, '#60839a');
  rr(ctx, x + 22, y + 44, w * 0.38, 4, 2, '#60839a');
  rr(ctx, x + w - 42, y + 19, 28, 28, 7, '#38566b', '#59869a');
  ctx.beginPath(); ctx.arc(x + w - 28, y + 33, 7, 0, Math.PI * 2); ctx.fillStyle = '#7de6d5'; ctx.fill();
  rr(ctx, x + 24, y + h + 8, 45, 24, 11, '#223449', '#405c70');
}
function drawPlant(ctx, x, y) {
  rr(ctx, x - 12, y + 2, 24, 17, 4, '#776054');
  for (const [dx, dy, rot] of [[-11,-16,-.9],[14,-17,.6],[1,-30,.1],[-3,-4,-.3]]) {
    ctx.beginPath(); ctx.ellipse(x+dx, y+dy, 13, 7, rot, 0, Math.PI*2);
    ctx.fillStyle = '#4bba99'; ctx.fill();
  }
}

function staticWorld(ctx) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#101a2c'; ctx.fillRect(0, 0, W, H);
  const gradient = ctx.createRadialGradient(320, 260, 12, 320, 260, 650);
  gradient.addColorStop(0, '#213a48'); gradient.addColorStop(1, '#101a2c00');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#bdd6e70c';
  for (let x = 16; x < W; x += 28) for (let y = 15; y < H; y += 28) { ctx.beginPath(); ctx.arc(x,y,1.1,0,Math.PI*2); ctx.fill(); }

  for (const space of SPACES) {
    const accent = space.id === 'studio' ? '#4bbda957' : space.id === 'ideation' ? '#9582e755' : '#d9956d55';
    const fill = space.id === 'studio' ? '#213e47a1' : space.id === 'ideation' ? '#302b4eae' : '#342b35ae';
    rr(ctx, space.x, space.y, space.w, space.h, 24, fill, accent);
    rr(ctx, space.x + 24, space.y + 27, 11, 11, 4, space.color);
    text(ctx, space.label.toUpperCase(), space.x + 45, space.y + 33, 13, '#e0eaf4', 800);
    text(ctx, space.id === 'studio' ? 'BUILD  /  COLLABORATE  /  SHIP' : space.id === 'ideation' ? 'IDEAS INTO ACTION' : 'SPACE TO RECHARGE', space.x + 26, space.y + 61, 9, '#809ab3', 800);
  }
  // Desk furniture uses the same hitboxes as the collision engine.
  FURNITURE.forEach((obj) => {
    if (obj.type === 'desk') { drawDesk(ctx, obj); return; }
    if (obj.type === 'sofa') {
      rr(ctx, obj.x, obj.y, obj.w, obj.h, 17, '#485277', '#69759c');
      rr(ctx, obj.x+12, obj.y+10, obj.w/2-19, obj.h-18, 11, '#64749b');
      rr(ctx, obj.x+obj.w/2+6, obj.y+10, obj.w/2-19, obj.h-18, 11, '#64749b');
      return;
    }
    rr(ctx, obj.x, obj.y, obj.w, obj.h, 24, obj.id === 'ideation-table' ? '#52496f' : '#315064', '#718495');
    if (obj.id === 'table') text(ctx, 'TEAM TABLE', obj.x+obj.w/2, obj.y+obj.h/2, 11, '#d5e8e9', 800, 'center');
    if (obj.id === 'ideation-table') text(ctx, 'IDEA', obj.x+obj.w/2, obj.y+obj.h/2, 12, '#d8cefa', 800, 'center');
  });
  // Extra decorations (not collision blockers).
  rr(ctx, 850, 134, 260, 37, 9, '#52637b', '#7e8fad');
  rr(ctx, 866, 150, 53, 4, 2, '#a7f1de'); rr(ctx, 932, 150, 60, 4, 2, '#c1aeff'); rr(ctx, 1004, 150, 83, 4, 2, '#9caec6');
  drawPlant(ctx, 728, 622); drawPlant(ctx, 753, 149); drawPlant(ctx, 824, 640); drawPlant(ctx, 1121, 624);
  rr(ctx, 58, 633, 147, 25, 12, '#153732', '#327b68');
  text(ctx, '●  MOVEMENT ACTIVE', 73, 646, 10, '#8bedcf', 800);
}

function drawPlayer(ctx, person, { self = false, near = false, t = 0 } = {}) {
  const { x, y, color, name, initials } = person;
  const bounce = self ? Math.sin(t * 4) * 0.8 : Math.sin(t * 1.8 + x) * 1.5;
  ctx.save();
  if (near && !self) { ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI*2); ctx.lineWidth = 1.5; ctx.strokeStyle = '#80efd0'; ctx.stroke(); }
  if (self) {
    const glow = ctx.createRadialGradient(x, y, 10, x, y, 62);
    glow.addColorStop(0, '#7be9cf37'); glow.addColorStop(1, '#7be9cf00');
    ctx.fillStyle = glow; ctx.fillRect(x-62,y-62,124,124);
    ctx.beginPath(); ctx.arc(x,y,27,0,Math.PI*2); ctx.strokeStyle='#82eed8a0'; ctx.lineWidth=2; ctx.stroke();
  }
  ctx.shadowColor = color; ctx.shadowBlur = self ? 29 : 16;
  ctx.beginPath(); ctx.arc(x, y+bounce, self ? 22 : 19, 0, Math.PI*2);
  ctx.fillStyle = color; ctx.fill(); ctx.shadowBlur=0;
  ctx.beginPath(); ctx.arc(x,y+bounce,self ? 17 : 14,0,Math.PI*2);
  ctx.fillStyle='#14233a'; ctx.fill();
  text(ctx, initials, x, y+bounce, self ? 12 : 11, '#f7ffff', 800, 'center');
  if (self) {
    rr(ctx, x - 38, y + 33, 76, 23, 8, '#0a2c2c', '#5ddeca');
    text(ctx, 'BHARATH · YOU', x, y + 44, 9, '#a8ffe8', 800, 'center');
    rr(ctx, x-18, y-43, 36, 15, 7, '#96ffe3');
    text(ctx, 'YOU', x, y-35, 8, '#0d3931', 800, 'center');
  } else {
    rr(ctx, x - Math.max(38, name.length*3.5), y+27, Math.max(76, name.length*7), 21, 7, '#0c1a2ce8', '#42516a');
    text(ctx, name, x, y+37, 11, '#e9eff9', 700, 'center');
    if (near) { ctx.beginPath(); ctx.arc(x+23,y-23,5,0,Math.PI*2); ctx.fillStyle='#75ecca'; ctx.fill(); }
  }
  ctx.restore();
}

export default function SpaceCanvas({ positionRef, trailRef, waypointsRef, participants, showRadius, showTrail, onMapClick, focusedId, reducedMotion }) {
  const canvasRef = useRef(null);
  const propsRef = useRef({ participants, showRadius, showTrail, onMapClick, focusedId, reducedMotion });
  propsRef.current = { participants, showRadius, showTrail, onMapClick, focusedId, reducedMotion };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    const cache = document.createElement('canvas'); cache.width=W; cache.height=H;
    staticWorld(cache.getContext('2d'));
    let id;
    let sizeW=0; let sizeH=0;
    const frame = (now) => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth*ratio));
      const h = Math.max(1, Math.round(canvas.clientHeight*ratio));
      if (sizeW !== w || sizeH !== h) { canvas.width=w; canvas.height=h; sizeW=w; sizeH=h; }
      ctx.setTransform(sizeW/W,0,0,sizeH/H,0,0);
      ctx.drawImage(cache, 0, 0);
      const { participants: people, showRadius: show, showTrail: trail, focusedId: focus, reducedMotion: reduced } = propsRef.current;
      const self = positionRef.current;
      if (trail && trailRef.current.length > 1) {
        const points = trailRef.current;
        ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
        points.forEach((p)=>ctx.lineTo(p.x,p.y));
        ctx.strokeStyle = '#73e6d27c'; ctx.lineWidth = 3; ctx.setLineDash([4,8]); ctx.stroke(); ctx.setLineDash([]);
      }
      if (waypointsRef.current.length) {
        ctx.beginPath(); ctx.moveTo(self.x,self.y);
        waypointsRef.current.forEach(p=>ctx.lineTo(p.x,p.y));
        ctx.strokeStyle='#bedddaa3'; ctx.lineWidth=2; ctx.setLineDash([6,8]); ctx.stroke(); ctx.setLineDash([]);
        const dest = waypointsRef.current.at(-1);
        ctx.beginPath(); ctx.arc(dest.x,dest.y,9,0,Math.PI*2);
        ctx.strokeStyle='#9cf4e7'; ctx.lineWidth=2; ctx.stroke();
      }
      if (show) {
        ctx.beginPath(); ctx.arc(self.x,self.y,PROXIMITY_RADIUS,0,Math.PI*2);
        ctx.fillStyle='#69ebce12'; ctx.fill();
        ctx.lineWidth=2; ctx.strokeStyle='#89eed073'; ctx.setLineDash([7,9]); ctx.lineDashOffset=reduced?0:-(now/70)%16; ctx.stroke(); ctx.setLineDash([]);
      }
      people.forEach((person) => {
        if (person.id === focus) {
          ctx.beginPath(); ctx.arc(person.x,person.y,35,0,Math.PI*2);
          ctx.strokeStyle='#f6e3b6'; ctx.lineWidth=2; ctx.stroke();
        }
        drawPlayer(ctx, person, { near: distance(self,person) <= PROXIMITY_RADIUS, t: reduced?0:now/1000 });
      });
      // Render the actual local avatar in this SAME coordinate system as its HUD.
      drawPlayer(ctx, { ...MY_PLAYER, ...self }, { self: true, t: reduced?0:now/1000 });
      id = requestAnimationFrame(frame);
    };
    id=requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, [positionRef, trailRef, waypointsRef]);

  const onClick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = { x: (event.clientX-rect.left)/rect.width*W, y: (event.clientY-rect.top)/rect.height*H };
    propsRef.current.onMapClick(point);
  };
  return <canvas ref={canvasRef} className="space-canvas" onPointerDown={onClick} role="img" aria-label="Interactive spatial workspace. Bharath avatar moves on keyboard WASD or arrow keys; click floor to navigate around furniture." title="Click anywhere to walk there · WASD / arrow keys to move" />;
}
