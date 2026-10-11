// caches ESPN games played per season for offensive players (QB/RB/WR/TE) into data/raw/espn_off (resumable, throttled)
// usage: node tools/espn_off_fetch.cjs [rev]
const fs=require("fs"),path=require("path");
const ROOT=path.join(__dirname,"..");
const d=JSON.parse(fs.readFileSync(path.join(ROOT,"public/data/players.json"),"utf8")).players;
const csv=fs.readFileSync(path.join(ROOT,"data/raw/players.csv"),"utf8").split(/\r?\n/);
const h=csv[0].split(",");const gi=h.indexOf("gsis_id"),ei=h.indexOf("espn_id");
const esp={};for(const l of csv.slice(1)){const c=l.split(",");if(c[gi]&&c[ei])esp[c[gi]]=c[ei]}
let ids=[...new Set(d.filter(r=>["QB","RB","WR","TE"].includes(r.grp)).map(r=>r.id))].filter(i=>esp[i]);
if(process.argv[2]==="rev")ids.reverse();
const dir=path.join(ROOT,"data/raw/espn_off");
(async()=>{let n=0,skip=0,fail=0;
for(const id of ids){const f=path.join(dir,id+".json");if(fs.existsSync(f)){skip++;continue}
 let ok=false;
 for(let t=0;t<4&&!ok;t++){try{const r=await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${esp[id]}/stats`);
   if(r.status===404){fs.writeFileSync(f,JSON.stringify({espn:esp[id],none:true}));ok=true;break}
   if(!r.ok)throw new Error(r.status);const j=await r.json();
   const gp={};
   for(const c of (j.categories||[])){const ix=c.names.indexOf("gamesPlayed");if(ix<0)continue;
     const by={};
     for(const s of c.statistics){const y=s.season.year,tot=/Totals/.test(s.teamSlug||"");const v=parseFloat(s.stats[ix]||0)||0;
       const e=by[y]||(by[y]={tot:null,sum:0});if(tot)e.tot=v;else e.sum+=v}
     for(const y in by){const v=by[y].tot!==null?by[y].tot:by[y].sum;gp[y]=Math.max(gp[y]||0,v)}}
   fs.writeFileSync(f,JSON.stringify({espn:esp[id],gp}));ok=true}
  catch(e){await new Promise(r=>setTimeout(r,2000*(t+1)))}}
 if(!ok)fail++;n++;if(n%200===0)console.log("fetched",n,"skip",skip,"fail",fail);
 await new Promise(r=>setTimeout(r,250));}
console.log("DONE fetched",n,"skip",skip,"fail",fail,"of",ids.length);})();
