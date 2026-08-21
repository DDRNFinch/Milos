import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const pack=JSON.parse(fs.readFileSync("course-packs/Trowel_Occupations_6570-05_v1.nisi","utf8"));
const bridge=fs.readFileSync("assets/milos-nvq-mapping-v22.js","utf8");

function mappingApi(){
  const box={console,fetch:async()=>({ok:true,json:async()=>pack}),MilosCore:{loadCourse:async()=>null}};
  box.window=box;
  vm.createContext(box);
  vm.runInContext(bridge,box,{filename:"milos-nvq-mapping-v22.js"});
  return box.MilosNvqMapping;
}
function opportunities(siteData){return (siteData||[]).flatMap(cat=>(cat.jobs||[]).flatMap(job=>(job.opps||[]).map(op=>({cat,job,op}))))}
function sourcePaths(){
  if(Array.isArray(pack.pathways)&&pack.pathways.length)return pack.pathways;
  return [{id:"thin",title:pack.title,codes:pack.codes,codeDescriptions:pack.codeDescriptions,siteData:pack.siteData,units:pack.units}];
}

test("Milos repairs every selectable Level 3 NVQ area before observation",()=>{
  const api=mappingApi();
  assert.equal(api.version,"2.2");
  for(const path of sourcePaths()){
    const course={
      route:{courseId:"6570-05",pathway:path.id},
      courseType:"nvq",
      codes:path.codes||pack.codes||[],
      descriptions:path.codeDescriptions||pack.codeDescriptions||{},
      siteData:path.siteData||pack.siteData||[],
      units:path.units||pack.units||[]
    };
    const fixed=api.repair(course,pack.nvqMeta||{}),opps=opportunities(fixed.siteData),allowed=new Set(fixed.codes.map(String)),mapped=new Set();
    assert.ok(opps.length>0,`${path.id} contains observation areas`);
    for(const {cat,job,op} of opps){
      assert.ok(Array.isArray(op.codes)&&op.codes.length>0,`${path.id}: ${cat.title} / ${job.title} / ${op.title} has ACs`);
      for(const code of op.codes){assert.ok(allowed.has(String(code)),`${path.id}: ${op.title} uses a valid route AC`);mapped.add(String(code))}
    }
    assert.deepEqual(fixed.codes.filter(code=>!mapped.has(String(code))),[],`${path.id}: all official route ACs remain reachable`);
    assert.equal(fixed.mappingRevision,4);
    assert.equal(fixed.mappingRule,"holistic-no-empty-v22");
  }
});

test("known formerly-empty Milos areas now receive ACs",()=>{
  const api=mappingApi(),path=sourcePaths()[0];
  const fixed=api.repair({route:{courseId:"6570-05",pathway:path.id},courseType:"nvq",codes:path.codes||pack.codes||[],descriptions:path.codeDescriptions||pack.codeDescriptions||{},siteData:path.siteData||pack.siteData||[],units:path.units||pack.units||[]},pack.nvqMeta||{});
  const byId=new Map(opportunities(fixed.siteData).map(x=>[x.op.id,x.op]));
  for(const id of ["prepare_tools_ppe_work_area_2","prepare_tools_ppe_work_area_5","plan_sequence_programme_1"]){
    if(!byId.has(id))continue;
    assert.ok(byId.get(id).codes.length>0,`${id} is mapped`);
  }
  const index=fs.readFileSync("index.html","utf8"),sw=fs.readFileSync("sw.js","utf8"),pkg=JSON.parse(fs.readFileSync("package.json","utf8"));
  assert.match(index,/milos-app-version" content="2\.2"/);
  assert.match(index,/milos-nvq-mapping-v22\.js\?v=2\.2/);
  assert.match(sw,/milos-assessor-shell-v2\.2/);
  assert.equal(pkg.version,"2.2.0");
});
