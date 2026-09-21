import { useEffect } from "react";

/**
 * Blocks right click, text copy/selection and common devtools shortcuts.
 * Inputs / textareas stay usable (typing + selecting inside them).
 */
function isEditable(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el || !el.closest) return false;
  return !!el.closest('input, textarea, select, [contenteditable="true"]');
}

export function ContentProtection() {
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onCopyLike = (e: Event) => {
      if (isEditable(e.target)) return;
      e.preventDefault();
    };

    const onDragStart = (e: DragEvent) => e.preventDefault();

    const onSelectStart = (e: Event) => {
      if (isEditable(e.target)) return;
      e.preventDefault();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key?.toLowerCase();
      const editable = isEditable(e.target);

      // DevTools / view-source shortcuts
      if (key === "f12") {
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c", "k", "e"].includes(key)) {
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && ["u", "s", "p"].includes(key)) {
        e.preventDefault();
        return;
      }
      // Copy / cut / select-all / paste outside of form fields
      if ((e.ctrlKey || e.metaKey) && ["c", "x", "a"].includes(key) && !editable) {
        e.preventDefault();
      }
    };

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopyLike);
    document.addEventListener("cut", onCopyLike);
    document.addEventListener("dragstart", onDragStart);
    document.addEventListener("selectstart", onSelectStart);
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("copy", onCopyLike);
      document.removeEventListener("cut", onCopyLike);
      document.removeEventListener("dragstart", onDragStart);
      document.removeEventListener("selectstart", onSelectStart);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  return null;
}

export default ContentProtection;
