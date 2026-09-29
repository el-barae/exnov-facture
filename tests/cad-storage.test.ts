import test from "node:test";
import assert from "node:assert/strict";
import { ACTIVE_PLAN_KEY, PLAN_PREFIX, PlanConflictError, loadPlans, savePlan } from "../src/lib/cad/storage";
import { createEmptyPlan } from "../src/lib/cad/templates";

class MemoryStorage implements Storage {
  data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return Array.from(this.data.keys())[index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

test("CAD library keeps separate plans and remembers the current drawing", () => {
  const storage = new MemoryStorage();
  const first = createEmptyPlan("Premier");
  const second = createEmptyPlan("Second");
  savePlan(storage, first);
  savePlan(storage, second);
  const result = loadPlans(storage);
  assert.equal(result.plans.length, 2);
  assert.equal(result.activeId, second.id);
  assert.equal(result.plans.find(plan => plan.id === first.id)?.name, "Premier");
  assert.equal(result.warning, "");
});

test("CAD library preserves corrupt or mismatched records and loads valid plans", () => {
  const storage = new MemoryStorage();
  const plan = createEmptyPlan();
  savePlan(storage, plan);
  storage.setItem(PLAN_PREFIX + "broken", "{broken");
  storage.setItem(PLAN_PREFIX + "mismatched", JSON.stringify(plan));
  const result = loadPlans(storage);
  assert.equal(result.plans.length, 1);
  assert.match(result.warning, /2 sauvegarde/);
  assert.equal(storage.getItem(PLAN_PREFIX + "broken"), "{broken");
});

test("failed CAD write never destroys the previous saved drawing", () => {
  const storage = new MemoryStorage();
  const plan = createEmptyPlan("Original");
  savePlan(storage, plan);
  storage.setItem = () => { throw new DOMException("Quota", "QuotaExceededError"); };
  assert.throws(() => savePlan(storage, { ...plan, name: "Modified" }));
  assert.equal(loadPlans(storage).plans[0].name, "Original");
});

test("CAD drawing stays saved when only the current-plan pointer fails", () => {
  const storage = new MemoryStorage();
  const plan = createEmptyPlan();
  storage.setItem = (key, value) => {
    if (key === ACTIVE_PLAN_KEY) throw new DOMException("Quota", "QuotaExceededError");
    storage.data.set(key, value);
  };
  assert.doesNotThrow(() => savePlan(storage, plan));
  assert.equal(loadPlans(storage).plans[0].id, plan.id);
});


test("CAD snapshots preserve the exact stored JSON and successful writes return the new snapshot", () => {
  const storage = new MemoryStorage();
  const plan = createEmptyPlan("Original");
  const original = JSON.stringify(plan, null, 2);
  storage.setItem(PLAN_PREFIX + plan.id, original);
  const loaded = loadPlans(storage);
  assert.equal(loaded.snapshots[plan.id], original);
  const saved = savePlan(storage, { ...plan, name: "Updated" }, original);
  assert.equal(saved, storage.getItem(PLAN_PREFIX + plan.id));
  assert.equal(JSON.parse(saved).name, "Updated");
});

test("a stale CAD write preserves the drawing saved by the other tab", () => {
  const storage = new MemoryStorage();
  const plan = createEmptyPlan("Original");
  const initial = savePlan(storage, plan, null);
  const otherTab = savePlan(storage, { ...plan, name: "Other tab edit" }, initial);
  storage.setItem(ACTIVE_PLAN_KEY, "keep-current-pointer");
  assert.throws(() => savePlan(storage, { ...plan, name: "Stale edit" }, initial), PlanConflictError);
  assert.equal(storage.getItem(PLAN_PREFIX + plan.id), otherTab);
  assert.equal(storage.getItem(ACTIVE_PLAN_KEY), "keep-current-pointer");
});

test("new CAD documents cannot overwrite a colliding existing identifier", () => {
  const storage = new MemoryStorage();
  const plan = createEmptyPlan("Original");
  const original = savePlan(storage, plan, null);
  assert.throws(() => savePlan(storage, { ...plan, name: "Collision" }, null), PlanConflictError);
  assert.equal(storage.getItem(PLAN_PREFIX + plan.id), original);
});

test("CAD conflicts also preserve a remote deletion or corrupted replacement", () => {
  for (const replacement of [null, "{corrupt"]) {
    const storage = new MemoryStorage();
    const plan = createEmptyPlan();
    const original = savePlan(storage, plan, null);
    if (replacement === null) storage.removeItem(PLAN_PREFIX + plan.id);
    else storage.setItem(PLAN_PREFIX + plan.id, replacement);
    assert.throws(() => savePlan(storage, plan, original), PlanConflictError);
    assert.equal(storage.getItem(PLAN_PREFIX + plan.id), replacement);
  }
});
