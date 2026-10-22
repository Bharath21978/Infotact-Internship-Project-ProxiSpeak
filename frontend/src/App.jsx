import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, AudioLines, BookOpen, Check,
  CheckCheck, ChevronDown, ChevronRight, CircleDot, Code2, Compass, Copy, Cpu,
  Crosshair, ExternalLink, Fingerprint, Focus, GitBranch, Grid2X2, Headphones,
  Info, Keyboard, Layers3, Link2, MapPin, Maximize2, Menu, MousePointer2,
  MoveRight, Pause, Play, Radio, RefreshCcw, Route, Search, Settings2,
  ShieldCheck, Signal, Sparkles, Terminal, Users, Volume2, WifiOff, X, Zap,
} from 'lucide-react';
import SpaceCanvas from './components/SpaceCanvas.jsx';
import ThreeWorkspace from './components/ThreeWorkspace.jsx';
import AudioControlPanel from './components/AudioControlPanel.jsx';
import { useMovement } from './hooks/useMovement.js';
import { distance, inRange } from './lib/movement.js';
import { MY_PLAYER, PROXIMITY_RADIUS, SPACES, TEAM, WORLD, simulatedTeam } from './lib/world.js';
import { createSignalClient, EVENTS, parsePlayers } from './services/signaling.js';

const NAV = [
  { id: 'workspace', label: 'Live workspace', icon: Grid2X2 },
  { id: 'team', label: 'Team directory', icon: Users },
  { id: 'sprint', label: 'Day 01 report', icon: Activity },
];

function BadgeAvatar({ name, initials, color, big = false }) {
  return <span className={`badge-avatar ${big ? 'badge-avatar-big' : ''}`} style={{ '--ac': color }} aria-label={name}>{initials}</span>;
}
function StatusDot({ online = false }) { return <span className={`status-dot ${online ? 'status-dot-live' : ''}`} />; }
function Pill({ children, variant = '' }) { return <span className={`pill ${variant}`}>{children}</span>; }

function Sidebar({ view, setView, open, setOpen, openGuide }) {
  return <>
    {open && <button className="nav-backdrop" aria-label="Close menu" onClick={() => setOpen(false)} />}
    <aside className={`sidebar ${open ? 'sidebar-show' : ''}`}>
      <div className="sidebar-brand">
        <div className="brand-symbol"><AudioLines size={23} strokeWidth={2.7} /></div>
        <div><div className="brand-wordmark">proxi<span>speak</span><i>.</i></div><p>THE SPATIAL INTERNET</p></div>
        <button className="sidebar-exit icon-plain" aria-label="Close menu" onClick={() => setOpen(false)}><X size={18} /></button>
      </div>
      <div className="org-card"><div className="org-logo">P<span>01</span></div><div className="org-details"><b>ProxiSpeak Team</b><small>Infotact Solutions</small></div><ChevronDown size={15} /></div>
      <span className="sidebar-kicker">GENERAL</span>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {NAV.map(({ id, label, icon: Icon }) => <button key={id} className={`sidebar-link ${view === id ? 'selected' : ''}`} onClick={() => { setView(id); setOpen(false); }}><Icon size={18}/>{label}<span className="selected-indicator" /></button>)}
      </nav>
      <div className="sidebar-divider" />
      <span className="sidebar-kicker">VIRTUAL SPACES <span>03</span></span>
      <div className="sidebar-spaces">{SPACES.map((s,i) => <button key={s.id} onClick={() => { setView('workspace'); setOpen(false); window.setTimeout(() => document.dispatchEvent(new CustomEvent('proxi:room', { detail: s.id })), 0); }}><span className="sidebar-space-dot" style={{ background:s.color }}/>{s.short}<span className="space-index">0{i+1}</span></button>)}</div>
      <div className="sidebar-push" />
      <div className="sidebar-info"><div className="sidebar-info-icon"><Sparkles size={18}/></div><b>Beyond the ordinary.</b><p>A working Day 01 movement prototype. Built to demonstrate, not just decorate.</p><button onClick={openGuide}>Read the controls <ArrowUpRight size={14}/></button></div>
      <div className="sidebar-profile"><BadgeAvatar {...MY_PLAYER}/><div><b>Bharath</b><small>Frontend Developer</small></div><StatusDot online /></div>
    </aside>
  </>;
}

