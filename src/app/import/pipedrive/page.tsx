import { PipedriveWizard } from "./pipedrive-wizard"

export default function PipedriveImportPage() {
  return (
    <div className="container mx-auto max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Import from Pipedrive</h1>
        <p className="text-muted-foreground mt-1">
          Migrate your data from Pipedrive using CSV or JSON exports. Fields are
          automatically mapped to the corresponding internal fields.
        </p>

        <div className="mt-4 rounded-md bg-muted/50 p-4">
          <p className="mb-2 text-sm font-medium">Supported entities:</p>
          <ul className="grid grid-cols-2 gap-1 text-sm text-muted-foreground">
            <li>- Organizations</li>
            <li>- People (Contacts)</li>
            <li>- Deals</li>
            <li>- Activities</li>
          </ul>
        </div>
      </div>

      <PipedriveWizard />
    </div>
  )
}
