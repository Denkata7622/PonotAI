type PropagationEvent = {
  stopPropagation: () => void;
  preventDefault?: () => void;
};

export function stopSearchDropdownNestedEvent(event: PropagationEvent, preventDefault = true) {
  if (preventDefault) {
    event.preventDefault?.();
  }
  event.stopPropagation();
}
