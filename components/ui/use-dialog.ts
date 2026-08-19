"use client";

import { useEffect, useRef, useState } from "react";
import type { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

/**
 * Dialog open-state whose close actually removes the popup.
 *
 * Setting `open` to false is not enough here. Base UI runs a closing popup
 * through an "ending" phase before unmounting it, and in this app that phase
 * never finishes: the popup keeps `data-ending-style`, stays on screen at full
 * opacity, and remains interactive — while React's own state already says
 * `open === false`.
 *
 * What the clinic would have seen: save an appointment, watch the form clear,
 * and find the dialog still sitting there as though nothing had happened.
 * Pressing «حفظ» again books the patient twice. Every save dialog in the app
 * shares this pattern, so every one of them could double-write — in a system
 * whose whole job is to be the clinic's money record.
 *
 * `actionsRef.unmount()` is Base UI's documented escape hatch for a close the
 * component does not drive itself. It is called for EVERY close — save, إلغاء,
 * the X, Escape, the backdrop — because the stall is not specific to the
 * server-action path. It has to run after the `open={false}` render commits:
 * called in the same tick as `setOpen`, the popup is still officially open and
 * there is nothing yet to unmount.
 *
 * Cost: no exit animation (the opening one is untouched). Worth it.
 */
export function useDialog(): {
  open: boolean;
  setOpen: (open: boolean) => void;
  actionsRef: React.RefObject<DialogPrimitive.Root.Actions | null>;
} {
  const [open, setOpen] = useState(false);
  const actionsRef = useRef<DialogPrimitive.Root.Actions | null>(null);

  useEffect(() => {
    if (open) return;
    actionsRef.current?.unmount();
  }, [open]);

  return { open, setOpen, actionsRef };
}
