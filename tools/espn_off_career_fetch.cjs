// Caches PRE-1999 ESPN career rows into data/raw/espn_off_career/{gsis}.json (resumable, throttled 0.25s).
// Targets: (a) offensive-group players (grp of earliest players.json row in QB/RB/WR/TE) whose espn_off cache
//   shows at least one season < 1999 (or has no cache entry); (b) defensive-group players that have no
//   espn_def cache file (those already cached keep their pre-1999 defensive rows in espn_def).
// usage: node tools/espn_off_career_fetch.cjs [rev]     (run at most two: one forward, one "rev")
const fs=require("fs"),path=require("path");
const ROOT=path.join(__dirname,"..");
const d=JSON.parse(fs.readFileSync(path.join(ROOT,"public/data/players.json"),"utf8")).players;
const csv=fs.readFileSync(path.join(ROOT,"data/raw/players.csv"),"utf8").split(/\r?\n/);
const h=csv[0].split(",");const gi=h.indexOf("gsis_id"),ei=h.indexOf("espn_id");
const esp={};for(const l of csv.slice(1)){const c=l.split(",");if(c[gi]&&c[ei])esp[c[gi]]=c[ei]}
const first={};for(const r of d){const f=first[r.id];if(!f||r.season<f.season)first[r.id]=r}
const OFF=["QB","RB","WR","TE"];
const out=path.join(ROOT,"data/raw/espn_off_career");fs.mkdirSync(out,{recursive:true});
let ids=[];
for(const id in first){
  if(!esp[id])continue;
  if(OFF.includes(first[id].grp)){
    const f=path.join(ROOT,"data/raw/espn_off",id+".json");
    if(fs.existsSync(f)){const j=JSON.parse(fs.readFileSync(f,"utf8"));
      if(j.none)continue;                               // ESPN 404: nothing to fetch
      if(!Object.keys(j.gp||{}).some(y=>+y<1999))continue; // cached games-by-year show no pre-1999 season
    }
    ids.push(id);
  }else if(!fs.existsSync(path.join(ROOT,"data/raw/espn_def",id+".json")))ids.push(id);
}
ids.sort();
if(process.argv[2]==="rev")ids.reverse();
(async()=>{let n=0,skip=0,fail=0;console.log("targets",ids.length);
for(const id of ids){const f=path.join(out,id+".json");if(fs.existsSync(f)){skip++;continue}
 let ok=false;
 for(let t=0;t<4&&!ok;t++){try{const r=await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${esp[id]}/stats`);
   if(r.status===404){fs.writeFileSync(f+".tmp",JSON.stringify({espn:esp[id],none:true}));fs.renameSync(f+".tmp",f);ok=true;break}
   if(!r.ok)throw new Error(r.status);const j=await r.json();
   const cats={};
   for(const c of (j.categories||[])){
     const rows=c.statistics.filter(s=>s.season.year<1999).map(s=>({y:s.season.year,t:s.teamSlug,s:s.stats}));
     if(rows.length)cats[c.name]={names:c.names,rows};
   }
   fs.writeFileSync(f+".tmp",JSON.stringify({espn:esp[id],cats}));fs.renameSync(f+".tmp",f);ok=true}
  catch(e){await new Promise(r=>setTimeout(r,2000*(t+1)))}}
 if(!ok)fail++;n++;if(n%200===0)console.log("fetched",n,"skip",skip,"fail",fail);
 await new Promise(r=>setTimeout(r,250));}
console.log("DONE fetched",n,"skip",skip,"fail",fail,"of",ids.length);})();
