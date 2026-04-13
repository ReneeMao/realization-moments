import { useState, useEffect, useRef, useCallback } from 'react'
import Head from 'next/head'
import {
  saveReflection, loadReflections, updateReflectionOutput,
  deleteReflection, saveSummary,
} from '../lib/db'

/* ─── PALETTE ─── */
const C = {
  kiln:'#F5F0E8', slip:'#EDE6D9', bisque:'#E3D9CB',
  charcoal:'#3A3530', ash:'#8A8278', stone:'#6B645B',
  celadon:'#9DB4A0', celadonD:'#6E9273', celadonP:'#C7D6C5',
  terra:'#C8886E', terraP:'#E4C4B4',
  ochre:'#D4B87A', ochreP:'#E8DCC0',
  white:'#FDFBF7', cream:'#F9F5ED', line:'#DDD5C8',
  glow:'0 2px 20px rgba(58,53,48,0.06)',
  lift:'0 6px 28px rgba(58,53,48,0.10)',
}

/* ─── SYSTEM PROMPT ─── */
const SYS = `You are a structured reflective companion embedded in a guided reflection tool. You are not a therapist, counselor, crisis responder, or emotional expert. You are a careful, warm, non-clinical presence that helps people stay with an experience long enough for a different meaning to emerge.

This tool is designed for young adults — particularly those navigating bicultural, diaspora, or immigrant identity — who want to reflect on a moment of shifting meaning in their lives.

CORE STANCE:
- Evocative, not authoritative. Draw out the person's own meanings. Never tell them what their story "really means."
- Responsive, not controlling. Follow their language, pacing, emphasis.
- Tentative language: "one possibility," "could it be," "I wonder if," "it sounds like."
- Preserve authorship. The person is the expert on their own experience.
- Reduce shame. Never intensify performance or self-judgment.
- Treat contradiction, partial belonging, ongoing negotiation as ordinary, not problems.

DO NOT: infer hidden emotions as facts, assign mood scores, produce polished therapeutic language, push toward resolution, use narrowing labels, provide therapy/diagnosis.

CULTURAL SENSITIVITY: The person may use indirectness, understatement, translation, mixed frames. Do not assume flat affect means disengagement. Do not map onto Western emotional categories unless they do. Treat silence and partial expression as valid.

SAFETY: If writing suggests self-harm, suicidal ideation, danger, abuse, or severe distress, respond ONLY with: "Thank you for sharing something so important. What you're describing sounds like it might need more support than this tool can offer. Please reach out: 988 Suicide & Crisis Lifeline (call or text 988), Crisis Text Line (text HOME to 741741), findahelpline.com" — Do NOT continue.`

/* ─── PROMPT BUILDERS ─── */
const pS1 = (card, story) =>
  `${SYS}\n\nSTAGE: REFLECTIVE SUMMARY\nEntry card: "${card}"\nThey wrote: "${story}"\n\nAssess depth:\n\nTOO SHORT (1-2 sentences, no concrete scene):\n- Brief warm acknowledgment (1 sentence), then ONE grounding question for a specific moment/scene.\n- Begin with: [NEEDS_MORE]\n\nSHORT (one clear tension, enough detail):\n- Brief acknowledgment (1-2 sentences) reflecting what's at stake. Concrete next step asking for a specific moment.\n- Begin with: [READY]\n\nLONG (multiple threads):\n- Selective summary (2-4 sentences) using their language. Ask which part feels most important.\n- Begin with: [READY]\n\nDo not interpret. Do not add labels they didn't use.\nPlain text, no markdown. Include tag at start.`

const pDeep = (card, orig, _resp, extra) =>
  `${SYS}\n\nSTAGE: REFLECTIVE SUMMARY (second pass)\nEntry card: "${card}"\nOriginal: "${orig}"\nAdditional: "${extra}"\n\nCombine both. 2-3 sentence reflective summary using their language. Then a concrete next step.\nBegin with: [READY]\nPlain text, no markdown.`

const pS3 = (card, story, s1, focal) =>
  `${SYS}\n\nSTAGE: GUIDED REFLECTION\nEntry card: "${card}"\nStory: "${story}"\nSummary: "${s1}"\nFocal point: "${focal}"\n\nGenerate exactly 4 reflection questions using their specific language. 1-2 sentences each, as invitations.\n\n1. ANOTHER SIDE — notice fixed descriptions, look for exceptions\n2. THE BIGGER PICTURE — connect to broader conditions (family, culture, migration, language, institutions)\n3. A MOMENT THAT DID NOT FIT — moments outside the dominant story\n4. WHAT MATTERS MOST — what they care about deeply\n\nNo theoretical terms. Use their words.\nJSON: [{"label":"Another side","question":"..."},{"label":"The bigger picture","question":"..."},{"label":"A moment that did not fit","question":"..."},{"label":"What matters most","question":"..."}]\nONLY JSON.`

const pS4 = (card, story, s1, focal, cr) => {
  const ct = Object.entries(cr).filter(([,v])=>v?.trim()).map(([l,t])=>`[${l}]: ${t}`).join('\n')
  return `${SYS}\n\nSTAGE: EMERGENCE CHECK-BACK\nEntry: "${card}"\nStory: "${story}"\nSummary: "${s1}"\nFocal: "${focal}"\nReflections:\n${ct}\n\nGenerate EXACTLY 4 items — one for each category, in this order:\n1. What may be newly seen\n2. What still feels unresolved\n3. What seems to matter enough to guide you\n4. Who you may be becoming\n\nFor each item return:\n- "thread": a short title for the possible storyline (4-7 words, using the person's own language)\n- "statement": one tentative recognition grounded in their words ("It seems like…", "Could it be that…", "There may be something here about…")\n- "opening": one genuine question that helps them go further. Choose one purpose: test fit · clarify discrepancy · connect to values · notice what may endure · imagine a possible self · ask what would make this more real in life.\n\nDo not conclude. Do not explain the person to themselves. No therapeutic language.\nJSON: [{"thread":"…","statement":"…","opening":"…"}, …]\nONLY JSON.`
}

const pS5 = (type, conf, story, focal) => {
  const inst = {
    see:   'SEEING NOTE: 4-6 sentences. What may be newly visible or becoming clearer in how the person sees this experience? What has this shown them about themselves or their situation? Tentative throughout — "it seems like", "one possibility", "maybe what this is really showing". Use their own words. Do not conclude for them.',
    carry: 'CARRYING NOTE: 4-6 sentences. What matters enough here that the person might not want to lose it? What could shape what comes next — even in a small way? Do not prescribe a direction. Stay close to what they said. Leave it open.',
    keep:  'KEEPING NOTE: 3-4 sentences that end with one open question or one short reminder the person could return to on a harder day. The question should hold the tension without resolving it. The reminder should be portable and personal — something they could come back to.',
  }
  return `${SYS}\n\nSTAGE: CLOSING NOTE\nConfirmed: ${conf.map((s,i)=>`${i+1}. ${s}`).join('\n')}\nStory: "${story}"\nFocal: "${focal}"\n\n${inst[type]}\nBuild ONLY from their confirmed statements and their own language. No polished therapeutic phrasing.\nONLY plain text, no markdown.`
}

