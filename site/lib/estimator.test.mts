import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateEstimate,
  defaultVisualizerState,
  normalizeVisualizerState,
  resolveVisualizerTemplate,
  VISUALIZER_LIMITS
} from "./estimator.ts";

test("commission estimates include materials, labor, overhead, markup, and queue-aware lead time", () => {
  const estimate = calculateEstimate({ ...defaultVisualizerState("dining-room-table"), material: "White Oak", drawers: 2, shelves: 1 }, 4, 70);
  assert.ok(estimate.materialCostCents > 0);
  assert.ok(estimate.laborCostCents > 0);
  assert.ok(estimate.overheadCostCents > 0);
  assert.ok(estimate.markupCostCents > 0);
  assert.equal(estimate.totalCents, estimate.materialCostCents + estimate.laborCostCents + estimate.overheadCostCents + estimate.markupCostCents);
  assert.ok(estimate.leadTimeDays > 70);
});

test("future commission types receive safe visualizer and estimator defaults", () => {
  const state = defaultVisualizerState("custom-wall-console");
  assert.equal(state.kind, "custom-wall-console");
  assert.deepEqual([state.width, state.depth, state.height], [48, 20, 30]);
  assert.ok(calculateEstimate(state, 0, 30).totalCents > 0);
});

test("commission templates cover known forms and retain a generic fallback", () => {
  assert.equal(resolveVisualizerTemplate("Scientists Desk"), "table");
  assert.equal(resolveVisualizerTemplate("stepstool"), "stool");
  assert.equal(resolveVisualizerTemplate("pantry cupboard"), "cabinet");
  assert.equal(resolveVisualizerTemplate("wall bookcase"), "shelf");
  assert.equal(resolveVisualizerTemplate("unclassified sculptural form"), "object");
});

test("unsafe dimensions and counts are normalized before estimating", () => {
  const normalized = normalizeVisualizerState({
    ...defaultVisualizerState("other-custom-work"),
    width: Number.NaN,
    depth: -40,
    height: 9999,
    drawers: 2.6,
    shelves: 999
  });

  assert.equal(normalized.width, VISUALIZER_LIMITS.width.min);
  assert.equal(normalized.depth, VISUALIZER_LIMITS.depth.min);
  assert.equal(normalized.height, VISUALIZER_LIMITS.height.max);
  assert.equal(normalized.drawers, 3);
  assert.equal(normalized.shelves, VISUALIZER_LIMITS.shelves.max);
  assert.ok(calculateEstimate(normalized, 0, 21).totalCents > 0);
});

test("saved commission pricing drives estimates, preserves zero, and rejects invalid policy values", () => {
  const state = {...defaultVisualizerState("other-custom-work"), width:48, depth:24, joinery:"Concealed joinery", drawers:0, shelves:0};
  const base = calculateEstimate(state, 1, 30);
  const configured = calculateEstimate(state, 1, 30, {baseLaborHours:10, baseMarkupPercent:30});
  assert.equal(configured.laborHours, 10);
  assert.equal(configured.laborCostCents, 75000);
  assert.equal(configured.markupCostCents, Math.round((configured.materialCostCents + configured.laborCostCents + configured.overheadCostCents) * .3));
  assert.notEqual(configured.totalCents, base.totalCents);
  const zero = calculateEstimate(state, 1, 30, {baseLaborHours:0, baseMarkupPercent:0});
  assert.equal(zero.laborCostCents, 0);assert.equal(zero.markupCostCents, 0);
  assert.deepEqual(calculateEstimate(state, 1, 30, {baseLaborHours:NaN, baseMarkupPercent:-1}),base);
});

