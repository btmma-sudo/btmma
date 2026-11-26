// Build a Flame checkout tests — all external payment/security requests are mocked.
// NO Stripe network traffic, credentials, real cards or customer records are used.
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { POST, GET } from "../src/pages/api/build-a-flame.js";
import {
  FLAME_DATE, FLAME_DEADLINE, FLAME_PRICE_CENTS, FLAME_SESSIONS,
  FLAME_SOURCE, flameTimes, checkoutReady, normalizeSubmission, ensureFlameSchema
} from "../src/lib/build-a-flame.js";

const ORIGIN = "https://burningtreemma.example";
const VALID = Object.freeze({
  guardianName: "Testing Guardian", phone: "4105550123",
  email: "parent@example.test", session: "one",
  children: [{ name: "Example Child One", age: 9 }, { name: "Example Child Two", age: 11 }],
  guardianConsent: true, turnstileToken: "simulated-turnstile-token"
});
const jsonResponse = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { "content-type": "application/json" }
});

class FakeD1 {
  constructor() { this.rows = new Map(); }
  async batch(statements) {
    return Promise.all(statements.map(statement => statement.run()));
  }
  prepare(sql) {
    const db = this;
    const query = (...params) => ({
      async run() {
        if (/^CREATE /i.test(sql)) return { meta: { changes: 0 } };
        if (/^INSERT INTO flame_workshop_registrations /.test(sql)) {
          const [id,session_id,guardian_name,email,phone,children_json,qty,amount_cents,hold_until] = params;
          assert.equal(db.rows.has(id), false);
          db.rows.set(id, { id,session_id,guardian_name,email,phone,children_json,qty,amount_cents,
            hold_until,status:"held",stripe_session_id:null,stripe_payment_intent_id:null });
          return { meta: { changes: 1 } };
        }
        if (sql.includes("status='checkout_open'")) {
          const [stripe_session_id,id] = params, row = db.rows.get(id);
          if (row?.status !== "held" || row.stripe_session_id) return { meta: { changes: 0 } };
          row.status = "checkout_open"; row.stripe_session_id = stripe_session_id;
          return { meta: { changes: 1 } };
        }
        if (sql.includes("status='paid'")) {
          const [payment_intent_id,id,stripe_session_id] = params;
          const row = db.rows.get(id);
          if (!row || row.stripe_session_id !== stripe_session_id ||
              !["held","checkout_open","paid"].includes(row.status)) return { meta: { changes: 0 } };
          row.status="paid"; row.stripe_payment_intent_id=payment_intent_id;
          return { meta: { changes: 1 } };
        }
        if (sql.includes("status='released'")) {
          const row = db.rows.get(params[0]);
          if (!row || row.status !== "held") return { meta: { changes: 0 } };
          row.status = "released";
          return { meta: { changes: 1 } };
        }
        throw Error("Unexpected mock D1 SQL run: " + sql);
      },
      async first() {
        if (sql.includes("FROM sqlite_master")) return null;
        if (sql.includes("SELECT * FROM flame_workshop_registrations")) {
          const [id,stripeId] = params, row=db.rows.get(id);
          return row?.stripe_session_id === stripeId ? row : null;
        }
        if (sql.includes("SELECT status FROM flame_workshop_registrations"))
          return db.rows.get(params[0]) || null;
        throw Error("Unexpected mock D1 SQL first: " + sql);
      }
    });
    return { bind: (...values) => query(...values), run: () => query().run(), first: () => query().first() };
  }
}
function mockWorld() {
  const db = new FakeD1();
  const env = {
    BUILD_A_FLAME_REGISTRATION_ENABLED: "true",
    LIVE_TRIAL_DB: db,
    TURNSTILE_SECRET_KEY: "simulated-turnstile-secret",
    STRIPE_LIVE_SECRET_KEY: "sk_live_SIMULATED_NOT_REAL"
  };
  const sessions = new Map();
  const requests = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes("challenges.cloudflare.com/turnstile/v0/siteverify"))
      return jsonResponse({ success: true });
    if (target === "https://api.stripe.com/v1/checkout/sessions" && options.method === "POST") {
      const p = new URLSearchParams(options.body);
      assert.equal(options.headers.Authorization, "Bearer sk_live_SIMULATED_NOT_REAL");
      assert.equal(p.get("mode"), "payment");
      assert.equal(p.get("line_items[0][price_data][unit_amount]"), "5000");
      assert.equal(p.get("line_items[0][price_data][currency]"), "usd");
      assert.equal(p.get("metadata[btmma_source]"), FLAME_SOURCE);
      const workshop = flameTimes()[p.get("metadata[session_id]")];
      assert.equal(p.get("metadata[event_date]"), workshop.date);
      assert.ok(p.get("line_items[0][price_data][product_data][name]").endsWith(workshop.label));
      const id = "cs_live_SIMULATED_SESSION_" + String(sessions.size + 1).padStart(4,"0");
      const count = Number(p.get("line_items[0][quantity]"));
      const m = Object.fromEntries([...p].filter(([k])=>k.startsWith("metadata["))
        .map(([k,v])=>[k.slice(9,-1),v]));
      const paymentSession = {
        id, url:"https://checkout.stripe.com/mock/" + id, livemode:true,
        mode:"payment", status:"open",payment_status:"unpaid",
        client_reference_id:p.get("client_reference_id"), amount_total:count*FLAME_PRICE_CENTS,
        currency:"usd", payment_intent:"pi_FAKE_INTENT_12345", metadata:m
      };
      sessions.set(id,paymentSession);requests.push({id,params:p});
      return jsonResponse(paymentSession);
    }
    if (target.startsWith("https://api.stripe.com/v1/checkout/sessions/")) {
      const id = decodeURIComponent(target.split("/").pop()), s = sessions.get(id);
      return s ? jsonResponse(s) : jsonResponse({error:"missing"},404);
    }
    throw Error("Unmocked network call forbidden: " + target);
  };
  return {db,env,sessions,requests,restore(){globalThis.fetch=oldFetch;}};
}
async function register(env, values=VALID) {
  const request = new Request(ORIGIN + "/api/build-a-flame",{
    method:"POST",
    headers:{origin:ORIGIN,"content-type":"application/json"},
    body:JSON.stringify(values)
  });
  const result = await POST({request,locals:{runtime:{env}}});
  return {status:result.status,body:await result.json()};
}
async function check(env, sessionId) {
  const request = new Request(ORIGIN + "/api/build-a-flame?session_id=" + encodeURIComponent(sessionId));
  const result = await GET({request,locals:{runtime:{env}}});
  return {status:result.status,body:await result.json()};
}
test("workshop price, exact Saturday and Sunday times, no attendance cap", () => {
  assert.equal(FLAME_DATE,"2026-12-05");
  assert.equal(FLAME_PRICE_CENTS,5000);
  assert.deepEqual(FLAME_SESSIONS,["one","two"]);
  assert.match(flameTimes().one.label,/11:45 AM.*12:45 PM/);
  assert.equal(flameTimes().two.date,"2026-12-06");
  assert.match(flameTimes().two.label,/1:30.*2:30 PM/);
  assert.ok(!("FLAME_CAPACITY" in flameTimes()));
  assert.equal(FLAME_DEADLINE,Date.parse("2026-11-30T05:00:00Z"));
  assert.equal(checkoutReady({}),false);
});
test("parent form validation, consent and per-transaction child handling", () => {
  assert.equal(normalizeSubmission(VALID)?.qty,2);
  assert.equal(normalizeSubmission({...VALID,guardianConsent:false}),null);
  assert.equal(normalizeSubmission({...VALID,children:[]}),null);
  assert.equal(normalizeSubmission({...VALID,session:"invalid"}),null);
  assert.equal(normalizeSubmission({...VALID,children:[{name:"A",age:30}]}),null);
  assert.equal(normalizeSubmission({...VALID,children:Array.from({length:7},(_,i)=>({name:"Child "+i,age:8}))}),null);
});
test("checkout disabled: cannot contact Stripe or charge anyone", async () => {
  const w=mockWorld();
  try {
    w.env.BUILD_A_FLAME_REGISTRATION_ENABLED="false";
    const p=await register(w.env);
    assert.equal(p.status,503);
    assert.equal(w.requests.length,0);
    assert.equal(w.db.rows.size,0);
    const status=await GET({request:new Request(ORIGIN+"/api/build-a-flame"),locals:{runtime:{env:w.env}}});
    const data=await status.json();
    assert.equal(data.ready,false);
    assert.deepEqual(data.sessions.map(s => s.id),["one","two"]);
    assert.equal(data.pricePerChildCents,5000);
    assert.equal("maxPerSession" in data,false);
  } finally { w.restore(); }
});
test("two children: simulated $100 Stripe checkout -> unpaid -> paid confirmation", async () => {
  const w=mockWorld();
  try {
    const p=await register(w.env,{...VALID,session:"two"});
    assert.equal(p.status,200,p.body.error);
    assert.equal(w.requests.length,1);
    assert.match(p.body.url,/^https:\/\/checkout\.stripe\.com\/mock/);
    const {id,params}=w.requests[0];
    assert.equal(Number(params.get("line_items[0][quantity]")),2);
    assert.equal(params.get("customer_email"),"parent@example.test");
    assert.equal(w.db.rows.size,1);
    const row=[...w.db.rows.values()][0];
    assert.equal(row.status,"checkout_open");
    assert.equal(row.session_id,"two");
    assert.equal(row.qty,2);
    assert.equal(row.amount_cents,10000);
    assert.equal(JSON.parse(row.children_json).length,2);
    const pending=await check(w.env,id);
    assert.equal(pending.status,200);
    assert.equal(pending.body.confirmed,false);
    assert.equal(w.db.rows.get(row.id).status,"checkout_open");
    w.sessions.get(id).payment_status="paid";
    w.sessions.get(id).status="complete";
    const completed=await check(w.env,id);
    assert.equal(completed.status,200,completed.body.error);
    assert.equal(completed.body.confirmed,true);
    assert.equal(completed.body.quantity,2);
    assert.equal(completed.body.sessionLabel,flameTimes().two.label);
    assert.equal(completed.body.amountCents,10000);
    assert.equal(w.db.rows.get(row.id).status,"paid");
    const repeated=await check(w.env,id);
    assert.equal(repeated.body.confirmed,true,"status check should be safe to repeat");
  } finally { w.restore(); }
});
test("tampered Stripe amount must never confirm payment",async () => {
  const w=mockWorld();
  try {
    const p=await register(w.env);
    assert.equal(p.status,200);
    const sid=w.requests[0].id;
    const stripe=w.sessions.get(sid);
    stripe.payment_status="paid";
    stripe.amount_total=5000; // Wrong amount for two paid registrations.
    const result=await check(w.env,sid);
    assert.equal(result.status,503);
    assert.equal(result.body.confirmed,false);
    assert.equal([...w.db.rows.values()][0].status,"checkout_open");
  } finally { w.restore(); }
});
test("no overall attendance limit: 15 simulated children across separate guardians",async () => {
  const w=mockWorld();
  try {
    for(let i=0;i<15;i++){
      const p=await register(w.env,{
        ...VALID,
        email:"guardian"+i+"@example.test",
        children:[{name:"Child Example "+i,age:8}]
      });
      assert.equal(p.status,200,"guardian index "+i+" was rejected: "+p.body.error);
    }
    assert.equal(w.db.rows.size,15);
    assert.equal(w.requests.length,15);
    assert.ok([...w.db.rows.values()].every(row=>row.qty===1 && row.amount_cents===5000));
    assert.ok([...w.db.rows.values()].every(row=>row.status==="checkout_open"));
  } finally { w.restore(); }
});
test("registration closes after November 29 Eastern cutoff",async () => {
  const w=mockWorld();
  const oldNow=Date.now;
  try {
    Date.now=()=>FLAME_DEADLINE + 1000;
    const p=await register(w.env);
    assert.equal(p.status,409);
    assert.equal(w.requests.length,0);
  } finally { Date.now=oldNow;w.restore(); }
});

