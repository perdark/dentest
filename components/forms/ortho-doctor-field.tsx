import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/forms/native-select";

export type DoctorOption = { id: number; name: string };

/**
 * «الطبيب» on an ortho payment. Ortho is worked by the owner and the ortho
 * doctor together: a visit she took part in is hers at her %, a visit the
 * owner did alone (every old down payment, some sessions) is his. So each
 * payment names its doctor, defaulting to the case's. [قرار العيادة 2026-11-04]
 *
 * Uncontrolled, so a form `reset()` after saving brings back the default.
 * With one ortho doctor there is nothing to choose and nothing is rendered —
 * the server then credits the case's doctor.
 */
export function OrthoDoctorField({
  id,
  doctors,
  defaultDoctorId,
}: {
  id: string;
  doctors: DoctorOption[];
  defaultDoctorId: number;
}) {
  if (doctors.length < 2) return null;
  return (
    <Field>
      <FieldLabel htmlFor={id}>الطبيب</FieldLabel>
      <NativeSelect id={id} name="doctorId" defaultValue={String(defaultDoctorId)}>
        {doctors.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}
