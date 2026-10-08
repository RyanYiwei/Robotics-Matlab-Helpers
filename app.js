/* Pure parsing and indexing helpers also exported for local checks. */
function validName(name) {
  const keywords = new Set('break case catch classdef continue else elseif end for function global if otherwise parfor persistent return spmd switch try while'.split(' '));
  return /^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(name) && !keywords.has(name);
}
function splitTop(text, separators) {
  let parts = [], start = 0, stack = [], quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quote && text[i + 1] === '"') { i++; continue; } quote = !quote; }
    if (quote) continue;
    if ('(['.includes(c)) stack.push(c);
    else if (')]'.includes(c)) { if (stack.pop() !== (c === ')' ? '(' : '[')) throw Error('括号不匹配。'); }
    else if (!stack.length && separators.includes(c)) { parts.push(text.slice(start, i).trim()); start = i + 1; }
  }
  if (quote || stack.length) throw Error('括号或双引号未闭合。');
  parts.push(text.slice(start).trim());
  return parts;
}
function parseMatrix(source) {
  const match = source.trim().match(/^([A-Za-z][A-Za-z0-9_]*)\s*=\s*\[([\s\S]*)\]\s*;?$/);
  if (!match || !validName(match[1])) throw Error('请输入有效的矩阵定义，例如 A = [1, 2; 3, 4];');
  const body = match[2].trim();
  if (!body) throw Error('暂不支持空矩阵。');
  if (/[\x27%]/.test(body)) throw Error('当前版本不支持单引号、转置和注释，请输入数字或不含这些符号的公式。');
  const rows = splitTop(body, ';\n').filter(Boolean).map(row => {
    const commaParts = splitTop(row, ',');
    const values = commaParts.length > 1 ? commaParts : splitTop(row, ' \t').filter(Boolean);
    if (values.some(v => !v)) throw Error('矩阵中存在空元素。');
    if (values.some(v => /(^|[^\w]):/.test(v) || /^[\[\"]/.test(v))) throw Error('每个元素应是单个数值或标量公式；暂不支持冒号展开、嵌套矩阵或字符串。');
    return values;
  });
  if (!rows.length || rows.some(row => row.length !== rows[0].length)) throw Error('各行元素数量不一致。含空格的公式请用逗号分隔。');
  if (rows.length > 50 || rows[0].length > 50) throw Error('当前最多支持 50 × 50 的矩阵。');
  return {name: match[1], rows};
}
function formatMatrixDefinition(name, rows) {
  const values=rows.map(row=>row.map(String));
  const widths=values[0].map((_,c)=>Math.max(...values.map(row=>row[c].length)));
  const prefix=`${name} = [`;
  return prefix+values.map(row=>row.map((value,c)=>value.padEnd(widths[c])).join(', ')).join(';\n'+' '.repeat(prefix.length))+'];';
}
function sliceCode(name, rows, selected) {
  if (!selected.size) throw Error('请先选中至少一个格子。');
  const m = rows.length, n = rows[0].length;
  const rs = [...new Set([...selected].map(i => i % m + 1))].sort((a,b)=>a-b);
  const cs = [...new Set([...selected].map(i => Math.floor(i / m) + 1))].sort((a,b)=>a-b);
  const idx = (values, total) => values.length === total ? ':' : values.length === 1 ? String(values[0]) : values.every((v,i)=>v===values[0]+i) ? `${values[0]}:${values.at(-1)}` : '[' + values.join(' ') + ']';
  if (rs.length * cs.length === selected.size) return `${name}(${idx(rs,m)}, ${idx(cs,n)})`;
  return `${name}([${[...selected].sort((a,b)=>a-b).map(i=>i+1).join(' ')}])`;
}
if (typeof module !== 'undefined') module.exports = {parseMatrix, sliceCode, validName, splitTop, formatMatrixDefinition};
if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  let dimensions = [3,3], matrix = null, selected = new Set(), currentCode = '';
  const variables = new Map();
  const attempt = fn => { $('error').textContent = ''; $('status').textContent = ''; try { fn(); } catch(e) { $('error').textContent = e.message; } };
  function remember(code) {
    const matches=[...code.matchAll(/^([A-Za-z][A-Za-z0-9_]*)\s*=/gm)];
    for(let i=0;i<matches.length;i++) {
      const name=matches[i][1], definition=code.slice(matches[i].index,matches[i+1]?.index??code.length).trim();
      let rows=null;try{rows=parseMatrix(definition).rows;}catch(e){/* Keep expression provenance when it cannot be expanded. */}
      variables.set(name,{name,definition,rows});
    }
    if(matches.length) renderVariables();
  }
  function renderVariables() {
    $('variableCount').textContent=variables.size;$('variableList').replaceChildren();
    for(const variable of [...variables.values()].reverse()) {
      const details=document.createElement('details');details.className='variable';
      const summary=document.createElement('summary');summary.textContent=variable.name+(variable.rows?` · ${variable.rows.length} × ${variable.rows[0].length}`:' · 表达式');details.append(summary);
      const pre=document.createElement('pre');pre.textContent=variable.definition;details.append(pre);
      const actions=document.createElement('div');actions.className='actions';
      const show=document.createElement('button');show.textContent='显示代码';show.onclick=()=>output(variable.definition,false);actions.append(show);
      if(variable.rows) {
        const edit=document.createElement('button');edit.textContent='格子编辑';edit.onclick=()=>window.matrixStudio.edit(variable.name,variable.rows);actions.append(edit);
        const slice=document.createElement('button');slice.textContent='选择切片';slice.onclick=()=>attempt(()=>{$('source').value=variable.definition;load();tab(true);window.scrollTo({top:0,behavior:'smooth'});});actions.append(slice);
      }
      details.append(actions);$('variableList').append(details);
    }
  }
  function output(code, record=true) { currentCode = code; $('output').textContent = code; $('status').textContent = ''; if(record) remember(code); }
  function tab(slice) { $('kinPanel').hidden = true; $('kinTab').classList.remove('active'); $('createPanel').hidden = slice; $('slicePanel').hidden = !slice; $('createTab').classList.toggle('active', !slice); $('sliceTab').classList.toggle('active',slice); $('error').textContent = ''; }
  function resize() {
    const m = Number($('rows').value), n = Number($('cols').value);
    if (![m,n].every(v=>Number.isInteger(v)&&v>=1&&v<=50)) throw Error('行列数必须为 1 到 50 的整数。');
    const old = [...$('createGrid').children].map(e=>e.value), oldN = dimensions[1];
    $('createGrid').replaceChildren(); $('createGrid').style.gridTemplateColumns = `repeat(${n}, 100px)`;
    for (let r=0;r<m;r++) for(let c=0;c<n;c++) { const input = document.createElement('input'); input.className='cell'; input.placeholder='0'; input.value = r<dimensions[0]&&c<oldN ? old[r*oldN+c] || '' : ''; input.setAttribute('aria-label',`第 ${r+1} 行，第 ${c+1} 列`); $('createGrid').append(input); }
    dimensions=[m,n];
  }
  function generate() {
    const name=$('name').value.trim(); if(!validName(name)) throw Error('变量名需以英文字母开头，仅包含字母、数字、下划线，最多 63 位，且不能是 MATLAB 关键字。');
    if(Number($('rows').value)!==dimensions[0]||Number($('cols').value)!==dimensions[1]) throw Error('行列数已改变，请先点击“更新格子”。');
    const values=[...$('createGrid').children].map(e=>e.value.trim()||'0');
    for(const value of values) { if (splitTop(value, ',;\n').length!==1 || /[\x27%\[\]"]/.test(value) || value.includes(':') || value.includes('=')) throw Error('每格请输入单个标量数字或公式；暂不支持矩阵、冒号展开、赋值、注释和转置。'); }
    const rows=Array.from({length:dimensions[0]},(_,r)=>values.slice(r*dimensions[1],(r+1)*dimensions[1]));
    const code=formatMatrixDefinition(name,rows); output(code); return code;
  }
  function refresh() { [...$('sliceGrid').children].forEach((el,i)=>el.classList.toggle('selected',selected.has(Number(el.dataset.index)))); $('selectionCount').textContent=`${matrix.rows.length} 行 × ${matrix.rows[0].length} 列 · 已选择 ${selected.size} 个元素`; [...$('sliceGrid').children].forEach(el=>el.setAttribute('aria-pressed',el.classList.contains('selected'))); }
  function load() {
    matrix=parseMatrix($('source').value); selected=new Set(); const m=matrix.rows.length,n=matrix.rows[0].length;
    $('sliceGrid').replaceChildren(); $('sliceGrid').style.gridTemplateColumns=`repeat(${n}, 100px)`;
    matrix.rows.forEach((row,r)=>row.forEach((value,c)=>{const b=document.createElement('button'); b.className='cell pick'; b.textContent=value; b.title=`${matrix.name}(${r+1}, ${c+1}) = ${value}`; b.setAttribute('aria-label',b.title); b.dataset.index=c*m+r; b.onclick=()=>{const i=c*m+r;selected.has(i)?selected.delete(i):selected.add(i);refresh();};$('sliceGrid').append(b);}));
    for(const [id,count,isRow] of [['rowTools',m,true],['colTools',n,false]]) { $(id).replaceChildren(); for(let k=0;k<count;k++){const b=document.createElement('button'); b.textContent=`${isRow?'行':'列'} ${k+1}`; b.onclick=()=>{const ids=Array.from({length:isRow?n:m},(_,j)=>isRow?j*m+k:k*m+j); const remove=ids.every(i=>selected.has(i)); ids.forEach(i=>remove?selected.delete(i):selected.add(i));refresh();};$(id).append(b);} }
    $('selectionTools').hidden=false;refresh();remember($('source').value);
  }
  $('createGrid').addEventListener('keydown', event => {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const moves = {ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1]};
    const move = moves[event.key];
    const cells = [...$('createGrid').children];
    const index = cells.indexOf(event.target);
    if (!move || index < 0) return;
    event.preventDefault();
    const [m, n] = dimensions;
    const row = Math.floor(index / n) + move[0], col = index % n + move[1];
    if (row < 0 || row >= m || col < 0 || col >= n) return;
    const next = cells[row * n + col];
    next.focus();
    next.select();
  });
  $('createPanel').addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.isComposing || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    attempt(generate);
  });
  $('createTab').onclick=()=>tab(false);$('sliceTab').onclick=()=>tab(true);
  $('resize').onclick=()=>attempt(resize);$('generate').onclick=()=>attempt(generate);
  $('toSlice').onclick=()=>attempt(()=>{const code=generate();$('source').value=code;load();tab(true);});
  $('parse').onclick=()=>attempt(load);
  $('source').oninput=()=>{matrix=null;selected.clear();$('selectionTools').hidden=true;};
  $('all').onclick=()=>{selected=new Set(Array.from({length:matrix.rows.length*matrix.rows[0].length},(_,i)=>i));refresh();};
  $('clear').onclick=()=>{selected.clear();refresh();};
  $('confirmSlice').onclick=()=>attempt(()=>output(sliceCode(matrix.name,matrix.rows,selected)));
  $('copy').onclick=async()=>{if(!currentCode){$('status').textContent='请先生成语句。';return;}try{await navigator.clipboard.writeText(currentCode);$('status').textContent='已复制。';}catch(e){$('status').textContent='无法自动复制，请选中代码手动复制。';}};
  window.matrixStudio = {output, attempt, variables, edit(name, rows) {
    $('name').value=name; $('rows').value=rows.length; $('cols').value=rows[0].length;
    resize(); [...$('createGrid').children].forEach((el,i)=>el.value=rows.flat()[i]); tab(false);
  }};
  resize();load();
}