test("persisted custom pricing reopens and workload excludes completed and unrelated-business work", async () => {
  const {mkdtempSync,mkdirSync,rmSync,readFileSync}=await import("node:fs");
  const {tmpdir}=await import("node:os");const path=await import("node:path");
  const root=mkdtempSync(path.join(tmpdir(),"woodsmith-estimator-"));
  const prior={DATA_ROOT:process.env.DATA_ROOT,MEDIA_ROOT:process.env.MEDIA_ROOT,NODE_ENV:process.env.NODE_ENV};
  process.env.NODE_ENV="test";process.env.DATA_ROOT=path.join(root,"data");process.env.MEDIA_ROOT=path.join(root,"media");mkdirSync(process.env.MEDIA_ROOT);
  const db=await import("./db.ts");
  try {
    db.saveCommissionType({slug:"policy-fixture",label:"Policy fixture",description:"",baseLaborHours:13,baseMarkupPercent:17,materialOptions:["White Oak"],defaultDimensions:{width:48,depth:24,height:30,unit:"in"},active:true});
    db.closeDatabaseForTests();const policy=db.getCommissionType("policy-fixture");assert.ok(policy);
    const estimate=calculateEstimate({...defaultVisualizerState(policy.slug),width:48,depth:24,joinery:"Concealed joinery",drawers:0,shelves:0},0,21,policy);
    assert.equal(estimate.laborHours,13);
    const empty=db.getBandwidthSnapshot();
    const make=(status:string,hours:number)=>db.createProject({userEmail:null,guestName:"Fixture",guestEmail:"fixture@example.test",kind:"commission",status,stage:"Contact review",estimatedTotalCents:0,estimator:{laborHours:hours},brief:"Isolated fixture",materials:["White Oak"],dimensions:{width:48,depth:24,height:30,unit:"in"}});
    make("Closed",10000);const archived=make("Request received",10000);
    db.withDatabaseTransaction(sql=>sql.prepare("UPDATE projects SET archived_at=? WHERE reference=?").run(new Date().toISOString(),archived));
    assert.deepEqual(db.getBandwidthSnapshot(),empty);
    const own=make("Request received",36);const ownSnapshot=db.getBandwidthSnapshot();assert.equal(ownSnapshot.activeProjects,empty.activeProjects+1);
    const other=make("Request received",10000);
    db.withDatabaseTransaction(sql=>{
      sql.prepare("INSERT INTO woodworkers(id,slug,business_name,contact_email,created_at,updated_at) VALUES('other-fixture','other-fixture','Other fixture','other@example.test',?,?)").run(new Date().toISOString(),new Date().toISOString());
      sql.prepare("UPDATE resource_ownership SET woodworker_id='other-fixture' WHERE kind='project' AND resource_key=?").run(other);
    });
    assert.deepEqual(db.getBandwidthSnapshot(),ownSnapshot);
    assert.equal(db.getBandwidthSnapshot(null).activeProjects,ownSnapshot.activeProjects+1);
    db.withDatabaseTransaction(sql=>sql.prepare("UPDATE projects SET completed_at=? WHERE reference=?").run(new Date().toISOString(),own));
    assert.deepEqual(db.getBandwidthSnapshot(),empty);
    const draft=db.createDraftOrder({subtotalCents:12000,shippingCents:0,taxCents:0,discountCents:0,currency:"usd"});
    const before=db.getStudioDashboardSummary().monthlyRevenueCents;assert.equal(before,0);
    db.withDatabaseTransaction(sql=>sql.prepare("UPDATE orders SET payment_status='paid' WHERE order_number=?").run(draft));
    assert.equal(db.getStudioDashboardSummary().monthlyRevenueCents,12000);
    db.withDatabaseTransaction(sql=>sql.prepare("UPDATE orders SET status='Refunded' WHERE order_number=?").run(draft));
    assert.equal(db.getStudioDashboardSummary().monthlyRevenueCents,0);
    const actions=readFileSync(new URL("./actions.ts",import.meta.url),"utf8");
    assert.match(actions,/calculateEstimate\(state, bandwidth.activeProjects, bandwidth.leadTimeDays, commissionType\)/);
    const preview=readFileSync(new URL("../components/visualizer.tsx",import.meta.url),"utf8");
    assert.match(preview,/calculateEstimate\(syncedState, queueCount, bandwidthLeadTimeDays, selectedType\)/);
  } finally {
    db.closeDatabaseForTests();for(const [key,value] of Object.entries(prior)){if(value===undefined)delete process.env[key];else process.env[key]=value;}rmSync(root,{recursive:true,force:true});
  }
});