function TitleBar({ view, connection, onConnect, onMenu, onGuide }) {
  return <header className="titlebar">
    <div className="breadcrumbs"><button className="mobile-menu icon-plain" aria-label="Open navigation" onClick={onMenu}><Menu size={22}/></button><span>Workspace</span><ChevronRight size={15}/><strong>{view === 'workspace' ? 'Overview' : view === 'team' ? 'Team directory' : 'Sprint report'}</strong></div>
    <div className="titlebar-actions"><Pill variant="sprint-pill"><span className="blinking-spot"/>WEEK 01 · DAY 01</Pill>
      <button className={`signal-pill ${connection === 'online' ? 'is-online' : ''}`} onClick={onConnect} title={connection === 'online' ? 'Disconnect backend' : 'Attempt backend connection'}>
        {connection === 'online' ? <Signal size={15}/> : connection === 'connecting' ? <Radio className="spin" size={15}/> : <WifiOff size={15}/>}
        {connection === 'online' ? 'BACKEND LIVE' : connection === 'connecting' ? 'CONNECTING…' : 'LOCAL DEMO'}
      </button>
      <button className="top-help icon-plain" onClick={onGuide} title="Keyboard & demo guide" aria-label="Open demo guide"><Info size={19}/></button>
      <BadgeAvatar {...MY_PLAYER}/>
    </div>
  </header>;
}

function ControlStrip({ showRadius, setShowRadius, showTrail, setShowTrail, onReset, openGuide, onExpand, mode, setMode, roofVisible, setRoofVisible, focusRoom, setFocusRoom }) {
  return <>
    <div className="map-toolbar expanded-toolbar">
      <div className="map-toolbar-title"><span className="map-on-air"><span/></span><span>{mode === '3d' ? 'IMMERSIVE 3D OFFICE' : 'CLASSIC MOVEMENT MAP'}</span><i/><span className="map-resolution">{mode === '3d' ? 'LIVE INTERACTIVE SCENE' : '1200 × 720 UNITS'}</span></div>
      <div className="map-tools">
        <button className="map-tool map-tool-active" onClick={() => setMode(mode === '3d' ? 'map':'3d')} title="Switch between 3D and movement map"><Layers3 size={16}/><span>{mode === '3d' ? '2D map' : '3D office'}</span></button>
        <button className={`map-tool ${showRadius ? 'map-tool-active' : ''}`} onClick={() => setShowRadius(v=>!v)} aria-pressed={showRadius} title="Toggle proximity radius"><Crosshair size={16}/><span>Radius</span></button>
        <button className={`map-tool ${showTrail ? 'map-tool-active' : ''}`} onClick={() => setShowTrail(v=>!v)} aria-pressed={showTrail} title="Toggle walking trail"><Route size={16}/><span>Trail</span></button>
        {mode === '3d' && <button className={`map-tool ${roofVisible ? 'map-tool-active' : ''}`} onClick={() => setRoofVisible(v=>!v)} aria-pressed={roofVisible} title="Toggle glass roof"><Layers3 size={16}/><span>Roof</span></button>}
        <span className="tool-split"/>
        <button className="icon-btn" onClick={() => {onReset();setFocusRoom('all');}} title="Reset avatar and view" aria-label="Reset avatar and view"><RefreshCcw size={16}/></button>
        <button className="icon-btn" onClick={openGuide} title="Movement controls" aria-label="Movement guide"><Keyboard size={16}/></button>
        <button className="icon-btn" onClick={onExpand} title="Fullscreen workspace" aria-label="Fullscreen workspace"><Maximize2 size={16}/></button>
      </div>
    </div>
    {mode === '3d' && <div className="office-focus-bar" role="group" aria-label="Focus a virtual room">
      <span className="focus-label"><CircleDot size={13}/> EXPLORE SPACE</span>
      {[["all","Entire office"],["studio","Studio"],["ideation","Ideation Lab"],["lounge","Focus Lounge"]].map(([id,title])=><button key={id} type="button" aria-pressed={focusRoom === id} className={focusRoom === id ? 'is-focused':''} onClick={()=>setFocusRoom(id)}>{title}</button>)}
      <span className="focus-spacer"/>
      <button type="button" title="Zoom out" aria-label="Zoom out" className="focus-zoom" onClick={()=>document.dispatchEvent(new CustomEvent('proxi:zoom',{detail:-1}))}>−</button>
      <button type="button" title="Zoom in" aria-label="Zoom in" className="focus-zoom" onClick={()=>document.dispatchEvent(new CustomEvent('proxi:zoom',{detail:1}))}>+</button>
    </div>}
  </>;
}