test("the D1 schema upgrade preserves Saturday registrations and admits Sunday", async () => {
  const sqlite = new DatabaseSync(":memory:");
  const db = {
    prepare(sql) {
      return {
        run: () => sqlite.prepare(sql).run(),
        bind: (...values) => ({ first: () => sqlite.prepare(sql).get(...values) })
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        for (const statement of statements) statement.run();
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    }
  };
  try {
    await ensureFlameSchema(db);
    const table = "flame_workshop_registrations";
    const { sql } = sqlite.prepare("SELECT sql FROM sqlite_master WHERE name=?").get(table);
    sqlite.exec("DROP TABLE " + table);
    sqlite.exec(sql.replace("IN ('one','two')", "IN ('one')"));
    const insert = sqlite.prepare(
      "INSERT INTO flame_workshop_registrations (id,session_id,guardian_name,email,phone,children_json,qty,amount_cents,status,stripe_session_id,hold_until) VALUES (?,?,'Example','example@example.test','4105550123','[]',1,5000,'paid',?,0)"
    );
    insert.run("saturday","one","example-saturday-stripe");
    assert.throws(() => insert.run("sunday","two","example-sunday-stripe"), /CHECK constraint/);
    await ensureFlameSchema(db);
    assert.equal(sqlite.prepare("SELECT stripe_session_id FROM " + table + " WHERE id='saturday'").get().stripe_session_id, "example-saturday-stripe");
    insert.run("sunday","two","example-sunday-stripe");
    await ensureFlameSchema(db);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM " + table + " WHERE status='paid'").get().count, 2);
  } finally {
    sqlite.close();
  }
});
