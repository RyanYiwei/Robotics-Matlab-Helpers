function scalarExpression(value) {
  value = value.trim();
  if (!value || /[;\n\r=%:'"\[\]]/.test(value) || splitTop(value, ',').length !== 1) throw Error('请输入单个标量表达式，例如 pi/6 或 q(2)。');
  return value;
}
function checkedName(value) {
  value=value.trim(); if(!validName(value)) throw Error('请输入有效的 MATLAB 变量名。'); return value;
}
function rotationRows(axis, angle, degrees=false) {
  angle=scalarExpression(angle);
  const c=`${degrees?'cosd':'cos'}(${angle})`, s=`${degrees?'sind':'sin'}(${angle})`;
  if(axis==='X') return [['1','0','0'],['0',c,`-${s}`],['0',s,c]];
  if(axis==='Y') return [[c,'0',s],['0','1','0'],[`-${s}`,'0',c]];
  if(axis==='Z') return [[c,`-${s}`,'0'],[s,c,'0'],['0','0','1']];
  throw Error('请选择 X、Y 或 Z 旋转轴。');
}
function matrixDefinition(name, rows) { return formatMatrixDefinition(checkedName(name),rows); }
function transformRows(rotation, translation) {
  return [...rotation.map((row,i)=>[...row, scalarExpression(translation[i])]), ['0','0','0','1']];
}
function abbPreset() {
  const identity=[['1','0','0','0'],['0','1','0','0'],['0','0','1','0'],['0','0','0','1']];
  const axes=['Z','Y','Y','X','Y','X'];
  const translations=[['0','0','0.145'],['0','0','0.145'],['0','0','0.270'],['0.134','0','0.070'],['0.168','0','0'],['0.072','0','0']];
  return [
    {name:'T_I0',from:'I',to:'0',rows:identity.map(row=>[...row])},
    ...axes.map((axis,i)=>({name:`T${i}${i+1}`,from:String(i),to:String(i+1),rows:transformRows(rotationRows(axis,`q(${i+1})`),translations[i])})),
    {name:'T6E',from:'6',to:'E',rows:identity.map(row=>[...row])}
  ];
}
function chainDefinition(name, segments, position=false, rotation=false) {
  name=checkedName(name);
  if(!segments.length) throw Error('请至少添加一个变换。');
  const names=segments.map(s=>checkedName(s.name));
  segments.forEach(s=>{if(!s.from.trim()||!s.to.trim()) throw Error('请填写每段的起点和终点坐标系。');});
  for(let i=1;i<segments.length;i++) if(segments[i-1].to.trim()!==segments[i].from.trim()) throw Error(`第 ${i} 段与第 ${i+1} 段坐标系不连续。`);
  if(names.includes(name) || (position && (name==='p_IE'||names.includes('p_IE'))) || (rotation && (name==='R_IE'||names.includes('R_IE')))) throw Error('输出变量与输入变量重名，请更换变量名。');
  return `${name} = ${names.join(' * ...\n    ')};${position?`\np_IE = ${name}(1:3, 4);`:''}${rotation?`\nR_IE = ${name}(1:3, 1:3);`:''}`;
}
if(typeof module!=='undefined') {
  const base=require('./app.js'); var {validName,splitTop,formatMatrixDefinition}=base;
  module.exports={rotationRows,transformRows,matrixDefinition,chainDefinition,abbPreset};
}
if(typeof document!=='undefined') {
  const $=id=>document.getElementById(id), api=window.matrixStudio;
  const style=document.createElement('style');style.textContent='.tabs{flex-wrap:wrap}select{font:inherit;padding:10px;border:1px solid #d4dfe3;border-radius:8px;background:white;color:#172b36}label select{display:block;margin-top:7px}.kin-section{padding:20px 0;border-bottom:1px solid #e1e8eb}.kin-section:first-child{padding-top:0}.kin-section h2{margin-bottom:14px}.kin-section .actions{margin-top:16px}.chain-row{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:9px 0}.chain-row input{width:85px}.chain-row input:first-child{width:125px}.chain-row button{padding:7px 10px}.check{display:flex;align-items:center;gap:6px}.check input{width:auto;margin:0}.preview-matrix{font:12px/1.8 monospace;white-space:pre;overflow:auto;background:#f3f7f7;border-radius:8px;padding:12px}.unit-note{color:#087f73}';document.head.append(style);
  $('kinPanel').innerHTML=`
    <div class="tabs" id="kinTools" aria-label="运动学工具"><button class="active" data-tool="0">旋转矩阵</button><button data-tool="1">齐次变换</button><button data-tool="2">变换连乘</button><button data-tool="3">提取元素</button></div>
    <div class="kin-section"><h2>基本旋转矩阵</h2><div class="controls">
    <label>变量名<input id="rotName" class="name" value="R12"></label>
    <label>旋转轴<select id="rotAxis"><option>X</option><option selected>Y</option><option>Z</option></select></label>
    <label>角度表达式<input id="rotAngle" class="name" value="q(2)"></label>
    <label>角度单位<select id="angleUnit"><option value="rad">弧度 · sin / cos</option><option value="deg">角度 · sind / cosd</option></select></label></div>
    <div class="actions"><button id="makeRotation" class="primary">确认 · 生成旋转</button><button id="editRotation">送入格子编辑</button></div></div>
    <div class="kin-section"><h2>齐次变换矩阵</h2><p class="hint">T_AB 将 B 中的坐标映射到 A：p_A = R_AB * p_B + t_AB。平移列 t_AB 用 A 坐标系表达。</p>
    <div class="controls"><label>变量名<input id="transformName" class="name" value="T12"></label><label>旋转来源<select id="transformMode"><option value="elementary">旋转轴与角度</option><option value="variable">已有旋转变量</option></select></label><label id="rotationVariableLabel" hidden>3×3 旋转变量<input id="rotationVariable" class="name" value="R12"></label></div>
    <div id="transformRotationFields" class="controls" style="margin-top:14px"><label>旋转轴<select id="transformAxis"><option>X</option><option selected>Y</option><option>Z</option></select></label><label>角度表达式<input id="transformAngle" class="name" value="q(2)"></label><label>角度单位<select id="transformAngleUnit"><option value="rad">弧度</option><option value="deg">角度</option></select></label></div>
    <p class="hint unit-note">平移单位：米（m）。</p>
    <div class="controls"><label>px<input id="px" class="name" value="0"></label><label>py<input id="py" class="name" value="0"></label><label>pz<input id="pz" class="name" value="0.145"></label></div>
    <div class="actions"><button id="makeTransform" class="primary">确认 · 生成变换</button><button id="editTransform">送入格子编辑</button></div>
    <div style="margin-top:24px;border-top:1px solid #e1e8eb;padding-top:16px"><button id="loadAbb">一键加载 ABB IRB 120 全部数据</button><p class="hint">按练习材料加载 8 个变换、6 个关节角和完整变换链，初始关节角为 pi/6。长度单位 m。同名变量会更新为 ABB 数据，随后打开机械臂预览。</p></div></div>
    <div class="kin-section"><h2>变换链连乘</h2><p class="hint">每段填写变量、目标坐标系 A 和来源坐标系 B（T_AB）。按 I → 0 → 1 → … → E 排列，生成的乘积将末端 E 坐标映射到 I。</p><div id="chainRows"></div>
    <button id="addSegment">＋ 添加变换</button><button id="abbChain">载入 ABB 示例链</button>
    <div class="controls" style="margin-top:16px"><label>结果变量<input id="chainName" class="name" value="T_IE"></label><label class="check"><input id="chainPosition" type="checkbox" checked>提取位置 p_IE</label><label class="check"><input id="chainRotation" type="checkbox" checked>提取旋转 R_IE</label></div>
    <p class="hint">输入变换变量需已在 MATLAB 中定义。坐标系连接会在生成时检查。</p><div class="actions"><button id="makeChain" class="primary">确认 · 生成变换链</button><button id="previewArm">预览机械臂</button></div>
    <div id="symbolControls" style="margin-top:16px" hidden><h3 style="font-size:15px">拖动参数</h3><p class="hint">数值使用矩阵表达式原有单位（sin/cos 为弧度，sind/cosd 为角度，平移为米）。可修改滑块范围。</p><div id="symbolSliders"></div></div>
    <details style="margin-top:16px"><summary>精确输入符号数值</summary><p class="hint">每行一个赋值，例如 q(1) = pi/6 或 theta = 0。点击预览后同步到滑块；只用于预览，不修改已有变量。</p><textarea id="previewValues" spellcheck="false" placeholder="q(1) = pi/6&#10;q(2) = 0"></textarea></details>
    <div id="armView" hidden><p class="hint">左键拖动旋转 · 右键 / 中键 / Shift + 左键拖动平移 · 滚轮缩放 · 关节运动保持视角 · X 红 / Y 绿 / Z 蓝 · 单位 m</p><canvas id="armCanvas" aria-label="机械臂三维运动学骨架" style="width:100%;height:360px;background:#f4f7f8;border:1px solid #dce5e8;border-radius:12px;touch-action:none"></canvas><button id="resetArmView">重置视角</button><p id="armPosition" class="hint"></p><p id="armStale" class="hint" hidden>输入或变量已改变，请重新点击“预览机械臂”。</p></div></div>
    <div class="kin-section"><h2>位置与姿态快捷提取</h2><div class="controls"><label>来源矩阵<input id="extractSource" class="name" value="T_IE"></label><label>来源类型<select id="extractType"><option value="T">4×4 齐次变换</option><option value="R">3×3 旋转矩阵</option></select></label><label>提取内容<select id="extractPart"><option value="position">位置向量</option><option value="rotation">旋转矩阵</option><option value="x">X 轴</option><option value="y">Y 轴</option><option value="z">Z 轴</option></select></label><label>输出变量<input id="extractName" class="name" value="p"></label></div><div class="actions"><button id="makeExtract" class="primary">确认 · 生成提取语句</button></div></div>`;
  $('kinTab').onclick=()=>{ $('createPanel').hidden=true;$('slicePanel').hidden=true;$('kinPanel').hidden=false;['createTab','sliceTab'].forEach(id=>$(id).classList.remove('active'));$('kinTab').classList.add('active');$('error').textContent=''; };
  const getRotation=()=>rotationRows($('rotAxis').value,$('rotAngle').value,$('angleUnit').value==='deg');
  $('makeRotation').onclick=()=>api.attempt(()=>api.output(matrixDefinition($('rotName').value,getRotation())));
  $('editRotation').onclick=()=>api.attempt(()=>api.edit(checkedName($('rotName').value),getRotation()));
  const sections=[...$('kinPanel').querySelectorAll('.kin-section')];
  const toolButtons=[...$('kinTools').querySelectorAll('button')];
  function selectTool(index) {
    sections.forEach((section,i)=>section.hidden=i!==index);
    toolButtons.forEach((button,i)=>{button.classList.toggle('active',i===index);button.setAttribute('aria-pressed',i===index);});
    $('error').textContent='';
  }
  toolButtons.forEach((button,i)=>button.onclick=()=>selectTool(i));
  selectTool(0);
  $('transformMode').onchange=()=>{const variable=$('transformMode').value==='variable';$('rotationVariableLabel').hidden=!variable;$('transformRotationFields').hidden=variable;$('editTransform').hidden=variable;};
  function translation() {return ['px','py','pz'].map(id=>scalarExpression($(id).value));}
  function expandedTransform(){if($('transformMode').value!=='elementary') throw Error('已有旋转变量无法展开为格子，请选择基本旋转模式。');return transformRows(rotationRows($('transformAxis').value,$('transformAngle').value,$('transformAngleUnit').value==='deg'),translation());}
  $('makeTransform').onclick=()=>api.attempt(()=>{
    const name=checkedName($('transformName').value);
    if($('transformMode').value==='elementary') api.output(matrixDefinition(name,expandedTransform()));
    else {const r=checkedName($('rotationVariable').value);if(r===name) throw Error('旋转变量和输出变量不能重名。');api.output(`${name} = [${r}, [${translation().join('; ')}];\n    0, 0, 0, 1];`);}
  });
  $('editTransform').onclick=()=>api.attempt(()=>api.edit(checkedName($('transformName').value),expandedTransform()));
  let segments=[{name:'T01',from:'0',to:'1'},{name:'T12',from:'1',to:'2'}];
  function renderChain(){
    $('chainRows').replaceChildren();segments.forEach((segment,i)=>{
      const row=document.createElement('div');row.className='chain-row';
      for(const [key,label] of [['name','变换变量'],['from','目标坐标系 A'],['to','来源坐标系 B']]) {const input=document.createElement('input');input.value=segment[key];input.placeholder=label;input.setAttribute('aria-label',`第 ${i+1} 段 ${label}`);input.oninput=()=>segment[key]=input.value;row.append(input);}
      for(const [label,delta] of [['↑',-1],['↓',1]]){const b=document.createElement('button');b.textContent=label;b.setAttribute('aria-label',`第 ${i+1} 段${delta<0?'上移':'下移'}`);b.disabled=i+delta<0||i+delta>=segments.length;b.onclick=()=>{[segments[i],segments[i+delta]]=[segments[i+delta],segments[i]];renderChain();};row.append(b);}
      const del=document.createElement('button');del.textContent='删除';del.onclick=()=>{segments.splice(i,1);renderChain();};row.append(del);$('chainRows').append(row);
    });
  }
  $('addSegment').onclick=()=>{const prev=segments.at(-1);segments.push({name:'',from:prev?prev.to:'',to:''});renderChain();};
  $('abbChain').onclick=()=>{segments=abbPreset().map(({name,from,to})=>({name,from,to}));renderChain();};
  $('loadAbb').onclick=()=>api.attempt(()=>{
    const preset=abbPreset();
    segments=preset.map(({name,from,to})=>({name,from,to}));renderChain();
    $('chainName').value='T_IE';$('chainPosition').checked=true;$('chainRotation').checked=true;
    $('previewValues').value=Array.from({length:6},(_,i)=>`q(${i+1}) = pi/6`).join('\n');
    const code=[matrixDefinition('q',Array.from({length:6},()=>['pi/6'])),...preset.map(item=>matrixDefinition(item.name,item.rows)),chainDefinition('T_IE',segments,true,true)].join('\n\n');
    api.output(code);selectTool(2);$('previewArm').click();
    $('status').textContent='已加载 ABB IRB 120：8 个变换、6 个关节角、完整变换链。';
  });
  $('makeChain').onclick=()=>api.attempt(()=>api.output(chainDefinition($('chainName').value,segments,$('chainPosition').checked,$('chainRotation').checked)));
  window.armPreview = {getSegments:()=>segments.map(s=>({name:s.name.trim(),from:s.from.trim(),to:s.to.trim()})), validate:()=>chainDefinition($('chainName').value,segments)};
  function extract(){const source=checkedName($('extractSource').value),name=checkedName($('extractName').value),part=$('extractPart').value,isT=$('extractType').value==='T';if(source===name)throw Error('输出变量与来源变量不能重名。');if(!isT&&(part==='position'||part==='rotation'))throw Error('旋转矩阵请选 X、Y 或 Z 轴；提取位置或旋转块需要齐次变换。');const index=part==='position'?'1:3, 4':part==='rotation'?'1:3, 1:3':`${isT?'1:3':':'}, ${{x:1,y:2,z:3}[part]}`;api.output(`${name} = ${source}(${index});`);}
  $('makeExtract').onclick=()=>api.attempt(extract);
  $('extractType').onchange=()=>{
    const isR=$('extractType').value==='R';
    [...$('extractPart').options].forEach(option=>option.disabled=isR&&['position','rotation'].includes(option.value));
    if(isR&&['position','rotation'].includes($('extractPart').value)){$('extractPart').value='x';$('extractName').value='x_axis';}
  };
  $('extractPart').onchange=()=>{$('extractName').value={position:'p',rotation:'R',x:'x_axis',y:'y_axis',z:'z_axis'}[$('extractPart').value];};
  $('kinPanel').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&e.target instanceof HTMLInputElement&&e.target.type!=='checkbox'){e.preventDefault();e.target.closest('.kin-section').querySelector('.primary').click();}});
  renderChain();
}
