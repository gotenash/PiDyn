const fs=require('fs');
const path='c:/Users/ash/Documents/GitHub/PiDyn/server/player.html';
const s=fs.readFileSync(path,'utf8');
const m=s.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/i);
if(!m){ console.error('NO_INLINE_SCRIPT'); process.exit(2); }
const src=m[1];
function scan(str){
  let stack=[];
  let inSingle=false,inDouble=false,inBack=false,esc=false;
  for(let i=0;i<str.length;i++){
    const ch=str[i];
    if(esc){ esc=false; continue; }
    if(ch==='\\'){ esc=true; continue; }
    if(inSingle){ if(ch==="'") inSingle=false; continue; }
    if(inDouble){ if(ch==='"') inDouble=false; continue; }
    if(inBack){
      if(ch==='`') { inBack=false; continue; }
      if(ch==='$' && str[i+1]==='{') { stack.push({ch:'${',i:i}); i++; continue; }
      // '}' inside template expression should close a '${'
      if(ch==='}' ){
        const last = stack[stack.length-1];
        if(last && last.ch==='${') { stack.pop(); continue; }
      }
      continue;
    }
    if(ch==="'") { inSingle=true; continue; }
    if(ch==='"') { inDouble=true; continue; }
    if(ch==='`'){ inBack=true; continue; }
    if(ch==='('||ch==='{'||ch==='[') stack.push({ch,i});
    else if(ch===')'||ch==='}'||ch===']'){
      const last=stack.pop();
      if(!last){ return {error:'unmatched_closing',pos:i,ch}; }
      const pairs={'(':')','{':'}','[':']'};
      if(pairs[last.ch]!==ch){ return {error:'mismatch',pos:i,ch,last}; }
    }
  }
  return {ok:true,stack};
}
const res=scan(src);
// show all `${` occurrences for inspection
const occurrences = [];
for(let i=0;i<src.length-1;i++) if(src[i]==='$' && src[i+1]==='{') occurrences.push(i);
if(occurrences.length>0){
  console.log('Found ${ positions:', occurrences.length, occurrences.slice(0,20));
}

if(res.ok){
  if(res.stack.length>0){
    console.log('Unclosed tokens at end:', res.stack.map(x=>x.ch+'@'+x.i).join(', '));
    process.exit(3);
  } else console.log('All balanced');
} else {
  console.error('Error:',res);
  // print context around error position
  try{
    const p = res.pos;
    const start = Math.max(0, p-60);
    const end = Math.min(src.length, p+60);
    const ctx = src.slice(start,end);
    // compute line and column
    const upto = src.slice(0,p);
    const line = upto.split('\n').length;
    const col = p - upto.lastIndexOf('\n');
    console.error('Context around pos',p,'line',line,'col',col,'---');
    console.error(ctx);
  }catch(e){}
  process.exit(1);
}