const pSummary = (period, items) => {
  const entries = items.map((r,i) => {
    const p = [`Reflection ${i+1} (${new Date(r.timestamp).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}):`]
    if (r.entryCard)           p.push(`Starting point: ${r.entryCard}`)
    if (r.userStory)           p.push(`Story: ${r.userStory}`)
    if (r.focalPointText)      p.push(`Going deeper: ${r.focalPointText}`)
    if (r.confirmedStatements?.length) p.push(`What stayed true: ${r.confirmedStatements.join(' | ')}`)
    if (r.outputText)          p.push(`Artifact: ${r.outputText}`)
    return p.join('\n')
  }).join('\n\n---\n\n')
  return `${SYS}\n\nSTAGE: PERIOD SYNTHESIS\nYou have ${items.length} reflection${items.length>1?'s':''} from ${period}.\n\nGenerate a synthesis that:\n- Notices recurring themes, tensions, or questions\n- Observes what seems to be shifting or evolving\n- Highlights what appears to matter consistently\n- Uses tentative language: "it seems like...", "what may be emerging..."\n- Is 4-6 warm, provisional sentences\n\nPlain text only, no markdown.\n\nReflections:\n${entries}`
}

/* ─── API CALL ─── */
async function ask(prompt) {
  const r = await fetch('/api/reflect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error(e.error || 'API error')
  }
  const d = await r.json()
  return d.text || ''
}

/* ─── EXPORT ─── */
function buildExportText(d) {
  const L = []
  L.push(`REALIZATION MOMENTS\n${new Date(d.timestamp).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}\n\nStarting point: ${d.entryCard}\n`)
  if (d.userStory)           L.push(`My Story\n${d.userStory}\n`)
  if (d.stage1Response)      L.push(`What I Heard Back\n${d.stage1Response}\n`)
  if (d.focalPointText)      L.push(`Going Deeper\n${d.focalPointText}\n`)
  if (d.cardResponses) {
    L.push('Reflections')
    Object.entries(d.cardResponses).forEach(([l,t]) => { if(t?.trim()) L.push(`\n◆ ${l}\n${t}`) })
    L.push('')
  }
  if (d.confirmedStatements?.length) {
    L.push('What Stayed True')
    d.confirmedStatements.forEach(s => L.push(`• ${s}`))
    L.push('')
  }
  if (d.outputText) L.push(`My Artifact\n${d.outputText}\n`)
  L.push('This is yours. Partial, revisable, not a record of truth.')
  return L.join('\n')
}
function dlFile(text, filename) {
  const b=new Blob([text],{type:'text/plain;charset=utf-8'}), u=URL.createObjectURL(b), a=document.createElement('a')
  a.href=u; a.download=filename; a.click(); URL.revokeObjectURL(u)
}

/* ─── CARD GLAZE PALETTE ─── */
// Each entry card gets a distinct ceramic glaze color.
// g = main glaze, l = light (rim wash / petal alt), d = dark (drip / stem)
const CARD_GLAZE = {
  'A moment I keep thinking about':             {g:'#C8906A',l:'#EDDBB8',d:'#9A6440'},
  "A pattern I've been noticing":               {g:'#7CAF8C',l:'#B8D4BC',d:'#568A6A'},
  'Something that feels different lately':      {g:'#C4889C',l:'#E2C0CA',d:'#A06478'},
  "Something someone said that stayed with me": {g:'#7898BA',l:'#B8CADC',d:'#507898'},
  'Two parts of me want different things':      {g:'#9C88BA',l:'#C8BCDA',d:'#746898'},
}
const cardGlaze = label => CARD_GLAZE[label] || {g:C.celadon,l:C.celadonP,d:C.celadonD}

/* ─── POT SVG — soft illustrated ceramic ─── */
// viewBox is always "0 0 48 58" (slightly taller than wide).
// width/height props scale the whole illustration.
// cardLabel drives the glaze color; phase controls what's shown.
function Pot({ phase='clay', size=60, cardLabel }) {
  const ph = Math.round(size * 58 / 48)
  const {g:G, l:Gl, d:Gd} = cardGlaze(cardLabel)

  // Organic pot body (smooth bezier curves — not geometric)
  const BODY  = 'M16 17C11 26 9 37 11 49Q24 57 37 49C39 37 37 26 32 17Z'
  // Glaze zone: covers upper ~70 % of body, organic bottom edge
  const GLAZE = 'M16 17C11 26 10 35 12 43Q18 49 24 50Q30 49 36 43C38 35 37 26 32 17Z'

  if (phase === 'clay') return (
    <svg width={size} height={ph} viewBox="0 0 48 58" fill="none">
      <path d={BODY} fill={C.slip} stroke={C.ash} strokeWidth="0.9" strokeDasharray="2.5 2" opacity="0.55"/>
      <ellipse cx="24" cy="17" rx="8" ry="2.7" fill={C.slip} stroke={C.ash} strokeWidth="0.9" strokeDasharray="2.5 2" opacity="0.55"/>
    </svg>
  )

  // Shared base: warm clay body + all surface details
  const base = <>
    <path d={BODY} fill={C.terraP} stroke={C.terra} strokeWidth="0.85"/>
    <ellipse cx="24" cy="17" rx="8" ry="2.7" fill={C.terraP} stroke={C.terra} strokeWidth="0.85"/>
    {/* inner rim shadow */}
    <ellipse cx="24" cy="17" rx="6.8" ry="1.9" fill="rgba(58,53,48,0.09)"/>
    {/* right body shadow — gives roundness */}
    <path d="M34 21C36 30 37 39 35 48Q32 50 29 51C34 45 37 35 35 23Z" fill="rgba(58,53,48,0.055)"/>
    {/* specular highlight top-left */}
    <ellipse cx="18.5" cy="30" rx="4" ry="6.5" fill="white" opacity="0.17" transform="rotate(-20 18.5 30)"/>
    {/* cast shadow under base */}
    <ellipse cx="24" cy="54" rx="12" ry="2.2" fill="rgba(58,53,48,0.07)"/>
  </>

  if (phase === 'shaped') return (
    <svg width={size} height={ph} viewBox="0 0 48 58" fill="none">
      {base}
      {/* throwing rings */}
      <path d="M13 31Q24 33 35 31" stroke={C.terra} strokeWidth="0.55" opacity="0.3"/>
      <path d="M12 40Q24 42 36 40" stroke={C.terra} strokeWidth="0.45" opacity="0.2"/>
    </svg>
  )

  if (phase === 'bisque') return (
    <svg width={size} height={ph} viewBox="0 0 48 58" fill="none">
      {base}
      {/* kiln smoke wisps */}
      <path d="M20 16Q21 11 19 8Q20.5 5 21.5 8Q22 4 23 8" stroke={C.ochre} strokeWidth="0.7" fill="none" opacity="0.28" strokeLinecap="round"/>
      <path d="M27 16Q28 10 26 7Q27.5 3 29 7" stroke={C.ochre} strokeWidth="0.6" fill="none" opacity="0.2" strokeLinecap="round"/>
    </svg>
  )

  // Glazed layer: colored wash + drips + highlight
  const glazed = <>
    {base}
    {/* main glaze wash */}
    <path d={GLAZE} fill={G} opacity="0.7"/>
    {/* lighter wash at rim — glaze is thicker / paler there */}
    <path d="M16 17C11 26 11 32 13 36Q18 38 24 38Q30 38 35 36C37 32 37 26 32 17Z" fill={Gl} opacity="0.28"/>
    {/* glaze drip 1 — right side */}
    <path d="M33 43Q33.5 47 32 50" stroke={Gd} strokeWidth="2.2" strokeLinecap="round" opacity="0.48"/>
    {/* glaze drip 2 — center-left, smaller */}
    <path d="M22 46Q22.2 49 21.5 51" stroke={Gd} strokeWidth="1.4" strokeLinecap="round" opacity="0.3"/>
    {/* reflection on glaze surface */}
    <ellipse cx="18.5" cy="27" rx="3.5" ry="5.5" fill="white" opacity="0.2" transform="rotate(-20 18.5 27)"/>
  </>

  if (phase === 'glazed') return (
    <svg width={size} height={ph} viewBox="0 0 48 58" fill="none" style={{filter:`drop-shadow(0 3px 10px ${G}44)`}}>
      {glazed}
    </svg>
  )

  // blooming: glazed + stem + leaves + flower
  return (
    <svg width={size} height={ph} viewBox="0 0 48 58" fill="none" style={{filter:`drop-shadow(0 4px 12px ${G}55)`}}>
      {glazed}
      {/* stem */}
      <path d="M24 17V7" stroke={Gd} strokeWidth="1.25" strokeLinecap="round"/>
      {/* left leaf */}
      <path d="M24 13C22 11 17 10 16 12C18 11 22 12.5 24 14Z" fill={G} opacity="0.82"/>
      {/* right leaf */}
      <path d="M24 10C26 8 31 8 32 10C30 9 26 10.5 24 11.5Z" fill={Gl} opacity="0.9"/>
      {/* 5-petal flower */}
      {[0,72,144,216,288].map((a,i)=>(
        <ellipse key={i} cx="24" cy="5.5" rx="2.4" ry="3.8"
          fill={i%2===0?G:Gl} opacity="0.82"
          transform={`rotate(${a} 24 5.5)`}/>
      ))}
      {/* flower centre */}
      <circle cx="24" cy="5.5" r="2.1" fill={C.ochre} opacity="0.92"/>
      <circle cx="24" cy="5.5" r="0.9" fill={C.white} opacity="0.7"/>
    </svg>
  )
}

