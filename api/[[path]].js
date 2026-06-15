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
        headers: { "Content-Type": "application/json" }
    });
}
