"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { CircleQuestionMark, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tourFor, type TourStep } from "@/lib/tour";
import { markTourSeen } from "@/lib/tour-state";

const PANEL_WIDTH = 340;
const GAP = 14; // space between the highlighted element and the panel

interface Placement {
  top: number;
  left: number;
  width: number;
}

/**
 * Rectangle of the step's target, in viewport coordinates. Null means "no
 * target to point at" — either the step is deliberately centred or the element
 * is not on this screen size, and both render the same centred panel.
 */
function targetRect(step: TourStep | undefined): DOMRect | null {
  if (!step?.target) return null;
  const el = document.querySelector(step.target);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  // A collapsed rect means the element is hidden (mobile sidebar, empty list).
  if (rect.width === 0 && rect.height === 0) return null;
  return rect;
}

/**
 * The tutorial overlay: a spotlight on one element at a time plus a panel
 * explaining it.
 *
 * Rendered through a portal on document.body, not in place. The topbar it lives
 * in uses backdrop-filter, and a backdrop filter makes its element a containing
 * block for `position: fixed` descendants — the overlay would be trapped inside
 * a 56px-tall header instead of covering the screen.
 */
export function Tour({
  offerIntro,
  toursSeen,
}: {
  offerIntro: boolean;
  /** Pathnames whose tour is done — read from the database by the layout. */
  toursSeen: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const steps = tourFor(pathname);

  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const step = steps?.[index];

  const finish = useCallback(() => {
    setOpen(false);
    setIndex(0);
    // ⚠️ Fire-and-forget on purpose: closing the panel must not wait on a
    // write. If it fails the tour simply offers itself again — the same
    // behaviour the old localStorage version had when storage was blocked.
    void markTourSeen(pathname).catch(() => {});
  }, [pathname]);

  const start = useCallback(() => {
    setIndex(0);
    setOpen(true);
  }, []);

  // Open unprompted on the dashboard of a system nobody has used yet: staff who
  // have never opened the program will not think to press a «؟» they have not
  // noticed. Deliberately the dashboard only, and only once — a clinic already
  // holding real records is mid-work and must never be interrupted by a
  // tutorial. For them every tour is on the «؟» button, on demand.
  //
  // Resetting on navigation is handled by remounting (the parent keys this
  // component on the pathname), not here: a tour's steps describe one screen,
  // so carrying its state across a route change is never right.
  //
  // 🔴 "Seen" comes from the database via props, not localStorage. In the
  // packaged app the Next server binds a **new random port every launch**
  // (`electron/main.js`, `srv.listen(0, ...)`), and browser storage is scoped
  // per origin *including the port* — so every launch read an empty store and
  // this tour reopened forever. See `lib/tour-state.ts`.
  useEffect(() => {
    if (!steps || !offerIntro || pathname !== "/dashboard") return;
    if (toursSeen.includes(pathname)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true);
  }, [steps, pathname, offerIntro, toursSeen]);

  // Track the spotlight target through scrolling, resizing and step changes.
  useLayoutEffect(() => {
    if (!open || !step) return;

    const measure = () => setRect(targetRect(step));

    if (step.target) {
      const el = document.querySelector(step.target);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    measure();

    // The smooth scroll above finishes after this effect, so re-measure for a
    // moment afterwards; otherwise the spotlight lands where the element was.
    const timers = [80, 200, 420].map((ms) => window.setTimeout(measure, ms));
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      timers.forEach(window.clearTimeout);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step, index]);

  // Place the panel beside the spotlight, clamped inside the viewport.
  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(PANEL_WIDTH, vw - 24);
    const height = panel.offsetHeight;

    if (!rect) {
      setPlacement({
        top: Math.max(12, (vh - height) / 2),
        left: Math.max(12, (vw - width) / 2),
        width,
      });
      return;
    }

    const below = rect.bottom + GAP;
    const above = rect.top - GAP - height;
    const top = below + height <= vh - 12 ? below : above >= 12 ? above : Math.max(12, (vh - height) / 2);

    // Align to the element's start edge, then pull back inside the viewport.
    const preferred = rect.left + rect.width / 2 - width / 2;
    const left = Math.min(Math.max(12, preferred), vw - width - 12);

    setPlacement({ top, left, width });
  }, [open, rect, index]);

  // Focus the primary action so the panel is reachable by keyboard and Enter
  // advances the tour.
  useEffect(() => {
    if (open) nextRef.current?.focus();
  }, [open, index]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    // The page behind must not scroll away from the spotlight.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, finish]);

  function handleHelpClick() {
    if (steps) start();
    else router.push("/help");
  }

  const total = steps?.length ?? 0;
  const isLast = index === total - 1;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11"
        data-tour="help-button"
        aria-label={steps ? "شرح هذه الشاشة" : "الدليل"}
        title={steps ? "شرح هذه الشاشة" : "الدليل"}
        onClick={handleHelpClick}
      >
        <CircleQuestionMark className="size-5" />
      </Button>

      {open && step
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label="جولة تعريفية"
              className="fixed inset-0 z-[100]"
            >
              {rect ? (
                <div
                  aria-hidden
                  // The ring travels between steps rather than cutting, so the
                  // eye follows it to the next element instead of hunting for
                  // where the highlight went.
                  className="ring-primary animate-spotlight pointer-events-none absolute rounded-xl ring-2 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{
                    top: rect.top - 6,
                    left: rect.left - 6,
                    width: rect.width + 12,
                    height: rect.height + 12,
                    boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
                  }}
                />
              ) : (
                <div
                  aria-hidden
                  className="animate-in fade-in-0 absolute inset-0 bg-black/60 duration-200"
                />
              )}

              <div
                ref={panelRef}
                // Pops in once on open, then slides between steps — remounting
                // it per step would replay the pop and cancel the slide.
                className="bg-card text-card-foreground animate-pop absolute rounded-xl border p-4 shadow-2xl transition-[top,left] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{
                  top: placement?.top ?? 24,
                  left: placement?.left ?? 24,
                  width: placement?.width ?? PANEL_WIDTH,
                  // Hidden until measured, so it never flashes in the corner.
                  visibility: placement ? "visible" : "hidden",
                }}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h2 className="text-base font-bold">{step.title}</h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="-me-2 -mt-2 size-11 shrink-0"
                    aria-label="إنهاء الشرح"
                    onClick={finish}
                  >
                    <X className="size-4" />
                  </Button>
                </div>

                <p className="text-muted-foreground text-sm leading-relaxed">{step.body}</p>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-sm tabular-nums">
                    {index + 1} / {total}
                  </span>
                  <div className="flex gap-2">
                    {index > 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-11"
                        onClick={() => setIndex((i) => Math.max(0, i - 1))}
                      >
                        السابق
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-11"
                        onClick={finish}
                      >
                        تخطّي
                      </Button>
                    )}
                    <Button
                      ref={nextRef}
                      type="button"
                      size="sm"
                      className="h-11"
                      onClick={() => (isLast ? finish() : setIndex((i) => i + 1))}
                    >
                      {isLast ? "تم" : "التالي"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
