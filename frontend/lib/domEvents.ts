type PropagationEvent = {
  stopPropagation: () => void;
  preventDefault?: () => void;
};

export function stopNestedInteractiveEvent(event: PropagationEvent, preventDefault = true) {
  if (preventDefault) {
    event.preventDefault?.();
  }
  event.stopPropagation();
}