function ArrowPad({ hold }) {
  const button = (key, Icon, klass) => <button className={klass} aria-label={`Hold to move ${key.replace('arrow','')}`} onPointerDown={(e)=>{e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);hold(key,true);}} onPointerUp={()=>hold(key,false)} onPointerCancel={()=>hold(key,false)} onLostPointerCapture={()=>hold(key,false)}><Icon size={16}/></button>;
  return <div className="touch-pad" aria-label="Touch avatar movement controls"><div className="pad-row">{button('arrowup', MoveRight, 'pad-up')}</div><div className="pad-row">{button('arrowleft',MoveRight,'pad-left')}{button('arrowdown',MoveRight,'pad-down')}{button('arrowright',MoveRight,'pad-right')}</div></div>;
}
function PersonRow({ person, me, pos, selected, onSelect, live }) {
  const d = me ? 0 : Math.round(distance(pos, person));
  const near = !me && inRange(pos, person);
  return <button type="button" className={`person-row ${selected ? 'person-selected' : ''}`} onClick={onSelect}>
    <BadgeAvatar {...person}/><div className="person-info"><strong>{person.name}{me && <small className="you-tag">YOU</small>}{person.name==='Jinithasri' && <small className="lead-tag">LEAD</small>}</strong><span>{person.role}</span></div>
    {me ? <span className="person-self"><StatusDot online/></span> : <span className={`distance-tag ${near ? 'tag-near' : ''}`}>{d}<small>u</small></span>}
  </button>;
}

function PresencePanel({ people, position, connection, selected, setSelected, filter, setFilter, onShare }) {
  const matches = useMemo(()=> people.filter((p)=>p.name.toLowerCase().includes(filter.toLowerCase())), [people,filter]);
  const nearby = people.filter(p=>inRange(position,p)).length;
  return <aside className="presence-card">
    <div className="presence-overline"><span>YOUR SESSION</span><Pill variant="panel-count">{people.length+1} AVATARS</Pill></div>
    <div className="presence-intro"><div><h3>People in space<span className="title-flower">✳</span></h3><p>{connection === 'online' ? 'Server-reported participants' : 'Simulated teammates · demo only'}</p></div><div className="people-graphic"><Users size={20}/></div></div>
    <label className="search-box"><Search size={17}/><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Search people…" aria-label="Search people"/><span>⌘ K</span></label>
    <div className="person-list"><PersonRow person={MY_PLAYER} pos={position} me selected={selected===MY_PLAYER.id} onSelect={()=>setSelected(MY_PLAYER.id)}/>
    {matches.map(person=><PersonRow key={person.id} person={person} pos={position} selected={selected===person.id} onSelect={()=>setSelected(person.id)} />)}
    {matches.length===0 && <p className="search-empty">No names match your search.</p>}
    </div>
    <div className="panel-stat"><div className="near-icon"><RadarIcon/></div><div><b>{nearby} {nearby===1?'teammate':'teammates'} in range</b><p>{connection === 'online' ? 'Based on real server positions' : 'Calculated from mock positions'}</p></div><span className="stat-online"/></div>
    <button className="share-btn" onClick={onShare}><Link2 size={17}/> Copy demo link <ArrowRight size={17}/></button>
    <div className="proximity-card"><span className="proximity-icon"><Zap size={17}/></span><div><b>Proximity-aware movement</b><p>Enter a <strong>{PROXIMITY_RADIUS}-unit radius</strong> to highlight teammates. Real voice chat belongs to a later integration stage.</p></div></div>
  </aside>;
}
function RadarIcon() { return <Crosshair size={20}/>; }
function FeatureCard({ icon: Icon, value, title, note, accent = '' }) { return <div className={`feature-card ${accent}`}><span className="feature-ico"><Icon size={17}/></span><div><strong>{value}</strong><span>{title}</span><small>{note}</small></div></div>; }

