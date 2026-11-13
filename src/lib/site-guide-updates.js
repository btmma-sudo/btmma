import { getPortalAccount, getPortalEnv } from "./student-portal-auth.js";
import { OWNER_EMAIL } from "./student-portal-owner-setup.js";

const schema = `CREATE TABLE IF NOT EXISTS site_guide_updates (
  id INTEGER PRIMARY KEY, account_id TEXT, match_phrase TEXT NOT NULL,
  answer TEXT NOT NULL, expires_at TEXT NOT NULL
)`;
const keywords = value => (value.toLowerCase().match(/[a-z0-9]+/g) ?? []).map(word => {
  if (/^(available|availability|openings?|spots?|seats?)$/.test(word)) return "availability";
  return word.replace(/^(partie)s$/, "party").replace(/^(classes)$/, "class").replace(/^(balance|payment|date|cancellation|rental|lesson|price)s$/, "$1");
});

export async function guideOwner(request, locals) {
  const env = getPortalEnv(locals);
  const account = await getPortalAccount(request, env);
  return account?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase() ? env.LIVE_TRIAL_DB : null;
}

export async function initializeGuideUpdates(db) {
  await db.prepare(schema).run();
}

export async function findGuideUpdate(question, topic, request, locals) {
  const env = locals?.runtime?.env;
  if (!env?.LIVE_TRIAL_DB) return;
  const account = await getPortalAccount(request, getPortalEnv(locals));
  try {
    const rows = await env.LIVE_TRIAL_DB.prepare(
      `SELECT account_id, match_phrase, answer FROM site_guide_updates
       WHERE expires_at > datetime('now') AND (account_id IS NULL OR account_id = ?)
       ORDER BY account_id IS NOT NULL DESC, length(match_phrase) DESC, id DESC LIMIT 500`,
    ).bind(account?.id ?? null).all();
    const current = new Set(keywords(question));
    const combined = new Set(keywords(topic + " " + question));
    return (rows.results ?? []).find(row => {
      const terms = keywords(row.match_phrase);
      const source = row.account_id ? current : combined;
      return terms.length > 0 && terms.every(term => source.has(term));
    });
  } catch {
    // The owner page initializes this table on first use.
    return undefined;
  }
}
