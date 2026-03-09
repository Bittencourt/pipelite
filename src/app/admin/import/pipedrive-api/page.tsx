import { PipedriveApiWizard } from "./pipedrive-api-wizard"

export default function PipedriveApiImportPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Import from Pipedrive</h1>
      <PipedriveApiWizard />
    </div>
  )
}
