export async function onRequest(context) {
    const urlPath = new URL(context.request.url).pathname;
    const method  = context.request.method;
    const token   = context.env.GITHUB_TOKEN;
    const repo    = context.env.GITHUB_REPO;
    const ghHeaders = {
        "Authorization": `token ${token}`,
        "User-Agent": "Cloudflare-Pages-POS-Studio"
    };

    // -- LIST: GET /api/list --
    if (urlPath === "/api/list" && method === "GET") {
        try {
            const res = await fetch(`https://api.github.com/repos/${repo}/contents/shops`, { headers: ghHeaders });
            if (!res.ok) return jsonResp({ shops: [] }, 200);
            const files = await res.json();
            const shops = files
                .filter(f => f.name.endsWith(".html"))
                .map(f => ({ slug: f.name.replace(".html",""), name: f.name }));
            return jsonResp({ shops }, 200);
        } catch(err) {
            return jsonResp({ error: err.message }, 500);
        }
    }

    // -- RECALL: POST /api/recall --
    if (urlPath === "/api/recall" && method === "POST") {
        try {
            const { shopSlug } = await context.request.json();
            if (!shopSlug) return new Response("Missing Shop Slug", { status: 400 });
            const res = await fetch(
                `https://api.github.com/repos/${repo}/contents/data/${shopSlug}-manifest.json`,
                { headers: ghHeaders }
            );
            if (!res.ok) return jsonResp({ error: "Configuration not found" }, 404);
            const fileData = await res.json();
            return jsonResp(fileData, 200);
        } catch(err) {
            return jsonResp({ error: err.message }, 500);
        }
    }

    // -- DATA: GET /api/data?shop=<slug>&kind=bills|paid|menu --
    // Reads straight from GitHub (not the static Pages copy, which lags a rebuild behind).
    if (urlPath === "/api/data" && method === "GET") {
        try {
            const q = new URL(context.request.url).searchParams;
            const slug = q.get("shop") || "", kind = q.get("kind") || "";
            if (!SLUG_RE.test(slug) || !(kind in KINDS)) return jsonResp({ error: "Bad shop or kind" }, 400);
            const cur = await ghReadJson(repo, ghHeaders, `data/${slug}-${KINDS[kind].file}.json`);
            if (!cur) return kind === "menu" ? jsonResp({ error: "Not found" }, 404) : jsonResp([], 200);
            return jsonResp(cur.data, 200);
        } catch(err) {
            return jsonResp({ error: err.message }, 500);
        }
    }

    // -- SYNC: POST /api/sync { shopSlug, kind: "bills"|"paid", items:[...] } --
    // Merges the client's list into the server copy (by id, newest updatedAt wins,
    // deletions kept as tombstones) so two devices never overwrite each other.
    // Writes nothing when the merge changes nothing (no empty commits).
    if (urlPath === "/api/sync" && method === "POST") {
        try {
            const { shopSlug, kind, items } = await context.request.json();
            if (!SLUG_RE.test(shopSlug || "") || !(kind === "bills" || kind === "paid")) return jsonResp({ error: "Bad shop or kind" }, 400);
            if (!Array.isArray(items) || items.length > 2000 || items.some(i => !i || typeof i !== "object")) return jsonResp({ error: "Bad items" }, 400);
            const path = `data/${shopSlug}-${KINDS[kind].file}.json`;
            const url = `https://api.github.com/repos/${repo}/contents/${path}`;
            for (let attempt = 0; attempt < 3; attempt++) {
                const cur = await ghReadJson(repo, ghHeaders, path);
                const before = Array.isArray(cur && cur.data) ? cur.data : [];
                const merged = mergeLists(before, items, KINDS[kind].cap);
                const body = JSON.stringify(merged);
                if (cur && body === JSON.stringify(before)) return jsonResp({ items: merged, written: false }, 200);
                const put = { message: `pos(${kind}): sync ${shopSlug}`, content: toB64(body) };
                if (cur) put.sha = cur.sha;
                const res = await fetch(url, { method: "PUT", headers: { ...ghHeaders, "Content-Type": "application/json" }, body: JSON.stringify(put) });
                if (res.ok) return jsonResp({ items: merged, written: true }, 200);
                if (res.status !== 409 && res.status !== 422) {
                    const e = await res.json().catch(() => ({}));
                    return jsonResp({ error: e.message || "GitHub write failed" }, res.status);
                }
                // 409/422 = someone else committed in between: re-read and merge again
            }
            return jsonResp({ error: "Conflict, retry" }, 409);
        } catch(err) {
            return jsonResp({ error: err.message }, 500);
        }
    }

    // -- DEPLOY: POST /api/deploy --
    // isBase64: true skips re-encoding (for binary files like logos)
    if (urlPath === "/api/deploy" && method === "POST") {
        try {
            const { shopSlug, path, content, message, isBase64 } = await context.request.json();
            if (!shopSlug || !path || !content) return new Response("Missing Required Fields", { status: 400 });

            const url = `https://api.github.com/repos/${repo}/contents/${path}`;

            let sha = "";
            const checkRes = await fetch(url, { headers: ghHeaders });
            if (checkRes.ok) {
                const fileData = await checkRes.json();
                sha = fileData.sha;
            }

            const base64Content = isBase64 ? content : btoa(unescape(encodeURIComponent(content)));

            const body = { message, content: base64Content };
            if (sha) body.sha = sha;

            const putRes = await fetch(url, {
                method: "PUT",
                headers: { ...ghHeaders, "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            if (putRes.ok) {
                return jsonResp({ success: true, repo }, 200);
            } else {
                const errData = await putRes.json();
                return jsonResp({ error: errData.message }, putRes.status);
            }
        } catch(err) {
            return jsonResp({ error: err.message }, 500);
        }
    }

    return jsonResp({ error: "Route not found" }, 404);
}

function jsonResp(data, status) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
}

const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;
const KINDS = { menu: { file: "menu" }, bills: { file: "bills", cap: 30 }, paid: { file: "paid", cap: 500 } };
const TOMBSTONE_MS = 30 * 24 * 60 * 60 * 1000;

function toB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
}

