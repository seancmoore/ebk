// caches ESPN college-football athlete stats (all seasons, per team) for CFB players whose first row in
// public/data/cfb/players.json is 2018 or earlier (only they can have pre-window or 2014-15 seasons).
// resumable, 0.25 s throttle; run once forward and once with "rev" for two workers.
const fs=require("fs"),path=require("path");
const ROOT=path.join(__dirname,"..");
const d=JSON.parse(fs.readFileSync(path.join(ROOT,"public/data/cfb/players.json"),"utf8")).players;
const first={};for(const r of d){first[r.id]=Math.min(first[r.id]||9999,r.season)}
let ids=Object.keys(first).filter(i=>first[i]<=2018).sort();
if(process.argv[2]==="rev")ids.reverse();
const dir=path.join(ROOT,"data/raw/espn_cfb");
(async()=>{let n=0,skip=0,fail=0;
for(const id of ids){const f=path.join(dir,id+".json");if(fs.existsSync(f)){skip++;continue}
 let ok=false;
 for(let t=0;t<4&&!ok;t++){try{const r=await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes/${id}/stats`);
   if(r.status===404){fs.writeFileSync(f,JSON.stringify({none:true}));ok=true;break}
   if(!r.ok)throw new Error(r.status);const j=await r.json();
   const out={cats:{}};
   for(const c of (j.categories||[])){out.cats[c.name]={names:c.names,rows:c.statistics.map(s=>({y:s.season.year,t:s.teamId,p:s.position,s:s.stats}))}}
   fs.writeFileSync(f,JSON.stringify(out));ok=true}
  catch(e){await new Promise(r=>setTimeout(r,2000*(t+1)))}}
 if(!ok)fail++;n++;if(n%500===0)console.log("fetched",n,"skip",skip,"fail",fail);
 await new Promise(r=>setTimeout(r,250));}
console.log("DONE fetched",n,"skip",skip,"fail",fail,"of",ids.length);})();
