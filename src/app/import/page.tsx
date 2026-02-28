import { ImportWizard } from "./import-wizard"

export default function ImportPage() {
  return (
    <div className="container mx-auto max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Import Data</h1>
        <p className="text-muted-foreground mt-1">
          Import organizations, people, deals, or activities from a CSV or JSON file.
        </p>
      </div>

      <ImportWizard />
    </div>
  )
}
