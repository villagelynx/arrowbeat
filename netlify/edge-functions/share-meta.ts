/**
 * Inject per-share Open Graph / Twitter meta for `?view=share&…` URLs so
 * iMessage / Slack / social crawlers get a portrait `og:image` from `/api/og`.
 *
 * Without this, the SPA’s static index.html meta would always show the default card.
 */

type EdgeContext = {
  next: () => Promise<Response>;
};

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function replaceMeta(
  html: string,
  attr: "property" | "name",
  key: string,
  content: string,
): string {
  const re = new RegExp(
    `<meta\\s+${attr}="${key}"\\s+content="[^"]*"\\s*/?>`,
    "i",
  );
  const tag = `<meta ${attr}="${key}" content="${escapeAttr(content)}" />`;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace("</head>", `    ${tag}\n  </head>`);
}

export default async (request: Request, context: EdgeContext) => {
  const url = new URL(request.url);
  if (url.searchParams.get("view") !== "share") {
    return context.next();
  }

  const bias = url.searchParams.get("bias") === "down" ? "down" : "up";
  const p = url.searchParams.get("p") ?? "50";
  const c = url.searchParams.get("c") ?? "3";
  const label = (url.searchParams.get("label") ?? "Today").slice(0, 48);
  const asof = (url.searchParams.get("asof") ?? "").trim().slice(0, 64);

  const response = await context.next();
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  const ogImage = new URL("/api/og", url.origin);
  ogImage.searchParams.set("bias", bias);
  ogImage.searchParams.set("p", p);
  ogImage.searchParams.set("c", c);
  ogImage.searchParams.set("label", label);
  if (asof) ogImage.searchParams.set("asof", asof);

  const lean = bias === "up" ? "Higher-close lean" : "Lower-close lean";
  const title = `ArrowBeat Score · ${label}`;
  const description = `${lean} · ${p}% · ${c}/5 confidence`;
  const pageUrl = url.toString();

  let html = await response.text();
  html = replaceMeta(html, "property", "og:title", title);
  html = replaceMeta(html, "property", "og:description", description);
  html = replaceMeta(html, "property", "og:url", pageUrl);
  html = replaceMeta(html, "property", "og:image", ogImage.toString());
  html = replaceMeta(html, "property", "og:image:width", "1280");
  html = replaceMeta(html, "property", "og:image:height", "1920");
  html = replaceMeta(html, "property", "og:image:type", "image/svg+xml");
  html = replaceMeta(html, "property", "og:type", "website");
  html = replaceMeta(html, "name", "twitter:card", "summary_large_image");
  html = replaceMeta(html, "name", "twitter:title", title);
  html = replaceMeta(html, "name", "twitter:description", description);
  html = replaceMeta(html, "name", "twitter:image", ogImage.toString());
  html = replaceMeta(html, "name", "description", description);

  const titleRe = /<title>[^<]*<\/title>/i;
  const titleTag = `<title>${escapeAttr(title)}</title>`;
  html = titleRe.test(html) ? html.replace(titleRe, titleTag) : html;

  return new Response(html, {
    status: response.status,
    headers: response.headers,
  });
};