function WorkspaceView({ movement, people, connection, setView, showRadius, setShowRadius, showTrail, setShowTrail, guide, onShare, notify, selected, setSelected, filter, setFilter }) {
  const frameRef = useRef(null);
  const [mode,setMode] = useState('3d');
  const [focusRoom,setFocusRoom] = useState('all');
  const [roofVisible,setRoofVisible] = useState(false);
  const [showWelcome,setShowWelcome] = useState(true);
  const [reducedMotion,setReducedMotion] = useState(false);
  useEffect(()=>{
    const q=window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(q.matches);const cb=e=>setReducedMotion(e.matches);
    q.addEventListener?.('change',cb);return()=>q.removeEventListener?.('change',cb);
  },[]);
  useEffect(()=>{
    const handler=e=>{const room=SPACES.find(r=>r.id===e.detail);
      if(room){setMode('3d');setFocusRoom(room.id);movement.moveTo(room.spawn);notify(`Exploring ${room.short}`);}
    };
    document.addEventListener('proxi:room',handler);
    return()=>document.removeEventListener('proxi:room',handler);
  },[movement.moveTo,notify]);
  const nearby=people.filter(p=>inRange(movement.position,p)).length;
  const fullScreen=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await frameRef.current?.requestFullscreen();}catch{notify('Fullscreen unavailable in this browser.')}};
  const mapClick=point=>{if(!movement.moveTo(point))notify('No navigable path to that position.');else setShowWelcome(false);};
  return <div className="page workspace-page expanded-3d-page">
    <div className="hero-title"><div className="hero-copy"><div className="hero-overline"><span className="overline-diamond"/> PROXISPEAK / BUILDING THE FUTURE OF PRESENCE</div><h1>Your space to <span>move ideas.</span></h1><p>An expansive office for your team. Explore rooms, move your avatar and discover who's nearby.</p></div><div className="hero-side"><div className="hero-day"><span className="day-glow"/> DAY 02 / SPATIAL WORKSPACE UPGRADE</div><small><CircleDot size={13}/> Interactive 3D demonstration · local mode</small></div></div>
    <div className="workspace-heading"><div><div className="sub-eyebrow">EXPANDED OFFICE / FULL SCENE</div><h2>Spatial workspace <Pill variant="beta-pill">3D PREVIEW</Pill></h2></div><div className="avatar-stack">{[MY_PLAYER,...TEAM].map(p=><span key={p.id} title={p.name} style={{background:p.color}}>{p.initials}</span>)}<b>{people.length+1} avatars</b></div></div>
    <div className="workspace-grid"><div className="workspace-main">
      <div className="map-shell map-shell-3d" ref={frameRef}>
        <ControlStrip mode={mode} setMode={setMode} focusRoom={focusRoom} setFocusRoom={setFocusRoom} roofVisible={roofVisible} setRoofVisible={setRoofVisible} showRadius={showRadius} setShowRadius={setShowRadius} showTrail={showTrail} setShowTrail={setShowTrail} onReset={movement.reset} openGuide={guide} onExpand={fullScreen}/>
        <div className={`canvas-stage ${mode === '3d' ? 'stage-three-expanded' : ''}`}>
          {mode === '3d' ? <>
            <ThreeWorkspace positionRef={movement.positionRef} participants={people} radius={PROXIMITY_RADIUS} showRadius={showRadius} showTrail={showTrail} roofVisible={roofVisible} focusRoom={focusRoom} selectedId={selected} onFloorClick={mapClick} onSelectMember={id=>setSelected(id)} quality="high"/>
            <div className="three-scene-note"><span className="blinking-spot"/> ORIGINAL INTERACTIVE 3D · DEMO POSITIONS</div>
            {showWelcome && <div className="three-quicktip">Drag to rotate · Scroll to zoom · WASD to walk <button aria-label="Dismiss tip" onClick={()=>setShowWelcome(false)}><X size={14}/></button></div>}
          </> : <>
            <SpaceCanvas positionRef={movement.positionRef} trailRef={movement.trailRef} waypointsRef={movement.waypointsRef} participants={people} showRadius={showRadius} showTrail={showTrail} onMapClick={mapClick} focusedId={selected} reducedMotion={reducedMotion}/>
            <span className="canvas-caption"><span/> ORIGINAL NAVIGATION MAP · LOCAL DEMO</span>
          </>}
        </div>
        <div className="canvas-statusbar"><div><MapPin size={15}/><strong>X {Math.round(movement.position.x)}</strong><span>/</span><strong>Y {Math.round(movement.position.y)}</strong></div><div className="statusbar-right"><span className={`walking-dot ${movement.movement !== 'Idle' ? 'walking-active' : ''}`}/>{movement.movement}<i/>WASD · DRAG CAMERA · SCROLL ZOOM</div></div>
      </div>
      <div className="movement-footer"><div className="footer-desktop"><span className="footer-foot-icon"><Keyboard size={17}/></span><b>Controls</b><span>WASD / arrow keys · Drag to orbit · Scroll to zoom</span></div><button onClick={guide}>How it works <ArrowUpRight size={14}/></button></div>
      <AudioControlPanel position={movement.position} people={people} connection={connection}/>
      <ArrowPad hold={movement.hold}/>
      <div className="feature-grid">
        <FeatureCard icon={Route} value={Math.round(movement.metersTravelled).toLocaleString()} title="World units travelled" note="Tracked in this session" accent="mint-card"/>
        <FeatureCard icon={Crosshair} value={`${nearby} / ${people.length}`} title="Participants nearby" note={`${PROXIMITY_RADIUS}u proximity radius`} accent="violet-card"/>
        <FeatureCard icon={Cpu} value="3D" title="Rendering engine" note="Three.js / WebGL with fallback" accent="orange-card"/>
      </div>
    </div>
    <PresencePanel people={people} position={movement.position} connection={connection} selected={selected} setSelected={setSelected} filter={filter} setFilter={setFilter} onShare={onShare}/></div>
    <div className="section-footer"><span><ShieldCheck size={15}/> No microphone or camera permission in this demo.</span><span><Zap size={15}/> Collision-aware movement and pathfinding</span><button onClick={()=>setView('sprint')}>View development report <ArrowUpRight size={14}/></button></div>
  </div>;
}

