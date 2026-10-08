// A restricted expression parser: MATLAB input is never executed as JavaScript.
function previewScalar(source, symbols={}) {
  const tokens=source.match(/(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z]\w*|[()+\-*/^,]|\S/g)||[];
  let pos=0;
  const functions={sin:Math.sin,cos:Math.cos,tan:Math.tan,sqrt:Math.sqrt,abs:Math.abs,sind:x=>Math.sin(x*Math.PI/180),cosd:x=>Math.cos(x*Math.PI/180),tand:x=>Math.tan(x*Math.PI/180)};
  function atom(){
    const token=tokens[pos++];
    if(token==='('){const n=expression();if(tokens[pos++]!==')')throw Error('预览表达式括号不匹配。');return n;}
    if(token&&/^(?:\d|\.)/.test(token))return Number(token);
    if(token&&/^[A-Za-z]\w*$/.test(token)) {
      if(token==='pi')return Math.PI;
      if(tokens[pos]==='('){pos++;const value=expression();if(tokens[pos++]!==')')throw Error('预览只支持单参数函数或向量索引。');
        if(functions[token])return functions[token](value);
        const key=`${token}(${value})`;if(Object.hasOwn(symbols,key))return symbols[key];throw Error(`请在“符号数值”中填写 ${key}。`);
      }
      if(Object.hasOwn(symbols,token))return symbols[token];throw Error(`请在“符号数值”中填写 ${token}。`);
    }
    throw Error(`预览不支持表达式：${source}`);
  }
  function power(){let n=atom();if(tokens[pos]==='^'){pos++;n=n**unary();}return n;}
  function unary(){if(tokens[pos]==='+'){pos++;return unary();}if(tokens[pos]==='-'){pos++;return -unary();}return power();}
  function product(){let n=unary();while(['*','/'].includes(tokens[pos])){const op=tokens[pos++],v=unary();n=op==='*'?n*v:n/v;}return n;}
  function expression(){let n=product();while(['+','-'].includes(tokens[pos])){const op=tokens[pos++],v=product();n=op==='+'?n+v:n-v;}return n;}
  const result=expression();if(pos!==tokens.length||!Number.isFinite(result))throw Error(`预览表达式不支持或结果无效：${source}`);return result;
}
function previewSymbols(text){const values={};for(const line of text.split('\n').map(s=>s.trim()).filter(Boolean)){const match=line.match(/^([A-Za-z]\w*(?:\(\d+\))?)\s*=\s*(.*?)\s*;?$/);if(!match)throw Error('符号数值请使用 theta = 0 或 q(1) = pi/6。');values[match[1]]=previewScalar(match[2],values);}return values;}
function discoverPreviewSymbols(segments,variables){
  const symbols=new Set(),visited=new Set();
  const reserved=new Set(['pi','sin','cos','tan','sind','cosd','tand','sqrt','abs']);
  function scan(expression){
    const tokens=expression.match(/(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z]\w*(?:\s*\(\s*\d+\s*\))?/g)||[];
    for(const token of tokens)if(/^[A-Za-z]/.test(token)&&!reserved.has(token.split('(')[0].trim()))symbols.add(token.replace(/\s/g,''));
  }
  function visit(name){
    if(visited.has(name))return;visited.add(name);
    const variable=variables.get(name);if(!variable)throw Error(`找不到 ${name}，请先生成或读取这个矩阵。`);
    if(variable.rows){variable.rows.flat().forEach(scan);return;}
    const body=variable.definition.slice(variable.definition.indexOf('=')+1).trim().replace(/;$/,'').replace(/\.\.\.\s*/g,'');
    const block=body.match(/^\[\s*([A-Za-z]\w*)\s*,\s*\[([\s\S]*?)\]\s*;\s*0\s*,\s*0\s*,\s*0\s*,\s*1\s*\]$/);
    if(block){visit(block[1]);scan(block[2]);return;}
    const names=body.split('*').map(s=>s.trim());if(names.every(n=>/^[A-Za-z]\w*$/.test(n))){names.forEach(visit);return;}
    throw Error(`${name} 的表达式暂不能自动识别参数。`);
  }
  segments.forEach(s=>visit(s.name.trim()));return [...symbols];
}
function multiplyMatrices(a,b){if(!a.length||a[0].length!==b.length)throw Error('矩阵乘法尺寸不匹配。');return a.map(row=>b[0].map((_,j)=>row.reduce((sum,v,k)=>sum+v*b[k][j],0)));}
const identityTransform=()=>Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>Number(i===j)));
function resolvePreviewMatrix(name, variables, symbols, visiting=new Set()) {
  if(visiting.has(name))throw Error(`变量 ${name} 存在循环引用。`);
  const variable=variables.get(name);if(!variable)throw Error(`找不到 ${name}，请先生成或读取这个矩阵。`);
  visiting=new Set(visiting).add(name);
  if(variable.rows)return variable.rows.map(row=>row.map(value=>previewScalar(value,symbols)));
  const body=variable.definition.slice(variable.definition.indexOf('=')+1).trim().replace(/;$/,'').replace(/\.\.\.\s*/g,'');
  // Support the transform builder's [R, [px; py; pz]; 0, 0, 0, 1] output.
  const block=body.match(/^\[\s*([A-Za-z]\w*)\s*,\s*\[([\s\S]*?)\]\s*;\s*0\s*,\s*0\s*,\s*0\s*,\s*1\s*\]$/);
  if(block){const r=resolvePreviewMatrix(block[1],variables,symbols,visiting);if(r.length!==3||r.some(row=>row.length!==3))throw Error(`${block[1]} 必须为 3×3。`);const p=block[2].split(';').map(v=>previewScalar(v,symbols));if(p.length!==3)throw Error('平移必须有三个元素。');return [...r.map((row,i)=>[...row,p[i]]),[0,0,0,1]];}
  const names=body.split('*').map(s=>s.trim());if(names.every(n=>/^[A-Za-z]\w*$/.test(n)))return names.map(n=>resolvePreviewMatrix(n,variables,symbols,visiting)).reduce(multiplyMatrices);
  throw Error(`${name} 的生成表达式暂不能用于预览，请用显式矩阵或齐次变换工具定义。`);
}
function validateRigidTransform(t,name){
  if(t.length!==4||t.some(row=>row.length!==4||row.some(v=>!Number.isFinite(v))))throw Error(`${name} 必须为有限数值的 4×4 矩阵。`);
  if(t[3].some((v,i)=>Math.abs(v-Number(i===3))>1e-6))throw Error(`${name} 最后一行必须为 [0 0 0 1]。`);
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(Math.abs(t.slice(0,3).reduce((s,r)=>s+r[i]*r[j],0)-Number(i===j))>1e-5)throw Error(`${name} 的旋转块不是正交矩阵。`);
  const r=t;const det=r[0][0]*(r[1][1]*r[2][2]-r[1][2]*r[2][1])-r[0][1]*(r[1][0]*r[2][2]-r[1][2]*r[2][0])+r[0][2]*(r[1][0]*r[2][1]-r[1][1]*r[2][0]);if(Math.abs(det-1)>1e-5)throw Error(`${name} 的旋转块行列式必须为 +1。`);
}
function previewFrames(segments,variables,symbols){
  if(!segments.length)throw Error('请先添加变换链。');let total=identityTransform();const frames=[{label:segments[0].from,t:total}];
  segments.forEach((s,i)=>{if(i&&segments[i-1].to!==s.from)throw Error('变换链坐标系不连续。');const t=resolvePreviewMatrix(s.name.trim(),variables,symbols);validateRigidTransform(t,s.name);total=multiplyMatrices(total,t);frames.push({label:s.to,t:total});});return frames;
}
if(typeof module!=='undefined')module.exports={previewScalar,previewSymbols,discoverPreviewSymbols,multiplyMatrices,previewFrames,validateRigidTransform};
if(typeof document!=='undefined') {
  const $=id=>document.getElementById(id);let frames=[],yaw=.7,pitch=.45,zoom=1,drag=null,pan=[0,0];
  const canvas=$('armCanvas'),ctx=canvas.getContext('2d');
  let symbols={},activeSegments=[],renderPending=false,viewAnchor=null;
  const ranges=new Map();
  const style=document.createElement('style');style.textContent='.symbol-slider{border:1px solid #e1e8eb;border-radius:9px;padding:12px;margin:10px 0}.symbol-slider .controls{gap:10px}.symbol-slider input[type=range]{flex:1;min-width:130px;accent-color:#087f73;padding:0}.symbol-slider input[type=number]{width:100px}.symbol-slider strong{min-width:65px;font:14px monospace}.symbol-slider label input{width:90px}';document.head.append(style);
  function syncText(){ $('previewValues').value=Object.entries(symbols).map(([name,value])=>`${name} = ${value}`).join('\n'); }
  function updateArm(){
    $('armView').hidden=true;
    window.matrixStudio.attempt(()=>{window.armPreview.validate();activeSegments=window.armPreview.getSegments();frames=previewFrames(activeSegments,window.matrixStudio.variables,symbols);$('armView').hidden=false;$('armStale').hidden=true;const end=frames.at(-1).t;$('armPosition').textContent=`末端位置（相对 ${frames[0].label}）：[${end.slice(0,3).map(r=>r[3].toFixed(4)).join(', ')}] m。连线连接坐标系原点，不代表真实外壳或关节类型。`;draw();});
  }
  function liveUpdate(){syncText();if(renderPending)return;renderPending=true;requestAnimationFrame(()=>{renderPending=false;updateArm();});}
  function renderSliders(names){
    $('symbolControls').hidden=!names.length;$('symbolSliders').replaceChildren();
    names.forEach(name=>{
      const value=symbols[name];let limits=ranges.get(name)||[-Math.PI,Math.PI];limits=[Math.min(limits[0],value),Math.max(limits[1],value)];if(limits[0]===limits[1])limits=[value-1,value+1];ranges.set(name,limits);
      const card=document.createElement('div');card.className='symbol-slider';
      const row=document.createElement('div');row.className='controls';const title=document.createElement('strong');title.textContent=name;
      const slider=document.createElement('input');slider.type='range';slider.min=limits[0];slider.max=limits[1];slider.step='any';slider.value=value;slider.setAttribute('aria-label',`${name} 滑块`);
      const exact=document.createElement('input');exact.type='number';exact.step='any';exact.value=value;exact.setAttribute('aria-label',`${name} 精确数值`);
      row.append(title,slider,exact);card.append(row);
      const bounds=document.createElement('details');const summary=document.createElement('summary');summary.textContent='调整范围';bounds.append(summary);const boundRow=document.createElement('div');boundRow.className='controls';
      const inputs=limits.map((v,i)=>{const label=document.createElement('label');label.textContent=i?'最大值':'最小值';const input=document.createElement('input');input.type='number';input.step='any';input.value=v;input.setAttribute('aria-label',`${name} ${label.textContent}`);label.append(input);boundRow.append(label);return input;});bounds.append(boundRow);card.append(bounds);
      slider.oninput=()=>{symbols[name]=Number(slider.value);exact.value=Number(slider.value).toFixed(6);liveUpdate();};
      exact.oninput=()=>{if(!exact.value||!Number.isFinite(exact.valueAsNumber))return;const v=exact.valueAsNumber;symbols[name]=v;limits=[Math.min(limits[0],v),Math.max(limits[1],v)];ranges.set(name,limits);slider.min=limits[0];slider.max=limits[1];slider.value=v;inputs.forEach((input,i)=>input.value=limits[i]);liveUpdate();};
      inputs.forEach(input=>input.onchange=()=>window.matrixStudio.attempt(()=>{const next=inputs.map(i=>i.valueAsNumber);if(!next.every(Number.isFinite)||next[0]>=next[1])throw Error('滑块最小值必须小于最大值。');limits=next;ranges.set(name,limits);slider.min=limits[0];slider.max=limits[1];symbols[name]=Math.max(limits[0],Math.min(limits[1],symbols[name]));slider.value=symbols[name];exact.value=symbols[name];liveUpdate();}));
      $('symbolSliders').append(card);
    });
  }
  function draw(){
    if(!frames.length||$('armView').hidden)return;
    const width=canvas.clientWidth||600,height=360,dpr=window.devicePixelRatio||1;canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const points=frames.map(f=>f.t.slice(0,3).map(r=>r[3]));
    // Freeze the world origin and scale for this preview, independent of joint pose.
    if(!viewAnchor){
      const reach=points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(...p.map((v,j)=>v-points[i][j])),0);
      viewAnchor={center:[...points[0]],span:Math.max(reach,.1)};
    }
    const {center,span}=viewAnchor,axis=span*.09,scale=Math.min(width,height)*.42/span*zoom;
    // Positive pitch is an elevation above the ground: camera direction has +Z.
    function project(p){const [x,y,z]=p.map((v,i)=>v-center[i]);const a=Math.cos(yaw)*x-Math.sin(yaw)*y,b=Math.sin(yaw)*x+Math.cos(yaw)*y;return [width/2+pan[0]+a*scale,height/2+pan[1]-(z*Math.cos(pitch)+b*Math.sin(pitch))*scale];}
    function line(a,b,color,size){ctx.beginPath();ctx.moveTo(...project(a));ctx.lineTo(...project(b));ctx.strokeStyle=color;ctx.lineWidth=size;ctx.stroke();}
    // Ground is always the base's XY plane, even if a link goes below it.
    const ground=center[2];for(let i=-4;i<=4;i++){const d=i*span/4;line([center[0]+d,center[1]-span,ground],[center[0]+d,center[1]+span,ground],'#dce5e8',1);line([center[0]-span,center[1]+d,ground],[center[0]+span,center[1]+d,ground],'#dce5e8',1);}
    const baseRadius=span*.065;
    ctx.beginPath();for(let i=0;i<=32;i++){const a=i*Math.PI/16,p=project([center[0]+Math.cos(a)*baseRadius,center[1]+Math.sin(a)*baseRadius,ground]);if(i===0)ctx.moveTo(...p);else ctx.lineTo(...p);}ctx.closePath();ctx.fillStyle='#b8cccf';ctx.fill();ctx.strokeStyle='#69888e';ctx.lineWidth=2;ctx.stroke();
    for(let i=1;i<points.length;i++)line(points[i-1],points[i],'#087f73',7);
    frames.forEach((f,i)=>{const p=points[i];['#d95151','#239f62','#397fe0'].forEach((color,j)=>line(p,p.map((v,k)=>v+f.t[k][j]*axis),color,2));const xy=project(p);ctx.beginPath();ctx.arc(...xy,5,0,2*Math.PI);ctx.fillStyle='#17333e';ctx.fill();ctx.fillStyle='#17333e';ctx.font='12px sans-serif';ctx.fillText(f.label,xy[0]+9,xy[1]-9-(i&&points[i].every((v,j)=>Math.abs(v-points[i-1][j])<1e-9)?14:0));});
  }
  $('previewArm').onclick=()=>{ $('armView').hidden=true;window.matrixStudio.attempt(()=>{
    window.armPreview.validate();activeSegments=window.armPreview.getSegments();const names=discoverPreviewSymbols(activeSegments,window.matrixStudio.variables),manual=previewSymbols($('previewValues').value);symbols=Object.fromEntries(names.map(name=>[name,manual[name]??symbols[name]??0]));renderSliders(names);syncText();viewAnchor=null;updateArm();
  });};
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',e=>{
    if(drag||![0,1,2].includes(e.button))return;
    e.preventDefault();drag={x:e.clientX,y:e.clientY,id:e.pointerId,mode:e.button!==0||e.shiftKey?'pan':'rotate'};canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    if(!drag||e.pointerId!==drag.id)return;
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    if(drag.mode==='pan'){pan[0]+=dx;pan[1]+=dy;}
    else{yaw+=dx*.01;pitch=Math.max(.05,Math.min(Math.PI/2,pitch+dy*.01));}
    drag.x=e.clientX;drag.y=e.clientY;draw();
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{if(drag?.id===e.pointerId)drag=null;});
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.2,Math.min(5,zoom*Math.exp(-e.deltaY*.001)));draw();},{passive:false});
  $('resetArmView').onclick=()=>{yaw=.7;pitch=.45;zoom=1;pan=[0,0];draw();};
  $('kinPanel').addEventListener('input',e=>{if(e.target.closest('#symbolControls'))return;if(frames.length)$('armStale').hidden=false;});
  $('chainRows').addEventListener('click',()=>{if(frames.length)$('armStale').hidden=false;});
  for(const id of ['addSegment','abbChain'])$(id).addEventListener('click',()=>{if(frames.length)$('armStale').hidden=false;});
  new MutationObserver(()=>{if(frames.length)$('armStale').hidden=false;}).observe($('variableList'),{childList:true});
  new ResizeObserver(draw).observe(canvas);
}