/* ─── PROGRESS ─── */
const PHASES=['Clay','Shaped','Fired','Glazed','Blooming']
const stageIdx=s=>({landing:0,entry:0,stage1:1,stage3:2,stage4:3,stage5:4,artifact:4,closing:4}[s]??0)
function Progress({stage}){
  const idx=stageIdx(stage)
  return(
    <div style={{display:'flex',alignItems:'center',marginBottom:24,padding:'0 4px'}}>
      {PHASES.map((label,i)=>(
        <div key={i} style={{display:'flex',alignItems:'center',flex:i<4?1:'none'}}>
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:i<=idx?C.celadon:C.line,transition:'background 0.4s',boxShadow:i===idx?`0 0 6px ${C.celadon}66`:'none'}}/>
            <span style={{fontSize:9,color:i<=idx?C.celadonD:C.ash,fontFamily:'DM Sans,sans-serif',whiteSpace:'nowrap'}}>{label}</span>
          </div>
          {i<4&&<div style={{flex:1,height:1,background:i<idx?C.celadon:C.line,margin:'0 4px',marginBottom:14,transition:'background 0.4s'}}/>}
        </div>
      ))}
    </div>
  )
}

/* ─── SHARED UI ─── */
function FadeIn({children,delay=0,style={}}){const[v,setV]=useState(false);useEffect(()=>{const t=setTimeout(()=>setV(true),delay);return()=>clearTimeout(t)},[delay]);return <div style={{opacity:v?1:0,transform:v?'translateY(0)':'translateY(8px)',transition:'opacity 0.5s,transform 0.5s',...style}}>{children}</div>}
function Dots(){return(<div style={{display:'flex',gap:6,alignItems:'center',padding:'28px 0'}}>{[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:'50%',background:C.celadon,animation:`dp 1.2s ease ${i*.2}s infinite`}}/>)}<style>{`@keyframes dp{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}`}</style></div>)}
function Btn({children,onClick,v='primary',disabled,style={}}){const base={padding:'10px 22px',borderRadius:20,border:'none',fontSize:13,fontFamily:'DM Serif Display,Georgia,serif',cursor:disabled?'not-allowed':'pointer',transition:'all 0.2s',opacity:disabled?.4:1,...style};const vs={primary:{background:C.celadon,color:C.white,fontWeight:500},secondary:{background:'transparent',color:C.charcoal,border:`1.5px solid ${C.line}`},soft:{background:C.slip,color:C.charcoal}};return <button style={{...base,...vs[v]}} onClick={onClick} disabled={disabled}>{children}</button>}
function TA({value,onChange,placeholder,minH=120}){const ref=useRef(null);useEffect(()=>{if(ref.current){ref.current.style.height='auto';ref.current.style.height=Math.max(minH,ref.current.scrollHeight)+'px'}},[value,minH]);return <textarea ref={ref} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:'100%',minHeight:minH,padding:16,borderRadius:14,border:`1.5px solid ${C.line}`,background:C.white,color:C.charcoal,fontSize:15,lineHeight:1.7,fontFamily:'DM Sans,sans-serif',resize:'none',outline:'none',boxSizing:'border-box',transition:'border-color 0.2s'}} onFocus={e=>e.target.style.borderColor=C.celadon} onBlur={e=>e.target.style.borderColor=C.line}/>}
function Tag({children,color=C.celadon}){return <span style={{display:'inline-block',padding:'2px 10px',borderRadius:12,background:color+'18',color,fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em',fontFamily:'DM Sans,sans-serif',marginBottom:4}}>{children}</span>}
function Sep(){return <div style={{width:32,height:1,background:`linear-gradient(to right,${C.celadon},transparent)`,margin:'16px 0'}}/>}
function ErrMsg({err}){return err?<div style={{background:C.terraP+'66',borderRadius:12,padding:'10px 14px',marginBottom:12,fontSize:12,fontFamily:'DM Sans,sans-serif',color:C.terra,border:`1px solid ${C.terra}44`}}>{err}</div>:null}

/* ─── ENTRY CARDS ─── */
const CARDS=[
  {label:'A moment I keep thinking about',nudge:"What happened? Where were you? You don't need to explain why it matters yet."},
  {label:"A pattern I've been noticing",nudge:"When does it show up? What does it look like? You don't need to have it figured out."},
  {label:'Something that feels different lately',nudge:"What feels different about you, or how you see things? Even something subtle counts."},
  {label:'Something someone said that stayed with me',nudge:"What did they say? What was the situation? You don't need to know why it stuck."},
  {label:'Two parts of me want different things',nudge:"What does each part want? What does it feel like to be in between?"},
]

/* ─── JOURNEY ARTIFACT ─── */
function Journey({data,onEdit,onExport}){
  const[exp,setExp]=useState(null);const[editing,setEditing]=useState(false);const[draft,setDraft]=useState(data.outputText||'')
  useEffect(()=>{setDraft(data.outputText||'')},[data.outputText])
  const secs=[{k:'story',icon:'✦',t:'Where I started',sub:data.entryCard,body:data.userStory},{k:'heard',icon:'◇',t:'What I heard back',body:data.stage1Response},{k:'deeper',icon:'↳',t:'Going deeper',body:data.focalPointText}]
  const ce=data.cardResponses?Object.entries(data.cardResponses).filter(([,v])=>v?.trim()):[]
  if(ce.length)secs.push({k:'cards',icon:'❋',t:'Reflections',cards:ce})
  if(data.confirmedStatements?.length)secs.push({k:'conf',icon:'◈',t:'What stayed true',stmts:data.confirmedStatements})
  const outLabel={see:'What I\'m seeing now',carry:'What matters going forward',keep:'What I want to keep with me',meaning:'What I may be understanding now',direction:'What feels important enough to guide me',retelling:'The story I may be telling differently now',future:'A note from the self I may be becoming',question:'A question I want to keep living with',remember:'What I want to remember when I forget',reflective:'Looking back',firstperson:'In my words',values:'What matters now'}[data.outputType]||'Your artifact'
  return(
    <div style={{background:C.cream,borderRadius:22,boxShadow:C.lift,overflow:'hidden',border:`1px solid ${C.line}`}}>
      <div style={{background:`linear-gradient(135deg,${C.celadonP}66,${C.slip})`,padding:'20px 20px 16px',display:'flex',alignItems:'center',gap:12}}>
        <Pot phase="blooming" size={44} cardLabel={data.entryCard}/>
        <div><Tag color={C.celadonD}>Realization Moments</Tag><div style={{fontSize:12,color:C.ash,fontFamily:'DM Sans,sans-serif'}}>{new Date(data.timestamp).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</div></div>
      </div>
      <div style={{padding:'4px 0'}}>
        {secs.map((s,i)=>{const open=exp===s.k;return(<div key={s.k}>
          <button onClick={()=>setExp(open?null:s.k)} style={{width:'100%',textAlign:'left',background:'transparent',border:'none',cursor:'pointer',padding:'11px 20px',fontFamily:'DM Serif Display,Georgia,serif',display:'flex',alignItems:'center',gap:11,transition:'background 0.15s'}} onMouseEnter={e=>e.currentTarget.style.background=C.slip+'88'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',width:16,flexShrink:0}}><span style={{fontSize:11,color:C.celadon}}>{s.icon}</span>{i<secs.length-1&&<div style={{width:1,height:5,background:C.line,marginTop:2}}/>}</div>
            <div style={{flex:1}}><div style={{fontSize:13,color:C.charcoal}}>{s.t}</div>{s.sub&&<div style={{fontSize:11,color:C.ash,fontFamily:'DM Sans,sans-serif'}}>{s.sub}</div>}</div>
            <span style={{fontSize:13,color:C.ash,transform:open?'rotate(180deg)':'',transition:'transform 0.2s'}}>▾</span>
          </button>
          {open&&<div style={{padding:'2px 20px 12px 47px',animation:'fs 0.3s ease'}}>
            {s.body&&<p style={{fontSize:13,lineHeight:1.75,color:C.charcoal,margin:0,fontFamily:'DM Sans,sans-serif'}}>{s.body}</p>}
            {s.cards?.map(([l,t],j)=><div key={j} style={{marginBottom:j<s.cards.length-1?10:0}}><Tag color={C.celadonD}>{l}</Tag><p style={{fontSize:13,lineHeight:1.75,color:C.charcoal,margin:'4px 0 0',fontFamily:'DM Sans,sans-serif'}}>{t}</p></div>)}
            {s.stmts?.map((st,j)=><div key={j} style={{display:'flex',gap:7,alignItems:'flex-start',marginBottom:4}}><span style={{color:C.celadon,fontSize:8,marginTop:6}}>●</span><p style={{fontSize:13,lineHeight:1.7,color:C.charcoal,margin:0,fontFamily:'DM Sans,sans-serif'}}>{st}</p></div>)}
          </div>}
          {i<secs.length-1&&!open&&<div style={{marginLeft:28,width:1,height:3,background:C.line}}/>}
        </div>)})}
      </div>
      <div style={{borderTop:`1px solid ${C.line}`,padding:'18px 20px'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}><Tag color={C.terra}>{outLabel}</Tag></div>
        {editing?(<div><TA value={draft} onChange={setDraft} minH={80}/><div style={{display:'flex',gap:6,marginTop:8}}><Btn v="soft" onClick={()=>{onEdit(draft);setEditing(false)}} style={{fontSize:11,padding:'5px 12px'}}>Save</Btn><Btn v="secondary" onClick={()=>{setDraft(data.outputText);setEditing(false)}} style={{fontSize:11,padding:'5px 12px'}}>Cancel</Btn></div></div>):(
          <div style={{background:C.white,borderRadius:14,padding:16,borderLeft:`3px solid ${C.celadon}`}}><p style={{fontSize:14,lineHeight:1.8,color:C.charcoal,margin:0,whiteSpace:'pre-wrap',fontFamily:'DM Sans,sans-serif'}}>{data.outputText}</p></div>
        )}
        <p style={{fontSize:11,color:C.ash,fontStyle:'italic',margin:'8px 0 10px',fontFamily:'DM Sans,sans-serif'}}>A draft. Yours to change.</p>
        <div style={{display:'flex',gap:6}}>{!editing&&<Btn v="secondary" onClick={()=>setEditing(true)} style={{fontSize:11,padding:'5px 11px'}}>Edit</Btn>}<Btn v="secondary" onClick={()=>navigator.clipboard?.writeText(data.outputText)} style={{fontSize:11,padding:'5px 11px'}}>Copy</Btn><Btn v="secondary" onClick={onExport} style={{fontSize:11,padding:'5px 11px'}}>Export .txt</Btn></div>
      </div>
      <style>{`@keyframes fs{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  )
}

/* ─── SUMMARY CARD ─── */
function SummaryCard({text,period,onExport}){
  return(
    <div style={{background:C.cream,borderRadius:18,boxShadow:C.lift,overflow:'hidden',border:`1px solid ${C.celadonP}`,marginBottom:20}}>
      <div style={{background:`linear-gradient(135deg,${C.celadonP}88,${C.ochreP}66)`,padding:'14px 18px',display:'flex',alignItems:'center',gap:10}}>
        <Pot phase="blooming" size={40}/><div><Tag color={C.celadonD}>Synthesis</Tag><div style={{fontSize:11,color:C.stone,fontFamily:'DM Sans,sans-serif'}}>{period}</div></div>
      </div>
      <div style={{padding:'16px 18px'}}>
        <p style={{fontSize:14,lineHeight:1.85,color:C.charcoal,margin:0,fontFamily:'DM Sans,sans-serif',fontStyle:'italic'}}>{text}</p>
        <p style={{fontSize:11,color:C.ash,margin:'12px 0 10px',fontFamily:'DM Sans,sans-serif'}}>A provisional reading. Yours to contest or keep.</p>
        <div style={{display:'flex',gap:6}}><Btn v="secondary" onClick={()=>navigator.clipboard?.writeText(text)} style={{fontSize:11,padding:'5px 11px'}}>Copy</Btn><Btn v="secondary" onClick={onExport} style={{fontSize:11,padding:'5px 11px'}}>Export .txt</Btn></div>
      </div>
    </div>
  )
}

/* ─── HISTORY VIEW ─── */
function Hist({items,onBack,onView,onDel}){
  const[filter,setFilter]=useState('all');const[summaryText,setSummaryText]=useState('');const[summaryLoading,setSummaryLoading]=useState(false);const[summaryError,setSummaryError]=useState('')
  const now=new Date()
  const filtered=items.filter(r=>{if(filter==='all')return true;const d=new Date(r.timestamp);if(filter==='month')return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();if(filter==='year')return d.getFullYear()===now.getFullYear();return true})
  const periodLabel=filter==='month'?now.toLocaleDateString('en-US',{month:'long',year:'numeric'}):filter==='year'?String(now.getFullYear()):'All time'
  const generateSummary=async()=>{if(!filtered.length)return;setSummaryLoading(true);setSummaryError('');setSummaryText('');try{const text=await ask(pSummary(periodLabel,filtered));setSummaryText(text);await saveSummary({period:filter,periodLabel,summaryText:text})}catch(e){setSummaryError(e.message||'Could not generate synthesis.')}setSummaryLoading(false)}
  const FBtn=({val,label})=><button onClick={()=>{setFilter(val);setSummaryText('');setSummaryError('')}} style={{padding:'5px 14px',borderRadius:14,border:`1.5px solid ${filter===val?C.celadon:C.line}`,background:filter===val?C.celadonP+'33':'transparent',color:filter===val?C.celadonD:C.ash,fontSize:11,fontFamily:'DM Sans,sans-serif',cursor:'pointer',transition:'all 0.15s'}}>{label}</button>
  if(!items.length)return(<div style={{textAlign:'center',padding:'48px 16px'}}><Pot phase="clay" size={48}/><p style={{color:C.ash,fontSize:13,margin:'12px 0 16px',fontFamily:'DM Sans,sans-serif'}}>No reflections yet.</p><Btn v="secondary" onClick={onBack}>Back</Btn></div>)
  return(
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}><h2 style={{fontSize:17,fontWeight:400,margin:0}}>Past reflections</h2><Btn v="secondary" onClick={onBack} style={{fontSize:11,padding:'5px 11px'}}>Back</Btn></div>
      <div style={{display:'flex',gap:6,marginBottom:16}}><FBtn val="all" label="All"/><FBtn val="month" label="This month"/><FBtn val="year" label="This year"/></div>
      {filtered.length>=2&&(<div style={{marginBottom:16}}>
        {/* Pot shelf — visual gallery of this period's reflections */}
        <FadeIn><div style={{display:'flex',alignItems:'flex-end',gap:4,marginBottom:12,paddingBottom:8,borderBottom:`1px solid ${C.line}`,overflowX:'auto'}}>
          {filtered.map((r,i)=>(
            <div key={r.id} title={r.entryCard} style={{flexShrink:0,opacity:0.92,transition:'transform 0.15s',cursor:'pointer'}} onClick={()=>onView(r)}>
              <Pot phase="blooming" size={36} cardLabel={r.entryCard}/>
            </div>
          ))}
        </div></FadeIn>
        {!summaryText&&!summaryLoading&&(<FadeIn><div style={{background:C.slip,borderRadius:14,padding:'12px 14px',border:`1px dashed ${C.celadonP}`,display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}><div><p style={{fontSize:12,color:C.stone,fontFamily:'DM Sans,sans-serif',margin:'0 0 2px'}}>{filtered.length} reflection{filtered.length>1?'s':''} · {periodLabel}</p><p style={{fontSize:11,color:C.ash,fontFamily:'DM Sans,sans-serif',margin:0}}>Synthesize themes across this period</p></div><Btn onClick={generateSummary} style={{fontSize:11,padding:'7px 14px',whiteSpace:'nowrap'}}>Synthesize ✦</Btn></div></FadeIn>)}
        {summaryLoading&&(<div style={{background:C.slip,borderRadius:14,padding:'12px 14px'}}><p style={{fontSize:12,color:C.ash,fontFamily:'DM Sans,sans-serif',marginBottom:4}}>Reading across your reflections…</p><Dots/></div>)}
        {summaryError&&(<div style={{background:C.terraP+'44',borderRadius:14,padding:'12px 14px',border:`1px solid ${C.terra}44`,marginBottom:8}}><p style={{fontSize:12,color:C.terra,fontFamily:'DM Sans,sans-serif'}}>{summaryError}</p></div>)}
        {summaryText&&(<FadeIn><SummaryCard text={summaryText} period={periodLabel} onExport={()=>dlFile(`REALIZATION MOMENTS — SYNTHESIS\n${periodLabel}\n\n${summaryText}\n\nA provisional reading. Yours to contest or keep.`,`synthesis-${filter}-${new Date().toISOString().slice(0,10)}.txt`)}/></FadeIn>)}
      </div>)}
      {filtered.length===0?(<p style={{fontSize:13,color:C.ash,textAlign:'center',padding:'24px 0',fontFamily:'DM Sans,sans-serif'}}>No reflections in this period.</p>):(
        <div style={{display:'flex',flexDirection:'column',gap:7}}>
          {filtered.map((r,i)=>(<FadeIn key={r.id} delay={i*30}><div style={{background:C.cream,borderRadius:14,padding:'12px 14px',boxShadow:C.glow,border:`1px solid ${C.line}`,display:'flex',alignItems:'center',gap:10}}>
            <Pot phase="blooming" size={32} cardLabel={r.entryCard}/>
            <div style={{flex:1,minWidth:0}}><p style={{fontSize:13,margin:'0 0 2px',color:C.charcoal}}>{r.entryCard}</p><p style={{fontSize:11,color:C.ash,margin:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontFamily:'DM Sans,sans-serif'}}>{new Date(r.timestamp).toLocaleDateString('en-US',{month:'short',day:'numeric'})} · {r.userStory?.substring(0,50)}…</p></div>
            <Btn v="soft" onClick={()=>onView(r)} style={{fontSize:10,padding:'4px 10px'}}>View</Btn>
            <button onClick={()=>onDel(r.id)} style={{background:'transparent',border:'none',cursor:'pointer',color:C.ash,fontSize:16,lineHeight:1}}>×</button>
          </div></FadeIn>))}
        </div>
      )}
    </div>
  )
}

/* ─── MAIN APP ─── */
export default function Home(){
  const[stage,setStage]=useState('landing');const[selC,setSC]=useState(null);const[story,setStory]=useState('');const[s1,setS1]=useState('');const[focal,setFocal]=useState('');const[rC,setRC]=useState([]);const[cR,setCR]=useState({});const[oC,setOC]=useState(null);const[rvS,setRvS]=useState([]);const[rvM,setRvM]=useState({});const[oT,setOT]=useState(null);const[oTx,setOTx]=useState('');const[ld,setLd]=useState(false);const[err,setErr]=useState('');const[past,setPast]=useState([]);const[vw,setVw]=useState(null);const[svd,setSvd]=useState(null);const[nm,setNm]=useState(false);const[dR,setDR]=useState('');const[dT,setDT]=useState('')
  const sr=useRef(null)
  useEffect(()=>{sr.current?.scrollTo({top:0,behavior:'smooth'})},[stage])
  useEffect(()=>{loadReflections().then(setPast)},[])
  const reset=useCallback(()=>{setSC(null);setStory('');setS1('');setFocal('');setRC([]);setCR({});setOC(null);setRvS([]);setRvM({});setOT(null);setOTx('');setSvd(null);setVw(null);setNm(false);setDR('');setDT('');setErr('')},[])
  const sd=useCallback(()=>({timestamp:Date.now(),entryCard:selC?.label,userStory:story,stage1Response:s1,focalPointText:focal,cardResponses:cR,confirmedStatements:rvS.filter((_,i)=>rvM[i]==='fits'||rvM[i]==='notquite').map(s=>s?.statement||s),outputType:oT,outputText:oTx}),[selC,story,s1,focal,cR,rvS,rvM,oT,oTx])
  const W={minHeight:'100vh',background:C.kiln,fontFamily:'DM Serif Display,Georgia,serif',color:C.charcoal,display:'flex',justifyContent:'center',overflowY:'auto'}
  const I={width:'100%',maxWidth:560,padding:'32px 18px 64px'}

  if(stage==='landing')return(<><Head><title>Realization Moments</title><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet"/></Head>
    <div style={W} ref={sr}><div style={I}>
      <FadeIn><div style={{textAlign:'center',marginBottom:32}}><Pot phase="clay" size={64}/><h1 style={{fontSize:21,fontWeight:400,margin:'14px 0 8px',letterSpacing:'-0.01em'}}>Realization Moments</h1><p style={{color:C.ash,fontSize:13,lineHeight:1.6,maxWidth:320,margin:'0 auto',fontFamily:'DM Sans,sans-serif'}}>A space to stay with an experience<br/>long enough to see it differently.</p></div></FadeIn>
      <FadeIn delay={80}><div style={{background:C.cream,borderRadius:18,padding:'16px',boxShadow:C.glow,marginBottom:12,border:`1px solid ${C.line}`}}><p style={{fontSize:13,lineHeight:1.7,marginBottom:12,fontFamily:'DM Sans,sans-serif'}}>Explore an experience at your own pace. Leave with something you can keep and revise.</p><Sep/><div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:6}}><Tag color={C.stone}>Not therapy</Tag><Tag color={C.stone}>Not crisis support</Tag><Tag color={C.stone}>No tracking</Tag></div><p style={{fontSize:11,color:C.ash,fontFamily:'DM Sans,sans-serif',margin:'6px 0 0'}}>Avoid identifying details. All outputs are drafts.</p></div></FadeIn>
      <FadeIn delay={140}><div style={{background:C.terraP+'66',borderRadius:12,padding:'9px 14px',fontSize:11,lineHeight:1.6,marginBottom:22,fontFamily:'DM Sans,sans-serif'}}>In crisis: <strong>988</strong> (call/text) · <strong>741741</strong> (text HOME) · <a href="https://findahelpline.com" target="_blank" rel="noreferrer" style={{color:C.celadonD}}>findahelpline.com</a></div></FadeIn>
      <FadeIn delay={200}><div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8}}><Btn onClick={()=>{reset();setStage('entry')}} style={{padding:'11px 44px',fontSize:14,borderRadius:24}}>Begin</Btn>{past.length>0&&<Btn v="secondary" onClick={()=>setStage('history')} style={{fontSize:12}}>Past reflections <span style={{background:C.celadon+'22',padding:'1px 7px',borderRadius:10,fontSize:11,marginLeft:4,color:C.celadonD}}>{past.length}</span></Btn>}</div></FadeIn>
    </div></div></>)

  if(stage==='history'){
    if(vw)return(<div style={W} ref={sr}><div style={I}><FadeIn><Btn v="secondary" onClick={()=>setVw(null)} style={{fontSize:11,padding:'5px 11px',marginBottom:12}}>← Back</Btn><Journey data={vw} onEdit={async t=>{await updateReflectionOutput(vw.id,t);setVw({...vw,outputText:t});setPast(await loadReflections())}} onExport={()=>dlFile(buildExportText(vw),`reflection-${new Date(vw.timestamp).toISOString().slice(0,10)}.txt`)}/></FadeIn></div></div>)
    return(<div style={W} ref={sr}><div style={I}><Hist items={past} onBack={()=>setStage('landing')} onView={r=>setVw(r)} onDel={async id=>{await deleteReflection(id);setPast(await loadReflections())}}/></div></div>)
  }

  if(stage==='entry')return(
    <div style={W} ref={sr}><div style={I}>
      <FadeIn><div style={{textAlign:'center',marginBottom:18}}><Pot phase="clay" size={48}/></div></FadeIn>
      <FadeIn delay={40}><p style={{fontSize:13,color:C.ash,marginBottom:16,textAlign:'center',fontFamily:'DM Sans,sans-serif'}}>What feels like the easiest place to start?</p></FadeIn>
      <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:20}}>{CARDS.map((c,i)=><FadeIn key={i} delay={60+i*35}><button onClick={()=>setSC(selC?.label===c.label?null:c)} style={{width:'100%',textAlign:'left',padding:'12px 14px',borderRadius:14,border:`1.5px solid ${selC?.label===c.label?C.celadon:C.line}`,background:selC?.label===c.label?C.celadonP+'22':C.cream,cursor:'pointer',fontSize:14,fontFamily:'DM Serif Display,Georgia,serif',color:C.charcoal,transition:'all 0.2s',boxShadow:C.glow}}>{c.label}</button></FadeIn>)}</div>
      {selC&&<FadeIn key={selC.label}><p style={{fontSize:12,color:C.ash,lineHeight:1.6,marginBottom:8,fontStyle:'italic',fontFamily:'DM Sans,sans-serif'}}>{selC.nudge}</p><TA value={story} onChange={setStory} placeholder="Write a few lines…" minH={130}/><ErrMsg err={err}/><div style={{textAlign:'right',marginTop:10}}><Btn onClick={async()=>{setLd(true);setErr('');setStage('stage1');try{const raw=await ask(pS1(selC.label,story));if(raw.startsWith('[NEEDS_MORE]')){setNm(true);setDR(raw.replace('[NEEDS_MORE]','').trim());setS1('')}else{setNm(false);setS1(raw.replace('[READY]','').trim())}}catch(e){setErr(e.message);setS1('Thank you for sharing that. Can you say a bit more about a specific moment?')}setLd(false)}} disabled={!story.trim()}>Continue</Btn></div></FadeIn>}
    </div></div>)

  if(stage==='stage1')return(
    <div style={W} ref={sr}><div style={I}>
      <FadeIn><div style={{textAlign:'center',marginBottom:16}}><Pot phase="shaped" size={48}/></div></FadeIn>
      <FadeIn><Progress stage={stage}/></FadeIn>
      {ld?<Dots/>:nm?(<><FadeIn delay={50}><div style={{background:C.cream,borderRadius:16,padding:16,boxShadow:C.glow,marginBottom:16,borderLeft:`3px solid ${C.terra}`,border:`1px solid ${C.line}`}}><p style={{fontSize:14,lineHeight:1.8,fontFamily:'DM Sans,sans-serif'}}>{dR}</p></div></FadeIn><FadeIn delay={120}><TA value={dT} onChange={setDT} placeholder="Add a bit more…" minH={80}/><ErrMsg err={err}/><div style={{textAlign:'right',marginTop:10}}><Btn onClick={async()=>{setLd(true);setErr('');const c=story+'\n\n'+dT;setStory(c);try{const raw=await ask(pDeep(selC.label,story,dR,dT));setS1(raw.replace('[READY]','').trim())}catch(e){setErr(e.message);setS1("Thank you. What feels most alive in what you've described?")}setNm(false);setLd(false)}} disabled={!dT.trim()}>Continue</Btn></div></FadeIn></>):(<><FadeIn delay={50}><Tag>Listening</Tag><div style={{background:C.cream,borderRadius:16,padding:16,boxShadow:C.glow,marginTop:8,marginBottom:16,borderLeft:`3px solid ${C.celadon}`,border:`1px solid ${C.line}`}}><p style={{fontSize:14,lineHeight:1.8,fontFamily:'DM Sans,sans-serif'}}>{s1}</p></div></FadeIn><FadeIn delay={120}><TA value={focal} onChange={setFocal} placeholder="Respond here…" minH={80}/><ErrMsg err={err}/><div style={{textAlign:'right',marginTop:10}}><Btn onClick={async()=>{setLd(true);setErr('');setStage('stage3');try{setRC(JSON.parse((await ask(pS3(selC.label,story,s1,focal))).replace(/```json|```/g,'').trim()))}catch{setRC([{label:'Another side',question:"Have there been moments where this didn't fit?"},{label:'The bigger picture',question:"Do any larger pressures come to mind?"},{label:'A moment that did not fit',question:"Was there a moment where something felt different?"},{label:'What matters most',question:"What does this say about what you care about?"}])}setLd(false)}} disabled={!focal.trim()}>Continue</Btn></div></FadeIn></>)}
    </div></div>)

  if(stage==='stage3'){const ans=Object.values(cR).filter(v=>v?.trim()).length;return(<div style={W} ref={sr}><div style={I}><FadeIn><div style={{textAlign:'center',marginBottom:16}}><Pot phase="bisque" size={48} cardLabel={selC?.label}/></div></FadeIn><FadeIn><Progress stage={stage}/></FadeIn>{ld?<Dots/>:<><FadeIn><Tag>Exploring</Tag><p style={{fontSize:13,lineHeight:1.55,marginTop:6,marginBottom:16,color:C.stone,fontFamily:'DM Sans,sans-serif'}}>Take what resonates. Skip what doesn't.</p></FadeIn><div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:20}}>{rC.map((c,i)=>{const op=oC===i,has=cR[c.label]?.trim();return(<FadeIn key={i} delay={40+i*35}><div style={{background:C.cream,borderRadius:16,border:`1.5px solid ${has?C.celadon:C.line}`,boxShadow:op?C.lift:C.glow,overflow:'hidden',transition:'all 0.2s'}}><button onClick={()=>setOC(op?null:i)} style={{width:'100%',textAlign:'left',padding:'12px 14px',background:'transparent',border:'none',cursor:'pointer',fontFamily:'DM Serif Display,Georgia,serif',display:'flex',alignItems:'center',gap:9}}><span style={{width:7,height:7,borderRadius:'50%',background:has?C.celadon:C.line,flexShrink:0,transition:'background 0.2s'}}/><span style={{fontSize:13,color:C.charcoal}}>{c.label}</span><span style={{marginLeft:'auto',fontSize:12,color:C.ash,transform:op?'rotate(180deg)':'',transition:'transform 0.2s'}}>▾</span></button>{op&&<div style={{padding:'0 14px 14px'}}><p style={{fontSize:12,color:C.ash,lineHeight:1.6,marginBottom:8,fontStyle:'italic',fontFamily:'DM Sans,sans-serif'}}>{c.question}</p><TA value={cR[c.label]||''} onChange={v=>setCR({...cR,[c.label]:v})} placeholder="Write as much or as little as you'd like…" minH={65}/></div>}</div></FadeIn>)})}</div><FadeIn delay={200}><ErrMsg err={err}/><div style={{textAlign:'right'}}><Btn onClick={async()=>{setLd(true);setErr('');setStage('stage4');try{setRvS(JSON.parse((await ask(pS4(selC.label,story,s1,focal,cR))).replace(/```json|```/g,'').trim()))}catch{setRvS([{thread:'A tension worth staying with',statement:'It seems like there is an important tension in what you shared.',opening:'What feels most unresolved about it?'},{thread:'Something may be shifting',statement:'Something may be shifting in how you understand this.',opening:'If that shift is real, what might it change?'},{thread:'What matters underneath',statement:'There may be something here about what you care about most.',opening:'What would honoring that actually look like?'},{thread:'Who you may be becoming',statement:'It could be that this moment is part of a longer change.',opening:'What feels different about how you see yourself now?'}])}setLd(false)}} disabled={ans===0}>Continue</Btn>{ans===0&&<p style={{fontSize:11,color:C.ash,marginTop:4,fontFamily:'DM Sans,sans-serif'}}>Respond to at least one</p>}</div></FadeIn></>}</div></div>)}

  if(stage==='stage4'){const done=rvS.length>0&&rvS.every((_,i)=>rvM[i]);return(<div style={W} ref={sr}><div style={I}><FadeIn><div style={{textAlign:'center',marginBottom:16}}><Pot phase="glazed" size={48} cardLabel={selC?.label}/></div></FadeIn><FadeIn><Progress stage={stage}/></FadeIn>{ld?<Dots/>:<><FadeIn><Tag color={C.ochre}>What's emerging</Tag><p style={{fontSize:13,lineHeight:1.55,marginTop:6,marginBottom:16,color:C.stone,fontFamily:'DM Sans,sans-serif'}}>Four possible threads. Mark what fits — or comes close.</p></FadeIn><div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:20}}>{rvS.map((item,i)=>{const st=item?.statement||item,thread=item?.thread,opening=item?.opening;return(<FadeIn key={i} delay={40+i*35}><div style={{background:C.cream,borderRadius:16,padding:14,boxShadow:C.glow,border:`1.5px solid ${rvM[i]==='fits'?C.celadon:rvM[i]==='no'?C.terra:rvM[i]==='notquite'?C.ochre:C.line}`,transition:'border-color 0.2s'}}>{thread&&<p style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:C.ash,marginBottom:5,fontFamily:'DM Sans,sans-serif'}}>{thread}</p>}<p style={{fontSize:13,lineHeight:1.7,marginBottom:6,fontFamily:'DM Sans,sans-serif'}}>{st}</p>{opening&&<p style={{fontSize:12,color:C.stone,lineHeight:1.6,marginBottom:8,fontStyle:'italic',fontFamily:'DM Sans,sans-serif',borderTop:`1px solid ${C.line}`,paddingTop:6}}>{opening}</p>}<div style={{display:'flex',gap:5}}>{[{k:'fits',l:'✓ Fits',c:C.celadon},{k:'notquite',l:'~ Close',c:C.ochre},{k:'no',l:'✗ Remove',c:C.terra}].map(o=><button key={o.k} onClick={()=>setRvM({...rvM,[i]:o.k})} style={{padding:'3px 10px',borderRadius:14,border:`1.5px solid ${rvM[i]===o.k?o.c:C.line}`,background:rvM[i]===o.k?o.c+'18':'transparent',color:rvM[i]===o.k?C.charcoal:C.ash,fontSize:11,fontFamily:'DM Sans,sans-serif',cursor:'pointer',transition:'all 0.15s'}}>{o.l}</button>)}</div></div></FadeIn>)})}</div><FadeIn delay={180}><div style={{textAlign:'right'}}><Btn onClick={()=>setStage('stage5')} disabled={!done}>Continue</Btn></div></FadeIn></>}</div></div>)}

  if(stage==='stage5'){
    const conf=rvS.filter((_,i)=>rvM[i]==='fits'||rvM[i]==='notquite').map(s=>s?.statement||s)
    // Auto-recommend based on which thread category got 'fits':
    // idx 0 = newly seen → see | idx 1 = unresolved → keep | idx 2/3 = matters/becoming → carry
    const fitsIdx=rvS.findIndex((_,i)=>rvM[i]==='fits')
    const autoRec=fitsIdx===1?'keep':fitsIdx>=2?'carry':'see'
    const S5_CARDS=[
      {key:'see',label:'What I\'m seeing now',desc:'A gentle note about what may be becoming clearer.',example:'"Maybe what this is really showing me is…"',color:C.celadon,
        icon:<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><ellipse cx="11" cy="11" rx="7" ry="4.5" stroke={C.celadon} strokeWidth="1.4"/><circle cx="11" cy="11" r="2" fill={C.celadon} opacity="0.7"/><path d="M11 4V2M11 20v-2M4 11H2M20 11h-2" stroke={C.celadon} strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/></svg>},
      {key:'carry',label:'What matters going forward',desc:'A note about what feels important enough to guide you.',example:'"What I don\'t want to lose from this is…"',color:C.ochre,
        icon:<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M11 18V8" stroke={C.ochre} strokeWidth="1.4" strokeLinecap="round"/><path d="M11 8C11 8 8 5.5 8 3.5C8 2.5 9 2 11 2C13 2 14 2.5 14 3.5C14 5.5 11 8 11 8Z" fill={C.ochre} opacity="0.6"/><path d="M7 18h8" stroke={C.ochre} strokeWidth="1.4" strokeLinecap="round" opacity="0.4"/></svg>},
      {key:'keep',label:'What I want to keep with me',desc:'A short line, question, or reminder to return to later.',example:'"The question I want to keep near me is…"',color:C.terra,
        icon:<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="5" y="4" width="12" height="14" rx="2" stroke={C.terra} strokeWidth="1.4"/><path d="M8 8h6M8 11h6M8 14h3" stroke={C.terra} strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/><path d="M14 4v4l-3-1.5L8 8V4" fill={C.terra} opacity="0.35"/></svg>},
    ]
    const go=async(key)=>{setOT(key);setLd(true);setErr('');setStage('artifact');try{setOTx(await ask(pS5(key,conf,story,focal)))}catch(e){setErr(e.message);setOTx("Your reflection is here. Take what fits, revise what doesn't.")}setLd(false)}
    const primary=S5_CARDS.find(c=>c.key===autoRec)
    const others=S5_CARDS.filter(c=>c.key!==autoRec)
    return(<div style={W} ref={sr}><div style={I}>
      <FadeIn><div style={{textAlign:'center',marginBottom:16}}><Pot phase="glazed" size={48} cardLabel={selC?.label}/></div></FadeIn>
      <FadeIn><Progress stage={stage}/></FadeIn>
      <FadeIn><Tag color={C.terra}>One more step</Tag><p style={{fontSize:13,lineHeight:1.55,marginTop:6,marginBottom:4,color:C.stone,fontFamily:'DM Sans,sans-serif'}}>Suggested for this reflection:</p></FadeIn>
      <ErrMsg err={err}/>
      <FadeIn delay={60}>
        <button onClick={()=>go(primary.key)} style={{width:'100%',textAlign:'left',padding:0,borderRadius:18,border:`2px solid ${primary.color}`,background:C.cream,cursor:'pointer',boxShadow:C.lift,fontFamily:'DM Sans,sans-serif',transition:'all 0.2s',overflow:'hidden',marginBottom:16}}>
          <div style={{height:4,background:`linear-gradient(to right,${primary.color},${primary.color}44)`}}/>
          <div style={{padding:'18px 18px 16px'}}>
            <div style={{display:'flex',alignItems:'flex-start',gap:12,marginBottom:10}}>{primary.icon}<div><p style={{fontSize:16,fontFamily:'DM Serif Display,Georgia,serif',color:C.charcoal,marginBottom:3}}>{primary.label}</p><p style={{fontSize:12,color:C.stone,lineHeight:1.55,margin:0,fontFamily:'DM Sans,sans-serif'}}>{primary.desc}</p></div></div>
            <p style={{fontSize:12,color:C.ash,lineHeight:1.5,margin:'0 0 0 34px',fontStyle:'italic',borderLeft:`2px solid ${primary.color}33`,paddingLeft:10}}>{primary.example}</p>
          </div>
        </button>
      </FadeIn>
      <FadeIn delay={120}><p style={{fontSize:11,color:C.ash,textAlign:'center',marginBottom:10,fontFamily:'DM Sans,sans-serif',letterSpacing:'0.04em'}}>or choose</p>
        <div style={{display:'flex',gap:8}}>{others.map(o=>(
          <button key={o.key} onClick={()=>go(o.key)} style={{flex:1,textAlign:'left',padding:0,borderRadius:14,border:`1.5px solid ${C.line}`,background:C.cream,cursor:'pointer',boxShadow:C.glow,fontFamily:'DM Sans,sans-serif',transition:'all 0.2s',overflow:'hidden'}} onMouseEnter={e=>e.currentTarget.style.borderColor=o.color} onMouseLeave={e=>e.currentTarget.style.borderColor=C.line}>
            <div style={{height:2,background:o.color,opacity:0.5}}/>
            <div style={{padding:'12px 12px 10px'}}>
              <div style={{marginBottom:6}}>{o.icon}</div>
              <p style={{fontSize:12,fontFamily:'DM Serif Display,Georgia,serif',color:C.charcoal,marginBottom:3,lineHeight:1.3}}>{o.label}</p>
              <p style={{fontSize:10,color:C.ash,lineHeight:1.5,margin:0,fontStyle:'italic'}}>{o.example}</p>
            </div>
          </button>
        ))}</div>
      </FadeIn>
    </div></div>)
  }

  if(stage==='artifact'){const d=sd();return(<div style={W} ref={sr}><div style={I}>{ld?<Dots/>:<FadeIn><Journey data={d} onEdit={t=>setOTx(t)} onExport={()=>dlFile(buildExportText(d),`reflection-${new Date().toISOString().slice(0,10)}.txt`)}/><div style={{display:'flex',justifyContent:'center',gap:8,marginTop:20}}><Btn onClick={async()=>{const d2=sd();const id=await saveReflection(d2);if(id)setSvd(id);setPast(await loadReflections());setStage('closing')}}>{svd?'Saved ✓':'Save & finish'}</Btn><Btn v="secondary" onClick={()=>setStage('closing')}>Finish</Btn></div></FadeIn>}</div></div>)}

  if(stage==='closing')return(<div style={W} ref={sr}><div style={{...I,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'55vh'}}><FadeIn><div style={{textAlign:'center',maxWidth:320}}><Pot phase="blooming" size={64} cardLabel={selC?.label}/><p style={{fontSize:16,lineHeight:1.75,margin:'16px 0 6px'}}>This is yours.</p><p style={{fontSize:13,lineHeight:1.55,color:C.stone,marginBottom:4,fontFamily:'DM Sans,sans-serif'}}>To keep, to change, to come back to.</p><Sep/><p style={{fontSize:13,color:C.ash,marginBottom:22,fontFamily:'DM Sans,sans-serif'}}>Thank you for this time.</p><div style={{display:'flex',gap:8,justifyContent:'center',flexWrap:'wrap'}}><Btn v="secondary" onClick={()=>{reset();setStage('landing')}}>Home</Btn>{(svd||past.length>0)&&<Btn v="soft" onClick={()=>{setStage('history');setVw(null)}}>Past reflections</Btn>}</div></div></FadeIn></div></div>)
  return null
}