function TeamView({ people, connection, pos }) {
  const roster=[MY_PLAYER,...TEAM];
  return <div className="page secondary-page"><div className="hero-overline"><span className="overline-diamond"/> PEOPLE / PROXISPEAK</div><h1>Built by people.<br/><span>Made for presence.</span></h1><p className="section-lead">A clear division of responsibilities makes our Day 01 prototype integration-ready. Names below represent the four project members, not verified online users.</p>
  <div className="team-cards">{roster.map((p,i)=><div className="team-card" key={p.id} style={{'--team-accent':p.color}}><div className="team-card-upper"><BadgeAvatar {...p} big/><span className="team-order">0{i+1}</span></div><div className="team-card-content"><h3>{p.name}</h3><p>{p.role}</p>{p.name==='Jinithasri'?<Pill variant="team-lead-pill">TEAM LEAD</Pill>:null}</div><div className="team-card-bottom"><span>{p.id===MY_PLAYER.id?'LOCAL PLAYER':'DEMO PARTICIPANT'}</span><ArrowUpRight size={18}/></div></div>)}</div>
  <div className="team-note"><Info size={20}/><div><b>Integration boundary</b><p>Teammates shown in the room are simulated for visual frontend testing when offline. Their real positions will appear only when the backend returns <code>players:update</code>. {connection === 'online' ? `Backend currently reports ${people.length} remote players.` : 'Backend not connected.'}</p></div></div></div>;
}

