import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { APPS, type AppKey } from "@shared/apps"

/** Toggles one App in a set of App keys, keeping the registry's order. */
function toggleApp(apps: readonly AppKey[], app: AppKey, on: boolean): AppKey[] {
  return APPS.map((entry) => entry.key).filter((key) => (key === app ? on : apps.includes(key)))
}

/** One checkbox per App the Shell hosts. */
export function AppCheckboxes({
  value,
  onChange,
}: {
  value: readonly AppKey[]
  onChange: (apps: AppKey[]) => void
}) {
  return (
    <FieldSet>
      <FieldLegend variant="label">Apps</FieldLegend>
      <FieldGroup data-slot="checkbox-group">
        {APPS.map((app) => (
          <Field key={app.key} orientation="horizontal">
            <Checkbox
              id={`app-${app.key}`}
              checked={value.includes(app.key)}
              onCheckedChange={(checked) => onChange(toggleApp(value, app.key, checked))}
            />
            <FieldLabel htmlFor={`app-${app.key}`} className="font-normal">
              {app.title}
            </FieldLabel>
          </Field>
        ))}
      </FieldGroup>
    </FieldSet>
  )
}
