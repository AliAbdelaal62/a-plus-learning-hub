import { createFileRoute, redirect } from "@tanstack/react-router";

// The experimental preview runs the ORIGINAL A+ Hub application (aplus-preview/original) from /aplus/index.html.
// The original pages navigate to "/" after sign-in, so "/" forwards there.
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "A+ Hub Academy — Experimental preview (synthetic data)" },
      { name: "description", content: "Experimental in-browser preview of the original A+ Hub Academy system, using synthetic test data only." },
      { property: "og:title", content: "A+ Hub Academy — Experimental preview" },
      { property: "og:description", content: "Experimental in-browser preview of the original A+ Hub Academy system, using synthetic test data only." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ href: "/aplus/index.html", reloadDocument: true });
  },
});
