import React from "react";

function hrefFor(to, params) {
  if (to === "/board") return "#dept_dash_command";
  if (typeof to === "string" && to.startsWith("/p/")) return "#dept_dash_command";
  if (typeof to === "string" && to.startsWith("/")) {
    return "#" + to.replace(/^\//, "").replace(/\//g, "_");
  }
  if (to === "/p/$key" && params?.key) return "#" + params.key;
  return "#dept_dash_command";
}

export function Link({ to, params, children, className, title }) {
  return (
    <a href={hrefFor(to, params)} className={className} title={title}>
      {children}
    </a>
  );
}

export function useNavigate() {
  return (opts) => {
    const to = typeof opts === "string" ? opts : opts?.to;
    if (to) window.location.hash = hrefFor(to, opts?.params).slice(1);
  };
}
