import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

test("the deploy drift gate rejects changed or missing relative worker dependencies",()=>{
  const root=mkdtempSync(join(tmpdir(),"tg-worker-dependency-"));
  try {
    const checks=join(root,"tools/checks"),worker=join(root,"app/supabase/functions/fixture");
    mkdirSync(checks,{recursive:true});mkdirSync(worker,{recursive:true});
    const gate=join(checks,"edge-function-drift.mjs");
    writeFileSync(gate,readFileSync(new URL("../checks/edge-function-drift.mjs",import.meta.url)));
    const body="export const entry = true;\n",dependency="export const claim = true;\n";
    const hash=(s)=>createHash("sha256").update(s).digest("hex");
    writeFileSync(join(worker,"index.ts"),body);writeFileSync(join(worker,"claim.ts"),dependency);
    writeFileSync(join(checks,"edge-function-manifest.json"),JSON.stringify({functions:{fixture:{sha256:hash(body),file_sha256:{"claim.ts":hash(dependency)},redacted:false}}}));
    const run=()=>spawnSync(process.execPath,[gate],{cwd:root,encoding:"utf8"});
    assert.equal(run().status,0);
    writeFileSync(join(worker,"claim.ts"),dependency+"// changed\n");
    let result=run();assert.equal(result.status,1);assert.match(result.stdout+result.stderr,/fixture\/claim.ts/);
    rmSync(join(worker,"claim.ts"));result=run();assert.equal(result.status,1);assert.match(result.stdout+result.stderr,/fixture\/claim.ts/);
    writeFileSync(join(worker,"claim.ts"),dependency.replace(/\n/g,"\r\n"));assert.equal(run().status,0);
  } finally {rmSync(root,{recursive:true,force:true});}
});
