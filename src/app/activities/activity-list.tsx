"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getFilteredRowModel,
} from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Pencil,
  Trash2,
  Phone,
  Users,
  CheckSquare,
  Mail,
  CheckCircle,
  Circle,
  AlertCircle,
} from "lucide-react"
import { deleteActivity, toggleActivityCompletion } from "./actions"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

// Activity type with icon info
interface ActivityType {
  id: string
  name: string
  icon: string | null
  color: string | null
}

// Deal with pipeline info
interface DealInfo {
  id: string
  title: string
  stage?: { name: string; pipelineId: string } | null
  pipeline?: { name: string } | null
}

// Activity for list display
export interface Activity {
  id: string
  title: string
  typeId: string
  dealId: string | null
  dueDate: Date
  completedAt: Date | null
  notes: string | null
  type: ActivityType
  deal: DealInfo | null
}

interface ActivityListProps {
  activities: Activity[]
  activityTypes: ActivityType[]
  onEdit: (activity: Activity) => void
  onRefresh?: () => void
}

// Icon mapping for activity types
const iconMap: Record<string, React.ReactNode> = {
  Phone: <Phone className="h-3 w-3" />,
  Users: <Users className="h-3 w-3" />,
  CheckSquare: <CheckSquare className="h-3 w-3" />,
  Mail: <Mail className="h-3 w-3" />,
}

// Color mapping for activity type badges
const colorMap: Record<string, string> = {
  Call: "bg-blue-100 text-blue-800",
  Meeting: "bg-purple-100 text-purple-800",
  Task: "bg-green-100 text-green-800",
  Email: "bg-amber-100 text-amber-800",
}

// Helper to format date/time
function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

// Helper to check if activity is overdue
function isOverdue(activity: Activity): boolean {
  if (activity.completedAt) return false
  return new Date(activity.dueDate) < new Date()
}

// Helper to check if due today
function isDueToday(date: Date): boolean {
  const today = new Date()
  const dueDate = new Date(date)
  return (
    today.getFullYear() === dueDate.getFullYear() &&
    today.getMonth() === dueDate.getMonth() &&
    today.getDate() === dueDate.getDate()
  )
}

