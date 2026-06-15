export async function onRequestPost(context) {
    try {
        const { shopSlug, path, content, message } = await context.request.json();
        if (!shopSlug || !path || !content) {
            return new Response("Missing Required Fields", { status: 400 });
        }

        const token = context.env.GITHUB_TOKEN;
        const repo = context.env.GITHUB_REPO;
        const url = `https://api.github.com/repos/${repo}/contents/${path}`;

        // Check if the file already exists to obtain its SHA hash
        let sha = "";
        const checkRes = await fetch(url, {
            headers: { "Authorization": `token ${token}`, "User-Agent": "Cloudflare-Pages-POS-Studio" }
        });
        if (checkRes.ok) {
            const fileData = await checkRes.json();
            sha = fileData.sha;
        }

        // Convert payload into standard base64 string safely
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
            return new Response(JSON.stringify({ error: errLog.message }), { 
                status: putRes.status,
                headers: { "Content-Type": "application/json" }
            });
        }

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { 
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}