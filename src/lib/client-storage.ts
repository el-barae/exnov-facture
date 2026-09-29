/** Les brouillons d’équipe restent en mémoire et sont effacés au changement de compte. */
let mode: "team" | "demo" = "team";
let owner: string | undefined;
const values = new Map<string, string>();
const memory: Storage = {
  get length() { return values.size; },
  clear() { values.clear(); },
  getItem(key) { return values.get(key) ?? null; },
  key(index) { return [...values.keys()][index] ?? null; },
  removeItem(key) { values.delete(key); },
  setItem(key, value) { values.set(String(key), String(value)); },
};
export function configureWorkspaceStorage(next: "team" | "demo", userId?: string) {
  if (next !== mode || owner !== userId) values.clear();
  mode = next; owner = userId;
}
export function workspaceStorage(): Storage { return mode === "demo" ? window.localStorage : memory; }
