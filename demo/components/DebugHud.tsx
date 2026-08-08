import { useEffect, useRef } from "react";

/**
 * On-screen event log for chasing viewport jumps on device. Timestamps every
 * signal that can move content: visual-viewport resize/scroll, window
 * scroll, any element scroll (capture phase — includes the scroll area AND
 * the textareas themselves), and focus changes. Newest line first. Purely
 * imperative so logging never causes a React render.
 */
export function DebugHud() {
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const t0 = performance.now();
    const log = (msg: string) => {
      const t = ((performance.now() - t0) / 1000).toFixed(2);
      el.textContent = [`${t} ${msg}`, ...(el.textContent ?? "").split("\n")]
        .slice(0, 12)
        .join("\n");
    };

    const vv = window.visualViewport;
    const onVvResize = () =>
      log(`vv-resize h=${vv!.height.toFixed(0)} top=${vv!.offsetTop.toFixed(0)}`);
    const onVvScroll = () =>
      log(`vv-scroll top=${vv!.offsetTop.toFixed(0)} left=${vv!.offsetLeft.toFixed(0)}`);
    const onWinScroll = () => log(`win-scroll y=${window.scrollY}`);
    const onAnyScroll = (e: Event) => {
      const t = e.target;
      if (t === document) return; // covered by win-scroll
      const node = t as HTMLElement;
      const name =
        node.className && typeof node.className === "string"
          ? `${node.tagName}.${node.className.split(" ")[0]}`
          : node.tagName;
      log(`scroll ${name} top=${node.scrollTop}`);
    };
    const onFocusIn = (e: Event) => {
      const t = e.target as HTMLElement;
      const label =
        t instanceof HTMLTextAreaElement
          ? `"${t.value.slice(0, 12)}"`
          : t.tagName;
      log(`focusin ${label}`);
    };
    const onFocusOut = () => log("focusout");

    vv?.addEventListener("resize", onVvResize);
    vv?.addEventListener("scroll", onVvScroll);
    window.addEventListener("scroll", onWinScroll);
    document.addEventListener("scroll", onAnyScroll, true);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    log(
      `init inner=${window.innerHeight} vv=${vv ? vv.height.toFixed(0) : "n/a"}`,
    );

    return () => {
      vv?.removeEventListener("resize", onVvResize);
      vv?.removeEventListener("scroll", onVvScroll);
      window.removeEventListener("scroll", onWinScroll);
      document.removeEventListener("scroll", onAnyScroll, true);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  return <pre className="debug-hud" ref={ref} />;
}