// Returns { data, sha } or null when the file does not exist.
async function ghReadJson(repo, headers, path) {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, { headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub read failed (${res.status})`);
    const f = await res.json();
    const bin = atob((f.content || "").replace(/\s/g, ""));
    const text = new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
    let data = [];
    try { data = JSON.parse(text); } catch (e) { data = []; }
    return { data, sha: f.sha };
}

// Same rules as the POS page: every item needs an id and updatedAt; ids of legacy
// items are derived from their content so every device computes the same one.
function stamp(b) {
    if (!b.id) {
        const s = (b.label || "") + "|" + (b.paidAt || b.savedAt || "") + "|" + (b.total || 0);
        let h = 5381;
        for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        b.id = "L" + (h >>> 0).toString(36);
    }
    b.id = String(b.id).replace(/[^A-Za-z0-9_-]/g, "");
    if (!b.updatedAt) b.updatedAt = b.paidAt || b.savedAt || new Date(0).toISOString();
    return b;
}

function mergeLists(a, b, cap) {
    const map = {};
    [...a, ...b].forEach(x => {
        stamp(x);
        const o = map[x.id];
        if (!o || x.updatedAt > o.updatedAt) map[x.id] = x;
    });
    const key = x => x.paidAt || x.savedAt || x.updatedAt || "";
    const all = Object.values(map).sort((p, q) => key(q).localeCompare(key(p)));
    const cutoff = Date.now() - TOMBSTONE_MS;
    const live = all.filter(x => !x.deleted).slice(0, cap);
    const dead = all.filter(x => x.deleted && new Date(x.updatedAt).getTime() > cutoff);
    return [...live, ...dead].sort((p, q) => key(q).localeCompare(key(p)));
}
