// caches ESPN defensive career stats per player into data/raw/espn_def (resumable, throttled)
const fs=require("fs"),path=require("path");
const ROOT=path.join(__dirname,"..");
const d=JSON.parse(fs.readFileSync(path.join(ROOT,"public/data/players.json"),"utf8")).players;
const csv=fs.readFileSync(path.join(ROOT,"data/raw/players.csv"),"utf8").split(/\r?\n/);
const h=csv[0].split(",");const gi=h.indexOf("gsis_id"),ei=h.indexOf("espn_id");
const esp={};for(const l of csv.slice(1)){const c=l.split(",");if(c[gi]&&c[ei])esp[c[gi]]=c[ei]}
const ids=[...new Set(d.filter(r=>["DL","LB","DB"].includes(r.grp)&&r.stats.tackles!==undefined).map(r=>r.id))].filter(i=>esp[i]);
const dir=path.join(ROOT,"data/raw/espn_def");
(async()=>{let n=0,skip=0,fail=0;
for(const id of ids){const f=path.join(dir,id+".json");if(fs.existsSync(f)){skip++;continue}
 let ok=false;
 for(let t=0;t<4&&!ok;t++){try{const r=await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${esp[id]}/stats`);
   if(r.status===404){fs.writeFileSync(f,JSON.stringify({espn:esp[id],none:true}));ok=true;break}
   if(!r.ok)throw new Error(r.status);const j=await r.json();
   const c=(j.categories||[]).find(c=>c.name==="defensive");
   fs.writeFileSync(f,JSON.stringify({espn:esp[id],names:c?c.names:null,rows:c?c.statistics.map(s=>({y:s.season.year,t:s.teamSlug,s:s.stats})):[]}));ok=true}
  catch(e){await new Promise(r=>setTimeout(r,2000*(t+1)))}}
 if(!ok)fail++;n++;if(n%200===0)console.log("fetched",n,"skip",skip,"fail",fail);
 await new Promise(r=>setTimeout(r,250));}
console.log("DONE fetched",n,"skip",skip,"fail",fail,"of",ids.length);})();
