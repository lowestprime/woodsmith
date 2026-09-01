export type CommissionValidatableControl = {
  checkValidity: () => boolean;
  disabled?: boolean;
};

export function firstInvalidCommissionControl<T extends CommissionValidatableControl>(
  controls: Iterable<T>
) {
  for (const control of controls) {
    if (!control.disabled && !control.checkValidity()) return control;
  }
  return null;
}
