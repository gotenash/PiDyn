const fs=require('fs');
const path='c:/Users/ash/Documents/GitHub/PiDyn/server/player.html';
const s=fs.readFileSync(path,'utf8');
const m=s.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/i);
if(!m){ console.error('NO_INLINE_SCRIPT'); process.exit(2); }
const src=m[1];
let stack=[];
let i=0;
while(i<src.length){
  const ch=src[i];
  // skip strings
  if(ch==='"' || ch==="'"){
    const q=ch; i++; while(i<src.length){ if(src[i]==='\\') i+=2; else if(src[i]===q){ i++; break;} else i++; }
    continue;
  }
  if(ch==='`'){
    i++; while(i<src.length){ if(src[i]==='\\') i+=2; else if(src[i]==='`'){ i++; break;} else if(src[i]==='$' && src[i+1]==='{'){ // skip until matching }
      i+=2; let depth=1; while(i<src.length && depth>0){ if(src[i]==='\\') i+=2; else if(src[i]==='{') depth++; else if(src[i]==='}') depth--; else i++; } continue; } else i++; }
    continue;
  }
  // skip comments
  if(ch==='/' && src[i+1]==='*'){ i+=2; while(i<src.length && !(src[i]==='*' && src[i+1]==='/')) i++; i+=2; continue; }
  if(ch==='/' && src[i+1]==='/'){ i+=2; while(i<src.length && src[i]!=='\n') i++; continue; }
  if(ch==='('||ch==='{'||ch==='[') stack.push({ch,i});
  else if(ch===')'||ch==='}'||ch===']'){
    const last=stack.pop(); if(!last){ console.error('Unmatched closing',ch,'at',i); process.exit(1);} const pairs={'(':')','{':'}','[':']'}; if(pairs[last.ch]!==ch){ console.error('Mismatch',last.ch,'closed by',ch,'at',i); process.exit(1);} }
  i++;
}
if(stack.length>0){
  console.error('Unclosed at end:', stack.map(x=>x.ch+'@'+x.i).join(', '));
  const pos = stack[0].i;
  const before = src.slice(Math.max(0,pos-80), pos+80);
  const line = src.slice(0,pos).split('\n').length;
  console.error('Context around',pos,'line',line, before);
  process.exit(2);
}
console.log('Balanced');
