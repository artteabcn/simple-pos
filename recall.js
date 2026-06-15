export async function onRequestPost(context) {
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
        return new Response(JSON.stringify({ error: err.message }), { 
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}