export function ActivityList({
  activities,
  activityTypes,
  onEdit,
  onRefresh,
}: ActivityListProps) {
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [activityToDelete, setActivityToDelete] = useState<Activity | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Separate overdue activities
  const overdueActivities = activities.filter(isOverdue)

  // Filter activities
  const filteredActivities = useMemo(() => {
    let result = activities

    // Type filter
    if (typeFilter !== "all") {
      result = result.filter((a) => a.typeId === typeFilter)
    }

    // Status filter
    if (statusFilter === "pending") {
      result = result.filter((a) => !a.completedAt && !isOverdue(a))
    } else if (statusFilter === "completed") {
      result = result.filter((a) => a.completedAt)
    } else if (statusFilter === "overdue") {
      result = result.filter(isOverdue)
    }

    return result
  }, [activities, typeFilter, statusFilter])

  // Sort: overdue first, then by dueDate ascending
  const sortedActivities = useMemo(() => {
    return [...filteredActivities].sort((a, b) => {
      const aOverdue = isOverdue(a) ? 0 : 1
      const bOverdue = isOverdue(b) ? 0 : 1
      if (aOverdue !== bOverdue) return aOverdue - bOverdue
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    })
  }, [filteredActivities])

  const handleToggleComplete = async (activity: Activity) => {
    setTogglingId(activity.id)
    try {
      const result = await toggleActivityCompletion(activity.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.completed ? "Activity completed!" : "Activity reopened")
      onRefresh?.()
    } catch {
      toast.error("An unexpected error occurred")
    } finally {
      setTogglingId(null)
    }
  }

  const handleDeleteClick = (activity: Activity) => {
    setActivityToDelete(activity)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!activityToDelete) return

    setIsDeleting(true)
    try {
      const result = await deleteActivity(activityToDelete.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Activity deleted")
      setDeleteDialogOpen(false)
      setActivityToDelete(null)
      onRefresh?.()
    } catch {
      toast.error("An unexpected error occurred")
    } finally {
      setIsDeleting(false)
    }
  }

  // Column definitions
  const columns: ColumnDef<Activity, unknown>[] = [
    {
      id: "status",
      header: "",
      size: 40,
      cell: ({ row }) => {
        const activity = row.original
        const isLoading = togglingId === activity.id
        const overdue = isOverdue(activity)

        return (
          <button
            onClick={() => handleToggleComplete(activity)}
            disabled={isLoading}
            className="flex items-center justify-center p-1 hover:opacity-80 transition-opacity"
            title={activity.completedAt ? "Mark as not done" : "Mark as done"}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : activity.completedAt ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : overdue ? (
              <AlertCircle className="h-5 w-5 text-red-500" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground" />
            )}
          </button>
        )
      },
    },
    {
      accessorKey: "type",
      header: "Type",
      size: 120,
      cell: ({ row }) => {
        const type = row.original.type
        const colorClass = colorMap[type.name] || "bg-gray-100 text-gray-800"
        
        return (
          <Badge variant="secondary" className={`${colorClass} gap-1 font-normal`}>
            {type.icon && iconMap[type.icon]}
            {type.name}
          </Badge>
        )
      },
    },
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => {
        const activity = row.original
        const overdue = isOverdue(activity)
        const dueToday = isDueToday(activity.dueDate)

        return (
          <Link
            href={`/activities/${activity.id}`}
            className={`font-medium hover:underline ${
              overdue
                ? "text-red-600"
                : dueToday && !activity.completedAt
                ? "text-amber-600"
                : activity.completedAt
                ? "text-muted-foreground line-through"
                : ""
            }`}
          >
            {activity.title}
          </Link>
        )
      },
    },
    {
      accessorKey: "dueDate",
      header: "Due Date",
      size: 180,
      cell: ({ row }) => {
        const activity = row.original
        const overdue = isOverdue(activity)
        const dueToday = isDueToday(activity.dueDate)

        return (
          <span
            className={`text-sm ${
              overdue
                ? "text-red-600 font-medium"
                : dueToday && !activity.completedAt
                ? "text-amber-600 font-medium"
                : "text-muted-foreground"
            }`}
          >
            {formatDateTime(activity.dueDate)}
          </span>
        )
      },
    },
    {
      accessorKey: "deal",
      header: "Deal",
      size: 150,
      cell: ({ row }) => {
        const deal = row.original.deal
        if (!deal) {
          return <span className="text-muted-foreground">-</span>
        }
        return (
          <Link
            href={`/deals?pipeline=${deal.stage?.pipelineId || ""}`}
            className="text-sm text-primary hover:underline"
            title={deal.pipeline?.name || ""}
          >
            {deal.title}
          </Link>
        )
      },
    },
    {
      id: "actions",
      header: "",
      size: 80,
      cell: ({ row }) => {
        const activity = row.original

        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onEdit(activity)}
            >
              <Pencil className="h-4 w-4" />
              <span className="sr-only">Edit</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => handleDeleteClick(activity)}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Delete</span>
            </Button>
          </div>
        )
      },
    },
  ]

  const table = useReactTable({
    data: sortedActivities,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  return (
    <div className="space-y-4">
      {/* Overdue section */}
      {overdueActivities.length > 0 && statusFilter !== "completed" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <span className="font-semibold text-red-700">
              Overdue Activities ({overdueActivities.length})
            </span>
          </div>
          <div className="space-y-2">
            {overdueActivities.slice(0, 3).map((activity) => (
              <div
                key={activity.id}
                className="flex items-center justify-between bg-white p-3 rounded border"
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleToggleComplete(activity)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Circle className="h-4 w-4" />
                  </button>
                  <div>
                    <span className="font-medium text-red-700">{activity.title}</span>
                    <span className="text-sm text-muted-foreground ml-2">
                      Due: {formatDateTime(activity.dueDate)}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(activity)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {overdueActivities.length > 3 && (
              <p className="text-sm text-muted-foreground pl-2">
                +{overdueActivities.length - 3} more overdue activities
              </p>
            )}
          </div>
        </div>
      )}

      {/* Filter controls */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">Type:</label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {activityTypes.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">Status:</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="completed">Done</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Data table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} style={{ width: header.getSize() }}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No activities found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Activity</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{activityToDelete?.title}"? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
