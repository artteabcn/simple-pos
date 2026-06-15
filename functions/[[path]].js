export async function onRequestPost(context) {
    const urlPath = new URL(context.request.url).pathname;

    // --- ROUTE 1: RECALL ENDPOINT ---
    if (urlPath === "/api/recall") {
        try {
            const { shopSlug } = await context.request.json();
            if (!shopSlug) return new Response("Missing Shop Slug", { status: 400 });

            const token = context.env.GITHUB_TOKEN;
            const repo = context.env.GITHUB_REPO;
            const url = `https://api.github.com/repos/${repo}/contents/data/${shopSlug}-manifest.json`;

            const res = await fetch(url, {
                headers: {
                    "Authorization": `token ${token}`,
                    "User-Agent": "Cloudflare-Pages-POS-Studio"
                }
            });

            if (!res.ok) {
                return new Response(JSON.stringify({ error: "Configuration not found" }), { 
                    status: 404, 
                    headers: { "Content-Type": "application/json" } 
                });
            }

            const fileData = await res.json();
            return new Response(JSON.stringify(fileData), {
                headers: { "Content-Type": "application/json" }
            });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
    }

    // --- ROUTE 2: DEPLOY ENDPOINT ---
    if (urlPath === "/api/deploy") {
        try {
            const { shopSlug, path, content, message } = await context.request.json();
            if (!shopSlug || !path || !content) {
                return new Response("Missing Required Fields", { status: 400 });
            }

            const token = context.env.GITHUB_TOKEN;
            const repo = context.env.GITHUB_REPO;
            const url = `https://api.github.com/repos/${repo}/contents/${path}`;

            let sha = "";
            const checkRes = await fetch(url, {
                headers: { "Authorization": `token ${token}`, "User-Agent": "Cloudflare-Pages-POS-Studio" }
            });
            if (checkRes.ok) {
                const fileData = await checkRes.json();
                sha = fileData.sha;
            }

            const base64Content = btoa(unescape(encodeURIComponent(content)));
            const body = { message, content: base64Content };
            if (sha) body.sha = sha;

            const putRes = await fetch(url, {
                method: "PUT",
                headers: {
                    "Authorization": `token ${token}`,
                    "Content-Type": "application/json",
                    "User-Agent": "Cloudflare-Pages-POS-Studio"
                },
                body: JSON.stringify(body)
            });

            if (putRes.ok) {
                return new Response(JSON.stringify({ success: true, repo }), {
                    headers: { "Content-Type": "application/json" }
                });
            } else {
                const errLog = await putRes.json();
                return new Response(JSON.stringify({ error: errLog.message }), { status: putRes.status, headers: { "Content-Type": "application/json" } });
            }
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
    }

    // Fallback error response for unsupported API routes
    return new Response(JSON.stringify({ error: "Route not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
}