const MILESTONES = [
  {title:'React + Vite scaffold',detail:'Component architecture, responsive app shell, reusable UI primitives',who:'Bharath',status:'Implemented',icon:Code2},
  {title:'High-DPI Canvas workspace',detail:'Distinct spaces, map furnishings, drawing cache, responsive scaling',who:'Bharath',status:'Implemented',icon:Layers3},
  {title:'Keyboard + touch movement',detail:'Frame-rate independent WASD / arrows, blur cleanup, touchscreen D-pad',who:'Bharath',status:'Implemented',icon:Keyboard},
  {title:'Collision + pathfinding',detail:'Object hitboxes, edge bounds, A* click-to-navigate, walking trail',who:'Bharath',status:'Implemented',icon:Route},
  {title:'Presence and proximity UI',detail:'Distance in Canvas units; clear offline demo mode',who:'Bharath',status:'Implemented',icon:Crosshair},
  {title:'Socket.IO event adapter',detail:'Prepared, not yet verified against Jeevith’s server',who:'Bharath + Jeevith',status:'Needs integration',icon:Signal},
  {title:'Real-time voice / WebRTC',detail:'Not claimed as a Day 01 frontend deliverable',who:'Jinithasri',status:'Later sprint',icon:Headphones},
];
function SprintView({ onGuide }) {
  return <div className="page secondary-page sprint-page"><div className="hero-overline"><span className="overline-diamond"/> WEEK 01 / ENGINEERING LOG</div><h1>Make the progress<br/><span>measurable.</span></h1><p className="section-lead">A truthful breakdown of what this Day 01 frontend implements — and what still depends on team integration. Run the tests before submission.</p>
    <div className="sprint-stats"><div><strong>05</strong><span>Frontend milestones implemented</span></div><div><strong>01</strong><span>Backend integration pending</span></div><div><strong>01</strong><span>Future voice milestone</span></div></div>
    <div className="milestone-shell"><div className="milestone-top"><span>DEVELOPMENT CHECKLIST</span><Pill variant="beta-pill">DAY 01</Pill></div>{MILESTONES.map(({title,detail,who,status,icon:Icon})=><div className="milestone" key={title}><span className={`milestone-ico ${status==='Implemented'?'milestone-done':''}`}><Icon size={19}/></span><div className="milestone-text"><strong>{title}</strong><p>{detail}</p></div><span className="milestone-owner">{who}</span><span className={`milestone-status ${status==='Implemented'?'done':status==='Later sprint'?'later':'pending'}`}>{status==='Implemented'&&<Check size={13}/>} {status}</span></div>)}</div>
    <div className="command-card"><div><Terminal size={20}/><b>Validate before pushing to GitHub</b></div><pre>npm.cmd install{'\n'}npm.cmd test{'\n'}npm.cmd run build{'\n'}npm.cmd run dev</pre><p>Integration works only after the team's backend implements the documented event contract. Demo mode is self-contained.</p><button onClick={onGuide}>Open live demo walkthrough <ArrowRight size={16}/></button></div>
  </div>;
}

