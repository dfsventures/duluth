// F16 fix (option b, decided 2026-07-07): update bodies embed inline images
// as <img src="/api/documents/[id]/view">, which requires an authenticated
// session with company access — investors viewing a share link have neither.
// The share API rewrites those URLs to the token-scoped proxy
// /api/share/[token]/doc/[docId], which authorizes by the link token itself.

const DOC_VIEW_URL = /\/api\/documents\/([\w-]+)\/view/g;

/**
 * Rewrite in-app document-view URLs inside an update body's HTML to the
 * share-token-scoped proxy. Pure string transform; leaves all other
 * content untouched. Safe to run on bodies with no document URLs.
 */
export function rewriteDocumentUrls(html: string, token: string): string {
  const encodedToken = encodeURIComponent(token);
  return html.replace(DOC_VIEW_URL, (_match, docId: string) => {
    return `/api/share/${encodedToken}/doc/${docId}`;
  });
}
