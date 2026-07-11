const fs=require('fs');
const path='c:/Users/ash/Documents/GitHub/PiDyn/server/player.html';
const s=fs.readFileSync(path,'utf8');
const m=s.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/i);
if(!m){ console.error('NO_INLINE_SCRIPT'); process.exit(2); }
const src=m[1];
const lines=src.split(/\n/);
const target=613;
const start=Math.max(0,target-6);
for(let i=start;i<Math.min(lines.length,start+15);i++){
  console.log((i+1).toString().padStart(4)+': '+lines[i]);
}
console.log('TOTAL_LINES',lines.length);