function DemoGuide({ close }) {
  useEffect(()=>{const key=e=>{if(e.key==='Escape')close();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[close]);
  return <div className="dialog-backdrop" onPointerDown={close}><section className="guide-dialog" role="dialog" aria-modal="true" aria-labelledby="guide-title" onPointerDown={e=>e.stopPropagation()}><button className="guide-close icon-plain" aria-label="Close guide" onClick={close}><X size={18}/></button><div className="guide-icon"><Keyboard size={25}/></div><div className="hero-overline">QUICK START / SPATIAL MOVEMENT</div><h2 id="guide-title">Move like you mean it.</h2><p className="guide-intro">Every coordinate below is a <strong>Canvas world unit</strong>. Day 01 covers movement and signaling preparation, not voice calling.</p><div className="guide-item"><div className="guide-keys"><kbd>W</kbd><div><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div></div><div><b>Keyboard walk</b><p>Use WASD or arrow keys. Diagonals have normalized speed.</p></div></div><div className="guide-item"><div className="guide-icon-small"><MousePointer2 size={24}/></div><div><b>Click-to-navigate</b><p>Click anywhere on the map. A* automatically routes around furniture.</p></div></div><div className="guide-item"><div className="guide-icon-small"><Crosshair size={24}/></div><div><b>Proximity awareness</b><p>Within {PROXIMITY_RADIUS} units, teammate avatars get highlighted.</p></div></div><div className="guide-item"><div className="guide-icon-small"><WifiOff size={24}/></div><div><b>Local demo by default</b><p>Other members are simulated until a compatible Socket.IO backend is connected.</p></div></div><button className="guide-cta" onClick={close}>Start exploring <ArrowRight size={16}/></button></section></div>;
}

export default function App() {
  const [view,setView] = useState('workspace');
  const [menuOpen,setMenuOpen] = useState(false);
  const [guideOpen,setGuideOpen] = useState(false);
  const [showRadius,setShowRadius] = useState(true);
  const [showTrail,setShowTrail] = useState(true);
  const [connection,setConnection] = useState('demo');
  const [livePeople,setLivePeople] = useState([]);
  const [demoPeople,setDemoPeople] = useState(TEAM);
  const [selected,setSelected] = useState(null);
  const [filter,setFilter] = useState('');
  const [toast,setToast] = useState('');
  const toastTimer=useRef(null);
  const socket=useRef(null);
  const sessionId=useRef(`bharath-${Math.random().toString(36).slice(2,9)}`);
  const notify=useCallback((message)=>{setToast(message);clearTimeout(toastTimer.current);toastTimer.current=window.setTimeout(()=>setToast(''),3600);},[]);
  const broadcast=useCallback((p)=>{if(socket.current?.connected)socket.current.emit(EVENTS.move,{roomId:'main',id:sessionId.current,x:p.x,y:p.y});},[]);
  const movement=useMovement(broadcast);
  const people=connection==='online'?livePeople:demoPeople;

  useEffect(()=>{
    const timer=setInterval(()=>{setDemoPeople(simulatedTeam(performance.now()/1000));},240);
    return()=>{clearInterval(timer);clearTimeout(toastTimer.current);socket.current?.disconnect();};
  },[]);
  useEffect(()=>{
    const handler=(e)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setView('workspace');window.setTimeout(()=>document.querySelector('.search-box input')?.focus(),50);}};
    window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);
  },[]);
  const disconnect=()=>{
    socket.current?.disconnect();socket.current=null;setConnection('demo');setLivePeople([]);notify('Disconnected. Back in local demo mode.');
  };
  const toggleBackend=()=>{
    if (socket.current) {disconnect();return;}
    setConnection('connecting');
    const s=createSignalClient(); socket.current=s;
    s.on('connect',()=>{
      if(socket.current!==s)return;
      setConnection('online');setLivePeople([]);
      s.emit(EVENTS.join,{roomId:'main',player:{...MY_PLAYER,id:sessionId.current,...movement.positionRef.current}});
      notify('Connected. Awaiting backend participant updates.');
    });
    s.on(EVENTS.update,(players)=>{if(socket.current===s)setLivePeople(parsePlayers(players,sessionId.current));});
    s.on(EVENTS.leave,({id}={})=>{if(typeof id==='string')setLivePeople(prev=>prev.filter(p=>p.id!==id));});
    s.on('connect_error',()=>{
      if(socket.current===s){s.disconnect();socket.current=null;setConnection('demo');setLivePeople([]);notify('Backend unavailable — local demo still works.');}
    });
    s.on('disconnect',()=>{
      if(socket.current===s){socket.current=null;setConnection('demo');setLivePeople([]);notify('Backend disconnected — local demo restored.');}
    });
    s.connect();
  };
  const share=async()=>{
    try {await navigator.clipboard.writeText(window.location.href);notify('Page URL copied. Localhost works only on your computer.');}
    catch {notify('Copy your page URL from the browser address bar.');}
  };
  return <div className="app-layout">
    <Sidebar view={view} setView={setView} open={menuOpen} setOpen={setMenuOpen} openGuide={()=>setGuideOpen(true)}/>
    <main className="main-area"><TitleBar view={view} connection={connection} onConnect={toggleBackend} onMenu={()=>setMenuOpen(true)} onGuide={()=>setGuideOpen(true)}/>
      {view==='workspace' && <WorkspaceView movement={movement} people={people} connection={connection} setView={setView} showRadius={showRadius} setShowRadius={setShowRadius} showTrail={showTrail} setShowTrail={setShowTrail} guide={()=>setGuideOpen(true)} onShare={share} notify={notify} selected={selected} setSelected={setSelected} filter={filter} setFilter={setFilter}/>}
      {view==='team' && <TeamView people={people} connection={connection} pos={movement.position}/>}
      {view==='sprint' && <SprintView onGuide={()=>setGuideOpen(true)}/>}
    </main>
    {guideOpen && <DemoGuide close={()=>setGuideOpen(false)}/>}
    {toast && <div className="toast" role="status"><CheckCheck size={17}/>{toast}</div>}
  </div>;
}
