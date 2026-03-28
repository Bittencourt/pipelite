import { auth } from "@/auth"
import { db } from "@/db"
import { workflows } from "@/db/schema/workflows"
import { desc } from "drizzle-orm"
import { redirect } from "next/navigation"
import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { NewWorkflowButton } from "./new-workflow-button"

export default async function WorkflowsPage() {
  const session = await auth()
  if (!session?.user) {
    redirect("/login")
  }

  const allWorkflows = await db
    .select()
    .from(workflows)
    .orderBy(desc(workflows.updatedAt))

  return (
    <div className="container py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Automate actions based on triggers and conditions
          </p>
        </div>
        <NewWorkflowButton />
      </div>

      {allWorkflows.length === 0 ? (
        <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed">
          <div className="text-center">
            <p className="text-muted-foreground">No workflows yet</p>
            <p className="text-sm text-muted-foreground">
              Create your first workflow to get started
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Triggers</TableHead>
                <TableHead>Nodes</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allWorkflows.map((wf) => {
                const triggerCount = Array.isArray(wf.triggers)
                  ? wf.triggers.length
                  : 0
                const nodeCount = Array.isArray(wf.nodes)
                  ? wf.nodes.length
                  : 0

                return (
                  <TableRow key={wf.id}>
                    <TableCell>
                      <Link
                        href={`/workflows/${wf.id}/edit`}
                        className="font-medium hover:underline"
                      >
                        {wf.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={wf.active ? "default" : "secondary"}>
                        {wf.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>{triggerCount}</TableCell>
                    <TableCell>{nodeCount}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {wf.updatedAt.toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
