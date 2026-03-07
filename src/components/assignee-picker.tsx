"use client"

import { useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"

interface AssigneePickerProps {
  users: { id: string; name: string | null; email: string }[]
  value: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
  placeholder?: string
}

export function AssigneePicker({
  users,
  value,
  onChange,
  disabled,
  placeholder = "Select assignees",
}: AssigneePickerProps) {
  const [open, setOpen] = useState(false)

  function toggle(userId: string) {
    if (value.includes(userId)) {
      onChange(value.filter((id) => id !== userId))
    } else {
      onChange([...value, userId])
    }
  }

  const triggerLabel =
    value.length > 0
      ? `${value.length} assignee${value.length !== 1 ? "s" : ""} selected`
      : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between"
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder="Search users..." />
          <CommandList>
            <CommandEmpty>No users found.</CommandEmpty>
            {users.map((user) => {
              const selected = value.includes(user.id)
              return (
                <CommandItem
                  key={user.id}
                  value={user.name ?? user.email}
                  onSelect={() => toggle(user.id)}
                >
                  <Check
                    className={cn(
                      "mr-2 size-4",
                      selected ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {user.name ?? user.email}
                </CommandItem>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
